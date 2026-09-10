export type EvidenceKind = "OBS" | "INF" | "RULE" | "HEUR" | "HYP" | "CHECK";

export const evidenceLabels: Record<EvidenceKind, { label: string; detail: string }> = {
  OBS: { label: "事实", detail: "可回溯到数据、文件或原始记录" },
  INF: { label: "推断", detail: "由事实经明确逻辑推导，仍可能被反证" },
  RULE: { label: "规则", detail: "系统内固定的分类或执行协议" },
  HEUR: { label: "经验", detail: "提高效率的近似，不等同于客观真理" },
  HYP: { label: "假设", detail: "尚未被充分证实的解释" },
  CHECK: { label: "待验", detail: "缺少时间戳、口径或交叉来源" },
};

export const navItems = [
  { id: "desk", label: "今日决策台", short: "01" },
  { id: "system", label: "统一框架", short: "02" },
  { id: "lab", label: "叙事实验室", short: "03" },
  { id: "map", label: "主题地图", short: "04" },
  { id: "library", label: "资料库", short: "05" },
  { id: "ask", label: "使用手册", short: "06" },
] as const;

export type SectionId = (typeof navItems)[number]["id"];

export const workflow = [
  { id: 1, title: "渗透深度", question: "行情能走多大？", input: "成交扩散 / 叙事导通", output: "深度等级", evidence: "RULE" as EvidenceKind },
  { id: 2, title: "流动性分布", question: "钱在哪里？", input: "头部成交额 / 生长树", output: "T0–T3", evidence: "OBS" as EvidenceKind },
  { id: 3, title: "升贴水状态", question: "价格离时序锚多远？", input: "Price vs MA20", output: "四状态", evidence: "HEUR" as EvidenceKind },
  { id: 4, title: "基本面评估", question: "叙事能否走通？", input: "规模久期 / PB→D/P", output: "导通率", evidence: "INF" as EvidenceKind },
  { id: 5, title: "价格结构", question: "走势走到哪一步？", input: "量价 / Rank / 结构", output: "阶段", evidence: "INF" as EvidenceKind },
  { id: 6, title: "Gamma 校准", question: "现在该进攻还是防守？", input: "R0 / 流动性 / 冲突", output: "0 / 1", evidence: "RULE" as EvidenceKind },
  { id: 7, title: "仓位管理", question: "错了最多亏多少？", input: "Kelly / R / ATR", output: "风险预算", evidence: "RULE" as EvidenceKind },
  { id: 8, title: "行为校正", question: "判断被什么扭曲？", input: "偏差 / 反证 / 情绪", output: "复核结论", evidence: "RULE" as EvidenceKind },
];

export const pipeline = [
  { key: "source", label: "信号接收", detail: "数字信号 + 模拟信号", guardrail: "只接收、分类、路由" },
  { key: "ob", label: "OB 客观层", detail: "宏观 / 中观 / 微观", guardrail: "不注入判断" },
  { key: "tb", label: "TB 评估层", detail: "即期 × 远期交叉", guardrail: "不发明事实" },
  { key: "protocol", label: "个人协议", detail: "仓位 / Gamma / 行为", guardrail: "不篡改分析逻辑" },
  { key: "output", label: "行动输出", detail: "观察 / 验证 / 执行", guardrail: "保留证据与反证" },
];

export const systemLayers = [
  { code: "L1", title: "数据层", detail: "行情、财务、宏观、产业、资金", test: "来源 / 时点 / 频率 / 口径" },
  { code: "L2", title: "状态层", detail: "Regime、三因子、流动性、广度", test: "现在是什么环境？" },
  { code: "L3", title: "叙事层", detail: "点燃、传播、冲突、生命周期", test: "市场在交易什么？" },
  { code: "L4", title: "结构层", detail: "中短基线、四区间、四象限、Rank", test: "偏离和结构在哪里？" },
  { code: "L5", title: "执行层", detail: "候选、触发、仓位、退出、日历", test: "如何把判断变成风险？" },
  { code: "L6", title: "复盘层", detail: "结果对账、偏差、漂移、规则更新", test: "哪里错了，如何回写？" },
];

