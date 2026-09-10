import { z } from "zod";
import { updateRoomSettings } from "@/server/game-service";
import { broadcastRoom } from "@/server/realtime";
import { apiError } from "@/server/api-response";

const schema = z.object({
  playerToken: z.string().min(20),
  stateVersion: z.number().int().positive(),
  startingStack: z.number().int().min(100).max(1_000_000).optional(),
  totalHands: z.number().int().min(1).max(200).optional(),
  actionSeconds: z.number().int().min(5).max(120).optional(),
  squidValue: z.number().int().positive().max(1_000_000).optional(),
  smallBlind: z.number().int().positive().max(1_000_000),
  bigBlind: z.number().int().positive().max(1_000_000)
}).refine((value) => value.bigBlind >= value.smallBlind * 2, { message: "INVALID_BLINDS" });

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await context.params;
    const body = schema.parse(await request.json());
    const payload = await updateRoomSettings(code, body.playerToken, body.stateVersion, body);
    await broadcastRoom(code, payload.stateVersion, "state:updated").catch(() => undefined);
    return Response.json(payload);
  } catch (error) { return apiError(error); }
}
