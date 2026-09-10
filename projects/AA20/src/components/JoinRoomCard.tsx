"use client";
import { useEffect, useState } from "react";
import { AvatarPicker } from "./AvatarPicker";
import { savePlayerToken } from "@/lib/player-session";

interface Preview { code: string; maxPlayers: number; mode: string; players: Array<{ nickname: string; avatarId: string; isHost: boolean }> }
export function JoinRoomCard({ code, onJoined }: { code: string; onJoined: (token: string) => void }) {
  const [preview, setPreview] = useState<Preview>();
  const [nickname, setNickname] = useState("");
  const [avatarId, setAvatar] = useState("🐼");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { fetch(`/api/rooms/${code}/preview`).then(async (r) => { const body = await r.json(); if (!r.ok) throw new Error(body.error); return body; }).then(setPreview).catch((e) => setError(e.message)); }, [code]);
  async function join() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/rooms/${code}/join`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nickname, avatarId }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      savePlayerToken(code, body.playerToken); onJoined(body.playerToken);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "加入失败"); setBusy(false); }
  }
  return <div className="page"><div className="brand">FRIENDS TABLE · {code}</div><section className="hero" style={{ minHeight: "75svh" }}><div className="card">
    <h1 style={{ marginTop: 0 }}>加入朋友局</h1>
    {preview && <p className="lede">{preview.players.find((p) => p.isHost)?.nickname ?? "朋友"} 的牌局 · {preview.players.length}/{preview.maxPlayers} 人 · {preview.mode === "poker_squid" ? "🦑 经典鱿鱼" : "普通德扑"}</p>}
    <div className="field"><label>你的昵称</label><input className="input" maxLength={16} value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="起个桌上好认的名字" /></div>
    <div className="field"><label>头像</label><AvatarPicker value={avatarId} onChange={setAvatar} /></div>
    {error && <div className="error">{error}</div>}
    <button className="button button-primary" style={{ width: "100%" }} disabled={busy || !nickname.trim()} onClick={join}>{busy ? "正在入座…" : "加入牌局"}</button>
  </div></section></div>;
}
