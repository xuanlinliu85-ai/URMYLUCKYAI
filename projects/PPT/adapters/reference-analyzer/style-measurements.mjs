const CJK_PATTERN = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u;
const NUMBER_PATTERN = /(?:^|\s)[+-]?(?:\d[\d,.]*)(?:%|％|亿元|万元|万|亿|元|倍|个|项)?(?:\s|$)/u;

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function round(value, digits = 3) {
  return Number(value.toFixed(digits));
}

function decodeXml(value) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function allMatches(value, pattern, index = 1) {
  return [...value.matchAll(pattern)].map((match) => match[index]).filter((item) => item !== undefined);
}

function summarizeNumbers(values) {
  if (!values.length) return { count: 0, min: 0, max: 0, mean: 0, median: 0, p25: 0, p75: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (fraction) => {
    const position = (sorted.length - 1) * fraction;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
  };
  return {
    count: values.length,
    min: round(sorted[0], 2),
    max: round(sorted.at(-1), 2),
    mean: round(values.reduce((sum, item) => sum + item, 0) / values.length, 2),
    median: round(percentile(0.5), 2),
    p25: round(percentile(0.25), 2),
    p75: round(percentile(0.75), 2)
  };
}

function countFamilies(values) {
  const counts = new Map();
  for (const value of values.filter(Boolean)) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([family, count]) => ({ family, count }));
}

function parseBox(xml) {
  const xfrm = xml.match(/<(?:a|p):xfrm\b[^>]*>[\s\S]*?<a:off\b[^>]*\bx="(-?\d+)"[^>]*\by="(-?\d+)"[^>]*\/?>(?:[\s\S]*?)<a:ext\b[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"[^>]*\/?>(?:[\s\S]*?)<\/(?:a|p):xfrm>/);
  return xfrm ? { x: Number(xfrm[1]), y: Number(xfrm[2]), width: Number(xfrm[3]), height: Number(xfrm[4]) } : null;
}

function classifyRole({ placeholder, objectName, text, meanSize, box, slideHeight }) {
  if (["title", "ctrTitle"].includes(placeholder)) return "title";
  if (/(?:^|[-_ ])(?:title|headline)(?:$|[-_ ])/i.test(objectName)) return "title";
  if (["subTitle", "dt", "ftr", "sldNum"].includes(placeholder)) return "caption";
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= 32 && NUMBER_PATTERN.test(` ${compact} `) && meanSize >= 22) return "kpi";
  if (meanSize <= 12 || (box && box.y >= slideHeight * 0.82)) return "caption";
  if (box && box.y <= slideHeight * 0.24 && meanSize >= 24) return "title";
  return "body";
}

function parseTextShapes(slideXml, slideHeight) {
  return allMatches(slideXml, /(<p:sp\b[\s\S]*?<\/p:sp>)/g).flatMap((block) => {
    const texts = allMatches(block, /<a:t>([\s\S]*?)<\/a:t>/g).map(decodeXml);
    const text = texts.join("").trim();
    if (!text) return [];
    const runSizes = allMatches(block, /<a:rPr\b[^>]*\bsz="(\d+)"/g).map((value) => Number(value) / 100);
    const defaultSizes = allMatches(block, /<(?:a:defRPr|a:endParaRPr)\b[^>]*\bsz="(\d+)"/g).map((value) => Number(value) / 100);
    const effectiveSizes = runSizes.length ? runSizes : defaultSizes.length ? defaultSizes : [18];
    const meanSize = effectiveSizes.reduce((sum, item) => sum + item, 0) / effectiveSizes.length;
    const placeholder = block.match(/<p:ph\b[^>]*\btype="([^"]+)"/)?.[1] ?? "";
    const objectName = block.match(/<p:cNvPr\b[^>]*\bname="([^"]*)"/)?.[1] ?? "";
    const box = parseBox(block);
    const families = [...new Set(allMatches(block, /<(?:a:latin|a:ea|a:cs)\b[^>]*\btypeface="([^"]+)"/g))];
    return [{
      role: classifyRole({ placeholder, objectName, text, meanSize, box, slideHeight }),
      textCharacters: [...text].length,
      cjkRuns: texts.filter((value) => CJK_PATTERN.test(value)).length,
      sizes: effectiveSizes,
      families,
      box
    }];
  });
}

