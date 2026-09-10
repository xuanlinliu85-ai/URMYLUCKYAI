import type { Card } from "@/types/game";

const RANK_VALUE: Record<string, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8,
  "9": 9, T: 10, J: 11, Q: 12, K: 13, A: 14
};

export interface HandRank {
  category: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  name: "High Card" | "Pair" | "Two Pair" | "Three of a Kind" | "Straight" | "Flush" | "Full House" | "Four of a Kind" | "Straight Flush";
  kickers: number[];
  cards: Card[];
}

function straightHigh(values: number[]): number | undefined {
  const unique = [...new Set(values)].sort((a, b) => b - a);
  if (unique.includes(14)) unique.push(1);
  for (let i = 0; i <= unique.length - 5; i += 1) {
    if (unique[i] - unique[i + 4] === 4) return unique[i];
  }
  return undefined;
}

export function evaluateFive(cards: Card[]): HandRank {
  if (cards.length !== 5) throw new Error("evaluateFive requires exactly five cards");
  const values = cards.map((card) => RANK_VALUE[card[0]]).sort((a, b) => b - a);
  const flush = cards.every((card) => card[1] === cards[0][1]);
  const straight = straightHigh(values);
  const counts = new Map<number, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  if (flush && straight) return { category: 8, name: "Straight Flush", kickers: [straight], cards };
  if (groups[0][1] === 4) return { category: 7, name: "Four of a Kind", kickers: [groups[0][0], groups[1][0]], cards };
  if (groups[0][1] === 3 && groups[1][1] === 2) return { category: 6, name: "Full House", kickers: [groups[0][0], groups[1][0]], cards };
  if (flush) return { category: 5, name: "Flush", kickers: values, cards };
  if (straight) return { category: 4, name: "Straight", kickers: [straight], cards };
  if (groups[0][1] === 3) {
    return { category: 3, name: "Three of a Kind", kickers: [groups[0][0], ...groups.slice(1).map(([v]) => v)], cards };
  }
  if (groups[0][1] === 2 && groups[1][1] === 2) {
    const pairs = [groups[0][0], groups[1][0]].sort((a, b) => b - a);
    return { category: 2, name: "Two Pair", kickers: [...pairs, groups[2][0]], cards };
  }
  if (groups[0][1] === 2) {
    return { category: 1, name: "Pair", kickers: [groups[0][0], ...groups.slice(1).map(([v]) => v)], cards };
  }
  return { category: 0, name: "High Card", kickers: values, cards };
}

export function compareRanks(a: HandRank, b: HandRank): number {
  if (a.category !== b.category) return a.category - b.category;
  const length = Math.max(a.kickers.length, b.kickers.length);
  for (let i = 0; i < length; i += 1) {
    if ((a.kickers[i] ?? 0) !== (b.kickers[i] ?? 0)) return (a.kickers[i] ?? 0) - (b.kickers[i] ?? 0);
  }
  return 0;
}

function combinations<T>(items: T[], count: number): T[][] {
  if (count === 0) return [[]];
  if (items.length < count) return [];
  return items.flatMap((item, index) => combinations(items.slice(index + 1), count - 1).map((tail) => [item, ...tail]));
}

export function evaluateBest(cards: Card[]): HandRank {
  if (cards.length < 5 || cards.length > 7) throw new Error("evaluateBest requires five to seven cards");
  return combinations(cards, 5).map(evaluateFive).reduce((best, rank) => compareRanks(rank, best) > 0 ? rank : best);
}
