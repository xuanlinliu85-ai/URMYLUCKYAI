import type { SlidePlan, StyleDna } from "./types";

export type ChartPackId = "chart_restrained_business_v1" | "chart_contrast_signal_v1";
export type ChartPackSelection = {
  schema: "ppt-factory/chart-pack-selection/v1";
  requestedId: string;
  resolvedId: ChartPackId;
  packVersion: string;
  source: "slide-plan" | "style-dna" | "style-dna-legacy-map" | "default";
  nativeType: string;
  status: "selected" | "fallback";
  reason: string;
  pack: Record<string, unknown>;
};

export const DEFAULT_CHART_PACK_ID: ChartPackId;
export function createChartPackLibrary(): Record<string, unknown>;
export function resolveChartPack(input?: { slidePlan?: SlidePlan; style?: StyleDna; nativeType?: string }): ChartPackSelection;
export function mapChartPackToNative(selection: ChartPackSelection, tokens: Record<string, string>, labelPolicy: { position: string; fontSize: number; displayStrategy: string }): Record<string, unknown>;
