import { randomUUID } from "node:crypto";
import type { Card, HandResult, LegalActions, PlayerActionRequest, PokerPlayerState, PokerRules, PokerState, Pot, RunoutResult } from "@/types/game";
import { shuffleDeck } from "./cards";
import { compareRanks, evaluateBest } from "./evaluator";
import { buildPots, splitPot } from "./pots";

function eligiblePlayers(players: PokerPlayerState[]): PokerPlayerState[] {
  return players.filter((player) => player.status === "ACTIVE" || player.status === "ALL_IN");
}

const RUNOUT_VOTE_SECONDS = 10;

function nextSeat(players: PokerPlayerState[], fromSeat: number, predicate: (player: PokerPlayerState) => boolean): number {
  const sorted = [...players].sort((a, b) => a.seatNo - b.seatNo);
  const startIndex = sorted.findIndex((player) => player.seatNo === fromSeat);
  for (let offset = 1; offset <= sorted.length; offset += 1) {
    const candidate = sorted[(Math.max(startIndex, 0) + offset) % sorted.length];
    if (candidate && predicate(candidate)) return candidate.seatNo;
  }
  throw new Error("No eligible next seat");
}

function playerAt(players: PokerPlayerState[], seat: number): PokerPlayerState {
  const player = players.find((entry) => entry.seatNo === seat);
  if (!player) throw new Error(`No player at seat ${seat}`);
  return player;
}

function commit(player: PokerPlayerState, requested: number): number {
  const paid = Math.max(0, Math.min(requested, player.stack));
  player.stack -= paid;
  player.streetBet += paid;
  player.totalCommitted += paid;
  if (player.stack === 0) player.status = "ALL_IN";
  return paid;
}

function clockwiseIdsFromDealer(state: PokerState): string[] {
  return [...state.players].sort((a, b) => {
    const aDistance = (a.seatNo - state.dealerSeat + state.players.length) % state.players.length;
    const bDistance = (b.seatNo - state.dealerSeat + state.players.length) % state.players.length;
    return aDistance - bDistance;
  }).map((player) => player.id);
}

export function startHand(inputPlayers: PokerPlayerState[], rules: PokerRules, handNo = 1, previousDealerSeat = 0, deck = shuffleDeck()): PokerState {
  const players = inputPlayers.filter((player) => player.status !== "SITTING_OUT").map((player) => ({
    ...player, status: "ACTIVE" as const, streetBet: 0, totalCommitted: 0, acted: false, lastAction: undefined, holeCards: undefined
  }));
  if (players.length < 2) throw new Error("At least two active players are required");
  const active = (player: PokerPlayerState) => player.status === "ACTIVE";
  const dealerSeat = previousDealerSeat === 0 ? players[0].seatNo : nextSeat(players, previousDealerSeat, active);
  const headsUp = players.length === 2;
  const smallBlindSeat = headsUp ? dealerSeat : nextSeat(players, dealerSeat, active);
  const bigBlindSeat = nextSeat(players, smallBlindSeat, active);
  const state: PokerState = {
    handId: randomUUID(), handNo, street: "PREFLOP", dealerSeat, smallBlindSeat, bigBlindSeat,
    players, board: [], deck: [...deck], currentBet: rules.bigBlind, minRaise: rules.bigBlind,
    pots: [], actions: [], processedActionIds: [], raiseLockedPlayerIds: [], startedAt: Date.now()
  };
  commit(playerAt(players, smallBlindSeat), rules.smallBlind);
  commit(playerAt(players, bigBlindSeat), rules.bigBlind);
  for (let round = 0; round < 2; round += 1) {
    let seat = dealerSeat;
    for (let dealt = 0; dealt < players.length; dealt += 1) {
      seat = nextSeat(players, seat, () => true);
      const player = playerAt(players, seat);
      const card = state.deck.shift();
      if (!card) throw new Error("Deck exhausted");
      player.holeCards = player.holeCards ? [player.holeCards[0], card] : [card, card];
    }
  }
  state.currentPlayerId = playerAt(players, headsUp ? dealerSeat : nextSeat(players, bigBlindSeat, active)).id;
  state.actionDeadline = Date.now() + rules.actionSeconds * 1000;
  if (shouldOfferRunoutVote(state)) beginRunoutVote(state);
  return state;
}

