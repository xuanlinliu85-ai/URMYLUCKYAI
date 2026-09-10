import { connectIfind } from "file:///C:/Users/urmylucky/Documents/%E6%AF%8F%E6%97%A5%E5%A4%8D%E7%9B%98%E6%9B%B4%E6%96%B0/scripts/ifind-mcp-client.mjs";

const connection = await connectIfind({ timeoutMs: 45_000 });
const output = {};

async function call(label, name, args) {
  output[label] = await connection.callTool(name, args);
}

try {
  const cumulativeDates = [
    "20230630", "20231231", "20240630", "20240930", "20241231",
    "20250331", "20250630", "20250930", "20251231", "20260331", "20260630"
  ];
  for (const date of cumulativeDates) {
    await call(`financial_${date}`, "THS_BD", {
      thsCode: "600989.SH",
      indicatorName: "ths_revenue_stock;ths_np_atoopc_stock;ths_gross_profit_stock;ths_ncf_from_oa_stock;ths_basic_eps_stock",
      paramOption: `${date};${date};${date};${date};${date}`
    });
  }

  await call("balance_20260630", "THS_BD", {
    thsCode: "600989.SH",
    indicatorName: "ths_total_assets_stock;ths_total_liab_stock;ths_currency_fund_stock;ths_inventory_stock;ths_accounts_rece_stock",
    paramOption: "20260630,100;20260630,100;20260630,100;20260630,100;20260630"
  });
  await call("balance_20251231", "THS_BD", {
    thsCode: "600989.SH",
    indicatorName: "ths_total_assets_stock;ths_total_liab_stock;ths_currency_fund_stock;ths_inventory_stock;ths_accounts_rece_stock",
    paramOption: "20251231,100;20251231,100;20251231,100;20251231,100;20251231"
  });

  for (const date of ["20260812", "20260904"]) {
    await call(`consensus_${date}`, "THS_BD", {
      thsCode: "600989.SH",
      indicatorName: "ths_fore_mbi_fy1_stock;ths_fore_np_fy1_stock;ths_fore_eps_fy1_stock;ths_fore_np_fy2_stock",
      paramOption: `${date};${date};${date};${date}`
    });
    await call(`valuation_${date}`, "THS_BD", {
      thsCode: "600989.SH",
      indicatorName: "ths_pe_ttm_stock;ths_pb_mrq_stock;ths_ps_ttm_stock;ths_market_value_stock;ths_dividend_yield_ttm_ex_sd_stock",
      paramOption: `${date};${date};${date};${date};${date}`
    });
  }

  await call("price_stock", "THS_HQ", {
    thscode: "600989.SH",
    jsonIndicator: "close;changeRatio;amount;turnoverRatio",
    jsonparam: "CPS:2,Interval:D,Fill:Previous,Days:Tradedays",
    begintime: "2026-06-01",
    endtime: "2026-09-04"
  });
  await call("price_csi300", "THS_HQ", {
    thscode: "000300.SH",
    jsonIndicator: "close;changeRatio",
    jsonparam: "CPS:2,Interval:D,Fill:Previous,Days:Tradedays",
    begintime: "2026-06-01",
    endtime: "2026-09-04"
  });
} finally {
  await connection.close();
}

process.stdout.write(JSON.stringify(output, null, 2));
