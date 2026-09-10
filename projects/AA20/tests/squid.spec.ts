import { describe, expect, it } from "vitest";
import { CLASSIC_SQUID, PROGRESSIVE_SQUID } from "@/config/presets";
import { calculateSquidSettlement, createSquidRound, nextSquidRound, processHandResult, showDecisionWinner } from "@/engines/squid/engine";
import type { HandResult, Pot } from "@/types/game";

const mainPot = (winners: string[]): Pot => ({ id: "main", type: "MAIN", amount: 1000, eligiblePlayerIds: ["A", "B", "C"], winnerIds: winners, splitAmounts: {} });
const hand = (id: string, winners: string[], revealed = winners): HandResult => ({
  handId: id, pots: [mainPot(winners)], mainPotWinners: winners, sidePotWinners: [],
  showdownPlayers: ["A", "B", "C"], revealedPlayers: revealed, wasMainPotSplit: winners.length > 1
});

describe("Squid engine", () => {
  it("asks only the sole main-pot winner to decide whether to show", () => {
    expect(showDecisionWinner(hand("h1", ["A"], []), CLASSIC_SQUID)).toBe("A");
    expect(showDecisionWinner(hand("h-showdown", ["A"], ["A", "B"]), CLASSIC_SQUID)).toBeUndefined();
    expect(showDecisionWinner(hand("h2", ["A", "B"], []), CLASSIC_SQUID)).toBeUndefined();
    expect(showDecisionWinner(hand("h3", ["A"], []), { ...CLASSIC_SQUID, enabled: false })).toBeUndefined();
  });

  it("awards only a sole main-pot winner who shows", () => {
    let state = createSquidRound(["A", "B", "C"], CLASSIC_SQUID);
    state = processHandResult(state, hand("h1", ["A"]), CLASSIC_SQUID).state;
    expect(state.players.A.squidCount).toBe(1);
    const noShow = processHandResult(state, hand("h2", ["B"], []), CLASSIC_SQUID);
    expect(noShow.awardAmount).toBe(0);
  });

  it("never awards a side-pot-only winner", () => {
    const state = createSquidRound(["A", "B", "C"], CLASSIC_SQUID);
    const result = processHandResult(state, { ...hand("h1", ["A"]), sidePotWinners: ["B"] }, CLASSIC_SQUID);
    expect(result.state.players.B.squidCount).toBe(0);
  });

  it("does not award a chopped main pot and carries over in progressive rules", () => {
    const rules = { ...PROGRESSIVE_SQUID, firstPotReward: 1 };
    let state = createSquidRound(["A", "B", "C"], rules);
    state = processHandResult(state, hand("h1", ["A", "B"]), rules).state;
    expect(state.currentHandReward).toBe(2);
    const next = processHandResult(state, hand("h2", ["C"]), rules);
    expect(next.awardAmount).toBe(2);
  });

  it("is idempotent for repeated hand results", () => {
    const initial = createSquidRound(["A", "B", "C"], CLASSIC_SQUID);
    const once = processHandResult(initial, hand("h1", ["A"]), CLASSIC_SQUID).state;
    const twice = processHandResult(once, hand("h1", ["A"]), CLASSIC_SQUID);
    expect(twice.duplicate).toBe(true);
    expect(twice.state.players.A.squidCount).toBe(1);
  });

  it("settles every unsafe player against every safe player without pooling", () => {
    const state = createSquidRound(["A", "B", "C", "D", "E", "F", "G"], CLASSIC_SQUID);
    for (const id of ["A", "B", "C", "D", "E"]) { state.players[id].squidCount = 1; state.players[id].safe = true; }
    const ledger = calculateSquidSettlement(state, CLASSIC_SQUID);
    expect(ledger).toHaveLength(10);
    expect(ledger.filter((entry) => entry.fromPlayerId === "F").reduce((sum, entry) => sum + entry.amount, 0)).toBe(2500);
    expect(ledger.filter((entry) => entry.toPlayerId === "A").reduce((sum, entry) => sum + entry.amount, 0)).toBe(1000);
  });

  it("applies progressive per-squid multipliers and remains zero-sum", () => {
    const state = createSquidRound(["A", "B"], PROGRESSIVE_SQUID);
    state.players.A.squidCount = 3;
    state.players.A.safe = true;
    const ledger = calculateSquidSettlement(state, PROGRESSIVE_SQUID);
    expect(ledger[0].amount).toBe(3000);
    const profits = { A: 0, B: 0 };
    ledger.forEach((entry) => { profits.A += entry.toPlayerId === "A" ? entry.amount : -entry.amount; profits.B += entry.toPlayerId === "B" ? entry.amount : -entry.amount; });
    expect(profits.A + profits.B).toBe(0);
  });

  it("preserves lifetime squid totals when a new round resets current counts", () => {
    let state = createSquidRound(["A", "B"], CLASSIC_SQUID);
    state = processHandResult(state, hand("h1", ["A"]), CLASSIC_SQUID).state;
    expect(state.status).toBe("SETTLING");
    const next = nextSquidRound(state, CLASSIC_SQUID);
    expect(next.players.A.squidCount).toBe(0);
    expect(next.players.A.totalSquidWon).toBe(1);
  });
});
