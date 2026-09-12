import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const publicDir = path.join(root, "public");

async function readJson(name) {
  return JSON.parse(await readFile(path.join(publicDir, name), "utf8"));
}

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function fact(id, statement, value, unit, timestamp, sourceIds = ["S1"]) {
  return { fact_id: id, statement, value, unit, timestamp, status: "verified", source_ids: sourceIds };
}

export async function buildMarketReviewArtifact() {
  const [market, dashboard, attribution, turnover] = await Promise.all([
    readJson("market-snapshot.json"),
    readJson("dashboard-snapshot.json"),
    readJson("attribution-snapshot.json"),
    readJson("turnover-template.json"),
  ]);
  const tradeDate = String(market.tradeDate || dashboard.snapshotDate || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tradeDate)) throw new Error("Daily Review 缺少有效 tradeDate");
  const audit = market.sourceAudit?.ifind;
  if (!audit?.compatible || audit.status !== "ready") throw new Error("iFinD 兼容性审计未通过");

  const indexes = Array.isArray(market.indexes) ? market.indexes : Object.values(market.indexes || {});
  const facts = indexes.slice(0, 12).map((item, index) => {
    const name = item?.name || item?.label || item?.code || `指数${index + 1}`;
    const value = item?.changePct ?? item?.pctChange ?? item?.change ?? item?.close ?? null;
    const unit = item?.changePct != null || item?.pctChange != null ? "%" : null;
    return fact(`F${index + 1}`, `${name}收盘数据`, value, unit, `${tradeDate}T15:00:00+08:00`);
  });
  facts.push(fact(`F${facts.length + 1}`, "iFinD MCP 兼容性审计通过", true, null, audit.checkedAt, ["S2"]));

  const themes = Array.isArray(attribution.themes) ? attribution.themes : Object.values(attribution.themes || {});
  const leadingThemes = themes.slice(0, 5).map((item) => item?.name || item?.theme || item?.title).filter(Boolean);
  const conclusion = leadingThemes.length
    ? `成交归因领先主题：${leadingThemes.join("、")}`
    : "成交归因已生成，主题结构以 attribution-snapshot 为准。";
  const sourceFiles = ["market-snapshot.json", "dashboard-snapshot.json", "attribution-snapshot.json", "turnover-template.json"];
  return {
    schema_version: "1.0.0",
    artifact_id: `market-review-${tradeDate}`,
    artifact_type: "market_review",
    title: `${tradeDate} A股收盘复盘`,
    as_of: `${tradeDate}T15:00:00+08:00`,
    generated_at: new Date().toISOString(),
    subject: { kind: "market", name: "A股", identifiers: {}, market: "CN", period: "full_session" },
    request: {
      user_goal: "复用 Daily Review 已完成的数据采集与分类结果，生成统一研究底稿",
      requested_outputs: ["wechat_article", "infographic", "ppt", "website"],
      constraints: ["下游只消费已验证事实", "保持事实与推断分离"],
    },
    facts,
    timeline: [],
    drivers: [],
    conclusions: [{ conclusion_id: "C1", statement: conclusion, type: "primary", fact_ids: facts.map((item) => item.fact_id), driver_ids: [], source_ids: ["S1"], confidence: 0.8 }],
    risks: [],
    watchpoints: Array.isArray(turnover.unclassified) && turnover.unclassified.length ? ["复核未分类成交项"] : [],
    sources: [
      { source_id: "S1", title: "Daily Review snapshot bundle", source_type: "structured_data", provider: "Daily Review", url: null, published_at: tradeDate, accessed_at: new Date().toISOString(), notes: `sha256:${hash({ market, dashboard, attribution, turnover })}` },
      { source_id: "S2", title: "iFinD MCP compatibility audit", source_type: "structured_data", provider: "iFinD MCP", url: null, published_at: audit.checkedAt, accessed_at: new Date().toISOString(), notes: `tools=${(audit.requiredTools || []).join(",")}` },
    ],
    quality: { date_verified: true, fiscal_period_verified: null, consensus_verified: null, intraday_granularity: "daily_close", unresolved_conflicts: [], warnings: [] },
    provenance: { orchestration_mode: "direct_research_os", orchestrator: null, project_owners: ["daily-review"], capabilities_used: ["a_share_market_review", "ifind_market_data"], skills_used: ["market-daily-review"], tools_used: audit.requiredTools || [], knowledge_refs: sourceFiles.map((name) => `public/${name}`) },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const output = path.resolve(process.argv[2] || path.join("artifacts", "RESEARCH_ARTIFACT.market-review.json"));
  const artifact = await buildMarketReviewArtifact();
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(output);
}
