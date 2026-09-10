import { describe, expect, it } from "vitest";
import { DEFAULT_POKER_RULES } from "@/config/presets";
import { applyAction, legalActions, settleShowdown, startHand } from "@/engines/poker/engine";
import type { PlayerActionRequest, PokerPlayerState } from "@/types/game";

function bots(): PokerPlayerState[] {
  return Array.from({ length: 7 }, (_, index) => ({ id: `bot-${index}`, nickname: `Bot ${index}`, avatarId: `${index}`, seatNo: index + 1, stack: 10_000, status: "ACTIVE", streetBet: 0, totalCommitted: 0, acted: false }));
}

describe("seven-player night simulation", () => {
  it("runs 500 randomized hands with chip conservation and idempotent retries", () => {
    for (let handNo = 1; handNo <= 500; handNo += 1) {
      let state = startHand(bots(), DEFAULT_POKER_RULES, handNo);
      let safety = 0;
      while (state.street !== "FINISHED" && state.street !== "SHOWDOWN" && safety++ < 200) {
        const current = state.currentPlayerId;
        if (!current) break;
        const legal = legalActions(state, current, DEFAULT_POKER_RULES);
        let action: PlayerActionRequest["action"];
        const roll = (handNo * 31 + safety * 17) % 100;
        if (roll < 14 && legal.canFold) action = { type: "FOLD" };
        else if (legal.canCheck) action = { type: "CHECK" };
        else if (legal.canCall) action = { type: "CALL" };
        else if (legal.canBet) action = { type: "BET", amount: legal.minBet };
        else action = { type: "ALL_IN" };
        const request = { roomCode: "SIM", playerToken: "token", actionId: crypto.randomUUID(), handId: state.handId, stateVersion: safety, action };
        state = applyAction(state, request, DEFAULT_POKER_RULES);
        if (safety % 37 === 0) state = applyAction(state, request, DEFAULT_POKER_RULES);
      }
      if (state.street === "SHOWDOWN") state = settleShowdown(state).state;
      expect(safety).toBeLessThan(200);
      expect(state.players.reduce((sum, player) => sum + player.stack, 0)).toBe(70_000);
      const visibleCards = [...state.board, ...state.players.flatMap((player) => player.holeCards ?? [])];
      expect(new Set(visibleCards).size).toBe(visibleCards.length);
    }
  });
});
