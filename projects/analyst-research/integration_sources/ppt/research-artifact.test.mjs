import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { artifactToPresentationText } from "../lib/research-artifact.mjs";

test("Research Artifact is consumed without adding research facts", async () => {
  const file = process.env.RESEARCH_ARTIFACT_FIXTURE || new URL("../../../../contracts/research-artifact/examples/macro.json", import.meta.url);
  const artifact = JSON.parse(await readFile(file, "utf8"));
  const before = JSON.stringify(artifact);
  const text = artifactToPresentationText(artifact);
  for (const fact of artifact.facts) assert.match(text, new RegExp(fact.fact_id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(text, new RegExp(artifact.artifact_id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal((text.match(/^事实\[/gm) || []).length, artifact.facts.length);
  assert.equal(JSON.stringify(artifact), before, "PPT consumer must preserve the canonical artifact");
});
