import fs from "node:fs";
import path from "node:path";
import { buildTurnoverTemplate, reclassifyAttribution } from "./turnover-channel-classifier.mjs";

const publicDir = path.resolve("public");
const attributionPath = path.join(publicDir, "attribution-snapshot.json");
const marketPath = path.join(publicDir, "market-snapshot.json");
const templatePath = path.join(publicDir, "turnover-template.json");

const attribution = JSON.parse(fs.readFileSync(attributionPath, "utf8"));
const market = JSON.parse(fs.readFileSync(marketPath, "utf8"));
const template = buildTurnoverTemplate(market.turnoverTop200.slice(0, 100), market.tradeDate);
const result = reclassifyAttribution(attribution, market.turnoverTop200);

if (template.unclassified.length || result.unclassified.length) {
  const missing = [...template.unclassified, ...result.unclassified]
    .map(item => `${item.code}:${item.name}`);
  throw new Error(`产业分类缺失：${[...new Set(missing)].join("、")}`);
}
const stockCount = result.themes.reduce((sum, theme) => sum + theme.subtypes.reduce((n, subtype) => n + subtype.stocks.length, 0), 0);
if (stockCount !== 200) throw new Error(`归因标的数量异常：${stockCount}`);

fs.writeFileSync(attributionPath, JSON.stringify(result));
fs.writeFileSync(templatePath, JSON.stringify(template));
console.log(JSON.stringify({ tradeDate: market.tradeDate, themes: result.themes.length, stocks: stockCount, unclassified: 0 }, null, 2));
