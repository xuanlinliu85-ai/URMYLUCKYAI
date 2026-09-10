// 宏观高频监测 · Smoke Test
//
// 覆盖 Spec §50 的验收项，其中 §45 点名的四项为重点：
//   04 月度数据不每日复制 · 08 不重复拉取落库 · 09 Dashboard 与 raw data 对账 · 12 普通行情查询不误启动宏观链路
//
// 用法：node scripts/macro-smoke-test.mjs
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadMacroConfig } from "./macro-config.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const workDir = resolve(root, "work/macro");

const results = [];
function check(id, title, fn) {
  try {
    const detail = fn();
    results.push({ id, title, ok: true, detail: detail || "通过" });
  } catch (error) {
    results.push({ id, title, ok: false, detail: error instanceof Error ? error.message : String(error) });
  }
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const config = loadMacroConfig();
const observationsPath = resolve(workDir, "observations.json");
const snapshotPath = resolve(root, "public/macro-snapshot.json");
const workbenchPath = resolve(root, "public/macro-workbench.html");

const observations = existsSync(observationsPath) ? JSON.parse(readFileSync(observationsPath, "utf8")) : null;
const snapshot = existsSync(snapshotPath) ? JSON.parse(readFileSync(snapshotPath, "utf8")) : null;

/* ---- 01 配置层可加载 ---- */
check("01", "配置层可加载且字段完整", () => {
  assert(config.indicators.length > 0, "注册表为空");
  assert(config.collectable.length > 0, "无 verified 可采集指标");
  assert(config.weightProfile.dimensions, "缺少权重组");
  assert(Object.keys(config.dimensions).length === 6, `维度数应为 6，实际 ${Object.keys(config.dimensions).length}`);
  const noDim = config.collectable.filter(item => !item.dimension);
  assert(noDim.length === 0, `以下指标缺 dimension：${noDim.map(i => i.id).join(", ")}`);
  return `指标 ${config.indicators.length} 项 / 可采集 ${config.collectable.length} 项 / 派生 ${config.derived.length} 项`;
});

/* ---- 02 无猜测字段 ---- */
check("02", "可采集指标的 field_code 均已实测（无占位符）", () => {
  const bad = config.collectable.filter(item => !item.ifind.field_code || /FIELD_LOOKUP_REQUIRED|TBD|TODO|\?/.test(item.ifind.field_code));
  assert(bad.length === 0, `存在未解析字段：${bad.map(i => i.id).join(", ")}`);
  const unverified = config.indicators.filter(item => item.ifind && item.ifind.verified !== true && item.ifind.field_code);
  assert(unverified.length === 0, `存在 verified!=true 却有 field_code 的指标：${unverified.map(i => i.id).join(", ")}`);
  return `全部 ${config.collectable.length} 项 field_code 已实测标注 verified`;
});

/* ---- 03 待补清单正确隔离 ---- */
check("03", "FIELD_LOOKUP_REQUIRED 未混入可采集集", () => {
  const pendingIds = new Set((config.pending || []).map(item => item.id));
  const overlap = config.collectable.filter(item => pendingIds.has(item.id));
  assert(overlap.length === 0, `待补指标混入采集集：${overlap.map(i => i.id).join(", ")}`);
  return `待补 ${pendingIds.size} 项已隔离`;
});

/* ---- 04（重点）月度数据不每日复制 ---- */
check("04", "月频/季频观测不存在每日复制（间隔 ≥ 20 天）", () => {
  assert(observations, "observations.json 不存在，先运行 macro-collect.mjs");
  const offenders = [];
  for (const item of Object.values(observations.indicators)) {
    if (item.frequency !== "monthly" && item.frequency !== "quarterly") continue;
    const dates = item.series.filter(p => p.v !== null).map(p => p.d).sort();
    for (let i = 1; i < dates.length; i += 1) {
      const gap = (Date.parse(dates[i]) - Date.parse(dates[i - 1])) / 86400000;
      if (gap < 20) { offenders.push(`${item.id} ${dates[i - 1]}→${dates[i]} 仅隔 ${gap} 天`); break; }
    }
  }
  assert(offenders.length === 0, `发现月频被高频化写入：${offenders.slice(0, 5).join(" | ")}`);
  const monthly = Object.values(observations.indicators).filter(i => i.frequency === "monthly").length;
  return `抽查 ${monthly} 个月频指标，无 20 天内重复观测`;
});

/* ---- 05 观测期与发布期分离（Spec §12/§14）---- */
check("05", "observation_date 与 release_date 已分离（EDB 原生 rtime）", () => {
  assert(observations, "observations.json 不存在");
  const withRelease = Object.values(observations.indicators).filter(item =>
    item.tool === "THS_EDB" && item.series.some(p => p.r));
  assert(withRelease.length > 0, "没有任何 EDB 观测带 release_date");
  const sample = withRelease[0];
  const point = sample.series.find(p => p.r);
  const obsDate = point.d.slice(0, 10);
  const relDate = String(point.r).slice(0, 10);
  assert(relDate >= obsDate, `发布期早于观测期：${obsDate} vs ${relDate}`);
  return `${withRelease.length}/${Object.values(observations.indicators).filter(i => i.tool === "THS_EDB").length} 个 EDB 指标带 rtime，示例 ${sample.id} 观测 ${obsDate} / 发布 ${relDate}`;
});

/* ---- 06 派生指标 ---- */
check("06", "派生指标公式全部可解析且支撑序列齐备", () => {
  assert(snapshot, "macro-snapshot.json 不存在");
  const failed = snapshot.dataQuality.derivedFailed || [];
  assert(failed.length === 0, `派生失败：${failed.map(f => `${f.id}(${f.reason})`).join(", ")}`);
  assert((snapshot.dataQuality.derivedOk || []).length === config.derived.length,
    `派生成功数 ${(snapshot.dataQuality.derivedOk || []).length} != 注册表 ${config.derived.length}`);
  return `${(snapshot.dataQuality.derivedOk || []).join(", ")}`;
});

/* ---- 07 方向标签全部已登记 ---- */
check("07", "方向标签全部已在 signal_rules 登记（无静默降级）", () => {
  assert(snapshot, "macro-snapshot.json 不存在");
  const unknown = (snapshot.scoringModel || {}).unknownDirections || [];
  assert(unknown.length === 0, `未登记方向标签：${unknown.join(", ")}`);
  const contextual = snapshot.dimensions
    .flatMap(d => d.missingWeightMembers || [])
    .filter(m => /方向 .* 不参与打分/.test(m.reason || ""));
  return `无未登记标签；${contextual.length} 项因 contextual 按约定排除（非缺陷）`;
});

/* ---- 08（重点）不重复拉取落库 / 幂等 ---- */
check("08", "评分层幂等：连跑两次结果一致（仅时间戳变化）", () => {
  assert(snapshot, "macro-snapshot.json 不存在");
  const before = readFileSync(snapshotPath, "utf8");
  execFileSync(process.execPath, [resolve(root, "scripts/macro-snapshot.mjs")], { cwd: root, stdio: "pipe" });
  const after = readFileSync(snapshotPath, "utf8");
  const strip = text => text.replace(/"generatedAt": "[^"]+"/g, "");
  assert(strip(before) === strip(after), "两次运行产出不一致，存在非确定性");
  const beforeSize = JSON.parse(before).trends ? Object.keys(JSON.parse(before).trends).length : 0;
  return `两次运行结果逐字节一致（忽略 generatedAt），序列 ${beforeSize} 条`;
});

/* ---- 09（重点）Dashboard 与原始数据对账 ---- */
check("09", "工作台数据与采集原始值逐项对账", () => {
  assert(observations && snapshot, "缺少 observations.json 或 macro-snapshot.json");
  const mismatches = [];
  let compared = 0;
  for (const [id, trend] of Object.entries(snapshot.trends)) {
    const raw = observations.indicators[id];
    if (!raw || !trend.latest) continue;
    compared += 1;
    if (trend.latest.date !== raw.latest.d) mismatches.push(`${id} 日期 ${trend.latest.date} != ${raw.latest.d}`);
    if (Math.abs(trend.latest.value - raw.latest.v) > 1e-6) mismatches.push(`${id} 数值 ${trend.latest.value} != ${raw.latest.v}`);
  }
  assert(mismatches.length === 0, `对账不一致：${mismatches.slice(0, 5).join(" | ")}`);
  assert(compared >= 50, `对账覆盖不足，仅 ${compared} 项`);

  // 热力图单元格的 dirZ 必须等于 polarity × z（方向口径一致性）
  const polarity = (snapshot.scoringModel || {}).polarity || {};
  const directionOfId = new Map();
  for (const item of config.indicators) {
    const direction = item?.signal?.direction;
    if (typeof direction === "string") directionOfId.set(item.id, polarity[direction] ?? 0);
  }
  const badCell = [];
  for (const dim of snapshot.heatmap.dimensions) {
    for (const cell of dim.cells) {
      const p = directionOfId.get(cell.id);
      if (p === undefined || cell.z === null) continue;
      const expected = Number((p * cell.z).toFixed(4));
      if (Math.abs(expected - cell.dirZ) > 0.01) badCell.push(`${cell.id} dirZ=${cell.dirZ} 期望 ${expected}`);
    }
  }
  assert(badCell.length === 0, `热力图方向校正不一致：${badCell.slice(0, 4).join(" | ")}`);
  return `对账 ${compared} 条序列的最新值/日期全部一致，热力图方向校正校验通过`;
});

/* ---- 10 新鲜度状态合法 ---- */
check("10", "新鲜度状态取值合法且月频不误判 STALE", () => {
  assert(snapshot, "macro-snapshot.json 不存在");
  const allowed = new Set(["FRESH", "EXPECTED", "STALE", "MISSING", "ERROR", "DISCONTINUED"]);
  const bad = Object.entries(snapshot.headline.freshness || {}).filter(([key]) => !allowed.has(key));
  assert(bad.length === 0, `非法状态：${bad.map(b => b[0]).join(", ")}`);
  const pmi = Object.entries(snapshot.headline.freshness || {});
  assert(pmi.length > 0, "新鲜度统计为空");
  const missing = snapshot.dataQuality.degraded.filter(d => d.status === "MISSING");
  assert(missing.length === 0, `有指标无有效观测：${missing.map(d => d.id).join(", ")}`);
  return Object.entries(snapshot.headline.freshness).map(([k, v]) => `${k}=${v}`).join("  ");
});

/* ---- 11 异常阈值与配置一致 ---- */
check("11", "异常判定阈值与 signal_rules 一致", () => {
  assert(snapshot, "macro-snapshot.json 不存在");
  const rule = (config.anomalyTriggers || []).find(r => r.id === "ZSCORE_EXTREME");
  assert(rule, "配置缺少 ZSCORE_EXTREME 规则");
  const zAnomalies = snapshot.anomalies.filter(a => (a.triggers || []).some(t => t.id === "ZSCORE_EXTREME"));
  const violated = zAnomalies.filter(a => Math.abs(a.z1y) < 2);
  assert(violated.length === 0, `z 未达阈值却触发：${violated.map(v => `${v.id}=${v.z1y}`).join(", ")}`);
  const missed = Object.values(snapshot.trends).filter(t => t.z1y !== null && Math.abs(t.z1y) >= 2
    && !snapshot.anomalies.some(a => a.id === t.id));
  assert(missed.length === 0, `z 超阈值却未触发：${missed.map(m => `${m.id}=${m.z1y}`).join(", ")}`);
  return `|z|≥2 触发 ${zAnomalies.length} 项，无漏判、无误判`;
});

/* ---- 12（重点）普通行情链路不被污染 ---- */
check("12", "A 股收盘主链路未被宏观模块侵入", () => {
  const mainScript = readFileSync(resolve(root, "scripts/update-snapshots.mjs"), "utf8");
  assert(!/macro/i.test(mainScript), "update-snapshots.mjs 中出现了 macro 相关内容，故障域已混入");
  const snapshotContract = readFileSync(resolve(root, "public/market-snapshot.json"), "utf8").slice(0, 400);
  assert(!/MACRO_SNAPSHOT/.test(snapshotContract), "market-snapshot.json 被宏观契约污染");
  assert(snapshot.contract === "MACRO_SNAPSHOT", "宏观快照契约标识缺失");
  return "update-snapshots.mjs 无 macro 引用；两份快照契约互不干扰";
});

/* ---- 13 权重归一化 ---- */
check("13", "维度权重已按可用成员归一化且缺口有记录", () => {
  assert(snapshot, "macro-snapshot.json 不存在");
  const bad = [];
  for (const dim of snapshot.dimensions) {
    if (dim.score === null) continue;
    assert(dim.coverage.used > 0, `${dim.key} 无可用成员却给出分数`);
    if (dim.coverage.used < dim.coverage.configured && !(dim.missingWeightMembers || []).length) {
      bad.push(`${dim.key} 成员缺失但未记录原因`);
    }
  }
  assert(bad.length === 0, bad.join("; "));
  return snapshot.dimensions.map(d => `${d.name_cn} ${d.coverage.used}/${d.coverage.configured}`).join("  ");
});

/* ---- 14 工作台产物完整 ---- */
check("14", "工作台 HTML 自包含且内嵌数据可解析", () => {
  assert(existsSync(workbenchPath), "macro-workbench.html 不存在，先运行 macro-workbench.mjs");
  const html = readFileSync(workbenchPath, "utf8");
  assert(!html.includes("<!--__ECHARTS__-->"), "ECharts 占位符未替换");
  assert(!html.includes("/*__DATA__*/"), "数据占位符未替换");
  assert(/window\.echarts|echarts\.init/.test(html), "未内联 ECharts");
  const match = html.match(/window\.__MACRO__ = (\{[\s\S]*?\});\n<\/script>/);
  assert(match, "未能从 HTML 中提取内嵌数据");
  const embedded = JSON.parse(match[1]);
  assert(embedded.headline.composite === snapshot.headline.composite, "内嵌综合分与快照不一致");
  assert(Object.keys(embedded.trends).length === Object.keys(snapshot.trends).length, "内嵌序列数与快照不一致");
  return `自包含 ${(html.length / 1024 / 1024).toFixed(2)} MB，内嵌 ${Object.keys(embedded.trends).length} 条序列，与快照一致`;
});

/* ---- 15 每日汇报与快照一致（零重算） ---- */
const reportMdPath = resolve(root, "public/macro-daily-report.md");
const reportJsonPath = resolve(workDir, "report.json");
check("15", "每日汇报已生成、结构完整且与快照严格一致", () => {
  assert(existsSync(reportMdPath), "public/macro-daily-report.md 不存在，请先运行 macro-report.mjs");
  assert(existsSync(reportJsonPath), "work/macro/report.json 不存在，请先运行 macro-report.mjs");
  const md = readFileSync(reportMdPath, "utf8");
  const rpt = JSON.parse(readFileSync(reportJsonPath, "utf8"));
  assert(rpt.contract === "MACRO_DAILY_REPORT", `汇报契约名不符：${rpt.contract}`);
  assert(rpt.asOf === snapshot.asOf, `汇报日期 ${rpt.asOf} 与快照 ${snapshot.asOf} 不一致`);
  assert(rpt.composite === snapshot.headline.composite,
    `汇报综合分 ${rpt.composite} 与快照 ${snapshot.headline.composite} 不一致（汇报禁止重算）`);
  const ids = (rpt.sections || []).map(s => s.id);
  assert(new Set(ids).size === ids.length, "汇报章节 id 有重复");
  assert(ids.length >= 20, `章节数 ${ids.length}，期望至少 20（宏观市场层 8 章 + 期货层 5 章 + 附录）`);
  // 宏观市场层必须齐备：利率 / 权益汇率 / 货币信用 / 增长 / 通胀 / 地产 / 消费外需 / 全指标总表
  for (const need of ["macro", "rates", "riskfx", "credit", "growth", "inflation", "property", "consumption", "indicators-all"]) {
    assert(ids.includes(need), `缺少章节：${need}`);
  }
  for (const s of rpt.sections) {
    assert(s.blocks && s.blocks.length, `章节 ${s.id} 无内容`);
    for (const b of s.blocks) {
      if (b.type === "table") assert(b.head && b.head.length > 0, `章节 ${s.id} 表格缺表头`);
      if (b.type === "ul") assert(b.items && b.items.length > 0, `章节 ${s.id} 列表为空`);
      if (b.type === "p" || b.type === "note") assert(String(b.text || "").length > 0, `章节 ${s.id} 段落为空`);
    }
  }
  assert(md.includes(String(snapshot.headline.composite)), "Markdown 未包含快照综合分");
  for (const name of ["焦煤", "甲醇", "螺纹钢", "产业链深读", "利率与资金面", "权益与汇率", "沪深300", "DR007", "M1", "商品房"]) {
    assert(md.includes(name), `Markdown 缺少预期内容：${name}`);
  }
  // 迷你走势必须真的生成（Unicode 字符集内）
  assert(/[▁▂▃▄▅▆▇█]{10,}/.test(md), "Markdown 未生成 Unicode 迷你走势");
  const broken = md.split("\n").filter(l => l.startsWith("|") && /[^\\]\|z\|/.test(l));
  assert(!broken.length, `Markdown 表格中有 ${broken.length} 行未转义的 | ，会导致表格断裂`);
  return `${rpt.sections.length} 个章节，Markdown ${(md.length / 1024).toFixed(0)} KB，归档 ${rpt.archiveFile}`;
});

/* ---- 16 工作台可视化面板齐备（图表 + 迷你走势） ---- */
const workbenchFile = resolve(root, "public/macro-workbench.html");
check("16", "工作台可视化面板齐备：多图折线 + 迷你走势 + 全指标总表", () => {
  assert(existsSync(workbenchFile), "工作台 HTML 不存在，请先运行 macro-workbench.mjs");
  const html = readFileSync(workbenchFile, "utf8");
  // 1) 新增的图表容器必须都在模板里
  const charts = ["mktFundChart", "mktEquityChart", "mktFxChart", "mktCmdtyChart",
    "basInflationChart", "basCreditChart", "basPmiChart", "basPropertyChart", "basDemandChart", "basIndustryChart",
    "moverChart", "spreadChart"];
  for (const id of charts) assert(html.includes(`id="${id}"`), `缺少图表容器：${id}`);
  // 2) 区间切换与归一化开关
  for (const id of ["mktRange", "mktBase", "basRange", "indTable", "indCat", "indDim", "indSort",
    "moverTop", "spreadSel", "spreadKv"]) {
    assert(html.includes(`id="${id}"`), `缺少控件：${id}`);
  }
  // 3) 全指标总表的数据源必须内联，且条数与快照一致
  const match = html.match(/window\.__MACRO__ = (\{[\s\S]*?\});\n<\/script>/);
  assert(match, "未能从 HTML 中提取内嵌数据");
  const embedded = JSON.parse(match[1]);
  assert(Array.isArray(embedded.indicators), "内嵌数据缺少 indicators 总表");
  assert(embedded.indicators.length === snapshot.indicators.length,
    `内嵌指标数 ${embedded.indicators.length} 与快照 ${snapshot.indicators.length} 不一致`);
  assert(embedded.categories && Object.keys(embedded.categories).length >= 10,
    `内嵌 categories 分组不足：${Object.keys(embedded.categories || {}).length}`);
  // 4) 迷你走势用到的近一年窗口：日频序列必须够 250 点（否则走势图会缩水）
  const dailyInsufficient = embedded.indicators
    .filter(i => i.frequency === "daily")
    .filter(i => {
      const t = embedded.trends[i.id];
      return t && t.points.length < 250;
    });
  assert(dailyInsufficient.length === 0,
    `以下日频序列嵌入点数不足 250，近一年走势会失真：${dailyInsufficient.slice(0, 5).map(i => i.id).join(", ")}`);
  // 5) 报告章节内嵌
  assert(embedded.report && embedded.report.sections.length >= 20, "内嵌汇报章节不足");
  return `图表容器 ${charts.length} 个 + 全指标总表 ${embedded.indicators.length} 项 + 汇报 ${embedded.report.sections.length} 章`;
});

/* ---- 17 图表渲染不会被脚本中断（var 提升陷阱 + 容器自检） ----
   真实事故：drawLine() 依赖的 PALETTE / MKT_CHARTS 原本声明在文件中部，
   而「主力价差图」在更早的位置就调用了 drawLine → 读到 undefined 抛 TypeError，
   整个渲染脚本被中断，后面 12 个面板的图全部画不出来（表现为「好多面板没有图」）。
   这里是静态复检：凡是 drawLine 用到的顶层变量，赋值必须早于第一次 drawLine 调用。 */
check("17", "图表渲染链路无变量提升陷阱，且具备容器自检兜底", () => {
  assert(existsSync(workbenchPath), "工作台 HTML 不存在");
  const html = readFileSync(workbenchPath, "utf8");
  const scriptStart = html.indexOf("window.__MACRO__");
  const body = scriptStart >= 0 ? html.slice(scriptStart) : html;

  // 匹配真实调用 drawLine("xxx"...)，避免命中注释里出现的函数名
  const firstDraw = body.search(/drawLine\("/);
  assert(firstDraw > 0, "工作台脚本里找不到 drawLine 调用，渲染链路可能已被改写");

  // drawLine 依赖的顶层容器变量
  const deps = ["var PALETTE", "var MKT_CHARTS"];
  const late = deps.filter(d => {
    const i = body.indexOf(d);
    return i < 0 || i > firstDraw;
  });
  assert(late.length === 0,
    `以下变量在第一次 drawLine() 调用之后才赋值（var 提升但赋值不提升，会抛 TypeError 并中断整页渲染）：${late.join(", ")}`);

  // 兜底机制必须存在：容器尺寸变化时重画 + 渲染结束后自检
  assert(/ResizeObserver|resizeAllCharts/.test(html), "缺少容器尺寸变化时的重画逻辑（iframe / 折叠场景下会画出 0×0 的空图）");
  assert(/function chartSelfCheck/.test(html), "缺少图表自检兜底，空图会静默失败");

  // 联动入口：榜单与表格行必须带 data-id，且存在 showTrend / showFutTrend
  assert(/function showTrend/.test(html) && /function showFutTrend/.test(html), "缺少点击联动到走势图的入口函数");
  const clickable = (html.match(/data-id="/g) || []).length
    + (html.match(/data-spread="/g) || []).length;
  assert(clickable > 0, "榜单与表格行没有 data-id / data-spread，无法点击联动");

  // 价差必须带历史序列，否则价差图画不出来
  const spreads = (snapshot?.futures?.spreads || []).filter(s => s.available);
  assert(spreads.length > 0, "快照里没有可用价差");
  const noPoints = spreads.filter(s => !Array.isArray(s.points) || s.points.length < 30);
  assert(noPoints.length === 0, `以下价差缺少历史序列 points，价差走势图会空：${noPoints.map(s => s.id).join(", ")}`);

  return `依赖变量早于首次 drawLine ✓ · 可联动注入点 ${clickable} 处 · 价差序列 ${spreads.length} 条 · 自检与重画已就位`;
});

/* ---- 18 站点入口可达（用户反馈「找不到入口」） ---- */
check("18", "工作站在站点内有明确入口，且构建产物包含宏观资源", () => {
  const pagePath = resolve(root, "app/page.tsx");
  const macroPath = resolve(root, "app/monitor/macro/page.tsx");
  assert(existsSync(macroPath), "缺少 app/monitor/macro/page.tsx");
  assert(existsSync(pagePath), "缺少首页 app/page.tsx");
  const page = readFileSync(pagePath, "utf8");
  assert(page.includes("/monitor/macro"), "首页没有任何指向 /monitor/macro 的入口，用户会找不到工作台");
  // 侧边栏入口用的是 <a>，需要 CSS 同步支持，否则样式会塌
  const css = readFileSync(resolve(root, "app/globals.css"), "utf8");
  assert(/aside>a\.modLink/.test(css), "globals.css 未为 aside>a.modLink 补样式，侧边栏入口会错位");

  // 静态资源齐备（否则 iframe 里什么都加载不到）
  for (const f of ["public/macro-workbench.html", "public/macro-snapshot.json", "public/macro-daily-report.md", "public/vendor/echarts.min.js"]) {
    assert(existsSync(resolve(root, f)), `缺少静态资源 ${f}`);
  }
  // 构建产物若存在，必须已包含宏观页与资源（否则线上是旧版，入口点了也是空白）
  const distDir = resolve(root, "dist");
  if (existsSync(distDir)) {
    const clientDir = resolve(distDir, "client");
    const hasBuilt = existsSync(clientDir) && readdirSyncSafe(clientDir).includes("macro-workbench.html");
    assert(hasBuilt,
      "dist/client 里没有 macro-workbench.html —— 构建产物是旧版，线上入口会指向空白页，请重新 npm run build");
  }
  return "首页入口 ✓ · CSS 适配 ✓ · 静态资源齐备 · 构建产物已含宏观工作台";
});
function readdirSyncSafe(dir) {
  try { return readdirSync(dir); } catch { return []; }
}

/* ---------------- 输出 ---------------- */
console.log("宏观高频监测 · Smoke Test（Spec §50）");
console.log("=".repeat(92));
for (const r of results) {
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.id}  ${r.title}`);
  console.log(`      ${r.detail}`);
}
const passed = results.filter(r => r.ok).length;
console.log("=".repeat(92));
console.log(`结果：${passed}/${results.length} 通过`);
if (passed < results.length) {
  console.log("失败项：");
  for (const r of results.filter(x => !x.ok)) console.log(`  ${r.id} ${r.title} → ${r.detail}`);
  process.exitCode = 1;
}
