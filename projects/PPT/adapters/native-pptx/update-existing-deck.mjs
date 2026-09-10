import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";

const STYLE_DIMENSIONS = new Set(["typography", "color", "layout", "chart", "density", "composition", "storytelling", "visualTone"]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function decodeXml(value) {
  return String(value).replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function encodeXml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function requireString(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
}

export function normalizeDeckUpdatePlan(plan) {
  if (!plan || typeof plan !== "object") throw new Error("Update plan is required");
  const updateId = requireString(plan.updateId, "updateId");
  const sourceVersionId = requireString(plan.sourceVersionId, "sourceVersionId");
  if (!Array.isArray(plan.targets) || !plan.targets.length) throw new Error("Update plan must contain at least one target");
  const lockedDimensions = [...new Set(plan.lockedDimensions ?? [])].sort();
  for (const dimension of lockedDimensions) if (!STYLE_DIMENSIONS.has(dimension)) throw new Error(`Unknown locked dimension: ${dimension}`);
  const ids = new Set();
  const identities = new Set();
  const targets = plan.targets.map((target, index) => {
    const targetId = requireString(target.targetId, `targets[${index}].targetId`);
    if (ids.has(targetId)) throw new Error(`Duplicate update target id: ${targetId}`);
    ids.add(targetId);
    if (!Number.isInteger(target.slideIndex) || target.slideIndex < 1) throw new Error(`Invalid slideIndex for ${targetId}`);
    if (!['text', 'chart'].includes(target.kind)) throw new Error(`Invalid target kind for ${targetId}`);
    const stableId = target.stableId == null ? undefined : requireString(target.stableId, `${targetId}.stableId`);
    const objectName = target.objectName == null ? undefined : requireString(target.objectName, `${targetId}.objectName`);
    if (!stableId && !objectName) throw new Error(`Target ${targetId} requires stableId or objectName`);
    const identity = `${target.slideIndex}:${target.kind}:${stableId ?? `name:${objectName}`}`;
    if (identities.has(identity)) throw new Error(`Duplicate update object target: ${identity}`);
    identities.add(identity);
    if (target.kind === "text") {
      if (typeof target.value !== "string") throw new Error(`Text target ${targetId} requires an explicit string value`);
      return { targetId, slideIndex: target.slideIndex, kind: "text", ...(stableId ? { stableId } : {}), ...(objectName ? { objectName } : {}), value: target.value };
    }
    if (!target.chart || !Array.isArray(target.chart.categories) || !Array.isArray(target.chart.series) || !target.chart.series.length) throw new Error(`Chart target ${targetId} requires explicit categories and series`);
    const categories = target.chart.categories.map((item) => String(item));
    if (!categories.length) throw new Error(`Chart target ${targetId} categories must not be empty`);
    const series = target.chart.series.map((seriesItem, seriesIndex) => {
      const name = requireString(seriesItem.name, `${targetId}.series[${seriesIndex}].name`);
      if (!Array.isArray(seriesItem.values) || seriesItem.values.length !== categories.length) throw new Error(`Chart target ${targetId} series ${seriesIndex} must match category count`);
      const values = seriesItem.values.map((item) => {
        if (typeof item !== "number" || !Number.isFinite(item)) throw new Error(`Chart target ${targetId} contains non-finite data`);
        return item;
      });
      return { name, values };
    });
    return { targetId, slideIndex: target.slideIndex, kind: "chart", ...(stableId ? { stableId } : {}), ...(objectName ? { objectName } : {}), chart: { categories, series } };
  });
  return { schema: "ppt-factory/deck-update-plan/v1", updateId, sourceVersionId, lockedDimensions, targets };
}

function slideNumber(name) {
  return Number(name.match(/slide(\d+)\.xml$/)?.[1] ?? 0);
}

function objectFromContainer(container, slideIndex, slidePart, kind) {
  const property = container.match(/<p:cNvPr\b[^>]*\bid="(\d+)"[^>]*\bname="([^"]*)"[^>]*\/?\s*>/);
  if (!property) return null;
  const objectId = Number(property[1]);
  const objectName = decodeXml(property[2]);
  const chartRelId = container.match(/<c:chart\b[^>]*\br:id="([^"]+)"/)?.[1];
  const resolvedKind = chartRelId ? "chart" : kind === "shape" && /<p:txBody\b/.test(container) ? "text" : "other";
  return {
    slideIndex,
    slidePart,
    objectId,
    stableId: `slide-${String(slideIndex).padStart(3, "0")}/object-${objectId}`,
    objectName,
    kind: resolvedKind,
    chartRelId,
    container,
    containerHash: sha256(container)
  };
}

