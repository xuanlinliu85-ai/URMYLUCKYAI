import "server-only";
import { randomUUID } from "node:crypto";
import { DEFAULT_POKER_RULES, CLASSIC_SQUID, PROGRESSIVE_SQUID, SQUID_OFF } from "@/config/presets";
import { applyAction, expireRunoutVote, legalActions, publicPokerState, settleShowdown, startHand, timeoutActionFor, voteRunout } from "@/engines/poker/engine";
import { createSquidRound, nextSquidRound, processHandResult, showDecisionWinner } from "@/engines/squid/engine";
import type { HandResult, PlayerActionRequest, PlayerNightSummary, PokerPlayerState, PokerState, RoomPublicState, RuleSnapshot, SquidRules, SquidState, SyncPayload } from "@/types/game";
import { serverSupabase } from "./supabase";
import { createPlayerToken, createRoomCode, hashPlayerToken } from "./security";

export interface RoomRow {
  id: string;
  code: string;
  host_player_id: string;
  status: "waiting" | "playing" | "paused" | "finished";
  max_players: number;
  game_mode: "poker" | "poker_squid";
  rule_snapshot: RuleSnapshot;
}

export interface MemberRow {
  player_id: string;
  seat_no: number;
  stack: number;
  buy_in_total: number;
  squid_count: number;
  token_hash: string;
  connection_state: string;
  joined_at: string;
  players: { nickname: string; avatar_id: string };
}

export interface RuntimeRow {
  room_id: string;
  state_version: number;
  poker_state: PokerState | Record<string, never>;
  squid_state: SquidState | Record<string, never>;
}

export type SquidPreset = "OFF" | "CLASSIC" | "PROGRESSIVE";

export function rulesFor(roomId: string, input: {
  maxPlayers: number; totalHands: number; actionSeconds: number; startingStack: number; smallBlind: number; bigBlind: number; squidPreset: SquidPreset; squidValue: number;
}): RuleSnapshot {
  const squidBase: SquidRules = input.squidPreset === "OFF" ? SQUID_OFF : input.squidPreset === "PROGRESSIVE" ? PROGRESSIVE_SQUID : CLASSIC_SQUID;
  return {
    roomId, version: 1, createdAt: Date.now(),
    poker: { ...DEFAULT_POKER_RULES, maxPlayers: input.maxPlayers, maxHands: input.totalHands, actionSeconds: input.actionSeconds, startingStack: input.startingStack, smallBlind: input.smallBlind, bigBlind: input.bigBlind },
    squid: { ...squidBase, squidValue: input.squidValue }
  };
}

function databaseError(error: { message: string } | null): never {
  const message = error?.message ?? "database_error";
  if (message.includes("room_not_found")) throw new Error("ROOM_NOT_FOUND");
  if (message.includes("room_full")) throw new Error("ROOM_FULL");
  if (message.includes("nickname_taken")) throw new Error("NICKNAME_TAKEN");
  if (message.includes("state_conflict")) throw new Error("STATE_CONFLICT");
  throw new Error(message);
}

export async function createRoom(input: {
  nickname: string; avatarId: string; maxPlayers: number; totalHands: number; actionSeconds: number; startingStack: number; smallBlind: number; bigBlind: number; squidPreset: SquidPreset; squidValue: number;
}): Promise<{ code: string; playerId: string; playerToken: string }> {
  const client = serverSupabase();
  const roomId = randomUUID();
  const playerId = randomUUID();
  const playerToken = createPlayerToken();
  const rules = rulesFor(roomId, input);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = createRoomCode();
    const { error } = await client.rpc("create_room_v1", {
      p_room_id: roomId, p_code: code, p_player_id: playerId, p_nickname: input.nickname,
      p_avatar_id: input.avatarId, p_token_hash: hashPlayerToken(playerToken), p_max_players: input.maxPlayers,
      p_game_mode: input.squidPreset === "OFF" ? "poker" : "poker_squid", p_rules: rules, p_starting_stack: input.startingStack
    });
    if (!error) return { code, playerId, playerToken };
    if (!error.message.includes("duplicate key")) databaseError(error);
  }
  throw new Error("ROOM_CODE_EXHAUSTED");
}

