import { describe, expect, it } from "vitest";
import { compareRanks, evaluateBest } from "@/engines/poker/evaluator";

describe("Texas Hold'em evaluator", () => {
  it("recognizes a wheel straight", () => {
    const rank = evaluateBest(["AS", "2D", "3C", "4H", "5S", "KD", "QC"]);
    expect(rank.name).toBe("Straight");
    expect(rank.kickers).toEqual([5]);
  });

  it("chooses the best five of seven and compares kickers", () => {
    const aces = evaluateBest(["AS", "AH", "KC", "QD", "JS", "2D", "3C"]);
    const kings = evaluateBest(["KS", "KH", "AC", "QD", "JS", "2D", "3C"]);
    expect(aces.name).toBe("Pair");
    expect(compareRanks(aces, kings)).toBeGreaterThan(0);
  });

  it("ranks a straight flush over quads", () => {
    const straightFlush = evaluateBest(["9S", "TS", "JS", "QS", "KS", "2D", "2C"]);
    const quads = evaluateBest(["AS", "AH", "AD", "AC", "KS", "2D", "3C"]);
    expect(compareRanks(straightFlush, quads)).toBeGreaterThan(0);
  });

  it("always ranks a flush above two pair", () => {
    const flush = evaluateBest(["AS", "JS", "8S", "5S", "2S", "KD", "QC"]);
    const twoPair = evaluateBest(["AH", "AD", "KH", "KD", "7C", "4S", "2D"]);
    expect(flush.name).toBe("Flush");
    expect(twoPair.name).toBe("Two Pair");
    expect(compareRanks(flush, twoPair)).toBeGreaterThan(0);
  });
});
