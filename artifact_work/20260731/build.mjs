import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const projectDir = String.raw`C:\Users\urmylucky\Documents\每日复盘更新`;
const workDir = path.join(projectDir, "artifact_work", "20260731");
const outputDir = String.raw`C:\Users\urmylucky\Desktop\成交量100`;
const todayPath = path.join(projectDir, "analysis", "today_classification_draft.json");
const historyPath = path.join(projectDir, "analysis", "history.json");

const normalizeCategory = value => ({ "ҽҩ": "医药" }[String(value || "").trim()] || String(value || "").trim());
const today = JSON.parse(await fs.readFile(todayPath, "utf8"));
const history = JSON.parse(await fs.readFile(historyPath, "utf8"));
const runDate = today.asOf;
const outputPath = path.join(outputDir, `${runDate}成交量前100分类.xlsx`);
const rows = today.rows.map(row => ({ ...row, category: normalizeCategory(row.category) }));
const previous = history.at(-1);
const previousCounts = new Map(Object.entries(today.previousCounts || {}));
if (!previousCounts.size) {
  for (const group of previous?.groups || []) previousCounts.set(normalizeCategory(group.category), group.stocks.length);
}

const categories = new Map();
for (const row of rows) {
  if (!categories.has(row.category)) categories.set(row.category, []);
  categories.get(row.category).push(row);
}
for (const stocks of categories.values()) stocks.sort((a, b) => a.rank - b.rank);

const tieOrder = [
  "半导体", "北美算力", "AI应用", "红利", "新能源", "消费电子", "券商", "消费",
  "机器人", "有色", "医药", "特种气体", "安防", "商业航天", "电力", "电网设备",
  "化工", "军工", "船舶", "游戏", "大模型", "算力",
];
const tieIndex = new Map(tieOrder.map((name, index) => [name, index]));
const orderedCategories = [...categories.keys()].sort((a, b) => {
  const sizeDiff = categories.get(b).length - categories.get(a).length;
  return sizeDiff || (tieIndex.get(a) ?? 999) - (tieIndex.get(b) ?? 999) || a.localeCompare(b, "zh-CN");
});

if (rows.length !== 100) throw new Error(`今日记录数应为100，实际${rows.length}`);
if (new Set(rows.map(row => row.code)).size !== 100) throw new Error("今日股票代码存在重复");
if ([...categories.values()].reduce((sum, group) => sum + group.length, 0) !== 100) throw new Error("分类合计不等于100");

const workbook = Workbook.create();
const rawSheet = workbook.worksheets.add(runDate);
const classSheet = workbook.worksheets.add("Sheet1");

const header = ["股票代码", "股票简称", "现价(元)", "涨跌幅(%)", "成交额(亿元)", "排名"];
const headerStyle = {
  fill: "#7DDCF0",
  font: { name: "Arial", size: 9, bold: true, color: "#FFFFFF" },
  horizontalAlignment: "center",
  verticalAlignment: "center",
  wrapText: true,
  borders: { preset: "all", style: "thin", color: "#1C7A80" },
};
const bodyStyle = {
  font: { name: "Arial", size: 9, color: "#152122" },
  verticalAlignment: "center",
  borders: { preset: "all", style: "thin", color: "#1C7A80" },
};
const categoryStyle = {
  font: { name: "Microsoft YaHei", size: 9, bold: true, color: "#152122" },
  verticalAlignment: "center",
};

function matrixForStocks(stocks) {
  return stocks.map(row => [row.code, row.name, row.price, row.pct, row.amount, row.rank]);
}

function rankColor(rank) {
  if (rank <= 10) return "#FF0000";
  if (rank <= 50) return "#00B0F0";
  return "#152122";
}

function applyBodyFormatting(sheet, rangeAddress, pctColumnLetter, firstDataRow, lastDataRow) {
  const range = sheet.getRange(rangeAddress);
  range.format = bodyStyle;
  sheet.getRange(`${pctColumnLetter}${firstDataRow}:${pctColumnLetter}${lastDataRow}`).format.numberFormat = "0.00";
}

