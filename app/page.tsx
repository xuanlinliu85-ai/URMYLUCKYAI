"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import RefreshControl from "./RefreshControl";

type Cell = { raw: string | null; display: string };
type Signal = { label: string; count: string };
type TabData = {id:number;name:string;nav:string[];summary:{value:string;label:string}[];signals:Signal[];headers:string[];rows:Cell[][]};
type Snapshot = {snapshotDate:string;title:string;sourceUpdatedAt:string;sourceMode?:string;sourceAudit?:{ifind?:{status:string;message?:string}};tabs:TabData[]};
type Candle = {date:string;open:number;close:number;high:number;low:number;volume:number};
type MarketItem = {code:string;name:string;price:number;change:number;turnover:number;market?:"sh"|"sz"|"bj"};
type MarketData = {asOf:string;tradeDate?:string;indexes:MarketItem[];sectors:MarketItem[];turnoverTop:MarketItem[];breadth:{total:number;up:number;flat:number;down:number;buckets:{label:string;count:number}[]}};

const PAGE_SIZE=50;
function navPart(item:string){const match=item.match(/^(.*?)([+\-]?\d[\d.]*%?|\d+日)$/);return match?{label:match[1].trim(),value:match[2]}:{label:item,value:""}}
function tone(value:string){return value.startsWith("+")?"positive":value.startsWith("-")?"negative":""}
function normalizedQuoteCode(symbol:string,suffix:string){
  const market=suffix.toUpperCase(),clean=symbol.replace(/^@/,"");
  if(["SH","SZ","BJ"].includes(market))return `${market.toLowerCase()}${clean}`;
  if(market==="HK")return `hk${/^\d+$/.test(clean)?clean.padStart(5,"0"):clean}`;
  if(market==="OF")return `${/^[56]/.test(clean)?"sh":"sz"}${clean}`;
  if(market==="CSI")return `sh${clean}`;
  if(market==="TI")return `ti${clean}`;
  if(market==="GI"&&clean==="NDX")return "usNDX";
  if(market==="NQI"&&symbol.toUpperCase()==="@CCO")return "usIXIC";
  return "";
}
function instrument(row?:Cell[]){
  const text=row?.map(cell=>cell.display).find(value=>/(?:sh|sz|bj|hk|ti|us)\w+|[@A-Za-z0-9]+\.[A-Z]+\b/i.test(value))||row?.[1]?.display||"";
  const prefix=text.match(/(?:sh|sz|bj|hk|ti|us)\w+/i)?.[0]||"";
  const suffix=text.match(/([@A-Za-z0-9]+)\.([A-Z]+)\b/i);
  const code=prefix||(suffix?normalizedQuoteCode(suffix[1],suffix[2]):"");
  return {name:text.replace(prefix||suffix?.[0]||"","").trim(),code};
}

function aggregateCandles(rows:Candle[],period:"week"|"month"){
  const groups=new Map<string,Candle[]>();
  rows.forEach(row=>{
    const date=new Date(`${row.date}T00:00:00Z`);
    let key=row.date.slice(0,7);
    if(period==="week"){const day=date.getUTCDay()||7;date.setUTCDate(date.getUTCDate()-day+1);key=date.toISOString().slice(0,10)}
    groups.set(key,[...(groups.get(key)||[]),row]);
  });
  return [...groups.values()].map(group=>({
    date:group.at(-1)!.date,open:group[0].open,close:group.at(-1)!.close,
    high:Math.max(...group.map(item=>item.high)),low:Math.min(...group.map(item=>item.low)),
    volume:group.reduce((sum,item)=>sum+item.volume,0)
  }));
}

function normalizeTradingDate(value:string){
  const match=value.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  return match?`${match[1]}-${match[2].padStart(2,"0")}-${match[3].padStart(2,"0")}`:"";
}

function requireFreshCandles(candles:Candle[],expectedDate:string,source:string){
  const expected=normalizeTradingDate(expectedDate),latest=normalizeTradingDate(candles.at(-1)?.date||"");
  if(!candles.length)throw new Error(`${source}未返回K线`);
  if(expected&&latest!==expected)throw new Error(`${source}最新K线为${latest||"未知日期"}，需要${expected}`);
  return candles;
}

