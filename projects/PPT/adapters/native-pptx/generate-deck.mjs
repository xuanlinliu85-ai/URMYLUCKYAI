import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { createContactSheet } from "./contact-sheet.mjs";
import { createChartPackLibrary, mapChartPackToNative, resolveChartPack } from "../../lib/chart-packs.mjs";

async function loadArtifactTool() {
  const candidates = [
    process.env.PPT_FACTORY_ARTIFACT_TOOL,
    process.env.RUNTIME_NODE_MODULES && path.join(process.env.RUNTIME_NODE_MODULES, "@oai", "artifact-tool", "dist", "artifact_tool.mjs")
  ].filter(Boolean);
  for (const candidate of candidates) {
    try { return await import(pathToFileURL(candidate).href); } catch {}
  }
  return import("@oai/artifact-tool");
}

let activeTypographyRepair = null;
let activeContrastRepairs = [];
let activeFontFallbackRepairs = [];
let activeImageRepairs = [];
let activeChartLabelRepairs = [];
let activeChartLabelFixture = false;
let activeResolvedBindings = [];
const chartMetadataBySlide = new Map();
let activeSlideNumber = 0;
const fontEvidence = [];
const bindingRenderEvidence = [];
const chartPackSelections = [];
let activeSlidePlan = null;

function matchesObjectPattern(name, pattern) {
  const escaped = String(pattern).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`).test(name);
}

function normalizeHex(value, fallback) {
  const raw = String(value ?? "").replace("#", "");
  return /^[0-9A-Fa-f]{6}$/.test(raw) ? `#${raw.toUpperCase()}` : fallback;
}

function blend(a, b, weight) {
  const parse = (hex) => hex.replace("#", "").match(/../g).map((x) => parseInt(x, 16));
  const aa = parse(a), bb = parse(b);
  return `#${aa.map((v, i) => Math.round(v * weight + bb[i] * (1 - weight)).toString(16).padStart(2, "0")).join("")}`;
}

function tokens(direction, style, controls = {}) {
  const bankVariants = {
    A: { bg: "#F7F3EA", ink: "#18232D", muted: "#68737C", accent: "#9B1C31", secondary: "#0E6B63", panel: "#FFFDF8", dark: "#142A3D", pale: "#EEE7DA", label: "决策简报" },
    B: { bg: "#F2F5F7", ink: "#132335", muted: "#667485", accent: "#123B5D", secondary: "#C18A32", panel: "#FFFFFF", dark: "#0B2239", pale: "#E5ECF1", label: "经营分析" },
    C: { bg: "#F4F7FB", ink: "#101A32", muted: "#5D6880", accent: "#275DAD", secondary: "#00A083", panel: "#FFFFFF", dark: "#112342", pale: "#E7EEF9", label: "数据叙事" }
  };
  const adaptiveVariants = {
    A: { bg: "#F8F3E9", ink: "#17212B", muted: "#626C75", accent: "#B84A2F", secondary: "#147D72", panel: "#FFFDF8", dark: "#1B2C3A", pale: "#EFE7D8", label: "编辑叙事" },
    B: { bg: "#F2F5F7", ink: "#132335", muted: "#667485", accent: "#123B5D", secondary: "#C18A32", panel: "#FFFFFF", dark: "#0B2239", pale: "#E5ECF1", label: "经营分析" },
    C: { bg: "#F4F7FB", ink: "#101A32", muted: "#5D6880", accent: "#275DAD", secondary: "#00A083", panel: "#FFFFFF", dark: "#112342", pale: "#E7EEF9", label: "数据叙事" }
  };
  const variants = Number(style?.styleVector?.bankInternal ?? 0) >= 0.5 ? bankVariants : adaptiveVariants;
  const base = variants[direction] ?? variants.A;
  const reference = normalizeHex(style?.colors?.primary, base.accent);
  const weight = Math.max(0, Math.min(1, Number(controls.referenceStrength ?? 70) / 100));
  const colorLocked = controls.advancedMixer?.locks?.color === true || controls.locks?.colors === true;
  const advancedColorWeights = controls.advancedMixer?.weights?.color;
  const advancedColorInfluence = advancedColorWeights
    ? Math.max(0, Math.min(0.9, Math.max(...Object.values(advancedColorWeights).map(Number)) / 100))
    : 0;
  const styleAccent = normalizeHex(style?.colors?.accent, reference);
  const sourceTypeface = String(style?.typography?.primary || "");
  const typeface = /(YaHei|Hei|Song|Noto Sans CJK|PingFang|SimSun|DengXian|KaiTi)/i.test(sourceTypeface) ? sourceTypeface : "Microsoft YaHei";
  return {
    ...base,
    ...(colorLocked ? {
      bg: normalizeHex(style?.colors?.background, base.bg),
      accent: reference,
      secondary: normalizeHex(style?.colors?.secondary, base.secondary)
    } : advancedColorInfluence > 0
      ? { accent: blend(styleAccent, base.accent, advancedColorInfluence), secondary: blend(normalizeHex(style?.colors?.secondary, base.secondary), base.secondary, advancedColorInfluence * 0.7) }
      : { accent: blend(reference, base.accent, Math.min(0.7, weight * 0.7)) }),
    typeface
  };
}

