"use client";

import { useEffect, useMemo, useState } from "react";
import {
  atomicGrid,
  capabilityCards,
  carrierPorts,
  evidenceLabels,
  navItems,
  narrativeContract,
  pipeline,
  regimeFactors,
  promptTemplates,
  quadrants,
  qualityRules,
  sourceSnapshots,
  stages,
  systemLayers,
  marketZones,
  motherModel,
  tools,
  workflow,
  type EvidenceKind,
  type SectionId,
} from "./framework-data";

type Stock = { name: string; code: string; tier: string; sourceIssue?: string };
type Meso = { name: string; stocks: Stock[] };
type Macro = { name: string; mesos: Meso[] };
type MacroQuality = {
  assignedMacroThemes: number;
  unassignedBuckets: number;
  mesoMemberships: number;
  uniqueMesoNames: number;
  validExplicitRows: number;
  uniqueExplicitRelations: number;
  nonEmptySourceCodes: number;
  sourceDeclaredMemberships: number;
  omittedBySourceTruncation: number;
  explicitCoveragePct: number;
};
type MacroMap = { source: string; date: string; macros: Macro[]; quality?: MacroQuality };

type LibraryItem = {
  path: string;
  type: string;
  size?: number;
  domain: string;
  summary?: string;
  secretPresent?: boolean;
};
type LibraryIndex = {
  generatedAt: string;
  totalFiles: number;
  totalDirectories: number;
  totalBytes: number;
  coverage: string;
  items: LibraryItem[];
};

const nf = new Intl.NumberFormat("zh-CN");
const SHANGHAI_TIME_ZONE = "Asia/Shanghai";

type DateInfo = { key: string; label: string };
type DeskState = { dateKey: string; checked: number[]; journal: string; ready: boolean };

