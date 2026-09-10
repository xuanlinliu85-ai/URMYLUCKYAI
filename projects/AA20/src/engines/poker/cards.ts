import { randomInt } from "node:crypto";
import type { Card, Rank, Suit } from "@/types/game";

const RANKS: Rank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
const SUITS: Suit[] = ["S", "H", "D", "C"];

export function createDeck(): Card[] {
  return SUITS.flatMap((suit) => RANKS.map((rank) => `${rank}${suit}` as Card));
}

export function shuffleDeck(deck: Card[] = createDeck()): Card[] {
  const shuffled = [...deck];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapWith = randomInt(index + 1);
    [shuffled[index], shuffled[swapWith]] = [shuffled[swapWith], shuffled[index]];
  }
  return shuffled;
}

export function assertUniqueCards(cards: Card[]): void {
  if (new Set(cards).size !== cards.length) throw new Error("Duplicate cards detected");
}
