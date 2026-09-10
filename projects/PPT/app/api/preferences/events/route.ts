import { NextResponse } from "next/server";
import {
  appendPreferenceEvent, PreferenceEventError,
  queryPreferenceEvents, validatePreferenceUserKey,
  type AppendPreferenceInput, type PreferenceAction, type PreferenceArtifactType, type PreferenceEventJournal
} from "@/lib/preference-events";
import { loadPreferenceEventState } from "@/lib/preference-event-migration";
import { withPreferenceScopeLock } from "@/lib/preference-lock";
import type { GoldenSlideLibrary } from "@/lib/types";
import type { StylePackLibrary } from "@/lib/style-packs";
import { readJson } from "@/storage/local-store";
import { eventSnapshot, writeEventSnapshot } from "@/storage/preference-store";

export const runtime = "nodejs";

async function optionalArtifact<T>(projectId: string, stage: "analysis" | "style", name: string) {
  try { return await readJson<T>(projectId, stage, name); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
}

const scope = (projectId: string, userKey: string) => ({ kind: "local-project-user-placeholder" as const, projectId, userKey });

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId") ?? "";
    const userKey = validatePreferenceUserKey(url.searchParams.get("userKey") ?? "local-user");
    if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    return await withPreferenceScopeLock(projectId, userKey, async () => {
      const state = await loadPreferenceEventState(projectId, userKey);
      const journal = state.snapshot.journal;
      const events = queryPreferenceEvents(journal, {
        action: (url.searchParams.get("action") || undefined) as PreferenceAction | undefined,
        artifactType: (url.searchParams.get("artifactType") || undefined) as PreferenceArtifactType | undefined,
        subjectId: url.searchParams.get("subjectId") || undefined
      });
      return NextResponse.json({ projectId, scope: journal.scope, revision: state.virtual ? 0 : state.snapshot.revision, migrated: state.migrated, events, profile: state.snapshot.profile });
    });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { projectId?: string; userKey?: string; event?: Omit<AppendPreferenceInput, "scope"> };
    const projectId = String(body.projectId ?? "");
    const userKey = validatePreferenceUserKey(String(body.userKey ?? "local-user"));
    if (!projectId || !body.event) return NextResponse.json({ error: "projectId and event are required" }, { status: 400 });
    const event = body.event;
    return await withPreferenceScopeLock(projectId, userKey, async () => {
      const [state, goldenSlides, stylePacks] = await Promise.all([
        loadPreferenceEventState(projectId, userKey),
        optionalArtifact<GoldenSlideLibrary>(projectId, "analysis", "golden-slides"),
        optionalArtifact<StylePackLibrary>(projectId, "style", "style-packs")
      ]);
      const result = appendPreferenceEvent(state.snapshot.journal, { ...event, scope: scope(projectId, userKey) }, { goldenSlides, stylePacks });
      let revision = state.virtual ? 0 : state.snapshot.revision;
      if (result.appended) {
        const next = eventSnapshot(scope(projectId, userKey), revision + 1, result.journal, result.profile);
        await writeEventSnapshot(projectId, state.name, revision, next);
        revision = next.revision;
      }
      return NextResponse.json({ projectId, revision, migrated: state.migrated, appended: result.appended, event: result.event, profile: result.profile }, { status: result.appended ? 201 : 200 });
    });
  } catch (error) { return failure(error); }
}

function failure(error: unknown) {
  if (error instanceof PreferenceEventError) {
    const status = error.code === "NOT_FOUND" ? 404 : error.code === "CONFLICT" ? 409 : 400;
    return NextResponse.json({ error: error.message, code: error.code }, { status });
  }
  if (error instanceof Error && /revision conflict|snapshot is invalid/i.test(error.message)) {
    return NextResponse.json({ error: error.message, code: "CONFLICT" }, { status: 409 });
  }
  return NextResponse.json({ error: error instanceof Error ? error.message : "Preference event operation failed" }, { status: 500 });
}
