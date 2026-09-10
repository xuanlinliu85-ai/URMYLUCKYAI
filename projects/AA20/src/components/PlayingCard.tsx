import type { Card } from "@/types/game";

const suits = { S: "♠", H: "♥", D: "♦", C: "♣" } as const;
export function PlayingCard({ card }: { card?: Card }) {
  if (!card) return <span className="playing-card empty" aria-hidden />;
  const red = card[1] === "H" || card[1] === "D";
  const suit = suits[card[1] as keyof typeof suits];
  return <span className={`playing-card suit-${card[1]} ${red ? "red" : "black"}`} aria-label={`${card[0]}${suit}`}>
    <span className="playing-card-inner">
      <span className="card-face card-front"><span className="card-corner"><b>{card[0]}</b><i>{suit}</i></span><span className="card-suit">{suit}</span></span>
      <span className="card-face card-back" aria-hidden><span className="card-back-mark">FT</span></span>
    </span>
  </span>;
}
