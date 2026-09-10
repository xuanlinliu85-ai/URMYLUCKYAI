import { assertTeamId, TeamLibraryError, validateTeamStyleLibrary } from "../../lib/team-style-library.ts";
import type {
  TeamLibraryActor,
  TeamLibraryScope,
  TeamStyleLibrary,
  TeamStyleLibraryRepository
} from "@/lib/team-style-library";

export const SUPABASE_TEAM_LIBRARY_ENV = {
  url: "PPT_FACTORY_SUPABASE_URL",
  secretKey: "PPT_FACTORY_SUPABASE_SECRET_KEY",
  legacyServiceRoleKey: "PPT_FACTORY_SUPABASE_SERVICE_ROLE_KEY",
  schema: "PPT_FACTORY_SUPABASE_SCHEMA",
  objectBucket: "PPT_FACTORY_SUPABASE_STYLE_BUCKET"
} as const;

export type SupabaseTeamLibraryCredentialSource = "secret-key" | "legacy-service-role";

export type SupabaseTeamLibraryPublicConfig = {
  backend: "supabase-postgres";
  valid: boolean;
  missing: string[];
  errors: string[];
  url?: string;
  schema: string;
  objectBucket: string;
  credentialEnvironmentVariable: typeof SUPABASE_TEAM_LIBRARY_ENV.secretKey | typeof SUPABASE_TEAM_LIBRARY_ENV.legacyServiceRoleKey;
  credentialSource: SupabaseTeamLibraryCredentialSource | null;
  credentialConfigured: boolean;
  legacyCredentialConfigured: boolean;
};

type SupabaseTeamLibraryServerConfig = {
  url: string;
  schema: string;
  objectBucket: string;
  apiKey: string;
  credentialSource: SupabaseTeamLibraryCredentialSource;
};

export type SupabaseTeamLibraryAuthenticatedActor = TeamLibraryActor & {
  /** Verified user access token. This must never be serialized or logged. */
  accessToken: string;
};

export type SupabaseTeamLibraryFetch = typeof fetch;

export class SupabaseTeamLibraryRequestError extends Error {
  readonly code: "REMOTE_CONFIG_INVALID" | "AUTH_REQUIRED" | "AUTH_INVALID" | "REMOTE_ERROR";
  readonly status: number;

