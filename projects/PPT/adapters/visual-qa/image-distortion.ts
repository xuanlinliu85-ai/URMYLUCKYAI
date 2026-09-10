import { access, readFile } from "node:fs/promises";
import path from "node:path";
import type { ImageDistortionFinding, ImageDistortionReport } from "@/lib/types";

type ImageMetadata = {
  slide: number;
  objectName: string;
  assetPath?: string;
  assetStatus?: "valid" | "missing" | "invalid";
  sourceWidth?: number;
  sourceHeight?: number;
  position?: { left: number; top: number; width: number; height: number };
  fit?: "contain" | "cover" | "stretch" | "unknown";
  crop?: { left: number; top: number; right: number; bottom: number };
};

const SLIDE_WIDTH = 1280;
const SLIDE_HEIGHT = 720;

async function exists(file: string) {
  try { await access(file); return true; } catch { return false; }
}

function finitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function safePosition(sourceRatio: number, current: NonNullable<ImageMetadata["position"]>) {
  let width = Math.min(current.width, SLIDE_WIDTH - Math.max(0, current.left));
  let height = width / sourceRatio;
  if (height > SLIDE_HEIGHT) {
    height = SLIDE_HEIGHT;
    width = height * sourceRatio;
  }
  const left = Math.max(0, Math.min(SLIDE_WIDTH - width, current.left + (current.width - width) / 2));
  const top = Math.max(0, Math.min(SLIDE_HEIGHT - height, current.top + (current.height - height) / 2));
  return { left: Number(left.toFixed(2)), top: Number(top.toFixed(2)), width: Number(width.toFixed(2)), height: Number(height.toFixed(2)) };
}

export async function measureImageDistortion(renderDir: string): Promise<ImageDistortionReport> {
  const metadataPath = path.join(renderDir, "image-metadata.json");
  if (!(await exists(metadataPath))) return { score: 100, target: 100, passed: true, checkedObjects: 0, failingObjects: 0, findings: [] };
  const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as ImageMetadata[];
  const inspectPath = path.join(renderDir, "inspect.ndjson");
  const inspect = await exists(inspectPath) ? await readFile(inspectPath, "utf8") : "";
  const layoutCache = new Map<number, string>();
  const findings: ImageDistortionFinding[] = [];

  for (const image of metadata) {
    const evidence: ImageDistortionFinding["evidence"] = ["native-image-metadata"];
    if (inspect.includes(image.objectName)) evidence.push("inspect");
    if (!layoutCache.has(image.slide)) {
      const layoutPath = path.join(renderDir, `slide-${String(image.slide).padStart(3, "0")}.layout.json`);
      layoutCache.set(image.slide, await exists(layoutPath) ? await readFile(layoutPath, "utf8") : "");
    }
    if (layoutCache.get(image.slide)?.includes(image.objectName)) evidence.push("layout");
    const base = { slide: image.slide, objectName: image.objectName, evidence };
    if (image.assetStatus === "missing" || (image.assetPath && !(await exists(path.resolve(renderDir, image.assetPath))))) {
      findings.push({ ...base, reason: "missing_asset", severity: "critical", passed: false });
      continue;
    }
    if (image.assetStatus === "invalid") {
      findings.push({ ...base, reason: "invalid_asset", severity: "critical", passed: false });
      continue;
    }
    const p = image.position;
    if (!p || !finitePositive(p.width) || !finitePositive(p.height) || !Number.isFinite(p.left) || !Number.isFinite(p.top)) {
      findings.push({ ...base, reason: "invalid_geometry", severity: "critical", passed: false });
      continue;
    }
    const sourceRatio = finitePositive(image.sourceWidth) && finitePositive(image.sourceHeight) ? image.sourceWidth / image.sourceHeight : undefined;
    const displayRatio = p.width / p.height;
    const recommendedPosition = sourceRatio ? safePosition(sourceRatio, p) : {
      left: Math.max(0, p.left), top: Math.max(0, p.top), width: Math.min(p.width, SLIDE_WIDTH), height: Math.min(p.height, SLIDE_HEIGHT)
    };
    if (p.left < 0 || p.top < 0 || p.left + p.width > SLIDE_WIDTH || p.top + p.height > SLIDE_HEIGHT) {
      findings.push({ ...base, reason: "out_of_bounds", severity: "critical", fit: image.fit ?? "unknown", passed: false, recommendedFit: "contain", recommendedCrop: { left: 0, top: 0, right: 0, bottom: 0 }, recommendedPosition });
      continue;
    }
    if (sourceRatio) {
      const ratioDelta = Math.abs(Math.log(displayRatio / sourceRatio));
      const protectedFit = image.fit === "contain" || image.fit === "cover";
      if (!protectedFit && ratioDelta > 0.12) {
        findings.push({
          ...base, reason: "stretched_aspect_ratio", severity: ratioDelta > 0.5 ? "critical" : "warning",
          sourceAspectRatio: Number(sourceRatio.toFixed(4)), displayAspectRatio: Number(displayRatio.toFixed(4)), ratioDelta: Number(ratioDelta.toFixed(4)),
          fit: image.fit ?? "unknown", passed: false, recommendedFit: "contain", recommendedCrop: { left: 0, top: 0, right: 0, bottom: 0 }, recommendedPosition
        });
      }
    }
  }
  const critical = findings.filter((finding) => finding.severity === "critical").length;
  const warning = findings.length - critical;
  const score = metadata.length ? Math.max(0, Math.round(100 - (critical * 100 + warning * 45) / metadata.length)) : 100;
  return { score, target: 100, passed: findings.length === 0, checkedObjects: metadata.length, failingObjects: new Set(findings.map((finding) => `${finding.slide}:${finding.objectName}`)).size, findings };
}
