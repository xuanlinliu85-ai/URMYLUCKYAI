import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { assertResearchArtifact } from "../contracts/research-artifact/validate.mjs";

const examplesDir = path.resolve("contracts/research-artifact/examples");
const files = (await readdir(examplesDir)).filter((name) => name.endsWith(".json")).sort();
const targets = files.map((name) => path.join(examplesDir, name));
targets.push(path.resolve("artifacts/RESEARCH_ARTIFACT.market-review.json"));

for (const file of targets) {
  const artifact = assertResearchArtifact(JSON.parse(await readFile(file, "utf8")));
  console.log(`PASS ${path.relative(process.cwd(), file)} (${artifact.artifact_type})`);
}

if (files.length !== 3) throw new Error(`Expected exactly 3 canonical examples, found ${files.length}`);
console.log(`Research Artifact contract: PASS (${targets.length} artifacts)`);