async function fetchTencentCandles(code:string,period:"day"|"week"|"month"){
  if(code.startsWith("ti"))throw new Error("Tencent industry unsupported");
  const url=`https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${encodeURIComponent(code)},day,,,250,qfq`;
  const response=await fetch(url,{cache:"no-store"});
  if(!response.ok)throw new Error(`HTTP ${response.status}`);
  const payload=await response.json();
  const node=payload?.data?.[code]||{};
  const rows=node.qfqday||node.day||[];
  const daily:Candle[]=rows.map((row:string[])=>({
    date:row[0],open:Number(row[1]),close:Number(row[2]),high:Number(row[3]),low:Number(row[4]),volume:Number(row[5])
  })).filter((item:Candle)=>item.date&&[item.open,item.close,item.high,item.low,item.volume].every(Number.isFinite));
  return period==="day"?daily:aggregateCandles(daily,period);
}

async function fetchThsCandles(code:string,period:"day"|"week"|"month"){
  const market=code.slice(0,2).toLowerCase(),symbol=code.slice(2);
  if(!["sh","sz","bj","ti"].includes(market)||!/^\d+$/.test(symbol))throw new Error("THS unsupported");
  const quoteId=market==="ti"?`48_${symbol}`:`hs_${symbol}`;
  const response=await fetch(`https://d.10jqka.com.cn/v6/line/${quoteId}/01/last1800.js`,{cache:"no-store"});
  if(!response.ok)throw new Error(`THS HTTP ${response.status}`);
  const source=await response.text(),start=source.indexOf("("),end=source.lastIndexOf(")");
  if(start<0||end<=start)throw new Error("THS payload invalid");
  const payload=JSON.parse(source.slice(start+1,end));
  const daily:Candle[]=String(payload?.data||"").split(";").map((line:string)=>{
    const row=line.split(","),date=row[0]||"";
    return {date:date.length===8?`${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}`:date,open:Number(row[1]),high:Number(row[2]),low:Number(row[3]),close:Number(row[4]),volume:Number(row[5])};
  }).filter((item:Candle)=>item.date&&[item.open,item.close,item.high,item.low,item.volume].every(Number.isFinite));
  if(!daily.length)throw new Error("THS candles unavailable");
  return period==="day"?daily:aggregateCandles(daily,period);
}

async function fetchPreferredCandles(code:string,period:"day"|"week"|"month",expectedDate=""){
  const failures:string[]=[];
  try{
    const response=await fetch(`/api/kline?code=${encodeURIComponent(code)}&period=${period}&days=250`,{cache:"no-store"});
    if(!response.ok)throw new Error(`iFinD API HTTP ${response.status}`);
    const payload=await response.json();
    const candles=requireFreshCandles(payload.candles||[],expectedDate,payload.source||"iFinD");
    return {candles,source:`${payload.source||"iFinD MCP"} · 当日日期已校验`};
  }catch(error){failures.push(error instanceof Error?error.message:String(error))}
  try{
    const candles=requireFreshCandles(await fetchThsCandles(code,period),expectedDate,"同花顺");
    return {candles,source:"同花顺行情 · 当日日期已校验"};
  }catch(error){failures.push(error instanceof Error?error.message:String(error))}
  try{
    const candles=requireFreshCandles(await fetchTencentCandles(code,period),expectedDate,"腾讯");
    return {candles,source:"腾讯行情（同花顺缺当日数据后回退）· 当日日期已校验"};
  }catch(error){failures.push(error instanceof Error?error.message:String(error))}
  throw new Error(failures.join("；"));
}

