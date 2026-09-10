"use client";

import { useMemo, useState } from "react";

type Fund = {
  code: string;
  name: string;
  role: string;
  risk: string;
  aum: string;
  manager: string;
  company: string;
  reason: string;
};

const funds: Record<string, Fund> = {
  cash: { code: "000198.OF", name: "天弘余额宝货币", role: "现金管理", risk: "低", aum: "6,799.46 亿", manager: "田瑶 / 刘莹 / 王昌俊", company: "天弘基金", reason: "承担流动性与备用金角色，不追求高收益。" },
  shortBond: { code: "004672.OF", name: "华夏短债A", role: "短债底仓", risk: "中低", aum: "50.26 亿", manager: "刘明宇", company: "华夏基金", reason: "一年以下债券基准，作为低波动稳定器。" },
  mediumBond: { code: "006668.OF", name: "华夏中短债A", role: "固收核心", risk: "中低", aum: "72.81 亿", manager: "刘明宇 / 张海静", company: "华夏基金", reason: "1–3 年中短债基准，补充组合票息与稳定性。" },
  hs300: { code: "000051.OF", name: "华夏沪深300ETF联接A", role: "核心权益", risk: "中高", aum: "125.99 亿", manager: "赵宗庭", company: "华夏基金", reason: "覆盖大盘核心资产，承担组合长期权益 Beta。" },
  csi500: { code: "000478.OF", name: "建信中证500指数增强A", role: "成长卫星", risk: "高", aum: "27.77 亿", manager: "叶乐天", company: "建信基金", reason: "补充中盘成长暴露，仓位受风险预算约束。" },
  gold: { code: "000216.OF", name: "华安易富黄金ETF联接A", role: "黄金对冲", risk: "中高", aum: "97.22 亿", manager: "许之彦", company: "华安基金", reason: "用于分散权益与宏观风险，不作为收益主引擎。" },
  overseas: { code: "006327.OF", name: "易方达中证海外中国互联网50ETF联接(QDII)A", role: "海外卫星", risk: "高", aum: "59.03 亿", manager: "余海燕", company: "易方达基金", reason: "提供境外互联网资产暴露，受汇率与海外市场波动影响。" },
};

const basePortfolios = [
  { label: "稳健防守", expected: "控制回撤优先", weights: { cash: 15, shortBond: 35, mediumBond: 25, hs300: 15, gold: 10 } },
  { label: "均衡增长", expected: "增长与稳定平衡", weights: { cash: 5, shortBond: 20, mediumBond: 15, hs300: 25, csi500: 15, gold: 10, overseas: 10 } },
  { label: "进取增长", expected: "接受波动换取长期增长", weights: { cash: 5, shortBond: 10, hs300: 30, csi500: 25, gold: 10, overseas: 20 } },
];

const steps = ["资金情况", "个人信息", "风险评估", "配置结果"];

function money(value: number) {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 }).format(value);
}

