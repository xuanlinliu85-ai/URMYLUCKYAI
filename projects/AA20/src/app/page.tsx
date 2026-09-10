import Link from "next/link";

export default function HomePage() {
  return <main className="app-shell"><div className="page">
    <section className="hero">
      <div className="brand">FRIENDS TABLE</div>
      <h1 className="display">今晚<br />开一桌</h1>
      <p className="lede">朋友德扑，鱿鱼自动记。发个链接，坐下就玩。</p>
      <div className="stack" style={{ marginTop: 28 }}>
        <Link className="button button-primary" href="/create">创建朋友局</Link>
        <Link className="button button-secondary" href="/join">输入房间码</Link>
      </div>
    </section>
    <div className="hint-row"><span className="hint">无需注册</span><span className="hint">2–7 人</span><span className="hint">微信内直接打开</span><span className="hint">纯娱乐积分</span></div>
  </div></main>;
}
