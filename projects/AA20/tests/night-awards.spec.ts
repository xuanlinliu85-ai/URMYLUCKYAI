import { describe, expect, it } from "vitest";
import { nightAwards } from "@/lib/night-awards";
import type { PlayerNightSummary } from "@/types/game";

function summary(playerId: string, pokerProfit: number, squidProfit: number): PlayerNightSummary {
  return { playerId, nickname: playerId, pokerProfit, squidProfit, totalProfit: pokerProfit + squidProfit, handsPlayed: 10, handsWon: 1, squidRounds: 1, squidEarned: 0 };
}

describe("night awards", () => {
  it("uses the whole-night total rather than squid-only loss for biggest loser", () => {
    const awards = nightAwards([
      summary("poker-loser", -5000, 1000),
      summary("squid-loser", 2500, -3000),
      summary("winner", 2500, 2000)
    ]);
    expect(awards.squidKing?.playerId).toBe("winner");
    expect(awards.biggestLoser?.playerId).toBe("poker-loser");
    expect(awards.biggestLoser?.totalProfit).toBe(-4000);
  });
});