function getShanghaiDateInfo(now = new Date()): DateInfo {
  return {
    key: new Intl.DateTimeFormat("sv-SE", {
      timeZone: SHANGHAI_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now),
    label: new Intl.DateTimeFormat("zh-CN", {
      timeZone: SHANGHAI_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
    }).format(now),
  };
}

function readDeskState(dateKey: string): DeskState {
  try {
    const saved = window.localStorage.getItem(`matt-desk:${dateKey}`);
    if (!saved) return { dateKey, checked: [], journal: "", ready: true };
    const payload = JSON.parse(saved) as { checked?: number[]; journal?: string };
    return {
      dateKey,
      checked: Array.isArray(payload.checked) ? payload.checked : [],
      journal: typeof payload.journal === "string" ? payload.journal : "",
      ready: true,
    };
  } catch {
    return { dateKey, checked: [], journal: "", ready: true };
  }
}

function formatIndexTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: SHANGHAI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function EvidencePill({ kind }: { kind: EvidenceKind }) {
  return (
    <span className={`evidence-pill evidence-${kind.toLowerCase()}`} title={evidenceLabels[kind].detail}>
      {kind} · {evidenceLabels[kind].label}
    </span>
  );
}

function formatBytes(value?: number) {
  if (!value) return "—";
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${value} B`;
}

function SectionHeading({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return (
    <div className="section-heading">
      <span className="eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      <p>{copy}</p>
    </div>
  );
}

export default function TradingOS() {
  const [section, setSection] = useState<SectionId>("desk");
  const [dateInfo, setDateInfo] = useState<DateInfo>(() => getShanghaiDateInfo());
  const [desk, setDesk] = useState<DeskState>(() => ({
    dateKey: getShanghaiDateInfo().key,
    checked: [],
    journal: "",
    ready: false,
  }));
  const [macroMap, setMacroMap] = useState<MacroMap | null>(null);
  const [mapError, setMapError] = useState(false);
  const [selectedMacro, setSelectedMacro] = useState("");
  const [selectedMeso, setSelectedMeso] = useState("");
  const [themeQuery, setThemeQuery] = useState("");
  const [library, setLibrary] = useState<LibraryIndex | null>(null);
  const [libraryError, setLibraryError] = useState(false);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [libraryDomain, setLibraryDomain] = useState("全部");
  const [currentSignal, setCurrentSignal] = useState("weak");
  const [futureSignal, setFutureSignal] = useState("strong");
  const [liquidity, setLiquidity] = useState("T2");
  const [premium, setPremium] = useState("discount-recover");
  const [alignment, setAlignment] = useState("partial");
  const [copied, setCopied] = useState("");

  const checked = desk.checked;
  const journal = desk.journal;
  const libraryLoading = section === "library" && !library && !libraryError;

  useEffect(() => {
    // Loading browser-only persistence after hydration is intentional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDesk(readDeskState(dateInfo.key));
  }, [dateInfo.key]);

  useEffect(() => {
    if (!desk.ready) return;
    try {
      window.localStorage.setItem(
        `matt-desk:${desk.dateKey}`,
        JSON.stringify({ checked: desk.checked, journal: desk.journal }),
      );
    } catch {
      // Private browsing or a full quota should not break the research UI.
    }
  }, [desk]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = getShanghaiDateInfo();
      setDateInfo((current) => current.key === next.key ? current : next);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    fetch("/data/macro-map.json")
      .then((response) => {
        if (!response.ok) throw new Error("macro map unavailable");
        return response.json() as Promise<MacroMap>;
      })
      .then((data) => {
        setMacroMap(data);
        setSelectedMacro(data.macros[0]?.name ?? "");
      })
      .catch(() => setMapError(true));
  }, []);

  useEffect(() => {
    if (section !== "library" || library) return;
    fetch("/data/library-index.json")
      .then((response) => {
        if (!response.ok) throw new Error("library index unavailable");
        return response.json() as Promise<LibraryIndex>;
      })
      .then((data) => {
        setLibrary(data);
        setLibraryError(false);
      })
      .catch(() => setLibraryError(true));
  }, [library, section]);

  const selectedMacroData = useMemo(
    () => macroMap?.macros.find((item) => item.name === selectedMacro) ?? null,
    [macroMap, selectedMacro],
  );

  const selectedMesoData = useMemo(
    () => selectedMacroData?.mesos.find((item) => item.name === selectedMeso) ?? null,
    [selectedMacroData, selectedMeso],
  );

  const mapTotals = useMemo(() => {
    if (!macroMap) return { mesos: 0, rows: 0, stocks: 0 };
    const allStocks = macroMap.macros.flatMap((macro) => macro.mesos.flatMap((meso) => meso.stocks));
    return {
      mesos: macroMap.macros.reduce((sum, macro) => sum + macro.mesos.length, 0),
      rows: allStocks.length,
      stocks: new Set(allStocks.map((stock) => stock.code)).size,
    };
  }, [macroMap]);

  const themeMatches = useMemo(() => {
    if (!macroMap) return [];
    const query = themeQuery.trim().toLowerCase();
    const baseMacros = query
      ? macroMap.macros
      : selectedMacroData
        ? [selectedMacroData]
        : macroMap.macros.slice(0, 1);
    const rows = baseMacros.flatMap((macro) =>
      macro.mesos.flatMap((meso) =>
        meso.stocks.map((stock) => ({ ...stock, macro: macro.name, meso: meso.name })),
      ),
    );
    const narrowed = selectedMesoData && !query
      ? selectedMesoData.stocks.map((stock) => ({ ...stock, macro: selectedMacroData?.name ?? "", meso: selectedMesoData.name }))
      : rows;
    if (!query) return narrowed.slice(0, 80);
    return narrowed
      .filter((row) => `${row.name} ${row.code} ${row.macro} ${row.meso} ${row.tier} ${row.sourceIssue ?? ""}`.toLowerCase().includes(query))
      .slice(0, 100);
  }, [macroMap, selectedMacroData, selectedMesoData, themeQuery]);

  const libraryDomains = useMemo(
    () => ["全部", ...Array.from(new Set((library?.items ?? []).map((item) => item.domain))).sort()],
    [library],
  );

  const libraryMatches = useMemo(() => {
    const query = libraryQuery.trim().toLowerCase();
    return (library?.items ?? [])
      .filter((item) => libraryDomain === "全部" || item.domain === libraryDomain)
      .filter((item) => !query || `${item.path} ${item.summary ?? ""} ${item.type}`.toLowerCase().includes(query))
      .slice(0, 120);
  }, [library, libraryDomain, libraryQuery]);

  const quadrantId = currentSignal === "strong"
    ? futureSignal === "strong" ? "A" : "B"
    : futureSignal === "strong" ? "C" : "D";
  const quadrant = quadrants.find((item) => item.id === quadrantId)!;

  const stage = useMemo(() => {
    if (liquidity === "T3" || (currentSignal === "weak" && futureSignal === "weak")) return stages[3];
    if (currentSignal === "strong" && (futureSignal === "weak" || liquidity === "T0")) return stages[2];
    if (currentSignal === "strong") return stages[1];
    return stages[0];
  }, [currentSignal, futureSignal, liquidity]);

  const actionSummary = useMemo(() => {
    const premiumText: Record<string, string> = {
      "premium-expand": "升水扩张",
      "premium-narrow": "升水收窄",
      "discount-expand": "贴水扩张",
      "discount-recover": "贴水收窄",
    };
    const alignmentText: Record<string, string> = {
      full: "三层一致",
      partial: "部分一致",
      conflict: "层级冲突",
    };
    return `${quadrant.id} 类「${quadrant.title}」 · ${stage.id}期 · ${premiumText[premium]} · ${alignmentText[alignment]}`;
  }, [alignment, premium, quadrant, stage]);

  const executionGuidance = useMemo(() => {
    if (alignment === "conflict") return "层级冲突：只观察，或使用一级风险预算";
    if (premium === "premium-expand" && (quadrant.id === "B" || stage.id === "达峰")) return "高升水叠加脆弱远期：优先兑现，不追价";
    if (premium === "premium-narrow") return "升水收窄：收紧退出线并复核资金承接";
    if (premium === "discount-expand") return "贴水仍在扩张：等待止跌与流动性确认";
    if (premium === "discount-recover" && quadrant.id === "C") return "贴水开始修复：允许分段验证，不一次押满";
    return quadrant.action;
  }, [alignment, premium, quadrant, stage]);

  const toggleStep = (id: number) => {
    setDesk((value) => ({
      ...value,
      checked: value.checked.includes(id)
        ? value.checked.filter((item) => item !== id)
        : [...value.checked, id],
    }));
  };

  const copyPrompt = async (title: string, prompt: string) => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(title);
    } catch {
      setCopied(`error:${title}`);
    }
    window.setTimeout(() => setCopied(""), 1600);
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setSection("desk")} aria-label="回到今日决策台">
          <span className="brand-mark">M</span>
          <span>
            <strong>MATT</strong>
            <small>A-SHARE INTELLIGENCE</small>
          </span>
        </button>

        <nav aria-label="主导航">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={section === item.id ? "nav-item active" : "nav-item"}
              onClick={() => setSection(item.id)}
            >
              <span>{item.short}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="status-line"><i /> 私有研究工作区</div>
          <p>核心 v260317d</p>
          <p>方法归并至 2026-07-30</p>
          <p>市场映射 2026-04-24</p>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div>
            <span className="topbar-label">DECISION SYSTEM</span>
            <strong>{navItems.find((item) => item.id === section)?.label}</strong>
          </div>
          <div className="topbar-meta">
            <span>{dateInfo.label}</span>
            <span className="data-state"><i /> 资料快照 · 非实时行情</span>
          </div>
        </header>

        <main>
          {section === "desk" && (
            <section className="page-section">
              <div className="hero-grid">
                <div className="hero-copy">
                  <span className="eyebrow">PRIVATE A-SHARE RESEARCH OS</span>
                  <h1>从事实到仓位，<br /><em>每一步都能回溯。</em></h1>
                  <p>把宏观、中观、微观、叙事、量价与风控放进同一条信号管道。先看到什么，再判断什么，最后才决定怎么做。</p>
                  <div className="hero-actions">
                    <button className="primary-button" onClick={() => setSection("lab")}>开始一次状态判断 <span>→</span></button>
                    <button className="text-button" onClick={() => setSection("system")}>查看完整方法论</button>
                  </div>
                </div>
                <div className="hero-console">
                  <div className="console-head"><span>SYSTEM / SOURCE STATUS</span><span className="live-dot">READY</span></div>
                  <div className="console-grid">
                    <div><strong>53</strong><span>知识条目</span></div>
                    <div><strong>3 / 7</strong><span>工具 / 模式</span></div>
                    <div><strong>8,707</strong><span>已盘点资料文件</span></div>
                    <div><strong>988</strong><span>源文件非空代码</span></div>
                  </div>
                  <div className="console-rule">
                    <span>OB</span><b>不注入判断</b>
                    <span>TB</span><b>不发明事实</b>
                    <span>执行</span><b>不篡改逻辑</b>
                  </div>
                </div>
              </div>

              <div className="desk-grid">
                <article className="panel workflow-panel">
                  <div className="panel-head">
                    <div><span className="panel-index">01</span><h2>每日八步协议</h2></div>
                    <span className="completion">{checked.length}/8 完成</span>
                  </div>
                  <div className="progress-track"><i style={{ width: `${(checked.length / 8) * 100}%` }} /></div>
                  <div className="workflow-list">
                    {workflow.map((step) => {
                      const done = checked.includes(step.id);
                      return (
                        <button key={step.id} className={done ? "workflow-row done" : "workflow-row"} onClick={() => toggleStep(step.id)}>
                          <span className="check-box">{done ? "✓" : step.id.toString().padStart(2, "0")}</span>
                          <span className="workflow-main"><strong>{step.title}</strong><small>{step.question}</small></span>
                          <span className="workflow-input">{step.input}</span>
                          <EvidencePill kind={step.evidence} />
                        </button>
                      );
                    })}
                  </div>
                </article>

                <div className="desk-side">
                  <article className="panel note-panel">
                    <div className="panel-head"><div><span className="panel-index">02</span><h2>今日观察</h2></div><span className="local-badge">仅存本机</span></div>
                    <textarea
                      value={journal}
                      onChange={(event) => setDesk((value) => ({ ...value, journal: event.target.value }))}
                      placeholder="先写事实，再写推断。&#10;&#10;事实：时间 / 来源 / 数值 / 口径&#10;推断：机制 / 反证 / 下一验证点"
                      aria-label="今日观察笔记"
                    />
                    <p className="save-hint">自动保存在当前浏览器，不上传资料库。</p>
                  </article>
                  <article className="panel data-contract">
                    <div className="panel-head"><div><span className="panel-index">03</span><h2>精确性契约</h2></div></div>
                    <ul>
                      {qualityRules.map((rule, index) => <li key={rule}><span>0{index + 1}</span>{rule}</li>)}
                    </ul>
                  </article>
                </div>
              </div>
            </section>
          )}

          {section === "system" && (
            <section className="page-section">
              <SectionHeading eyebrow="UNIFIED FRAMEWORK" title="统一框架，不是观点拼盘" copy="Welkin 的信号管道、Nexus 的叙事链与统一的证据标签被放进同一套操作系统；冲突被显式保留，而不是被一句结论抹平。" />

              <div className="pipeline" aria-label="信号管道">
                {pipeline.map((item, index) => (
                  <div className="pipeline-node" key={item.key}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <strong>{item.label}</strong>
                    <p>{item.detail}</p>
                    <small>{item.guardrail}</small>
                  </div>
                ))}
              </div>

              <article className="panel system-stack-panel">
                <div className="panel-head"><div><span className="panel-index">OS</span><h2>六层交易操作系统</h2></div><span className="caption">数据 → 状态 → 叙事 → 结构 → 执行 → 复盘</span></div>
                <div className="system-stack">
                  {systemLayers.map((layer) => (
                    <div key={layer.code}><span>{layer.code}</span><strong>{layer.title}</strong><p>{layer.detail}</p><small>{layer.test}</small></div>
                  ))}
                </div>
              </article>

              <div className="split-grid regime-grid">
                <article className="panel">
                  <div className="panel-head"><div><span className="panel-index">STATE</span><h2>三因子状态锚</h2></div><EvidencePill kind="INF" /></div>
                  <div className="factor-list">
                    {regimeFactors.map((factor, index) => (
                      <div key={factor.title}><i>{index + 1}</i><span><strong>{factor.title}</strong><small>{factor.detail}</small></span><p>{factor.use}</p></div>
                    ))}
                  </div>
                  <p className="panel-note">总量决定风险与仓位上限，结构决定持仓方向；两者冲突时不得跨层偷换。</p>
                </article>
                <article className="panel">
                  <div className="panel-head"><div><span className="panel-index">ZONE</span><h2>中短基线四区间</h2></div><EvidencePill kind="RULE" /></div>
                  <div className="zone-grid">
                    {marketZones.map((zone) => (
                      <div key={zone.id}><span>{zone.id}</span><strong>{zone.title}</strong><small>{zone.detail}</small><p>{zone.focus}</p></div>
                    ))}
                  </div>
                </article>
              </div>

              <div className="split-grid">
                <article className="panel">
                  <div className="panel-head"><div><span className="panel-index">A</span><h2>四原子要素</h2></div><EvidencePill kind="RULE" /></div>
                  <div className="atomic-grid">
                    {atomicGrid.map((item) => (
                      <div key={`${item.domain}-${item.atom}`} className={`atomic-cell ${item.tone}`}>
                        <span>{item.domain} · {item.axis}</span><strong>{item.atom}</strong><p>{item.question}</p>
                      </div>
                    ))}
                  </div>
                  <p className="panel-note">资金、政策、情绪等指标被视为四原子的函数变换；这是体系内的建模选择，不是唯一真理。</p>
                </article>

                <article className="panel">
                  <div className="panel-head"><div><span className="panel-index">B</span><h2>三类观测工具</h2></div><EvidencePill kind="OBS" /></div>
                  <div className="tool-list">
                    {tools.map((tool) => (
                      <div key={tool.code} className="tool-card">
                        <span>{tool.code}</span><div><strong>{tool.title}</strong><small>{tool.subtitle}</small></div>
                        <p>{tool.modes.join(" · ")}</p><b>{tool.answer}</b>
                      </div>
                    ))}
                  </div>
                </article>
              </div>

              <article className="panel mother-model-panel">
                <div className="panel-head"><div><span className="panel-index">RISK</span><h2>正向非对称交易母模型</h2></div><span className="caption">四类职责必须分开</span></div>
                <div className="mother-model-grid">
                  {motherModel.map((item) => (
                    <div key={item.code}><span>{item.code}</span><strong>{item.title}</strong><p>{item.detail}</p><small>{item.boundary}</small></div>
                  ))}
                </div>
                <p className="panel-note">目标不是追逐单一高分，而是在左尾、流动性与执行风险受控的前提下，寻找正期望且上行不被机械封顶的机会。任何因子都不得同时充当候选、仓位和业绩评价。</p>
              </article>

              <article className="panel quadrant-panel">
                <div className="panel-head"><div><span className="panel-index">C</span><h2>即期 × 远期：冲突不被隐藏</h2></div><span className="caption">传播广度 R0 × 导通深度</span></div>
                <div className="quadrant-axis-label top">远期导通强 →</div>
                <div className="quadrant-grid">
                  {quadrants.map((item) => (
                    <div key={item.id} className={`quadrant-card ${item.tone}`}>
                      <span className="quad-letter">{item.id}</span>
                      <div><strong>{item.title}</strong><small>即期 {item.current} / 远期 {item.future}</small></div>
                      <p>{item.action}</p><em>主要风险：{item.risk}</em>
                    </div>
                  ))}
                </div>
                <div className="quadrant-axis-label bottom">注意：C 类“核心建仓区”是来源框架的规则映射，不是对任何标的的买入建议。</div>
              </article>

              <article className="panel evidence-panel">
                <div className="panel-head"><div><span className="panel-index">D</span><h2>统一证据语言</h2></div></div>
                <div className="evidence-grid">
                  {(Object.keys(evidenceLabels) as EvidenceKind[]).map((kind) => (
                    <div key={kind}><EvidencePill kind={kind} /><p>{evidenceLabels[kind].detail}</p></div>
                  ))}
                </div>
              </article>
            </section>
          )}

          {section === "lab" && (
            <section className="page-section">
              <SectionHeading eyebrow="NARRATIVE STATE LAB" title="把直觉压进可复核的状态机" copy="选择你观察到的信号，系统只做框架内映射。输出是研究起点，不是交易指令；真正执行前仍要补齐标的、价格、时间戳与风险预算。" />

              <div className="lab-grid">
                <article className="panel lab-controls">
                  <div className="panel-head"><div><span className="panel-index">INPUT</span><h2>状态输入</h2></div><EvidencePill kind="RULE" /></div>
                  <label><span>即期传播 / R0</span>
                    <select value={currentSignal} onChange={(event) => setCurrentSignal(event.target.value)}>
                      <option value="weak">弱：尚未形成广泛共识</option><option value="strong">强：传播与价格已确认</option>
                    </select>
                  </label>
                  <label><span>远期导通</span>
                    <select value={futureSignal} onChange={(event) => setFutureSignal(event.target.value)}>
                      <option value="strong">强：利润/分配路径可验证</option><option value="weak">弱：因果链仍有断点</option>
                    </select>
                  </label>
                  <label><span>流动性阶层</span>
                    <select value={liquidity} onChange={(event) => setLiquidity(event.target.value)}>
                      <option value="T0">T0 · 沸腾</option><option value="T1">T1 · 活跃</option><option value="T2">T2 · 正常/潜伏</option><option value="T3">T3 · 冻结</option>
                    </select>
                  </label>
                  <label><span>Price–MA20 状态 <b>经验锚</b></span>
                    <select value={premium} onChange={(event) => setPremium(event.target.value)}>
                      <option value="premium-expand">升水扩张 · 价在均线上且上涨</option><option value="premium-narrow">升水收窄 · 价在均线上但回落</option><option value="discount-expand">贴水扩张 · 价在均线下且下跌</option><option value="discount-recover">贴水收窄 · 价在均线下但修复</option>
                    </select>
                  </label>
                  <label><span>宏 / 中 / 微一致性</span>
                    <select value={alignment} onChange={(event) => setAlignment(event.target.value)}>
                      <option value="full">三层一致</option><option value="partial">部分一致</option><option value="conflict">明显冲突</option>
                    </select>
                  </label>
                </article>

                <article className={`panel lab-result result-${quadrant.tone}`}>
                  <div className="panel-head"><div><span className="panel-index">OUTPUT</span><h2>规则映射结果</h2></div><span className="result-state">{quadrant.id}</span></div>
                  <div className="result-title"><span>{stage.id}期</span><h3>{quadrant.title}</h3><p>{actionSummary}</p></div>
                  <div className="result-metrics">
                    <div><span>执行约束</span><strong>{executionGuidance}</strong></div>
                    <div><span>阶段动作</span><strong>{stage.action}</strong></div>
                    <div><span>主要风险</span><strong>{quadrant.risk}</strong></div>
                  </div>
                  <div className="result-guardrail">
                    <EvidencePill kind="CHECK" />
                    <p>{alignment === "conflict" ? "层级冲突触发仓位限制：先解释冲突，再谈方向。" : "补齐标的级量价、估值口径、失效条件和单笔风险后，才可进入执行层。"}</p>
                  </div>
                </article>
              </div>

              <article className="panel stage-panel">
                <div className="panel-head"><div><span className="panel-index">PATH</span><h2>叙事生命周期</h2></div><span className="caption">R0 是传播模型，不是精确物理常数</span></div>
                <div className="stage-track">
                  {stages.map((item, index) => (
                    <div key={item.id} className={stage.id === item.id ? "stage-node active" : "stage-node"}>
                      <i>{index + 1}</i><strong>{item.id}期</strong><span>R0 {item.r0}</span><span>{item.liquidity}</span><p>{item.structure}</p><small>{item.action}</small>
                    </div>
                  ))}
                </div>
              </article>

              <div className="narrative-contract-grid">
                <article className="panel">
                  <div className="panel-head"><div><span className="panel-index">CARD</span><h2>一张可交易叙事卡</h2></div><EvidencePill kind="RULE" /></div>
                  <div className="contract-flow">
                    {narrativeContract.map((item) => (
                      <div key={item.code}><span>{item.code}</span><strong>{item.title}</strong><p>{item.detail}</p></div>
                    ))}
                  </div>
                </article>
                <article className="panel">
                  <div className="panel-head"><div><span className="panel-index">PORTS</span><h2>交易载体四端口</h2></div><EvidencePill kind="CHECK" /></div>
                  <div className="port-grid">
                    {carrierPorts.map((port) => <div key={port.title}><strong>{port.title}</strong><p>{port.detail}</p></div>)}
                  </div>
                  <p className="panel-note">技术相关性不等于交易纯度。任何一个关键端口失格，都应降级为表达层、等待验证或移出候选。</p>
                </article>
              </div>
            </section>
          )}

          {section === "map" && (
            <section className="page-section">
              <SectionHeading eyebrow="MACRO → MESO → MICRO" title="主题地图：看清叙事如何落到股票" copy="来自 2026-04-24 的历史映射快照。它适合做研究索引与链路导航，不代表当前持仓、实时热度或今日推荐；源页面截断的明细不会被猜测补齐。" />

              {mapError ? (
                <div className="empty-state">主题数据尚未加载。请检查静态数据文件。</div>
              ) : !macroMap ? (
                <div className="empty-state">正在读取主题映射…</div>
              ) : (
                <>
                  <div className="map-stat-grid">
                    <div><span>快照日期</span><strong>{macroMap.date}</strong></div>
                    <div><span>已归属 + 待归属桶</span><strong>{macroMap.quality ? `${macroMap.quality.assignedMacroThemes}+${macroMap.quality.unassignedBuckets}` : macroMap.macros.length}</strong></div>
                    <div><span>中观挂载 / 唯一主题</span><strong>{macroMap.quality ? `${macroMap.quality.mesoMemberships}/${macroMap.quality.uniqueMesoNames}` : mapTotals.mesos}</strong></div>
                    <div><span>唯一显式关系</span><strong>{nf.format(macroMap.quality?.uniqueExplicitRelations ?? mapTotals.rows)}</strong></div>
                    <div><span>源文件非空代码</span><strong>{nf.format(macroMap.quality?.nonEmptySourceCodes ?? mapTotals.stocks)}</strong></div>
                  </div>

                  {macroMap.quality && (
                    <div className="map-quality-note">
                      <EvidencePill kind="CHECK" />
                      <p><strong>显式覆盖率 {macroMap.quality.explicitCoveragePct}%：</strong>源页面声明 {nf.format(macroMap.quality.sourceDeclaredMemberships)} 条映射，其中 {nf.format(macroMap.quality.omittedBySourceTruncation)} 条仅以“+N只”占位，无法从该 HTML 恢复。已展示 {nf.format(macroMap.quality.validExplicitRows)} 条有效原始项，去重为 {nf.format(macroMap.quality.uniqueExplicitRelations)} 条关系；已标记 1 处源代码冲突。</p>
                    </div>
                  )}

                  <div className="map-layout">
                    <article className="panel macro-browser">
                      <div className="panel-head"><div><span className="panel-index">MACRO</span><h2>宏观叙事</h2></div></div>
                      <div className="macro-list">
                        {macroMap.macros.map((macro) => {
                          const rows = macro.mesos.reduce((sum, meso) => sum + meso.stocks.length, 0);
                          return (
                            <button key={macro.name} className={selectedMacro === macro.name ? "active" : ""} onClick={() => { setSelectedMacro(macro.name); setSelectedMeso(""); setThemeQuery(""); }}>
                              <span><strong>{macro.name}</strong><small>{macro.mesos.length} 中观节点</small></span>
                              <b>{rows}</b>
                            </button>
                          );
                        })}
                      </div>
                    </article>

                    <article className="panel meso-browser">
                      <div className="panel-head"><div><span className="panel-index">MESO</span><h2>{selectedMacroData?.name || "全库搜索"}</h2></div><span className="caption">点击筛选</span></div>
                      <div className="meso-bars">
                        {[...(selectedMacroData?.mesos ?? [])].sort((a, b) => b.stocks.length - a.stocks.length).map((meso) => {
                          const max = Math.max(...(selectedMacroData?.mesos ?? []).map((item) => item.stocks.length), 1);
                          return (
                            <button key={meso.name} className={selectedMeso === meso.name ? "active" : ""} onClick={() => setSelectedMeso(selectedMeso === meso.name ? "" : meso.name)}>
                              <span>{meso.name}</span><i><b style={{ width: `${(meso.stocks.length / max) * 100}%` }} /></i><em>{meso.stocks.length}</em>
                            </button>
                          );
                        })}
                      </div>
                    </article>
                  </div>

                  <article className="panel stock-browser">
                    <div className="stock-toolbar">
                      <div><span className="panel-index">MICRO</span><h2>股票映射</h2></div>
                      <label className="search-box"><span>⌕</span><input value={themeQuery} onChange={(event) => {
                        const value = event.target.value;
                        setThemeQuery(value);
                        if (value.trim()) {
                          setSelectedMacro("");
                          setSelectedMeso("");
                        } else if (!selectedMacro) {
                          setSelectedMacro(macroMap?.macros[0]?.name ?? "");
                        }
                      }} placeholder="搜索股票、代码、主题或中观节点" /></label>
                    </div>
                    <div className="table-wrap">
                      <table>
                        <thead><tr><th>股票</th><th>代码</th><th>宏观叙事</th><th>中观节点</th><th>资料标签</th></tr></thead>
                        <tbody>
                          {themeMatches.map((row, index) => (
                            <tr key={`${row.code}-${row.meso}-${index}`} className={row.sourceIssue ? "source-issue-row" : ""}><td><strong>{row.name}</strong></td><td className="mono" title={row.sourceIssue}>{row.code}</td><td>{row.macro}</td><td>{row.meso}</td><td><span className={row.sourceIssue ? "tier-tag issue" : "tier-tag"}>{row.sourceIssue ? "源代码冲突" : row.tier === "None" ? "未标注" : row.tier}</span></td></tr>
                          ))}
                        </tbody>
                      </table>
                      {!themeMatches.length && <div className="no-results">没有匹配项。尝试更短的关键词。</div>}
                    </div>
                    <p className="table-note">为保证浏览性能，单次最多显示 100 行；相同股票可属于多个叙事节点。</p>
                  </article>
                </>
              )}
            </section>
          )}

          {section === "library" && (
            <section className="page-section">
              <SectionHeading eyebrow="CORPUS & PROVENANCE" title="资料库：看见来源，也看见边界" copy="网站保存的是经过脱敏的目录索引、框架摘要和来源状态；原始大文件仍留在你的 MCP 资料库中，凭证值从未进入站点。" />

              <div className="source-cards">
                {sourceSnapshots.map((source) => (
                  <article key={source.name} className="source-card">
                    <span>{source.status}</span><h3>{source.name}</h3><p>{source.scope}</p><footer><b>{source.version}</b><time>{source.date}</time></footer>
                  </article>
                ))}
              </div>

              <article className="panel library-panel">
                <div className="library-summary">
                  <div><span>已盘点文件</span><strong>{library ? nf.format(library.totalFiles) : libraryError ? "加载失败" : "读取中"}</strong></div>
                  <div><span>已扫描目录</span><strong>{library ? nf.format(library.totalDirectories) : libraryError ? "加载失败" : "读取中"}</strong></div>
                  <div><span>资料体量</span><strong>{library ? formatBytes(library.totalBytes) : libraryError ? "加载失败" : "读取中"}</strong></div>
                  <div><span>覆盖状态</span><strong>{library?.coverage ?? (libraryError ? "索引不可用" : "正在读取索引")}</strong></div>
                  <div className="security-summary"><span>安全处理</span><strong>凭证仅标记存在，值已排除</strong></div>
                </div>
                <div className="library-toolbar">
                  <label className="search-box"><span>⌕</span><input value={libraryQuery} onChange={(event) => setLibraryQuery(event.target.value)} placeholder="搜索文件名、路径、格式或摘要" /></label>
                  <select value={libraryDomain} onChange={(event) => setLibraryDomain(event.target.value)} aria-label="按资料域筛选">
                    {libraryDomains.map((domain) => <option key={domain}>{domain}</option>)}
                  </select>
                </div>
                <div className="library-list">
                  {libraryMatches.map((item, index) => (
                    <div key={`${item.path}-${index}`} className="library-row">
                      <span className="file-type">{item.type.toUpperCase().slice(0, 5) || "FILE"}</span>
                      <div><strong>{item.path.split(/[\\/]/).pop()}</strong><p>{item.summary || item.path}</p></div>
                      <span className="domain-tag">{item.domain}</span>
                      <span className="file-size">{formatBytes(item.size)}</span>
                      {item.secretPresent && <span className="secret-flag">敏感值已排除</span>}
                    </div>
                  ))}
                  {libraryLoading && <div className="no-results">正在读取 8,707 条脱敏目录索引…</div>}
                  {libraryError && <div className="no-results error-state">目录索引加载失败。核心框架仍可使用，请刷新页面后重试。</div>}
                  {library && !libraryMatches.length && <div className="no-results">没有匹配的资料。</div>}
                </div>
                {library && <p className="table-note">索引生成：{formatIndexTimestamp(library.generatedAt)}（Asia/Shanghai） · 当前显示 {libraryMatches.length} 条，最多 120 条。目录索引用于定位来源，不等于对内容真实性的背书。</p>}
              </article>
            </section>
          )}

          {section === "ask" && (
            <section className="page-section">
              <SectionHeading eyebrow="HOW TO USE MATT" title="你可以怎样使用这套体系" copy="从“告诉我一个结论”升级为“让我按证据链做一次可反驳的判断”。下面每种模式都有明确输入、输出和边界。" />

              <div className="capability-grid">
                {capabilityCards.map((card, index) => (
                  <article key={card.code} className="capability-card"><span>{String(index + 1).padStart(2, "0")}</span><small>{card.code}</small><h3>{card.title}</h3><p>{card.text}</p></article>
                ))}
              </div>

              <article className="panel prompt-panel">
                <div className="panel-head"><div><span className="panel-index">PROMPTS</span><h2>可直接复制的问题模板</h2></div><span className="caption">把【】中的内容替换掉</span></div>
                <div className="prompt-list">
                  {promptTemplates.map((item) => (
                    <div className="prompt-row" key={item.title}>
                      <div><span>{item.mode}</span><h3>{item.title}</h3></div>
                      <p>{item.prompt}</p>
                      <button onClick={() => copyPrompt(item.title, item.prompt)}>{copied === item.title ? "已复制 ✓" : copied === `error:${item.title}` ? "复制失败" : "复制模板"}</button>
                    </div>
                  ))}
                </div>
              </article>

              <div className="boundary-grid">
                <article className="panel"><span className="panel-index">DO</span><h2>我会做</h2><ul className="plain-list"><li>优先使用原始资料与可核对数据</li><li>把事实、推断、假设和规则分开</li><li>展示分歧、失效条件与证据缺口</li><li>在高风险问题中给出风险预算框架</li></ul></article>
                <article className="panel warning-panel"><span className="panel-index">DON’T</span><h2>我不会假装</h2><ul className="plain-list"><li>历史快照不是实时行情</li><li>MA20 不是企业真实内在价值</li><li>高 R0 不代表未来必然兑现</li><li>研究框架不保证收益，也不替代你的决策</li></ul></article>
              </div>
            </section>
          )}
        </main>

        <footer className="site-footer">
          <span>MATT · A股研究操作系统</span>
          <span>核心框架 v260317d · 方法归并 2026-07-30</span>
          <span>研究辅助，不构成投资建议</span>
        </footer>
      </div>
    </div>
  );
}
