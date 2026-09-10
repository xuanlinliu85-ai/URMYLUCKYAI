import { createHash, randomUUID } from "node:crypto";
import { appendFile, mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { brandArtifactHash } from "./brand-policy.ts";
import { TeamLibraryError, TeamStyleLibraryService, canonicalize, type TeamLibraryActor, type TeamRole } from "./team-style-library.ts";

export const REVIEW_SESSION_SCHEMA = "ppt-factory/collaborative-review-session/v1" as const;
export const REVIEW_EVENT_SCHEMA = "ppt-factory/collaborative-review-event/v1" as const;
export const REVIEW_SNAPSHOT_SCHEMA = "ppt-factory/collaborative-review-snapshot/v1" as const;

export type ReviewStatus = "open" | "closed";
export type ReviewTarget = { slide: number; objectId?: string };
export type ReviewBinding = {
  tenantId: string; teamId: string; projectId: string; deckVersionId: string;
  deckSha256: string; deckManifestHash: string; evidenceManifestHash: string;
  brandDecisionHash: string; brandDecision: "ALLOW" | "ALLOW_WITH_WARNINGS" | "BLOCKED";
  slides: number; nativeTargets: Record<string, string[]>; nativeTargetsHash: string;
};

export type ReviewSession = {
  schema: typeof REVIEW_SESSION_SCHEMA; sessionId: string; binding: ReviewBinding;
  createdBy: string; createdAt: string; sessionHash: string;
};

export type ReviewEventType = "comment_added" | "comment_superseded" | "comment_resolved" | "review_closed" | "review_reopened";
export type ReviewEvent = {
  schema: typeof REVIEW_EVENT_SCHEMA; sessionId: string; sequence: number; eventId: string;
  idempotencyKey: string; type: ReviewEventType; actorId: string; actorRole: TeamRole; occurredAt: string;
  target?: ReviewTarget; commentId?: string; supersedesCommentId?: string; text?: string;
  previousEventHash: string | null; eventHash: string;
};

export type ReviewComment = {
  commentId: string; target: ReviewTarget; text: string; authorId: string; createdAt: string;
  supersededBy: string | null; resolved: boolean; resolvedBy?: string; resolvedAt?: string;
};

export type ReviewSnapshot = {
  schema: typeof REVIEW_SNAPSHOT_SCHEMA; sessionId: string; binding: ReviewBinding; status: ReviewStatus;
  revision: number; comments: ReviewComment[]; lastEventHash: string | null; snapshotHash: string;
};

export type AuthoritativeReviewContext = { binding: ReviewBinding };
export type ReviewContextResolver = (actor: TeamLibraryActor, projectId: string, deckVersionId: string) => Promise<AuthoritativeReviewContext>;

export class CollaborativeReviewError extends Error {
  readonly code: "INVALID" | "NOT_FOUND" | "FORBIDDEN" | "CONFLICT" | "INTEGRITY";
  constructor(message: string, code: "INVALID" | "NOT_FOUND" | "FORBIDDEN" | "CONFLICT" | "INTEGRITY") {
    super(message);
    this.code = code;
  }
}

export interface CollaborativeReviewRepository {
  read(scope: TeamLibraryActor, sessionId: string): Promise<{ session: ReviewSession; events: ReviewEvent[]; snapshot: ReviewSnapshot } | undefined>;
  create(session: ReviewSession): Promise<{ session: ReviewSession; events: ReviewEvent[]; snapshot: ReviewSnapshot }>;
  append(scope: TeamLibraryActor, sessionId: string, event: ReviewEvent, expectedRevision: number): Promise<{ session: ReviewSession; events: ReviewEvent[]; snapshot: ReviewSnapshot }>;
}

const ID = /^[a-zA-Z0-9_-]{1,120}$/;
const NATIVE_ID = /^[a-zA-Z0-9_./:-]{1,160}$/;
const HASH = /^[a-f0-9]{64}$/;
const IDEMPOTENCY = /^[a-zA-Z0-9_.:-]{1,160}$/;
const locks = new Map<string, Promise<void>>();

function assertId(value: unknown, label: string) {
  if (typeof value !== "string" || !ID.test(value)) throw new CollaborativeReviewError(`${label} is invalid`, "INVALID");
  return value;
}
function assertHash(value: unknown, label: string) {
  if (typeof value !== "string" || !HASH.test(value)) throw new CollaborativeReviewError(`${label} is invalid`, "INTEGRITY");
  return value;
}
function normalizedText(value: unknown) {
  if (typeof value !== "string") throw new CollaborativeReviewError("Comment text is required", "INVALID");
  const text = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (!text || text.length > 4000) throw new CollaborativeReviewError("Comment text length is invalid", "INVALID");
  return text;
}
function clone<T>(value: T): T { return structuredClone(value); }
function eventDigest(event: Omit<ReviewEvent, "eventHash">) { return brandArtifactHash(event); }
function onlyKeys(value: Record<string, unknown>, allowed: string[]) { return Object.keys(value).every((key) => allowed.includes(key)); }

export function validateReviewBinding(value: ReviewBinding) {
  for (const field of ["tenantId", "teamId", "projectId", "deckVersionId"] as const) assertId(value[field], field);
  for (const field of ["deckSha256", "deckManifestHash", "evidenceManifestHash", "brandDecisionHash", "nativeTargetsHash"] as const) assertHash(value[field], field);
  if (!["ALLOW", "ALLOW_WITH_WARNINGS", "BLOCKED"].includes(value.brandDecision)) throw new CollaborativeReviewError("Brand decision is invalid", "INTEGRITY");
  if (!Number.isInteger(value.slides) || value.slides < 1 || value.slides > 500) throw new CollaborativeReviewError("Slide count is invalid", "INTEGRITY");
  const slides = Object.fromEntries(Object.entries(value.nativeTargets).sort(([a], [b]) => Number(a) - Number(b)).map(([slide, ids]) => {
    const number = Number(slide);
    if (!Number.isInteger(number) || number < 1 || number > value.slides || !Array.isArray(ids)) throw new CollaborativeReviewError("Native target catalog is invalid", "INTEGRITY");
    if (ids.some((id) => typeof id !== "string" || !NATIVE_ID.test(id))) throw new CollaborativeReviewError("Native object identity is invalid", "INTEGRITY");
    const clean = [...new Set(ids)].sort();
    if (clean.length !== ids.length) throw new CollaborativeReviewError("Native object identities must be unique per slide", "INTEGRITY");
    return [String(number), clean];
  }));
  if (brandArtifactHash(slides) !== value.nativeTargetsHash) throw new CollaborativeReviewError("Native target catalog hash mismatch", "INTEGRITY");
  return { ...clone(value), nativeTargets: slides };
}

function validateTarget(binding: ReviewBinding, target: ReviewTarget) {
  if (!target || typeof target !== "object" || !onlyKeys(target as unknown as Record<string, unknown>, ["slide", "objectId"])
    || !Number.isInteger(target.slide) || target.slide < 1 || target.slide > binding.slides
    || (target.objectId !== undefined && typeof target.objectId !== "string")) throw new CollaborativeReviewError("Review slide target is invalid", "INVALID");
  if (target.objectId !== undefined && !binding.nativeTargets[String(target.slide)]?.includes(target.objectId)) {
    throw new CollaborativeReviewError("Review object target is absent from authoritative native evidence", "INVALID");
  }
  return clone(target);
}

function snapshotFrom(session: ReviewSession, events: ReviewEvent[]): ReviewSnapshot {
  let status: ReviewStatus = "open";
  const comments = new Map<string, ReviewComment>();
  const eventIds = new Set<string>(); const idempotencyKeys = new Set<string>();
  let prior: string | null = null;
  events.forEach((event, index) => {
    const common = ["schema", "sessionId", "sequence", "eventId", "idempotencyKey", "type", "actorId", "actorRole", "occurredAt", "previousEventHash", "eventHash"];
    const payloadKeys = event.type === "comment_added" ? ["target", "commentId", "text"]
      : event.type === "comment_superseded" ? ["target", "commentId", "supersedesCommentId", "text"]
        : event.type === "comment_resolved" ? ["commentId"] : [];
    const priorTime = index === 0 ? session.createdAt : events[index - 1].occurredAt;
    if (!event || typeof event !== "object" || !onlyKeys(event as unknown as Record<string, unknown>, [...common, ...payloadKeys])
      || event.schema !== REVIEW_EVENT_SCHEMA || event.sessionId !== session.sessionId || event.sequence !== index + 1
      || !ID.test(event.eventId) || !IDEMPOTENCY.test(event.idempotencyKey) || eventIds.has(event.eventId) || idempotencyKeys.has(event.idempotencyKey)
      || !ID.test(event.actorId) || !["owner", "editor", "viewer"].includes(event.actorRole)
      || !Number.isFinite(Date.parse(event.occurredAt)) || Date.parse(event.occurredAt) < Date.parse(priorTime)
      || !["comment_added", "comment_superseded", "comment_resolved", "review_closed", "review_reopened"].includes(event.type)
      || event.previousEventHash !== prior || !HASH.test(event.eventHash) || eventDigest({ ...event, eventHash: undefined } as never) !== event.eventHash) {
      throw new CollaborativeReviewError("Review event hash chain is invalid", "INTEGRITY");
    }
    eventIds.add(event.eventId); idempotencyKeys.add(event.idempotencyKey);
    prior = event.eventHash;
    if (event.type === "comment_added" || event.type === "comment_superseded") {
      if (!event.commentId || !event.target || !event.text) throw new CollaborativeReviewError("Comment event is incomplete", "INTEGRITY");
      assertId(event.commentId, "commentId"); validateTarget(session.binding, event.target); normalizedText(event.text);
      if (comments.has(event.commentId) || status !== "open") throw new CollaborativeReviewError("Comment event state is invalid", "INTEGRITY");
      if (event.type === "comment_superseded") {
        const old = comments.get(String(event.supersedesCommentId));
        if (!old || old.supersededBy) throw new CollaborativeReviewError("Superseded comment history is invalid", "INTEGRITY");
        if (JSON.stringify(canonicalize(old.target)) !== JSON.stringify(canonicalize(event.target))) throw new CollaborativeReviewError("Superseded comment target changed", "INTEGRITY");
        old.supersededBy = event.commentId;
      }
      comments.set(event.commentId, { commentId: event.commentId, target: event.target, text: event.text, authorId: event.actorId,
        createdAt: event.occurredAt, supersededBy: null, resolved: false });
    } else if (event.type === "comment_resolved") {
      if (status !== "open") throw new CollaborativeReviewError("Resolved comment state is invalid", "INTEGRITY");
      const comment = comments.get(String(event.commentId));
      if (!comment || comment.supersededBy || comment.resolved) throw new CollaborativeReviewError("Resolved comment history is invalid", "INTEGRITY");
      comment.resolved = true; comment.resolvedBy = event.actorId; comment.resolvedAt = event.occurredAt;
    } else if (event.type === "review_closed") {
      if (status !== "open") throw new CollaborativeReviewError("Review close history is invalid", "INTEGRITY"); status = "closed";
    } else if (event.type === "review_reopened") {
      if (status !== "closed") throw new CollaborativeReviewError("Review reopen history is invalid", "INTEGRITY"); status = "open";
    }
  });
  const base = { schema: REVIEW_SNAPSHOT_SCHEMA, sessionId: session.sessionId, binding: session.binding, status,
    revision: events.length, comments: [...comments.values()], lastEventHash: prior };
  return { ...base, snapshotHash: brandArtifactHash(base) };
}

export class LocalCollaborativeReviewRepository implements CollaborativeReviewRepository {
  private readonly root: string;
  constructor(root = path.join(process.cwd(), "generated", "collaborative-review")) { this.root = root; }
  async read(scope: TeamLibraryActor, sessionId: string) { return this.withLock(scope, sessionId, () => this.readUnlocked(scope, sessionId)); }
  async withExclusive<T>(scope: TeamLibraryActor, sessionId: string,
    operation: (current: { session: ReviewSession; events: ReviewEvent[]; snapshot: ReviewSnapshot }) => Promise<T>) {
    return this.withLock(scope, assertId(sessionId, "sessionId"), async () => {
      const current = await this.readUnlocked(scope, sessionId);
      if (!current) throw new CollaborativeReviewError("Review session not found", "NOT_FOUND");
      return operation(current);
    });
  }
  async create(session: ReviewSession) {
    return this.withLock(session.binding, session.sessionId, async () => {
      if (await this.readUnlocked(session.binding, session.sessionId)) throw new CollaborativeReviewError("Review session already exists", "CONFLICT");
      const snapshot = snapshotFrom(session, []);
      await this.writeNew(this.file(session.binding, session.sessionId, "COLLABORATIVE_REVIEW_SESSION.json"), session);
      await this.writeNew(this.file(session.binding, session.sessionId, "COLLABORATIVE_REVIEW_EVENTS.ndjson"), "");
      await this.atomicJson(this.file(session.binding, session.sessionId, "COLLABORATIVE_REVIEW_SNAPSHOT.json"), snapshot);
      return { session: clone(session), events: [], snapshot };
    });
  }
  async append(scope: TeamLibraryActor, sessionId: string, event: ReviewEvent, expectedRevision: number) {
    return this.withLock(scope, sessionId, async () => {
      const current = await this.readUnlocked(scope, sessionId);
      if (!current) throw new CollaborativeReviewError("Review session not found", "NOT_FOUND");
      const duplicate = current.events.find((item) => item.idempotencyKey === event.idempotencyKey);
      if (duplicate) {
        const semantic = (item: ReviewEvent) => ({ type: item.type, actorId: item.actorId,
          target: item.target, supersedesCommentId: item.supersedesCommentId, text: item.text,
          commentId: item.type === "comment_resolved" ? item.commentId : undefined });
        if (JSON.stringify(canonicalize(semantic(event))) !== JSON.stringify(canonicalize(semantic(duplicate)))) {
          throw new CollaborativeReviewError("Idempotency key payload conflict", "CONFLICT");
        }
        return current;
      }
      if (current.snapshot.revision !== expectedRevision) throw new CollaborativeReviewError("Review revision conflict", "CONFLICT");
      const events = [...current.events, event];
      const snapshot = snapshotFrom(current.session, events);
      await appendFile(this.file(scope, sessionId, "COLLABORATIVE_REVIEW_EVENTS.ndjson"), `${JSON.stringify(event)}\n`, "utf8");
      await this.atomicJson(this.file(scope, sessionId, "COLLABORATIVE_REVIEW_SNAPSHOT.json"), snapshot);
      return { session: current.session, events, snapshot };
    });
  }
  private async readUnlocked(scope: Pick<TeamLibraryActor, "tenantId" | "teamId">, sessionId: string) {
    try {
      const session = JSON.parse(await readFile(this.file(scope, sessionId, "COLLABORATIVE_REVIEW_SESSION.json"), "utf8")) as ReviewSession;
      if (!onlyKeys(session as unknown as Record<string, unknown>, ["schema", "sessionId", "binding", "createdBy", "createdAt", "sessionHash"])
        || !ID.test(session.sessionId) || !ID.test(session.createdBy) || !Number.isFinite(Date.parse(session.createdAt))) {
        throw new CollaborativeReviewError("Review session structure is invalid", "INTEGRITY");
      }
      if (session.binding.tenantId !== scope.tenantId || session.binding.teamId !== scope.teamId) throw new CollaborativeReviewError("Review scope mismatch", "FORBIDDEN");
      validateReviewBinding(session.binding);
      const immutableSession = { schema: session.schema, sessionId: session.sessionId, binding: session.binding, createdBy: session.createdBy, createdAt: session.createdAt };
      if (session.schema !== REVIEW_SESSION_SCHEMA || !HASH.test(session.sessionHash) || brandArtifactHash(immutableSession) !== session.sessionHash) {
        throw new CollaborativeReviewError("Review session integrity is invalid", "INTEGRITY");
      }
      const lines = (await readFile(this.file(scope, sessionId, "COLLABORATIVE_REVIEW_EVENTS.ndjson"), "utf8")).split(/\r?\n/).filter(Boolean);
      const events = lines.map((line) => JSON.parse(line) as ReviewEvent);
      const snapshot = snapshotFrom(session, events);
      const persistedSnapshot = JSON.parse(await readFile(this.file(scope, sessionId, "COLLABORATIVE_REVIEW_SNAPSHOT.json"), "utf8")) as ReviewSnapshot;
      if (JSON.stringify(canonicalize(persistedSnapshot)) !== JSON.stringify(canonicalize(snapshot))) {
        throw new CollaborativeReviewError("Persisted review snapshot does not match the event ledger", "INTEGRITY");
      }
      return { session, events, snapshot };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }
  private file(scope: Pick<TeamLibraryActor, "tenantId" | "teamId">, sessionId: string, name: string) {
    return path.join(this.root, assertId(scope.tenantId, "tenantId"), assertId(scope.teamId, "teamId"), assertId(sessionId, "sessionId"), name);
  }
  private async withLock<T>(scope: Pick<TeamLibraryActor, "tenantId" | "teamId">, sessionId: string, operation: () => Promise<T>) {
    const key = `${path.resolve(this.root)}\0${scope.tenantId}\0${scope.teamId}\0${sessionId}`;
    const previous = locks.get(key) ?? Promise.resolve(); let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; }); const tail = previous.then(() => gate); locks.set(key, tail); await previous;
    let lockHandle: Awaited<ReturnType<typeof open>> | undefined; const lockFile = this.file(scope, sessionId, "COLLABORATIVE_REVIEW.lock");
    try {
      await mkdir(path.dirname(lockFile), { recursive: true });
      for (let attempt = 0; attempt < 500; attempt += 1) {
        try { lockHandle = await open(lockFile, "wx"); break; } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
          let age: number;
          try { age = Date.now() - (await stat(lockFile)).mtimeMs; } catch (statError) {
            if ((statError as NodeJS.ErrnoException).code === "ENOENT") continue;
            throw statError;
          }
          if (age > 30_000) { await rm(lockFile, { force: true }); continue; }
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      }
      if (!lockHandle) throw new CollaborativeReviewError("Review repository lock timeout", "CONFLICT");
      return await operation();
    } finally {
      await lockHandle?.close(); if (lockHandle) await rm(lockFile, { force: true });
      release(); if (locks.get(key) === tail) locks.delete(key);
    }
  }
  private async writeNew(file: string, value: unknown) { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" }); }
  private async atomicJson(file: string, value: unknown) { await this.atomicText(file, `${JSON.stringify(value, null, 2)}\n`); }
  private async atomicText(file: string, value: string) { await mkdir(path.dirname(file), { recursive: true }); const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`; try { await writeFile(temporary, value, "utf8"); await rename(temporary, file); } finally { await rm(temporary, { force: true }); } }
}

export class CollaborativeReviewService {
  private readonly repository: CollaborativeReviewRepository;
  private readonly teams: TeamStyleLibraryService;
  private readonly resolveContext: ReviewContextResolver;
  private readonly now: () => string;
  private readonly uuid: () => string;
  constructor(repository: CollaborativeReviewRepository, teams: TeamStyleLibraryService,
    resolveContext: ReviewContextResolver, now = () => new Date().toISOString(), uuid = randomUUID) {
    this.repository = repository; this.teams = teams; this.resolveContext = resolveContext; this.now = now; this.uuid = uuid;
  }

  async open(actor: TeamLibraryActor, projectId: string, deckVersionId: string) {
    const role = await this.role(actor, ["owner", "editor"]);
    const context = await this.resolveContext(actor, assertId(projectId, "projectId"), assertId(deckVersionId, "deckVersionId"));
    const binding = validateReviewBinding(context.binding);
    if (binding.tenantId !== actor.tenantId || binding.teamId !== actor.teamId) throw new CollaborativeReviewError("Authoritative review scope mismatch", "FORBIDDEN");
    const sessionId = `review_${this.uuid().replaceAll("-", "")}`;
    const immutableSession = { schema: REVIEW_SESSION_SCHEMA, sessionId, binding, createdBy: actor.userId, createdAt: this.now() };
    const session: ReviewSession = { ...immutableSession, sessionHash: brandArtifactHash(immutableSession) };
    void role;
    return this.repository.create(session);
  }

  async get(actor: TeamLibraryActor, sessionId: string) { await this.role(actor, ["owner", "editor", "viewer"]); return this.required(actor, sessionId); }

  async addComment(actor: TeamLibraryActor, sessionId: string, input: { idempotencyKey: string; expectedRevision: number; target: ReviewTarget; text: string }) {
    const role = await this.role(actor, ["owner", "editor", "viewer"]); const current = await this.required(actor, sessionId);
    const target = validateTarget(current.session.binding, input.target); const text = normalizedText(input.text);
    if (this.replay(current, actor, input.idempotencyKey, { type: "comment_added", target, text })) return current;
    this.requireOpen(current);
    return this.append(actor, role, current, input, { type: "comment_added", target, commentId: `comment_${this.uuid().replaceAll("-", "")}`, text });
  }

  async supersedeComment(actor: TeamLibraryActor, sessionId: string, input: { idempotencyKey: string; expectedRevision: number; commentId: string; text: string }) {
    const role = await this.role(actor, ["owner", "editor", "viewer"]); const current = await this.required(actor, sessionId); const text = normalizedText(input.text);
    if (this.replay(current, actor, input.idempotencyKey, { type: "comment_superseded", supersedesCommentId: input.commentId, text })) return current;
    this.requireOpen(current);
    const comment = current.snapshot.comments.find((item) => item.commentId === input.commentId && !item.supersededBy && !item.resolved);
    if (!comment) throw new CollaborativeReviewError("Active comment not found", "NOT_FOUND");
    if (role === "viewer" && comment.authorId !== actor.userId) throw new CollaborativeReviewError("Viewer can supersede only their own comment", "FORBIDDEN");
    return this.append(actor, role, current, input, { type: "comment_superseded", target: comment.target,
      commentId: `comment_${this.uuid().replaceAll("-", "")}`, supersedesCommentId: comment.commentId, text });
  }

  async resolveComment(actor: TeamLibraryActor, sessionId: string, input: { idempotencyKey: string; expectedRevision: number; commentId: string }) {
    const role = await this.role(actor, ["owner", "editor"]); const current = await this.required(actor, sessionId);
    if (this.replay(current, actor, input.idempotencyKey, { type: "comment_resolved", commentId: input.commentId })) return current;
    this.requireOpen(current);
    const comment = current.snapshot.comments.find((item) => item.commentId === input.commentId && !item.supersededBy && !item.resolved);
    if (!comment) throw new CollaborativeReviewError("Active comment not found", "NOT_FOUND");
    return this.append(actor, role, current, input, { type: "comment_resolved", commentId: comment.commentId });
  }

  async setStatus(actor: TeamLibraryActor, sessionId: string, input: { idempotencyKey: string; expectedRevision: number; status: ReviewStatus }) {
    if (input.status !== "open" && input.status !== "closed") throw new CollaborativeReviewError("Review status is invalid", "INVALID");
    const role = await this.role(actor, ["owner", "editor"]); const current = await this.required(actor, sessionId);
    const type = input.status === "closed" ? "review_closed" : "review_reopened";
    if (this.replay(current, actor, input.idempotencyKey, { type })) return current;
    if (current.snapshot.status === input.status) throw new CollaborativeReviewError(`Review is already ${input.status}`, "CONFLICT");
    return this.append(actor, role, current, input, { type });
  }

  private async required(actor: TeamLibraryActor, sessionId: string) { const current = await this.repository.read(actor, assertId(sessionId, "sessionId")); if (!current) throw new CollaborativeReviewError("Review session not found", "NOT_FOUND"); return current; }
  private requireOpen(current: { snapshot: ReviewSnapshot }) { if (current.snapshot.status !== "open") throw new CollaborativeReviewError("Review session is closed", "CONFLICT"); }
  private replay(current: { events: ReviewEvent[] }, actor: TeamLibraryActor, key: string,
    expected: { type: ReviewEventType; target?: ReviewTarget; text?: string; commentId?: string; supersedesCommentId?: string }) {
    const event = current.events.find((item) => item.idempotencyKey === key); if (!event) return false;
    if (event.actorId !== actor.userId || event.type !== expected.type
      || JSON.stringify(canonicalize(event.target)) !== JSON.stringify(canonicalize(expected.target)) || event.text !== expected.text
      || (expected.commentId !== undefined && event.commentId !== expected.commentId)
      || (expected.supersedesCommentId !== undefined && event.supersedesCommentId !== expected.supersedesCommentId)) {
      throw new CollaborativeReviewError("Idempotency key payload conflict", "CONFLICT");
    }
    return true;
  }
  private async role(actor: TeamLibraryActor, allowed: TeamRole[]) { try { const library = await this.teams.getLibrary(actor); const role = library.members.find((member) => member.userId === actor.userId)?.role; if (!role || !allowed.includes(role)) throw new CollaborativeReviewError("Team role is not authorized", "FORBIDDEN"); return role; } catch (error) { if (error instanceof TeamLibraryError) throw new CollaborativeReviewError(error.message, error.code === "NOT_FOUND" ? "NOT_FOUND" : "FORBIDDEN"); throw error; } }
  private append(actor: TeamLibraryActor, role: TeamRole, current: { session: ReviewSession; events: ReviewEvent[] }, input: { idempotencyKey: string; expectedRevision: number }, payload: Pick<ReviewEvent, "type" | "target" | "commentId" | "supersedesCommentId" | "text">) {
    if (!IDEMPOTENCY.test(input.idempotencyKey)) throw new CollaborativeReviewError("Idempotency key is invalid", "INVALID");
    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 0) throw new CollaborativeReviewError("Expected revision is invalid", "INVALID");
    const base: Omit<ReviewEvent, "eventHash"> = { schema: REVIEW_EVENT_SCHEMA, sessionId: current.session.sessionId,
      sequence: current.events.length + 1, eventId: `event_${this.uuid().replaceAll("-", "")}`, idempotencyKey: input.idempotencyKey,
      type: payload.type, actorId: actor.userId, actorRole: role, occurredAt: this.now(),
      ...(payload.target ? { target: payload.target } : {}), ...(payload.commentId ? { commentId: payload.commentId } : {}),
      ...(payload.supersedesCommentId ? { supersedesCommentId: payload.supersedesCommentId } : {}), ...(payload.text ? { text: payload.text } : {}),
      previousEventHash: current.events.at(-1)?.eventHash ?? null };
    return this.repository.append(actor, current.session.sessionId, { ...base, eventHash: eventDigest(base) }, input.expectedRevision);
  }
}