function colLetter(index) {
  let value = index + 1;
  let out = "";
  while (value) {
    const rem = (value - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    value = Math.floor((value - 1) / 26);
  }
  return out;
}

// Sheet 1: iFinD成交额前100。
rawSheet.showGridLines = false;
rawSheet.getRange("A1:F1").values = [header];
rawSheet.getRange("A1:F1").format = headerStyle;
rawSheet.getRange("A2:F101").values = matrixForStocks(rows);
applyBodyFormatting(rawSheet, "A2:F101", "D", 2, 101);
rawSheet.getRange("A2:F11").format.font = { name: "Arial", size: 9, color: "#FF0000" };
rawSheet.getRange("A12:F51").format.font = { name: "Arial", size: 9, color: "#00B0F0" };
rawSheet.getRange("A52:F101").format.font = { name: "Arial", size: 9, color: "#152122" };
rawSheet.getRange("A2:B101").format.horizontalAlignment = "center";
rawSheet.getRange("C2:F101").format.horizontalAlignment = "right";
rawSheet.getRange("C2:E101").format.numberFormat = "0.00";
rawSheet.getRange("F2:F101").format.numberFormat = "0";
rawSheet.getRange("A1:A101").format.columnWidthPx = 86;
rawSheet.getRange("B1:B101").format.columnWidthPx = 92;
rawSheet.getRange("C1:C101").format.columnWidthPx = 74;
rawSheet.getRange("D1:D101").format.columnWidthPx = 80;
rawSheet.getRange("E1:E101").format.columnWidthPx = 94;
rawSheet.getRange("F1:F101").format.columnWidthPx = 52;
rawSheet.getRange("A1:F101").format.rowHeightPx = 20;
rawSheet.freezePanes.freezeRows(1);

// Sheet 2: 按历史Sheet2规则分块分类，每块四类，类别内按成交额排名升序。
classSheet.showGridLines = false;
const starts = [0, 7, 14, 21];
let startRow = 1;
for (let blockStart = 0; blockStart < orderedCategories.length; blockStart += 4) {
  const block = orderedCategories.slice(blockStart, blockStart + 4);
  const maxRows = Math.max(...block.map(category => categories.get(category).length));
  for (let slot = 0; slot < block.length; slot += 1) {
    const category = block[slot];
    const stocks = categories.get(category);
    const startCol = starts[slot];
    const endCol = startCol + 5;
    const headerRange = `${colLetter(startCol)}${startRow}:${colLetter(endCol)}${startRow}`;
    classSheet.getRange(headerRange).values = [header];
    classSheet.getRange(headerRange).format = headerStyle;

    const prevCount = previousCounts.get(category) || 0;
    const delta = stocks.length - prevCount;
    const deltaText = delta > 0 ? `+${delta}` : String(delta);
    classSheet.getRange(`${colLetter(startCol)}${startRow + 1}`).values = [[category]];
    classSheet.getRange(`${colLetter(endCol)}${startRow + 1}`).values = [[`${stocks.length}(${deltaText})`]];
    classSheet.getRange(`${colLetter(startCol)}${startRow + 1}:${colLetter(endCol)}${startRow + 1}`).format = categoryStyle;

    const dataFirst = startRow + 2;
    const dataLast = dataFirst + stocks.length - 1;
    const dataRange = `${colLetter(startCol)}${dataFirst}:${colLetter(endCol)}${dataLast}`;
    classSheet.getRange(dataRange).values = matrixForStocks(stocks);
    applyBodyFormatting(classSheet, dataRange, colLetter(startCol + 3), dataFirst, dataLast);
    stocks.forEach((stock, offset) => {
      const rowNumber = dataFirst + offset;
      classSheet.getRange(`${colLetter(startCol)}${rowNumber}:${colLetter(endCol)}${rowNumber}`).format.font = {
        name: "Arial",
        size: 9,
        color: rankColor(stock.rank),
      };
    });
    classSheet.getRange(`${colLetter(startCol)}${dataFirst}:${colLetter(startCol + 1)}${dataLast}`).format.horizontalAlignment = "center";
    classSheet.getRange(`${colLetter(startCol + 2)}${dataFirst}:${colLetter(endCol)}${dataLast}`).format.horizontalAlignment = "right";
    classSheet.getRange(`${colLetter(startCol + 2)}${dataFirst}:${colLetter(startCol + 4)}${dataLast}`).format.numberFormat = "0.00";
    classSheet.getRange(`${colLetter(endCol)}${dataFirst}:${colLetter(endCol)}${dataLast}`).format.numberFormat = "0";
  }
  startRow += 2 + maxRows + 2;
}

for (const startCol of starts) {
  classSheet.getRange(`${colLetter(startCol)}1:${colLetter(startCol)}${startRow}`).format.columnWidthPx = 86;
  classSheet.getRange(`${colLetter(startCol + 1)}1:${colLetter(startCol + 1)}${startRow}`).format.columnWidthPx = 92;
  classSheet.getRange(`${colLetter(startCol + 2)}1:${colLetter(startCol + 2)}${startRow}`).format.columnWidthPx = 74;
  classSheet.getRange(`${colLetter(startCol + 3)}1:${colLetter(startCol + 3)}${startRow}`).format.columnWidthPx = 80;
  classSheet.getRange(`${colLetter(startCol + 4)}1:${colLetter(startCol + 4)}${startRow}`).format.columnWidthPx = 94;
  classSheet.getRange(`${colLetter(startCol + 5)}1:${colLetter(startCol + 5)}${startRow}`).format.columnWidthPx = 52;
  if (startCol < 21) classSheet.getRange(`${colLetter(startCol + 6)}1:${colLetter(startCol + 6)}${startRow}`).format.columnWidthPx = 24;
}
classSheet.getRange(`A1:AA${startRow}`).format.rowHeightPx = 20;
classSheet.freezePanes.freezeRows(1);

await fs.mkdir(workDir, { recursive: true });
await fs.mkdir(outputDir, { recursive: true });

const rawCheck = await workbook.inspect({
  kind: "table",
  range: `${runDate}!A1:F12`,
  include: "values,formulas",
  tableMaxRows: 12,
  tableMaxCols: 6,
  maxChars: 5000,
});
const classCheck = await workbook.inspect({
  kind: "table",
  range: `Sheet1!A1:AA${Math.min(startRow, 70)}`,
  include: "values,formulas",
  tableMaxRows: 18,
  tableMaxCols: 27,
  maxChars: 9000,
});
const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "final formula error scan",
});
console.log(rawCheck.ndjson);
console.log(classCheck.ndjson);
console.log(errors.ndjson);

for (const [sheetName, filename] of [[runDate, "preview-sheet1.png"], ["Sheet1", "preview-sheet2.png"]]) {
  const preview = await workbook.render({ sheetName, autoCrop: "all", scale: 1, format: "png" });
  await fs.writeFile(path.join(workDir, filename), new Uint8Array(await preview.arrayBuffer()));
}

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(JSON.stringify({
  outputPath,
  categoryOrder: orderedCategories,
  categoryCounts: Object.fromEntries(orderedCategories.map(category => [category, categories.get(category).length])),
  previousDate: today.previousDate || previous?.date,
  finalRow: startRow,
}, null, 2));