  constructor(message: string, code: SupabaseTeamLibraryRequestError["code"], status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/** Server-only remote repository bound to one verified request identity. */
export interface SupabasePostgresTeamStyleLibraryRepository extends TeamStyleLibraryRepository {
  readonly backend: "supabase-postgres";
  readonly actor: Readonly<TeamLibraryActor>;
}

export function validateSupabaseTeamLibraryConfig(
  environment: Record<string, string | undefined> = process.env
): SupabaseTeamLibraryPublicConfig {
  const rawUrl = environment[SUPABASE_TEAM_LIBRARY_ENV.url]?.trim();
  const secretConfigured = Boolean(environment[SUPABASE_TEAM_LIBRARY_ENV.secretKey]?.trim());
  const legacyCredentialConfigured = Boolean(environment[SUPABASE_TEAM_LIBRARY_ENV.legacyServiceRoleKey]?.trim());
  const credentialSource: SupabaseTeamLibraryCredentialSource | null = secretConfigured
    ? "secret-key"
    : legacyCredentialConfigured ? "legacy-service-role" : null;
  const credentialEnvironmentVariable = credentialSource === "legacy-service-role"
    ? SUPABASE_TEAM_LIBRARY_ENV.legacyServiceRoleKey
    : SUPABASE_TEAM_LIBRARY_ENV.secretKey;
  const missing = [
    ...(!rawUrl ? [SUPABASE_TEAM_LIBRARY_ENV.url] : []),
    ...(!credentialSource ? [SUPABASE_TEAM_LIBRARY_ENV.secretKey] : [])
  ];
  const errors: string[] = [];
  let publicUrl: string | undefined;
  if (rawUrl) {
    try {
      const url = new URL(rawUrl);
      if (url.protocol !== "https:") errors.push(`${SUPABASE_TEAM_LIBRARY_ENV.url} must use https`);
      else publicUrl = url.origin;
      if (url.username || url.password) errors.push(`${SUPABASE_TEAM_LIBRARY_ENV.url} must not contain credentials`);
      if (url.search || url.hash) errors.push(`${SUPABASE_TEAM_LIBRARY_ENV.url} must not contain query or fragment data`);
      if (url.pathname && url.pathname !== "/") errors.push(`${SUPABASE_TEAM_LIBRARY_ENV.url} must be a project origin without a path`);
    } catch {
      errors.push(`${SUPABASE_TEAM_LIBRARY_ENV.url} must be a valid URL`);
    }
  }
  const rawSchema = environment[SUPABASE_TEAM_LIBRARY_ENV.schema]?.trim() || "ppt_factory";
  const rawObjectBucket = environment[SUPABASE_TEAM_LIBRARY_ENV.objectBucket]?.trim() || "ppt-factory-style-library";
  const schemaValid = /^[a-zA-Z][a-zA-Z0-9_]{0,62}$/.test(rawSchema);
  const objectBucketValid = /^[a-z0-9][a-z0-9._-]{0,62}$/.test(rawObjectBucket);
  if (!schemaValid) errors.push(`${SUPABASE_TEAM_LIBRARY_ENV.schema} has an invalid identifier`);
  if (!objectBucketValid) errors.push(`${SUPABASE_TEAM_LIBRARY_ENV.objectBucket} has an invalid identifier`);
  return {
    backend: "supabase-postgres",
    valid: missing.length === 0 && errors.length === 0,
    missing,
    errors,
    ...(publicUrl ? { url: publicUrl } : {}),
    schema: schemaValid ? rawSchema : "ppt_factory",
    objectBucket: objectBucketValid ? rawObjectBucket : "ppt-factory-style-library",
    credentialEnvironmentVariable,
    credentialSource,
    credentialConfigured: Boolean(credentialSource),
    legacyCredentialConfigured
  };
}

function serverConfig(environment: Record<string, string | undefined>): SupabaseTeamLibraryServerConfig {
  const publicConfig = validateSupabaseTeamLibraryConfig(environment);
  if (!publicConfig.valid || !publicConfig.url || !publicConfig.credentialSource) {
    throw new SupabaseTeamLibraryRequestError("Supabase Team Style Library configuration is incomplete or invalid", "REMOTE_CONFIG_INVALID", 503);
  }
  const apiKey = environment[publicConfig.credentialEnvironmentVariable]?.trim();
  if (!apiKey) throw new SupabaseTeamLibraryRequestError("Supabase Team Style Library credential is unavailable", "REMOTE_CONFIG_INVALID", 503);
  return {
    url: publicConfig.url,
    schema: publicConfig.schema,
    objectBucket: publicConfig.objectBucket,
    apiKey,
    credentialSource: publicConfig.credentialSource
  };
}

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization);
  if (!match) throw new SupabaseTeamLibraryRequestError("Supabase Auth bearer token is required", "AUTH_REQUIRED", 401);
  return match[1];
}

async function safeJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Verifies the caller with Supabase Auth. Tenant/team are request scope, while
 * user identity comes only from the verified Auth response; x-ppt-user-id and
 * request JSON are intentionally ignored.
 */