function catalogSlide(xml, slideIndex, slidePart) {
  const output = [];
  for (const match of xml.matchAll(/<p:sp\b[\s\S]*?<\/p:sp>/g)) {
    const item = objectFromContainer(match[0], slideIndex, slidePart, "shape");
    if (item) output.push(item);
  }
  for (const match of xml.matchAll(/<p:graphicFrame\b[\s\S]*?<\/p:graphicFrame>/g)) {
    const item = objectFromContainer(match[0], slideIndex, slidePart, "graphicFrame");
    if (item) output.push(item);
  }
  return output.sort((left, right) => left.objectId - right.objectId);
}

async function relationshipMap(zip, slidePart) {
  const relPart = path.posix.join(path.posix.dirname(slidePart), "_rels", `${path.posix.basename(slidePart)}.rels`);
  const xml = await zip.file(relPart)?.async("string");
  if (!xml) return new Map();
  const result = new Map();
  for (const match of xml.matchAll(/<Relationship\b([^>]*)\/?\s*>/g)) {
    const id = match[1].match(/\bId="([^"]+)"/)?.[1];
    const target = match[1].match(/\bTarget="([^"]+)"/)?.[1];
    if (!id || !target) continue;
    const resolved = target.startsWith("/")
      ? target.slice(1)
      : path.posix.normalize(path.posix.join(path.posix.dirname(slidePart), target));
    result.set(id, resolved);
  }
  return result;
}

function resolveObject(target, objects) {
  const candidates = objects.filter((item) => item.slideIndex === target.slideIndex && item.kind === target.kind &&
    (target.stableId ? item.stableId === target.stableId : item.objectName === target.objectName));
  if (!candidates.length) throw new Error(`Missing ${target.kind} target ${target.targetId} on slide ${target.slideIndex}`);
  if (candidates.length > 1) throw new Error(`Ambiguous ${target.kind} target ${target.targetId}; use stableId`);
  const object = candidates[0];
  if (target.stableId && target.objectName && object.objectName !== target.objectName) throw new Error(`Target identity mismatch for ${target.targetId}`);
  return object;
}

function replaceText(container, value) {
  let first = true;
  let found = false;
  const updated = container.replace(/(<a:t(?:\s[^>]*)?>)[\s\S]*?(<\/a:t>)/g, (_match, open, close) => {
    found = true;
    const content = first ? encodeXml(value) : "";
    first = false;
    return `${open}${content}${close}`;
  });
  if (!found) throw new Error("Native text target contains no editable text runs");
  return updated;
}

function cacheXml(values, numeric, tag = numeric ? "numCache" : "strCache") {
  const points = values.map((value, index) => `<c:pt idx="${index}"><c:v>${numeric ? value : encodeXml(value)}</c:v></c:pt>`).join("");
  const format = numeric ? "<c:formatCode>General</c:formatCode>" : "";
  return `<c:${tag}>${format}<c:ptCount val="${values.length}"/>${points}</c:${tag}>`;
}

function replaceReferenceCache(block, values, numeric) {
  const tags = numeric ? ["numCache", "numLit"] : ["strCache", "strLit"];
  const tag = tags.find((candidate) => new RegExp(`<c:${candidate}\\b`).test(block));
  if (!tag) throw new Error(`Chart does not contain editable ${numeric ? "numeric" : "string"} cache or literal data`);
  const pattern = new RegExp(`<c:${tag}\\b[\\s\\S]*?<\\/c:${tag}>`);
  return block.replace(pattern, cacheXml(values, numeric, tag));
}

function replaceSeriesName(seriesXml, name) {
  if (/<c:tx>\s*<c:v>[\s\S]*?<\/c:v>\s*<\/c:tx>/.test(seriesXml)) {
    return seriesXml.replace(/(<c:tx>\s*<c:v>)[\s\S]*?(<\/c:v>\s*<\/c:tx>)/, `$1${encodeXml(name)}$2`);
  }
  const tx = seriesXml.match(/<c:tx>[\s\S]*?<\/c:tx>/)?.[0];
  if (!tx) throw new Error("Chart series has no editable name cache");
  return seriesXml.replace(tx, tx.replace(/<c:strCache\b[\s\S]*?<\/c:strCache>/, cacheXml([name], false)));
}

