"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { browserSupabase } from "@/lib/supabase-browser";
import { loadPlayerToken } from "@/lib/player-session";
import { JoinRoomCard } from "./JoinRoomCard";
import { WaitingRoom } from "./WaitingRoom";
import { PokerTable } from "./PokerTable";
import type { ActionType, SyncPayload } from "@/types/game";
import { playCheck, playChip, playFold, speakAction, unlockSound } from "@/lib/game-sound";
import { useGameSounds } from "@/hooks/useGameSounds";

const messages: Record<string, string> = { ROOM_NOT_FOUND: "这个牌局不存在或已经结束", ROOM_FULL: "这个牌局已经满员", NICKNAME_TAKEN: "这个昵称已经有人用了", STATE_CONFLICT: "牌桌状态已更新，正在同步", INVALID_PLAYER_TOKEN: "座位凭证已失效", NOT_YOUR_TURN: "还没轮到你行动", HAND_IN_PROGRESS: "请在本手结束后修改盲注或补码", INVALID_BLINDS: "大盲至少应为小盲的 2 倍", SUPABASE_NOT_CONFIGURED: "服务尚未连接 Supabase" };

export function RoomClient({ code }: { code: string }) {
  const router = useRouter();
  const [token, setToken] = useState<string | null | undefined>();
  const [data, setData] = useState<SyncPayload>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [pendingAction, setPendingAction] = useState("");
  const latestVersion = useRef(0);
  const autoTransitionKey = useRef("");
  useGameSounds(data, soundEnabled);

  const sync = useCallback(async (knownToken?: string) => {
    const activeToken = knownToken ?? token;
    if (!activeToken) return;
    try {
      const response = await fetch("/api/game/reconnect", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ roomCode: code, playerToken: activeToken }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setData((current) => !current || body.stateVersion >= current.stateVersion ? body : current); setError("");
      if (body.publicState.status === "finished") router.push(`/result/${code}`);
    } catch (caught) { const key = caught instanceof Error ? caught.message : ""; setError(messages[key] ?? key ?? "同步失败"); }
  }, [code, router, token]);

  useEffect(() => {
    const saved = loadPlayerToken(code);
    const timer = window.setTimeout(() => {
      setToken(saved);
      setSoundEnabled(localStorage.getItem("friends-table:sound") === "on");
      if (saved) void sync(saved);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [code, sync]);
  useEffect(() => {
    latestVersion.current = data?.stateVersion ?? 0;
  }, [data?.stateVersion]);
  const playerId = data?.privateState.playerId;
  useEffect(() => {
    if (!token || !playerId) return;
    const client = browserSupabase();
    if (!client) return;
    let offlineTimer: ReturnType<typeof setTimeout> | undefined;
    let channel = client.channel(`room:${code}`, { config: { presence: { key: playerId } } });
    ["state:updated", "hand:started", "player:acted", "hand:finished", "squid:awarded", "squid:settlement", "room:finished"].forEach((event) => { channel = channel.on("broadcast", { event }, ({ payload }) => { if (!payload?.stateVersion || payload.stateVersion > latestVersion.current) void sync(); }); });
    channel = channel.on("presence", { event: "sync" }, () => {
      const presences = Object.values(channel.presenceState()).flat() as unknown as Array<{ playerId?: string }>;
      const online = new Set(presences.map((presence) => String(presence.playerId ?? "")));
      setData((current) => current ? { ...current, publicState: { ...current.publicState, members: current.publicState.members.map((member) => ({ ...member, connected: online.has(member.id) ? true : member.connected })) } } : current);
      clearTimeout(offlineTimer);
      offlineTimer = setTimeout(() => setData((current) => current ? { ...current, publicState: { ...current.publicState, members: current.publicState.members.map((member) => ({ ...member, connected: online.has(member.id) })) } } : current), 1000);
    });
    channel.subscribe(async (status) => { if (status === "SUBSCRIBED") await channel.track({ playerId, connectedAt: Date.now() }); });
    return () => { clearTimeout(offlineTimer); void client.removeChannel(channel); };
  }, [code, playerId, sync, token]);
  useEffect(() => {
    const resume = () => { if (document.visibilityState === "visible") void sync(); };
    document.addEventListener("visibilitychange", resume); window.addEventListener("online", resume);
    return () => { document.removeEventListener("visibilitychange", resume); window.removeEventListener("online", resume); };
  }, [sync]);
  useEffect(() => {
    const deadline = data?.publicState.poker?.actionDeadline;
    if (!deadline || !data) return;
    const timer = setTimeout(async () => {
      await fetch("/api/game/timeout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ roomCode: code, stateVersion: data.stateVersion }) }).catch(() => undefined);
      await sync();
    }, Math.max(0, deadline - Date.now() + 150));
    return () => clearTimeout(timer);
  }, [code, data, sync]);

  const post = useCallback(async (path: string, body: object) => {
    if (!token) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (result.publicState) setData(result);
      return result;
    } catch (caught) {
      const key = caught instanceof Error ? caught.message : ""; setError(messages[key] ?? key ?? "操作失败");
      if (key === "STATE_CONFLICT") await sync();
    } finally { setBusy(false); }
  }, [sync, token]);
  const poker = data?.publicState.poker;
  const isHost = data?.publicState.hostPlayerId === data?.privateState.playerId;
  const maxHands = data?.publicState.rules.poker.maxHands ?? 10;
  const autoDelaySeconds = Math.max(4, Math.min(data?.publicState.rules.poker.nextHandDelaySeconds ?? 5, 6));
  const autoStateVersion = data?.stateVersion;
  const autoHandId = poker?.handId;
  const autoHandNo = poker?.handNo;
  const autoStreet = poker?.street;
  const autoShowPlayerId = poker?.showDecisionPlayerId;
  useEffect(() => {
    if (!token || !autoStateVersion || !autoHandId || !autoHandNo || !isHost || busy || autoStreet !== "FINISHED" || autoShowPlayerId) return;
    const transition = autoHandNo >= maxHands ? "finish" : "next";
    const key = `${autoHandId}:${autoStateVersion}:${transition}`;
    if (autoTransitionKey.current === key) return;
    const timer = setTimeout(async () => {
      autoTransitionKey.current = key;
      const result = transition === "finish"
        ? await post(`/api/rooms/${code}/finish`, { playerToken: token })
        : await post(`/api/rooms/${code}/next-hand`, { playerToken: token, stateVersion: autoStateVersion });
      if (!result) { autoTransitionKey.current = ""; return; }
      if (transition === "finish" && result.summaries) {
        localStorage.setItem(`friends-table:${code}:result`, JSON.stringify(result.summaries));
        router.push(`/result/${code}`);
      }
    }, autoDelaySeconds * 1000);
    return () => clearTimeout(timer);
  }, [autoDelaySeconds, autoHandId, autoHandNo, autoShowPlayerId, autoStateVersion, autoStreet, busy, code, isHost, maxHands, post, router, token]);
  async function action(type: ActionType, amount?: number) {
    if (!data?.publicState.poker) return;
    const actionLabel = type === "FOLD" ? "已弃牌" : type === "CHECK" ? "已过牌" : type === "CALL" ? `已跟注 ${data.privateState.legalActions?.callAmount ?? ""}` : type === "ALL_IN" ? "已 ALL-IN" : type === "BET" ? `已下注 ${amount ?? ""}` : `已加注到 ${amount ?? ""}`;
    setPendingAction(actionLabel.trim());
    if (soundEnabled) {
      if (type === "FOLD") playFold(); else if (type === "CHECK") playCheck(); else playChip();
      const actionName = type === "FOLD" ? "弃牌" : type === "CHECK" ? "过牌" : type === "CALL" ? "跟注" : type === "BET" ? "下注" : type === "RAISE" ? "加注到" : "全下";
      const me = data.publicState.members.find((member) => member.id === data.privateState.playerId);
      const spokenAmount = amount ?? (type === "CALL" ? data.privateState.legalActions?.callAmount : type === "ALL_IN" && me ? me.streetBet + me.stack : undefined);
      speakAction(actionName, spokenAmount);
    }
    try {
      await post("/api/game/action", { roomCode: code, playerToken: token, actionId: crypto.randomUUID(), handId: data.publicState.poker.handId, stateVersion: data.stateVersion, action: { type, amount } });
    } finally { setPendingAction(""); }
  }
  async function decideShow(show: boolean) {
    if (!data) return;
    await post("/api/game/show-decision", { roomCode: code, playerToken: token, show, stateVersion: data.stateVersion });
  }
  async function decideRunout(count: 1 | 2) {
    if (!data) return;
    await post("/api/game/runout-vote", { roomCode: code, playerToken: token, count, stateVersion: data.stateVersion });
  }
  async function finish() {
    if (!confirm("结束今晚牌局并生成总账？")) return;
    const result = await post(`/api/rooms/${code}/finish`, { playerToken: token });
    if (result?.summaries) { localStorage.setItem(`friends-table:${code}:result`, JSON.stringify(result.summaries)); router.push(`/result/${code}`); }
  }

  if (token === undefined) return <div className="loading pulse">正在连接朋友局…</div>;
  if (!token) return <JoinRoomCard code={code} onJoined={(newToken) => { setToken(newToken); void sync(newToken); }} />;
  if (!data) return <div className="page"><div className="loading pulse">正在恢复你的座位…</div>{error && <div className="error">{error}<button className="button button-secondary" onClick={() => sync()} style={{ marginLeft: 10 }}>重试</button></div>}</div>;
  const serverRequestsShow = data.publicState.poker?.showDecisionPlayerId === data.privateState.playerId;
  function toggleSound() { const next = !soundEnabled; setSoundEnabled(next); localStorage.setItem("friends-table:sound", next ? "on" : "off"); if (next) unlockSound(); }
  const updateSettings = (settings: { startingStack?: number; totalHands?: number; actionSeconds?: number; squidValue?: number; smallBlind: number; bigBlind: number }) => post(`/api/rooms/${code}/settings`, { playerToken: token, stateVersion: data.stateVersion, ...settings });
  const rebuy = (amount: number) => post(`/api/rooms/${code}/rebuy`, { playerToken: token, stateVersion: data.stateVersion, amount });
  return <>{error && <div className="error" style={{ position: "fixed", zIndex: 80, top: 8, left: "50%", transform: "translateX(-50%)", width: "min(90%, 520px)" }}>{error}</div>}{data.publicState.status === "waiting" ? <WaitingRoom data={data} busy={busy} onSync={() => sync()} onSettings={(settings) => void updateSettings(settings)} onStart={() => post(`/api/rooms/${code}/start`, { playerToken: token })} /> : <PokerTable data={data} busy={busy} pendingAction={pendingAction} showDecision={serverRequestsShow} soundEnabled={soundEnabled} onToggleSound={toggleSound} onAction={action} onRunoutVote={decideRunout} onShow={decideShow} onFinish={finish} onUpdateRules={(smallBlind, bigBlind, actionSeconds, squidValue) => void updateSettings({ smallBlind, bigBlind, actionSeconds, squidValue })} onRebuy={(amount) => void rebuy(amount)} />}</>;
}
