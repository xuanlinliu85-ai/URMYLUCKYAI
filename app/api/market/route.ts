import { NextResponse } from "next/server";

type Quote = { code: string; name: string; price: number; change: number; turnover: number; market?: "sh" | "sz" | "bj" };

const fields = "f12,f14,f2,f3,f6";
const url = (fs: string, fid: string, pz = 100) =>
  `https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=${pz}&po=1&np=1&fltt=2&invt=2&fid=${fid}&fs=${encodeURIComponent(fs)}&fields=${fields}`;
const majorIndexSecids = [
  "1.000001", "0.399001", "0.399006", "1.000016", "1.000300", "1.000905",
  "1.000852", "1.000688", "0.399673", "1.000510", "1.000906", "1.000985",
  "0.399005", "0.399330", "0.399303", "1.000922", "1.000932", "0.899050",
];

async function list(fs: string, fid: string, pz = 100) {
  const res = await fetch(url(fs, fid, pz), { next: { revalidate: 900 } });
  if (!res.ok) throw new Error("market source unavailable");
  const payload = await res.json();
  return Object.values(payload?.data?.diff || {}).map((row: any) => ({
    code: String(row.f12 || ""), name: String(row.f14 || ""), price: Number(row.f2 || 0),
    change: Number(row.f3 || 0), turnover: Number(row.f6 || 0),
  }));
}

async function majorIndexes() {
  const endpoint = `https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&invt=2&fields=${fields}&secids=${majorIndexSecids.join(",")}`;
  const res = await fetch(endpoint, { next: { revalidate: 900 } });
  if (!res.ok) throw new Error("index source unavailable");
  const payload = await res.json();
  return (payload?.data?.diff || []).map((row: any) => ({
    code: String(row.f12 || ""), name: String(row.f14 || ""), price: Number(row.f2 || 0),
    change: Number(row.f3 || 0), turnover: Number(row.f6 || 0),
  }));
}

function market(code: string): "sh" | "sz" | "bj" {
  return code.startsWith("6") || code.startsWith("5") ? "sh" : code.startsWith("8") || code.startsWith("4") ? "bj" : "sz";
}

export async function GET() {
  try {
    const [indexes, sectors, stocks] = await Promise.all([
      majorIndexes(),
      list("m:90+t:2", "f3", 100),
      list("m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23", "f6", 5000),
    ]);
    const validStocks = stocks.filter((x: Quote) => x.price > 0 && Number.isFinite(x.change));
    const buckets = [
      { label: "≤-7%", min: -Infinity, max: -7 }, { label: "-7~-5%", min: -7, max: -5 },
      { label: "-5~-3%", min: -5, max: -3 }, { label: "-3~-1%", min: -3, max: -1 },
      { label: "-1~0%", min: -1, max: 0 }, { label: "0~1%", min: 0, max: 1 },
      { label: "1~3%", min: 1, max: 3 }, { label: "3~5%", min: 3, max: 5 },
      { label: "5~7%", min: 5, max: 7 }, { label: "≥7%", min: 7, max: Infinity },
    ].map(bucket => ({ ...bucket, count: validStocks.filter((x: Quote) => x.change >= bucket.min && (bucket.max === Infinity ? true : x.change < bucket.max)).length }));
    return NextResponse.json({
      asOf: new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }),
      indexes: indexes.filter((x: Quote) => x.price > 0),
      sectors: sectors.filter((x: Quote) => x.price > 0).slice(0, 60),
      breadth: {
        total: validStocks.length,
        up: validStocks.filter((x: Quote) => x.change > 0).length,
        flat: validStocks.filter((x: Quote) => x.change === 0).length,
        down: validStocks.filter((x: Quote) => x.change < 0).length,
        buckets,
      },
      turnoverTop: validStocks.slice(0, 10).map((x: Quote) => ({ ...x, market: market(x.code) })),
    });
  } catch {
    return NextResponse.json({ error: "market source unavailable" }, { status: 502 });
  }
}