function updateChartXml(xml, chart) {
  const existingSeries = [...xml.matchAll(/<c:ser\b[\s\S]*?<\/c:ser>/g)].map((match) => match[0]);
  if (existingSeries.length !== chart.series.length) throw new Error(`Chart series count mismatch: source has ${existingSeries.length}, update has ${chart.series.length}`);
  let cursor = 0;
  return xml.replace(/<c:ser\b[\s\S]*?<\/c:ser>/g, (seriesXml) => {
    const update = chart.series[cursor++];
    let next = replaceSeriesName(seriesXml, update.name);
    const category = next.match(/<c:cat>[\s\S]*?<\/c:cat>/)?.[0];
    const values = next.match(/<c:val>[\s\S]*?<\/c:val>/)?.[0];
    if (!category || !values) throw new Error("Chart series lacks native category/value caches");
    const numericCategories = /<c:num(?:Ref|Lit)\b/.test(category);
    const normalizedCategories = numericCategories ? chart.categories.map((item) => {
      const value = Number(item);
      if (!Number.isFinite(value)) throw new Error("Numeric chart categories require numeric update values");
      return value;
    }) : chart.categories;
    next = next.replace(category, replaceReferenceCache(category, normalizedCategories, numericCategories));
    next = next.replace(values, replaceReferenceCache(values, update.values, true));
    return next;
  });
}

function formulaFrom(block) {
  const value = block?.match(/<c:f>([\s\S]*?)<\/c:f>/)?.[1];
  return value ? decodeXml(value) : undefined;
}

function parseCellRange(formula, expectedLength) {
  const separator = formula.lastIndexOf("!");
  if (separator < 1) throw new Error(`Unsupported chart workbook formula: ${formula}`);
  let sheetName = formula.slice(0, separator);
  if (sheetName.startsWith("'") && sheetName.endsWith("'")) sheetName = sheetName.slice(1, -1).replace(/''/g, "'");
  const reference = formula.slice(separator + 1).replace(/\$/g, "");
  const match = reference.match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/i);
  if (!match || (match[3] && match[1].toUpperCase() !== match[3].toUpperCase())) throw new Error(`Only single-column chart ranges are supported: ${formula}`);
  const start = Number(match[2]);
  const end = Number(match[4] ?? match[2]);
  if (end - start + 1 !== expectedLength) throw new Error(`Chart workbook range length does not match explicit update data: ${formula}`);
  const column = match[1].toUpperCase();
  return { sheetName, cells: Array.from({ length: expectedLength }, (_, index) => `${column}${start + index}`) };
}

function chartWorkbookWrites(chartXml, chart) {
  const seriesXml = [...chartXml.matchAll(/<c:ser\b[\s\S]*?<\/c:ser>/g)].map((match) => match[0]);
  const writes = [];
  seriesXml.forEach((series, index) => {
    const update = chart.series[index];
    const tx = series.match(/<c:tx>[\s\S]*?<\/c:tx>/)?.[0];
    const cat = series.match(/<c:cat>[\s\S]*?<\/c:cat>/)?.[0];
    const val = series.match(/<c:val>[\s\S]*?<\/c:val>/)?.[0];
    const nameFormula = formulaFrom(tx);
    const categoryFormula = formulaFrom(cat);
    const valuesFormula = formulaFrom(val);
    if (nameFormula) writes.push({ formula: nameFormula, values: [update.name], numeric: false });
    if (categoryFormula) writes.push({ formula: categoryFormula, values: chart.categories, numeric: /<c:numRef\b/.test(cat) });
    if (valuesFormula) writes.push({ formula: valuesFormula, values: update.values, numeric: true });
  });
  return writes;
}

function replaceCell(xml, address, value, numeric) {
  const pattern = new RegExp(`<c\\b([^>]*\\br="${address}"[^>]*)>[\\s\\S]*?<\\/c>`);
  const match = xml.match(pattern);
  if (!match) throw new Error(`Embedded chart workbook cell is missing: ${address}`);
  let attributes = match[1].replace(/\s+t="[^"]*"/g, "");
  if (!numeric) attributes += ' t="inlineStr"';
  const replacement = numeric
    ? `<c${attributes}><v>${value}</v></c>`
    : `<c${attributes}><is><t>${encodeXml(value)}</t></is></c>`;
  return xml.replace(pattern, replacement);
}

