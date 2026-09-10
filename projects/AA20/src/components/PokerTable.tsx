"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { PlayingCard } from "./PlayingCard";
import { AnimatedCommunityCards } from "./AnimatedCommunityCards";
import { playDealCard } from "@/lib/game-sound";
import { potFractionAmount } from "@/lib/bet-sizing";
import type { ActionType, Card, LegalActions, SquidSettlement, SyncPayload } from "@/types/game";

gsap.registerPlugin(useGSAP);

const money = new Intl.NumberFormat("zh-CN");

function Seat({ member, position, turn, urgent, dealer, me, winner, revealedCards }: { member: SyncPayload["publicState"]["members"][number]; position: number; turn: boolean; urgent: boolean; dealer: boolean; me: boolean; winner: boolean; revealedCards?: [Card, Card] }) {
  const lastActionLabel = member.lastAction === "FOLD" ? "弃牌" : member.lastAction === "CHECK" ? "过牌" : member.lastAction === "CALL" ? "跟注" : member.lastAction === "BET" ? "下注" : member.lastAction === "RAISE" ? "加注" : member.lastAction === "ALL_IN" ? "ALL-IN" : undefined;
  const badge = member.status === "ALL_IN" ? "ALL-IN" : member.status === "FOLDED" ? "弃牌" : !member.connected ? "断线" : me ? "YOU" : lastActionLabel;
  return <div data-player-id={member.id} className={`seat seat-${position} ${turn ? "turn" : ""} ${urgent ? "urgent" : ""} ${dealer ? "dealer" : ""} ${winner ? "winner" : ""} ${member.status === "FOLDED" ? "folded" : ""}`}>
    {turn && <span className="turn-ring" aria-hidden />}
    <div className="avatar">{member.avatarId}{dealer && <span className="dealer-button" aria-label="庄家">D</span>}{badge && <span className="badge">{badge}</span>}</div>
    <div className="seat-name">{member.nickname}</div><div className="seat-stack">{money.format(member.stack)}</div>
    <div className={`seat-squid ${member.squidCount === 0 ? "seat-unsafe" : ""}`}>{member.squidCount > 0 ? `🦑${member.squidCount} · 累${member.totalSquidWon}` : member.totalSquidWon > 0 ? `⚠️本轮0 · 累🦑${member.totalSquidWon}` : "⚠️ 0鱼"}</div>
    {member.streetBet > 0 && <div className="seat-bet"><span className="mini-chip" aria-hidden>●</span>{money.format(member.streetBet)}</div>}
    {revealedCards && <div className="seat-showdown" aria-label={`${member.nickname}亮牌`}>{revealedCards.map((card) => <PlayingCard key={card} card={card} />)}</div>}
  </div>;
}

function RaiseSheet({ legal, pot, currentStreetBet, onClose, onAction }: { legal: LegalActions; pot: number; currentStreetBet: number; onClose: () => void; onAction: (type: ActionType, amount?: number) => void }) {
  const min = legal.canBet ? legal.minBet! : legal.minRaiseTo!;
  const max = legal.canBet ? legal.maxBet! : legal.maxRaiseTo!;
  const [amount, setAmount] = useState(min);
  const allIn = amount === max;
  const [confirming, setConfirming] = useState(false);
  function submit() {
    if (allIn && !confirming) { setConfirming(true); return; }
    onAction(allIn ? "ALL_IN" : legal.canBet ? "BET" : "RAISE", allIn ? undefined : amount);
  }
  return <div className="overlay" role="dialog"><div className="sheet"><div className="topbar"><strong>{confirming ? "确认 ALL-IN？" : legal.canBet ? "下注" : "加注到"}</strong><button className="button button-secondary" style={{ minHeight: 36 }} onClick={onClose}>取消</button></div>
    {confirming ? <><p className="lede">你将投入全部可用筹码。这个操作无法撤销。</p><button className="button button-danger" style={{ width: "100%" }} onClick={submit}>确认 ALL-IN {money.format(max)}</button></> : <>
      <div style={{ textAlign: "center", fontSize: 34, fontWeight: 950, margin: "15px 0" }}>{money.format(amount)}</div>
      <input style={{ width: "100%" }} type="range" min={min} max={max} step={Math.max(1, Math.round((max - min) / 100))} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
      <div className="pot-shortcuts" style={{ marginTop: 14 }}>{[[1,4],[1,3],[1,2],[3,4]].map(([part, whole]) => { const target = potFractionAmount(pot, part, whole, min, max, legal.callAmount ?? 0, currentStreetBet); return <button type="button" className="button button-secondary" key={`${part}/${whole}`} onClick={() => setAmount(target)}>{part}/{whole}池<strong>{money.format(target)}</strong></button>; })}<button type="button" className="button button-secondary" onClick={() => setAmount(max)}>MAX<strong>{money.format(max)}</strong></button></div>
      <button className={`button ${allIn ? "button-danger" : "button-primary"}`} style={{ width: "100%", marginTop: 10 }} onClick={submit}>{allIn ? `ALL-IN ${money.format(max)}` : `确认 ${money.format(amount)}`}</button>
    </>}
  </div></div>;
}

