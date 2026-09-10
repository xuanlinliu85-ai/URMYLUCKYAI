"use client";
import { useState } from "react";
import type { SyncPayload } from "@/types/game";

export function WaitingRoom({ data, onStart, onSync, onSettings, busy }: { data: SyncPayload; onStart: () => void; onSync: () => void; onSettings: (settings: { startingStack: number; totalHands: number; actionSeconds: number; squidValue: number; smallBlind: number; bigBlind: number }) => void; busy: boolean }) {
  const { publicState, privateState } = data;
  const isHost = publicState.hostPlayerId === privateState.playerId;
  const [startingStack, setStartingStack] = useState(publicState.rules.poker.startingStack);
  const [totalHands, setTotalHands] = useState(publicState.rules.poker.maxHands ?? 10);
  const [actionSeconds, setActionSeconds] = useState(publicState.rules.poker.actionSeconds);
  const [squidValue, setSquidValue] = useState(publicState.rules.squid.squidValue);
  const [smallBlind, setSmallBlind] = useState(publicState.rules.poker.smallBlind);
  const [bigBlind, setBigBlind] = useState(publicState.rules.poker.bigBlind);
  const valid = startingStack >= 100 && totalHands >= 1 && totalHands <= 200 && actionSeconds >= 5 && actionSeconds <= 120 && squidValue > 0 && smallBlind > 0 && bigBlind >= smallBlind * 2;
  async function invite() {
    const text = `今晚来一桌？\n🃏 朋友德扑\n${publicState.rules.squid.enabled ? "🦑 经典鱿鱼\n" : ""}${publicState.members.length}/${publicState.rules.poker.maxPlayers} 人\n${location.href}`;
    await navigator.clipboard.writeText(text);
    alert("邀请文案已复制，去微信群粘贴吧");
  }
  return <div className="page">
    <div className="topbar"><span className="brand">朋友局 {publicState.roomCode}</span><button className="button button-secondary" style={{ minHeight: 38, padding: "0 12px" }} onClick={onSync}>刷新</button></div>
    <h1 style={{ marginBottom: 4 }}>人齐就开</h1><p className="lede" style={{ marginTop: 0 }}>{publicState.rules.squid.enabled ? `🦑 鱼值 ${publicState.rules.squid.squidValue} · 主池${publicState.rules.squid.eligibility === "MAIN_POT_AND_SHOW" ? "+亮牌" : "即获鱼"}` : "普通无限注德州扑克"} · 共 {publicState.rules.poker.maxHands ?? 10} 局 · 行动 {publicState.rules.poker.actionSeconds} 秒 · 盲注 {publicState.rules.poker.smallBlind}/{publicState.rules.poker.bigBlind} · 带入 {publicState.rules.poker.startingStack.toLocaleString("zh-CN")}</p>
    <div className="waiting-seats">{Array.from({ length: publicState.rules.poker.maxPlayers }, (_, index) => {
      const member = publicState.members.find((entry) => entry.seatNo === index + 1);
      return <div className="waiting-seat" key={index}><div className="avatar">{member?.avatarId ?? "·"}</div><div><strong>{member?.nickname ?? "等待加入…"}</strong><div className="seat-stack">Seat {index + 1}</div></div>{member?.id === publicState.hostPlayerId && <span className="host-mark">房主 👑</span>}</div>;
    })}</div>
    {isHost && <div className="card" style={{ marginTop: 16 }}><strong>桌台设置</strong><div className="button-row"><div className="field" style={{ margin: 0 }}><label htmlFor="waiting-hands">本桌总局数</label><input id="waiting-hands" className="input" type="number" min={1} max={200} value={totalHands} onChange={(event) => setTotalHands(Number(event.target.value))} /></div><div className="field" style={{ margin: 0 }}><label htmlFor="waiting-action-seconds">行动秒数</label><input id="waiting-action-seconds" className="input" type="number" min={5} max={120} value={actionSeconds} onChange={(event) => setActionSeconds(Number(event.target.value))} /></div></div>{publicState.rules.squid.enabled && <div className="field"><label htmlFor="waiting-squid-value">每条鱿鱼大小</label><input id="waiting-squid-value" className="input" type="number" min={1} max={1000000} step={100} value={squidValue} onChange={(event) => setSquidValue(Number(event.target.value))} /></div>}<div className="field"><label htmlFor="waiting-stack">每人初始带入码</label><input id="waiting-stack" className="input" type="number" min={100} step={100} value={startingStack} onChange={(event) => setStartingStack(Number(event.target.value))} /></div><div className="button-row"><div className="field" style={{ margin: 0 }}><label htmlFor="waiting-small">小盲</label><input id="waiting-small" className="input" type="number" min={1} value={smallBlind} onChange={(event) => setSmallBlind(Number(event.target.value))} /></div><div className="field" style={{ margin: 0 }}><label htmlFor="waiting-big">大盲</label><input id="waiting-big" className="input" type="number" min={2} value={bigBlind} onChange={(event) => setBigBlind(Number(event.target.value))} /></div></div>{!valid && <div className="error" style={{ marginTop: 10 }}>局数 1–200；行动 5–120 秒；鱿鱼需大于 0；带入至少 100；大盲至少为小盲 2 倍</div>}<button className="button button-secondary" style={{ width: "100%", marginTop: 12 }} disabled={busy || !valid} onClick={() => onSettings({ startingStack, totalHands, actionSeconds, squidValue, smallBlind, bigBlind })}>保存桌台设置</button></div>}
    <div className="stack" style={{ marginTop: 16 }}><button className="button button-secondary" onClick={invite}>邀请微信朋友</button>{isHost ? <button className="button button-primary" disabled={busy || publicState.members.length < 2} onClick={onStart}>{publicState.members.length < 2 ? "至少 2 人才能开始" : "开始牌局"}</button> : <div className="card" style={{ textAlign: "center", color: "var(--muted)" }}>等待房主开始</div>}</div>
  </div>;
}
