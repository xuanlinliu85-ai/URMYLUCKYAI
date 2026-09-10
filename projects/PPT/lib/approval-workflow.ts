import { appendFile, mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { brandArtifactHash } from "./brand-policy.ts";
import { canonicalize, TeamLibraryError, TeamStyleLibraryService, type TeamLibraryActor, type TeamRole } from "./team-style-library.ts";

export const APPROVAL_REQUEST_SCHEMA = "ppt-factory/approval-request/v1" as const;
export const APPROVAL_EVENT_SCHEMA = "ppt-factory/approval-event/v1" as const;
export const APPROVAL_SNAPSHOT_SCHEMA = "ppt-factory/approval-snapshot/v1" as const;
export const APPROVAL_DECISION_SCHEMA = "ppt-factory/approval-decision/v1" as const;

export type ApprovalStatus = "pending" | "approved" | "rejected";
export type ApprovalBinding = {
  tenantId: string; teamId: string; projectId: string; deckVersionId: string;
  deckSha256: string; deckManifestHash: string; evidenceManifestHash: string; brandDecisionHash: string;
  reviewSessionId: string; reviewSessionHash: string; reviewSnapshotHash: string; reviewRevision: number;
};
export type ApprovalRequest = {
  schema: typeof APPROVAL_REQUEST_SCHEMA; requestId: string; binding: ApprovalBinding;
  requestedBy: string; requestedAt: string; requestHash: string;
};
export type ApprovalEvent = {
  schema: typeof APPROVAL_EVENT_SCHEMA; requestId: string; sequence: 1; eventId: string; idempotencyKey: string;
  type: "approved" | "rejected"; actorId: string; actorRole: "owner"; occurredAt: string; reason?: string;
  previousEventHash: null; eventHash: string;
};
export type ApprovalDecision = {
  schema: typeof APPROVAL_DECISION_SCHEMA; requestId: string; binding: ApprovalBinding; decision: "APPROVED" | "REJECTED";
  decidedBy: string; decidedAt: string; reason?: string; requestHash: string; eventHash: string; decisionHash: string;
};
export type ApprovalSnapshot = {
  schema: typeof APPROVAL_SNAPSHOT_SCHEMA; requestId: string; binding: ApprovalBinding; status: ApprovalStatus;
  revision: number; lastEventHash: string | null; decisionHash: string | null; snapshotHash: string;
};
export type ApprovalBindingResolver = <T>(actor: TeamLibraryActor, reviewSessionId: string, operation: (binding: ApprovalBinding) => Promise<T>) => Promise<T>;

export class ApprovalWorkflowError extends Error {
  readonly code: "INVALID" | "NOT_FOUND" | "FORBIDDEN" | "CONFLICT" | "INTEGRITY";
  constructor(message: string, code: "INVALID" | "NOT_FOUND" | "FORBIDDEN" | "CONFLICT" | "INTEGRITY") { super(message); this.code = code; }
}

export interface ApprovalWorkflowRepository {
  read(scope: TeamLibraryActor, requestId: string): Promise<{ request: ApprovalRequest; events: ApprovalEvent[]; snapshot: ApprovalSnapshot; decision?: ApprovalDecision } | undefined>;
  create(request: ApprovalRequest): Promise<{ request: ApprovalRequest; events: ApprovalEvent[]; snapshot: ApprovalSnapshot }>;
  decide(scope: TeamLibraryActor, requestId: string, event: ApprovalEvent, expectedRevision: number): Promise<{ request: ApprovalRequest; events: ApprovalEvent[]; snapshot: ApprovalSnapshot; decision: ApprovalDecision }>;
}

const ID = /^[a-zA-Z0-9_-]{1,120}$/; const HASH = /^[a-f0-9]{64}$/; const IDEMPOTENCY = /^[a-zA-Z0-9_.:-]{1,160}$/;
const localLocks = new Map<string, Promise<void>>();
function clone<T>(value: T): T { return structuredClone(value); }
function onlyKeys(value: Record<string, unknown>, allowed: string[]) { return Object.keys(value).every((key) => allowed.includes(key)); }
function assertId(value: unknown, label: string) { if (typeof value !== "string" || !ID.test(value)) throw new ApprovalWorkflowError(`${label} is invalid`, "INVALID"); return value; }
function assertHash(value: unknown, label: string) { if (typeof value !== "string" || !HASH.test(value)) throw new ApprovalWorkflowError(`${label} is invalid`, "INTEGRITY"); return value; }
function normalizeReason(value: unknown, required: boolean) {
  if (value === undefined && !required) return undefined;
  if (typeof value !== "string") throw new ApprovalWorkflowError("Decision reason is invalid", "INVALID");
  const reason = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  if ((required && !reason) || reason.length > 2000) throw new ApprovalWorkflowError("Decision reason is invalid", "INVALID");
  return reason || undefined;
}
function parsePersistedJson<T>(text: string, artifact: string): T {
  try { return JSON.parse(text) as T; }
  catch { throw new ApprovalWorkflowError(`${artifact} is corrupt`, "INTEGRITY"); }
}

export function validateApprovalBinding(value: ApprovalBinding) {
  if (!value || typeof value !== "object" || !onlyKeys(value as unknown as Record<string, unknown>, ["tenantId", "teamId", "projectId", "deckVersionId", "deckSha256", "deckManifestHash", "evidenceManifestHash", "brandDecisionHash", "reviewSessionId", "reviewSessionHash", "reviewSnapshotHash", "reviewRevision"])) throw new ApprovalWorkflowError("Approval binding structure is invalid", "INTEGRITY");
  for (const field of ["tenantId", "teamId", "projectId", "deckVersionId", "reviewSessionId"] as const) assertId(value[field], field);
  for (const field of ["deckSha256", "deckManifestHash", "evidenceManifestHash", "brandDecisionHash", "reviewSessionHash", "reviewSnapshotHash"] as const) assertHash(value[field], field);
  if (!Number.isInteger(value.reviewRevision) || value.reviewRevision < 1) throw new ApprovalWorkflowError("Review revision is invalid", "INTEGRITY");
  return clone(value);
}

function validateRequest(value: ApprovalRequest) {
  if (!value || typeof value !== "object" || !onlyKeys(value as unknown as Record<string, unknown>, ["schema", "requestId", "binding", "requestedBy", "requestedAt", "requestHash"])
    || value.schema !== APPROVAL_REQUEST_SCHEMA || !ID.test(value.requestId) || !ID.test(value.requestedBy) || !Number.isFinite(Date.parse(value.requestedAt)) || !HASH.test(value.requestHash)) throw new ApprovalWorkflowError("Approval request structure is invalid", "INTEGRITY");
  validateApprovalBinding(value.binding); const base = { schema: value.schema, requestId: value.requestId, binding: value.binding, requestedBy: value.requestedBy, requestedAt: value.requestedAt };
  if (brandArtifactHash(base) !== value.requestHash) throw new ApprovalWorkflowError("Approval request hash mismatch", "INTEGRITY");
  return clone(value);
}

function decisionFrom(request: ApprovalRequest, event: ApprovalEvent): ApprovalDecision {
  const base = { schema: APPROVAL_DECISION_SCHEMA, requestId: request.requestId, binding: request.binding,
    decision: event.type === "approved" ? "APPROVED" as const : "REJECTED" as const, decidedBy: event.actorId,
    decidedAt: event.occurredAt, ...(event.reason ? { reason: event.reason } : {}), requestHash: request.requestHash, eventHash: event.eventHash };
  return { ...base, decisionHash: brandArtifactHash(base) };
}

function snapshotFrom(request: ApprovalRequest, events: ApprovalEvent[]) {
  if (events.length > 1) throw new ApprovalWorkflowError("Approval has more than one terminal event", "INTEGRITY");
  const event = events[0]; let decision: ApprovalDecision | undefined;
  if (event) {
    const allowed = ["schema", "requestId", "sequence", "eventId", "idempotencyKey", "type", "actorId", "actorRole", "occurredAt", "reason", "previousEventHash", "eventHash"];
    if (!onlyKeys(event as unknown as Record<string, unknown>, allowed) || event.schema !== APPROVAL_EVENT_SCHEMA || event.requestId !== request.requestId
      || event.sequence !== 1 || !ID.test(event.eventId) || !IDEMPOTENCY.test(event.idempotencyKey) || !["approved", "rejected"].includes(event.type)
      || !ID.test(event.actorId) || event.actorRole !== "owner" || !Number.isFinite(Date.parse(event.occurredAt))
      || Date.parse(event.occurredAt) < Date.parse(request.requestedAt) || event.previousEventHash !== null || !HASH.test(event.eventHash)) throw new ApprovalWorkflowError("Approval event structure is invalid", "INTEGRITY");
    const reason = normalizeReason(event.reason, event.type === "rejected"); if (reason !== event.reason) throw new ApprovalWorkflowError("Approval event reason is not canonical", "INTEGRITY");
    const base = { ...event, eventHash: undefined }; if (brandArtifactHash(base) !== event.eventHash) throw new ApprovalWorkflowError("Approval event hash mismatch", "INTEGRITY");
    decision = decisionFrom(request, event);
  }
  const status: ApprovalStatus = events.length === 0 ? "pending" : event.type;
  const base = { schema: APPROVAL_SNAPSHOT_SCHEMA, requestId: request.requestId, binding: request.binding,
    status, revision: events.length, lastEventHash: event?.eventHash ?? null, decisionHash: decision?.decisionHash ?? null };
  return { snapshot: { ...base, snapshotHash: brandArtifactHash(base) } satisfies ApprovalSnapshot, decision };
}

export class LocalApprovalWorkflowRepository implements ApprovalWorkflowRepository {
  private readonly root: string;
  constructor(root = path.join(process.cwd(), "generated", "approval-workflow")) { this.root = root; }
  async read(scope: TeamLibraryActor, requestId: string) { return this.withLock(scope, requestId, () => this.readUnlocked(scope, requestId)); }
  async create(request: ApprovalRequest) {
    return this.withLock(request.binding, request.requestId, async () => {
      if (await this.readUnlocked(request.binding, request.requestId)) throw new ApprovalWorkflowError("Approval request already exists", "CONFLICT");
      const { snapshot } = snapshotFrom(request, []);
      await this.writeNew(this.file(request.binding, request.requestId, "APPROVAL_REQUEST.json"), request);
      await this.writeNew(this.file(request.binding, request.requestId, "APPROVAL_EVENTS.ndjson"), "");
      await this.atomicJson(this.file(request.binding, request.requestId, "APPROVAL_SNAPSHOT.json"), snapshot);
      return { request: clone(request), events: [], snapshot };
    });
  }
  async decide(scope: TeamLibraryActor, requestId: string, event: ApprovalEvent, expectedRevision: number) {
    return this.withLock(scope, requestId, async () => {
      const current = await this.readUnlocked(scope, requestId); if (!current) throw new ApprovalWorkflowError("Approval request not found", "NOT_FOUND");
      const duplicate = current.events.find((item) => item.idempotencyKey === event.idempotencyKey);
      if (duplicate) {
        const semantic = (item: ApprovalEvent) => ({ type: item.type, actorId: item.actorId, reason: item.reason });
        if (JSON.stringify(canonicalize(semantic(duplicate))) !== JSON.stringify(canonicalize(semantic(event)))) throw new ApprovalWorkflowError("Idempotency key payload conflict", "CONFLICT");
        if (!current.decision) throw new ApprovalWorkflowError("Approval decision artifact is missing", "INTEGRITY");
        return { ...current, decision: current.decision };
      }
      if (current.snapshot.revision !== expectedRevision) throw new ApprovalWorkflowError("Approval revision conflict", "CONFLICT");
      if (current.snapshot.status !== "pending") throw new ApprovalWorkflowError("Approval request is terminal", "CONFLICT");
      const events = [event]; const { snapshot, decision } = snapshotFrom(current.request, events); if (!decision) throw new ApprovalWorkflowError("Approval decision is missing", "INTEGRITY");
      const intentBase = { schema: "ppt-factory/approval-commit-intent/v1", requestId, expectedRevision, event };
      await this.atomicJson(this.file(scope, requestId, "APPROVAL_COMMIT_INTENT.json"), { ...intentBase, intentHash: brandArtifactHash(intentBase) });
      await appendFile(this.file(scope, requestId, "APPROVAL_EVENTS.ndjson"), `${JSON.stringify(event)}\n`, "utf8");
      await this.atomicJson(this.file(scope, requestId, "APPROVAL_DECISION.json"), decision);
      await this.atomicJson(this.file(scope, requestId, "APPROVAL_SNAPSHOT.json"), snapshot);
      await rm(this.file(scope, requestId, "APPROVAL_COMMIT_INTENT.json"), { force: true });
      return { request: current.request, events, snapshot, decision };
    });
  }
  private async readUnlocked(scope: Pick<TeamLibraryActor, "tenantId" | "teamId">, requestId: string) {
    try {
      const request = validateRequest(parsePersistedJson<ApprovalRequest>(await readFile(this.file(scope, requestId, "APPROVAL_REQUEST.json"), "utf8"), "Approval request artifact"));
      if (request.binding.tenantId !== scope.tenantId || request.binding.teamId !== scope.teamId) throw new ApprovalWorkflowError("Approval scope mismatch", "FORBIDDEN");
      let intent: Record<string, unknown> | undefined;
      try { intent = parsePersistedJson<Record<string, unknown>>(await readFile(this.file(scope, requestId, "APPROVAL_COMMIT_INTENT.json"), "utf8"), "Approval commit intent"); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      const eventFile = this.file(scope, requestId, "APPROVAL_EVENTS.ndjson"); let ledgerText = await readFile(eventFile, "utf8"); let events: ApprovalEvent[];
      if (intent) {
        if (!onlyKeys(intent, ["schema", "requestId", "expectedRevision", "event", "intentHash"]) || intent.schema !== "ppt-factory/approval-commit-intent/v1"
          || intent.requestId !== requestId || intent.expectedRevision !== 0 || !HASH.test(String(intent.intentHash))) throw new ApprovalWorkflowError("Approval commit intent is invalid", "INTEGRITY");
        const intentBase = { schema: intent.schema, requestId: intent.requestId, expectedRevision: intent.expectedRevision, event: intent.event };
        if (brandArtifactHash(intentBase) !== intent.intentHash) throw new ApprovalWorkflowError("Approval commit intent hash mismatch", "INTEGRITY");
        const intendedEvent = intent.event as ApprovalEvent; const recovery = snapshotFrom(request, [intendedEvent]);
        const expectedLedger = `${JSON.stringify(intendedEvent)}\n`;
        if (ledgerText === "") { await appendFile(eventFile, expectedLedger, "utf8"); ledgerText = expectedLedger; }
        else if (ledgerText !== expectedLedger) {
          if (!expectedLedger.startsWith(ledgerText)) throw new ApprovalWorkflowError("Approval commit intent conflicts with the ledger", "INTEGRITY");
          await this.atomicText(eventFile, expectedLedger); ledgerText = expectedLedger;
        }
        events = [intendedEvent]; const decisionFile = this.file(scope, requestId, "APPROVAL_DECISION.json"); const expectedDecisionText = `${JSON.stringify(recovery.decision, null, 2)}\n`;
        let decisionText: string | undefined; try { decisionText = await readFile(decisionFile, "utf8"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
        if (decisionText === undefined || expectedDecisionText.startsWith(decisionText)) await this.atomicText(decisionFile, expectedDecisionText);
        else {
          const storedDecision = parsePersistedJson<unknown>(decisionText, "Approval commit decision");
          if (JSON.stringify(canonicalize(storedDecision)) !== JSON.stringify(canonicalize(recovery.decision))) throw new ApprovalWorkflowError("Approval commit decision conflicts with intent", "INTEGRITY");
        }
        await this.atomicJson(this.file(scope, requestId, "APPROVAL_SNAPSHOT.json"), recovery.snapshot);
        await rm(this.file(scope, requestId, "APPROVAL_COMMIT_INTENT.json"), { force: true });
      } else events = ledgerText.split(/\r?\n/).filter(Boolean).map((line) => parsePersistedJson<ApprovalEvent>(line, "Approval event ledger"));
      const expected = snapshotFrom(request, events); const persisted = parsePersistedJson<ApprovalSnapshot>(await readFile(this.file(scope, requestId, "APPROVAL_SNAPSHOT.json"), "utf8"), "Approval snapshot artifact");
      if (JSON.stringify(canonicalize(expected.snapshot)) !== JSON.stringify(canonicalize(persisted))) throw new ApprovalWorkflowError("Approval snapshot does not match the event ledger", "INTEGRITY");
      let persistedDecision: ApprovalDecision | undefined;
      try { persistedDecision = parsePersistedJson<ApprovalDecision>(await readFile(this.file(scope, requestId, "APPROVAL_DECISION.json"), "utf8"), "Approval decision artifact"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      if (JSON.stringify(canonicalize(expected.decision)) !== JSON.stringify(canonicalize(persistedDecision))) throw new ApprovalWorkflowError("Approval decision does not match the event ledger", "INTEGRITY");
      return { request, events, snapshot: expected.snapshot, ...(expected.decision ? { decision: expected.decision } : {}) };
    } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
  }
  private file(scope: Pick<TeamLibraryActor, "tenantId" | "teamId">, requestId: string, name: string) { return path.join(this.root, assertId(scope.tenantId, "tenantId"), assertId(scope.teamId, "teamId"), assertId(requestId, "requestId"), name); }
  private async withLock<T>(scope: Pick<TeamLibraryActor, "tenantId" | "teamId">, requestId: string, operation: () => Promise<T>) {
    const key = `${path.resolve(this.root)}\0${scope.tenantId}\0${scope.teamId}\0${requestId}`; const previous = localLocks.get(key) ?? Promise.resolve(); let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; }); const tail = previous.then(() => gate); localLocks.set(key, tail); await previous;
    let handle: Awaited<ReturnType<typeof open>> | undefined; const lockFile = this.file(scope, requestId, "APPROVAL.lock");
    try {
      await mkdir(path.dirname(lockFile), { recursive: true });
      for (let attempt = 0; attempt < 500; attempt += 1) {
        try { handle = await open(lockFile, "wx"); break; } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
          let age: number; try { age = Date.now() - (await stat(lockFile)).mtimeMs; } catch (statError) { if ((statError as NodeJS.ErrnoException).code === "ENOENT") continue; throw statError; }
          if (age > 30_000) { await rm(lockFile, { force: true }); continue; } await new Promise((resolve) => setTimeout(resolve, 10));
        }
      }
      if (!handle) throw new ApprovalWorkflowError("Approval repository lock timeout", "CONFLICT"); return await operation();
    } finally { await handle?.close(); if (handle) await rm(lockFile, { force: true }); release(); if (localLocks.get(key) === tail) localLocks.delete(key); }
  }
  private async writeNew(file: string, value: unknown) { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" }); }
  private async atomicJson(file: string, value: unknown) { await this.atomicText(file, `${JSON.stringify(value, null, 2)}\n`); }
  private async atomicText(file: string, value: string) { await mkdir(path.dirname(file), { recursive: true }); const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`; try { await writeFile(temporary, value, "utf8"); await rename(temporary, file); } finally { await rm(temporary, { force: true }); } }
}

export class ApprovalWorkflowService {
  private readonly repository: ApprovalWorkflowRepository; private readonly teams: TeamStyleLibraryService; private readonly resolveBinding: ApprovalBindingResolver; private readonly now: () => string; private readonly uuid: () => string;
  constructor(repository: ApprovalWorkflowRepository, teams: TeamStyleLibraryService, resolveBinding: ApprovalBindingResolver,
    now = () => new Date().toISOString(), uuid = randomUUID) { this.repository = repository; this.teams = teams; this.resolveBinding = resolveBinding; this.now = now; this.uuid = uuid; }
  async submit(actor: TeamLibraryActor, reviewSessionId: string) {
    await this.role(actor, ["owner", "editor"]); const sessionId = assertId(reviewSessionId, "reviewSessionId");
    return this.resolveBinding(actor, sessionId, async (resolved) => {
      const binding = validateApprovalBinding(resolved); if (binding.tenantId !== actor.tenantId || binding.teamId !== actor.teamId) throw new ApprovalWorkflowError("Approval binding scope mismatch", "FORBIDDEN");
      const requestId = `approval_${brandArtifactHash({ tenantId: binding.tenantId, teamId: binding.teamId, reviewSessionHash: binding.reviewSessionHash, reviewSnapshotHash: binding.reviewSnapshotHash }).slice(0, 32)}`;
      const existing = await this.repository.read(actor, requestId);
      if (existing) { if (JSON.stringify(canonicalize(existing.request.binding)) !== JSON.stringify(canonicalize(binding))) throw new ApprovalWorkflowError("Canonical approval request binding conflict", "CONFLICT"); return existing; }
      const base = { schema: APPROVAL_REQUEST_SCHEMA, requestId, binding, requestedBy: actor.userId, requestedAt: this.now() };
      try { return await this.repository.create({ ...base, requestHash: brandArtifactHash(base) }); }
      catch (error) { if (!(error instanceof ApprovalWorkflowError) || error.code !== "CONFLICT") throw error; const concurrent = await this.repository.read(actor, requestId); if (!concurrent || JSON.stringify(canonicalize(concurrent.request.binding)) !== JSON.stringify(canonicalize(binding))) throw error; return concurrent; }
    });
  }
  async get(actor: TeamLibraryActor, requestId: string) { await this.role(actor, ["owner", "editor", "viewer"]); const value = await this.repository.read(actor, assertId(requestId, "requestId")); if (!value) throw new ApprovalWorkflowError("Approval request not found", "NOT_FOUND"); return value; }
  async decide(actor: TeamLibraryActor, requestId: string, input: { idempotencyKey: string; expectedRevision: number; decision: "approve" | "reject"; reason?: string }) {
    const role = await this.role(actor, ["owner"]); if (input.decision !== "approve" && input.decision !== "reject") throw new ApprovalWorkflowError("Approval decision is invalid", "INVALID");
    if (!IDEMPOTENCY.test(input.idempotencyKey) || !Number.isInteger(input.expectedRevision) || input.expectedRevision < 0) throw new ApprovalWorkflowError("Approval mutation contract is invalid", "INVALID");
    const reason = normalizeReason(input.reason, input.decision === "reject"); const current = await this.get(actor, requestId); const existing = current.events.find((event) => event.idempotencyKey === input.idempotencyKey);
    if (existing) {
      const expectedType = input.decision === "approve" ? "approved" : "rejected";
      if (existing.actorId !== actor.userId || existing.type !== expectedType || existing.reason !== reason) throw new ApprovalWorkflowError("Idempotency key payload conflict", "CONFLICT");
      return current;
    }
    return this.resolveBinding(actor, current.request.binding.reviewSessionId, async (resolved) => {
      await this.role(actor, ["owner"]); const authoritative = validateApprovalBinding(resolved);
      if (JSON.stringify(canonicalize(authoritative)) !== JSON.stringify(canonicalize(current.request.binding))) throw new ApprovalWorkflowError("Approval binding no longer matches the authoritative review", "INTEGRITY");
      const base: Omit<ApprovalEvent, "eventHash"> = { schema: APPROVAL_EVENT_SCHEMA, requestId: current.request.requestId, sequence: 1,
        eventId: `event_${this.uuid().replaceAll("-", "")}`, idempotencyKey: input.idempotencyKey, type: input.decision === "approve" ? "approved" : "rejected",
        actorId: actor.userId, actorRole: role as "owner", occurredAt: this.now(), ...(reason ? { reason } : {}), previousEventHash: null };
      return this.repository.decide(actor, current.request.requestId, { ...base, eventHash: brandArtifactHash(base) }, input.expectedRevision);
    });
  }
  private async role(actor: TeamLibraryActor, allowed: TeamRole[]) { try { const library = await this.teams.getLibrary(actor); const role = library.members.find((member) => member.userId === actor.userId)?.role; if (!role || !allowed.includes(role)) throw new ApprovalWorkflowError("Team role is not authorized", "FORBIDDEN"); return role; } catch (error) { if (error instanceof TeamLibraryError) throw new ApprovalWorkflowError(error.message, error.code === "NOT_FOUND" ? "NOT_FOUND" : "FORBIDDEN"); throw error; } }
}