export async function joinRoom(input: { code: string; nickname: string; avatarId: string }): Promise<{ code: string; playerId: string; playerToken: string }> {
  const playerId = randomUUID();
  const playerToken = createPlayerToken();
  const { error } = await serverSupabase().rpc("join_room_v1", {
    p_player_id: playerId, p_code: input.code.toUpperCase(), p_nickname: input.nickname,
    p_avatar_id: input.avatarId, p_token_hash: hashPlayerToken(playerToken)
  });
  if (error) databaseError(error);
  return { code: input.code.toUpperCase(), playerId, playerToken };
}

export async function loadRoom(code: string): Promise<{ room: RoomRow; members: MemberRow[]; runtime: RuntimeRow }> {
  const client = serverSupabase();
  const { data: room, error: roomError } = await client.from("rooms").select("*").eq("code", code.toUpperCase()).single();
  if (roomError || !room) throw new Error("ROOM_NOT_FOUND");
  const { data: members, error: memberError } = await client.from("room_members")
    .select("player_id,seat_no,stack,buy_in_total,squid_count,token_hash,connection_state,joined_at,players!inner(nickname,avatar_id)")
    .eq("room_id", room.id).is("left_at", null).order("seat_no");
  if (memberError) databaseError(memberError);
  const { data: runtime, error: runtimeError } = await client.from("room_runtime_state").select("*").eq("room_id", room.id).single();
  if (runtimeError || !runtime) databaseError(runtimeError);
  return { room: room as RoomRow, members: members as unknown as MemberRow[], runtime: runtime as RuntimeRow };
}

export function authenticate(members: MemberRow[], playerToken: string): MemberRow {
  const tokenHash = hashPlayerToken(playerToken);
  const member = members.find((entry) => entry.token_hash === tokenHash);
  if (!member) throw new Error("INVALID_PLAYER_TOKEN");
  return member;
}

export function syncPayload(room: RoomRow, members: MemberRow[], runtime: RuntimeRow, member: MemberRow): SyncPayload {
  const poker = "handId" in runtime.poker_state ? runtime.poker_state as PokerState : undefined;
  const squid = "roundId" in runtime.squid_state ? runtime.squid_state as SquidState : undefined;
  const publicState: RoomPublicState = {
    roomId: room.id, roomCode: room.code, status: room.status, hostPlayerId: room.host_player_id,
    stateVersion: runtime.state_version, rules: room.rule_snapshot,
    members: members.map((entry) => ({
      id: entry.player_id, nickname: entry.players.nickname, avatarId: entry.players.avatar_id, seatNo: entry.seat_no,
      stack: poker?.players.find((player) => player.id === entry.player_id)?.stack ?? entry.stack,
      status: poker?.players.find((player) => player.id === entry.player_id)?.status ?? "ACTIVE",
      streetBet: poker?.players.find((player) => player.id === entry.player_id)?.streetBet ?? 0,
      totalCommitted: poker?.players.find((player) => player.id === entry.player_id)?.totalCommitted ?? 0,
      acted: poker?.players.find((player) => player.id === entry.player_id)?.acted ?? false,
      lastAction: poker?.players.find((player) => player.id === entry.player_id)?.lastAction,
      squidCount: squid?.players[entry.player_id]?.squidCount ?? entry.squid_count,
      totalSquidWon: Math.max(squid?.players[entry.player_id]?.totalSquidWon ?? 0, entry.squid_count),
      connected: entry.connection_state === "connected", buyInTotal: entry.buy_in_total
    })),
    poker: poker ? publicPokerState(poker) : undefined,
    squid
  };
  const ownPoker = poker?.players.find((player) => player.id === member.player_id);
  return {
    publicState,
    privateState: {
      playerId: member.player_id,
      holeCards: ownPoker?.holeCards,
      legalActions: poker ? legalActions(poker, member.player_id, room.rule_snapshot.poker) : undefined
    },
    stateVersion: runtime.state_version
  };
}

