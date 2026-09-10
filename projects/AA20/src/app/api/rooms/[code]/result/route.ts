import { z } from "zod";
import { loadNightSummaries } from "@/server/game-service";
import { apiError } from "@/server/api-response";

const schema = z.object({ playerToken: z.string().min(20) });
export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await context.params;
    return Response.json({ summaries: await loadNightSummaries(code, schema.parse(await request.json()).playerToken) });
  } catch (error) { return apiError(error); }
}