export default function Home(){
  const [data,setData]=useState<Snapshot|null>(null);
  const [module,setModule]=useState<"rank"|"review">("review");
  const [tabIndex,setTabIndex]=useState(0);
  const [query,setQuery]=useState("");
  const [activeSignal,setActiveSignal]=useState("");
  const [sortCol,setSortCol]=useState(0);
  const [sortDesc,setSortDesc]=useState(false);
  const [page,setPage]=useState(1);
  const [sourceOpen,setSourceOpen]=useState(false);
  const [selected,setSelected]=useState({name:"科创综指",code:"sh000688"});

  useEffect(()=>{
    let disposed=false;
    const refresh=()=>{
      const version=Date.now();
      fetch(`/dashboard-snapshot.json?v=${version}`,{cache:"no-store"}).then(r=>r.ok?r.json():Promise.reject(new Error(`dashboard HTTP ${r.status}`))).then(dashboard=>{if(!disposed)setData(dashboard)}).catch(()=>{});
    };
    const onVisible=()=>{if(document.visibilityState==="visible")refresh()};
    refresh();
    const timer=window.setInterval(refresh,5*60*1000);
    window.addEventListener("focus",refresh);
    document.addEventListener("visibilitychange",onVisible);
    return ()=>{disposed=true;window.clearInterval(timer);window.removeEventListener("focus",refresh);document.removeEventListener("visibilitychange",onVisible)};
  },[]);
  const tab=data?.tabs[tabIndex];
  const rankHasKline=Boolean(tab&&["沪深300","中证800","港股通"].some(name=>tab.name.startsWith(name)));
  const filtered=useMemo(()=>{
    if(!tab)return [];
    const signalColumn=tab.headers.findIndex(header=>header.includes("异动信号"));
    return [...tab.rows].filter(row=>{
      const searchText=row.map(c=>c.display).join(" ").toLowerCase();
      return (!query||searchText.includes(query.toLowerCase()))&&(!activeSignal||(row[signalColumn]?.display||"").includes(activeSignal));
    }).sort((a,b)=>{
      const av=a[sortCol]?.raw??a[sortCol]?.display??"",bv=b[sortCol]?.raw??b[sortCol]?.display??"";
      const an=Number(av),bn=Number(bv);
      const result=Number.isFinite(an)&&Number.isFinite(bn)?an-bn:String(av).localeCompare(String(bv),"zh-CN");
      return sortDesc?-result:result;
    });
  },[tab,query,activeSignal,sortCol,sortDesc]);
  const pageCount=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
  const shown=filtered.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE);
  const selectTab=(index:number)=>{setTabIndex(index);setQuery("");setActiveSignal("");setSortCol(0);setSortDesc(false);setPage(1);const first=data?.tabs[index]?.rows[0];if(first)setSelected(instrument(first))};
  const selectSignal=(label:string)=>{setActiveSignal(v=>v===label?"":label);setPage(1)};
  const sortBy=(index:number)=>{if(sortCol===index)setSortDesc(v=>!v);else{setSortCol(index);setSortDesc(false)};setPage(1)};
 if(!data)return <main className="loading"><div className="loader"/><p>正在校验数据快照…</p></main>;
 const totalRows=data.tabs.reduce((sum,item)=>sum+item.rows.length,0);
  const ifindReady=data.sourceAudit?.ifind?.status==="ready";

  return <main>
    <header className="masthead">
      <div className="brand"><span className="brandMark">U</span><div><h1>URMYLUCKY 复盘</h1><p>A股全市场研究工作台</p></div></div>
      <div className="headStatus"><span className="statusDot"/> 数据已校验并自动刷新<b>{data.snapshotDate} 收盘</b><a href="/monitor/macro" style={{color:"#2563eb",textDecoration:"none",fontWeight:600}}>宏观监测台 →</a><RefreshControl snapshotDate={data.snapshotDate}/><button onClick={()=>setSourceOpen(v=>!v)}>{sourceOpen?"收起口径":"数据源状态"}</button></div>
    </header>
    {sourceOpen&&<section className="sourceStrip">
      <div><span>二代机 · {data.snapshotDate}</span><b>{totalRows.toLocaleString()} 条线上重建排名记录</b><small>仅使用线上行情；不读取桌面日报或成交汇总文件</small></div>
      <div><span>行情链路</span><b>{ifindReady?"iFinD MCP 校验 · 新浪全A · 同花顺历史日线 · 腾讯跨市场":"新浪全A · 同花顺历史日线 · 腾讯跨市场 · iFinD待授权"}</b><small>{ifindReady?"iFinD实时与历史样本已通过；所有模块继续执行交易日与覆盖率校验":"iFinD授权前继续使用现有线上源；不读取桌面日报或成交汇总文件"}</small></div>
    </section>}

    <div className="workspace">
      <aside>
        <div className="asideLabel">MARKET WORKSPACE</div>
        <button className={module==="rank"?"active":""} onClick={()=>setModule("rank")}><span className="moduleIcon">R2</span><span><b>二代机</b><small>多因子排名与真实 K 线</small></span><em>{totalRows.toLocaleString()}</em></button>
        <button className={module==="review"?"active":""} onClick={()=>setModule("review")}><span className="moduleIcon">DR</span><span><b>每日复盘</b><small>指数、板块、涨跌、前十K线与一图流</small></span><em>LIVE</em></button>
        <a className="modLink" href="/monitor/macro" title="宏观高频监测工作台：利率、权益、汇率、通胀、信用、地产与期货全产业链，含每日汇报"><span className="moduleIcon">MF</span><span><b>宏观高频监测</b><small>利率 · 权益 · 汇率 · 期货全链 · 每日汇报</small></span><em>LIVE</em></a>
        <div className="asideFoot"><span className="pulseDot"/> MARKET READY<small>交易日数据自动校验</small></div>
      </aside>

      <section className="content">
        {module==="rank"&&tab?<>
          <div className="contentHead"><div><span className="eyebrow">RANK MACHINE</span><h2>二代机</h2><p>复合因子截面评分 · {data.snapshotDate}</p></div></div>
          <nav className="assetTabs" aria-label="排名范围">{data.tabs.map((item,index)=><button key={item.id} className={tabIndex===index?"active":""} onClick={()=>selectTab(index)}>{item.name}<span>{item.rows.length||"—"}</span></button>)}</nav>
          {tab.rows.length?<>
            <section className="metricGrid">
              {tab.nav.slice(0,6).map(item=>{const p=navPart(item);return <article key={item}><span>{p.label}</span><strong className={tone(p.value)}>{p.value}</strong></article>})}
              <article className="breadth"><span>当日广度</span><div>{tab.summary.slice(0,4).map(s=><i key={s.label}><b>{s.value}</b>{s.label}</i>)}</div></article>
            </section>
            {rankHasKline&&<KlinePanel instrument={selected} expectedDate={data.snapshotDate}/>}
            <section className="rankPanel">
              <div className="toolbar"><div><span className="eyebrow">CROSS-SECTION RANKING</span><h3>{tab.name} · {rankHasKline?"点击标的查看 K 线":"排名与异动信号"} · 信号截至 {data.snapshotDate}</h3></div><div className="tools"><div className="signalFilters">{tab.signals.map(sig=><button key={sig.label} title={`${sig.label}：${sig.count}只；截至${data.snapshotDate}`} className={activeSignal===sig.label?"active":""} onClick={()=>selectSignal(sig.label)}>{sig.label}<b>{sig.count}只</b></button>)}</div><input aria-label="搜索名称或代码" value={query} onChange={e=>{setQuery(e.target.value);setPage(1)}} placeholder="搜索名称 / 代码"/></div></div>
              <div className="tableWrap"><table><thead><tr>{tab.headers.map((header,index)=><th key={`${header}-${index}`} onClick={()=>sortBy(index)} className={sortCol===index?"sorted":""}>{header.replace("▼","").trim()} {sortCol===index?<i>{sortDesc?"↓":"↑"}</i>:null}</th>)}</tr></thead>
                <tbody>{shown.map((row,rowIndex)=>{const ins=instrument(row);return <tr key={`${page}-${rowIndex}`} className={rankHasKline&&selected.code===ins.code?"selectedRow":""} onClick={rankHasKline?()=>setSelected(ins):undefined}>{row.map((cell,index)=><td key={index} className={index===2?(Number(cell.raw)>=0?"positive":"negative"):""}><span>{cell.display||"—"}</span>{cell.raw!==null&&index>1&&<small>raw {cell.raw}</small>}</td>)}</tr>})}</tbody>
              </table></div>
              <div className="pager"><span>共 <b>{filtered.length.toLocaleString()}</b> 条 · 第 {page}/{pageCount} 页</span><div><button disabled={page===1} onClick={()=>setPage(p=>Math.max(1,p-1))}>上一页</button><button disabled={page===pageCount} onClick={()=>setPage(p=>Math.min(pageCount,p+1))}>下一页</button></div></div>
            </section>
          </>:<section className="emptyState"><b>日报摘要</b><p>原文件该页为文字型汇总，不包含排名表和证券代码。</p></section>}
        </>:<MarketDashboard/>}
      </section>
    </div>
    <footer><span>URMYLUCKY / MARKET REVIEW</span><span>二代机 · 每日复盘</span><span>线上行情 · 交易日校验 · 真实 OHLC</span></footer>
  </main>
}

