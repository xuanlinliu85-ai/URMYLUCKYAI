import fs from "node:fs";

const attribution = JSON.parse(fs.readFileSync("public/attribution-snapshot.json", "utf8"));
const template = JSON.parse(fs.readFileSync("public/turnover-template.json", "utf8"));
const market = JSON.parse(fs.readFileSync("public/market-snapshot.json", "utf8"));
const normalize = value => String(value || "").replace(/^XD/, "").replace(/[\s　]/g, "").replace(/Ａ/g, "A");
const templateMap = new Map();
for (const channel of template.channels) for (const stock of channel.stocks) templateMap.set(normalize(stock.name), channel.name);

const rows = [];
for (const theme of attribution.themes) {
  const channel = theme.header.replace(/\s*\(.*$/, "");
  for (const subtype of theme.subtypes) {
    for (const stock of subtype.stocks) {
      const match = stock.text.match(/^#(\d+)\s+(?:▲新\s+)?(.+?)\s+([\d.]+)亿/);
      if (!match) throw new Error(`无法解析归因行：${stock.text}`);
      rows.push({ rank: Number(match[1]), name: match[2], channel, reason: stock.text.split("→").slice(1).join("→").trim() });
    }
  }
}

const names = rows.map(row => normalize(row.name));
const ranks = rows.map(row => row.rank);
const duplicateNames = names.filter((name, index) => names.indexOf(name) !== index);
const badReasons = rows.filter(row => row.reason.split(/[；;]/).map(item => item.trim()).filter(Boolean).length < 3).map(row => row.name);
const templateMismatch = rows
  .filter(row => templateMap.has(normalize(row.name)) && templateMap.get(normalize(row.name)) !== row.channel)
  .map(row => ({ name: row.name, expected: templateMap.get(normalize(row.name)), actual: row.channel }));
const failures = [];
if (rows.length !== 200) failures.push(`标的数量=${rows.length}`);
if (new Set(names).size !== 200) failures.push(`重复标的=${[...new Set(duplicateNames)].join("、")}`);
if (new Set(ranks).size !== 200 || ranks.some(rank => rank < 1 || rank > 200)) failures.push("排名必须完整覆盖1-200");
const templateStocks = template.channels.flatMap(channel => channel.stocks);
const templateRanks = templateStocks.map(stock => Number(stock.rank));
if (template.snapshotDate !== market.tradeDate) failures.push(`成交100日期=${template.snapshotDate}，市场日期=${market.tradeDate}`);
if (templateStocks.length !== 100) failures.push(`成交100数量=${templateStocks.length}`);
if (new Set(templateRanks).size !== 100 || templateRanks.some(rank => rank < 1 || rank > 100)) failures.push("成交100排名必须完整覆盖1-100");
const expectedTop100 = market.turnoverTop200.slice(0, 100).map(item => normalize(item.name));
const actualTop100 = templateStocks.sort((a, b) => a.rank - b.rank).map(item => normalize(item.name));
if (JSON.stringify(expectedTop100) !== JSON.stringify(actualTop100)) failures.push("成交100名单与市场成交排名不一致");
if (templateMismatch.length) failures.push(`成交前100模板不一致=${JSON.stringify(templateMismatch)}`);
if (badReasons.length) failures.push(`三段式归因缺失=${badReasons.join("、")}`);
if ((attribution.unclassified || []).length) failures.push(`未分类=${JSON.stringify(attribution.unclassified)}`);
if ((template.unclassified || []).length) failures.push(`成交100未分类=${JSON.stringify(template.unclassified)}`);
if (failures.length) throw new Error(failures.join("；"));

console.log(JSON.stringify({
  themes: attribution.themes.map(theme => ({ name: theme.header, count: theme.subtypes.reduce((sum, subtype) => sum + subtype.stocks.length, 0) })),
  stocks: rows.length,
  unique: new Set(names).size,
  templateOverlap: rows.filter(row => templateMap.has(normalize(row.name))).length,
  templateMismatch: 0,
  threePartReasons: rows.length - badReasons.length,
  preservedShortReasons: 0,
  unclassified: 0,
}, null, 2));