export function ClientFundAllocator() {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("王先生");
  const [amount, setAmount] = useState(100);
  const [liquidity, setLiquidity] = useState(10);
  const [age, setAge] = useState(38);
  const [horizon, setHorizon] = useState(5);
  const [goal, setGoal] = useState("长期财富增值");
  const [income, setIncome] = useState("稳定");
  const [experience, setExperience] = useState("有基金投资经验");
  const [risk, setRisk] = useState(1);
  const [maxDrawdown, setMaxDrawdown] = useState(15);
  const [reaction, setReaction] = useState("继续持有并观察");
  const [selectedFund, setSelectedFund] = useState<string | null>(null);

  const riskProfile = useMemo(() => {
    let score = risk;
    if (horizon >= 7 && maxDrawdown >= 20) score += 1;
    if (horizon <= 2 || maxDrawdown <= 10 || age >= 60) score -= 1;
    if (reaction === "立即全部赎回" || income === "不稳定") score -= 1;
    return Math.max(0, Math.min(2, score));
  }, [risk, horizon, maxDrawdown, age, reaction, income]);

  const recommendation = useMemo(() => {
    const base = basePortfolios[riskProfile];
    const entries = Object.entries(base.weights).map(([key, weight]) => ({ key, weight: Number(weight) }));
    const baseCash = entries.find((item) => item.key === "cash")?.weight ?? 0;
    const desiredCash = Math.max(baseCash, liquidity);
    const extraCash = desiredCash - baseCash;
    const reducible = entries.filter((item) => item.key !== "cash");
    const totalReducible = reducible.reduce((sum, item) => sum + item.weight, 0);
    return entries.map((item) => {
      const adjusted = item.key === "cash" ? desiredCash : item.weight - extraCash * item.weight / totalReducible;
      const rounded = Math.round(adjusted * 10) / 10;
      return { ...funds[item.key], key: item.key, weight: rounded, amount: amount * rounded / 100 };
    });
  }, [riskProfile, liquidity, amount]);

  const equityWeight = recommendation.filter((item) => ["hs300", "csi500", "overseas"].includes(item.key)).reduce((sum, item) => sum + item.weight, 0);
  const bondWeight = recommendation.filter((item) => ["shortBond", "mediumBond"].includes(item.key)).reduce((sum, item) => sum + item.weight, 0);
  const profile = basePortfolios[riskProfile];

  function next() {
    setStep((current) => Math.min(3, current + 1));
  }

  return <section className="allocator" aria-label="客户基金配置工具">
    <div className="allocator-steps">
      {steps.map((label, index) => <button key={label} className={index === step ? "active" : index < step ? "done" : ""} disabled={index > step} onClick={() => index <= step && setStep(index)}><span>{index < step ? "✓" : index + 1}</span><strong>{label}</strong></button>)}
    </div>

    <div className="allocator-body">
      {step === 0 && <div className="allocator-page">
        <header><span>STEP 1 · CAPITAL</span><h2>这笔钱，准备怎么用？</h2><p>先区分可投资资金与短期要用的钱。只有真正可以承受波动的部分，才进入基金配置。</p></header>
        <div className="amount-card"><label>计划配置金额</label><div><span>¥</span><input aria-label="计划配置金额（万元）" type="number" min="10" max="5000" value={amount} onChange={(event) => setAmount(Math.max(10, Number(event.target.value)))} /><b>万元</b></div><input aria-label="拖动调整配置金额" type="range" min="10" max="1000" step="10" value={Math.min(amount, 1000)} onChange={(event) => setAmount(Number(event.target.value))} /><small>本工具不会保存你的姓名或资金数据</small></div>
        <div className="allocator-fields two">
          <label><span>一年内可能需要使用</span><select value={liquidity} onChange={(event) => setLiquidity(Number(event.target.value))}><option value="5">很少使用（预留 5%）</option><option value="10">可能使用（预留 10%）</option><option value="20">有明确支出（预留 20%）</option><option value="30">流动性要求高（预留 30%）</option></select></label>
          <label><span>主要投资目标</span><select value={goal} onChange={(event) => setGoal(event.target.value)}><option>长期财富增值</option><option>退休养老储备</option><option>子女教育资金</option><option>购房及大额支出</option><option>闲置资金稳健增值</option></select></label>
        </div>
        <div className="allocator-summary"><span>可配置资金</span><strong>{money(amount * (100 - liquidity) / 100)} 万元</strong><small>另预留 {money(amount * liquidity / 100)} 万元用于流动性管理</small></div>
      </div>}

      {step === 1 && <div className="allocator-page">
        <header><span>STEP 2 · PERSONAL CONTEXT</span><h2>同样的钱，对不同的人不是同一种配置。</h2><p>年龄、收入稳定性、投资期限和经验共同决定你能承担的权益比例。</p></header>
        <div className="allocator-fields two">
          <label><span>客户称呼</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：王先生" /></label>
          <label><span>年龄</span><div className="field-with-unit"><input type="number" min="18" max="80" value={age} onChange={(event) => setAge(Number(event.target.value))} /><b>岁</b></div></label>
          <label><span>计划投资期限</span><select value={horizon} onChange={(event) => setHorizon(Number(event.target.value))}><option value="1">1 年以内</option><option value="2">1–2 年</option><option value="3">3–5 年</option><option value="5">5–7 年</option><option value="8">7 年以上</option></select></label>
          <label><span>收入与现金流</span><select value={income} onChange={(event) => setIncome(event.target.value)}><option>稳定</option><option>较稳定</option><option>不稳定</option><option>已退休</option></select></label>
          <label><span>基金投资经验</span><select value={experience} onChange={(event) => setExperience(event.target.value)}><option>没有基金投资经验</option><option>只买过货币或债券基金</option><option>有基金投资经验</option><option>熟悉股票与基金波动</option></select></label>
          <label><span>资金目标</span><input value={goal} onChange={(event) => setGoal(event.target.value)} /></label>
        </div>
        <div className="profile-preview"><div><span>{name || "客户"}</span><strong>{age} 岁 · {horizon} 年期限</strong></div><div><span>现金流</span><strong>{income}</strong></div><div><span>经验</span><strong>{experience}</strong></div></div>
      </div>}

      {step === 2 && <div className="allocator-page">
        <header><span>STEP 3 · RISK CAPACITY</span><h2>你愿意冒险，和你能够冒险，是两件事。</h2><p>系统会用较保守的一侧确定最终风险档位，避免只根据“想赚多少”提高权益仓位。</p></header>
        <div className="risk-options">{["稳健", "均衡", "进取"].map((label, index) => <button key={label} className={risk === index ? "selected" : ""} onClick={() => setRisk(index)}><span>R{index + 2}</span><strong>{label}</strong><small>{["本金稳定优先", "接受适度波动", "追求长期增长"][index]}</small></button>)}</div>
        <div className="allocator-fields two">
          <label><span>可接受的最大阶段回撤</span><select value={maxDrawdown} onChange={(event) => setMaxDrawdown(Number(event.target.value))}><option value="5">不超过 5%</option><option value="10">约 10%</option><option value="15">约 15%</option><option value="20">约 20%</option><option value="30">可接受 30%</option></select></label>
          <label><span>如果组合短期下跌 15%</span><select value={reaction} onChange={(event) => setReaction(event.target.value)}><option>立即全部赎回</option><option>卖出一部分降低风险</option><option>继续持有并观察</option><option>如果逻辑未变会继续投入</option></select></label>
        </div>
        <div className="risk-result"><span>综合风险档位</span><strong>{profile.label}</strong><p>依据：主动选择 {['稳健','均衡','进取'][risk]}；期限 {horizon} 年；最大回撤 {maxDrawdown}%；年龄 {age} 岁；现金流{income}。</p><em>系统采用风险意愿与风险承受能力中更保守的一侧。</em></div>
      </div>}

      {step === 3 && <div className="allocator-page result-page">
        <header><span>STEP 4 · PERSONAL FUND PORTFOLIO</span><h2>{name || "客户"}的基金配置建议</h2><p>{profile.label} · {profile.expected} · 配置金额 {money(amount)} 万元。以下基金资料来自 iFinD，组合为规则演示，需要适当性与人工复核后执行。</p></header>
        <div className="result-overview"><div><span>权益类</span><strong>{money(equityWeight)}%</strong><i><b style={{ width: `${equityWeight}%` }} /></i></div><div><span>固收类</span><strong>{money(bondWeight)}%</strong><i><b style={{ width: `${bondWeight}%` }} /></i></div><div><span>黄金</span><strong>10%</strong><i><b style={{ width: "10%" }} /></i></div><div><span>流动性</span><strong>{Math.max(liquidity, riskProfile === 0 ? 15 : 5)}%</strong><i><b style={{ width: `${Math.max(liquidity, riskProfile === 0 ? 15 : 5)}%` }} /></i></div></div>
        <div className="fund-plan"><div className="fund-plan-head"><span>具体基金</span><span>组合角色</span><span>比例</span><span>金额</span><span>风险</span></div>{recommendation.map((item) => <button key={item.code} className={selectedFund === item.code ? "expanded" : ""} onClick={() => setSelectedFund(selectedFund === item.code ? null : item.code)}><div><strong>{item.name}</strong><small>{item.code} · {item.company}</small></div><span>{item.role}</span><b>{money(item.weight)}%</b><em>{money(item.amount)} 万</em><i data-risk={item.risk}>{item.risk}</i>{selectedFund === item.code && <aside><p>{item.reason}</p><span>基金规模：{item.aum}</span><span>基金经理：{item.manager}</span><span>数据源：iFinD MCP · 2026-08-18</span></aside>}</button>)}</div>
        <div className="allocation-logic"><strong>为什么这样配</strong><ol><li>预留 {liquidity}% 流动性，不把短期要用的钱暴露在市场波动中。</li><li>用沪深300承担核心权益，中证500与海外互联网仅作为高波动卫星仓位。</li><li>短债和中短债构成稳定底仓，黄金用于分散单一权益风险。</li><li>具体基金先经过存续、规模、历史与角色筛选，再进入客户适配。</li></ol></div>
        <div className="suitability-warning"><strong>重要说明</strong><p>这是一套产品交互原型和规则化配置示例，不构成保证收益或直接交易指令。真实执行前还需核验最新净值、费率、申赎限制、风险等级、客户适当性及完整基金合同。</p></div>
      </div>}

      <footer className="allocator-actions">{step > 0 && <button className="back" onClick={() => setStep(step - 1)}>← 返回修改</button>}<div /><span>第 {step + 1} / 4 步</span>{step < 3 ? <button className="next" onClick={next}>{step === 2 ? "生成我的基金配置" : "保存并继续"} →</button> : <button className="next" onClick={() => setStep(0)}>重新配置</button>}</footer>
    </div>
  </section>;
}
