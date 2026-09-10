import fs from "node:fs/promises";
import path from "node:path";

const [beforeDir, afterDir, qaPath, outputPath] = process.argv.slice(2).map((value) => value && path.resolve(value));
if (!beforeDir || !afterDir || !qaPath || !outputPath) {
  throw new Error("Usage: verify-font-repair.mjs <before-dir> <after-dir> <qa-before.json> <output.json>");
}

function style(element) {
  const runs = (element.paragraphs ?? []).flatMap((paragraph) => paragraph.runs ?? []);
  return {
    text: element.text,
    bbox: element.bbox,
    fontSizes: runs.map((run) => run.fontSize),
    colors: runs.map((run) => run.color),
    typefaces: [...new Set(runs.map((run) => run.typeface).filter(Boolean))]
  };
}

async function objects(renderDir) {
  const result = new Map();
  const files = (await fs.readdir(renderDir)).filter((name) => name.endsWith(".layout.json")).sort();
  for (let slide = 0; slide < files.length; slide += 1) {
    const layout = JSON.parse(await fs.readFile(path.join(renderDir, files[slide]), "utf8"));
    for (const element of layout.elements ?? []) if (element.name) result.set(`${slide + 1}|${element.name}`, style(element));
  }
  return result;
}

const qa = JSON.parse(await fs.readFile(qaPath, "utf8"));
const targets = qa.technical.fontFallback.findings.filter((finding) => !finding.passed);
const [before, after] = await Promise.all([objects(beforeDir), objects(afterDir)]);
const changes = targets.map((target) => {
  const key = `${target.slide}|${target.objectName}`;
  const left = before.get(key), right = after.get(key);
  const preserved = {
    text: JSON.stringify(left?.text) === JSON.stringify(right?.text),
    geometry: JSON.stringify(left?.bbox) === JSON.stringify(right?.bbox),
    fontSize: JSON.stringify(left?.fontSizes) === JSON.stringify(right?.fontSizes),
    color: JSON.stringify(left?.colors) === JSON.stringify(right?.colors)
  };
  return { slide: target.slide, objectName: target.objectName, beforeTypefaces: left?.typefaces, afterTypefaces: right?.typefaces, preserved, onlyTypefaceChanged: Object.values(preserved).every(Boolean) && JSON.stringify(left?.typefaces) !== JSON.stringify(right?.typefaces) };
});
const report = {
  targets: changes.length,
  onlyTypefaceChanged: changes.filter((change) => change.onlyTypefaceChanged).length,
  allTargetsPreservedNonTypefaceProperties: changes.every((change) => change.onlyTypefaceChanged),
  changes
};
await fs.writeFile(outputPath, JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify(report, null, 2));
if (!report.allTargetsPreservedNonTypefaceProperties) process.exitCode = 1;