export async function authenticateSupabaseTeamLibraryActor(
  request: Request,
  environment: Record<string, string | undefined> = process.env,
  fetchImpl: SupabaseTeamLibraryFetch = fetch
): Promise<SupabaseTeamLibraryAuthenticatedActor> {
  const config = serverConfig(environment);
  const accessToken = bearerToken(request);
  const tenantId = request.headers.get("x-ppt-tenant-id") ?? "";
  const teamId = request.headers.get("x-ppt-team-id") ?? "";
  assertTeamId(tenantId, "tenantId");
  assertTeamId(teamId, "teamId");
  let response: Response;
  try {
    response = await fetchImpl(`${config.url}/auth/v1/user`, {
      method: "GET",
      headers: { apikey: config.apiKey, authorization: `Bearer ${accessToken}` },
      cache: "no-store"
    });
  } catch {
    throw new SupabaseTeamLibraryRequestError("Supabase Auth verification is unavailable", "REMOTE_ERROR", 503);
  }
  const payload = await safeJson(response);
  if (!response.ok || !isRecord(payload) || typeof payload.id !== "string") {
    throw new SupabaseTeamLibraryRequestError("Supabase Auth bearer token is invalid", "AUTH_INVALID", 401);
  }
  assertTeamId(payload.id, "authenticated userId");
  return { tenantId, teamId, userId: payload.id, accessToken };
}

function assertBoundScope(actor: TeamLibraryActor, scope: TeamLibraryScope) {
  assertTeamId(scope.tenantId, "tenantId");
  assertTeamId(scope.teamId, "teamId");
  if (actor.tenantId !== scope.tenantId || actor.teamId !== scope.teamId) {
    throw new TeamLibraryError("Remote repository scope does not match the authenticated request", "FORBIDDEN");
  }
}

function rpcError(payload: unknown, response: Response): never {
  const message = isRecord(payload) && typeof payload.message === "string" ? payload.message : "";
  if (message.includes("PPT_FACTORY_NOT_FOUND") || response.status === 404) {
    throw new TeamLibraryError("Team Style Library not found", "NOT_FOUND");
  }
  if (message.includes("PPT_FACTORY_FORBIDDEN") || response.status === 401 || response.status === 403) {
    throw new TeamLibraryError("Team Style Library operation is forbidden", "FORBIDDEN");
  }
  if (message.includes("PPT_FACTORY_CONFLICT") || response.status === 409) {
    throw new TeamLibraryError("Team Style Library revision conflict", "CONFLICT");
  }
  if (message.includes("PPT_FACTORY_INVALID") || response.status === 400 || response.status === 422) {
    throw new TeamLibraryError("Team Style Library remote payload is invalid", "INVALID");
  }
  throw new SupabaseTeamLibraryRequestError("Supabase Team Style Library request failed", "REMOTE_ERROR", 502);
}

export class SupabaseFetchTeamStyleLibraryRepository implements SupabasePostgresTeamStyleLibraryRepository {
  readonly backend = "supabase-postgres" as const;
  readonly actor: Readonly<TeamLibraryActor>;
  private readonly config: SupabaseTeamLibraryServerConfig;
  private readonly authenticatedActor: SupabaseTeamLibraryAuthenticatedActor;
  private readonly fetchImpl: SupabaseTeamLibraryFetch;

  constructor(
    authenticatedActor: SupabaseTeamLibraryAuthenticatedActor,
    environment: Record<string, string | undefined> = process.env,
    fetchImpl: SupabaseTeamLibraryFetch = fetch
  ) {
    assertTeamId(authenticatedActor.userId, "authenticated userId");
    assertBoundScope(authenticatedActor, authenticatedActor);
    if (!authenticatedActor.accessToken) {
      throw new SupabaseTeamLibraryRequestError("Verified Supabase Auth context is required", "AUTH_REQUIRED", 401);
    }
    this.config = serverConfig(environment);
    this.authenticatedActor = { ...authenticatedActor };
    this.actor = {
      tenantId: authenticatedActor.tenantId,
      teamId: authenticatedActor.teamId,
      userId: authenticatedActor.userId
    };
    this.fetchImpl = fetchImpl;
  }

  async read(scope: TeamLibraryScope): Promise<TeamStyleLibrary | undefined> {
    assertBoundScope(this.actor, scope);
    const payload = await this.rpc("team_style_library_read", {
      p_tenant_id: scope.tenantId,
      p_team_id: scope.teamId
    });
    if (payload === null || payload === undefined) return undefined;
    return validateTeamStyleLibrary(payload as TeamStyleLibrary);
  }