function addText(slide, name, text, position, style) {
  const bound = activeResolvedBindings.find((target) => target.kind === "text" && target.objectName === name);
  const resolvedText = bound ? bound.value : text;
  if (bound) bindingRenderEvidence.push({ slide: activeSlideNumber, id: bound.id, kind: "text", objectName: name, value: resolvedText });
  const requestedTypeface = String(style.typeface ?? "");
  let repairedStyle = activeTypographyRepair && activeTypographyRepair.objectNames.some((pattern) => matchesObjectPattern(name, pattern)) && typeof style.fontSize === "number"
    ? { ...style, fontSize: Math.min(72, Math.max(10, Math.round(style.fontSize * activeTypographyRepair.fontScale))) }
    : style;
  const contrastRepair = activeContrastRepairs.find((repair) => (!repair.slide || repair.slide === activeSlideNumber) && repair.objectNames.some((pattern) => matchesObjectPattern(name, pattern)));
  if (contrastRepair) repairedStyle = { ...repairedStyle, color: contrastRepair.foregroundColor };
  const fontFallbackRepair = activeFontFallbackRepairs.find((repair) => (!repair.slide || repair.slide === activeSlideNumber) && repair.objectNames.some((pattern) => matchesObjectPattern(name, pattern)));
  if (fontFallbackRepair) repairedStyle = { ...repairedStyle, typeface: fontFallbackRepair.replacementTypeface };
  fontEvidence.push({
    slide: activeSlideNumber,
    objectName: name,
    text: String(resolvedText),
    requestedTypeface,
    appliedTypeface: String(repairedStyle.typeface ?? requestedTypeface)
  });
  const shape = slide.shapes.add({ geometry: "textbox", name, position, fill: "none", line: { style: "solid", fill: "none", width: 0 } });
  shape.text = resolvedText;
  shape.text.style = repairedStyle;
  return shape;
}

function chartLabelPolicy(objectName, defaults) {
  const repair = activeChartLabelRepairs.find((target) => (!target.slide || target.slide === activeSlideNumber) && target.objectNames.some((pattern) => matchesObjectPattern(objectName, pattern)));
  if (!repair) return defaults;
  return {
    position: repair.adjustments.chartLabelPosition ?? defaults.position,
    fontSize: Math.max(10, Math.min(24, Number(repair.adjustments.chartLabelFontSize ?? defaults.fontSize))),
    displayStrategy: repair.adjustments.chartLabelDisplayStrategy ?? defaults.displayStrategy
  };
}

function recordChartMetadata(slide, metadata) {
  chartMetadataBySlide.set(slide, [...(chartMetadataBySlide.get(slide) ?? []), metadata]);
}

function addChrome(slide, t, index, total, label) {
  slide.background.fill = t.bg;
  slide.shapes.add({ geometry: "rect", name: "top-accent", position: { left: 0, top: 0, width: 1280, height: 6 }, fill: t.accent, line: { style: "solid", fill: "none", width: 0 } });
  slide.shapes.add({ geometry: "rect", name: "section-mark", position: { left: 72, top: 40, width: 18, height: 5 }, fill: t.secondary, line: { style: "solid", fill: "none", width: 0 } });
  addText(slide, "direction-label", label.toUpperCase(), { left: 102, top: 28, width: 300, height: 28 }, { fontSize: 11, bold: true, color: t.muted, typeface: t.typeface, characterSpacing: 1 });
  addText(slide, "page-number", `${String(index).padStart(2, "0")} / ${String(total).padStart(2, "0")}`, { left: 1080, top: 657, width: 128, height: 20 }, { fontSize: 10, color: t.muted, alignment: "right", typeface: t.typeface });
}

function addCover(presentation, slideData, t, index, total, label, direction) {
  const slide = presentation.slides.add();
  if (direction === "B") {
    slide.background.fill = t.dark;
    slide.shapes.add({ geometry: "rect", name: "cover-side-field", position: { left: 960, top: 0, width: 320, height: 720 }, fill: t.pale, line: { style: "solid", fill: "none", width: 0 } });
    slide.shapes.add({ geometry: "rect", name: "cover-signal", position: { left: 76, top: 126, width: 54, height: 8 }, fill: t.secondary, line: { style: "solid", fill: "none", width: 0 } });
    addText(slide, "cover-kicker", "OPERATING DECISION BRIEF", { left: 76, top: 76, width: 520, height: 28 }, { fontSize: 13, bold: true, color: "#AFC0CE", typeface: t.typeface, characterSpacing: 2 });
    addText(slide, "cover-title", slideData.message, { left: 76, top: 168, width: 780, height: 190 }, { fontSize: 46, bold: true, color: "#FFFFFF", typeface: t.typeface, autoFit: "shrinkText" });
    addText(slide, "cover-subtitle", slideData.supportingPoints?.[0] ?? "形成可执行的经营决策", { left: 80, top: 408, width: 690, height: 58 }, { fontSize: 20, color: "#C7D3DD", typeface: t.typeface, autoFit: "shrinkText" });
    addText(slide, "cover-edition", "DECISION\n/ 01", { left: 1010, top: 150, width: 190, height: 110 }, { fontSize: 29, bold: true, color: t.dark, typeface: t.typeface });
    addText(slide, "cover-date", "PPT FACTORY · PHASE 1", { left: 1010, top: 550, width: 210, height: 28 }, { fontSize: 11, bold: true, color: t.muted, typeface: t.typeface, characterSpacing: 1 });
    addText(slide, "page-number", `${String(index).padStart(2, "0")} / ${String(total).padStart(2, "0")}`, { left: 1060, top: 650, width: 150, height: 20 }, { fontSize: 10, color: t.muted, alignment: "right", typeface: t.typeface });
    slide.speakerNotes.textFrame.setText("[Sources]\n- User-provided material and derived Slide Plan JSON.");
    return;
  }
  addChrome(slide, t, index, total, label);
  if (direction === "C") {
    slide.shapes.add({ geometry: "rect", name: "editorial-field", position: { left: 0, top: 96, width: 430, height: 624 }, fill: t.accent, line: { style: "solid", fill: "none", width: 0 } });
    addText(slide, "cover-edition", "RESEARCH / EDITION 01", { left: 70, top: 145, width: 300, height: 30 }, { fontSize: 14, bold: true, color: t.panel, typeface: t.typeface });
    addText(slide, "cover-mark", "观点", { left: 70, top: 420, width: 290, height: 100 }, { fontSize: 64, bold: true, color: t.panel, typeface: t.typeface });
    addText(slide, "cover-title", slideData.message, { left: 500, top: 185, width: 670, height: 230 }, { fontSize: 46, bold: true, color: t.ink, typeface: t.typeface, autoFit: "shrinkText" });
    addText(slide, "cover-subtitle", slideData.supportingPoints?.[0] ?? "PPT Factory / Style OS", { left: 505, top: 455, width: 620, height: 80 }, { fontSize: 20, color: t.muted, typeface: t.typeface, autoFit: "shrinkText" });
    slide.speakerNotes.textFrame.setText("[Sources]\n- User-provided material and derived Slide Plan JSON.");
    return;
  }
  slide.shapes.add({ geometry: "rect", name: "cover-rule", position: { left: 72, top: 155, width: 120, height: 8 }, fill: t.accent, line: { style: "solid", fill: "none", width: 0 } });
  addText(slide, "cover-title", slideData.message, { left: 72, top: 196, width: 860, height: 210 }, { fontSize: 50, bold: true, color: t.ink, typeface: t.typeface, autoFit: "shrinkText" });
  addText(slide, "cover-subtitle", slideData.supportingPoints?.[0] ?? "PPT Factory / Style OS", { left: 76, top: 438, width: 720, height: 70 }, { fontSize: 22, color: t.muted, typeface: t.typeface, autoFit: "shrinkText" });
  slide.shapes.add({ geometry: "rect", name: "cover-visual", position: { left: 910, top: 100, width: 240, height: 420 }, fill: t.accent, line: { style: "solid", fill: "none", width: 0 } });
  slide.speakerNotes.textFrame.setText("[Sources]\n- User-provided material and derived storyline JSON.");
}

