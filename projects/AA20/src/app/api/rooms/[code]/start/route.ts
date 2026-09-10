import { z } from "zod";
import { startRoom } from "@/server/game-service";
import { broadcastRoom } from "@/server/realtime";
import { apiError } from "@/server/api-response";

const schema = z.object({ playerToken: z.string().min(20) });

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await context.params;
    const payload = await startRoom(code, schema.parse(await request.json()).playerToken);
    await broadcastRoom(code, payload.stateVersion, "hand:started").catch(() => undefined);
    return Response.json(payload);
  } catch (error) { return apiError(error); }
}
