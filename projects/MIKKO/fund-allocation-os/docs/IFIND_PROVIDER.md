# iFinD Fund Provider

## 状态

2026-08-17 已从“每日复盘更新”工程复用通用 SSE 接入方式，并在 Fund Allocation OS 内建立独立 Provider。密钥不复制到项目，只读取进程环境变量 `IFIND_API_KEY`。

实测结果：

| 项目 | 结果 |
|---|---|
| MCP 工具 | 19 个 |
| 基金所需工具缺失 | 0 |
| 字段参考 | 已验证 |
| 公募基金 Universe | 27,625 个份额类别 |
| 投资类型 | 29 |
| 样本 | `519702.OF` 交银施罗德趋势优先混合A |
| 样本复权净值 | 2026-08-03 至 2026-08-17，共 11 条 |

## 当前能力

- `listFundUniverse()`：通过 `THS_WCQuery` 获取公募基金代码、简称和二级投资类型。
- `getFundSnapshots()`：通过 `THS_BD` 获取名称、类型、投资类型、成立日、规模、经理、公司和业绩基准。
- `getAdjustedNav()`：通过 `THS_DS` 获取复权单位净值时间序列。
- `getFundReports()`：通过 `THS_ReportQuery` 获取基金公告/定期报告元数据。
- `health()`：检查工具、字段参考、样本基本资料与样本净值。

## 已验证字段

| 领域字段 | iFinD 指标/列 |
|---|---|
| 基金代码 | `基金代码` / `thscode` |
| 基金简称 | `基金简称` / `ths_fund_short_name_fund` |
| 二级投资类型 | `基金@投资类型(二级分类)` |
| 基金组织类型 | `ths_fund_type_fund` |
| 基金投资类型 | `ths_fund_invest_type_fund` |
| 成立日 | `ths_fund_establishment_date_fund` |
| 规模 | `ths_fund_scale_fund` |
| 经理代码 | `ths_managerid_fund` |
| 现任经理 | `ths_fund_manager_current_fund` |
| 基金公司 | `ths_fs_cn_name_fund` |
| 业绩基准 | `ths_perf_comparative_benchmark_fund` |
| 复权单位净值 | `ths_adjustment_nv_fund` |

任何新增字段都必须先调用 `lookup_field_reference`，不得猜指标名。

## 运行

```powershell
$env:IFIND_API_KEY = '<仅在安全会话中设置>'
node scripts/check-ifind-fund-provider.mjs
node --test tests/ifind-provider.test.mjs
```

## 后续验收

1. Universe 中同一产品的 A/C/E/H 等份额合并关系。
2. 存续、清盘、暂停申购和流动性状态。
3. 基金经理任期起止与历史经理。
4. AUM 报告期与历史序列口径。
5. 股票、债券、基金和行业持仓的报告期字段。
6. NAV 分红、复权方式、QDII 滞后与非交易日处理。
7. 大批量调用的限流、重试、缓存和请求审计。

## 安全边界

现有 MCP 基础地址是 HTTP。生产环境不得在未确认链路保护的情况下直接使用；必须升级 HTTPS、专线或可信隧道。异常信息会对 `api_key` 查询参数做脱敏，任何日志都不得写入完整连接 URL。

