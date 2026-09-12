import { readFile } from "node:fs/promises";
import { assertResearchArtifact } from "../contracts/research-artifact/validate.mjs";

const file = new URL("../contracts/research-artifact/examples/macro.json", import.meta.url);
const artifact = assertResearchArtifact(JSON.parse(await readFile(file, "utf8")));
if (artifact.artifact_type !== "macro_research") throw new Error("Macro fixture must use artifact_type=macro_research");
if (artifact.provenance.orchestration_mode !== "direct_research_os" || artifact.provenance.orchestrator !== null) throw new Error("Macro production contract must use direct Research OS orchestration");
if (!artifact.provenance.project_owners.includes("analyst-dream-team")) throw new Error("Macro fixture must identify its research router owner");
console.log("Macro offline/contract tests: PASS");
