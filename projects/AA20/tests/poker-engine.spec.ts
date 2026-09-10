import { describe, expect, it } from "vitest";
import { DEFAULT_POKER_RULES } from "@/config/presets";
import { applyAction, expireRunoutVote, legalActions, settleShowdown, startHand, timeoutActionFor, voteRunout } from "@/engines/poker/engine";
import { createDeck } from "@/engines/poker/cards";
import type { ActionType, PlayerActionRequest, PokerPlayerState, PokerState } from "@/types/game";

function players(count: number, stacks?: number[]): PokerPlayerState[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`, nickname: `P${index + 1}`, avatarId: `a${index + 1}`, seatNo: index + 1,
    stack: stacks?.[index] ?? 10_000, status: "ACTIVE", streetBet: 0, totalCommitted: 0, acted: false
  }));
}

function act(state: PokerState, type: ActionType, amount?: number, id = crypto.randomUUID()): PokerState {
  const request: PlayerActionRequest = { roomCode: "TEST", playerToken: "token", actionId: id, handId: state.handId, stateVersion: 1, action: { type, amount } };
  return applyAction(state, request, DEFAULT_POKER_RULES);
}

describe("Poker engine", () => {
  it("uses the dealer as small blind and first preflop actor heads-up", () => {
    const state = startHand(players(2), DEFAULT_POKER_RULES, 1, 0, createDeck());
    expect(state.smallBlindSeat).toBe(state.dealerSeat);
    expect(state.currentPlayerId).toBe(state.players.find((player) => player.seatNo === state.dealerSeat)?.id);
  });

  it("does not process a duplicate action twice", () => {
    let state = startHand(players(3), DEFAULT_POKER_RULES, 1, 0, createDeck());
    const actionId = crypto.randomUUID();
    state = act(state, "CALL", undefined, actionId);
    const committed = state.players.reduce((sum, player) => sum + player.totalCommitted, 0);
    state = applyAction(state, { roomCode: "TEST", playerToken: "token", actionId, handId: state.handId, stateVersion: 1, action: { type: "CALL" } }, DEFAULT_POKER_RULES);
    expect(state.players.reduce((sum, player) => sum + player.totalCommitted, 0)).toBe(committed);
  });

  it("records exact chip amounts for call and all-in announcements", () => {
    let called = startHand(players(3), DEFAULT_POKER_RULES, 1, 0, createDeck());
    const callAmount = legalActions(called, called.currentPlayerId!, DEFAULT_POKER_RULES).callAmount;
    called = act(called, "CALL");
    expect(called.actions.at(-1)?.amount).toBe(callAmount);

    let allIn = startHand(players(2, [1000, 1000]), DEFAULT_POKER_RULES, 1, 0, createDeck());
    const actor = allIn.players.find((player) => player.id === allIn.currentPlayerId)!;
    const allInTo = actor.streetBet + actor.stack;
    allIn = act(allIn, "ALL_IN");
    expect(allIn.actions.at(-1)?.amount).toBe(allInTo);
  });

  it("completes a betting round and deals the flop", () => {
    let state = startHand(players(3), DEFAULT_POKER_RULES, 1, 0, createDeck());
    state = act(state, "CALL");
    state = act(state, "CALL");
    state = act(state, "CHECK");
    expect(state.street).toBe("FLOP");
    expect(state.board).toHaveLength(3);
  });

  it("does not reopen raising after a short all-in", () => {
    let state = startHand(players(3, [10_000, 10_000, 250]), DEFAULT_POKER_RULES, 1, 0, createDeck());
    state = act(state, "RAISE", 200);
    state = act(state, "CALL");
    state = act(state, "ALL_IN");
    expect(state.currentBet).toBe(250);
    const nextId = state.currentPlayerId!;
    expect(legalActions(state, nextId, DEFAULT_POKER_RULES).canRaise).toBe(false);
  });

  it("checks on timeout when free, otherwise folds", () => {
    expect(timeoutActionFor({ canFold: true, canCheck: true, canCall: false, canBet: true, canRaise: false })).toBe("CHECK");
    expect(timeoutActionFor({ canFold: true, canCheck: false, canCall: true, canBet: false, canRaise: false })).toBe("FOLD");
  });

  it("stops betting and asks every remaining player after an all-in is fully called", () => {
    let state = startHand(players(2, [1000, 1000]), DEFAULT_POKER_RULES, 1, 0, createDeck());
    state = act(state, "ALL_IN");
    state = act(state, "CALL");
    expect(state.street).toBe("RUNOUT_VOTE");
    expect(state.currentPlayerId).toBeUndefined();
    expect(state.runoutVote?.eligiblePlayerIds).toHaveLength(2);
  });

  it("runs twice only with unanimous consent and once after any one-time vote", () => {
    let twice = startHand(players(2, [1000, 1000]), DEFAULT_POKER_RULES, 1, 0, createDeck());
    twice = act(twice, "ALL_IN");
    twice = act(twice, "CALL");
    const [first, second] = twice.runoutVote!.eligiblePlayerIds;
    twice = voteRunout(twice, first, 2);
    expect(twice.street).toBe("RUNOUT_VOTE");
    twice = voteRunout(twice, second, 2);
    expect(twice.street).toBe("SHOWDOWN");
    expect(twice.runoutCount).toBe(2);

    let once = startHand(players(2, [1000, 1000]), DEFAULT_POKER_RULES, 1, 0, createDeck());
    once = act(once, "ALL_IN");
    once = act(once, "CALL");
    once = voteRunout(once, once.runoutVote!.eligiblePlayerIds[0], 1);
    expect(once.street).toBe("SHOWDOWN");
    expect(once.runoutCount).toBe(1);
  });

  it("defaults an expired runout vote to one board", () => {
    let state = startHand(players(2, [1000, 1000]), DEFAULT_POKER_RULES, 1, 0, createDeck());
    state = act(state, "ALL_IN");
    state = act(state, "CALL");
    state = expireRunoutVote(state);
    expect(state.street).toBe("SHOWDOWN");
    expect(state.runoutCount).toBe(1);
  });

  it("splits every pot across two boards and conserves all chips", () => {
    let state = startHand(players(2, [1000, 1000]), DEFAULT_POKER_RULES, 1, 0, createDeck());
    state = act(state, "ALL_IN");
    state = act(state, "CALL");
    for (const id of state.runoutVote!.eligiblePlayerIds) state = voteRunout(state, id, 2);
    const settled = settleShowdown(state).state;
    expect(settled.runoutBoards).toHaveLength(2);
    expect(settled.runoutBoards?.every((board) => board.length === 5)).toBe(true);
    expect(settled.players.reduce((sum, player) => sum + player.stack, 0)).toBe(2000);
    expect(Object.values(settled.pots[0].splitAmounts).reduce((sum, amount) => sum + amount, 0)).toBe(settled.pots[0].amount);
  });

  it("settles showdown pots and conserves all chips", () => {
    const initialTotal = 30_000;
    const state = startHand(players(3), DEFAULT_POKER_RULES, 1, 0, createDeck());
    state.players[0].totalCommitted = 1000; state.players[0].stack = 9000;
    state.players[1].totalCommitted = 3000; state.players[1].stack = 7000;
    state.players[2].totalCommitted = 3000; state.players[2].stack = 7000;
    state.board = ["2S", "3H", "4D", "8C", "9S"];
    state.players[0].holeCards = ["AS", "AH"];
    state.players[1].holeCards = ["KS", "KH"];
    state.players[2].holeCards = ["QS", "QH"];
    const settled = settleShowdown(state).state;
    expect(settled.players.reduce((sum, player) => sum + player.stack, 0)).toBe(initialTotal);
    expect(settled.pots).toHaveLength(2);
    expect(Object.keys(settled.revealedHoleCards ?? {})).toEqual(expect.arrayContaining(["p1", "p2", "p3"]));
  });
});
