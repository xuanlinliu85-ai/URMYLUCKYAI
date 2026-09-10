import { z } from "zod";
import { rebuyInRoom } from "@/server/game-service";
import { broadcastRoom } from "@/server/realtime";
import { apiError } from "@/server/api-response";

const schema = z.object({
  playerToken: z.string().min(20),
  stateVersion: z.number().int().positive(),
  amount: z.number().int().positive().max(1_000_000)
});

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await context.params;
    const body = schema.parse(await request.json());
    const payload = await rebuyInRoom(code, body.playerToken, body.stateVersion, body.amount);
    await broadcastRoom(code, payload.stateVersion, "state:updated").catch(() => undefined);
    return Response.json(payload);
  } catch (error) { return apiError(error); }
}
