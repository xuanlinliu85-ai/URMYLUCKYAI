import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("root application identifies the Daily Review workspace", async () => {
  const [layout, page] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /urmylucky每日复盘/);
  assert.match(page, /DAILY MARKET REVIEW/);
  assert.match(page, /每日复盘/);
  assert.match(page, /market-snapshot\.json/);
});

test("root application keeps market, kline and refresh boundaries", async () => {
  const files = [
    "../app/api/market/route.ts",
    "../app/api/kline/route.ts",
    "../app/api/refresh/route.ts",
  ];
  for (const file of files) {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    assert.match(source, /export async function (GET|POST)/);
  }
  const kline = await readFile(new URL("../app/api/kline/route.ts", import.meta.url), "utf8");
  assert.match(kline, /iFinD K-line fallback/);
  assert.match(kline, /腾讯故障回退/);
});

test("macro monitor consumes the generated workbench instead of duplicating it", async () => {
  const page = await readFile(new URL("../app/monitor/macro/page.tsx", import.meta.url), "utf8");
  assert.match(page, /src="\/macro-workbench\.html"/);
  assert.match(page, /macro-snapshot\.json/);
  assert.match(page, /<iframe/);
});
