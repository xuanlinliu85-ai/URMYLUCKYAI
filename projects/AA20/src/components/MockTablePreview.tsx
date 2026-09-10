"use client";
import { useEffect, useState } from "react";
import { PokerTable } from "./PokerTable";
import { CLASSIC_SQUID, DEFAULT_POKER_RULES } from "@/config/presets";
import { playChip, playFold, unlockSound } from "@/lib/game-sound";
import type { ActionType, SyncPayload } from "@/types/game";

const ids = ["you", "p2", "p3", "p4", "p5", "p6", "p7"];
const names = ["Lucky", "小王", "Tony", "阿杰", "小陈", "Peter", "老刘"];
const avatars = ["🦊", "🐼", "🐯", "🐙", "🦁", "🐸", "🐵"];

const preview: SyncPayload = {
  stateVersion: 24,
  publicState: {
    roomId: "preview", roomCode: "888888", status: "playing", hostPlayerId: "you", stateVersion: 24,
    rules: { roomId: "preview", version: 1, createdAt: Date.now(), poker: DEFAULT_POKER_RULES, squid: CLASSIC_SQUID },
    members: ids.map((id, index) => ({ id, nickname: names[index], avatarId: avatars[index], seatNo: index + 1, stack: [10100,11200,6500,5800,13400,9200,8300][index], status: "ACTIVE", streetBet: index === 2 ? 600 : 0, totalCommitted: index === 2 ? 600 : 100, acted: index < 2, squidCount: index === 2 || index === 6 ? 0 : 1, totalSquidWon: index === 2 || index === 6 ? 0 : 2, connected: index !== 5, buyInTotal: 10000 })),
    poker: {
      handId: "preview-hand", handNo: 4, street: "TURN", dealerSeat: 4, smallBlindSeat: 5, bigBlindSeat: 6,
      board: ["AS", "KH", "7C", "4D"], currentPlayerId: "you", currentBet: 600, minRaise: 600,
      pots: [], actions: [], processedActionIds: [], raiseLockedPlayerIds: [], startedAt: Date.now(), actionDeadline: Date.now() + 18000,
      players: ids.map((id, index) => ({ id, nickname: names[index], avatarId: avatars[index], seatNo: index + 1, stack: [10100,11200,6500,5800,13400,9200,8300][index], status: "ACTIVE", streetBet: index === 2 ? 600 : 0, totalCommitted: index === 2 ? 600 : 100, acted: index < 2 }))
    },
    squid: {
      enabled: true, roundId: "preview-squid", roundNo: 3, participantIds: ids, mode: "FINITE", squidValue: 500,
      currentHandReward: 1, players: Object.fromEntries(ids.map((id, index) => [id, { playerId: id, squidCount: index === 2 || index === 6 ? 0 : 1, safe: index !== 2 && index !== 6, squidProfit: 0, totalSquidWon: index === 2 || index === 6 ? 0 : 1 }])),
      status: "ACTIVE", processedHandIds: [], awards: [], settlements: []
    }
  },
  privateState: {
    playerId: "you", holeCards: ["QS", "JS"], legalActions: { canFold: true, canCheck: false, canCall: true, callAmount: 600, canBet: false, canRaise: true, minRaiseTo: 1200, maxRaiseTo: 10100 }
  }
};

export function MockTablePreview() {
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [notice, setNotice] = useState("这是本地演示牌桌，可以放心点击");
  const [pendingAction, setPendingAction] = useState("");
  const [previewMode, setPreviewMode] = useState<"table" | "runout" | "double">("table");
  useEffect(() => {
    const mode = new URLSearchParams(window.location.search).get("mode");
    if (mode === "runout" || mode === "double") setPreviewMode(mode);
  }, []);
  function toggleSound() {
    if (!soundEnabled) unlockSound();
    setSoundEnabled(!soundEnabled);
  }
  function act(type: ActionType, amount?: number) {
    if (soundEnabled) {
      if (type === "FOLD") playFold(); else playChip();
    }
    const label = type === "FOLD" ? "已演示：弃牌" : type === "CALL" ? "已演示：跟注 600" : type === "ALL_IN" ? "已演示：ALL-IN" : `已演示：加注到 ${amount ?? 1200}`;
    setPendingAction(label.replace("已演示：", "已"));
    window.setTimeout(() => setPendingAction(""), 520);
    setNotice(label);
  }
  const previewData = structuredClone(preview);
  if (previewMode === "runout" && previewData.publicState.poker) {
    const poker = previewData.publicState.poker;
    poker.street = "RUNOUT_VOTE"; poker.currentPlayerId = undefined; poker.actionDeadline = Date.now() + 60_000;
    poker.runoutVote = { eligiblePlayerIds: ["you", "p2", "p3"], votes: { p2: 2 } };
    poker.players = poker.players.map((player) => ({ ...player, status: player.id === "p4" ? "FOLDED" : "ALL_IN" }));
  }
  if (previewMode === "double" && previewData.publicState.poker) {
    const poker = previewData.publicState.poker;
    poker.street = "FINISHED"; poker.currentPlayerId = undefined; poker.actionDeadline = undefined;
    poker.runoutCount = 2; poker.runoutBoards = [["AS", "KH", "7C", "4D", "2S"], ["AS", "KH", "7C", "QD", "QC"]];
    poker.revealedHoleCards = { you: ["QS", "JS"], p2: ["AH", "AD"], p3: ["7S", "7H"] };
  }
  return <>
    <PokerTable data={previewData} busy={false} pendingAction={pendingAction} showDecision={false} soundEnabled={soundEnabled} onToggleSound={toggleSound} onAction={act} onRunoutVote={() => undefined} onShow={() => undefined} onFinish={() => undefined} onUpdateRules={(smallBlind, bigBlind, actionSeconds, squidValue) => setNotice(`已演示：盲注 ${smallBlind}/${bigBlind} · ${actionSeconds} 秒 · 鱼值 ${squidValue}`)} onRebuy={(amount) => { if (soundEnabled) playChip(); setNotice(`已演示：补码 ${amount.toLocaleString("zh-CN")}`); }} />
    <div aria-live="polite" style={{ position: "fixed", left: "50%", bottom: 88, transform: "translateX(-50%)", zIndex: 20, padding: "8px 14px", borderRadius: 999, background: "rgba(4, 18, 14, .88)", border: "1px solid rgba(127, 255, 196, .28)", color: "#d9ffeb", fontSize: 13, whiteSpace: "nowrap", pointerEvents: "none" }}>{notice}</div>
  </>;
}
