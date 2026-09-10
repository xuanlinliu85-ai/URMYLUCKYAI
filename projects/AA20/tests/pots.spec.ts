import { describe, expect, it } from "vitest";
import { buildPots, splitPot } from "@/engines/poker/pots";
import type { PokerPlayerState } from "@/types/game";

function player(id: string, committed: number, status: PokerPlayerState["status"] = "ALL_IN"): PokerPlayerState {
  return { id, nickname: id, avatarId: "a", seatNo: id.charCodeAt(0) - 64, stack: 0, status, streetBet: committed, totalCommitted: committed, acted: true };
}

describe("pot construction", () => {
  it("builds main pot and multiple side pots", () => {
    const result = buildPots([player("A", 1000), player("B", 3000), player("C", 5000), player("D", 5000)]);
    expect(result.pots.map((pot) => ({ amount: pot.amount, eligible: pot.eligiblePlayerIds }))).toEqual([
      { amount: 4000, eligible: ["A", "B", "C", "D"] },
      { amount: 6000, eligible: ["B", "C", "D"] },
      { amount: 4000, eligible: ["C", "D"] }
    ]);
  });

  it("keeps folded chips but excludes the folded player from winning", () => {
    const result = buildPots([player("A", 1000), player("B", 3000, "FOLDED"), player("C", 3000)]);
    expect(result.pots[0].amount).toBe(3000);
    expect(result.pots[0].eligiblePlayerIds).toEqual(["A", "C"]);
    expect(result.pots[1].eligiblePlayerIds).toEqual(["C"]);
  });

  it("refunds an unmatched overbet", () => {
    const result = buildPots([player("A", 1000), player("B", 3000)]);
    expect(result.pots[0].amount).toBe(2000);
    expect(result.refunds).toEqual({ B: 2000 });
  });

  it("awards odd chips clockwise", () => {
    expect(splitPot(101, ["A", "C"], ["B", "C", "A"])).toEqual({ A: 50, C: 51 });
  });
});
