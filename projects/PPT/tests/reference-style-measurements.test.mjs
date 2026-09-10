import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { measureReferenceStyle } from "../adapters/reference-analyzer/style-measurements.mjs";

const slideSize = { widthEmu: 12_000_000, heightEmu: 6_750_000 };

function shape({ text, size = 1800, x = 500_000, y = 500_000, width = 2_000_000, height = 500_000, placeholder = "", family = "Microsoft YaHei", name = "text-box" }) {
  return `<p:sp><p:nvSpPr><p:cNvPr name="${name}"/><p:nvPr>${placeholder ? `<p:ph type="${placeholder}"/>` : ""}</p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${width}" cy="${height}"/></a:xfrm></p:spPr><p:txBody><a:p><a:r><a:rPr sz="${size}"><a:ea typeface="${family}"/></a:rPr><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>`;
}

function slideXml(shapes, extras = "") {
  return `<p:sld xmlns:p="p" xmlns:a="a" xmlns:c="c" xmlns:r="r"><p:cSld><p:spTree>${shapes.join("")}${extras}</p:spTree></p:cSld></p:sld>`;
}

test("measures CJK title, body, caption and KPI typography separately", () => {
  const result = measureReferenceStyle({
    slideSize,
    slides: [{
      slide: 1,
      xml: slideXml([
        shape({ text: "经营分析月报", size: 3200, placeholder: "title" }),
        shape({ text: "本月资产质量保持稳定", size: 1800, y: 1_500_000 }),
        shape({ text: "同比 12.5%", size: 2800, y: 2_500_000 }),
        shape({ text: "数据来源：内部统计", size: 1000, y: 6_000_000 })
      ]),
      charts: []
    }]
  });

  assert.equal(result.summary.typography.title.fontSizePt.mean, 32);
  assert.equal(result.summary.typography.title.fontSizePt.count, 1);
  assert.deepEqual(result.summary.typography.title.families, [{ family: "Microsoft YaHei", count: 1 }]);
  assert.equal(result.summary.typography.body.fontSizePt.mean, 18);
  assert.equal(result.summary.typography.kpi.fontSizePt.mean, 28);
  assert.equal(result.summary.typography.caption.fontSizePt.mean, 10);
  assert.equal(result.summary.typography.cjkRuns, 4);
  assert.equal(result.summary.typography.hierarchy.titleToBodyRatio, 1.778);
});

test("distinguishes sparse and dense pages with explainable density inputs", () => {
  const denseShapes = Array.from({ length: 20 }, (_, index) => shape({
    text: `经营指标说明${index}：本期数据保持稳定并达到预定目标`,
    x: (index % 4) * 2_800_000,
    y: Math.floor(index / 4) * 1_250_000,
    width: 2_600_000,
    height: 1_050_000
  }));
  const result = measureReferenceStyle({
    slideSize,
    slides: [
      { slide: 1, xml: slideXml([shape({ text: "简报", size: 3200, placeholder: "title", width: 1_200_000, height: 400_000 })]), charts: [] },
      { slide: 2, xml: slideXml(denseShapes, '<p:pic/><p:pic/><c:chart r:id="rId7"/>'), charts: [{ name: "chart1.xml", xml: "<c:chartSpace><c:chart><c:plotArea><c:barChart/></c:plotArea></c:chart></c:chartSpace>" }] }
    ]
  });

  assert.equal(result.slides[0].density.label, "sparse");
  assert.equal(result.slides[1].density.label, "dense");
  assert.equal(result.summary.density.sparseSlides, 1);
  assert.equal(result.summary.density.denseSlides, 1);
  assert.equal(result.slides[1].density.objectCount, 20);
});

test("whitespace uses bounded union area and always remains complementary", () => {
  const result = measureReferenceStyle({
    slideSize,
    slides: [{
      slide: 1,
      xml: slideXml([
        shape({ text: "A", x: -1_000_000, y: -1_000_000, width: 7_000_000, height: 4_000_000 }),
        shape({ text: "B", x: 4_000_000, y: 2_000_000, width: 10_000_000, height: 7_000_000 })
      ]),
      charts: []
    }]
  });
  const { occupiedAreaRatio, whitespaceRatio, method } = result.slides[0].whitespace;
  assert.ok(occupiedAreaRatio >= 0 && occupiedAreaRatio <= 1);
  assert.ok(whitespaceRatio >= 0 && whitespaceRatio <= 1);
  assert.ok(Math.abs(occupiedAreaRatio + whitespaceRatio - 1) < 0.001);
  assert.equal(method, "ooxml-bounded-union");
});

test("chart treatment has stable defaults and reads native OOXML settings", () => {
  const noChart = measureReferenceStyle({ slides: [{ slide: 1, xml: slideXml([]), charts: [] }], slideSize });
  assert.deepEqual(noChart.summary.charts.defaultTreatment, {
    type: "none", dataLabels: "none", legend: "none", gridlines: "none", seriesColorMode: "theme"
  });

  const withChart = measureReferenceStyle({
    slideSize,
    slides: [{
      slide: 1,
      xml: slideXml([], '<c:chart r:id="rId3"/>'),
      charts: [{ name: "chart1.xml", xml: '<c:chartSpace><c:style val="10"/><c:chart><c:legend><c:legendPos val="r"/></c:legend><c:plotArea><c:barChart><c:dLbls><c:dLblPos val="outEnd"/><c:showVal val="1"/></c:dLbls><c:ser><a:srgbClr val="0E2B4F"/></c:ser></c:barChart><c:catAx><c:majorGridlines/></c:catAx></c:plotArea></c:chart></c:chartSpace>' }]
    }]
  });
  const treatment = withChart.slides[0].charts.treatments[0];
  assert.equal(treatment.type, "barChart");
  assert.equal(treatment.styleId, "10");
  assert.equal(treatment.dataLabels, "outEnd");
  assert.equal(treatment.legend, "r");
  assert.equal(treatment.gridlines, "major");
  assert.equal(treatment.seriesColorMode, "explicit");
  assert.deepEqual(treatment.explicitSeriesColors, ["0E2B4F"]);
});

test("measurement contract is optional for older Style DNA and persisted separately", () => {
  const schema = JSON.parse(fs.readFileSync(path.join(process.cwd(), "schemas/style-dna.schema.json"), "utf8"));
  const measurementSchema = JSON.parse(fs.readFileSync(path.join(process.cwd(), "schemas/reference-style-measurements.schema.json"), "utf8"));
  assert.ok(schema.properties.measurements);
  assert.ok(!schema.required.includes("measurements"));
  assert.equal(measurementSchema.properties.schema.const, "ppt-factory/reference-style-measurements/v1");
  const route = fs.readFileSync(path.join(process.cwd(), "app/api/reference/analyze/route.ts"), "utf8");
  assert.match(route, /reference-style-measurements/);
  assert.match(route, /analysis\.styleMeasurements/);
  const derivation = fs.readFileSync(path.join(process.cwd(), "lib/style/style-dna.ts"), "utf8");
  assert.match(derivation, /const measurements = analysis\.styleMeasurements/);
  assert.match(derivation, /measurements \? \{ measurements \} : \{\}/);
});