function addSummary(presentation, slideData, t, index, total, label, direction) {
  const slide = presentation.slides.add();
  addChrome(slide, t, index, total, label);
  addText(slide, "slide-title", slideData.message, { left: 72, top: 78, width: 1030, height: 64 }, { fontSize: 32, bold: true, color: t.ink, typeface: t.typeface, autoFit: "shrinkText" });
  const points = (slideData.supportingPoints ?? []).filter((point) => point !== slideData.message).slice(0, 5);
  const lead = points.find((point) => point.length >= 35) ?? points[0] ?? slideData.message;
  const evidencePoints = points.filter((point) => point !== lead && (point.length >= 24 || /[，。；]/.test(point))).slice(0, 3);
  if (direction === "B") {
    slide.shapes.add({ geometry: "rect", name: "summary-answer-field", position: { left: 72, top: 178, width: 565, height: 380 }, fill: t.dark, line: { style: "solid", fill: "none", width: 0 } });
    addText(slide, "summary-answer-label", "CORE ANSWER", { left: 108, top: 214, width: 260, height: 28 }, { fontSize: 12, bold: true, color: t.secondary, typeface: t.typeface, characterSpacing: 2 });
    addText(slide, "summary-answer", lead, { left: 108, top: 270, width: 470, height: 210 }, { fontSize: 29, bold: true, color: "#FFFFFF", typeface: t.typeface, autoFit: "shrinkText" });
    evidencePoints.forEach((point, i) => {
      const y = 185 + i * 126;
      addText(slide, `summary-index-${i + 1}`, `0${i + 1}`, { left: 700, top: y, width: 48, height: 28 }, { fontSize: 15, bold: true, color: t.secondary, typeface: t.typeface });
      addText(slide, `summary-point-${i + 1}`, point, { left: 770, top: y - 2, width: 400, height: 84 }, { fontSize: 17, color: t.ink, typeface: t.typeface, autoFit: "shrinkText" });
      slide.shapes.add({ geometry: "rect", name: `summary-rule-${i + 1}`, position: { left: 700, top: y + 94, width: 470, height: 1 }, fill: t.pale, line: { style: "solid", fill: "none", width: 0 } });
    });
    slide.speakerNotes.textFrame.setText("[Sources]\n- User-provided material and derived Slide Plan JSON.");
    return;
  }
  if (direction === "C") {
    slide.shapes.add({ geometry: "rect", name: "summary-editorial-accent", position: { left: 72, top: 190, width: 8, height: 350 }, fill: t.accent, line: { style: "solid", fill: "none", width: 0 } });
    addText(slide, "summary-lead", lead, { left: 110, top: 205, width: 500, height: 270 }, { fontSize: 30, bold: true, color: t.ink, typeface: t.typeface, autoFit: "shrinkText" });
    evidencePoints.forEach((point, i) => {
      addText(slide, `summary-index-${i + 2}`, `0${i + 2}`, { left: 690, top: 205 + i * 112, width: 54, height: 30 }, { fontSize: 17, bold: true, color: t.accent, typeface: t.typeface });
      addText(slide, `summary-point-${i + 2}`, point, { left: 770, top: 202 + i * 112, width: 380, height: 74 }, { fontSize: 18, color: t.ink, typeface: t.typeface, autoFit: "shrinkText" });
    });
    slide.speakerNotes.textFrame.setText("[Sources]\n- User-provided material and derived Slide Plan JSON.");
    return;
  }
  points.forEach((point, i) => {
    const y = 185 + i * 104;
    addText(slide, `summary-index-${i + 1}`, String(i + 1).padStart(2, "0"), { left: 80, top: y, width: 56, height: 42 }, { fontSize: 24, bold: true, color: t.accent, typeface: t.typeface });
    addText(slide, `summary-point-${i + 1}`, point, { left: 160, top: y - 2, width: 930, height: 70 }, { fontSize: 19, color: t.ink, typeface: t.typeface, autoFit: "shrinkText" });
    slide.shapes.add({ geometry: "rect", name: `summary-rule-${i + 1}`, position: { left: 160, top: y + 66, width: 930, height: 1 }, fill: i === 0 ? t.accent : t.muted, line: { style: "solid", fill: "none", width: 0 } });
  });
  slide.speakerNotes.textFrame.setText("[Sources]\n- User-provided material and derived storyline JSON.");
}

