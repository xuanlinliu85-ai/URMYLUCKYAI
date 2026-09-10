import { z } from "zod";
import { finishRoom } from "@/server/game-service";
import { broadcastRoom } from "@/server/realtime";
import { apiError } from "@/server/api-response";

const schema = z.object({ playerToken: z.string().min(20) });

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await context.params;
    const summaries = await finishRoom(code, schema.parse(await request.json()).playerToken);
    await broadcastRoom(code, 0, "room:finished").catch(() => undefined);
    return Response.json({ summaries });
  } catch (error) { return apiError(error); }
}
