import { z } from "zod";
import { authenticate, loadRoom, syncPayload } from "@/server/game-service";
import { apiError } from "@/server/api-response";

const schema = z.object({ roomCode: z.string().trim().min(5).max(6), playerToken: z.string().min(20) });

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const { room, members, runtime } = await loadRoom(input.roomCode);
    return Response.json(syncPayload(room, members, runtime, authenticate(members, input.playerToken)));
  } catch (error) { return apiError(error); }
}
