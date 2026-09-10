import { z } from "zod";
import { startNextHand } from "@/server/game-service";
import { broadcastRoom } from "@/server/realtime";
import { apiError } from "@/server/api-response";

const schema = z.object({ playerToken: z.string().min(20), stateVersion: z.number().int().positive() });

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await context.params;
    const input = schema.parse(await request.json());
    const payload = await startNextHand(code, input.playerToken, input.stateVersion);
    await broadcastRoom(code, payload.stateVersion, "hand:started").catch(() => undefined);
    return Response.json(payload);
  } catch (error) { return apiError(error); }
}
