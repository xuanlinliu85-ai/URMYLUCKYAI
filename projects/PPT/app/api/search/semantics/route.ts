import { NextResponse } from "next/server";
import {
  buildSemanticSearchIndex, searchSemanticIndex,
  type SemanticSearchQuery, type StylePackSearchLibrary
} from "@/lib/semantic-search";
import type { GoldenSlideLibrary } from "@/lib/types";
import { preferenceRankingSignals, validatePreferenceUserKey } from "@/lib/preference-events";
import { loadPreferenceEventState } from "@/lib/preference-event-migration";
import { withPreferenceScopeLock } from "@/lib/preference-lock";
import { readJson, writeJson } from "@/storage/local-store";

export const runtime = "nodejs";

async function optionalArtifact<T>(projectId: string, stage: "analysis" | "style", name: string) {
  try {
    return await readJson<T>(projectId, stage, name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}
export async function POST(request: Request) {
  try {
    const body = await request.json() as { projectId?: string; userKey?: string; query?: SemanticSearchQuery };
    const projectId = String(body.projectId ?? "");
    const userKey = validatePreferenceUserKey(String(body.userKey ?? "local-user"));
    if (!projectId || !body.query || typeof body.query !== "object") {
      return NextResponse.json({ error: "projectId and query are required" }, { status: 400 });
    }
    const [goldenSlides, stylePacks, preferenceState] = await Promise.all([
      optionalArtifact<GoldenSlideLibrary>(projectId, "analysis", "golden-slides"),
      optionalArtifact<StylePackSearchLibrary>(projectId, "style", "style-packs"),
      body.query.preferenceRanking === "explicit"
        ? withPreferenceScopeLock(projectId, userKey, () => loadPreferenceEventState(projectId, userKey))
        : Promise.resolve(undefined)
    ]);
    const index = buildSemanticSearchIndex({ projectId, goldenSlides, stylePacks });
    const result = searchSemanticIndex(index, body.query, {
      preferenceSignals: body.query.preferenceRanking === "explicit"
        ? preferenceRankingSignals(preferenceState?.snapshot.profile)
        : undefined
    });
    await writeJson(projectId, "analysis", "semantic-search-index", index);
    await writeJson(projectId, "analysis", "semantic-search-result", result);
    return NextResponse.json({ projectId, index, result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Semantic search failed" }, { status: 500 });
  }
}
