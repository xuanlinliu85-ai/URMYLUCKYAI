import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { createLongImageExport } from "../adapters/native-pptx/long-image.mjs";

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ppt-factory-long-image-"));
  const sourceDir = path.join(root, "render");
  const outputDir = path.join(root, "output");
  await fs.mkdir(sourceDir, { recursive: true });
  for (const [slide, color] of [[1, "#C94B45"], [2, "#2E6E74"], [3, "#D6A23A"]]) {
    const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="${color}"/><text x="100" y="180" font-size="72" fill="#fff">第 ${slide} 页</text></svg>`);
    await sharp(svg).png().toFile(path.join(sourceDir, `slide-${String(slide).padStart(3, "0")}.png`));
  }
  return { root, sourceDir, outputDir };
}

test("exports ordered 9:16 and 2160w variants without cropping", async (t) => {
  const dirs = await fixture();
  t.after(() => fs.rm(dirs.root, { recursive: true, force: true }));
  const result = await createLongImageExport({ ...dirs, slides: [3, 1, 2], background: "#F7F7F7" });
  assert.deepEqual(result.slideOrder, [3, 1, 2]);
  assert.equal(result.variants.vertical9x16.width, 1080);
  assert.equal(result.variants.vertical9x16.height, 1920);
  assert.equal(result.variants.highResolution2160w.width, 2160);
  assert.ok(result.variants.highResolution2160w.height > 2160);
  assert.ok(result.variants.vertical9x16.placements.every((item) => item.cropped === false));
  assert.deepEqual(result.variants.vertical9x16.placements.map((item) => item.slide), [3, 1, 2]);
  const verticalMetadata = await sharp(result.variants.vertical9x16.path).metadata();
  assert.deepEqual([verticalMetadata.width, verticalMetadata.height], [1080, 1920]);
  const manifest = JSON.parse(await fs.readFile(result.manifestPath, "utf8"));
  assert.deepEqual(manifest.slideOrder, [3, 1, 2]);
});

test("rejects duplicate, missing and invalid slide selections", async (t) => {
  const dirs = await fixture();
  t.after(() => fs.rm(dirs.root, { recursive: true, force: true }));
  await assert.rejects(() => createLongImageExport({ ...dirs, slides: [1, 1] }), /duplicates/);
  await assert.rejects(() => createLongImageExport({ ...dirs, slides: [0] }), /positive integer/);
  await assert.rejects(() => createLongImageExport({ ...dirs, slides: [4] }), /slide-004/);
});

test("API and schema expose bounded manifest-backed export", async () => {
  const route = await fs.readFile(path.join(process.cwd(), "app/api/export/long-image/route.ts"), "utf8");
  const schema = JSON.parse(await fs.readFile(path.join(process.cwd(), "schemas/long-image-manifest.schema.json"), "utf8"));
  assert.match(route, /createLongImageExport/);
  assert.match(route, /renderSet/);
  assert.equal(schema.properties.slideOrder.maxItems, 8);
  assert.equal(schema.properties.variants.required.length, 2);
});
