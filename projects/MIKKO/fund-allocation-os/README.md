# Fund Allocation OS

面向中国公募基金全市场的客户基金配置网站与专业投顾后台。

本项目是独立新项目。`upstream/OPC-skill` 仅作为只读上游能力库用于审计和适配，不复用或修改 `MATT`、`MIKKO` 的现有业务代码。

## 当前状态

- Phase 0 仓库与 Skill 审计已完成。
- 架构、领域模型和 MVP 实施计划已建立。
- iFinD Fund Provider 已接入：实测 27,625 个基金份额类别、29 个投资类型，单基金基本资料与复权净值通过。
- Phase 1 可运行后端骨架已建立：FastAPI、SQLite/SQLAlchemy、Alembic、34 张业务表、审批状态机与审计日志。
- Phase 2 计算引擎与 Skill Adapter 已建立：14 个核心 Adapter、全市场数据质量、可比组、筛选器和来源快照门禁。
- Phase 3 五条 Workflow 已建立：全市场发现、单基金研究、客户组合诊断、基金池维护和事件陪伴。
- Phase 4 Client Portal 与 Advisor Console 已建立：19 个响应式网站路由和 Sites 生产构建。
- Phase 5 安全边界已建立：签名身份、服务器端 RBAC、职责分离、Consent 审计与限流。
- Phase 6 监控自动化已完成：六类任务、幂等运行、重试、dead-letter 和人工待办边界。

## 基线文档

- [SKILL_AUDIT.md](SKILL_AUDIT.md)
- [ARCHITECTURE.md](ARCHITECTURE.md)
- [DOMAIN_MODEL.md](DOMAIN_MODEL.md)
- [MVP_PLAN.md](MVP_PLAN.md)
- [docs/IFIND_PROVIDER.md](docs/IFIND_PROVIDER.md)
- [docs/PHASE_1_DELIVERY.md](docs/PHASE_1_DELIVERY.md)
- [docs/CALCULATION_METHODOLOGY.md](docs/CALCULATION_METHODOLOGY.md)
- [docs/PHASE_2_DELIVERY.md](docs/PHASE_2_DELIVERY.md)
- [docs/PHASE_3_DELIVERY.md](docs/PHASE_3_DELIVERY.md)
- [docs/PHASE_4_DELIVERY.md](docs/PHASE_4_DELIVERY.md)
- [docs/PHASE_5_DELIVERY.md](docs/PHASE_5_DELIVERY.md)
- [docs/SECURITY.md](docs/SECURITY.md)
- [docs/PHASE_6_DELIVERY.md](docs/PHASE_6_DELIVERY.md)

## 不可变原则

1. Client First：先画像与 SAA，再选基金。
2. 全市场筛选与客户适配分离。
3. 研究、评价、推荐、客户沟通分层。
4. 计算、规则、评级和再平衡确定性优先。
5. 数据必须带来源、口径、时间戳和质量状态。
6. 同花顺 MCP/iFinD 为首选专业数据源；缺失字段明确降级，不猜数。
7. MVP 仅生成建议，真实交易必须人工批准并由外部受控系统执行。

## 本地运行

```powershell
.\.venv\Scripts\python.exe -m pip install -r apps\api\requirements.txt
$env:PYTHONPATH = "apps\api"
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m fund_allocation_api sync-skills
.\.venv\Scripts\python.exe -m fund_allocation_api serve
```

API 健康检查：`GET /health`；iFinD 主数据源检查：`GET /api/v1/providers/ifind/health`。

运行测试：

```powershell
$env:PYTHONPATH = "apps\api"
.\.venv\Scripts\python.exe -m pytest apps\api\tests
```
