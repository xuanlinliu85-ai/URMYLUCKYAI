import { DesignMemoryError, type DesignMemoryInput } from "./design-memory.ts";

export type DesignMemoryPostBody = { projectId?: string; userKey?: string; query?: DesignMemoryInput["query"] };
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

export async function parseDesignMemoryPostRequest(request: Request): Promise<DesignMemoryPostBody> {
  let parsed: unknown;
  try { parsed = await request.json(); }
  catch { throw new DesignMemoryError("Request body must be valid JSON", "INVALID"); }
  if (!isRecord(parsed) || Object.keys(parsed).some((key) => !["projectId", "userKey", "query"].includes(key))) throw new DesignMemoryError("Request body is invalid", "INVALID");
  return parsed as DesignMemoryPostBody;
}

export function classifyDesignMemoryHttpError(error: unknown) {
  if (error instanceof DesignMemoryError) return { status: error.code === "CONFLICT" ? 409 : error.code === "INTEGRITY" ? 500 : 400,
    body: { error: error.message, code: error.code } };
  if (error instanceof SyntaxError) return { status: 500, body: { error: "Persisted Design Memory source is corrupt", code: "INTEGRITY" } };
  return { status: 500, body: { error: error instanceof Error ? error.message : "Design Memory operation failed" } };
}