export async function updateRoomSettings(code: string, playerToken: string, expectedVersion: number, input: { startingStack?: number; totalHands?: number; actionSeconds?: number; squidValue?: number; smallBlind: number; bigBlind: number }): Promise<SyncPayload> {
  const { room, members, runtime } = await loadRoom(code);
  const member = authenticate(members, playerToken);
  if (member.player_id !== room.host_player_id) throw new Error("HOST_ONLY");
  const poker = "handId" in runtime.poker_state ? runtime.poker_state as PokerState : undefined;
  if (room.status !== "waiting" && poker?.street !== "FINISHED") throw new Error("HAND_IN_PROGRESS");
  const startingStack = input.startingStack ?? room.rule_snapshot.poker.startingStack;
  const maxHands = input.totalHands ?? room.rule_snapshot.poker.maxHands ?? DEFAULT_POKER_RULES.maxHands;
  const actionSeconds = input.actionSeconds ?? room.rule_snapshot.poker.actionSeconds;
  const squidValue = input.squidValue ?? room.rule_snapshot.squid.squidValue;
  const rules: RuleSnapshot = {
    ...room.rule_snapshot,
    version: room.rule_snapshot.version + 1,
    createdAt: Date.now(),
    poker: { ...room.rule_snapshot.poker, maxHands, actionSeconds, startingStack, smallBlind: input.smallBlind, bigBlind: input.bigBlind },
    squid: { ...room.rule_snapshot.squid, squidValue }
  };
  const { data: version, error } = await serverSupabase().rpc("update_room_settings_v1", {
    p_room_id: room.id, p_expected_version: expectedVersion, p_rules: rules,
    p_starting_stack: room.status === "waiting" && input.startingStack !== undefined ? startingStack : null
  });
  if (error) databaseError(error);
  room.rule_snapshot = rules;
  if (room.status === "waiting" && input.startingStack !== undefined) members.forEach((entry) => { entry.stack = startingStack; entry.buy_in_total = startingStack; });
  return syncPayload(room, members, { ...runtime, state_version: Number(version) }, member);
}

export async function rebuyInRoom(code: string, playerToken: string, expectedVersion: number, amount: number): Promise<SyncPayload> {
  const { room, members, runtime } = await loadRoom(code);
  const member = authenticate(members, playerToken);
  const poker = "handId" in runtime.poker_state ? structuredClone(runtime.poker_state as PokerState) : undefined;
  if (room.status !== "waiting" && poker?.street !== "FINISHED") throw new Error("HAND_IN_PROGRESS");
  if (poker) {
    const player = poker.players.find((entry) => entry.id === member.player_id);
    if (!player) throw new Error("PLAYER_NOT_IN_HAND");
    player.stack += amount;
  }
  const { data: version, error } = await serverSupabase().rpc("rebuy_room_v1", {
    p_room_id: room.id, p_player_id: member.player_id, p_expected_version: expectedVersion,
    p_amount: amount, p_poker_state: poker ?? runtime.poker_state
  });
  if (error) databaseError(error);
  member.stack += amount;
  member.buy_in_total += amount;
  return syncPayload(room, members, { ...runtime, state_version: Number(version), poker_state: poker ?? runtime.poker_state }, member);
}

export async function startRoom(code: string, playerToken: string): Promise<SyncPayload> {
  const { room, members, runtime } = await loadRoom(code);
  const member = authenticate(members, playerToken);
  if (member.player_id !== room.host_player_id) throw new Error("HOST_ONLY");
  if (members.length < 2) throw new Error("NEED_TWO_PLAYERS");
  if (room.status !== "waiting") return syncPayload(room, members, runtime, member);
  const pokerPlayers: PokerPlayerState[] = members.map((entry) => ({
    id: entry.player_id, nickname: entry.players.nickname, avatarId: entry.players.avatar_id, seatNo: entry.seat_no,
    stack: entry.stack, status: "ACTIVE", streetBet: 0, totalCommitted: 0, acted: false
  }));
  const poker = startHand(pokerPlayers, room.rule_snapshot.poker);
  const squid = createSquidRound(members.map((entry) => entry.player_id), room.rule_snapshot.squid);
  const client = serverSupabase();
  const { error: handError } = await client.from("hands").insert({ id: poker.handId, room_id: room.id, hand_no: poker.handNo, dealer_seat: poker.dealerSeat, state: poker.street, board: poker.board });
  if (handError) databaseError(handError);
  const privateCards = poker.players.map((player) => ({ hand_id: poker.handId, player_id: player.id, cards: player.holeCards }));
  const { error: cardError } = await client.from("hand_private_cards").insert(privateCards);
  if (cardError) databaseError(cardError);
  if (squid.enabled) await client.from("squid_rounds").insert({ id: squid.roundId, room_id: room.id, round_no: squid.roundNo, rules: room.rule_snapshot.squid, participants: squid.participantIds, status: "active" });
  const { data: version, error: casError } = await client.rpc("cas_runtime_v1", { p_room_id: room.id, p_expected_version: runtime.state_version, p_poker_state: poker, p_squid_state: squid });
  if (casError) databaseError(casError);
  await client.from("rooms").update({ status: "playing" }).eq("id", room.id);
  room.status = "playing";
  return syncPayload(room, members, { ...runtime, state_version: Number(version), poker_state: poker, squid_state: squid }, member);
}