function KlinePanel({instrument,expectedDate}:{instrument:{name:string;code:string};expectedDate:string}){
  const [period,setPeriod]=useState<"day"|"week"|"month">("day");
  const [days,setDays]=useState(90);
  const [candles,setCandles]=useState<Candle[]>([]);
  const [source,setSource]=useState("同花顺行情");
  const [failure,setFailure]=useState("");
  const [state,setState]=useState<"loading"|"ready"|"unsupported"|"error">("loading");
  useEffect(()=>{
    if(!/^(sh|sz|bj|hk|ti|us)\w+$/i.test(instrument.code)){setState("unsupported");setCandles([]);return}
    setState("loading");setFailure("");
    fetchPreferredCandles(instrument.code,period,expectedDate)
      .then(result=>{setCandles(result.candles);setSource(result.source);setState(result.candles.length?"ready":"unsupported")})
      .catch(error=>{setCandles([]);setFailure(error instanceof Error?error.message:String(error));setState("error")});
  },[instrument.code,period,expectedDate]);
  const view=candles.slice(-days);
  const last=view.at(-1);
  return <section className="klinePanel">
    <div className="klineHead"><div><span className="eyebrow">TECHNICAL CHART</span><h3>{instrument.name} <small>{instrument.code}</small></h3></div>
      <div className="chartControls">
        <div className="kPeriods">{([["day","日K"],["week","周K"],["month","月K"]] as const).map(([key,label])=><button key={key} className={period===key?"active":""} onClick={()=>setPeriod(key)}>{label}</button>)}</div>
        <div className="periods">{[30,60,90,120].map(n=><button key={n} className={days===n?"active":""} onClick={()=>setDays(n)}>{n}</button>)}</div>
        <span className="adjustBadge">前复权</span>
      </div>
    </div>
    {state==="ready"&&last?<CandlestickCanvas candles={view} source={source}/>:
      <div className="chartMessage">{state==="loading"?`正在校验 ${normalizeTradingDate(expectedDate)||expectedDate} 收盘 K 线…`:state==="unsupported"?"该类别代码不支持证券 K 线，请点击 A 股、ETF、指数或港股标的。":`未通过当日K线校验，旧数据已停止展示。${failure}`}</div>}
  </section>
}

