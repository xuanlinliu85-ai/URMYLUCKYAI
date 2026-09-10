import { z } from "zod";
import { decideRunout } from "@/server/game-service";
import { broadcastRoom } from "@/server/realtime";
import { apiError } from "@/server/api-response";

const schema = z.object({
  roomCode: z.string().min(5).max(6),
  playerToken: z.string().min(20),
  count: z.union([z.literal(1), z.literal(2)]),
  stateVersion: z.number().int().positive()
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const payload = await decideRunout(input.roomCode, input.playerToken, input.count, input.stateVersion);
    await broadcastRoom(input.roomCode, payload.stateVersion, payload.publicState.poker?.street === "FINISHED" ? "hand:finished" : "state:updated").catch(() => undefined);
    return Response.json(payload);
  } catch (error) { return apiError(error); }
}