function unionArea(rectangles, width, height) {
  const clipped = rectangles.map((box) => ({
    left: Math.max(0, Math.min(width, box.x)),
    top: Math.max(0, Math.min(height, box.y)),
    right: Math.max(0, Math.min(width, box.x + box.width)),
    bottom: Math.max(0, Math.min(height, box.y + box.height))
  })).filter((box) => box.right > box.left && box.bottom > box.top);
  if (!clipped.length || width <= 0 || height <= 0) return 0;
  const edges = [...new Set(clipped.flatMap((box) => [box.left, box.right]))].sort((a, b) => a - b);
  let area = 0;
  for (let index = 0; index < edges.length - 1; index += 1) {
    const left = edges[index];
    const right = edges[index + 1];
    const intervals = clipped.filter((box) => box.left < right && box.right > left)
      .map((box) => [box.top, box.bottom]).sort((a, b) => a[0] - b[0]);
    let covered = 0;
    let start = -1;
    let end = -1;
    for (const [top, bottom] of intervals) {
      if (start < 0) [start, end] = [top, bottom];
      else if (top <= end) end = Math.max(end, bottom);
      else { covered += end - start; [start, end] = [top, bottom]; }
    }
    if (start >= 0) covered += end - start;
    area += (right - left) * covered;
  }
  return clamp01(area / (width * height));
}

function parseChartTreatment(chartXml) {
  const type = chartXml.match(/<c:(area3DChart|areaChart|bar3DChart|barChart|bubbleChart|doughnutChart|line3DChart|lineChart|ofPieChart|pie3DChart|pieChart|radarChart|scatterChart|stockChart|surface3DChart|surfaceChart)\b/)?.[1] ?? "unknown";
  const labelPosition = chartXml.match(/<c:dLblPos\b[^>]*\bval="([^"]+)"/)?.[1] ?? "auto";
  const showValue = chartXml.match(/<c:showVal\b[^>]*\bval="([^"]+)"/)?.[1];
  const hasLabels = /<c:dLbls\b/.test(chartXml);
  const legend = chartXml.match(/<c:legendPos\b[^>]*\bval="([^"]+)"/)?.[1] ?? (/<c:legend\b/.test(chartXml) ? "auto" : "none");
  const colors = [...new Set(allMatches(chartXml, /<a:srgbClr\b[^>]*\bval="([0-9A-Fa-f]{6})"/g).map((value) => value.toUpperCase()))];
  return {
    type,
    styleId: chartXml.match(/<c:style\b[^>]*\bval="([^"]+)"/)?.[1] ?? "theme-default",
    dataLabels: !hasLabels ? "none" : showValue === "0" ? "hidden" : labelPosition,
    legend,
    gridlines: /<c:majorGridlines\b/.test(chartXml) ? "major" : "none",
    seriesColorMode: colors.length ? "explicit" : "theme",
    explicitSeriesColors: colors
  };
}

function mode(values, fallback) {
  if (!values.length) return fallback;
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0][0];
}

function roleSummary(records) {
  return {
    count: records.length,
    fontSizePt: summarizeNumbers(records.flatMap((record) => record.sizes)),
    families: countFamilies(records.flatMap((record) => record.families)),
    cjkRuns: records.reduce((sum, record) => sum + record.cjkRuns, 0)
  };
}