function movingAverage(candles:Candle[],period:number){
  return candles.map((_,index)=>{
    if(index<period-1)return null;
    return candles.slice(index-period+1,index+1).reduce((sum,item)=>sum+item.close,0)/period;
  });
}

function CandlestickCanvas({candles,source}:{candles:Candle[];source:string}){
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const [hover,setHover]=useState<number|null>(null);
  const maDefs=[{n:5,color:"#f1f1f1"},{n:10,color:"#f2cb4c"},{n:20,color:"#c778ff"},{n:30,color:"#4da7ff"},{n:60,color:"#34ce74"}];
  const averages=maDefs.map(def=>movingAverage(candles,def.n));
  const focus=hover===null?candles.length-1:hover;
  const current=candles[focus];
  const currentMas=averages.map(values=>values[focus]);

  useEffect(()=>{
    const canvas=canvasRef.current;if(!canvas||!candles.length)return;
    const rect=canvas.getBoundingClientRect(),dpr=window.devicePixelRatio||1;
    const W=Math.max(600,rect.width),H=430;
    canvas.width=W*dpr;canvas.height=H*dpr;
    const ctx=canvas.getContext("2d");if(!ctx)return;
    ctx.scale(dpr,dpr);ctx.clearRect(0,0,W,H);ctx.fillStyle="#080b0f";ctx.fillRect(0,0,W,H);
    // Keep the chart proportions and the right-side price scale close to a professional quote terminal.
    const L=10,R=68,T=16,priceBottom=300,volTop=318,volBottom=402,bottom=424;
    const plotW=W-L-R,priceH=priceBottom-T,volH=volBottom-volTop;
    const max=Math.max(...candles.map(c=>c.high))*1.012,min=Math.min(...candles.map(c=>c.low))*.988,range=Math.max(max-min,.0001);
    const maxVol=Math.max(...candles.map(c=>c.volume),1);
    const x=(i:number)=>L+(i+.5)*plotW/candles.length;
    const y=(v:number)=>T+(max-v)/range*priceH;
    ctx.strokeStyle="#252b31";ctx.lineWidth=.65;ctx.setLineDash([]);
    ctx.font="10px ui-monospace, monospace";ctx.fillStyle="#90979f";ctx.textAlign="left";
    for(let i=0;i<=4;i++){const py=T+i*priceH/4;ctx.beginPath();ctx.moveTo(L,py+.5);ctx.lineTo(W-R,py+.5);ctx.stroke();ctx.fillText((max-i*range/4).toFixed(2),W-R+8,py+3)}
    for(let i=0;i<=4;i++){const px=L+i*plotW/4;ctx.beginPath();ctx.moveTo(px+.5,T);ctx.lineTo(px+.5,volBottom);ctx.stroke()}
    ctx.beginPath();ctx.moveTo(L,volTop-8+.5);ctx.lineTo(W-R,volTop-8+.5);ctx.stroke();
    const slot=plotW/candles.length,bodyW=Math.max(2,Math.min(11,slot*.64));
    candles.forEach((c,i)=>{
      const rise=c.close>=c.open,color=rise?"#ef3b3b":"#00a65a",cx=x(i);
      ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(cx,y(c.high));ctx.lineTo(cx,y(c.low));ctx.stroke();
      const top=y(Math.max(c.open,c.close)),height=Math.max(1.2,Math.abs(y(c.open)-y(c.close)));
      if(rise){ctx.strokeRect(cx-bodyW/2,top,bodyW,height);if(height<2)ctx.fillRect(cx-bodyW/2,top,bodyW,1)}
      else ctx.fillRect(cx-bodyW/2,top,bodyW,height);
      const vh=c.volume/maxVol*volH;ctx.globalAlpha=.72;ctx.fillRect(cx-bodyW/2,volBottom-vh,bodyW,vh);ctx.globalAlpha=1;
    });
    ctx.textAlign="left";ctx.fillStyle="#8e959c";ctx.font="9px ui-monospace, monospace";ctx.fillText("成交量",L+4,volTop+4);
    maDefs.forEach((def,defIndex)=>{
      const values=averages[defIndex];ctx.strokeStyle=def.color;ctx.lineWidth=1.1;ctx.beginPath();let started=false;
      values.forEach((value,i)=>{if(value===null)return;const px=x(i),py=y(value);if(!started){ctx.moveTo(px,py);started=true}else ctx.lineTo(px,py)});
      ctx.stroke();
    });
    ctx.textAlign="center";ctx.fillStyle="#6e7884";ctx.font="9px ui-monospace, monospace";
    for(let i=0;i<6;i++){const idx=Math.min(candles.length-1,Math.round(i*(candles.length-1)/5));ctx.fillText(candles[idx].date.slice(2),x(idx),bottom)}
    if(hover!==null&&candles[hover]){
      const c=candles[hover],cx=x(hover),cy=y(c.close);ctx.strokeStyle="#aeb4ba";ctx.setLineDash([3,3]);ctx.lineWidth=.75;
      ctx.beginPath();ctx.moveTo(cx,T);ctx.lineTo(cx,volBottom);ctx.stroke();ctx.beginPath();ctx.moveTo(L,cy);ctx.lineTo(W-R,cy);ctx.stroke();ctx.setLineDash([]);
      const label=c.close.toFixed(2);ctx.font="10px ui-monospace, monospace";const tw=ctx.measureText(label).width+10;ctx.fillStyle=c.close>=c.open?"#ef3b3b":"#00a65a";ctx.fillRect(W-R,cy-9,tw,18);ctx.fillStyle="#fff";ctx.textAlign="left";ctx.fillText(label,W-R+5,cy+4);
    }
  },[candles,hover]);

  const locate=(clientX:number)=>{
    const canvas=canvasRef.current;if(!canvas)return;
    const rect=canvas.getBoundingClientRect(),L=8,R=64,plotW=rect.width-L-R;
    setHover(Math.max(0,Math.min(candles.length-1,Math.floor((clientX-rect.left-L)/plotW*candles.length))));
  };
  return <div className="thsChart">
    <div className="thsInfo">
      <span className="date">{current?.date}</span><span>开 <b>{current?.open}</b></span><span>高 <b>{current?.high}</b></span><span>低 <b>{current?.low}</b></span><span>收 <b className={current?.close>=current?.open?"riseText":"fallText"}>{current?.close}</b></span><span>量 <b>{current?.volume.toLocaleString()}</b></span>
      {maDefs.map((def,index)=><span key={def.n} style={{color:def.color}}>MA{def.n} <b>{currentMas[index]?.toFixed(2)??"—"}</b></span>)}
    </div>
    <canvas ref={canvasRef} onMouseMove={e=>locate(e.clientX)} onMouseLeave={()=>setHover(null)} onTouchMove={e=>{if(e.touches[0])locate(e.touches[0].clientX)}}/>
    <div className="indicatorTabs"><b>VOL</b><span>MACD</span><span>KDJ</span><span>RSI</span><span>BOLL</span><em>数据源：{source} · 红涨绿跌</em></div>
  </div>
}

