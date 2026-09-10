export type LongImageExportRequest = {
  sourceDir: string;
  outputDir: string;
  slides: number[];
  basename?: string;
  background?: string;
};

export function createLongImageExport(request: LongImageExportRequest): Promise<Record<string, unknown> & {
  manifestPath: string;
  slideOrder: number[];
  variants: {
    vertical9x16: { path: string; width: number; height: number };
    highResolution2160w: { path: string; width: number; height: number };
  };
}>;