function addDataSlide(presentation, slideData, t, index, total, label, direction) {
  const slide = presentation.slides.add();
  addChrome(slide, t, index, total, label);
  addText(slide, "slide-title", slideData.message, { left: 72, top: 76, width: 1070, height: 82 }, { fontSize: 31, bold: true, color: t.ink, typeface: t.typeface, autoFit: "shrinkText" });
  const metrics = (slideData.metrics ?? []).slice(0, activeChartLabelFixture ? 8 : 4);
  const points = (slideData.supportingPoints?.length ? slideData.supportingPoints : [slideData.message]).slice(0, 3);
  const percentMetrics = metrics.filter((metric) => metric.unit === "%");
  const ratePair = percentMetrics.filter((metric) => metric.numericValue >= 50).slice(0, activeChartLabelFixture ? 8 : 2);
  const boundRateChart = activeResolvedBindings.find((target) => target.kind === "chart" && target.objectName === "metric-rate-chart");
  if (direction === "B") {
    if (boundRateChart || ratePair.length >= 2) {
      slide.shapes.add({ geometry: "rect", name: "metric-chart-field", position: { left: 72, top: 190, width: 760, height: 380 }, fill: t.panel, line: { style: "solid", fill: t.pale, width: 1 } });
      const chartName = "metric-rate-chart";
      const chartPosition = activeChartLabelFixture
        ? { left: 112, top: 230, width: 260, height: 285 }
        : { left: 112, top: 230, width: 650, height: 285 };
      const chartCategories = boundRateChart?.chart.categories ?? (activeChartLabelFixture ? ratePair.map((metric) => metric.label) : ["基期", "当前"]);
      const chartSeries = boundRateChart?.chart.series ?? [{ name: "准时交付率", values: ratePair.map((metric) => metric.numericValue) }];
      const chartValues = chartSeries[0].values;
      const chartPackSelection = resolveChartPack({ slidePlan: activeSlidePlan, style: activeRequestStyle, nativeType: "bar" });
      const packLabels = chartPackSelection.pack.treatment.dataLabels;
      const labelPolicy = chartLabelPolicy(chartName, {
        position: activeChartLabelFixture ? "outEnd" : packLabels.position,
        fontSize: activeChartLabelFixture ? 48 : packLabels.fontSize,
        displayStrategy: activeChartLabelFixture ? "all" : packLabels.showValue ? "all" : "none"
      });
      const nativeChartStyle = mapChartPackToNative(chartPackSelection, t, labelPolicy);
      slide.charts.add("bar", {
        name: chartName, position: chartPosition, categories: chartCategories,
        series: chartSeries.map((series, seriesIndex) => ({ ...series, fill: nativeChartStyle.seriesFills[seriesIndex % nativeChartStyle.seriesFills.length] })),
        barOptions: nativeChartStyle.barOptions, hasLegend: nativeChartStyle.hasLegend,
        legendPosition: nativeChartStyle.legendPosition,
        dataLabels: nativeChartStyle.dataLabels,
        xAxis: nativeChartStyle.xAxis,
        yAxis: nativeChartStyle.yAxis,
        chartFill: nativeChartStyle.chartFill, plotAreaFill: nativeChartStyle.plotAreaFill,
        chartLine: nativeChartStyle.chartLine, plotAreaLine: nativeChartStyle.plotAreaLine
      });
      chartPackSelections.push({
        slide: activeSlideNumber,
        objectName: chartName,
        requestedId: chartPackSelection.requestedId,
        resolvedId: chartPackSelection.resolvedId,
        packVersion: chartPackSelection.packVersion,
        source: chartPackSelection.source,
        nativeType: chartPackSelection.nativeType,
        status: chartPackSelection.status,
        reason: chartPackSelection.reason
      });
      recordChartMetadata(activeSlideNumber, {
        objectName: chartName,
        bbox: [chartPosition.left, chartPosition.top, chartPosition.width, chartPosition.height],
        plotAreaBbox: [chartPosition.left + 65, chartPosition.top + 35, chartPosition.width - 95, chartPosition.height - 80],
        categories: chartCategories,
        series: chartSeries,
        minimumScale: 0,
        maximumScale: 100,
        barDirection: "column",
        dataLabels: { showValue: labelPolicy.displayStrategy === "all", position: labelPolicy.position, fontSize: labelPolicy.fontSize, displayStrategy: labelPolicy.displayStrategy, suffix: boundRateChart ? "" : "%" }
      });
      if (boundRateChart) bindingRenderEvidence.push({ slide: activeSlideNumber, id: boundRateChart.id, kind: "chart", objectName: chartName, chart: { categories: chartCategories, series: chartSeries } });
      const delta = chartValues.length >= 2 ? chartValues[1] - chartValues[0] : null;
      slide.shapes.add({ geometry: "rect", name: "metric-decision-field", position: { left: 870, top: 190, width: 330, height: 380 }, fill: t.dark, line: { style: "solid", fill: "none", width: 0 } });
      addText(slide, "metric-delta-label", "OPERATING GAP", { left: 905, top: 228, width: 230, height: 28 }, { fontSize: 12, bold: true, color: t.secondary, typeface: t.typeface, characterSpacing: 1 });
      addText(slide, "metric-delta", delta === null ? "—" : `${delta > 0 ? "+" : ""}${delta.toFixed(0)} pp`, { left: 905, top: 280, width: 240, height: 86 }, { fontSize: 50, bold: true, color: "#FFFFFF", typeface: t.typeface });
      addText(slide, "metric-decision-copy", points[1] ?? points[0], { left: 905, top: 395, width: 245, height: 115 }, { fontSize: 17, color: "#D5E0E8", typeface: t.typeface, autoFit: "shrinkText" });
    } else {
      metrics.slice(0, 3).forEach((metric, i) => {
        const x = 72 + i * 374;
        slide.shapes.add({ geometry: "rect", name: `metric-band-${i + 1}`, position: { left: x, top: 205, width: 342, height: 300 }, fill: i === 0 ? t.dark : t.panel, line: { style: "solid", fill: i === 0 ? "none" : t.pale, width: 1 } });
        addText(slide, `metric-value-${i + 1}`, metric.value, { left: x + 28, top: 250, width: 280, height: 90 }, { fontSize: 46, bold: true, color: i === 0 ? "#FFFFFF" : t.accent, typeface: t.typeface, autoFit: "shrinkText" });
        addText(slide, `metric-context-${i + 1}`, metric.sourceText, { left: x + 28, top: 370, width: 280, height: 90 }, { fontSize: 15, color: i === 0 ? "#D5E0E8" : t.ink, typeface: t.typeface, autoFit: "shrinkText" });
      });
    }
    slide.speakerNotes.textFrame.setText(`[Sources]\n- User-provided material.\n- Native business metrics from Content Analysis JSON.${activeResolvedBindings.length ? "\n- Resolved local values from BINDING_MANIFEST.json." : ""}`);
    return;
  }
  if (direction === "C") {
    addText(slide, "data-editorial-label", "SIGNAL / EVIDENCE / IMPLICATION", { left: 76, top: 176, width: 500, height: 26 }, { fontSize: 12, bold: true, color: t.accent, typeface: t.typeface, characterSpacing: 1 });
    metrics.slice(0, 3).forEach((metric, i) => {
      const y = 225 + i * 112;
      slide.shapes.add({ geometry: "rect", name: `signal-rule-${i + 1}`, position: { left: 76, top: y + 74, width: 1080 - i * 130, height: 3 }, fill: i === 0 ? t.accent : t.pale, line: { style: "solid", fill: "none", width: 0 } });
      addText(slide, `signal-value-${i + 1}`, metric.value, { left: 76, top: y, width: 210, height: 68 }, { fontSize: 38 - i * 3, bold: true, color: i === 0 ? t.accent : t.ink, typeface: t.typeface });
      addText(slide, `signal-copy-${i + 1}`, metric.sourceText, { left: 310, top: y + 4, width: 760, height: 54 }, { fontSize: 16, color: t.ink, typeface: t.typeface, autoFit: "shrinkText" });
    });
    slide.speakerNotes.textFrame.setText("[Sources]\n- User-provided material.\n- Native business metrics from Content Analysis JSON.");
    return;
  }
  const primary = metrics[0];
  slide.shapes.add({ geometry: "rect", name: "metric-editorial-field", position: { left: 72, top: 190, width: 470, height: 360 }, fill: t.panel, line: { style: "solid", fill: t.pale, width: 1 } });
  addText(slide, "metric-editorial-kicker", "PRIMARY SIGNAL", { left: 108, top: 226, width: 240, height: 26 }, { fontSize: 12, bold: true, color: t.accent, typeface: t.typeface, characterSpacing: 1 });
  addText(slide, "metric-editorial-value", primary?.value ?? "—", { left: 105, top: 278, width: 360, height: 105 }, { fontSize: 58, bold: true, color: t.accent, typeface: t.typeface, autoFit: "shrinkText" });
  addText(slide, "metric-editorial-copy", primary?.sourceText ?? points[0], { left: 108, top: 420, width: 360, height: 90 }, { fontSize: 16, color: t.ink, typeface: t.typeface, autoFit: "shrinkText" });
  metrics.slice(1, 4).forEach((metric, i) => {
    const y = 205 + i * 116;
    addText(slide, `metric-side-value-${i + 1}`, metric.value, { left: 640, top: y, width: 210, height: 58 }, { fontSize: 31, bold: true, color: t.ink, typeface: t.typeface });
    addText(slide, `metric-side-copy-${i + 1}`, metric.sourceText, { left: 860, top: y + 2, width: 320, height: 58 }, { fontSize: 14, color: t.muted, typeface: t.typeface, autoFit: "shrinkText" });
    slide.shapes.add({ geometry: "rect", name: `metric-side-rule-${i + 1}`, position: { left: 640, top: y + 78, width: 540, height: 1 }, fill: t.pale, line: { style: "solid", fill: "none", width: 0 } });
  });
  slide.speakerNotes.textFrame.setText("[Sources]\n- User-provided material.\n- Native business metrics from Content Analysis JSON.");
}

