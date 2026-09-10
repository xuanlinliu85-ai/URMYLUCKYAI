# Fund Allocation OS｜Domain Model

## 1. 建模原则

1. 事实快照、分析结果、决策建议分表保存。
2. 任何可变结论带 `as_of`、版本、来源和状态。
3. 金额保存币种；比例统一小数制；日期与时间分开；时间统一 UTC 存储、Asia/Shanghai 展示。
4. 外部基金代码不是内部主键；使用稳定 UUID + `FundIdentifier`。
5. 软删除与审计日志分离，不通过覆盖历史记录“更新结论”。

## 2. 身份与客户

### User

`id, email, phone_hash, role, account_status, password_hash/identity_provider, created_at, updated_at, deleted_at`

### Consent

`id, user_id, consent_type, document_version, granted, granted_at, revoked_at, evidence_ref`

### Client

`id, user_id, advisor_id, client_no, status, base_currency, created_at`

### ClientProfile

`id, client_id, version, effective_at, risk_level, risk_score, investment_goal, horizon_months, liquidity_need, target_return, max_acceptable_drawdown, investment_experience, purchase_mode, current_emotion, constraints_json, questionnaire_version, approved_by`

ClientProfile 不可原地覆盖；新评估生成新版本。

## 3. 基金与全市场 Universe

### Fund

`id, canonical_name, fund_type, strategy_type, domicile, status, inception_date, benchmark_id, company_id`

### FundIdentifier

`id, fund_id, identifier_type, identifier_value, share_class, valid_from, valid_to, source_id`

### FundUniverseRecord

`id, fund_id, universe_date, peer_group_id, manager_id, manager_start_date, aum, aum_currency, nav, nav_date, return_1y, return_3y, return_5y, volatility, max_drawdown, sharpe, sortino, calmar, peer_percentile, style_tags, sector_exposure, data_quality_status, source_snapshot_id`

### ComparableGroup

`id, code, name, parent_id, definition, inclusion_rules, exclusion_rules, version, active_from`

### FundManager / ManagerTenure

`FundManager(id, name, profile)`；`ManagerTenure(id, manager_id, fund_id, start_date, end_date, role, source_snapshot_id)`。

### NavObservation / HoldingSnapshot / AumSnapshot

时间序列事实表，均含 `fund_id, observation_date/period_end, value, source_snapshot_id, quality_status`。持仓额外包含 security、weight、market_value、rank、disclosure_date。

## 4. 研究、评价与基金池

### FundResearch

`id, fund_id, as_of, research_type, facts_json, return_sources, risk_sources, style_assessment, manager_assessment, market_fit, evidence_refs, limitations, status, version, workflow_run_id`

### FundEvaluation

`id, fund_id, evaluation_date, model_version, total_score, rating(A/B/C/D), return_score, risk_score, manager_score, style_score, consistency_score, risk_flags, suitable_roles, suitable_clients, conclusion, source_version, status, reviewer`

### FundRole

枚举：`CORE_EQUITY, ALPHA_EQUITY, GROWTH_SATELLITE, DIVIDEND_DEFENSIVE, CORE_BOND, BOND_PLUS, GOLD_HEDGE, OVERSEAS, ALTERNATIVE, CASH_MANAGEMENT`。

### FundScreeningRun / FundScreeningCandidate

- Run：`id, universe_date, peer_group_id, total_funds, eligible_funds, rules_version, ranking_model_version, status`。
- Candidate：`run_id, fund_id, rank, percentile, quantitative_score, risk_score, consistency_score, manager_stability_score, flags, reason`。

### FundSimilarity

`id, as_of, fund_a_id, fund_b_id, return_correlation, holding_overlap, sector_similarity, style_similarity, overall_similarity, method_version`

### FundPool / FundPoolMembership

- Pool：按角色和可比组分 Bucket。
- Membership：`fund_id, pool_id, tier(core/alternative/watchlist), status, valid_from, valid_to, decision_reason, evaluation_id, approved_by`。

## 5. 资产配置与组合

### AssetAllocation / AssetAllocationTarget

- Allocation：`id, client_id, version, methodology, effective_at, status, approved_by`。
- Target：`asset_class, target_weight, min_weight, max_weight, risk_budget, rebalance_threshold`。

