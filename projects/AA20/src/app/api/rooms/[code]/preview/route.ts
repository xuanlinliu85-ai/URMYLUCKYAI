import { apiError } from "@/server/api-response";
import { loadRoom } from "@/server/game-service";

export async function GET(_request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await context.params;
    const { room, members } = await loadRoom(code);
    return Response.json({
      code: room.code, status: room.status, maxPlayers: room.max_players,
      mode: room.game_mode, squidValue: room.rule_snapshot.squid.squidValue,
      players: members.map((member) => ({ nickname: member.players.nickname, avatarId: member.players.avatar_id, seatNo: member.seat_no, isHost: member.player_id === room.host_player_id }))
    });
  } catch (error) { return apiError(error); }
}