function heatStyle(change:number){
  const strength=Math.min(.72,.16+Math.abs(change)*.08);
  return {background:change>0?`rgba(221,61,69,${strength})`:change<0?`rgba(0,159,105,${strength})`:"#222831"};
}
function money(value:number){return value>=1e8?`${(value/1e8).toFixed(1)}亿`:`${(value/1e4).toFixed(0)}万`}
const INDEX_NAMES:Record<string,string>={
  "000001":"上证指数","399001":"深证成指","399006":"创业板指","000016":"上证50","000300":"沪深300","000905":"中证500",
  "000852":"中证1000","000688":"科创50","399673":"创业板50","000510":"中证A500","000906":"中证800","000985":"中证全指",
  "399005":"中小100","399330":"深证100","399303":"国证2000","000922":"中证红利","000932":"中证消费","899050":"北证50"
};
function Heatmap({title,subtitle,items}:{title:string;subtitle:string;items:MarketItem[]}){
  return <section className="marketPanel"><div className="marketPanelHead"><div><span className="eyebrow">MARKET HEATMAP</span><h3>{title}</h3></div><small>{subtitle}</small></div><div className="heatmap">{items.map(item=><article key={item.code} style={heatStyle(item.change)} title={`${item.name} ${item.change.toFixed(2)}%`}><b>{item.name.replace(/ETF.*/,"ETF")}</b><strong>{item.change>=0?"+":""}{item.change.toFixed(2)}%</strong><small>{money(item.turnover)}</small></article>)}</div></section>
}
function SectorHeatmap({items}:{items:MarketItem[]}){
  const [mode,setMode]=useState<"all"|"up"|"down">("all");
  const shown=mode==="up"?items.filter(item=>item.change>0):mode==="down"?items.filter(item=>item.change<0):items;
  return <section className="marketPanel sectorPanorama">
    <div className="marketPanelHead"><div><span className="eyebrow">FULL INDUSTRY PANORAMA</span><h3>全行业板块热力图</h3></div><div className="heatFilters"><small>同花顺行业 · {items.length}个 · 含领涨与领跌</small>{([["all","全部"],["up","上涨"],["down","下跌"]] as const).map(([key,label])=><button key={key} className={mode===key?"active":""} onClick={()=>setMode(key)}>{label}</button>)}</div></div>
    <div className="heatmap">{shown.map(item=><article key={item.code} style={heatStyle(item.change)} title={`${item.name} ${item.change.toFixed(2)}%`}><b>{item.name}</b><strong>{item.change>=0?"+":""}{item.change.toFixed(2)}%</strong><small>{money(item.turnover)}</small></article>)}</div>
  </section>
}

