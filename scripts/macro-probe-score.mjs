// iFinD 宏观字段探针 · Phase 2 (scoring)
// 解析候选表，按中文名相似度打分，过滤境外噪音，输出每个指标的前 3 候选。
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const probeDir = resolve(here, "../work/macro-probe");

const inFile = process.env.PROBE_SCORE_IN || "field-candidates.json";
const outFile = process.env.PROBE_SCORE_OUT || "field-scored.json";
const raw = JSON.parse(readFileSync(resolve(probeDir, inFile), "utf8"));

const FOREIGN = /^(美国|日本|欧元区|欧元区20国|英国|德国|法国|韩国|印度|加拿大|澳大利亚|俄罗斯|巴西|越南|泰国|印尼|墨西哥|新西兰|瑞士|瑞典|挪威|荷兰|西班牙|意大利|土耳其|阿根廷|南非|沙特|新加坡|马来西亚|菲律宾|全球|世界|OECD)/;

function normalize(text) {
  return String(text || "").replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, "");
}

function bigrams(text) {
  const set = new Set();
  for (let i = 0; i < text.length - 1; i += 1) set.add(text.slice(i, i + 2));
  if (text.length === 1) set.add(text);
  return set;
}

function score(keyword, candidateName) {
  const k = normalize(keyword);
  const c = normalize(candidateName);
  if (!k || !c) return 0;
  const kb = bigrams(k);
  const cb = bigrams(c);
  let hit = 0;
  for (const gram of kb) if (cb.has(gram)) hit += 1;
  const coverage = kb.size ? hit / kb.size : 0;
  const precision = cb.size ? hit / cb.size : 0;
  const exact = c === k ? 0.35 : 0;
  const contains = c.includes(k) || k.includes(c) ? 0.15 : 0;
  return Number((coverage * 0.6 + precision * 0.25 + exact + contains).toFixed(4));
}

function parseCandidates(text) {
  if (typeof text !== "string") return [];
  const out = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^\|\s*\d+\s*\|\s*`([^`]+)`\s*\|\s*([^|]+?)\s*\|/);
    if (m) out.push({ apiName: m[1].trim(), nameCn: m[2].trim() });
  }
  return out;
}

const report = [];
for (const item of raw) {
  const candidates = parseCandidates(item.raw);
  const scored = candidates
    .map(c => ({ ...c, score: score(item.keyword, c.nameCn), foreign: FOREIGN.test(c.nameCn) }))
    .sort((a, b) => b.score - a.score);

  const domestic = scored.filter(c => !c.foreign);
  const pool = domestic.length ? domestic : scored;

  report.push({
    id: item.id,
    layer: item.layer,
    category: item.category,
    probeVia: item.probeVia,
    nameCn: item.name_cn,
    keyword: item.keyword,
    freq: item.freq,
    unit: item.unit,
    candidateCount: candidates.length,
    top: pool.slice(0, 3).map(c => ({ apiName: c.apiName, nameCn: c.nameCn, score: c.score })),
    droppedForeign: scored.filter(c => c.foreign).length,
  });
}

writeFileSync(resolve(probeDir, outFile), JSON.stringify(report, null, 2), "utf8");

for (const layer of ["L1", "L2", "L3"]) {
  const rows = report.filter(r => r.layer === layer);
  console.log(`\n########## ${layer} （${rows.length} 项） ##########`);
  for (const r of rows) {
    const best = r.top[0];
    console.log(`${r.id}  「${r.nameCn}」`);
    console.log(`   keyword: ${r.keyword}  [${r.probeVia}]`);
    r.top.forEach((c, i) => console.log(`   ${i === 0 ? ">" : " "} ${c.apiName}  ${c.nameCn}  (${c.score})`));
    if (!best) console.log("   ! 无候选");
  }
}
console.log(`\n境外噪音共剔除 ${report.reduce((s, r) => s + r.droppedForeign, 0)} 条`);