function resultFromFinishedPoker(poker: PokerState, revealedPlayers: string[]): HandResult {
  const main = poker.pots.find((pot) => pot.type === "MAIN");
  return {
    handId: poker.handId,
    pots: poker.pots,
    mainPotWinners: main?.winnerIds ?? [],
    sidePotWinners: poker.pots.filter((pot) => pot.type === "SIDE").flatMap((pot) => pot.winnerIds),
    showdownPlayers: poker.players.filter((player) => player.status !== "FOLDED").map((player) => player.id),
    revealedPlayers,
    wasMainPotSplit: (main?.winnerIds.length ?? 0) > 1,
    runoutBoards: poker.runoutBoards
  };
}

async function persistHandFinish(roomId: string, poker: PokerState, result: HandResult, squid: SquidState): Promise<void> {
  const client = serverSupabase();
  await client.from("hands").update({ state: "FINISHED", board: poker.board, public_result: result, finished_at: new Date().toISOString() }).eq("id", poker.handId);
  if (poker.pots.length) await client.from("pots").upsert(poker.pots.map((pot, index) => ({
    hand_id: poker.handId, pot_no: index, pot_type: pot.type, amount: pot.amount,
    eligible_player_ids: pot.eligiblePlayerIds, winner_ids: pot.winnerIds, split_amounts: pot.splitAmounts
  })), { onConflict: "hand_id,pot_no" });
  const award = squid.awards.find((entry) => entry.handId === poker.handId);
  if (award) await client.from("squid_awards").upsert({
    squid_round_id: award.squidRoundId, hand_id: award.handId, player_id: award.playerId, amount: award.amount, reason: award.reason
  }, { onConflict: "squid_round_id,hand_id,player_id" });
  if (squid.settlements.length) await client.from("squid_settlements").upsert(squid.settlements.map((entry) => ({
    squid_round_id: entry.squidRoundId, from_player_id: entry.fromPlayerId, to_player_id: entry.toPlayerId,
    amount: entry.amount, details: entry
  })), { onConflict: "squid_round_id,from_player_id,to_player_id" });
  await Promise.all(poker.players.map((player) => client.from("room_members").update({
    stack: player.stack, squid_count: squid.players[player.id]?.squidCount ?? 0
  }).eq("room_id", roomId).eq("player_id", player.id)));
}

export interface ActionServiceResult extends SyncPayload { showDecisionRequired: boolean }

export async function actInRoom(request: PlayerActionRequest): Promise<ActionServiceResult> {
  const { room, members, runtime } = await loadRoom(request.roomCode);
  const member = authenticate(members, request.playerToken);
  if (request.stateVersion !== runtime.state_version) throw new Error("STATE_CONFLICT");
  if (!("handId" in runtime.poker_state) || !("roundId" in runtime.squid_state)) throw new Error("GAME_NOT_STARTED");
  let poker = runtime.poker_state as PokerState;
  let squid = runtime.squid_state as SquidState;
  if (poker.currentPlayerId !== member.player_id && !poker.processedActionIds.includes(request.actionId)) throw new Error("NOT_YOUR_TURN");
  poker = applyAction(poker, request, room.rule_snapshot.poker);
  let showDecisionPlayerId: string | undefined;
  let handResult: HandResult | undefined;
  if (poker.street === "SHOWDOWN") {
    const settled = settleShowdown(poker);
    poker = settled.state;
    handResult = settled.result;
    showDecisionPlayerId = showDecisionWinner(handResult, room.rule_snapshot.squid);
    if (showDecisionPlayerId) {
      poker.showDecisionPlayerId = showDecisionPlayerId;
      poker.actionDeadline = Date.now() + 8000;
    } else squid = processHandResult(squid, handResult, room.rule_snapshot.squid).state;
  } else if (poker.street === "FINISHED") {
    handResult = resultFromFinishedPoker(poker, []);
    showDecisionPlayerId = showDecisionWinner(handResult, room.rule_snapshot.squid);
    if (showDecisionPlayerId) {
      poker.showDecisionPlayerId = showDecisionPlayerId;
      poker.actionDeadline = Date.now() + 8000;
    }
    else squid = processHandResult(squid, handResult, room.rule_snapshot.squid).state;
  }
  const { data: version, error } = await serverSupabase().rpc("apply_action_cas_v1", {
    p_room_id: room.id, p_expected_version: runtime.state_version, p_action_id: request.actionId,
    p_hand_id: request.handId, p_player_id: member.player_id, p_action_type: request.action.type,
    p_amount: request.action.amount ?? null, p_poker_state: poker, p_squid_state: squid
  });
  if (error) databaseError(error);
  if (handResult && !showDecisionPlayerId) await persistHandFinish(room.id, poker, handResult, squid);
  const payload = syncPayload(room, members, { ...runtime, state_version: Number(version), poker_state: poker, squid_state: squid }, member);
  return { ...payload, showDecisionRequired: showDecisionPlayerId === member.player_id };
}