function fitCompositeCandles(series:Candle[][]){
  const prepared=series.filter(rows=>rows.length).map(rows=>rows.slice(-250));
  const bases=prepared.map(rows=>rows[0].close||1);
  const dates=[...new Set(prepared.flatMap(rows=>rows.map(row=>row.date)))].sort();
  const maps=prepared.map(rows=>new Map(rows.map(row=>[row.date,row])));
  return dates.map(date=>{
    const values=maps.map((map,index)=>({row:map.get(date),base:bases[index]})).filter(item=>item.row) as {row:Candle;base:number}[];
    if(!values.length)return null;
    const average=(field:"open"|"close"|"high"|"low")=>values.reduce((sum,item)=>sum+item.row[field]/item.base*100,0)/values.length;
    return {date,open:average("open"),close:average("close"),high:average("high"),low:average("low"),volume:values.reduce((sum,item)=>sum+item.row.volume,0)};
  }).filter((item):item is Candle=>item!==null);
}

function CompositeTop10Kline({items,expectedDate}:{items:MarketItem[];expectedDate:string}){
  const [candles,setCandles]=useState<Candle[]>([]);
  const [days,setDays]=useState(90);
  const [state,setState]=useState<"loading"|"ready"|"error">("loading");
  useEffect(()=>{
    let active=true;setState("loading");
    Promise.all(items.map(item=>fetchPreferredCandles(`${item.market||"sz"}${item.code}`,"day",expectedDate)))
      .then(results=>{if(!active)return;const fitted=fitCompositeCandles(results.map(result=>result.candles));setCandles(fitted);setState(fitted.length?"ready":"error")})
      .catch(()=>active&&setState("error"));
    return()=>{active=false};
  },[items,expectedDate]);
  const view=candles.slice(-days);
  return <section className="klinePanel compositeKline">
    <div className="klineHead"><div><span className="eyebrow">EQUAL-WEIGHT SYNTHETIC K-LINE</span><h3>当日成交前十 · 等权拟合 K 线 <small>归一基点 100</small></h3></div><div className="chartControls"><div className="periods">{[30,60,90,120].map(n=><button key={n} className={days===n?"active":""} onClick={()=>setDays(n)}>{n}</button>)}</div><span className="adjustBadge">动态成分</span></div></div>
    {state==="ready"?<CandlestickCanvas candles={view} source="iFinD优先 · 当前成交前十等权拟合"/>:<div className="chartMessage">{state==="loading"?"正在拟合成交前十历史 K 线…":"成交前十拟合 K 线暂不可用"}</div>}
  </section>
}

