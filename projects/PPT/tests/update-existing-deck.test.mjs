import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import JSZip from "jszip";
import { applyExistingDeckUpdate, inspectEditableDeck } from "../adapters/native-pptx/update-existing-deck.mjs";

const slide = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:cSld><p:spTree>
<p:sp><p:nvSpPr><p:cNvPr id="2" name="经营结论"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="zh-CN"/><a:t>原始结论</a:t></a:r></a:p></p:txBody></p:sp>
<p:sp><p:nvSpPr><p:cNvPr id="3" name="保持不变"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>不可修改</a:t></a:r></a:p></p:txBody></p:sp>
<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="4" name="经营趋势"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart r:id="rId1"/></a:graphicData></a:graphic></p:graphicFrame>
</p:spTree></p:cSld></p:sld>`;
const rels = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart1.xml"/></Relationships>`;
const literalChart = `<?xml version="1.0"?><c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart><c:plotArea><c:barChart><c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>旧系列</c:v></c:tx><c:cat><c:strLit><c:ptCount val="2"/><c:pt idx="0"><c:v>一月</c:v></c:pt><c:pt idx="1"><c:v>二月</c:v></c:pt></c:strLit></c:cat><c:val><c:numLit><c:formatCode>General</c:formatCode><c:ptCount val="2"/><c:pt idx="0"><c:v>10</c:v></c:pt><c:pt idx="1"><c:v>20</c:v></c:pt></c:numLit></c:val></c:ser></c:barChart></c:plotArea></c:chart></c:chartSpace>`;
const referencedChart = `<?xml version="1.0"?><c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart><c:plotArea><c:barChart><c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:strRef><c:f>Sheet1!$B$1</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>旧系列</c:v></c:pt></c:strCache></c:strRef></c:tx><c:cat><c:strRef><c:f>Sheet1!$A$2:$A$3</c:f><c:strCache><c:ptCount val="2"/><c:pt idx="0"><c:v>一月</c:v></c:pt><c:pt idx="1"><c:v>二月</c:v></c:pt></c:strCache></c:strRef></c:cat><c:val><c:numRef><c:f>Sheet1!$B$2:$B$3</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="2"/><c:pt idx="0"><c:v>10</c:v></c:pt><c:pt idx="1"><c:v>20</c:v></c:pt></c:numCache></c:numRef></c:val></c:ser></c:barChart></c:plotArea></c:chart></c:chartSpace>`;

async function fixture(directory, duplicate = false, embedded = false) {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", "<Types/>");
  zip.file("ppt/slides/slide1.xml", duplicate ? slide.replace("保持不变", "经营结论") : slide);
  zip.file("ppt/slides/_rels/slide1.xml.rels", rels);
  zip.file("ppt/charts/chart1.xml", embedded ? referencedChart : literalChart);
  if (embedded) {
    const workbook = new JSZip();
    workbook.file("xl/workbook.xml", `<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`);
    workbook.file("xl/_rels/workbook.xml.rels", `<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`);
    workbook.file("xl/worksheets/sheet1.xml", `<worksheet><sheetData><row r="1"><c r="B1" t="inlineStr"><is><t>旧系列</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>一月</t></is></c><c r="B2"><v>10</v></c></row><row r="3"><c r="A3" t="inlineStr"><is><t>二月</t></is></c><c r="B3"><v>20</v></c></row></sheetData></worksheet>`);
    zip.file("ppt/charts/_rels/chart1.xml.rels", `<Relationships><Relationship Id="rIdWorkbook" Target="../embeddings/data.xlsx"/></Relationships>`);
    zip.file("ppt/embeddings/data.xlsx", await workbook.generateAsync({ type: "nodebuffer" }));
  }
  zip.file("ppt/theme/theme1.xml", "<theme>stable</theme>");
  const file = path.join(directory, duplicate ? "duplicate.pptx" : "source.pptx");
  await fs.writeFile(file, await zip.generateAsync({ type: "nodebuffer" }));
  return file;
}

function plan(overrides = {}) {
  return {
    updateId: "version-2", sourceVersionId: "version-1",
    lockedDimensions: ["layout", "typography", "color", "chart"],
    targets: [
      { targetId: "conclusion", slideIndex: 1, kind: "text", objectName: "经营结论", value: "更新后的经营结论" },
      { targetId: "trend", slideIndex: 1, kind: "chart", stableId: "slide-001/object-4", chart: { categories: ["三月", "四月"], series: [{ name: "新系列", values: [31, 48] }] } }
    ],
    ...overrides
  };
}

test("catalog exposes stable native text and chart identities", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ppt-update-catalog-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const source = await fixture(dir);
  const catalog = await inspectEditableDeck(source);
  assert.equal(catalog.source.slides, 1);
  assert.deepEqual(catalog.objects.map((item) => [item.stableId, item.objectName, item.kind]), [
    ["slide-001/object-2", "经营结论", "text"],
    ["slide-001/object-3", "保持不变", "text"],
    ["slide-001/object-4", "经营趋势", "chart"]
  ]);
});