export async function decideShow(code: string, playerToken: string, show: boolean, expectedVersion: number): Promise<SyncPayload> {
  const { room, members, runtime } = await loadRoom(code);
  const member = authenticate(members, playerToken);
  if (runtime.state_version !== expectedVersion) throw new Error("STATE_CONFLICT");
  if (!("handId" in runtime.poker_state) || !("roundId" in runtime.squid_state)) throw new Error("GAME_NOT_STARTED");
  const poker = runtime.poker_state as PokerState;
  let squid = runtime.squid_state as SquidState;
  if (poker.street !== "FINISHED") throw new Error("SHOW_NOT_AVAILABLE");
  if (poker.showDecisionPlayerId !== member.player_id) throw new Error("SHOW_NOT_AVAILABLE");
  const result = resultFromFinishedPoker(poker, show ? [member.player_id] : []);
  if (show) {
    const holeCards = poker.players.find((player) => player.id === member.player_id)?.holeCards;
    if (holeCards) poker.revealedHoleCards = { ...(poker.revealedHoleCards ?? {}), [member.player_id]: holeCards };
  }
  poker.showDecisionPlayerId = undefined;
  poker.actionDeadline = undefined;
  squid = processHandResult(squid, result, room.rule_snapshot.squid).state;
  const { data: version, error } = await serverSupabase().rpc("cas_runtime_v1", {
    p_room_id: room.id, p_expected_version: runtime.state_version, p_poker_state: poker, p_squid_state: squid
  });
  if (error) databaseError(error);
  await persistHandFinish(room.id, poker, result, squid);
  return syncPayload(room, members, { ...runtime, state_version: Number(version), poker_state: poker, squid_state: squid }, member);
}

export async function decideRunout(code: string, playerToken: string, count: 1 | 2, expectedVersion: number): Promise<SyncPayload> {
  const { room, members, runtime } = await loadRoom(code);
  const member = authenticate(members, playerToken);
  if (runtime.state_version !== expectedVersion) throw new Error("STATE_CONFLICT");
  if (!("handId" in runtime.poker_state) || !("roundId" in runtime.squid_state)) throw new Error("GAME_NOT_STARTED");
  let poker = voteRunout(runtime.poker_state as PokerState, member.player_id, count);
  let squid = runtime.squid_state as SquidState;
  let result: HandResult | undefined;
  if (poker.street === "SHOWDOWN") {
    const settled = settleShowdown(poker);
    poker = settled.state;
    result = settled.result;
    squid = processHandResult(squid, result, room.rule_snapshot.squid).state;
  }
  const { data: version, error } = await serverSupabase().rpc("cas_runtime_v1", {
    p_room_id: room.id, p_expected_version: runtime.state_version, p_poker_state: poker, p_squid_state: squid
  });
  if (error) databaseError(error);
  if (result) await persistHandFinish(room.id, poker, result, squid);
  return syncPayload(room, members, { ...runtime, state_version: Number(version), poker_state: poker, squid_state: squid }, member);
}