资产类别至少：权益、固收、现金、黄金、海外、另类。

### Portfolio / PortfolioHolding

- Portfolio：`id, client_id, name, base_currency, status, valuation_date`。
- Holding：`id, portfolio_id, fund_id, as_of, units, market_value, cost_basis, weight, source_snapshot_id`。

### PortfolioEvaluation

`id, portfolio_id, as_of, cumulative_return, annualized_return, excess_return, volatility, max_drawdown, var_95, sharpe, calmar, sortino, fund_concentration, asset_concentration, sector_concentration, correlation_summary, factor_exposure, biggest_problem, biggest_risk, adjustment_needed, priority, calculation_version`

### RebalanceProposal / RebalanceTrade

- Proposal：`id, portfolio_id, trigger_event_id, target_allocation_id, status, rationale, expected_effect, constraint_results, created_by, reviewed_by, version`。
- Trade：`fund_id, action, current_weight, target_weight, delta_weight, estimated_amount, priority, reason`。

## 6. 适当性、建议与沟通

### SuitabilityAssessment

`id, client_profile_id, proposal_id, rules_version, outcome(pass/fail/escalate), rule_results, missing_fields, reviewed_by`

### Recommendation

`id, client_id, portfolio_id, recommendation_type, created_at, created_by, workflow_run_id, data_snapshot_ids, skills_used, reasoning_summary, risk_disclosure, compliance_status, reviewer, version, supersedes_id`

### ClientCommunication

`id, client_id, event_id, recommendation_id, channel, audience_state, template_version, approved_facts, content, status(draft/reviewed/sent/archived), reviewer, sent_at`

AI 只能解释 `approved_facts`，不能在 Communication 层新增基金、比例或行动建议。

## 7. 事件、工作流和审计

### Event

`id, event_type, detected_at, effective_at, severity, subject_type, subject_id, payload, rule_version, status, dedup_key`

事件类型包括：`PortfolioDrawdown3/5/10, FundUnderperform, FundManagerChange, FundRatingDowngrade, AllocationDeviation, TargetReturnReached, MarketShock, QuarterlyReview, DataQualityIncident`。

### WorkflowDefinition / WorkflowRun / WorkflowStepRun

- Definition：名称、版本、步骤 DAG、输入/输出 schema。
- Run：`id, definition_id, subject_id, status, input_hash, started_at, finished_at, initiated_by`。
- StepRun：`workflow_run_id, step_key, status, input_snapshot, output_ref, attempt, error_code, started_at, finished_at`。

### SkillDefinition / SkillRun / SkillResult

- Definition：`name, version, execution_type, input_schema, output_schema, source_ref, enabled`。
- Run：`workflow_run_id, skill_definition_id, status, input_hash, model_version, prompt_hash, started_at, finished_at`。
- Result：`structured_output, narrative_output, warnings, source_ids`。

### DataSource / DataSourceSnapshot / DataQualityIssue

- DataSource：provider、dataset、license_scope、priority、active。
- Snapshot：request、as_of、ingested_at、raw_hash、storage_ref、schema_version、quality_status。
- Issue：field、issue_type、severity、conflicting_sources、resolution_status、reviewer。

### AuditLog

`id, actor_id, action, object_type, object_id, before_hash, after_hash, reason, request_id, occurred_at`。

## 8. 关键关系与门禁

```text
Client → ClientProfile → AssetAllocation → Portfolio
Portfolio → Holdings → PortfolioEvaluation → RebalanceProposal
Fund → UniverseRecord → Research → Evaluation → PoolMembership
ClientProfile + PoolMembership + Portfolio constraints → Recommendation
Recommendation → SuitabilityAssessment → Compliance approval → ClientCommunication
WorkflowRun → StepRuns → SkillRuns/DataSnapshots → AuditLog
```

数据库约束：

- 同一基金/可比组/日期/模型版本只能有一条有效评价。
- `fund_a_id < fund_b_id`，避免相似度重复对。
- PortfolioHolding 权重和允许有容差，但必须有校验状态。
- 未 `pass` 的 SuitabilityAssessment 不得把 Recommendation 改为 approved。
- 未 approved 的 Recommendation 不得生成 `sent` 状态的客户沟通。

