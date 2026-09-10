import { createHash } from "node:crypto";
import type {
  BindingInput,
  BindingManifest,
  BindingManifestTarget,
  BindingSourceProvenance,
  ResolvedBindingTarget,
  SlidePlan,
  SlidePlanBindingTarget
} from "@/lib/types";

const PLACEHOLDER = /{{\s*([^{}]+?)\s*}}/g;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, item]) => [key, canonicalize(item)]));
  }
  return value;
}

function stableJson(value: unknown) {
  return JSON.stringify(canonicalize(value));
}

function sha256(value: unknown) {
  return createHash("sha256").update(stableJson(value), "utf8").digest("hex");
}

function parseCsvRows(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const source = content.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(cell.trim());
      cell = "";
    } else if (character === "\n") {
      row.push(cell.trim());
      if (row.some((value) => value.length)) rows.push(row);
      row = [];
      cell = "";
    } else cell += character;
  }
  if (quoted) throw new Error("CSV contains an unterminated quoted field");
  row.push(cell.trim());
  if (row.some((value) => value.length)) rows.push(row);
  return rows;
}

function parseCsvCell(value: string): string | number {
  const compact = value.replace(/,/g, "");
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(compact)) {
    const numeric = Number(compact);
    if (Number.isFinite(numeric)) return numeric;
  }
  return value;
}

export function parseSimpleCsv(content: string) {
  const rows = parseCsvRows(content);
  if (!rows.length) throw new Error("CSV binding input is empty");
  const headers = rows[0].map((header) => header.trim());
  if (headers.some((header) => !header)) throw new Error("CSV headers must not be empty");
  if (new Set(headers).size !== headers.length) throw new Error("CSV headers must be unique");
  const records = rows.slice(1).map((values, rowIndex) => {
    if (values.length !== headers.length) throw new Error(`CSV row ${rowIndex + 2} has ${values.length} cells; expected ${headers.length}`);
    return Object.fromEntries(headers.map((header, index) => [header, parseCsvCell(values[index])]));
  });
  const columns = Object.fromEntries(headers.map((header) => [header, records.map((record) => record[header])]));
  return { headers, rows: records, columns };
}

function normalizePath(path: string) {
  return path.trim().replace(/\[(\d+)\]/g, ".$1").replace(/^\.|\.$/g, "");
}

function flatten(value: unknown, prefix = "", output: Record<string, unknown> = Object.create(null)) {
  if (prefix) output[prefix] = value;
  if (Array.isArray(value)) value.forEach((item, index) => flatten(item, `${prefix}.${index}`.replace(/^\./, ""), output));
  else if (value && typeof value === "object") {
    Object.entries(value as Record<string, unknown>).forEach(([key, item]) => flatten(item, `${prefix}.${key}`.replace(/^\./, ""), output));
  }
  return output;
}

export function normalizeBindingInput(input: BindingInput) {
  if (!input || !["json", "csv"].includes(input.format)) throw new Error("Binding format must be json or csv");
  if (!input.name?.trim()) throw new Error("Binding source name is required");
  let value: unknown;
  if (input.format === "json") {
    if (input.data !== undefined) value = input.data;
    else if (typeof input.content === "string") {
      try { value = JSON.parse(input.content); } catch { throw new Error("JSON binding input is invalid"); }
    } else throw new Error("JSON binding input requires data or content");
  } else {
    if (typeof input.content !== "string") throw new Error("CSV binding input requires content");
    value = parseSimpleCsv(input.content);
  }
  if (!value || typeof value !== "object") throw new Error("Binding input must resolve to an object or array");
  const source: BindingSourceProvenance = {
    format: input.format,
    name: input.name.trim(),
    inputHash: sha256(value),
    ...(input.format === "csv" ? { rows: (value as { rows: unknown[] }).rows.length } : {})
  };
  return { source, value, map: flatten(value) };
}

function placeholders(template: string) {
  return [...template.matchAll(PLACEHOLDER)].map((match) => normalizePath(match[1]));
}

function resolveTemplate(template: string, map: Record<string, unknown>, missing: Set<string>): unknown {
  const keys = placeholders(template);
  if (!keys.length) throw new Error(`Binding template must contain {{path}}: ${template}`);
  for (const key of keys) if (!(key in map)) missing.add(key);
  if (keys.some((key) => !(key in map))) return undefined;
  const exact = template.match(/^{{\s*([^{}]+?)\s*}}$/);
  if (exact) return map[normalizePath(exact[1])];
  return template.replace(PLACEHOLDER, (_, path: string) => {
    const value = map[normalizePath(path)];
    if (value !== null && typeof value === "object") throw new Error(`Cannot interpolate non-scalar binding: ${normalizePath(path)}`);
    return String(value ?? "");
  });
}