export async function startNextHand(code: string, playerToken: string, expectedVersion: number): Promise<SyncPayload> {
  const { room, members, runtime } = await loadRoom(code);
  const member = authenticate(members, playerToken);
  if (member.player_id !== room.host_player_id) throw new Error("HOST_ONLY");
  if (runtime.state_version !== expectedVersion) throw new Error("STATE_CONFLICT");
  if (!("handId" in runtime.poker_state) || !("roundId" in runtime.squid_state)) throw new Error("GAME_NOT_STARTED");
  const previous = runtime.poker_state as PokerState;
  if (previous.street !== "FINISHED") throw new Error("HAND_IN_PROGRESS");
  if (previous.handNo >= (room.rule_snapshot.poker.maxHands ?? DEFAULT_POKER_RULES.maxHands)) throw new Error("HAND_LIMIT_REACHED");
  const poker = startHand(previous.players.filter((player) => player.stack > 0).map((player) => ({ ...player, holeCards: undefined })), room.rule_snapshot.poker, previous.handNo + 1, previous.dealerSeat);
  let squid = runtime.squid_state as SquidState;
  if (squid.status === "SETTLING" || squid.status === "FINISHED") {
    await serverSupabase().from("squid_rounds").update({ status: "finished", finished_at: new Date().toISOString() }).eq("id", squid.roundId);
    squid = nextSquidRound(squid, room.rule_snapshot.squid);
    await serverSupabase().from("squid_rounds").insert({ id: squid.roundId, room_id: room.id, round_no: squid.roundNo, rules: room.rule_snapshot.squid, participants: squid.participantIds, status: "active" });
  }
  const client = serverSupabase();
  const { error: handError } = await client.from("hands").insert({ id: poker.handId, room_id: room.id, hand_no: poker.handNo, dealer_seat: poker.dealerSeat, state: poker.street, board: [] });
  if (handError) databaseError(handError);
  await client.from("hand_private_cards").insert(poker.players.map((player) => ({ hand_id: poker.handId, player_id: player.id, cards: player.holeCards })));
  const { data: version, error } = await client.rpc("cas_runtime_v1", { p_room_id: room.id, p_expected_version: runtime.state_version, p_poker_state: poker, p_squid_state: squid });
  if (error) databaseError(error);
  return syncPayload(room, members, { ...runtime, state_version: Number(version), poker_state: poker, squid_state: squid }, member);
}

export async function finishRoom(code: string, playerToken: string): Promise<PlayerNightSummary[]> {
  const { room, members, runtime } = await loadRoom(code);
  const member = authenticate(members, playerToken);
  if (member.player_id !== room.host_player_id) throw new Error("HOST_ONLY");
  const poker = "handId" in runtime.poker_state ? runtime.poker_state as PokerState : undefined;
  const squid = "roundId" in runtime.squid_state ? runtime.squid_state as SquidState : undefined;
  const client = serverSupabase();
  const { data: settlementRows } = await client.from("squid_settlements").select("from_player_id,to_player_id,amount,squid_rounds!inner(room_id)").eq("squid_rounds.room_id", room.id);
  const { data: mainPots } = await client.from("pots").select("winner_ids,hands!inner(room_id)").eq("pot_type", "MAIN").eq("hands.room_id", room.id);
  const lifetimeSquid: Record<string, number> = {};
  for (const row of settlementRows ?? []) {
    lifetimeSquid[row.from_player_id] = (lifetimeSquid[row.from_player_id] ?? 0) - Number(row.amount);
    lifetimeSquid[row.to_player_id] = (lifetimeSquid[row.to_player_id] ?? 0) + Number(row.amount);
  }
  const wins: Record<string, number> = {};
  for (const row of mainPots ?? []) for (const winner of row.winner_ids as string[]) wins[winner] = (wins[winner] ?? 0) + 1;
  const summaries: PlayerNightSummary[] = members.map((entry) => {
    const player = poker?.players.find((candidate) => candidate.id === entry.player_id);
    const squidPlayer = squid?.players[entry.player_id];
    const pokerProfit = (player?.stack ?? entry.stack) - entry.buy_in_total;
    const squidProfit = lifetimeSquid[entry.player_id] ?? squidPlayer?.squidProfit ?? 0;
    return {
      playerId: entry.player_id, nickname: entry.players.nickname, pokerProfit, squidProfit,
      totalProfit: pokerProfit + squidProfit, handsPlayed: poker?.handNo ?? 0,
      handsWon: wins[entry.player_id] ?? 0, squidRounds: squid?.roundNo ?? 0, squidEarned: squidPlayer?.totalSquidWon ?? 0
    };
  });
  await client.from("night_summaries").upsert(summaries.map((summary) => ({ room_id: room.id, player_id: summary.playerId, summary })), { onConflict: "room_id,player_id" });
  await client.from("rooms").update({ status: "finished", finished_at: new Date().toISOString() }).eq("id", room.id);
  return summaries;
}

