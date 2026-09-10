import { env } from "cloudflare:workers";
import { NextRequest, NextResponse } from "next/server";
import { getChatGPTUser } from "../../chatgpt-auth";

type RefreshStatus = "pending" | "running" | "completed" | "failed";
type RefreshRow = {
  id: number;
  requested_at: string;
  status: RefreshStatus;
  started_at: string | null;
  completed_at: string | null;
  requested_snapshot_date: string | null;
  result_trade_date: string | null;
  message: string | null;
};

function binding(name: "REFRESH_OWNER_EMAIL" | "REFRESH_WORKER_TOKEN") {
  const runtime = env as unknown as Record<string, unknown>;
  return String(runtime[name] || process.env[name] || "").trim();
}

function database() {
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db) throw new Error("D1 binding unavailable");
  return db;
}

function isWorker(request: NextRequest) {
  const expected = binding("REFRESH_WORKER_TOKEN");
  const actual = request.headers.get("x-refresh-worker-token") || "";
  return Boolean(expected && actual && actual === expected);
}

function isOwner(email?: string | null) {
  const owner = binding("REFRESH_OWNER_EMAIL").toLowerCase();
  return Boolean(owner && email && email.toLowerCase() === owner);
}

function publicRequest(row?: RefreshRow | null) {
  if (!row) return null;
  return {
    id: row.id,
    requestedAt: row.requested_at,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    requestedSnapshotDate: row.requested_snapshot_date,
    resultTradeDate: row.result_trade_date,
    message: row.message,
  };
}

async function latestRequest() {
  return database().prepare(`
    SELECT id, requested_at, status, started_at, completed_at,
           requested_snapshot_date, result_trade_date, message
    FROM refresh_requests
    ORDER BY id DESC
    LIMIT 1
  `).first<RefreshRow>();
}

async function activeRequest() {
  return database().prepare(`
    SELECT id, requested_at, status, started_at, completed_at,
           requested_snapshot_date, result_trade_date, message
    FROM refresh_requests
    WHERE status IN ('pending', 'running')
    ORDER BY id ASC
    LIMIT 1
  `).first<RefreshRow>();
}

export async function GET(request: NextRequest) {
  try {
    if (isWorker(request)) {
      return NextResponse.json({ worker: true, request: publicRequest(await activeRequest()) }, {
        headers: { "Cache-Control": "no-store" },
      });
    }
    const user = await getChatGPTUser();
    return NextResponse.json({
      authenticated: Boolean(user),
      allowed: isOwner(user?.email),
      request: publicRequest(await latestRequest()),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "refresh status unavailable" }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "sign-in required" }, { status: 401 });
  if (!isOwner(user.email)) return NextResponse.json({ error: "owner access required" }, { status: 403 });

  try {
    const existing = await activeRequest();
    if (existing) return NextResponse.json({ request: publicRequest(existing), reused: true }, { status: 202 });

    const body = await request.json().catch(() => ({})) as { snapshotDate?: string };
    const snapshotDate = /^\d{4}-\d{2}-\d{2}$/.test(body.snapshotDate || "") ? body.snapshotDate! : null;
    const requestedAt = new Date().toISOString();
    const result = await database().prepare(`
      INSERT INTO refresh_requests
        (requested_by, requested_at, status, requested_snapshot_date, message)
      VALUES (?, ?, 'pending', ?, '等待本地更新任务接收')
    `).bind(user.email.toLowerCase(), requestedAt, snapshotDate).run();
    const id = Number(result.meta.last_row_id);
    const row = await database().prepare(`
      SELECT id, requested_at, status, started_at, completed_at,
             requested_snapshot_date, result_trade_date, message
      FROM refresh_requests WHERE id = ?
    `).bind(id).first<RefreshRow>();
    return NextResponse.json({ request: publicRequest(row) }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "refresh request failed" }, { status: 503 });
  }
}

export async function PATCH(request: NextRequest) {
  if (!isWorker(request)) return NextResponse.json({ error: "worker access required" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as {
    id?: number;
    status?: RefreshStatus;
    resultTradeDate?: string;
    message?: string;
  };
  const id = Number(body.id);
  const status = body.status;
  if (!Number.isInteger(id) || id <= 0 || !status || !["running", "completed", "failed"].includes(status)) {
    return NextResponse.json({ error: "invalid refresh update" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const resultTradeDate = /^\d{4}-\d{2}-\d{2}$/.test(body.resultTradeDate || "") ? body.resultTradeDate! : null;
  const message = String(body.message || "").slice(0, 800) || null;
  try {
    if (status === "running") {
      await database().prepare(`
        UPDATE refresh_requests
        SET status = 'running', started_at = COALESCE(started_at, ?), message = ?
        WHERE id = ? AND status = 'pending'
      `).bind(now, message || "正在拉取并校验线上数据", id).run();
    } else {
      await database().prepare(`
        UPDATE refresh_requests
        SET status = ?, completed_at = ?, result_trade_date = ?, message = ?
        WHERE id = ? AND status IN ('pending', 'running')
      `).bind(status, now, resultTradeDate, message, id).run();
    }
    const row = await database().prepare(`
      SELECT id, requested_at, status, started_at, completed_at,
             requested_snapshot_date, result_trade_date, message
      FROM refresh_requests WHERE id = ?
    `).bind(id).first<RefreshRow>();
    return NextResponse.json({ request: publicRequest(row) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "refresh update failed" }, { status: 503 });
  }
}
