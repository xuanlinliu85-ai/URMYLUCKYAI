import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const sourceSnapshots = sqliteTable("source_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sourceKind: text("source_kind").notNull(),
  sourceKey: text("source_key").notNull(),
  marketDate: text("market_date").notNull(),
  sourceUrl: text("source_url"),
  publishedAt: text("published_at"),
  payloadHash: text("payload_hash").notNull(),
  rowCount: integer("row_count").notNull().default(0),
  importedAt: text("imported_at").notNull(),
}, (table) => [
  uniqueIndex("source_snapshot_identity").on(table.sourceKind, table.sourceKey),
  index("source_snapshot_market_date").on(table.marketDate),
]);

export const rankRows = sqliteTable("rank_rows", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  snapshotId: integer("snapshot_id").notNull().references(() => sourceSnapshots.id, { onDelete: "cascade" }),
  universe: text("universe").notNull(),
  rank: integer("rank").notNull(),
  name: text("name").notNull(),
  code: text("code").notNull(),
  changeRaw: real("change_raw"),
  signalText: text("signal_text").notNull().default(""),
  metricJson: text("metric_json").notNull(),
}, (table) => [
  uniqueIndex("rank_row_identity").on(table.snapshotId, table.universe, table.code),
  index("rank_row_universe_rank").on(table.snapshotId, table.universe, table.rank),
]);

export const pipelineRuns = sqliteTable("pipeline_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runKey: text("run_key").notNull().unique(),
  status: text("status").notNull(),
  sourceUpdatedAt: text("source_updated_at"),
  startedAt: text("started_at").notNull(),
  completedAt: text("completed_at"),
  errorMessage: text("error_message"),
});

/**
 * 宏观高频监测 · 时序观测表
 *
 * 设计要点（Spec §12 / §14 / §25）：
 * - `observationDate` 是数据的**观测期**（如 2026-07-31 的 CPI），`releaseDate` 是**发布时刻**。
 *   两者分离后，宏观数据修订（vintage）可以自然并存，而不是覆盖。
 * - 唯一约束 `(indicatorId, observationDate, releaseDate)` 允许同一观测期存在多个 vintage，
 *   但从结构上禁止「月度 CPI 被每日重复写入」——这正是 Spec §12 的硬要求。
 * - 指标主数据（名称/频率/方向/权重）不落库，由 `indicator_registry.yaml` 承担，因此不建 master 表。
 */
export const macroObservations = sqliteTable("macro_observations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  indicatorId: text("indicator_id").notNull(),
  observationDate: text("observation_date").notNull(),
  releaseDate: text("release_date"),
  fetchedAt: text("fetched_at").notNull(),
  value: real("value"),
  frequency: text("frequency").notNull(),
  source: text("source").notNull(),
  sourceField: text("source_field").notNull(),
  versionHash: text("version_hash").notNull(),
}, (table) => [
  uniqueIndex("macro_observation_vintage").on(table.indicatorId, table.observationDate, table.releaseDate),
  index("macro_observation_series").on(table.indicatorId, table.observationDate),
  index("macro_observation_fetched").on(table.fetchedAt),
]);

export const refreshRequests = sqliteTable("refresh_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  requestedBy: text("requested_by").notNull(),
  requestedAt: text("requested_at").notNull(),
  status: text("status").notNull().default("pending"),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  requestedSnapshotDate: text("requested_snapshot_date"),
  resultTradeDate: text("result_trade_date"),
  message: text("message"),
}, (table) => [
  index("idx_refresh_requests_status_requested_at").on(table.status, table.requestedAt),
]);