function addEvidenceEditorial(presentation, slideData, t, index, total, label) {
  const slide = presentation.slides.add();
  addChrome(slide, t, index, total, label);
  const clauses = slideData.message.split(/[，。；]/).map((part) => part.trim()).filter(Boolean);
  const claim = clauses[0] ?? slideData.message;
  const points = (slideData.supportingPoints ?? []).filter((point) => point !== slideData.message);
  const proofs = [...clauses.slice(1), ...points].filter((point, i, all) => point && all.indexOf(point) === i).slice(0, 3);
  addText(slide, "slide-title", "运营问题必须按一条链路治理", { left: 72, top: 76, width: 1030, height: 64 }, { fontSize: 32, bold: true, color: t.ink, typeface: t.typeface });
  slide.shapes.add({ geometry: "rect", name: "editorial-answer-field", position: { left: 72, top: 178, width: 540, height: 380 }, fill: t.dark, line: { style: "solid", fill: "none", width: 0 } });
  addText(slide, "editorial-kicker", "OPERATING PRINCIPLE", { left: 108, top: 216, width: 280, height: 26 }, { fontSize: 12, bold: true, color: t.secondary, typeface: t.typeface, characterSpacing: 1 });
  addText(slide, "editorial-claim", claim, { left: 108, top: 275, width: 430, height: 190 }, { fontSize: 34, bold: true, color: "#FFFFFF", typeface: t.typeface, autoFit: "shrinkText" });
  addText(slide, "editorial-caption", "从单点系统建设转向跨环节经营闭环", { left: 108, top: 490, width: 420, height: 36 }, { fontSize: 15, color: "#D5E0E8", typeface: t.typeface });
  proofs.forEach((point, i) => {
    const y = 195 + i * 116;
    addText(slide, `editorial-number-${i + 1}`, `0${i + 1}`, { left: 690, top: y, width: 55, height: 40 }, { fontSize: 18, bold: true, color: t.secondary, typeface: t.typeface });
    addText(slide, `editorial-proof-${i + 1}`, point, { left: 770, top: y - 2, width: 390, height: 76 }, { fontSize: 18, color: t.ink, typeface: t.typeface, autoFit: "shrinkText" });
    slide.shapes.add({ geometry: "rect", name: `editorial-proof-rule-${i + 1}`, position: { left: 690, top: y + 88, width: 470, height: 1 }, fill: t.pale, line: { style: "solid", fill: "none", width: 0 } });
  });
  slide.speakerNotes.textFrame.setText("[Sources]\n- User-provided material and derived storyline JSON.");
}