export async function loadNightSummaries(code: string, playerToken: string): Promise<PlayerNightSummary[]> {
  const { room, members } = await loadRoom(code);
  authenticate(members, playerToken);
  const { data, error } = await serverSupabase().from("night_summaries").select("summary").eq("room_id", room.id);
  if (error) databaseError(error);
  return (data ?? []).map((row) => row.summary as PlayerNightSummary);
}

export async function timeoutRoomAction(code: string, expectedVersion: number): Promise<number> {
  const { room, runtime } = await loadRoom(code);
  if (runtime.state_version !== expectedVersion) throw new Error("STATE_CONFLICT");
  if (!("handId" in runtime.poker_state) || !("roundId" in runtime.squid_state)) throw new Error("GAME_NOT_STARTED");
  let poker = runtime.poker_state as PokerState;
  let squid = runtime.squid_state as SquidState;
  if (!poker.actionDeadline || Date.now() < poker.actionDeadline) throw new Error("ACTION_NOT_EXPIRED");
  if (poker.street === "RUNOUT_VOTE") {
    poker = expireRunoutVote(poker);
    const settled = settleShowdown(poker);
    poker = settled.state;
    const result = settled.result;
    squid = processHandResult(squid, result, room.rule_snapshot.squid).state;
    const { data: version, error } = await serverSupabase().rpc("cas_runtime_v1", {
      p_room_id: room.id, p_expected_version: runtime.state_version, p_poker_state: poker, p_squid_state: squid
    });
    if (error) databaseError(error);
    await persistHandFinish(room.id, poker, result, squid);
    return Number(version);
  }
  if (poker.street === "FINISHED" && poker.showDecisionPlayerId) {
    const result = resultFromFinishedPoker(poker, []);
    poker = { ...poker, showDecisionPlayerId: undefined, actionDeadline: undefined };
    squid = processHandResult(squid, result, room.rule_snapshot.squid).state;
    const { data: version, error } = await serverSupabase().rpc("cas_runtime_v1", { p_room_id: room.id, p_expected_version: runtime.state_version, p_poker_state: poker, p_squid_state: squid });
    if (error) databaseError(error);
    await persistHandFinish(room.id, poker, result, squid);
    return Number(version);
  }
  const playerId = poker.currentPlayerId;
  if (!playerId) throw new Error("NO_PENDING_ACTION");
  const legal = legalActions(poker, playerId, room.rule_snapshot.poker);
  const type = timeoutActionFor(legal);
  const actionId = randomUUID();
  poker = applyAction(poker, { roomCode: code, playerToken: "server-timeout", actionId, handId: poker.handId, stateVersion: runtime.state_version, action: { type } }, room.rule_snapshot.poker);
  let result: HandResult | undefined;
  if (poker.street === "SHOWDOWN") {
    const settled = settleShowdown(poker); poker = settled.state; result = settled.result;
    const winnerId = showDecisionWinner(result, room.rule_snapshot.squid);
    if (winnerId) { poker.showDecisionPlayerId = winnerId; poker.actionDeadline = Date.now() + 8000; result = undefined; }
    else squid = processHandResult(squid, result, room.rule_snapshot.squid).state;
  } else if (poker.street === "FINISHED") {
    result = resultFromFinishedPoker(poker, []);
    const winnerId = showDecisionWinner(result, room.rule_snapshot.squid);
    if (winnerId) {
      poker.showDecisionPlayerId = winnerId; poker.actionDeadline = Date.now() + 8000; result = undefined;
    } else squid = processHandResult(squid, result, room.rule_snapshot.squid).state;
  }
  const { data: version, error } = await serverSupabase().rpc("apply_action_cas_v1", {
    p_room_id: room.id, p_expected_version: runtime.state_version, p_action_id: actionId, p_hand_id: poker.handId,
    p_player_id: playerId, p_action_type: type, p_amount: null, p_poker_state: poker, p_squid_state: squid
  });
  if (error) databaseError(error);
  if (result) await persistHandFinish(room.id, poker, result, squid);
  return Number(version);
}
