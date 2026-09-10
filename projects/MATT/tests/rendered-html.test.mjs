import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the MATT decision system", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>MATT · A股研究操作系统<\/title>/i);
  assert.match(html, /从事实到仓位/);
  assert.match(html, /每日八步协议/);
  assert.match(html, /资料快照 · 非实时行情/);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|react-loading-skeleton/i);
});

test("ships the validated data snapshots and excludes starter assets", async () => {
  const [mapText, libraryText, packageText] = await Promise.all([
    readFile(new URL("../public/data/macro-map.json", import.meta.url), "utf8"),
    readFile(new URL("../public/data/library-index.json", import.meta.url), "utf8"),
    readFile(new URL("package.json", templateRoot), "utf8"),
  ]);
  const map = JSON.parse(mapText);
  const library = JSON.parse(libraryText);

  assert.equal(map.date, "2026-04-24");
  assert.equal(map.macros.length, 16);
  assert.equal(map.quality.uniqueExplicitRelations, 1976);
  assert.equal(map.quality.nonEmptySourceCodes, 988);
  assert.equal(map.quality.omittedBySourceTruncation, 552);
  assert.ok(map.macros.some((item) => item.name === "全球AI资本开支扩张"));
  assert.equal(library.totalFiles, 8707);
  assert.equal(library.totalDirectories, 489);
  assert.equal(library.items.length, 8707);
  assert.ok(library.items.filter((item) => item.secretPresent).length >= 18);
  assert.doesNotMatch(packageText, /react-loading-skeleton/);
});