function SettlementSheet({ data }: { data: SyncPayload }) {
  const settlements = data.publicState.squid?.settlements ?? [];
  const names = Object.fromEntries(data.publicState.members.map((member) => [member.id, member.nickname]));
  const net: Record<string, number> = {};
  settlements.forEach((entry) => { net[entry.fromPlayerId] = (net[entry.fromPlayerId] ?? 0) - entry.amount; net[entry.toPlayerId] = (net[entry.toPlayerId] ?? 0) + entry.amount; });
  return <div className="overlay"><div className="sheet"><div className="brand">SQUID ROUND {data.publicState.squid?.roundNo}</div><h1>🦑 本轮结算</h1>
    {Object.entries(net).sort((a,b) => b[1]-a[1]).map(([id, amount]) => <div className="settlement-row" key={id}><strong>{names[id]}</strong><strong className={amount >= 0 ? "positive" : "negative"}>{amount >= 0 ? "+" : ""}{money.format(amount)}</strong></div>)}
    <details style={{ margin: "14px 0" }}><summary>查看详细账目</summary>{settlements.map((entry: SquidSettlement, index) => <div className="settlement-row" key={index}><span>{names[entry.fromPlayerId]} → {names[entry.toPlayerId]}</span><span>{money.format(entry.amount)}</span></div>)}</details>
    <p className="lede" style={{ textAlign: "center" }}>结算展示完成后自动进入下一轮</p>
  </div></div>;
}

function RunoutVoteSheet({ data, busy, onVote }: { data: SyncPayload; busy: boolean; onVote: (count: 1 | 2) => void }) {
  const vote = data.publicState.poker?.runoutVote;
  const playerId = data.privateState.playerId;
  if (!vote) return null;
  const eligible = vote.eligiblePlayerIds.includes(playerId);
  const ownVote = vote.votes[playerId];
  const votedCount = Object.keys(vote.votes).length;
  return <div className="overlay" role="dialog" aria-label="协商公共牌发牌次数"><div className="sheet runout-sheet">
    <div className="brand">ALL-IN · 发牌协商</div><h2>剩余公共牌发几次？</h2>
    <p className="lede">所有仍在本手中的玩家都同意，才会发两次。任何一人选择发一次，或倒计时结束，都会只发一次。</p>
    <div className="runout-progress">已选择 {votedCount}/{vote.eligiblePlayerIds.length}</div>
    {!eligible ? <div className="waiting-message">你已弃牌，等待在局玩家协商…</div> : ownVote ? <div className="waiting-message">你已选择发两次，正在等待其他玩家…</div> : <div className="button-row">
      <button className="button button-primary" disabled={busy} onClick={() => onVote(1)}>发一次</button>
      <button className="button button-squid" disabled={busy} onClick={() => onVote(2)}>发两次</button>
    </div>}
  </div></div>;
}

