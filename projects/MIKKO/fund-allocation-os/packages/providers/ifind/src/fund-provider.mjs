import { connectIfind, hasIfindCredential, REQUIRED_BASE_TOOLS } from "./mcp-client.mjs";

const FUND_UNIVERSE_QUERY = "全部公募基金代码 基金简称 基金类型";
const FUND_INDICATORS = Object.freeze([
  "ths_fund_short_name_fund",
  "ths_fund_type_fund",
  "ths_fund_invest_type_fund",
  "ths_fund_establishment_date_fund",
  "ths_fund_scale_fund",
  "ths_managerid_fund",
  "ths_fund_manager_current_fund",
  "ths_fs_cn_name_fund",
  "ths_perf_comparative_benchmark_fund",
]);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

export function canonicalFundCode(value) {
  const code = String(value || "").trim().toUpperCase();
  if (/^\d{6}\.(OF|SH|SZ)$/.test(code)) return code;
  if (/^\d{6}$/.test(code)) return `${code}.OF`;
  return "";
}

export function normalizeUniverseRows(payload) {
  const seen = new Set();
  const rows = [];
  for (const item of asArray(payload?.data)) {
    const fundCode = canonicalFundCode(item?.["基金代码"]);
    if (!fundCode || seen.has(fundCode)) continue;
    seen.add(fundCode);
    rows.push({
      fundCode,
      fundName: String(item?.["基金简称"] || "").trim(),
      investmentType: String(item?.["基金@投资类型(二级分类)"] || "").trim(),
      source: "iFinD MCP",
    });
  }
  return rows;
}

function normalizeSnapshot(row) {
  const fundCode = canonicalFundCode(row?.thscode);
  return {
    fundCode,
    fundName: row?.ths_fund_short_name_fund ?? null,
    fundType: row?.ths_fund_type_fund ?? null,
    investmentType: row?.ths_fund_invest_type_fund ?? null,
    inceptionDate: row?.ths_fund_establishment_date_fund ?? null,
    aum: row?.ths_fund_scale_fund ?? null,
    managerId: row?.ths_managerid_fund ?? null,
    currentManager: row?.ths_fund_manager_current_fund ?? null,
    fundCompany: row?.ths_fs_cn_name_fund ?? null,
    benchmark: row?.ths_perf_comparative_benchmark_fund ?? null,
    source: "iFinD MCP",
  };
}

export class IfindFundProvider {
  constructor(connection) {
    this.connection = connection;
  }

  static async connect(options) {
    return new IfindFundProvider(await connectIfind(options));
  }

  static configured() {
    return hasIfindCredential();
  }

  async health({ sampleCode = "519702.OF" } = {}) {
    const listed = await this.connection.listTools();
    const toolNames = asArray(listed?.tools).map(tool => tool.name).sort();
    const missingTools = REQUIRED_BASE_TOOLS.filter(name => !toolNames.includes(name));
    if (missingTools.length) {
      return {
        status: "error",
        compatible: false,
        checkedAt: new Date().toISOString(),
        toolCount: toolNames.length,
        missingTools,
        message: `缺少基金 Provider 工具：${missingTools.join(", ")}`,
      };
    }

    const [nameReference, navReference, snapshots, nav] = await Promise.all([
      this.connection.callTool("lookup_field_reference", { function_name: "THS_BD", keyword: "基金简称" }),
      this.connection.callTool("lookup_field_reference", { function_name: "THS_BD", keyword: "复权单位净值" }),
      this.getFundSnapshots([sampleCode]),
      this.getAdjustedNav([sampleCode], "2026-08-01", "2026-08-17"),
    ]);

    const sample = snapshots[0];
    const navRows = nav.get(canonicalFundCode(sampleCode)) || [];
    return {
      status: sample?.fundName && navRows.length ? "ready" : "error",
      compatible: Boolean(sample?.fundName && navRows.length),
      checkedAt: new Date().toISOString(),
      toolCount: toolNames.length,
      missingTools,
      fieldReferenceVerified: Boolean(nameReference && navReference),
      sampleCode: canonicalFundCode(sampleCode),
      sampleName: sample?.fundName ?? null,
      navObservations: navRows.length,
      latestNavDate: navRows.at(-1)?.date ?? null,
      source: "iFinD MCP",
    };
  }

  async listFundUniverse() {
    const payload = await this.connection.callTool("THS_WCQuery", {
      query: FUND_UNIVERSE_QUERY,
      domain: "fund",
    });
    const rows = normalizeUniverseRows(payload);
    if (rows.length < 5_000) {
      throw new Error(`iFinD 公募基金 Universe 仅返回 ${rows.length} 条，低于安全门槛`);
    }
    return rows;
  }

  async getFundSnapshots(inputCodes) {
    const codes = [...new Set(inputCodes.map(canonicalFundCode).filter(Boolean))];
    const rows = [];
    for (const batch of chunks(codes, 200)) {
      const payload = await this.connection.callTool("THS_BD", {
        thsCode: batch.join(","),
        indicatorName: FUND_INDICATORS.join(";"),
        paramOption: ";".repeat(FUND_INDICATORS.length - 1),
      });
      rows.push(...asArray(payload?.data).map(normalizeSnapshot));
    }
    return rows;
  }

  async getAdjustedNav(inputCodes, beginDate, endDate) {
    const codes = [...new Set(inputCodes.map(canonicalFundCode).filter(Boolean))];
    const result = new Map(codes.map(code => [code, []]));
    for (const batch of chunks(codes, 25)) {
      const payload = await this.connection.callTool("THS_DS", {
        thscode: batch.join(","),
        jsonIndicator: "ths_adjustment_nv_fund",
        jsonparam: "",
        globalparam: "Interval:D,Fill:Blank,Days:Tradedays",
        begintime: beginDate,
        endtime: endDate,
      });
      for (const row of asArray(payload?.data)) {
        const fundCode = canonicalFundCode(row?.thscode);
        if (!result.has(fundCode)) result.set(fundCode, []);
        result.get(fundCode).push({
          fundCode,
          date: String(row?.time || ""),
          adjustedNav: Number(row?.ths_adjustment_nv_fund),
          source: "iFinD MCP",
        });
      }
    }
    for (const rows of result.values()) rows.sort((a, b) => a.date.localeCompare(b.date));
    return result;
  }

  async getFundReports(fundCode, beginDate, endDate, reportType = "901") {
    return this.connection.callTool("THS_ReportQuery", {
      thscode: canonicalFundCode(fundCode),
      param: `beginrDate:${beginDate};endrDate:${endDate};reportType:${reportType};mode:allFund`,
      output: "reportDate:Y,thscode:Y,secName:Y,reportTitle:Y,pdfURL:Y",
    });
  }

  async close() {
    await this.connection.close();
  }
}