async function updateEmbeddedChartWorkbook(zip, chartPart, chartXml, chart) {
  const writes = chartWorkbookWrites(chartXml, chart);
  if (!writes.length) return { updated: false, workbookPart: null, beforeHash: null, afterHash: null };
  const chartRelationships = await relationshipMap(zip, chartPart);
  const workbookPart = [...chartRelationships.values()].find((target) => /\/embeddings\/.*\.xlsx$/i.test(`/${target}`));
  if (!workbookPart || !zip.file(workbookPart)) throw new Error("Referenced native chart has no safely writable embedded workbook");
  const beforeBytes = await zip.file(workbookPart).async("nodebuffer");
  const workbookZip = await JSZip.loadAsync(beforeBytes);
  const workbookXml = await workbookZip.file("xl/workbook.xml")?.async("string");
  if (!workbookXml) throw new Error("Embedded chart workbook metadata is missing");
  const workbookRelationships = await relationshipMap(workbookZip, "xl/workbook.xml");
  const sheets = new Map();
  for (const match of workbookXml.matchAll(/<sheet\b([^>]*)\/?\s*>/g)) {
    const name = decodeXml(match[1].match(/\bname="([^"]+)"/)?.[1] ?? "");
    const relationshipId = match[1].match(/\br:id="([^"]+)"/)?.[1];
    const worksheetPart = relationshipId ? workbookRelationships.get(relationshipId) : undefined;
    if (name && worksheetPart) sheets.set(name, worksheetPart);
  }
  const worksheetXml = new Map();
  for (const write of writes) {
    const range = parseCellRange(write.formula, write.values.length);
    const worksheetPart = sheets.get(range.sheetName);
    if (!worksheetPart || !workbookZip.file(worksheetPart)) throw new Error(`Embedded chart worksheet is missing: ${range.sheetName}`);
    let xml = worksheetXml.get(worksheetPart) ?? await workbookZip.file(worksheetPart).async("string");
    range.cells.forEach((cell, index) => { xml = replaceCell(xml, cell, write.values[index], write.numeric); });
    worksheetXml.set(worksheetPart, xml);
  }
  for (const [worksheetPart, xml] of worksheetXml) workbookZip.file(worksheetPart, xml);
  const afterBytes = await workbookZip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  zip.file(workbookPart, afterBytes);
  return { updated: true, workbookPart, beforeHash: sha256(beforeBytes), afterHash: sha256(afterBytes) };
}

async function zipEntryHashes(zip) {
  const entries = {};
  for (const name of Object.keys(zip.files).sort()) {
    if (!zip.files[name].dir) entries[name] = sha256(await zip.file(name).async("nodebuffer"));
  }
  return entries;
}

export async function inspectEditableDeck(inputPath) {
  const bytes = await fs.readFile(inputPath);
  const zip = await JSZip.loadAsync(bytes);
  const slideParts = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort((a, b) => slideNumber(a) - slideNumber(b));
  const objects = [];
  for (const slidePart of slideParts) {
    const index = slideNumber(slidePart);
    objects.push(...catalogSlide(await zip.file(slidePart).async("string"), index, slidePart));
  }
  return {
    schema: "ppt-factory/editable-deck-catalog/v1",
    source: { filename: path.basename(inputPath), sha256: sha256(bytes), slides: slideParts.length },
    objects: objects.map(({ container, chartRelId, ...item }) => item)
  };
}

