"use client";

import { useMemo, useState } from "react";
import { STYLE_DIMENSIONS } from "@/lib/types";
import type { QaReport, SlidePlan, Storyline, StyleControls, StyleDimension, StyleDna, StyleSource } from "@/lib/types";

type ReferenceResult = { analysis: { slideCount: number; fonts: Array<{ family: string; count: number }>; colors: Array<{ value: string; count: number; kind: string }>; layouts: unknown[]; masters: string[] }; styleDna: StyleDna; referenceStyleDna: StyleDna; systemStyleDna: StyleDna; learnStyle: boolean; contactSheetUrl: string; slideUrls: string[] };
type PreviewDirection = { id: "A" | "B" | "C"; name: string; contactSheetUrl: string; slideUrls: string[]; pptxUrl: string };

const defaultControls: StyleControls = {
  referenceStrength: 70,
  minimalism: 65,
  modernity: 70,
  airiness: 65,
  visualWeight: 60,
  technologyTone: 25,
  visualImpact: 55,
  locks: { typography: false, colors: false, layout: false },
  advancedMixer: {
    weights: {
      typography: { reference: 70, system: 30, prompt: 0 }, color: { reference: 70, system: 30, prompt: 0 },
      layout: { reference: 70, system: 30, prompt: 0 }, chart: { reference: 70, system: 30, prompt: 0 },
      density: { reference: 70, system: 30, prompt: 0 }, composition: { reference: 70, system: 30, prompt: 0 },
      storytelling: { reference: 70, system: 30, prompt: 0 }, visualTone: { reference: 70, system: 30, prompt: 0 }
    },
    locks: { typography: false, color: false, layout: false, chart: false, density: false, composition: false, storytelling: false, visualTone: false }
  }
};

const dimensionLabels: Record<StyleDimension, string> = {
  typography: "字体", color: "颜色", layout: "版式", chart: "图表", density: "密度", composition: "构图", storytelling: "叙事", visualTone: "视觉语气"
};

async function jsonOrThrow(response: Response) {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "请求失败");
  return body;
}

function Slider({ label, left, right, value, onChange }: { label: string; left: string; right: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="slider-row">
      <span className="slider-title">{label}<strong>{value}</strong></span>
      <input type="range" min="0" max="100" value={value} onChange={(event) => onChange(Number(event.target.value))} />
      <span className="slider-poles"><span>{left}</span><span>{right}</span></span>
    </label>
  );
}

