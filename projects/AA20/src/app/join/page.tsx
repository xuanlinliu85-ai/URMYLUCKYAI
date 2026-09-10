"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function JoinPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  return <main className="app-shell"><div className="page">
    <div className="topbar"><Link href="/" className="back">← 返回</Link><span className="brand">FRIENDS TABLE</span></div>
    <section className="hero" style={{ minHeight: "70svh" }}><div className="card">
      <h1 style={{ marginTop: 0 }}>输入房间码</h1>
      <p className="lede">群里的邀请链接可以直接打开，也可以输入 6 位房间码。</p>
      <div className="field"><label htmlFor="code">房间码</label><input id="code" className="input" value={code} maxLength={6} autoCapitalize="characters" onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ""))} placeholder="例如 8K7F2A" /></div>
      <button className="button button-primary" style={{ width: "100%" }} disabled={code.length < 5} onClick={() => router.push(`/room/${code}`)}>进入朋友局</button>
    </div></section>
  </div></main>;
}