export function legalActions(state: PokerState, playerId: string, rules: PokerRules): LegalActions {
  const player = state.players.find((entry) => entry.id === playerId);
  if (!player || player.id !== state.currentPlayerId || player.status !== "ACTIVE") {
    return { canFold: false, canCheck: false, canCall: false, canBet: false, canRaise: false };
  }
  const callAmount = Math.min(state.currentBet - player.streetBet, player.stack);
  const maxRaiseTo = player.streetBet + player.stack;
  const minRaiseTo = state.currentBet + state.minRaise;
  return {
    canFold: true,
    canCheck: callAmount === 0,
    canCall: callAmount > 0,
    callAmount: callAmount > 0 ? callAmount : undefined,
    canBet: state.currentBet === 0 && player.stack > 0,
    minBet: state.currentBet === 0 ? Math.min(rules.bigBlind, player.stack) : undefined,
    maxBet: state.currentBet === 0 ? maxRaiseTo : undefined,
    canRaise: state.currentBet > 0 && maxRaiseTo > state.currentBet && !state.raiseLockedPlayerIds.includes(player.id),
    minRaiseTo: state.currentBet > 0 ? Math.min(minRaiseTo, maxRaiseTo) : undefined,
    maxRaiseTo: state.currentBet > 0 ? maxRaiseTo : undefined
  };
}

export function timeoutActionFor(actions: LegalActions): "CHECK" | "FOLD" {
  return actions.canCheck ? "CHECK" : "FOLD";
}

function isBettingComplete(state: PokerState): boolean {
  const actionable = state.players.filter((player) => player.status === "ACTIVE");
  return actionable.length === 0 || actionable.every((player) => player.acted && player.streetBet === state.currentBet);
}

function shouldOfferRunoutVote(state: PokerState): boolean {
  const contenders = eligiblePlayers(state.players);
  if (contenders.length < 2 || state.board.length >= 5) return false;
  const actionable = state.players.filter((player) => player.status === "ACTIVE");
  return actionable.length === 0 || (actionable.length === 1 && actionable[0].streetBet === state.currentBet);
}

function beginRunoutVote(state: PokerState): void {
  state.street = "RUNOUT_VOTE";
  state.currentPlayerId = undefined;
  state.actionDeadline = Date.now() + RUNOUT_VOTE_SECONDS * 1000;
  state.runoutVote = { eligiblePlayerIds: eligiblePlayers(state.players).map((player) => player.id), votes: {} };
}

function completeRunoutVote(state: PokerState, count: 1 | 2): void {
  state.runoutCount = count;
  state.street = "SHOWDOWN";
  state.currentPlayerId = undefined;
  state.actionDeadline = undefined;
}

export function voteRunout(stateInput: PokerState, playerId: string, count: 1 | 2): PokerState {
  const state = structuredClone(stateInput);
  if (state.street !== "RUNOUT_VOTE" || !state.runoutVote) throw new Error("RUNOUT_VOTE_NOT_AVAILABLE");
  if (!state.runoutVote.eligiblePlayerIds.includes(playerId)) throw new Error("RUNOUT_VOTE_NOT_ELIGIBLE");
  state.runoutVote.votes[playerId] = count;
  if (count === 1) completeRunoutVote(state, 1);
  else if (state.runoutVote.eligiblePlayerIds.every((id) => state.runoutVote?.votes[id] === 2)) completeRunoutVote(state, 2);
  return state;
}

export function expireRunoutVote(stateInput: PokerState): PokerState {
  const state = structuredClone(stateInput);
  if (state.street !== "RUNOUT_VOTE" || !state.runoutVote) throw new Error("RUNOUT_VOTE_NOT_AVAILABLE");
  completeRunoutVote(state, 1);
  return state;
}

function nextActionPlayer(state: PokerState, fromSeat: number): PokerPlayerState | undefined {
  const active = state.players.filter((player) => player.status === "ACTIVE");
  if (active.length === 0) return undefined;
  const seat = nextSeat(state.players, fromSeat, (player) => player.status === "ACTIVE");
  return playerAt(state.players, seat);
}

function dealStreet(state: PokerState): void {
  if (state.street === "RIVER") {
    state.street = "SHOWDOWN";
    return;
  }
  state.deck.shift();
  const count = state.street === "PREFLOP" ? 3 : 1;
  for (let i = 0; i < count; i += 1) {
    const card = state.deck.shift();
    if (!card) throw new Error("Deck exhausted");
    state.board.push(card);
  }
  state.street = state.street === "PREFLOP" ? "FLOP" : state.street === "FLOP" ? "TURN" : "RIVER";
}

function beginNextStreet(state: PokerState, rules: PokerRules): void {
  dealStreet(state);
  state.players.forEach((player) => { player.streetBet = 0; player.acted = false; });
  state.currentBet = 0;
  state.minRaise = rules.bigBlind;
  state.raiseLockedPlayerIds = [];
  if (state.street === "SHOWDOWN") { state.currentPlayerId = undefined; return; }
  const next = nextActionPlayer(state, state.dealerSeat);
  state.currentPlayerId = next?.id;
  state.actionDeadline = next ? Date.now() + rules.actionSeconds * 1000 : undefined;
  if (!next) {
    while (state.board.length < 5) dealStreet(state);
    state.street = "SHOWDOWN";
  }
}