test("updates only explicit text/chart targets and writes an immutable version", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ppt-update-apply-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const source = await fixture(dir);
  const output = path.join(dir, "version-2.pptx");
  const manifest = await applyExistingDeckUpdate({ sourcePath: source, outputPath: output, plan: plan() });
  assert.equal(manifest.status, "applied");
  assert.equal(manifest.changes.length, 2);
  assert.equal(manifest.preservation.untouchedObjectsStable, true);
  assert.deepEqual(manifest.lockedDimensions, ["chart", "color", "layout", "typography"]);
  assert.notEqual(manifest.source.sha256, manifest.output.sha256);
  const sourceZip = await JSZip.loadAsync(await fs.readFile(source));
  const outputZip = await JSZip.loadAsync(await fs.readFile(output));
  assert.match(await outputZip.file("ppt/slides/slide1.xml").async("string"), /更新后的经营结论/);
  assert.match(await outputZip.file("ppt/slides/slide1.xml").async("string"), /不可修改/);
  assert.match(await outputZip.file("ppt/charts/chart1.xml").async("string"), /新系列/);
  assert.match(await outputZip.file("ppt/charts/chart1.xml").async("string"), /<c:v>48<\/c:v>/);
  assert.equal(await sourceZip.file("ppt/theme/theme1.xml").async("string"), await outputZip.file("ppt/theme/theme1.xml").async("string"));
  await assert.rejects(() => applyExistingDeckUpdate({ sourcePath: source, outputPath: output, plan: plan() }), /already exists/);
});

test("synchronizes referenced chart cache and embedded workbook cells", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ppt-update-workbook-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const source = await fixture(dir, false, true);
  const output = path.join(dir, "workbook-v2.pptx");
  const manifest = await applyExistingDeckUpdate({ sourcePath: source, outputPath: output, plan: plan({ targets: [plan().targets[1]] }) });
  assert.equal(manifest.changes.length, 1);
  const zip = await JSZip.loadAsync(await fs.readFile(output));
  const workbook = await JSZip.loadAsync(await zip.file("ppt/embeddings/data.xlsx").async("nodebuffer"));
  const sheet = await workbook.file("xl/worksheets/sheet1.xml").async("string");
  assert.match(sheet, /<t>新系列<\/t>/);
  assert.match(sheet, /<t>三月<\/t>/);
  assert.match(sheet, /<c r="B3"><v>48<\/v><\/c>/);
  assert.ok(manifest.preservation.changedParts.includes("ppt/embeddings/data.xlsx"));
});

test("rejects ambiguous exact-name and missing stable-id targets without output", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ppt-update-reject-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const source = await fixture(dir, true);
  const ambiguousOutput = path.join(dir, "ambiguous-out.pptx");
  await assert.rejects(() => applyExistingDeckUpdate({ sourcePath: source, outputPath: ambiguousOutput, plan: plan({ targets: [{ targetId: "ambiguous", slideIndex: 1, kind: "text", objectName: "经营结论", value: "不应写入" }] }) }), /Ambiguous/);
  await assert.rejects(() => fs.access(ambiguousOutput));
  const missingOutput = path.join(dir, "missing-out.pptx");
  await assert.rejects(() => applyExistingDeckUpdate({ sourcePath: source, outputPath: missingOutput, plan: plan({ targets: [{ targetId: "missing", slideIndex: 1, kind: "text", stableId: "slide-001/object-999", value: "不应写入" }] }) }), /Missing/);
  await assert.rejects(() => fs.access(missingOutput));
});

test("rejects invented or structurally incompatible chart data", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ppt-update-chart-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const source = await fixture(dir);
  await assert.rejects(() => applyExistingDeckUpdate({ sourcePath: source, outputPath: path.join(dir, "bad-values.pptx"), plan: plan({ targets: [{ targetId: "bad", slideIndex: 1, kind: "chart", objectName: "经营趋势", chart: { categories: ["一月"], series: [{ name: "系列", values: [Number.NaN] }] } }] }) }), /non-finite/);
  await assert.rejects(() => applyExistingDeckUpdate({ sourcePath: source, outputPath: path.join(dir, "bad-series.pptx"), plan: plan({ targets: [{ targetId: "bad", slideIndex: 1, kind: "chart", objectName: "经营趋势", chart: { categories: ["一月", "二月"], series: [{ name: "A", values: [1, 2] }, { name: "B", values: [3, 4] }] } }] }) }), /series count mismatch/);
});

test("API and schemas persist the normalized plan, catalog and immutable manifest", async () => {
  const route = await fs.readFile(new URL("../app/api/deck/update/route.ts", import.meta.url), "utf8");
  const planSchema = JSON.parse(await fs.readFile(new URL("../schemas/deck-update-plan.schema.json", import.meta.url), "utf8"));
  const manifestSchema = JSON.parse(await fs.readFile(new URL("../schemas/deck-update-manifest.schema.json", import.meta.url), "utf8"));
  assert.match(route, /normalizeDeckUpdatePlan/);
  assert.match(route, /editable-deck-catalog-/);
  assert.match(route, /deck-update-manifest-/);
  assert.match(route, /output.*versions/s);
  assert.equal(planSchema.properties.schema.const, "ppt-factory/deck-update-plan/v1");
  assert.equal(manifestSchema.properties.schema.const, "ppt-factory/deck-update-manifest/v1");
});
