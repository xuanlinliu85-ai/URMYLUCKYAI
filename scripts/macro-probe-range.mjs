// iFinD 宏观字段探针 · Phase 4 (range sweep)
// 原理：EDB 指标 ID 按区段分配。已知 M002043802=制造业PMI，
// 则同区段相邻 ID 很可能就是 PMI 分项。逐个实测，用官方 index_name 反查。
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { connectIfind } from "./ifind-mcp-client.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const probeDir = resolve(here, "../work/macro-probe");
mkdirSync(probeDir, { recursive: true });

const ranges = JSON.parse(readFileSync(resolve(probeDir, "probe-ranges.json"), "utf8"));
const BEGIN = "2026-05-01";
const END = "2026-09-10";

function expand(range) {
  const m = range.start.match(/^([A-Za-z]+)(\d+)$/);
  if (!m) throw new Error(`区段格式错误：${range.start}`);
  const [, prefix, digits] = m;
  const width = digits.length;
  const from = Number(digits);
  const to = Number(range.end.match(/\d+$/)[0]);
  const ids = [];
  for (let n = from; n <= to; n += 1) ids.push(`${prefix}${String(n).padStart(width, "0")}`);
  return ids;
}

const allIds = ranges.flatMap(expand);
console.log(`区段扫描：${ranges.length} 个区段，共 ${allIds.length} 个候选 ID`);

const connection = await connectIfind({ timeoutMs: 240_000 });
const found = new Map();
const batchSize = 60;

try {
  for (let i = 0; i < allIds.length; i += batchSize) {
    const batch = allIds.slice(i, i + batchSize);
    process.stderr.write(`  批次 ${Math.floor(i / batchSize) + 1}：${batch.length} 个 ID ... `);
    try {
      const raw = await connection.callTool("THS_EDB", {
        indicators: batch.join(";"),
        begintime: BEGIN,
        endtime: END,
      });
      const rows = (raw && raw.data) || [];
      for (const row of rows) {
        if (row.value === null || row.value === undefined || row.value === "") continue;
        const prev = found.get(row.id);
        if (!prev || String(row.time) > String(prev.time)) {
          found.set(row.id, { id: row.id, name: row.index_name, time: row.time, rtime: row.rtime, value: row.value });
        }
      }
      const hit = new Set(rows.map(r => r.id)).size;
      console.error(`命中 ${hit}/${batch.length}`);
    } catch (error) {
      console.error(`失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }
} finally {
  await connection.close();
}

const list = [...found.values()].sort((a, b) => a.id.localeCompare(b.id));
writeFileSync(resolve(probeDir, "range-sweep.json"), JSON.stringify(list, null, 2), "utf8");

for (const range of ranges) {
  const ids = new Set(expand(range));
  const seg = list.filter(item => ids.has(item.id));
  console.log(`\n##### 区段 ${range.start} ~ ${range.end}　命中 ${seg.length} #####`);
  for (const item of seg) console.log(`${item.id}  ${item.name}  |  ${item.time} = ${item.value}`);
}
