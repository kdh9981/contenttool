-- Add competitor_benchmark JSONB column to trend_analysis table.
-- Stores per-platform competitor vs. category engagement comparison.
alter table trend_analysis
  add column if not exists competitor_benchmark jsonb default null;

comment on column trend_analysis.competitor_benchmark is
  'JSON object comparing competitor avg engagement vs category avg. Null if no competitor accounts configured.';
