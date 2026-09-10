export const DEFAULT_CHART_PACK_ID = "chart_restrained_business_v1";

const PACKS = Object.freeze([
  Object.freeze({
    schema: "ppt-factory/chart-pack/v1",
    id: DEFAULT_CHART_PACK_ID,
    version: "1.0.0",
    name: "Restrained Business Bar",
    description: "Light, direct-label business chart with restrained gridlines.",
    supportedNativeTypes: ["bar"],
    treatment: {
      surface: "light",
      palette: ["accent", "secondary", "muted"],
      bar: { direction: "column", grouping: "clustered", gapWidth: 68 },
      legend: { show: false, position: "bottom" },
      dataLabels: { showValue: true, position: "outEnd", fontSize: 16, bold: true },
      axes: { categoryGridlines: "none", valueGridlines: "major", categoryFontSize: 13, valueFontSize: 11 }
    }
  }),
  Object.freeze({
    schema: "ppt-factory/chart-pack/v1",
    id: "chart_contrast_signal_v1",
    version: "1.0.0",
    name: "Contrast Signal Bar",
    description: "Dark signal surface, tighter columns and high-contrast direct labels.",
    supportedNativeTypes: ["bar"],
    treatment: {
      surface: "dark",
      palette: ["secondary", "accent", "light"],
      bar: { direction: "column", grouping: "clustered", gapWidth: 36 },
      legend: { show: false, position: "bottom" },
      dataLabels: { showValue: true, position: "outEnd", fontSize: 15, bold: true },
      axes: { categoryGridlines: "none", valueGridlines: "major", categoryFontSize: 13, valueFontSize: 11 }
    }
  })
]);

export function createChartPackLibrary() {
  return {
    schema: "ppt-factory/chart-pack-library/v1",
    version: "1.0.0",
    defaultPackId: DEFAULT_CHART_PACK_ID,
    packs: structuredClone(PACKS)
  };
}

function requestedPackId({ slidePlan, style }) {
  if (typeof slidePlan?.chartPackRef === "string" && slidePlan.chartPackRef.trim()) return { id: slidePlan.chartPackRef.trim(), source: "slide-plan" };
  if (typeof style?.charts?.chartPackId === "string" && style.charts.chartPackId.trim()) return { id: style.charts.chartPackId.trim(), source: "style-dna" };
  if (style?.charts?.style === "contrast-signal-native") return { id: "chart_contrast_signal_v1", source: "style-dna-legacy-map" };
  return { id: DEFAULT_CHART_PACK_ID, source: "default" };
}

export function resolveChartPack({ slidePlan, style, nativeType = "bar" } = {}) {
  const requested = requestedPackId({ slidePlan, style });
  const match = PACKS.find((pack) => pack.id === requested.id);
  const compatible = match?.supportedNativeTypes.includes(nativeType);
  const pack = compatible ? match : PACKS[0];
  const status = compatible ? "selected" : "fallback";
  const reason = compatible
    ? `${requested.source}:${requested.id}`
    : match
      ? `unsupported-native-type:${nativeType}`
      : `unknown-pack:${requested.id}`;
  return {
    schema: "ppt-factory/chart-pack-selection/v1",
    requestedId: requested.id,
    resolvedId: pack.id,
    packVersion: pack.version,
    source: requested.source,
    nativeType,
    status,
    reason,
    pack: structuredClone(pack)
  };
}

export function mapChartPackToNative(selection, tokens, labelPolicy) {
  const treatment = selection.pack.treatment;
  const dark = treatment.surface === "dark";
  const paletteTokens = {
    accent: tokens.accent,
    secondary: tokens.secondary,
    muted: tokens.muted,
    light: "#DDE8F0"
  };
  return {
    seriesFills: treatment.palette.map((name) => paletteTokens[name] ?? tokens.accent),
    barOptions: { ...treatment.bar },
    hasLegend: treatment.legend.show,
    legendPosition: treatment.legend.position,
    dataLabels: {
      showValue: labelPolicy.displayStrategy === "all" && treatment.dataLabels.showValue,
      position: labelPolicy.position ?? treatment.dataLabels.position,
      textStyle: {
        fill: dark ? "#FFFFFF" : tokens.ink,
        fontSize: labelPolicy.fontSize ?? treatment.dataLabels.fontSize,
        bold: treatment.dataLabels.bold
      }
    },
    xAxis: {
      majorGridlines: treatment.axes.categoryGridlines === "major" ? { style: "solid", fill: dark ? "#5F7181" : tokens.pale, width: 1 } : null,
      textStyle: { fill: dark ? "#DDE8F0" : tokens.muted, fontSize: treatment.axes.categoryFontSize }
    },
    yAxis: {
      minimumScale: 0,
      maximumScale: 100,
      majorGridlines: treatment.axes.valueGridlines === "major" ? { style: "solid", fill: dark ? "#5F7181" : tokens.pale, width: 1 } : null,
      textStyle: { fill: dark ? "#DDE8F0" : tokens.muted, fontSize: treatment.axes.valueFontSize }
    },
    chartFill: dark ? tokens.dark : tokens.panel,
    plotAreaFill: dark ? tokens.dark : tokens.panel,
    chartLine: { style: "solid", fill: "none", width: 0 },
    plotAreaLine: { style: "solid", fill: "none", width: 0 }
  };
}