export const regimeFactors = [
  { title: "总量分母", detail: "利率 · 流动性 · 风险偏好", use: "决定估值与系统风险" },
  { title: "总量分子", detail: "宏观增长 · 全市场盈利", use: "决定整体盈利方向" },
  { title: "结构分子", detail: "行业景气 · 订单 · 产能", use: "决定超额收益来源" },
];

export const marketZones = [
  { id: "I", title: "贴水修复", detail: "贴水 → 正常", focus: "低熵核心先止跌，弹性随后" },
  { id: "II", title: "正常失序", detail: "资金重新分配", focus: "识别结构与主导车道" },
  { id: "III", title: "一致扩散", detail: "正常 → 高升水", focus: "核心稳定，后排只做弹性" },
  { id: "IV", title: "高波回归", detail: "升水回落", focus: "收缩高熵，回到中期锚" },
];

export const atomicGrid = [
  { domain: "基本面", axis: "存量", atom: "供需", question: "空间有多大？", tone: "amber" },
  { domain: "基本面", axis: "矢量", atom: "因果", question: "能不能到达？", tone: "amber" },
  { domain: "技术面", axis: "存量", atom: "量", question: "多少能量在流动？", tone: "cyan" },
  { domain: "技术面", axis: "矢量", atom: "价", question: "朝哪个方向流？", tone: "cyan" },
];

export const tools = [
  { code: "T-01", title: "市场温度", subtitle: "单指标观测", modes: ["前10指数", "全A量能", "上涨家数"], answer: "环境是什么？" },
  { code: "T-02", title: "二代机 Rank", subtitle: "横截面秩序雷达", modes: ["NAV 曲线", "异动矩阵"], answer: "发现候选，不替代决策" },
  { code: "T-03", title: "生长树", subtitle: "成交额空间结构", modes: ["头部锚点", "梯度分布"], answer: "钱在哪里？" },
];

export const motherModel = [
  { code: "DISCOVER", title: "候选发现", detail: "谁可能出现更有利的未来价格路径", boundary: "Rank / 结构信号" },
  { code: "CLASSIFY", title: "状态分类", detail: "贴水、平水、升水与秩序阶段", boundary: "价格 / 流动性 / 叙事" },
  { code: "BUDGET", title: "仓位与退出", detail: "错误时最多亏多少，正确时如何继续持有", boundary: "风险预算 / 执行" },
  { code: "EVALUATE", title: "结果评价", detail: "是否形成正期望与正向非对称分布", boundary: "回测 / 复盘" },
];

export const quadrants = [
  { id: "A", title: "双端导通", current: "强", future: "强", action: "持有并监控升水", risk: "拥挤与估值透支", tone: "positive" },
  { id: "B", title: "即期繁荣", current: "强", future: "弱", action: "验证兑现，限制仓位", risk: "远期导通断裂", tone: "warning" },
  { id: "C", title: "预期差", current: "弱", future: "强", action: "贴水观察，分段验证", risk: "基本面迟迟不兑现", tone: "focus" },
  { id: "D", title: "双端断裂", current: "弱", future: "弱", action: "不参与或仅做流动性", risk: "纯情绪博弈", tone: "muted" },
];

export const stages = [
  { id: "潜伏", r0: "≈1", liquidity: "T2", structure: "贴水 / 初始扩散", action: "建立观察仓，先写反证" },
  { id: "爆发", r0: ">1", liquidity: "T2→T1", structure: "扩散 / 加速", action: "持有，让事实继续验证" },
  { id: "达峰", r0: "β≈γ", liquidity: "T0/T1", structure: "高升水 / 背离", action: "兑现，回收波动率利润" },
  { id: "衰退", r0: "<1", liquidity: "T1→T3", structure: "传播衰减", action: "离场，等待新因果链" },
];