function TableTools({ data, isHost, busy, onClose, onUpdateRules, onRebuy }: { data: SyncPayload; isHost: boolean; busy: boolean; onClose: () => void; onUpdateRules: (smallBlind: number, bigBlind: number, actionSeconds: number, squidValue: number) => void; onRebuy: (amount: number) => void }) {
  const [smallBlind, setSmallBlind] = useState(data.publicState.rules.poker.smallBlind);
  const [bigBlind, setBigBlind] = useState(data.publicState.rules.poker.bigBlind);
  const [actionSeconds, setActionSeconds] = useState(data.publicState.rules.poker.actionSeconds);
  const [squidValue, setSquidValue] = useState(data.publicState.rules.squid.squidValue);
  const [rebuy, setRebuy] = useState(data.publicState.rules.poker.startingStack);
  const validRules = smallBlind > 0 && bigBlind >= smallBlind * 2 && actionSeconds >= 5 && actionSeconds <= 120 && squidValue > 0;
  return <div className="overlay" role="dialog" aria-label="桌台设置"><div className="sheet">
    <div className="topbar"><strong>桌台与筹码</strong><button className="button button-secondary" style={{ minHeight: 36 }} onClick={onClose}>关闭</button></div>
    <div className="card" style={{ marginTop: 12 }}><div className="brand">本桌规则</div><div className="hint-row" style={{ marginTop: 10 }}><span className="hint">总局数 {data.publicState.rules.poker.maxHands ?? 10}</span><span className="hint">盲注 {data.publicState.rules.poker.smallBlind} / {data.publicState.rules.poker.bigBlind}</span><span className="hint">初始带入 {money.format(data.publicState.rules.poker.startingStack)}</span></div></div>
    {isHost && <div className="card" style={{ marginTop: 12 }}><strong>修改桌台规则</strong><p className="lede" style={{ fontSize: 13 }}>新设置从下一手开始生效。</p><div className="button-row"><div className="field" style={{ margin: 0 }}><label htmlFor="table-small-blind">小盲</label><input id="table-small-blind" className="input" type="number" min={1} value={smallBlind} onChange={(event) => setSmallBlind(Number(event.target.value))} /></div><div className="field" style={{ margin: 0 }}><label htmlFor="table-big-blind">大盲</label><input id="table-big-blind" className="input" type="number" min={2} value={bigBlind} onChange={(event) => setBigBlind(Number(event.target.value))} /></div></div><div className="field"><label htmlFor="table-action-seconds">每人行动时间（秒）</label><input id="table-action-seconds" className="input" type="number" min={5} max={120} value={actionSeconds} onChange={(event) => setActionSeconds(Number(event.target.value))} /></div>{data.publicState.rules.squid.enabled && <div className="field"><label htmlFor="table-squid-value">每条鱿鱼大小</label><input id="table-squid-value" className="input" type="number" min={1} max={1000000} step={100} value={squidValue} onChange={(event) => setSquidValue(Number(event.target.value))} /></div>}{!validRules && <div className="error" style={{ marginTop: 10 }}>大盲至少是小盲的 2 倍；行动时间 5–120 秒；鱿鱼需大于 0</div>}<button className="button button-primary" style={{ width: "100%", marginTop: 12 }} disabled={busy || !validRules} onClick={() => onUpdateRules(smallBlind, bigBlind, actionSeconds, squidValue)}>保存桌台规则</button></div>}
    <div className="card" style={{ marginTop: 12 }}><strong>补码</strong><p className="lede" style={{ fontSize: 13 }}>补码在本手结束后办理，下一手可用。</p><div className="field"><label htmlFor="table-rebuy">增加筹码</label><input id="table-rebuy" className="input" type="number" min={1} step={100} value={rebuy} onChange={(event) => setRebuy(Number(event.target.value))} /></div><button className="button button-squid" style={{ width: "100%" }} disabled={busy || rebuy <= 0} onClick={() => onRebuy(rebuy)}>确认补码 {money.format(Math.max(0, rebuy))}</button></div>
  </div></div>;
}

