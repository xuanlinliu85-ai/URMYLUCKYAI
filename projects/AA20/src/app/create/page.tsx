"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AvatarPicker } from "@/components/AvatarPicker";
import { savePlayerToken } from "@/lib/player-session";

export default function CreatePage() {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [avatarId, setAvatar] = useState("🦊");
  const [maxPlayers, setMaxPlayers] = useState(7);
  const [totalHands, setTotalHands] = useState(10);
  const [actionSeconds, setActionSeconds] = useState(30);
  const [startingStack, setStartingStack] = useState(10000);
  const [smallBlind, setSmallBlind] = useState(50);
  const [bigBlind, setBigBlind] = useState(100);
  const [squidPreset, setSquidPreset] = useState<"OFF" | "CLASSIC" | "PROGRESSIVE">("CLASSIC");
  const [squidValue, setSquidValue] = useState(500);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function create() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/rooms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nickname, avatarId, maxPlayers, totalHands, actionSeconds, startingStack, smallBlind, bigBlind, squidPreset, squidValue }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      savePlayerToken(result.code, result.playerToken);
      router.push(`/room/${result.code}`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "创建失败"); setBusy(false); }
  }
  return <main className="app-shell"><div className="page">
    <div className="topbar"><Link href="/" className="back">← 返回</Link><span className="brand">FRIENDS TABLE</span></div>
    <h1 style={{ margin: "12px 0 4px", fontSize: 30 }}>创建朋友局</h1>
    <p className="lede" style={{ marginTop: 0 }}>默认就是最适合朋友局的一套。</p>
    <div className="card">
      <div className="field"><label htmlFor="nickname">你的昵称</label><input id="nickname" className="input" maxLength={16} value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="例如 Lucky" /></div>
      <div className="field"><label>选择头像</label><AvatarPicker value={avatarId} onChange={setAvatar} /></div>
      <div className="field"><label>桌子人数</label><div className="segmented">{[6,7].map((n) => <button type="button" className={`segment ${maxPlayers === n ? "active" : ""}`} key={n} onClick={() => setMaxPlayers(n)}>{n} 人</button>)}</div></div>
      <div className="field"><label>玩法</label><div className="segmented">
        <button type="button" className={`segment ${squidPreset === "OFF" ? "active" : ""}`} onClick={() => setSquidPreset("OFF")}>普通</button>
        <button type="button" className={`segment ${squidPreset === "CLASSIC" ? "active" : ""}`} onClick={() => setSquidPreset("CLASSIC")}>🦑 经典</button>
        <button type="button" className={`segment ${squidPreset === "PROGRESSIVE" ? "active" : ""}`} onClick={() => setSquidPreset("PROGRESSIVE")}>🔥 无限</button>
      </div></div>
      {squidPreset !== "OFF" && <div className="field"><label htmlFor="squidValue">每条鱿鱼大小</label><input id="squidValue" className="input" type="number" min={1} max={1000000} step={100} value={squidValue} onChange={(event) => setSquidValue(Number(event.target.value))} /></div>}
      <div className="field"><label htmlFor="totalHands">本桌总局数</label><div className="segmented">{[10,20,30].map((count) => <button type="button" className={`segment ${totalHands === count ? "active" : ""}`} key={count} onClick={() => setTotalHands(count)}>{count} 局</button>)}</div><input id="totalHands" className="input" style={{ marginTop: 8 }} type="number" min={1} max={200} value={totalHands} onChange={(event) => setTotalHands(Number(event.target.value))} aria-label="自定义总局数" /></div>
      <div className="field"><label htmlFor="actionSeconds">每人行动时间</label><div className="segmented">{[10,20,30].map((seconds) => <button type="button" className={`segment ${actionSeconds === seconds ? "active" : ""}`} key={seconds} onClick={() => setActionSeconds(seconds)}>{seconds} 秒</button>)}</div><input id="actionSeconds" className="input" style={{ marginTop: 8 }} type="number" min={5} max={120} value={actionSeconds} onChange={(event) => setActionSeconds(Number(event.target.value))} aria-label="自定义行动秒数" /></div>
      <div className="field"><label htmlFor="startingStack">每人初始带入码</label><input id="startingStack" className="input" type="number" min={100} max={1000000} step={100} value={startingStack} onChange={(e) => setStartingStack(Number(e.target.value))} /></div>
      <div className="button-row">
        <div className="field" style={{ margin: 0 }}><label htmlFor="smallBlind">小盲</label><input id="smallBlind" className="input" type="number" min={1} step={10} value={smallBlind} onChange={(e) => setSmallBlind(Number(e.target.value))} /></div>
        <div className="field" style={{ margin: 0 }}><label htmlFor="bigBlind">大盲</label><input id="bigBlind" className="input" type="number" min={2} step={10} value={bigBlind} onChange={(e) => setBigBlind(Number(e.target.value))} /></div>
      </div>
      <div className="hint-row" style={{ margin: "12px 0" }}><span className="hint">共 {totalHands} 局</span><span className="hint">行动 {actionSeconds} 秒</span><span className="hint">带入 {startingStack.toLocaleString("zh-CN")}</span><span className="hint">盲注 {smallBlind} / {bigBlind}</span>{squidPreset !== "OFF" && <span className="hint">鱼值 {squidValue.toLocaleString("zh-CN")}</span>}</div>
      {bigBlind < smallBlind * 2 && <div className="error">大盲至少应为小盲的 2 倍</div>}
      {error && <div className="error">{error}</div>}
      <button className="button button-primary" style={{ width: "100%", marginTop: 10 }} disabled={busy || !nickname.trim() || totalHands < 1 || totalHands > 200 || actionSeconds < 5 || actionSeconds > 120 || squidValue < 1 || startingStack < 100 || bigBlind < smallBlind * 2} onClick={create}>{busy ? "正在开桌…" : "创建牌局"}</button>
    </div>
  </div></main>;
}
