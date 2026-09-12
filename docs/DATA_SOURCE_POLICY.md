# Data source policy

| Data | Primary | Fallback | Freshness | Consumer |
| --- | --- | --- | --- | --- |
| A-share historical prices | iFinD | Tencent | trading day | Daily Review |
| A-share intraday prices | configured primary provider | configured backup provider | minute-level | Daily Review |
| Company filings and reported facts | official filing / iFinD structured data | company IR release | reporting period | earnings-analysis |
| Professional consensus | iFinD pre-event snapshot | verified published consensus | as-of timestamp before event | earnings-analysis |
| Macro indicators | official source / licensed structured source | documented secondary source | indicator release cycle | Analyst Dream Team / MIKKO |
| Candlestick series | iFinD | Tencent | trading day | Research UI |

Every dataset records provider, observation or reporting period, accessed time, freshness and reconciliation status. Official filings are the source of record for reported company facts. Conflicts remain explicit until period, unit, currency and accounting basis reconcile.

iFinD currently includes a legacy HTTP SSE endpoint with an API key query parameter. Local compatibility remains available with an explicit runtime warning. `IFIND_REQUIRE_SECURE_TRANSPORT=1` enforces HTTPS. `IFIND_ALLOW_INSECURE_HTTP=1` records an authorized legacy environment. Production deployment should place the provider behind a verified HTTPS, trusted VPN or tunnel path before enabling strict transport.
