import assert from "node:assert/strict";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the client-first fund allocator", async () => {
  const response = await render("/");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Fund Allocation OS/);
  assert.match(html, /我的基金配置/);
  assert.match(html, /计划配置金额/);
  assert.match(html, /保存并继续/);
  assert.match(html, /27,625/);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|react-loading-skeleton/);
});

test("server-renders representative client and advisor routes", async () => {
  const [clientResponse, advisorResponse] = await Promise.all([
    render("/fund-radar"),
    render("/fund-screener"),
  ]);
  assert.equal(clientResponse.status, 200);
  assert.equal(advisorResponse.status, 200);
  assert.match(await clientResponse.text(), /先找同类优秀/);
  assert.match(await advisorResponse.text(), /逐层缩小到可研究候选/);
});