export function applyAction(stateInput: PokerState, request: PlayerActionRequest, rules: PokerRules): PokerState {
  if (stateInput.processedActionIds.includes(request.actionId)) return structuredClone(stateInput);
  if (request.handId !== stateInput.handId) throw new Error("HAND_MISMATCH");
  const state = structuredClone(stateInput);
  const player = state.players.find((entry) => entry.id === state.currentPlayerId);
  if (!player || player.id !== state.currentPlayerId) throw new Error("NOT_YOUR_TURN");
  const actions = legalActions(state, player.id, rules);
  const type = request.action.type;
  const oldBet = state.currentBet;
  let recordedAmount = request.action.amount;

  if (type === "FOLD" && actions.canFold) player.status = "FOLDED";
  else if (type === "CHECK" && actions.canCheck) { /* A legal check commits no chips. */ }
  else if (type === "CALL" && actions.canCall) recordedAmount = commit(player, actions.callAmount ?? 0);
  else if ((type === "BET" || type === "RAISE") && (actions.canBet || actions.canRaise)) {
    const target = request.action.amount;
    if (!target) throw new Error("AMOUNT_REQUIRED");
    const minimum = actions.canBet ? actions.minBet! : actions.minRaiseTo!;
    const maximum = actions.canBet ? actions.maxBet! : actions.maxRaiseTo!;
    if (target < minimum || target > maximum) throw new Error("ILLEGAL_AMOUNT");
    commit(player, target - player.streetBet);
    const raiseSize = player.streetBet - oldBet;
    state.currentBet = Math.max(state.currentBet, player.streetBet);
    if (raiseSize >= state.minRaise) {
      state.minRaise = raiseSize;
      state.raiseLockedPlayerIds = [];
      state.players.forEach((other) => { if (other.id !== player.id && other.status === "ACTIVE") other.acted = false; });
    } else {
      state.raiseLockedPlayerIds = state.players.filter((other) => other.id !== player.id && other.acted).map((other) => other.id);
    }
  } else if (type === "ALL_IN" && player.stack > 0) {
    const target = player.streetBet + player.stack;
    if (state.raiseLockedPlayerIds.includes(player.id) && target > state.currentBet) throw new Error("BETTING_NOT_REOPENED");
    commit(player, player.stack);
    recordedAmount = target;
    const raiseSize = target - oldBet;
    if (target > state.currentBet) {
      state.currentBet = target;
      if (raiseSize >= state.minRaise) {
        state.minRaise = raiseSize;
        state.raiseLockedPlayerIds = [];
        state.players.forEach((other) => { if (other.id !== player.id && other.status === "ACTIVE") other.acted = false; });
      } else {
        state.raiseLockedPlayerIds = state.players.filter((other) => other.id !== player.id && other.acted).map((other) => other.id);
      }
    }
  } else throw new Error("ILLEGAL_ACTION");

  player.acted = true;
  player.lastAction = type;
  state.actions.push({ actionId: request.actionId, playerId: player.id, type, amount: recordedAmount, at: Date.now(), stateVersion: request.stateVersion });
  state.processedActionIds.push(request.actionId);

  if (eligiblePlayers(state.players).length === 1) {
    state.street = "FINISHED";
    state.currentPlayerId = undefined;
    return settleByFold(state);
  }
  if (isBettingComplete(state)) {
    if (shouldOfferRunoutVote(state)) beginRunoutVote(state);
    else beginNextStreet(state, rules);
  }
  else {
    const next = nextActionPlayer(state, player.seatNo);
    state.currentPlayerId = next?.id;
    state.actionDeadline = next ? Date.now() + rules.actionSeconds * 1000 : undefined;
  }
  return state;
}

function awardPots(state: PokerState, winnerForPot: (pot: Pot) => string[]): PokerState {
  const { pots, refunds } = buildPots(state.players);
  const seatOrder = clockwiseIdsFromDealer(state);
  for (const pot of pots) {
    pot.winnerIds = winnerForPot(pot);
    pot.splitAmounts = splitPot(pot.amount, pot.winnerIds, seatOrder);
    Object.entries(pot.splitAmounts).forEach(([id, amount]) => {
      const winner = state.players.find((player) => player.id === id);
      if (winner) winner.stack += amount;
    });
  }
  Object.entries(refunds).forEach(([id, amount]) => {
    const player = state.players.find((entry) => entry.id === id);
    if (player) player.stack += amount;
  });
  state.pots = pots;
  return state;
}