export function PokerTable({ data, busy, pendingAction, showDecision, soundEnabled, onToggleSound, onAction, onRunoutVote, onShow, onFinish, onUpdateRules, onRebuy }: {
  data: SyncPayload; busy: boolean; showDecision: boolean;
  pendingAction?: string;
  soundEnabled: boolean; onToggleSound: () => void;
  onAction: (type: ActionType, amount?: number) => void; onRunoutVote: (count: 1 | 2) => void; onShow: (show: boolean) => void; onFinish: () => void;
  onUpdateRules: (smallBlind: number, bigBlind: number, actionSeconds: number, squidValue: number) => void; onRebuy: (amount: number) => void;
}) {
  const [raising, setRaising] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const tableRoot = useRef<HTMLDivElement>(null);
  const { publicState, privateState } = data;
  const poker = publicState.poker!;
  const me = publicState.members.find((member) => member.id === privateState.playerId)!;
  const positions = useMemo(() => [...publicState.members].sort((a, b) => ((a.seatNo - me.seatNo + 7) % 7) - ((b.seatNo - me.seatNo + 7) % 7)), [publicState.members, me.seatNo]);
  const pot = poker.pots.length ? poker.pots.reduce((sum, item) => sum + item.amount, 0) : poker.players.reduce((sum, player) => sum + player.totalCommitted, 0);
  const unsafe = publicState.squid?.participantIds.filter((id) => publicState.squid?.players[id]?.squidCount === 0).length ?? 0;
  const legal = privateState.legalActions;
  const isHost = publicState.hostPlayerId === privateState.playerId;
  const finished = poker.street === "FINISHED";
  const maxHands = publicState.rules.poker.maxHands ?? 10;
  const handLimitReached = poker.handNo >= maxHands;
  const [secondsLeft, setSecondsLeft] = useState<number>();
  const lastAction = poker.actions.at(-1);
  const lastActor = publicState.members.find((member) => member.id === lastAction?.playerId);
  const actionName = lastAction?.type === "FOLD" ? "弃牌" : lastAction?.type === "CHECK" ? "过牌" : lastAction?.type === "CALL" ? "跟注" : lastAction?.type === "BET" ? "下注" : lastAction?.type === "RAISE" ? "加注到" : lastAction?.type === "ALL_IN" ? "ALL-IN" : "";
  const winnerIds = useMemo(() => [...new Set(poker.pots.flatMap((item) => item.winnerIds))], [poker.pots]);
  const latestSquidAward = publicState.squid?.awards.at(-1);
  const latestSquidWinner = publicState.members.find((member) => member.id === latestSquidAward?.playerId);
  const resultKey = finished ? `${poker.handId}:${poker.pots.map((item) => `${item.id}-${Object.entries(item.splitAmounts).join(".")}`).join("|")}:${Object.keys(poker.revealedHoleCards ?? {}).join(".")}` : "";
  const displayBoards = poker.runoutBoards?.length === 2 ? poker.runoutBoards : [poker.board];
  useEffect(() => {
    if (!poker.actionDeadline || finished) { const reset = window.setTimeout(() => setSecondsLeft(undefined), 0); return () => window.clearTimeout(reset); }
    const update = () => setSecondsLeft(Math.max(0, Math.ceil((poker.actionDeadline! - Date.now()) / 1000)));
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [finished, poker.actionDeadline]);
  useGSAP(() => {
    if (!lastAction || lastAction.type === "CHECK" || lastAction.type === "FOLD") return;
    const table = tableRoot.current?.querySelector<HTMLElement>(".poker-table");
    const seat = tableRoot.current?.querySelector<HTMLElement>(`[data-player-id="${lastAction.playerId}"]`);
    if (!table || !seat) return;
    const tableRect = table.getBoundingClientRect();
    const seatRect = seat.getBoundingClientRect();
    const chip = document.createElement("span");
    chip.className = "flying-chip";
    chip.textContent = "●";
    table.appendChild(chip);
    const startX = seatRect.left + seatRect.width / 2 - tableRect.left;
    const startY = seatRect.top + seatRect.height / 2 - tableRect.top;
    const tween = gsap.fromTo(chip, { left: startX, top: startY, scale: 0.55, opacity: 0.4 }, { left: tableRect.width / 2, top: tableRect.height / 2 - 56, scale: 1, opacity: 1, duration: 0.62, rotation: 540, ease: "power3.out", onComplete: () => chip.remove() });
    return () => { tween.kill(); chip.remove(); };
  }, { dependencies: [lastAction?.actionId], scope: tableRoot, revertOnUpdate: true });
  useGSAP(() => {
    if (!resultKey) return;
    const table = tableRoot.current?.querySelector<HTMLElement>(".poker-table");
    if (!table) return;
    const revealCards = tableRoot.current?.querySelectorAll<HTMLElement>(".seat-showdown .playing-card-inner");
    if (revealCards?.length) {
      gsap.fromTo(revealCards, { rotationY: 180, y: -8, opacity: 0.7 }, { rotationY: 0, y: 0, opacity: 1, duration: 0.42, stagger: 0.13, ease: "power2.inOut", onStart: () => { if (soundEnabled) playDealCard(); } });
    }
    const tableRect = table.getBoundingClientRect();
    const chips: HTMLElement[] = [];
    poker.pots.forEach((item, potIndex) => Object.keys(item.splitAmounts).forEach((winnerId, winnerIndex) => {
      const seat = tableRoot.current?.querySelector<HTMLElement>(`[data-player-id="${winnerId}"]`);
      if (!seat) return;
      const seatRect = seat.getBoundingClientRect();
      const chip = document.createElement("span");
      chip.className = "pot-award-chip";
      chip.textContent = "●";
      table.appendChild(chip); chips.push(chip);
      gsap.fromTo(chip, { left: tableRect.width / 2 + (winnerIndex - 1) * 9, top: tableRect.height / 2 - 55 + potIndex * 5, scale: 1, opacity: 1 }, { left: seatRect.left + seatRect.width / 2 - tableRect.left, top: seatRect.top + seatRect.height / 2 - tableRect.top, scale: 0.62, opacity: 0.1, rotation: 720, duration: 0.78, delay: 1.05 + potIndex * 0.16 + winnerIndex * 0.08, ease: "power2.in", onComplete: () => chip.remove() });
    }));
    const winners = winnerIds.map((id) => tableRoot.current?.querySelector<HTMLElement>(`[data-player-id="${id}"]`)).filter(Boolean);
    gsap.fromTo(winners, { scale: 1 }, { scale: 1.09, duration: 0.38, repeat: 3, yoyo: true, ease: "sine.inOut", delay: 0.75 });
    return () => chips.forEach((chip) => chip.remove());
  }, { dependencies: [resultKey], scope: tableRoot, revertOnUpdate: true });
  return <div className="room-page" ref={tableRoot}>
    <header className="room-head"><strong>ROOM {publicState.roomCode}</strong><span>HAND {poker.handNo}/{maxHands}　<button className="sound-toggle" onClick={onToggleSound} aria-label={soundEnabled ? "关闭音效" : "开启音效"}>{soundEnabled ? "🔊" : "🔇"}</button> <button className="sound-toggle" onClick={() => setToolsOpen(true)} aria-label="桌台与补码">⚙️</button></span><span className="squid-line">{publicState.rules.squid.enabled ? `🦑 ${publicState.rules.squid.squidValue} / 鱼` : "普通德扑"} · {publicState.rules.poker.smallBlind}/{publicState.rules.poker.bigBlind}</span><span className="status-line">{secondsLeft !== undefined ? `⏱ ${secondsLeft}s · ` : ""}{publicState.rules.squid.enabled ? `⚠️ 无鱼剩余 ${unsafe}` : poker.street}</span></header>
    <div className="poker-table">
      {positions.map((member, index) => <Seat key={member.id} member={member} position={index} me={member.id === privateState.playerId} turn={member.id === poker.currentPlayerId} urgent={member.id === poker.currentPlayerId && (secondsLeft ?? 99) <= 5} dealer={member.seatNo === poker.dealerSeat} winner={finished && winnerIds.includes(member.id)} revealedCards={poker.revealedHoleCards?.[member.id]} />)}
      <div className={`table-center ${displayBoards.length === 2 ? "double-runout" : ""}`}><div className="pot">POT {money.format(pot)}</div>{poker.pots.length > 1 && <div className="side-pot">+ {poker.pots.length - 1} 个边池</div>}{latestSquidAward?.handId === poker.handId && <div className="squid-award-banner">🦑 {latestSquidWinner?.nickname ?? "赢家"} 获得 {latestSquidAward.amount} 条鱼</div>}
        <div className="runout-boards">{displayBoards.map((board, index) => <div className="runout-board-row" key={`${index}-${board.join("-")}`}>{displayBoards.length === 2 && <span>{index + 1}</span>}<AnimatedCommunityCards cards={board} soundEnabled={soundEnabled && index === 0} /></div>)}</div>
        <div className="hole-cards">{privateState.holeCards?.map((card) => <PlayingCard key={card} card={card} />)}</div>
        {lastAction && lastActor && <div className="action-announcer" key={lastAction.actionId}><strong>{lastActor.nickname}</strong><span>{actionName}{lastAction.amount ? ` ${money.format(lastAction.amount)}` : ""}</span></div>}
      </div>
    </div>
    <div className="action-dock">
      {pendingAction ? <div className="action-feedback" role="status"><span className="action-feedback-chip" aria-hidden>●</span><strong>{pendingAction}</strong><span>确认中</span></div> : finished ? <><div className="waiting-message">{handLimitReached ? `${maxHands} 局已完成，正在生成总账…` : "结算动画播放中，随后自动下一手…"}</div>{isHost && <button className="button button-secondary finish-night" onClick={onFinish}>结束今晚</button>}</> : poker.street === "RUNOUT_VOTE" ? <div className="waiting-message">ALL-IN 已跟住，正在协商发牌次数…</div> : poker.currentPlayerId === privateState.playerId && legal ? <>
        {legal.canFold && <button className="button button-secondary" disabled={busy} onClick={() => onAction("FOLD")}>弃牌</button>}
        {legal.canCheck && <button className="button button-primary" disabled={busy} onClick={() => onAction("CHECK")}>过牌</button>}
        {legal.canCall && <button className="button button-primary" disabled={busy} onClick={() => onAction("CALL")}>跟注 {money.format(legal.callAmount ?? 0)}</button>}
        {(legal.canBet || legal.canRaise) && <button className="button button-squid" disabled={busy} onClick={() => setRaising(true)}>{legal.canBet ? "下注" : "加注"}</button>}
      </> : <div className="waiting-message">{busy ? "服务器确认中…" : `等待 ${publicState.members.find((m) => m.id === poker.currentPlayerId)?.nickname ?? "结算"} 行动…`}</div>}
    </div>
    {raising && legal && <RaiseSheet legal={legal} pot={pot} currentStreetBet={me.streetBet} onClose={() => setRaising(false)} onAction={(type, amount) => { setRaising(false); onAction(type, amount); }} />}
    {toolsOpen && <TableTools data={data} isHost={isHost} busy={busy} onClose={() => setToolsOpen(false)} onUpdateRules={(smallBlind, bigBlind, actionSeconds, squidValue) => { onUpdateRules(smallBlind, bigBlind, actionSeconds, squidValue); setToolsOpen(false); }} onRebuy={(amount) => { onRebuy(amount); setToolsOpen(false); }} />}
    {poker.street === "RUNOUT_VOTE" && <RunoutVoteSheet data={data} busy={busy} onVote={onRunoutVote} />}
    {showDecision && <div className="overlay"><div className="sheet"><h2>你赢得主池</h2><p className="lede">亮牌可获得 🦑，8 秒后默认不亮牌。</p><div className="button-row"><button className="button button-secondary" disabled={busy} onClick={() => onShow(false)}>不亮牌</button><button className="button button-squid" disabled={busy} onClick={() => onShow(true)}>{busy ? "正在领取…" : "亮牌拿鱼"}</button></div></div></div>}
    {publicState.squid?.status === "SETTLING" && <SettlementSheet data={data} />}
  </div>;
}
