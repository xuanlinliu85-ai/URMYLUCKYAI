import { NextResponse } from "next/server";

const statusByCode: Record<string, number> = {
  ROOM_NOT_FOUND: 404,
  ROOM_FULL: 409,
  NICKNAME_TAKEN: 409,
  STATE_CONFLICT: 409,
  NOT_YOUR_TURN: 409,
  INVALID_PLAYER_TOKEN: 401,
  HOST_ONLY: 403,
  NEED_TWO_PLAYERS: 409,
  GAME_NOT_STARTED: 409,
  HAND_IN_PROGRESS: 409,
  SHOW_NOT_AVAILABLE: 409,
  SUPABASE_NOT_CONFIGURED: 503
};

export function apiError(error: unknown): NextResponse {
  const code = error instanceof Error ? error.message : "UNKNOWN_ERROR";
  const safeCode = code in statusByCode || /^[A-Z_]+$/.test(code) ? code : "SERVER_ERROR";
  return NextResponse.json({ error: safeCode }, { status: statusByCode[safeCode] ?? 400 });
}