function addEvidenceComparison(presentation, slideData, t, index, total, label) {
  const slide = presentation.slides.add();
  addChrome(slide, t, index, total, label);
  addText(slide, "slide-title", slideData.message, { left: 72, top: 76, width: 1030, height: 88 }, { fontSize: 36, bold: true, color: t.ink, typeface: t.typeface, autoFit: "shrinkText" });
  const points = (slideData.supportingPoints?.length ? slideData.supportingPoints : [slideData.message, "下一步行动"]).slice(0, 4);
  slide.shapes.add({ geometry: "rect", name: "comparison-left-field", position: { left: 72, top: 200, width: 500, height: 330 }, fill: t.panel, line: { style: "solid", fill: t.accent, width: 2 } });
  addText(slide, "comparison-left-label", "NOW", { left: 105, top: 230, width: 160, height: 50 }, { fontSize: 28, bold: true, color: t.accent, typeface: t.typeface });
  addText(slide, "comparison-left-copy", points.slice(0, 2).join("\n\n"), { left: 105, top: 305, width: 400, height: 170 }, { fontSize: 20, color: t.ink, typeface: t.typeface, autoFit: "shrinkText" });
  addText(slide, "comparison-right-label", "NEXT", { left: 700, top: 230, width: 180, height: 50 }, { fontSize: 28, bold: true, color: t.secondary, typeface: t.typeface });
  addText(slide, "comparison-right-copy", (points.slice(2).length ? points.slice(2) : points.slice(0, 2)).join("\n\n"), { left: 700, top: 305, width: 420, height: 170 }, { fontSize: 20, color: t.ink, typeface: t.typeface, autoFit: "shrinkText" });
  slide.speakerNotes.textFrame.setText("[Sources]\n- User-provided material and derived storyline JSON.");
}

function addTimeline(presentation, slideData, t, index, total, label) {
  const slide = presentation.slides.add();
  addChrome(slide, t, index, total, label);
  addText(slide, "slide-title", slideData.message, { left: 72, top: 76, width: 1080, height: 82 }, { fontSize: 31, bold: true, color: t.ink, typeface: t.typeface, autoFit: "shrinkText" });
  const points = (slideData.supportingPoints ?? []).slice(0, 3);
  const metric = (slideData.metrics ?? [])[0];
  slide.shapes.add({ geometry: "rect", name: "timeline-spine", position: { left: 205, top: 334, width: 820, height: 4 }, fill: t.pale, line: { style: "solid", fill: "none", width: 0 } });
  [0, 1].forEach((step) => {
    const x = 160 + step * 520;
    slide.shapes.add({ geometry: "ellipse", name: `timeline-node-${step + 1}`, position: { left: x, top: 298, width: 76, height: 76 }, fill: step === 0 ? t.accent : t.secondary, line: { style: "solid", fill: "none", width: 0 } });
    addText(slide, `timeline-step-${step + 1}`, `0${step + 1}`, { left: x, top: 317, width: 76, height: 30 }, { fontSize: 17, bold: true, color: "#FFFFFF", alignment: "center", typeface: t.typeface });
    addText(slide, `timeline-label-${step + 1}`, step === 0 ? `建立基线${metric ? ` · ${metric.value}` : ""}` : "打通运营链路", { left: x - 35, top: 220, width: 330, height: 52 }, { fontSize: 22, bold: true, color: t.ink, typeface: t.typeface });
    addText(slide, `timeline-copy-${step + 1}`, points[step] ?? slideData.message, { left: x - 35, top: 405, width: 370, height: 95 }, { fontSize: 16, color: t.muted, typeface: t.typeface, autoFit: "shrinkText" });
  });
  addText(slide, "timeline-decision", "先统一事件与责任口径，再扩展算法和系统覆盖。", { left: 760, top: 545, width: 420, height: 42 }, { fontSize: 17, bold: true, color: t.accent, alignment: "right", typeface: t.typeface });
  slide.speakerNotes.textFrame.setText("[Sources]\n- User-provided material.\n- Timeline derived from Slide Plan JSON.");
}

function addDecisionGates(presentation, slideData, t, index, total, label) {
  const slide = presentation.slides.add();
  addChrome(slide, t, index, total, label);
  addText(slide, "slide-title", "目标明确，但扩围必须经过两道门槛", { left: 72, top: 76, width: 1080, height: 72 }, { fontSize: 32, bold: true, color: t.ink, typeface: t.typeface });
  const metrics = (slideData.metrics ?? []).slice(0, 8);
  const targetMetrics = metrics.filter((metric) => /目标|恢复|提高|压缩/.test(metric.sourceText)).slice(0, 3);
  const displayMetrics = targetMetrics.length >= 3 ? targetMetrics : metrics.slice(0, 3);
  displayMetrics.forEach((metric, i) => {
    const x = 72 + i * 370;
    addText(slide, `target-value-${i + 1}`, metric.value, { left: x, top: 190, width: 300, height: 80 }, { fontSize: 43, bold: true, color: i === 0 ? t.accent : t.ink, typeface: t.typeface });
    addText(slide, `target-context-${i + 1}`, metric.sourceText, { left: x, top: 286, width: 310, height: 80 }, { fontSize: 14, color: t.muted, typeface: t.typeface, autoFit: "shrinkText" });
  });
  slide.shapes.add({ geometry: "rect", name: "gate-field", position: { left: 72, top: 420, width: 1128, height: 145 }, fill: t.dark, line: { style: "solid", fill: "none", width: 0 } });
  addText(slide, "gate-label", "GO / NO-GO", { left: 108, top: 452, width: 190, height: 28 }, { fontSize: 12, bold: true, color: t.secondary, typeface: t.typeface, characterSpacing: 1 });
  addText(slide, "gate-copy", slideData.supportingPoints?.[1] ?? slideData.supportingPoints?.[0] ?? slideData.message, { left: 330, top: 447, width: 810, height: 78 }, { fontSize: 18, bold: true, color: "#FFFFFF", typeface: t.typeface, autoFit: "shrinkText" });
  slide.speakerNotes.textFrame.setText("[Sources]\n- User-provided material.\n- Targets and guardrails from Slide Plan JSON.");
}