/** Deterministic OOXML-derived reference-style measurement. */
export function measureReferenceStyle({ slides, slideSize }) {
  const aggregateTypography = [];
  const perSlide = slides.map((slide) => {
    const textRecords = parseTextShapes(slide.xml, slideSize.heightEmu);
    aggregateTypography.push(...textRecords);
    const boxes = allMatches(slide.xml, /(<(?:a|p):xfrm\b[^>]*>[\s\S]*?<\/(?:a|p):xfrm>)/g).map(parseBox).filter(Boolean);
    const imageCount = (slide.xml.match(/<p:pic\b/g) ?? []).length;
    const chartTreatments = (slide.charts ?? []).map((chart) => parseChartTreatment(chart.xml));
    const chartCount = chartTreatments.length || (slide.xml.match(/<c:chart\b/g) ?? []).length;
    const occupiedAreaRatio = unionArea(boxes, slideSize.widthEmu, slideSize.heightEmu);
    const textCharacters = textRecords.reduce((sum, record) => sum + record.textCharacters, 0);
    const objectCount = boxes.length;
    const informationScore = clamp01(textCharacters / 700 * 0.58 + objectCount / 18 * 0.27 + chartCount / 3 * 0.1 + imageCount / 4 * 0.05);
    const visualScore = clamp01(occupiedAreaRatio * 0.68 + (chartCount + imageCount) / 5 * 0.22 + objectCount / 30 * 0.1);
    const densityScore = (informationScore + visualScore) / 2;
    const densityLabel = densityScore < 0.34 ? "sparse" : densityScore > 0.67 ? "dense" : "balanced";
    return {
      slide: slide.slide,
      typography: {
        title: roleSummary(textRecords.filter((item) => item.role === "title")),
        body: roleSummary(textRecords.filter((item) => item.role === "body")),
        caption: roleSummary(textRecords.filter((item) => item.role === "caption")),
        kpi: roleSummary(textRecords.filter((item) => item.role === "kpi")),
        cjkRuns: textRecords.reduce((sum, record) => sum + record.cjkRuns, 0)
      },
      density: {
        informationScore: round(informationScore), visualScore: round(visualScore), label: densityLabel,
        textCharacters, objectCount, imageCount, chartCount
      },
      whitespace: {
        occupiedAreaRatio: round(occupiedAreaRatio), whitespaceRatio: round(1 - occupiedAreaRatio), method: "ooxml-bounded-union"
      },
      charts: { count: chartCount, treatments: chartTreatments }
    };
  });

  const allRoles = ["title", "body", "caption", "kpi"];
  const allTypography = Object.fromEntries(allRoles.map((role) => [role, roleSummary(aggregateTypography.filter((item) => item.role === role))]));
  const titleMean = allTypography.title.fontSizePt.mean;
  const bodyMean = allTypography.body.fontSizePt.mean;
  const treatments = perSlide.flatMap((slide) => slide.charts.treatments);
  const chartDefault = treatments.length ? {
    type: mode(treatments.map((item) => item.type), "unknown"),
    dataLabels: mode(treatments.map((item) => item.dataLabels), "none"),
    legend: mode(treatments.map((item) => item.legend), "none"),
    gridlines: mode(treatments.map((item) => item.gridlines), "none"),
    seriesColorMode: mode(treatments.map((item) => item.seriesColorMode), "theme")
  } : { type: "none", dataLabels: "none", legend: "none", gridlines: "none", seriesColorMode: "theme" };

  return {
    schema: "ppt-factory/reference-style-measurements/v1",
    method: "deterministic-ooxml",
    summary: {
      typography: {
        ...allTypography,
        cjkRuns: perSlide.reduce((sum, slide) => sum + slide.typography.cjkRuns, 0),
        hierarchy: { titleToBodyRatio: bodyMean > 0 ? round(titleMean / bodyMean) : 0 }
      },
      density: {
        meanInformationScore: round(perSlide.reduce((sum, slide) => sum + slide.density.informationScore, 0) / Math.max(1, perSlide.length)),
        meanVisualScore: round(perSlide.reduce((sum, slide) => sum + slide.density.visualScore, 0) / Math.max(1, perSlide.length)),
        sparseSlides: perSlide.filter((slide) => slide.density.label === "sparse").length,
        balancedSlides: perSlide.filter((slide) => slide.density.label === "balanced").length,
        denseSlides: perSlide.filter((slide) => slide.density.label === "dense").length
      },
      whitespace: {
        meanOccupiedAreaRatio: round(perSlide.reduce((sum, slide) => sum + slide.whitespace.occupiedAreaRatio, 0) / Math.max(1, perSlide.length)),
        meanWhitespaceRatio: round(perSlide.reduce((sum, slide) => sum + slide.whitespace.whitespaceRatio, 0) / Math.max(1, perSlide.length)),
        method: "ooxml-bounded-union"
      },
      charts: {
        count: perSlide.reduce((sum, slide) => sum + slide.charts.count, 0),
        slidesWithCharts: perSlide.filter((slide) => slide.charts.count > 0).length,
        defaultTreatment: chartDefault
      }
    },
    slides: perSlide
  };
}
