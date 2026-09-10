import { NextResponse } from "next/server";
import { runVisualQa } from "@/adapters/visual-qa";
import type { StyleControls } from "@/lib/types";
import { projectPath, readJson, writeJson } from "@/storage/local-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { projectId: string; referenceStrength: number; repairPass?: number };
    const deckRequest = await readJson<{ controls: StyleControls }>(body.projectId, "slide-plans", "deck-request");
    const report = await runVisualQa(projectPath(body.projectId, "render", "final"), body.referenceStrength, body.repairPass ?? 0, {
      referenceDir: projectPath(body.projectId, "render", "reference"),
      locks: deckRequest.controls.locks
    });
    await writeJson(body.projectId, "qa", `qa-report-pass-${body.repairPass ?? 0}`, report);
    await writeJson(body.projectId, "qa", "qa-report", report);
    return NextResponse.json(report);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "QA failed" }, { status: 500 });
  }
}