function MarketDashboard(){
  const [market,setMarket]=useState<MarketData|null>(null);
  const [selected,setSelected]=useState<MarketItem|null>(null);
  const [state,setState]=useState<"loading"|"ready"|"error">("loading");
  useEffect(()=>{fetch("/market-snapshot.json",{cache:"no-store"}).then(r=>r.ok?r.json():Promise.reject()).then((result:MarketData)=>{setMarket(result);setSelected(result.turnoverTop[0]||null);setState("ready")}).catch(()=>setState("error"))},[]);
  if(state==="loading")return <section className="chartMessage">正在读取 A 股收盘快照…</section>;
  if(state==="error"||!market)return <section className="chartMessage">A 股收盘快照读取失败，请刷新页面；若仍未恢复，请运行每日数据更新。</section>;
  const tradeDate=market.tradeDate||normalizeTradingDate(market.asOf);
  const max=Math.max(...market.breadth.buckets.map(x=>x.count),1);
  return <>
    <div className="contentHead marketTitle"><div><span className="eyebrow">DAILY MARKET REVIEW</span><h2>每日复盘</h2><p>A股收盘快照 · {market.asOf} · 宽度/成交额：新浪财经 · 行业/K线：同花顺 · 指数时间戳：腾讯</p></div><div className="breadthPills"><b className="up">涨 {market.breadth.up}</b><b>平 {market.breadth.flat}</b><b className="down">跌 {market.breadth.down}</b></div></div>
    <div className="marketGrid"><Heatmap title="主要指数热力图" subtitle="18个核心指数 · 按成交额从大到小" items={market.indexes.map(item=>({...item,name:INDEX_NAMES[item.code]||item.name})).sort((a,b)=>b.turnover-a.turnover)}/><section className="marketPanel marketBrief"><div className="marketPanelHead"><div><span className="eyebrow">MARKET COVERAGE</span><h3>全 A 样本覆盖</h3></div><small>逐页拉取，不设5000只上限</small></div><div className="coverageStat"><b>{market.breadth.total.toLocaleString()}</b><span>只 A 股</span><i>涨 {market.breadth.up.toLocaleString()} · 平 {market.breadth.flat.toLocaleString()} · 跌 {market.breadth.down.toLocaleString()}</i></div></section></div>
    <SectorHeatmap items={market.sectors}/>
    <section className="marketPanel breadthPanel"><div className="marketPanelHead"><div><span className="eyebrow">BREADTH DISTRIBUTION</span><h3>全市场涨跌幅分布</h3></div><small>样本 {market.breadth.total.toLocaleString()} 只 A 股</small></div><div className="breadthChart">{market.breadth.buckets.map(bucket=><article key={bucket.label}><b>{bucket.count.toLocaleString()}</b><i style={{height:`${Math.max(4,bucket.count/max*100)}%`}} className={bucket.label.includes("-")?"fall":"rise"}/><span>{bucket.label}</span></article>)}</div></section>
    <section className="marketPanel turnoverPanel"><div className="marketPanelHead"><div><span className="eyebrow">TURNOVER TOP 10</span><h3>当日成交额前十 · 拟合与单股双 K 线</h3></div><small>上方查看等权拟合走势；点击任一标的查看真实前复权日 K</small></div><CompositeTop10Kline items={market.turnoverTop} expectedDate={tradeDate}/><div className="turnoverList">{market.turnoverTop.map((item,index)=><button key={item.code} onClick={()=>setSelected(item)} className={selected?.code===item.code?"active":""}><i>{String(index+1).padStart(2,"0")}</i><b>{item.name}</b><strong className={item.change>=0?"positive":"negative"}>{item.change>=0?"+":""}{item.change.toFixed(2)}%</strong><small>{money(item.turnover)}</small></button>)}</div>{selected&&<KlinePanel instrument={{name:selected.name,code:`${selected.market||"sz"}${selected.code}`}} expectedDate={tradeDate}/>}</section>
  </>
}