export default function Home() {
  const [projectId, setProjectId] = useState("");
  const [reference, setReference] = useState<ReferenceResult | null>(null);
  const [learnReferenceStyle, setLearnReferenceStyle] = useState(false);
  const [systemStylePreset, setSystemStylePreset] = useState<"adaptive" | "bank-internal">("adaptive");
  const [controls, setControls] = useState(defaultControls);
  const [storyline, setStoryline] = useState<Storyline | null>(null);
  const [slidePlans, setSlidePlans] = useState<SlidePlan[]>([]);
  const [finalStyle, setFinalStyle] = useState<StyleDna | null>(null);
  const [directions, setDirections] = useState<PreviewDirection[]>([]);
  const [selected, setSelected] = useState<"A" | "B" | "C" | null>(null);
  const [deck, setDeck] = useState<{ pptxUrl: string; contactSheetUrl: string } | null>(null);
  const [qa, setQa] = useState<QaReport | null>(null);
  const [promptText, setPromptText] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [material, setMaterial] = useState("市场环境正在发生结构性变化。传统增长路径边际放缓，客户更加关注效率、可验证回报与交付确定性。\n\n核心机会来自三方面：第一，存量流程数字化；第二，数据资产形成可复用能力；第三，跨部门协同缩短决策周期。\n\n建议先聚焦高频、可量化的业务场景，通过小范围试点建立基线，再逐步扩大覆盖范围。成功标准应同时包含效率提升、质量改善和风险可控。");

  const activeStep = useMemo(() => deck ? 6 : directions.length ? 5 : storyline ? 4 : reference ? 3 : projectId ? 2 : 1, [deck, directions.length, storyline, reference, projectId]);

  async function run(label: string, action: () => Promise<void>) {
    setBusy(label); setError("");
    try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : "操作失败"); }
    finally { setBusy(""); }
  }

  async function createProject() {
    await run("正在创建项目", async () => {
      const result = await jsonOrThrow(await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Phase 1 Demo" }) }));
      setProjectId(result.id);
    });
  }

  async function analyzeReference(file: File) {
    await run("正在解析并渲染参考 PPT", async () => {
      const form = new FormData(); form.set("projectId", projectId); form.set("file", file); form.set("learnStyle", String(learnReferenceStyle)); form.set("systemStylePreset", systemStylePreset);
      const result = await jsonOrThrow(await fetch("/api/reference/analyze", { method: "POST", body: form }));
      setReference(result);
      if (!learnReferenceStyle) setReferenceStrength(0);
    });
  }

  async function parseMaterial(file?: File) {
    await run("正在生成 Storyline 与 Slide Plan", async () => {
      const form = new FormData();
      form.set("projectId", projectId); form.set("text", material); form.set("audience", "业务决策者"); form.set("purpose", "形成可执行的决策建议"); form.set("pageTarget", "8");
      if (file) form.set("file", file);
      const result = await jsonOrThrow(await fetch("/api/materials/parse", { method: "POST", body: form }));
      setStoryline(result.storyline); setSlidePlans(result.slidePlans);
    });
  }

  async function generatePreviews() {
    if (!reference || !storyline) return;
    await run("正在生成 A/B/C 三套预览", async () => {
      const result = await jsonOrThrow(await fetch("/api/style/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, storyline, slidePlans, styleDna: reference.referenceStyleDna, systemStyleDna: reference.systemStyleDna, promptText, controls, previewSet: "current" }) }));
      setFinalStyle(result.finalStyle); setDirections(result.directions); setSelected(null);
    });
  }

  function setLegacyLock(lock: "typography" | "colors" | "layout", checked: boolean) {
    const dimension = lock === "colors" ? "color" : lock;
    setControls((current) => ({
      ...current,
      locks: { ...current.locks, [lock]: checked },
      advancedMixer: current.advancedMixer ? { ...current.advancedMixer, locks: { ...current.advancedMixer.locks, [dimension]: checked } } : undefined
    }));
  }

  function setReferenceStrength(value: number) {
    setControls((current) => ({
      ...current,
      referenceStrength: value,
      advancedMixer: current.advancedMixer ? {
        ...current.advancedMixer,
        weights: Object.fromEntries(STYLE_DIMENSIONS.map((dimension) => [dimension, { ...current.advancedMixer!.weights[dimension], reference: value, system: 100 - value }])) as typeof current.advancedMixer.weights
      } : undefined
    }));
  }

  function setAdvancedLock(dimension: StyleDimension, checked: boolean) {
    setControls((current) => {
      if (!current.advancedMixer) return current;
      const legacy = dimension === "color" ? "colors" : dimension === "typography" || dimension === "layout" ? dimension : null;
      return {
        ...current,
        locks: legacy ? { ...current.locks, [legacy]: checked } : current.locks,
        advancedMixer: { ...current.advancedMixer, locks: { ...current.advancedMixer.locks, [dimension]: checked } }
      };
    });
  }

  function setSourceWeight(dimension: StyleDimension, source: StyleSource, value: number) {
    setControls((current) => current.advancedMixer ? ({
      ...current,
      advancedMixer: { ...current.advancedMixer, weights: { ...current.advancedMixer.weights, [dimension]: { ...current.advancedMixer.weights[dimension], [source]: value } } }
    }) : current);
  }

  async function generateDeck() {
    if (!selected || !storyline || !finalStyle) return;
    await run("正在生成完整可编辑 PPTX", async () => {
      const result = await jsonOrThrow(await fetch("/api/deck/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, direction: selected, storyline, slidePlans, finalStyle, controls }) }));
      setDeck(result);
      const report = await jsonOrThrow(await fetch("/api/qa/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, referenceStrength: controls.referenceStrength, repairPass: 0 }) }));
      setQa(report);
    });
  }

  async function autoFix() {
    await run("正在执行 Auto Fix", async () => setQa(await jsonOrThrow(await fetch("/api/qa/fix", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId }) }))));
  }

  return (
    <main className="shell">
      <aside className="rail">
        <div className="brand"><span className="brand-mark">PF</span><span>PPT Factory<small>Style OS · Phase 1</small></span></div>
        <nav>{["项目", "参考学习", "Style Inspector", "材料与 Storyline", "A/B/C 预览", "生成与 QA"].map((item, index) => <span className={activeStep === index + 1 ? "active" : activeStep > index + 1 ? "done" : ""} key={item}><b>{String(index + 1).padStart(2, "0")}</b>{item}</span>)}</nav>
        <div className="rail-note">唯一顶层编排器<br /><code>ppt-factory</code></div>
      </aside>

      <section className="workspace">
        <header className="topbar"><div><p>LOCAL V1 PROTOTYPE</p><h1>Material → Style → Preview → Export</h1></div><div className="status">{busy || (projectId ? `项目 ${projectId.slice(-8)}` : "尚未创建项目")}</div></header>
        {error && <div className="error">{error}</div>}

        <section className="stage intro">
          <div><span className="eyebrow">01 · PROJECT FOUNDATION</span><h2>从真实参考 PPT 开始建立 Style DNA</h2><p>本地原型会把每个阶段写入独立 JSON，并保留源文件、逐页渲染、contact sheet、最终 PPTX 和 QA 报告。</p></div>
          {!projectId ? <button className="primary" onClick={createProject} disabled={!!busy}>创建 Phase 1 项目</button> : <span className="ok">项目目录已就绪</span>}
        </section>

        {projectId && <section className="stage">
          <div className="stage-head"><div><span className="eyebrow">02 · REFERENCE INPUT</span><h2>上传 PPTX：解析与风格学习分开控制</h2></div><label className="upload">选择 PPTX<input type="file" accept=".pptx" onChange={(event) => event.target.files?.[0] && analyzeReference(event.target.files[0])} /></label></div>
          <label className="reference-mode"><input type="checkbox" checked={learnReferenceStyle} onChange={(event) => setLearnReferenceStyle(event.target.checked)} /><span><strong>将该文件用于风格学习</strong><small>关闭时仅做兼容性解析与内容/结构提取，生成风格使用所选系统预设。</small></span></label>
          {!learnReferenceStyle && <label className="preset-select"><span>系统风格基底</span><select value={systemStylePreset} onChange={(event) => setSystemStylePreset(event.target.value as "adaptive" | "bank-internal")}><option value="adaptive">通用专业报告</option><option value="bank-internal">银行内部通报</option></select></label>}
          {reference ? <div className="reference-grid"><img src={reference.contactSheetUrl} alt="参考 PPT contact sheet" /><div className="facts"><strong>{reference.analysis.slideCount}</strong><span>页已渲染</span><strong>{reference.analysis.fonts.length}</strong><span>字体族</span><strong>{reference.analysis.masters.length}</strong><span>母版</span><strong>{reference.analysis.layouts.length}</strong><span>布局关联</span></div></div> : <p className="empty">等待一份真实参考 PPTX。上传后自动完成 OOXML 解析、逐页 PNG 与 contact sheet。</p>}
        </section>}

        {reference && <section className="stage">
          <div className="stage-head"><div><span className="eyebrow">03 · STYLE INSPECTOR</span><h2>{reference.styleDna.name}</h2></div><span className="tag">{reference.learnStyle ? "REFERENCE + SYSTEM" : "SYSTEM"}</span></div>
          {!reference.learnStyle && <p className="mode-note">上传文件未参与配色、字体与版式决策；它只作为兼容性解析样本。</p>}
          <div className="inspector">
            <div><h3>Typography</h3><p>{reference.analysis.fonts.slice(0, 5).map((font) => `${font.family} ×${font.count}`).join(" · ") || "未检测到显式字体"}</p></div>
            <div><h3>Colors</h3><div className="palette">{reference.analysis.colors.filter((color) => color.kind === "rgb").slice(0, 8).map((color) => <span key={color.value} title={color.value} style={{ background: `#${color.value}` }} />)}</div></div>
            <div><h3>Composition</h3><p>{String(reference.styleDna.composition.preferred)} · {String(reference.styleDna.density.label)}</p></div>
          </div>
          <div className="controls">
            {reference.learnStyle && <Slider label="Reference Strength" left="自由创作" right="严格参考" value={controls.referenceStrength} onChange={setReferenceStrength} />}
            <Slider label="Minimal / Rich" left="丰富" right="极简" value={controls.minimalism} onChange={(value) => setControls({ ...controls, minimalism: value })} />
            <Slider label="Classic / Modern" left="经典" right="现代" value={controls.modernity} onChange={(value) => setControls({ ...controls, modernity: value })} />
            <Slider label="Dense / Airy" left="紧凑" right="留白" value={controls.airiness} onChange={(value) => setControls({ ...controls, airiness: value })} />
            <Slider label="Text / Visual" left="文字" right="视觉" value={controls.visualWeight} onChange={(value) => setControls({ ...controls, visualWeight: value })} />
            <Slider label="Financial / Technology" left="金融" right="科技" value={controls.technologyTone} onChange={(value) => setControls({ ...controls, technologyTone: value })} />
            <Slider label="Low / High Impact" left="低冲击" right="高冲击" value={controls.visualImpact} onChange={(value) => setControls({ ...controls, visualImpact: value })} />
          </div>
          <div className="locks"><span>Locks</span>{(["typography", "colors", "layout"] as const).map((lock) => <label key={lock}><input type="checkbox" checked={controls.locks[lock]} onChange={(event) => setLegacyLock(lock, event.target.checked)} />{lock}</label>)}</div>
          <div className="prompt-style">
            <label><strong>Prompt Style</strong><small>可选。本地解释常见中英文专业风格词；无法识别时保持中性。</small></label>
            <input value={promptText} onChange={(event) => setPromptText(event.target.value)} placeholder="例如：克制、留白、金融机构感 / restrained airy institutional" />
          </div>
          {controls.advancedMixer && <details className="advanced-mixer">
            <summary><span>高级混合器</span><small>八维来源权重与锁定（可选）</small></summary>
            <div className="mixer-head"><span>维度</span><span>参考</span><span>系统</span><span>Prompt</span><span>锁定</span></div>
            {STYLE_DIMENSIONS.map((dimension) => <div className="mixer-row" key={dimension}>
              <strong>{dimensionLabels[dimension]}</strong>
              {(["reference", "system", "prompt"] as StyleSource[]).map((source) => <label key={source}><input aria-label={`${dimension}-${source}`} type="number" min="0" max="100" value={controls.advancedMixer!.weights[dimension][source]} onChange={(event) => setSourceWeight(dimension, source, Number(event.target.value))} /></label>)}
              <label className="mixer-lock"><input type="checkbox" checked={controls.advancedMixer!.locks[dimension]} onChange={(event) => setAdvancedLock(dimension, event.target.checked)} /><span>Lock</span></label>
            </div>)}
            <p>每一维内部自动归一化；锁定后该维严格使用 Reference，Prompt 未识别时不参与混合。</p>
          </details>}
        </section>}

        {reference && <section className="stage">
          <div className="stage-head"><div><span className="eyebrow">04 · MATERIALS + STORYLINE</span><h2>上传完全不同的新材料</h2></div><label className="upload secondary">PDF / TXT<input type="file" accept=".pdf,.txt" onChange={(event) => event.target.files?.[0] && parseMaterial(event.target.files[0])} /></label></div>
          <textarea value={material} onChange={(event) => setMaterial(event.target.value)} />
          <button className="primary" onClick={() => parseMaterial()} disabled={!!busy}>生成 Storyline JSON</button>
          {storyline && <div className="storyline"><strong>{storyline.thesis}</strong><ol>{storyline.slides.map((slide) => <li key={slide.slideIndex}><span>{slide.role}</span>{slide.message}</li>)}</ol></div>}
        </section>}

        {storyline && <section className="stage">
          <div className="stage-head"><div><span className="eyebrow">05 · A/B/C STYLE PREVIEW</span><h2>先比较三种明显不同的方向</h2></div><button className="primary" onClick={generatePreviews} disabled={!!busy}>生成 3 × 3 页预览</button></div>
          {directions.length > 0 && <div className="directions">{directions.map((direction) => <button key={direction.id} className={selected === direction.id ? "direction selected" : "direction"} onClick={() => setSelected(direction.id)}><span>{direction.id}</span><strong>{direction.name}</strong><img src={direction.contactSheetUrl} alt={`${direction.name} contact sheet`} /><em>{selected === direction.id ? "已选择" : "选择此方向"}</em></button>)}</div>}
          {selected && <button className="primary wide" onClick={generateDeck} disabled={!!busy}>以方向 {selected} 生成完整可编辑 PPTX</button>}
        </section>}

        {deck && qa && <section className="stage qa-stage">
          <div className="stage-head"><div><span className="eyebrow">06 · RENDER + QA + AUTO REPAIR</span><h2>最终输出与质量门</h2></div><span className={`qa-status ${qa.status.toLowerCase()}`}>{qa.status}</span></div>
          <div className="qa-grid"><img src={deck.contactSheetUrl} alt="最终 PPT contact sheet" /><div className="score"><strong>{qa.overall}</strong><span>Overall</span><p>Readability {qa.readability}</p><p>Fidelity {qa.referenceFidelity}</p><p>AI-look {qa.aiLookScore}</p><p>Repair pass {qa.repairPass}/3</p></div></div>
          <div className="fidelity-panel">
            <div className="fidelity-head"><div><span className="eyebrow">MEASURED REFERENCE FIDELITY</span><h3>{qa.fidelity.overall} / target {qa.fidelity.target || "—"}</h3></div><span>{qa.fidelity.referenceSlides} reference slides → {qa.fidelity.outputSlides} output slides</span></div>
            <div className="fidelity-dimensions">{Object.entries(qa.fidelity.dimensions).map(([name, dimension]) => <div className={dimension.passed ? "fidelity-row pass" : "fidelity-row fail"} key={name}>
              <span>{name}{dimension.locked ? " · LOCKED" : ""}</span><div><i style={{ width: `${dimension.score}%` }} /></div><b>{dimension.score}<small>/ {dimension.target || "—"}</small></b>
            </div>)}</div>
          </div>
          <div className="actions"><a className="primary" href={deck.pptxUrl}>下载最终 PPTX</a><button className="secondary-button" onClick={autoFix} disabled={!!busy || qa.repairPass >= 3}>一键 Auto Fix</button></div>
          {qa.issues.length > 0 && <ul className="issues">{qa.issues.map((issue) => <li key={issue.id}><b>{issue.severity}</b>{issue.message}</li>)}</ul>}
        </section>}
      </section>
    </main>
  );
}
