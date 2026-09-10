import { z } from "zod";
import { decideShow } from "@/server/game-service";
import { broadcastRoom } from "@/server/realtime";
import { apiError } from "@/server/api-response";

const schema = z.object({ roomCode: z.string().min(5).max(6), playerToken: z.string().min(20), show: z.boolean(), stateVersion: z.number().int().positive() });

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const payload = await decideShow(input.roomCode, input.playerToken, input.show, input.stateVersion);
    await broadcastRoom(input.roomCode, payload.stateVersion, payload.publicState.squid?.status === "SETTLING" ? "squid:settlement" : "squid:awarded").catch(() => undefined);
    return Response.json(payload);
  } catch (error) { return apiError(error); }
}