  async create(library: TeamStyleLibrary): Promise<void> {
    assertBoundScope(this.actor, library);
    const canonical = validateTeamStyleLibrary(library);
    await this.rpc("team_style_library_create", { p_library: canonical });
  }

  async write(library: TeamStyleLibrary, expectedRevision: number): Promise<void> {
    assertBoundScope(this.actor, library);
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
      throw new TeamLibraryError("Expected revision must be a positive integer", "INVALID");
    }
    const canonical = validateTeamStyleLibrary(library);
    if (canonical.revision !== expectedRevision + 1) {
      throw new TeamLibraryError("Team Style Library revision must increment by one", "INVALID");
    }
    await this.rpc("team_style_library_compare_and_swap", {
      p_library: canonical,
      p_expected_revision: expectedRevision
    });
  }

  private async rpc(name: string, body: Record<string, unknown>) {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.config.url}/rest/v1/rpc/${name}`, {
        method: "POST",
        headers: {
          apikey: this.config.apiKey,
          authorization: `Bearer ${this.authenticatedActor.accessToken}`,
          "content-type": "application/json",
          "content-profile": this.config.schema,
          "accept-profile": this.config.schema
        },
        body: JSON.stringify(body),
        cache: "no-store"
      });
    } catch {
      throw new SupabaseTeamLibraryRequestError("Supabase Team Style Library is unavailable", "REMOTE_ERROR", 503);
    }
    const payload = await safeJson(response);
    if (!response.ok) rpcError(payload, response);
    return payload;
  }
}

export function createSupabaseTeamStyleLibraryRepository(
  actor: SupabaseTeamLibraryAuthenticatedActor,
  environment: Record<string, string | undefined> = process.env,
  fetchImpl: SupabaseTeamLibraryFetch = fetch
) {
  return new SupabaseFetchTeamStyleLibraryRepository(actor, environment, fetchImpl);
}

export type TeamStyleAssetMetadata = {
  assetId: string;
  tenantId: string;
  teamId: string;
  objectPath: string;
  contentType: string;
  byteSize: number;
  sha256: string;
  artifactType?: "style_pack" | "golden_slide";
  artifactId?: string;
  artifactVersion?: string;
  createdBy: string;
  createdAt: string;
};

export type TeamStyleAssetSignedRetrieval = {
  metadata: TeamStyleAssetMetadata;
  signedUrl: string;
  expiresIn: number;
};

/** Private Storage retrieval is permitted only after scoped metadata passes RLS. */
export class SupabasePrivateTeamStyleAssetStore {
  private readonly config: SupabaseTeamLibraryServerConfig;
  private readonly actorContext: SupabaseTeamLibraryAuthenticatedActor;
  private readonly fetchImpl: SupabaseTeamLibraryFetch;

  constructor(
    actorContext: SupabaseTeamLibraryAuthenticatedActor,
    environment: Record<string, string | undefined> = process.env,
    fetchImpl: SupabaseTeamLibraryFetch = fetch
  ) {
    assertBoundScope(actorContext, actorContext);
    this.actorContext = actorContext;
    this.fetchImpl = fetchImpl;
    this.config = serverConfig(environment);
  }

  async getSignedAsset(scope: TeamLibraryScope, assetId: string, expiresIn = 300): Promise<TeamStyleAssetSignedRetrieval> {
    assertBoundScope(this.actorContext, scope);
    assertTeamId(assetId, "assetId");
    if (!Number.isSafeInteger(expiresIn) || expiresIn < 60 || expiresIn > 3600) {
      throw new TeamLibraryError("Signed asset expiry must be between 60 and 3600 seconds", "INVALID");
    }
    const query = new URLSearchParams({
      select: "asset_id,tenant_id,team_id,object_path,content_type,byte_size,sha256,artifact_type,artifact_id,artifact_version,created_by,created_at",
      tenant_id: `eq.${scope.tenantId}`,
      team_id: `eq.${scope.teamId}`,
      asset_id: `eq.${assetId}`,
      limit: "1"
    });
    const metadataResponse = await this.fetchImpl(`${this.config.url}/rest/v1/team_style_assets?${query}`, {
      method: "GET",
      headers: this.headers({ "accept-profile": this.config.schema }),
      cache: "no-store"
    });
    const rows = await safeJson(metadataResponse);
    if (!metadataResponse.ok) rpcError(rows, metadataResponse);
    if (!Array.isArray(rows) || rows.length !== 1 || !isRecord(rows[0])) {
      throw new TeamLibraryError("Team style asset not found", "NOT_FOUND");
    }
    const metadata = parseAssetMetadata(rows[0]);
    const prefix = `${scope.tenantId}/${scope.teamId}/`;
    if (!metadata.objectPath.startsWith(prefix) || metadata.objectPath.includes("..")) {
      throw new SupabaseTeamLibraryRequestError("Stored team style asset path is invalid", "REMOTE_ERROR", 502);
    }
    const encodedPath = metadata.objectPath.split("/").map(encodeURIComponent).join("/");
    const signedResponse = await this.fetchImpl(`${this.config.url}/storage/v1/object/sign/${encodeURIComponent(this.config.objectBucket)}/${encodedPath}`, {
      method: "POST",
      headers: this.headers({ "content-type": "application/json" }),
      body: JSON.stringify({ expiresIn }),
      cache: "no-store"
    });
    const signed = await safeJson(signedResponse);
    if (!signedResponse.ok) rpcError(signed, signedResponse);
    if (!isRecord(signed) || typeof signed.signedURL !== "string") {
      throw new SupabaseTeamLibraryRequestError("Supabase Storage returned an invalid signed URL", "REMOTE_ERROR", 502);
    }
    return {
      metadata,
      signedUrl: new URL(signed.signedURL, this.config.url).toString(),
      expiresIn
    };
  }

  private headers(additional: Record<string, string>) {
    return {
      apikey: this.config.apiKey,
      authorization: `Bearer ${this.actorContext.accessToken}`,
      ...additional
    };
  }
}

function parseAssetMetadata(row: Record<string, unknown>): TeamStyleAssetMetadata {
  for (const field of ["asset_id", "tenant_id", "team_id", "object_path", "content_type", "sha256", "created_by", "created_at"]) {
    if (typeof row[field] !== "string" || !row[field]) {
      throw new SupabaseTeamLibraryRequestError("Supabase asset metadata is invalid", "REMOTE_ERROR", 502);
    }
  }
  if (typeof row.byte_size !== "number" || !Number.isSafeInteger(row.byte_size) || row.byte_size < 0) {
    throw new SupabaseTeamLibraryRequestError("Supabase asset metadata is invalid", "REMOTE_ERROR", 502);
  }
  if (!/^[a-f0-9]{64}$/.test(row.sha256 as string)) {
    throw new SupabaseTeamLibraryRequestError("Supabase asset metadata is invalid", "REMOTE_ERROR", 502);
  }
  return {
    assetId: row.asset_id as string,
    tenantId: row.tenant_id as string,
    teamId: row.team_id as string,
    objectPath: row.object_path as string,
    contentType: row.content_type as string,
    byteSize: row.byte_size,
    sha256: row.sha256 as string,
    ...(typeof row.artifact_type === "string" ? { artifactType: row.artifact_type as "style_pack" | "golden_slide" } : {}),
    ...(typeof row.artifact_id === "string" ? { artifactId: row.artifact_id } : {}),
    ...(typeof row.artifact_version === "string" ? { artifactVersion: row.artifact_version } : {}),
    createdBy: row.created_by as string,
    createdAt: row.created_at as string
  };
}
