import { z } from "zod";
import { actInRoom } from "@/server/game-service";
import { broadcastRoom } from "@/server/realtime";
import { apiError } from "@/server/api-response";

const schema = z.object({
  roomCode: z.string().min(5).max(6), playerToken: z.string().min(20), actionId: z.string().uuid(),
  handId: z.string().uuid(), stateVersion: z.number().int().positive(),
  action: z.object({ type: z.enum(["FOLD", "CHECK", "CALL", "BET", "RAISE", "ALL_IN"]), amount: z.number().int().nonnegative().optional() })
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const payload = await actInRoom(input);
    await broadcastRoom(input.roomCode, payload.stateVersion, payload.publicState.poker?.street === "FINISHED" ? "hand:finished" : "player:acted").catch(() => undefined);
    return Response.json(payload);
  } catch (error) { return apiError(error); }
}
