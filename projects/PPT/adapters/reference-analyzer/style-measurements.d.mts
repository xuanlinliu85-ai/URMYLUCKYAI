import type { ReferenceStyleMeasurements } from "../../lib/types";

export function measureReferenceStyle(input: {
  slides: Array<{ slide: number; xml: string; charts?: Array<{ name: string; xml: string }> }>;
  slideSize: { widthEmu: number; heightEmu: number };
}): ReferenceStyleMeasurements;
