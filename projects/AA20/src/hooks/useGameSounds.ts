"use client";
import { useEffect, useRef } from "react";
import { playCheck, playChip, playDeal, playFold, playSettlement, playSquid, playWin, speakAction } from "@/lib/game-sound";
import type { SyncPayload } from "@/types/game";

export function useGameSounds(data: SyncPayload | undefined, enabled: boolean): void {
  const previous = useRef<{ handId?: string; actionId?: string; awardCount: number; settling: boolean; finished: boolean }>({ awardCount: 0, settling: false, finished: false });
  useEffect(() => {
    if (!data?.publicState.poker) return;
    const poker = data.publicState.poker;
    const squid = data.publicState.squid;
    if (enabled) {
      if (previous.current.handId && previous.current.handId !== poker.handId) playDeal();
      const action = poker.actions.at(-1);
      if (action && action.actionId !== previous.current.actionId) {
        if (action?.playerId !== data.privateState.playerId) {
          if (action.type === "FOLD") playFold(); else if (action.type === "CHECK") playCheck(); else playChip();
          const actionName = action.type === "FOLD" ? "弃牌" : action.type === "CHECK" ? "过牌" : action.type === "CALL" ? "跟注" : action.type === "BET" ? "下注" : action.type === "RAISE" ? "加注到" : "全下";
          speakAction(actionName, action.amount);
        }
      }
      if ((squid?.awards.length ?? 0) > previous.current.awardCount) playSquid();
      if (squid?.status === "SETTLING" && !previous.current.settling) playSettlement();
      if (poker.street === "FINISHED" && !previous.current.finished) playWin();
    }
    previous.current = { handId: poker.handId, actionId: poker.actions.at(-1)?.actionId, awardCount: squid?.awards.length ?? 0, settling: squid?.status === "SETTLING", finished: poker.street === "FINISHED" };
  }, [data, enabled]);
}
