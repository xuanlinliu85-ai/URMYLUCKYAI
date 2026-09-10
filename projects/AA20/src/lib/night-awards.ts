import type { PlayerNightSummary } from "@/types/game";

export function nightAwards(summaries: PlayerNightSummary[]) {
  const byTotalProfit = [...summaries].sort((a, b) => b.totalProfit - a.totalProfit);
  const bySquidProfit = [...summaries].sort((a, b) => b.squidProfit - a.squidProfit);
  return {
    ranked: byTotalProfit,
    champion: byTotalProfit[0],
    squidKing: bySquidProfit[0],
    biggestLoser: byTotalProfit.at(-1)
  };
}
