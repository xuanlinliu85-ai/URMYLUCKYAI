import { z } from "zod";
import { joinRoom } from "@/server/game-service";
import { apiError } from "@/server/api-response";

const schema = z.object({ nickname: z.string().trim().min(1).max(16), avatarId: z.string().min(1).max(32) });

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await context.params;
    return Response.json(await joinRoom({ code, ...schema.parse(await request.json()) }), { status: 201 });
  } catch (error) { return apiError(error); }
}