function addConclusion(presentation, slideData, t, index, total, label) {
  const slide = presentation.slides.add();
  addChrome(slide, t, index, total, label);
  slide.shapes.add({ geometry: "rect", name: "conclusion-answer-field", position: { left: 72, top: 150, width: 500, height: 420 }, fill: t.dark, line: { style: "solid", fill: "none", width: 0 } });
  addText(slide, "conclusion-label", "DECISION", { left: 110, top: 196, width: 220, height: 28 }, { fontSize: 12, bold: true, color: t.secondary, typeface: t.typeface, characterSpacing: 1 });
  addText(slide, "conclusion-title", "先做两厂试点，\n用结果决定扩围", { left: 108, top: 260, width: 390, height: 150 }, { fontSize: 34, bold: true, color: "#FFFFFF", typeface: t.typeface });
  addText(slide, "conclusion-subtitle", "数据治理、现场流程和责任机制优先于新增大屏。", { left: 110, top: 455, width: 390, height: 65 }, { fontSize: 16, color: "#D5E0E8", typeface: t.typeface, autoFit: "shrinkText" });
  (slideData.supportingPoints ?? []).slice(0, 3).forEach((point, i) => {
    const y = 185 + i * 125;
    addText(slide, `conclusion-index-${i + 1}`, `0${i + 1}`, { left: 650, top: y, width: 50, height: 28 }, { fontSize: 15, bold: true, color: t.secondary, typeface: t.typeface });
    addText(slide, `conclusion-point-${i + 1}`, point, { left: 725, top: y - 4, width: 430, height: 82 }, { fontSize: 17, color: t.ink, typeface: t.typeface, autoFit: "shrinkText" });
    slide.shapes.add({ geometry: "rect", name: `conclusion-rule-${i + 1}`, position: { left: 650, top: y + 92, width: 505, height: 1 }, fill: t.pale, line: { style: "solid", fill: "none", width: 0 } });
  });
  slide.speakerNotes.textFrame.setText("[Sources]\n- User-provided material and derived Slide Plan JSON.");
}

function addContentSlide(presentation, slideData, t, index, total, label, direction) {
  if (slideData.role === "cover") return addCover(presentation, slideData, t, index, total, label, direction);
  if (slideData.role === "executive_summary") return addSummary(presentation, slideData, t, index, total, label, direction);
  if (slideData.components?.includes("native_timeline")) return addTimeline(presentation, slideData, t, index, total, label);
  if (slideData.role === "strategy") return addDecisionGates(presentation, slideData, t, index, total, label);
  if (slideData.role === "conclusion" || slideData.role === "ending") return addConclusion(presentation, slideData, t, index, total, label);
  if (slideData.role === "evidence") {
    if (slideData.metrics?.length) return addDataSlide(presentation, slideData, t, index, total, label, direction);
    if (direction === "C") return addEvidenceComparison(presentation, slideData, t, index, total, label);
    return addEvidenceEditorial(presentation, slideData, t, index, total, label);
  }
  const slide = presentation.slides.add();
  addChrome(slide, t, index, total, label);
  addText(slide, "slide-title", slideData.message, { left: 72, top: 76, width: 1020, height: 88 }, { fontSize: 36, bold: true, color: t.ink, typeface: t.typeface, autoFit: "shrinkText" });
  const points = (slideData.supportingPoints ?? []).slice(0, 4);
  addText(slide, "primary-callout", points[0] ?? slideData.message, { left: 80, top: 215, width: 520, height: 230 }, { fontSize: 28, bold: true, color: t.ink, typeface: t.typeface, autoFit: "shrinkText" });
  points.slice(1).forEach((point, i) => addText(slide, `support-${i + 1}`, `— ${point}`, { left: 690, top: 220 + i * 108, width: 440, height: 80 }, { fontSize: 19, color: t.ink, typeface: t.typeface, autoFit: "shrinkText" }));
  slide.shapes.add({ geometry: "rect", name: "content-divider", position: { left: 635, top: 200, width: 3, height: 330 }, fill: t.accent, line: { style: "solid", fill: "none", width: 0 } });
  slide.speakerNotes.textFrame.setText("[Sources]\n- User-provided material and derived storyline JSON.");
}

async function writeBlob(target, blob) {
  await fs.writeFile(target, new Uint8Array(await blob.arrayBuffer()));
}

