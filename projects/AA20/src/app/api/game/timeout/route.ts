import { z } from "zod";
import { timeoutRoomAction } from "@/server/game-service";
import { broadcastRoom } from "@/server/realtime";
import { apiError } from "@/server/api-response";

const schema = z.object({ roomCode: z.string().min(5).max(6), stateVersion: z.number().int().positive() });
export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const stateVersion = await timeoutRoomAction(input.roomCode, input.stateVersion);
    await broadcastRoom(input.roomCode, stateVersion, "state:updated").catch(() => undefined);
    return Response.json({ stateVersion });
  } catch (error) { return apiError(error); }
}
