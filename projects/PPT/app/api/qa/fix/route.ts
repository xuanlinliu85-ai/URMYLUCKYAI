import { NextResponse } from "next/server";
import { cp, copyFile, mkdir } from "node:fs/promises";
import { runArtifactScript } from "@/adapters/native-pptx/run-artifact";
import { runVisualQa } from "@/adapters/visual-qa";
import type { QaIssue, QaReport, RepairPlan, StyleControls } from "@/lib/types";
import { projectPath, readJson, writeJson } from "@/storage/local-store";

export const runtime = "nodejs";

function repairAction(issue: QaIssue) {
  if (issue.category === "font-fallback") return "Replace only the named native text object's typeface with the recommended CJK-safe font; preserve text, size, color and geometry.";
  if (issue.category === "contrast") return "Adjust only the named native text foreground color to meet the measured rendered-background contrast target.";
  if (issue.category === "image-distortion") return "Adjust only the named native image fit, crop and frame to preserve its source aspect ratio and slide bounds.";
  if (issue.category === "chart-label-collision") return "Adjust only the named native chart's data-label position, font size or display strategy; preserve its data, chart type and geometry.";
  if (issue.category === "bounds") return "Tighten the affected slide layout and keep every object inside the slide canvas.";
  if (issue.category === "overlap") return "Increase local spacing and reduce collision risk on the affected composition.";
  if (issue.category === "readability") return "Increase minimum text size and local airiness without changing the storyline.";
  if (issue.category === "ai-look") return "Change the repeated slide composition while preserving the approved style direction.";
  if (issue.category === "fidelity") return "Adjust only the failing reference-fidelity dimension; preserve all locked style dimensions.";
  return `Repair the local ${issue.category} defect without rewriting unaffected slides.`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { projectId: string };
    const deckRequest = await readJson<Record<string, unknown> & { repairPass: number; controls: StyleControls }>(body.projectId, "slide-plans", "deck-request");
    if ((deckRequest.repairPass ?? 0) >= 3) return NextResponse.json({ error: "Auto Fix is capped at three passes" }, { status: 409 });
    const repairPass = (deckRequest.repairPass ?? 0) + 1;
    const before = await readJson<QaReport>(body.projectId, "qa", "qa-report");
    const autoFixableIssues = before.issues.filter((issue) => issue.autoFixable);
    const fontFallbackIssues = autoFixableIssues.filter((issue) => issue.dimension === "fontFallback");
    const contrastIssues = autoFixableIssues.filter((issue) => issue.dimension === "contrast");
    const imageIssues = autoFixableIssues.filter((issue) => issue.dimension === "imageDistortion");
    const chartLabelIssues = autoFixableIssues.filter((issue) => issue.dimension === "chartLabelCollision");
    const chartFixture = Boolean((deckRequest.qaFixture as { chartLabelCollision?: boolean } | undefined)?.chartLabelCollision);
    const selectedIssues = chartFixture && chartLabelIssues.length
      ? chartLabelIssues
      : deckRequest.imageQaFixture && imageIssues.length ? imageIssues
      : fontFallbackIssues.length ? fontFallbackIssues
        : contrastIssues.length ? contrastIssues
          : imageIssues.length ? imageIssues
            : chartLabelIssues.length ? chartLabelIssues : autoFixableIssues;
    const repairPlan: RepairPlan = {
      pass: repairPass,
      status: "planned",
      targets: selectedIssues.map((issue) => ({
        issueId: issue.id,
        slide: issue.slide,
        category: issue.category,
        dimension: issue.dimension,
        objectNames: issue.objectNames,
        adjustments: issue.adjustments,
        action: repairAction(issue)
      })),
      createdAt: new Date().toISOString()
    };
    if (!repairPlan.targets.length) return NextResponse.json({ error: "No auto-fixable QA issues were found" }, { status: 409 });
    await writeJson(body.projectId, "qa", `repair-plan-pass-${repairPass}`, repairPlan);
    await writeJson(body.projectId, "qa", "repair-plan", repairPlan);
    const renderDir = projectPath(body.projectId, "render", "final");
    const outputPptx = projectPath(body.projectId, "output", "final.pptx");
    const backupDir = projectPath(body.projectId, "render", `repair-backup-${repairPass}`);
    const backupPptx = projectPath(body.projectId, "output", `final.before-repair-${repairPass}.pptx`);
    await mkdir(backupDir, { recursive: true });
    await cp(renderDir, backupDir, { recursive: true, force: true });
    await copyFile(outputPptx, backupPptx);
    const objectLocalOnly = repairPlan.targets.every((target) => target.dimension === "typography" || target.dimension === "contrast" || target.dimension === "fontFallback" || target.dimension === "imageDistortion" || target.dimension === "chartLabelCollision");
    const previousRepairPlan = deckRequest.repairPlan as RepairPlan | undefined;
    const currentDimensions = new Set(repairPlan.targets.map((target) => target.dimension));
    const retainedTargets = (previousRepairPlan?.targets ?? []).filter((target) => !currentDimensions.has(target.dimension));
    const cumulativeRepairPlan: RepairPlan = { ...repairPlan, targets: [...retainedTargets, ...repairPlan.targets] };
    const nextRequest = {
      ...deckRequest,
      repairPass,
      repairPlan: cumulativeRepairPlan,
      controls: objectLocalOnly ? deckRequest.controls : {
        ...deckRequest.controls,
        airiness: Math.min(100, deckRequest.controls.airiness + 8),
        visualWeight: Math.max(20, deckRequest.controls.visualWeight - 5)
      }
    };
    const requestPath = await writeJson(body.projectId, "slide-plans", "deck-request", nextRequest);
    await runArtifactScript("generate-deck.mjs", [requestPath]);
    let report = await runVisualQa(renderDir, nextRequest.controls.referenceStrength, repairPass, {
      referenceDir: projectPath(body.projectId, "render", "reference"),
      locks: nextRequest.controls.locks
    });
    const targetedDimensions = [...new Set(repairPlan.targets.map((target) => target.dimension).filter(Boolean))] as Array<NonNullable<QaIssue["dimension"]>>;
    const targetScore = (qa: QaReport, dimension: NonNullable<QaIssue["dimension"]>) => {
      if (dimension === "contrast") return qa.technical.contrast.score;
      if (dimension === "fontFallback") return qa.technical.fontFallback.score;
      if (dimension === "imageDistortion") return qa.technical.imageDistortion.score;
      if (dimension === "chartLabelCollision") return qa.technical.chartLabelCollision.score;
      return qa.fidelity.dimensions[dimension].score;
    };
    const targetScores = targetedDimensions.map((dimension) => ({
      dimension,
      before: targetScore(before, dimension),
      after: targetScore(report, dimension)
    }));
    const rolledBack = report.overall < before.overall || targetScores.some((score) => score.after <= score.before);
    if (rolledBack) {
      const attemptDir = projectPath(body.projectId, "render", `repair-attempt-${repairPass}`);
      const attemptPptx = projectPath(body.projectId, "output", `final.repair-attempt-${repairPass}.pptx`);
      await cp(renderDir, attemptDir, { recursive: true, force: true });
      await copyFile(outputPptx, attemptPptx);
      await cp(backupDir, renderDir, { recursive: true, force: true });
      await copyFile(backupPptx, outputPptx);
      report = { ...before, repairPass };
      await writeJson(body.projectId, "slide-plans", "deck-request", deckRequest);
    }
    const completedPlan: RepairPlan = { ...repairPlan, status: rolledBack ? "rolled_back" : "applied" };
    await writeJson(body.projectId, "qa", `repair-plan-pass-${repairPass}`, completedPlan);
    await writeJson(body.projectId, "qa", "repair-plan", completedPlan);
    await writeJson(body.projectId, "qa", `repair-event-${repairPass}`, { rolledBack, beforeOverall: before.overall, afterOverall: report.overall, targetScores, appliedAt: new Date().toISOString() });
    await writeJson(body.projectId, "qa", `qa-report-pass-${repairPass}`, report);
    await writeJson(body.projectId, "qa", "qa-report", report);
    return NextResponse.json({ ...report, rolledBack });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Auto Fix failed" }, { status: 500 });
  }
}