const [requestPath] = process.argv.slice(2);
if (!requestPath) throw new Error("Usage: generate-deck.mjs <request.json>");
const request = JSON.parse(await fs.readFile(requestPath, "utf8"));
const activeRequestStyle = request.style;
const typographyTarget = request.repairPlan?.targets?.find((target) => target.dimension === "typography" && target.adjustments?.fontScale);
activeTypographyRepair = typographyTarget ? {
  objectNames: typographyTarget.objectNames ?? [],
  fontScale: Math.max(0.9, Math.min(1.15, Number(typographyTarget.adjustments.fontScale)))
} : null;
activeContrastRepairs = (request.repairPlan?.targets ?? [])
  .filter((target) => target.dimension === "contrast" && /^#[0-9A-Fa-f]{6}$/.test(target.adjustments?.foregroundColor ?? ""))
  .map((target) => ({ slide: target.slide, objectNames: target.objectNames ?? [], foregroundColor: target.adjustments.foregroundColor.toUpperCase() }));
activeFontFallbackRepairs = (request.repairPlan?.targets ?? [])
  .filter((target) => target.dimension === "fontFallback" && typeof target.adjustments?.replacementTypeface === "string" && target.adjustments.replacementTypeface.trim())
  .map((target) => ({ slide: target.slide, objectNames: target.objectNames ?? [], replacementTypeface: target.adjustments.replacementTypeface.trim() }));
activeImageRepairs = (request.repairPlan?.targets ?? [])
  .filter((target) => target.dimension === "imageDistortion" && target.adjustments?.imagePosition)
  .map((target) => ({
    slide: target.slide,
    objectNames: target.objectNames ?? [],
    fit: target.adjustments.imageFit === "cover" ? "cover" : "contain",
    crop: target.adjustments.imageCrop ?? { left: 0, top: 0, right: 0, bottom: 0 },
    position: target.adjustments.imagePosition
  }));
activeChartLabelRepairs = (request.repairPlan?.targets ?? [])
  .filter((target) => target.dimension === "chartLabelCollision")
  .map((target) => ({ slide: target.slide, objectNames: target.objectNames ?? [], adjustments: target.adjustments ?? {} }));
activeChartLabelFixture = request.qaFixture?.chartLabelCollision === true;
await fs.mkdir(request.outputDir, { recursive: true });
const { Presentation, PresentationFile } = await loadArtifactTool();
const presentation = Presentation.create({ slideSize: { width: 1280, height: 720 } });
const t = tokens(request.direction, request.style, request.controls);
if (activeChartLabelFixture) t.muted = "#616E7E";
const plannedSlides = Array.isArray(request.slidePlans) && request.slidePlans.length
  ? request.slidePlans.map((plan) => ({ slideIndex: plan.slideIndex, role: plan.role, message: plan.message, supportingPoints: plan.content ?? [], metrics: plan.metrics ?? [], components: plan.components ?? [], resolvedBindings: plan.resolvedBindings ?? [], chartPackRef: plan.chartPackRef }))
  : request.storyline.slides;
const slides = request.preview ? [plannedSlides[0], plannedSlides[1], plannedSlides.find((slide) => slide.role === "evidence" && slide.metrics?.length >= 2) ?? plannedSlides.find((slide) => slide.role === "evidence") ?? plannedSlides[2]] : plannedSlides;
slides.forEach((slide, index) => {
  activeSlideNumber = index + 1;
  activeSlidePlan = slide;
  activeResolvedBindings = slide.resolvedBindings ?? [];
  addContentSlide(presentation, slide, t, index + 1, slides.length, `${request.direction} · ${t.label}`, request.direction);
});

const imageMetadata = [];
if (request.imageQaFixture && presentation.slides.items.length) {
  const objectName = "qa-fixture-image";
  const repair = activeImageRepairs.find((target) => (!target.slide || target.slide === 1) && target.objectNames.some((pattern) => matchesObjectPattern(objectName, pattern)));
  const position = repair?.position ?? { left: 1000, top: 280, width: 230, height: 320 };
  const sourceSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="640" height="360" fill="#123B5D"/><circle cx="320" cy="180" r="122" fill="#C18A32"/><circle cx="320" cy="180" r="58" fill="#FFFFFF"/><path d="M40 60H600M40 300H600M80 24V336M560 24V336" stroke="#8DB5D0" stroke-width="12"/></svg>`);
  const fixtureBytes = await sharp(sourceSvg).png().toBuffer();
  await fs.writeFile(path.join(request.outputDir, "qa-fixture-source.png"), fixtureBytes);
  const image = presentation.slides.items[0].images.add({
    name: objectName,
    blob: fixtureBytes,
    contentType: "image/png",
    alt: "Image QA aspect-ratio fixture",
    position,
    ...(repair ? { fit: repair.fit, crop: repair.crop } : {})
  });
  image.name = objectName;
  imageMetadata.push({
    slide: 1,
    objectName,
    assetPath: "qa-fixture-source.png",
    assetStatus: "valid",
    sourceWidth: 640,
    sourceHeight: 360,
    position,
    fit: repair?.fit ?? "stretch",
    crop: repair?.crop
  });
}

for (const [index, slide] of presentation.slides.items.entries()) {
  const stem = `slide-${String(index + 1).padStart(3, "0")}`;
  await writeBlob(path.join(request.outputDir, `${stem}.png`), await presentation.export({ slide, format: "png", scale: 1 }));
  const layout = await slide.export({ format: "layout" });
  const layoutJson = JSON.parse(await layout.text());
  layoutJson.chartMetadata = {
    schema: "ppt-factory/chart-labels/v1",
    charts: chartMetadataBySlide.get(index + 1) ?? []
  };
  await fs.writeFile(path.join(request.outputDir, `${stem}.layout.json`), JSON.stringify(layoutJson, null, 2), "utf8");
}
await createContactSheet(request.outputDir, presentation.slides.items.length);
const inspect = await presentation.inspect({ kind: "slide,textbox,shape,image,table,chart", maxChars: 1000000 });
await fs.writeFile(path.join(request.outputDir, "inspect.ndjson"), inspect.ndjson, "utf8");
await fs.writeFile(path.join(request.outputDir, "font-evidence.json"), JSON.stringify({
  version: 1,
  source: "native-pptx-renderer",
  objects: fontEvidence
}, null, 2), "utf8");
await fs.writeFile(path.join(request.outputDir, "image-metadata.json"), JSON.stringify(imageMetadata, null, 2), "utf8");
await fs.writeFile(path.join(request.outputDir, "binding-render-evidence.json"), JSON.stringify({
  schema: "ppt-factory/binding-render-evidence/v1",
  sourceHash: request.bindingManifest?.source?.inputHash ?? null,
  appliedTargets: bindingRenderEvidence
}, null, 2), "utf8");
await fs.writeFile(path.join(request.outputDir, "chart-pack-manifest.json"), JSON.stringify({
  schema: "ppt-factory/chart-pack-manifest/v1",
  libraryVersion: createChartPackLibrary().version,
  charts: chartPackSelections
}, null, 2), "utf8");
const pptx = await PresentationFile.exportPptx(presentation);
await pptx.save(request.outputPptx);
console.log(JSON.stringify({ pptx: request.outputPptx, slides: slides.length, direction: request.direction, typographyRepair: activeTypographyRepair, contrastRepairs: activeContrastRepairs, fontFallbackRepairs: activeFontFallbackRepairs, imageRepairs: activeImageRepairs, chartLabelRepairs: activeChartLabelRepairs, bindingTargetsApplied: bindingRenderEvidence.length, imageObjects: imageMetadata.length }));
