"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { loadPlayerToken } from "@/lib/player-session";
import type { PlayerNightSummary } from "@/types/game";
import { nightAwards } from "@/lib/night-awards";

const money = new Intl.NumberFormat("zh-CN");
export function NightResult({ code }: { code: string }) {
  const [summaries, setSummaries] = useState<PlayerNightSummary[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    const cached = localStorage.getItem(`friends-table:${code}:result`);
    if (cached) queueMicrotask(() => setSummaries(JSON.parse(cached)));
    const token = loadPlayerToken(code);
    if (token) fetch(`/api/rooms/${code}/result`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ playerToken: token }) })
      .then(async (r) => { const body = await r.json(); if (!r.ok) throw new Error(body.error); return body.summaries; })
      .then((next) => { setSummaries(next); localStorage.setItem(`friends-table:${code}:result`, JSON.stringify(next)); }).catch((e) => setError(e.message));
  }, [code]);
  const { ranked, squidKing, biggestLoser } = useMemo(() => nightAwards(summaries), [summaries]);
  if (!ranked.length) return <div className="loading pulse">正在生成今晚战报…{error && <span>{error}</span>}</div>;
  return <div className="page"><div className="brand">FRIENDS TABLE · {code}</div><h1 className="display" style={{ fontSize: 42 }}>今晚朋友局</h1>
    <div className="card" style={{ marginBottom: 14, textAlign: "center" }}><div style={{ fontSize: 28 }}>🏆</div><div className="section-title">今晚总冠军</div><h2 style={{ fontSize: 30, margin: 4 }}>{ranked[0].nickname}</h2><strong className="positive" style={{ fontSize: 22 }}>+{money.format(ranked[0].totalProfit)}</strong><div className="hint-row" style={{ justifyContent: "center", marginTop: 12 }}><span className="hint">扑克 {ranked[0].pokerProfit >= 0 ? "+" : ""}{money.format(ranked[0].pokerProfit)}</span><span className="hint">鱿鱼 {ranked[0].squidProfit >= 0 ? "+" : ""}{money.format(ranked[0].squidProfit)}</span></div></div>
    <div className="card"><h3 style={{ marginTop: 0 }}>全员结果</h3>{ranked.map((player, index) => <div className="settlement-row" key={player.playerId}><span>{index + 1}　<strong>{player.nickname}</strong></span><strong className={player.totalProfit >= 0 ? "positive" : "negative"}>{player.totalProfit >= 0 ? "+" : ""}{money.format(player.totalProfit)}</strong></div>)}</div>
    <div className="button-row" style={{ marginTop: 14 }}><div className="card" style={{ textAlign: "center" }}><div>🦑 鱿鱼王</div><strong>{squidKing?.nickname}</strong><div className="positive">{squidKing && squidKing.squidProfit >= 0 ? "+" : ""}{money.format(squidKing?.squidProfit ?? 0)}</div></div><div className="card" style={{ textAlign: "center" }}><div>💀 今晚最大输家</div><strong>{biggestLoser?.nickname}</strong><div className="negative">{money.format(biggestLoser?.totalProfit ?? 0)}</div></div></div>
    <Link className="button button-primary" style={{ width: "100%", marginTop: 14 }} href="/create">再开一桌</Link>
  </div>;
}
