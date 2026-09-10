// iFinD 宏观字段探针 · Phase 1 (recall)
// 对每个候选指标调用 lookup_field_reference，收集候补 api_name。
// 不猜测任何字段代码（Spec §6 / RULE 6）。
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { connectIfind } from "./ifind-mcp-client.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const probeDir = resolve(here, "../work/macro-probe");
mkdirSync(probeDir, { recursive: true });

const targetsFile = process.env.PROBE_TARGETS_FILE || "probe-targets.json";
const targets = JSON.parse(readFileSync(resolve(probeDir, targetsFile), "utf8"));
const layers = (process.env.PROBE_LAYERS || "L1,L2,L3").split(",").map(s => s.trim()).filter(Boolean);
const limit = Number(process.env.PROBE_LIMIT || 0);
const concurrency = Number(process.env.PROBE_CONCURRENCY || 3);
const outFile = process.env.PROBE_OUT || "field-candidates.json";

let list = targets.filter(t => layers.includes(t.layer));
if (limit > 0) list = list.slice(0, limit);
console.log(`探针目标：${list.length} 个（层=${layers.join("/")}，并发=${concurrency}）`);

const connection = await connectIfind({ timeoutMs: 90_000 });

async function probeOne(target) {
  const startedAt = Date.now();
  try {
    const raw = await connection.callTool("lookup_field_reference", {
      function_name: target.probeVia,
      keyword: target.keyword,
    });
    return { ...target, ok: true, elapsedMs: Date.now() - startedAt, raw };
  } catch (error) {
    return {
      ...target,
      ok: false,
      elapsedMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

const results = new Array(list.length);
let cursor = 0;
async function worker(workerId) {
  while (cursor < list.length) {
    const index = cursor++;
    const target = list[index];
    const result = await probeOne(target);
    results[index] = result;
    const tag = result.ok ? "OK " : "ERR";
    console.error(`[${workerId}] ${tag} ${target.id} ${target.keyword} (${result.elapsedMs}ms)`);
  }
}

try {
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, (_, i) => worker(i + 1)));
} finally {
  await connection.close();
}

writeFileSync(resolve(probeDir, outFile), JSON.stringify(results, null, 2), "utf8");
const okCount = results.filter(r => r.ok).length;
console.log(`完成：${okCount}/${results.length} 成功 → ${outFile}`);
