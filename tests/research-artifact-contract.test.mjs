import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { assertResearchArtifact, validateResearchArtifact } from "../contracts/research-artifact/validate.mjs";
import { artifactToPresentationText } from "../projects/PPT/lib/research-artifact.mjs";

for (const type of ["market", "earnings", "macro"]) {
  test(`${type} fixture satisfies RESEARCH_ARTIFACT 1.0.0`, async () => {
    const artifact = JSON.parse(await readFile(new URL(`../contracts/research-artifact/examples/${type}.json`, import.meta.url), "utf8"));
    assert.equal(assertResearchArtifact(artifact), artifact);
    assert.equal(artifact.provenance.orchestration_mode, "direct_research_os");
    assert.equal(artifact.provenance.orchestrator, null);
  });
}

test("PPT consumer preserves the canonical artifact", async () => {
  const artifact = JSON.parse(await readFile(new URL("../contracts/research-artifact/examples/earnings.json", import.meta.url), "utf8"));
  const before = JSON.stringify(artifact);
  const output = artifactToPresentationText(artifact);
  assert.match(output, /Synthetic company Q2 earnings review/);
  assert.equal(JSON.stringify(artifact), before);
});

test("contract rejects broken references", async () => {
  const artifact = JSON.parse(await readFile(new URL("../contracts/research-artifact/examples/market.json", import.meta.url), "utf8"));
  artifact.conclusions[0].fact_ids = ["UNKNOWN"];
  assert.ok(validateResearchArtifact(artifact).some((error) => error.includes("unknown fact")));
});
