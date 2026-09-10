import "server-only";
import { serverSupabase } from "./supabase";

export async function broadcastRoom(roomCode: string, stateVersion: number, type = "state:updated"): Promise<void> {
  const client = serverSupabase();
  const channel = client.channel(`room:${roomCode}`);
  try {
    await channel.send({ type: "broadcast", event: type, payload: { stateVersion, timestamp: Date.now() } });
  } finally {
    await client.removeChannel(channel);
  }
}