function finiteNumber(value: unknown, path: string) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const compact = value.trim().replace(/,/g, "");
    if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(compact)) {
      const parsed = Number(compact);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  throw new Error(`Chart binding ${path} contains a non-numeric value`);
}

function resolveTarget(slideIndex: number, target: SlidePlanBindingTarget, map: Record<string, unknown>) {
  const missing = new Set<string>();
  const keys: string[] = [];
  if (target.kind === "text") {
    keys.push(...placeholders(target.template));
    const value = resolveTemplate(target.template, map, missing);
    const manifest: BindingManifestTarget = {
      id: target.id,
      slideIndex,
      objectName: target.objectName,
      kind: target.kind,
      keys: [...new Set(keys)].sort(),
      status: missing.size ? "unresolved" : "resolved",
      ...(missing.size ? { unresolvedKeys: [...missing].sort() } : { resolved: String(value ?? "") })
    };
    const resolved: ResolvedBindingTarget | undefined = missing.size ? undefined : { id: target.id, kind: "text", objectName: target.objectName, value: String(value ?? "") };
    return { manifest, resolved };
  }
  keys.push(...placeholders(target.categoriesTemplate));
  const categoriesValue = resolveTemplate(target.categoriesTemplate, map, missing);
  const series = target.series.map((item) => {
    keys.push(...placeholders(item.nameTemplate), ...placeholders(item.valuesTemplate));
    const name = resolveTemplate(item.nameTemplate, map, missing);
    const values = resolveTemplate(item.valuesTemplate, map, missing);
    return { name, values, valuesPath: placeholders(item.valuesTemplate)[0] ?? item.valuesTemplate };
  });
  if (missing.size) {
    return {
      manifest: {
        id: target.id, slideIndex, objectName: target.objectName, kind: target.kind,
        keys: [...new Set(keys)].sort(), status: "unresolved" as const, unresolvedKeys: [...missing].sort()
      }
    };
  }
  if (!Array.isArray(categoriesValue)) throw new Error(`Chart categories for ${target.id} must resolve to an array`);
  const categories = categoriesValue.map((value) => String(value));
  const resolvedSeries = series.map((item) => {
    if (!Array.isArray(item.values)) throw new Error(`Chart values for ${target.id} must resolve to an array`);
    const values = item.values.map((value) => finiteNumber(value, item.valuesPath));
    if (values.length !== categories.length) throw new Error(`Chart binding ${target.id} has ${categories.length} categories but ${values.length} values`);
    if (item.name !== null && typeof item.name === "object") throw new Error(`Chart series name for ${target.id} must be scalar`);
    return { name: String(item.name ?? ""), values };
  });
  const chart = { categories, series: resolvedSeries };
  return {
    manifest: {
      id: target.id, slideIndex, objectName: target.objectName, kind: target.kind,
      keys: [...new Set(keys)].sort(), status: "resolved" as const, resolved: chart
    },
    resolved: { id: target.id, kind: "chart" as const, objectName: target.objectName, chart }
  };
}

export function resolveSlidePlanBindings(slidePlans: SlidePlan[], input: BindingInput) {
  const normalized = normalizeBindingInput(input);
  const targets: BindingManifestTarget[] = [];
  const targetIds = new Set<string>();
  const objectTargets = new Set<string>();
  const resolvedPlans = slidePlans.map((plan) => {
    const resolvedBindings: ResolvedBindingTarget[] = [];
    for (const target of plan.bindingTargets ?? []) {
      if (targetIds.has(target.id)) throw new Error(`Binding target id must be unique: ${target.id}`);
      targetIds.add(target.id);
      const objectKey = `${plan.slideIndex}:${target.kind}:${target.objectName}`;
      if (objectTargets.has(objectKey)) throw new Error(`Binding object target must be unique: ${objectKey}`);
      objectTargets.add(objectKey);
      const result = resolveTarget(plan.slideIndex, target, normalized.map);
      targets.push(result.manifest);
      if (result.resolved) resolvedBindings.push(result.resolved);
    }
    return resolvedBindings.length ? { ...plan, resolvedBindings } : { ...plan };
  });
  const unresolvedKeys = [...new Set(targets.flatMap((target) => target.unresolvedKeys ?? []))].sort();
  const resolvedKeys = [...new Set(targets.filter((target) => target.status === "resolved").flatMap((target) => target.keys))].sort();
  const manifest: BindingManifest = {
    schema: "ppt-factory/binding-manifest/v1",
    source: normalized.source,
    status: unresolvedKeys.length ? "error" : "resolved",
    resolvedKeys,
    unresolvedKeys,
    targets,
    resolutionHash: sha256({ sourceHash: normalized.source.inputHash, targets })
  };
  return { slidePlans: resolvedPlans, manifest, normalizedMap: normalized.map };
}