export const narrativeContract = [
  { code: "CLAIM", title: "主张", detail: "单变量、带时间边界、可以被证伪" },
  { code: "DATA", title: "数据", detail: "具体可观察读数，保留来源与口径" },
  { code: "WARRANT", title: "传导", detail: "payer → reason → budget → landing" },
  { code: "BACKING", title: "支撑", detail: "行业锚、公司锚与估值协议" },
  { code: "REBUTTAL", title: "反证", detail: "最强反例、边界和验证时间表" },
];

export const carrierPorts = [
  { title: "报表接口", detail: "变化能落入收入/利润，且不被存量业务淹没" },
  { title: "价格接口", detail: "价格方差可分离，未被影子资产或事件污染" },
  { title: "归因接口", detail: "利润变化能闭合归因到这条 Claim" },
  { title: "证伪接口", detail: "正反证对称，窗口内存在可观察的认错线" },
];

export const capabilityCards = [
  { code: "OBSERVE", title: "日度复盘", text: "把行情事实按宏观—中观—微观拆开，标明时间、口径与来源。" },
  { code: "NARRATIVE_SCAN", title: "叙事扫描", text: "画出催化→预期→数据→价格链，定位传播阶段与冲突。" },
  { code: "STAGE_CHECK", title: "阶段判断", text: "用 R0、流动性、量价与导通深度做规则化状态判断。" },
  { code: "TICKER_CONTEXT", title: "个股上下文", text: "把公司放回产业链、风格、成交层级和估值导通位置。" },
  { code: "THESIS_TEST", title: "论点检验", text: "区分事实、推断与假设，主动寻找最强反证和失效条件。" },
  { code: "RISK_PROTOCOL", title: "风险协议", text: "把观点翻译成风险预算、仓位上限、止损逻辑与复核时间。" },
];

export const promptTemplates = [
  {
    title: "收盘复盘",
    mode: "OBSERVE",
    prompt: "按 OB→TB→Protocol 三层复盘今天 A 股。先列带时间戳的事实，再给推断；检查宏观、中观、微观是否一致，并列出明日需要验证的 3 个信号。",
  },
  {
    title: "叙事扫描",
    mode: "NARRATIVE_SCAN",
    prompt: "扫描【主题】当前叙事：给出催化→预期→订单/收入→利润→分配的导通链，判断 R0、阶段、价格冲突、下一节点和最强反证。",
  },
  {
    title: "个股定位",
    mode: "TICKER_CONTEXT",
    prompt: "对【代码/公司】做 TICKER_CONTEXT：定位宏观与行业叙事、流动性阶层、Rank/量价状态、PB→PS→PE→D/P 导通深度，并把证据分为事实/推断/假设。",
  },
  {
    title: "持仓体检",
    mode: "THESIS_TEST",
    prompt: "检验我的持仓论点【粘贴论点】。不要迎合我：找出隐含假设、最强反证、数据缺口、触发减仓/退出的条件，并给出下一次复核时间。",
  },
];

export const sourceSnapshots = [
  { name: "Welkin-Agent 完整框架", version: "v260317d", date: "2026-03-18", scope: "53 条目 / 3 工具 / 7 模式", status: "已结构化" },
  { name: "交易母模型与 Rank 审计", version: "260730", date: "2026-07-30", scope: "候选 / 状态 / 风险 / 评价分层", status: "已归并" },
  { name: "宏观—中观—微观映射", version: "260424", date: "2026-04-24", scope: "15+1 宏观桶 / 76 中观挂载 / 988 源代码", status: "历史快照" },
  { name: "Nexus 产业叙事框架", version: "资料库版本", date: "未标注", scope: "7 层 / 4 模式 / 6 阶段", status: "已归并" },
];

export const qualityRules = [
  "每条市场数据必须同时保存来源、时间戳、单位与口径。",
  "同一指标冲突时不平均：先核对交易日、复权、样本池与更新时间。",
  "实时数据不可得时明确写“未连接”，绝不拿历史快照冒充实时。",
  "结论必须能回指事实；交易规则必须附失效条件与风险预算。",
];