function dealRemainingBoard(prefix: Card[], deck: Card[]): Card[] {
  const board = [...prefix];
  if (board.length === 0) {
    deck.shift();
    for (let index = 0; index < 3; index += 1) {
      const card = deck.shift();
      if (!card) throw new Error("Deck exhausted");
      board.push(card);
    }
  }
  while (board.length < 5) {
    deck.shift();
    const card = deck.shift();
    if (!card) throw new Error("Deck exhausted");
    board.push(card);
  }
  return board;
}

function winnersForBoard(pot: Pot, ranks: Map<string, ReturnType<typeof evaluateBest>>): string[] {
  const eligible = pot.eligiblePlayerIds.filter((id) => ranks.has(id));
  return eligible.filter((id) => eligible.every((other) => compareRanks(ranks.get(id)!, ranks.get(other)!) >= 0));
}

export function settleByFold(stateInput: PokerState): PokerState {
  const state = structuredClone(stateInput);
  const winner = eligiblePlayers(state.players)[0];
  if (!winner) throw new Error("No winner remains");
  return awardPots(state, () => [winner.id]);
}

export function settleShowdown(stateInput: PokerState, revealedPlayerIds?: string[]): { state: PokerState; result: HandResult } {
  const state = structuredClone(stateInput);
  const runoutCount = state.runoutCount ?? 1;
  const boards = Array.from({ length: runoutCount }, () => dealRemainingBoard(state.board, state.deck));
  state.board = boards[0];
  state.runoutBoards = runoutCount === 2 ? boards : undefined;
  state.street = "FINISHED";
  const contenders = state.players.filter((player) => player.status !== "FOLDED");
  const ranksByBoard = boards.map((board) => new Map(contenders.map((player) => {
    if (!player.holeCards) throw new Error("Missing hole cards");
    return [player.id, evaluateBest([...player.holeCards, ...board])] as const;
  })));
  const { pots, refunds } = buildPots(state.players);
  const seatOrder = clockwiseIdsFromDealer(state);
  const runoutResults: RunoutResult[] = boards.map((board) => ({ board, potWinnerIds: {} }));
  for (const pot of pots) {
    const boardAmounts = runoutCount === 2 ? [Math.ceil(pot.amount / 2), Math.floor(pot.amount / 2)] : [pot.amount];
    const aggregate: Record<string, number> = {};
    const allWinners = new Set<string>();
    ranksByBoard.forEach((ranks, boardIndex) => {
      const winners = winnersForBoard(pot, ranks);
      runoutResults[boardIndex].potWinnerIds[pot.id] = winners;
      winners.forEach((id) => allWinners.add(id));
      Object.entries(splitPot(boardAmounts[boardIndex], winners, seatOrder)).forEach(([id, amount]) => {
        aggregate[id] = (aggregate[id] ?? 0) + amount;
      });
    });
    pot.winnerIds = [...allWinners];
    pot.splitAmounts = aggregate;
    Object.entries(aggregate).forEach(([id, amount]) => {
      const winner = state.players.find((player) => player.id === id);
      if (winner) winner.stack += amount;
    });
  }
  Object.entries(refunds).forEach(([id, amount]) => {
    const player = state.players.find((entry) => entry.id === id);
    if (player) player.stack += amount;
  });
  state.pots = pots;
  state.runoutResults = runoutCount === 2 ? runoutResults : undefined;
  const main = state.pots.find((pot) => pot.type === "MAIN");
  const revealedPlayers = revealedPlayerIds ?? contenders.map((player) => player.id);
  state.revealedHoleCards = Object.fromEntries(state.players
    .filter((player) => revealedPlayers.includes(player.id) && player.holeCards)
    .map((player) => [player.id, player.holeCards!])) as Record<string, [Card, Card]>;
  const result: HandResult = {
    handId: state.handId,
    pots: state.pots,
    mainPotWinners: main?.winnerIds ?? [],
    sidePotWinners: state.pots.filter((pot) => pot.type === "SIDE").flatMap((pot) => pot.winnerIds),
    showdownPlayers: contenders.map((player) => player.id),
    revealedPlayers,
    wasMainPotSplit: (main?.winnerIds.length ?? 0) > 1,
    runoutBoards: state.runoutBoards
  };
  return { state, result };
}

export function publicPokerState(state: PokerState): Omit<PokerState, "deck" | "players"> & { players: Array<Omit<PokerPlayerState, "holeCards">> } {
  const { deck, players, ...rest } = state;
  void deck;
  return { ...rest, players: players.map(({ holeCards, ...player }) => { void holeCards; return player; }) };
}
