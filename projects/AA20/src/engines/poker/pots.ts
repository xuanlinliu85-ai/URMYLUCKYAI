import type { PokerPlayerState, Pot } from "@/types/game";

export interface PotConstruction {
  pots: Pot[];
  refunds: Record<string, number>;
}

export function buildPots(players: PokerPlayerState[]): PotConstruction {
  const levels = [...new Set(players.map((player) => player.totalCommitted).filter((amount) => amount > 0))].sort((a, b) => a - b);
  const pots: Pot[] = [];
  const refunds: Record<string, number> = {};
  let previous = 0;

  for (const level of levels) {
    const contributors = players.filter((player) => player.totalCommitted >= level);
    const tranche = level - previous;
    const amount = tranche * contributors.length;
    if (contributors.length === 1) {
      refunds[contributors[0].id] = (refunds[contributors[0].id] ?? 0) + amount;
    } else if (amount > 0) {
      const eligible = contributors.filter((player) => player.status !== "FOLDED");
      pots.push({
        id: `pot-${pots.length}`,
        type: pots.length === 0 ? "MAIN" : "SIDE",
        amount,
        eligiblePlayerIds: eligible.map((player) => player.id),
        winnerIds: [],
        splitAmounts: {}
      });
    }
    previous = level;
  }
  return { pots, refunds };
}

export function splitPot(amount: number, winnerIds: string[], seatOrder: string[]): Record<string, number> {
  if (winnerIds.length === 0) throw new Error("A pot must have at least one winner");
  const shares: Record<string, number> = {};
  const base = Math.floor(amount / winnerIds.length);
  winnerIds.forEach((id) => { shares[id] = base; });
  let odd = amount - base * winnerIds.length;
  for (const id of seatOrder) {
    if (odd === 0) break;
    if (winnerIds.includes(id)) {
      shares[id] += 1;
      odd -= 1;
    }
  }
  return shares;
}
