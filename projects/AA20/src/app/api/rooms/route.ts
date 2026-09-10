import { z } from "zod";
import { createRoom } from "@/server/game-service";
import { apiError } from "@/server/api-response";

const schema = z.object({
  nickname: z.string().trim().min(1).max(16),
  avatarId: z.string().min(1).max(32),
  maxPlayers: z.number().int().min(2).max(7).default(7),
  totalHands: z.number().int().min(1).max(200).default(10),
  actionSeconds: z.number().int().min(5).max(120).default(30),
  startingStack: z.number().int().min(100).max(1_000_000).default(10_000),
  smallBlind: z.number().int().positive().default(50),
  bigBlind: z.number().int().positive().default(100),
  squidPreset: z.enum(["OFF", "CLASSIC", "PROGRESSIVE"]).default("CLASSIC"),
  squidValue: z.number().int().positive().max(1_000_000).default(500)
}).refine((value) => value.bigBlind >= value.smallBlind * 2, { message: "INVALID_BLINDS" });

export async function POST(request: Request) {
  try {
    return Response.json(await createRoom(schema.parse(await request.json())), { status: 201 });
  } catch (error) { return apiError(error); }
}
