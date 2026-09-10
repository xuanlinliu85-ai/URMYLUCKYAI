"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { playDealCard } from "@/lib/game-sound";
import type { Card } from "@/types/game";
import { PlayingCard } from "./PlayingCard";

gsap.registerPlugin(useGSAP);

export function AnimatedCommunityCards({ cards, soundEnabled }: { cards: Card[]; soundEnabled: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const previousCount = useRef(0);
  const soundEnabledRef = useRef(soundEnabled);
  const boardKey = cards.join("-");

  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);

  useGSAP(() => {
    const currentCount = cards.length;
    const firstNewIndex = currentCount < previousCount.current ? 0 : previousCount.current;
    const timeline = gsap.timeline({ defaults: { ease: "power2.out" } });

    for (let index = firstNewIndex; index < currentCount; index += 1) {
      const shell = container.current?.querySelector<HTMLElement>(`[data-board-index="${index}"] .playing-card`);
      const inner = shell?.querySelector<HTMLElement>(".playing-card-inner");
      if (!shell || !inner) continue;
      const position = (index - firstNewIndex) * 0.16;
      gsap.set(inner, { rotationY: 180 });
      timeline
        .fromTo(shell, { x: 74, y: -82, scale: 0.7, rotation: -9 + index * 2, opacity: 0.45 }, { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, duration: 0.3 }, position)
        .to(shell, { y: -3, duration: 0.075, yoyo: true, repeat: 1, ease: "power1.out" }, position + 0.2)
        .to(inner, { rotationY: 0, duration: 0.34, ease: "power2.inOut", onStart: () => { if (soundEnabledRef.current) playDealCard(); } }, position + 0.25);
    }
    previousCount.current = currentCount;
    return () => timeline.kill();
  }, { dependencies: [boardKey], scope: container, revertOnUpdate: true });

  return <div className="community" ref={container} aria-label="公共牌">
    {Array.from({ length: 5 }, (_, index) => <span className="board-card-slot" data-board-index={index} key={index}><PlayingCard card={cards[index]} /></span>)}
  </div>;
}