export async function applyExistingDeckUpdate({ sourcePath, outputPath, plan: rawPlan }) {
  const plan = normalizeDeckUpdatePlan(rawPlan);
  if (path.resolve(sourcePath).toLowerCase() === path.resolve(outputPath).toLowerCase()) throw new Error("Output must be a new PPTX version; source overwrite is forbidden");
  try { await fs.access(outputPath); throw new Error("Output PPTX version already exists"); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  const sourceBytes = await fs.readFile(sourcePath);
  const zip = await JSZip.loadAsync(sourceBytes);
  const beforeEntries = await zipEntryHashes(zip);
  const slideParts = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort((a, b) => slideNumber(a) - slideNumber(b));
  const slideXml = new Map();
  const objects = [];
  for (const slidePart of slideParts) {
    const xml = await zip.file(slidePart).async("string");
    slideXml.set(slidePart, xml);
    objects.push(...catalogSlide(xml, slideNumber(slidePart), slidePart));
  }
  const resolved = plan.targets.map((target) => ({ target, object: resolveObject(target, objects) }));
  const targetStableIds = new Set(resolved.map(({ object }) => object.stableId));
  const chartPartByObject = new Map();
  for (const object of objects.filter((item) => item.kind === "chart")) {
    const relationships = await relationshipMap(zip, object.slidePart);
    const chartPart = relationships.get(object.chartRelId);
    if (chartPart) chartPartByObject.set(object.stableId, chartPart);
  }
  for (const { target, object } of resolved.filter((item) => item.target.kind === "chart")) {
    const chartPart = chartPartByObject.get(object.stableId);
    const sharedBy = [...chartPartByObject].filter(([, part]) => part === chartPart).map(([stableId]) => stableId);
    if (sharedBy.some((stableId) => !targetStableIds.has(stableId))) throw new Error(`Chart target ${target.targetId} shares native data with an unnamed object`);
  }
  const changes = [];
  for (const { target, object } of resolved) {
    const currentSlideXml = slideXml.get(object.slidePart);
    const currentObject = catalogSlide(currentSlideXml, object.slideIndex, object.slidePart).find((item) => item.stableId === object.stableId);
    if (!currentObject) throw new Error(`Target disappeared during update: ${target.targetId}`);
    let beforePayload;
    let afterPayload;
    if (target.kind === "text") {
      beforePayload = currentObject.container;
      const updatedContainer = replaceText(currentObject.container, target.value);
      slideXml.set(object.slidePart, currentSlideXml.replace(currentObject.container, updatedContainer));
      afterPayload = updatedContainer;
    } else {
      const chartPart = chartPartByObject.get(object.stableId);
      if (!chartPart || !zip.file(chartPart)) throw new Error(`Native chart relationship missing for ${target.targetId}`);
      const chartXml = await zip.file(chartPart).async("string");
      beforePayload = `${currentObject.container}\n${chartXml}`;
      const workbookUpdate = await updateEmbeddedChartWorkbook(zip, chartPart, chartXml, target.chart);
      const updatedChartXml = updateChartXml(chartXml, target.chart);
      zip.file(chartPart, updatedChartXml);
      beforePayload += workbookUpdate.beforeHash ? `\n${workbookUpdate.beforeHash}` : "";
      afterPayload = `${currentObject.container}\n${updatedChartXml}${workbookUpdate.afterHash ? `\n${workbookUpdate.afterHash}` : ""}`;
    }
    changes.push({
      targetId: target.targetId,
      slideIndex: object.slideIndex,
      stableId: object.stableId,
      objectId: object.objectId,
      objectName: object.objectName,
      kind: target.kind,
      match: target.stableId ? "stable-id" : "exact-name",
      beforeHash: sha256(beforePayload),
      afterHash: sha256(afterPayload),
      status: "applied"
    });
  }
  for (const [slidePart, xml] of slideXml) zip.file(slidePart, xml);
  const afterEntries = await zipEntryHashes(zip);
  const changedParts = Object.keys(beforeEntries).filter((name) => beforeEntries[name] !== afterEntries[name]).sort();
  const objectCatalogAfter = [];
  for (const slidePart of slideParts) objectCatalogAfter.push(...catalogSlide(await zip.file(slidePart).async("string"), slideNumber(slidePart), slidePart));
  const beforeUntouched = new Map(objects.filter((item) => !targetStableIds.has(item.stableId)).map((item) => [item.stableId, item.containerHash]));
  const afterUntouched = new Map(objectCatalogAfter.filter((item) => !targetStableIds.has(item.stableId)).map((item) => [item.stableId, item.containerHash]));
  const untouchedStable = beforeUntouched.size === afterUntouched.size && [...beforeUntouched].every(([id, hash]) => afterUntouched.get(id) === hash);
  if (!untouchedStable) throw new Error("Untouched native objects changed; output was not written");
  const outputBytes = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, outputBytes, { flag: "wx" });
  return {
    schema: "ppt-factory/deck-update-manifest/v1",
    updateId: plan.updateId,
    status: "applied",
    source: { versionId: plan.sourceVersionId, filename: path.basename(sourcePath), sha256: sha256(sourceBytes), slides: slideParts.length },
    output: { versionId: plan.updateId, filename: path.basename(outputPath), sha256: sha256(outputBytes), slides: slideParts.length },
    planHash: sha256(stableJson(plan)),
    lockedDimensions: plan.lockedDimensions,
    changes,
    preservation: {
      untouchedObjects: beforeUntouched.size,
      untouchedObjectsStable: untouchedStable,
      unchangedZipEntries: Object.keys(beforeEntries).filter((name) => beforeEntries[name] === afterEntries[name]).length,
      changedParts
    }
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (value) => value.slice(1)))) {
  const [sourcePath, outputPath, planPath] = process.argv.slice(2);
  const plan = JSON.parse(await fs.readFile(planPath, "utf8"));
  console.log(JSON.stringify(await applyExistingDeckUpdate({ sourcePath, outputPath, plan })));
}
