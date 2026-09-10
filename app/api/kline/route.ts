import { NextRequest, NextResponse } from "next/server";
import { connectIfind } from "../../../scripts/ifind-mcp-client.mjs";

type CandleLike = {date:string;open:number;close:number;high:number;low:number;volume:number};

function ifindCode(code:string) {
  const mainland=code.match(/^(sh|sz|bj)(\d+)$/i);
  if(mainland)return `${mainland[2]}.${mainland[1].toUpperCase()}`;
  const hk=code.match(/^hk(.+)$/i);
  return hk?`${hk[1].toUpperCase()}.HK`:"";
}

function aggregateCandles(rows:CandleLike[], period:"week"|"month") {
  const groups = new Map<string, CandleLike[]>();
  for (const row of rows) {
    const date = new Date(`${row.date}T00:00:00Z`);
    let key = row.date.slice(0, 7);
    if (period === "week") {
      const day = date.getUTCDay() || 7;
      date.setUTCDate(date.getUTCDate() - day + 1);
      key = date.toISOString().slice(0, 10);
    }
    const group = groups.get(key) || [];
    group.push(row);
    groups.set(key, group);
  }
  return [...groups.values()].map(group => ({
    date: group.at(-1)!.date,
    open: group[0].open,
    close: group.at(-1)!.close,
    high: Math.max(...group.map(item => item.high)),
    low: Math.min(...group.map(item => item.low)),
    volume: group.reduce((sum, item) => sum + item.volume, 0),
  }));
}

async function ifindCandles(code:string, days:number) {
  const thscode=ifindCode(code);
  if(!thscode)throw new Error("iFinD unsupported code");
  const end=new Date();
  const begin=new Date(end);
  begin.setUTCDate(begin.getUTCDate()-Math.max(120,Math.ceil(days*1.7)));
  const connection=await connectIfind({timeoutMs:20_000});
  try{
    const payload=await connection.callTool("THS_HQ",{
      thscode,
      jsonIndicator:"open;high;low;close;volume;amount",
      jsonparam:"CPS:2,Days:Tradedays,Fill:Blank",
      begintime:begin.toISOString().slice(0,10),
      endtime:end.toISOString().slice(0,10),
    });
    return (payload?.data||[]).map((row:any)=>({
      date:String(row.time||"").slice(0,10),open:Number(row.open),close:Number(row.close),
      high:Number(row.high),low:Number(row.low),volume:Number(row.volume||0),
    })).filter((row:CandleLike)=>/^\d{4}-\d{2}-\d{2}$/.test(row.date)&&[row.open,row.close,row.high,row.low,row.volume].every(Number.isFinite));
  }finally{await connection.close()}
}

async function fallbackCandles(code:string, days:number) {
  const url=`https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${encodeURIComponent(code)},day,,,${days},qfq`;
  const response=await fetch(url,{next:{revalidate:900}});
  if(!response.ok)throw new Error("quote upstream unavailable");
  const payload=await response.json(),node=payload?.data?.[code]||{},rows=node.qfqday||node.day||[];
  return rows.map((row:string[])=>({date:row[0],open:Number(row[1]),close:Number(row[2]),high:Number(row[3]),low:Number(row[4]),volume:Number(row[5])}))
    .filter((row:CandleLike)=>row.date&&[row.open,row.close,row.high,row.low,row.volume].every(Number.isFinite));
}

export async function GET(request:NextRequest){
  const code=request.nextUrl.searchParams.get("code")||"";
  const requestedDays=Number(request.nextUrl.searchParams.get("days")||250);
  const days=Math.min(250,Math.max(20,Number.isFinite(requestedDays)?requestedDays:250));
  const requestedPeriod=request.nextUrl.searchParams.get("period")||"day";
  const period:"day"|"week"|"month"=requestedPeriod==="week"||requestedPeriod==="month"?requestedPeriod:"day";
  if(!/^(sh|sz|bj|hk)[a-zA-Z0-9]+$/.test(code))return NextResponse.json({error:"unsupported code"},{status:400});
  let source="iFinD MCP";
  let daily:CandleLike[]=[];
  try{daily=await ifindCandles(code,days)}catch(error){
    console.warn("iFinD K-line fallback",error instanceof Error?error.message:String(error));
    source="腾讯故障回退";daily=await fallbackCandles(code,days);
  }
  if(!daily.length)return NextResponse.json({error:"quote history unavailable"},{status:502});
  const candles=period==="day"?daily:aggregateCandles(daily,period);
  return NextResponse.json({code,period,adjust:"qfq",source,candles});
}
