-- Phase 1 schema: jobs, video_records, trend_analysis
-- Per PRD §5.4 — AI Content Intelligence Platform

-- ============================================================
-- Extensions
-- ============================================================
create extension if not exists "uuid-ossp" with schema extensions;

-- ============================================================
-- ENUM types
-- ============================================================
create type job_status as enum ('queued', 'running', 'completed', 'failed');
create type platform_type as enum ('tiktok', 'instagram', 'facebook', 'youtube');

-- ============================================================
-- 1. Jobs table
-- ============================================================
create table jobs (
    job_id          uuid primary key default extensions.uuid_generate_v4(),
    created_at      timestamptz not null default now(),
    company_name    text not null,
    product_name    text not null,
    product_category text not null,
    target_icp      text not null,
    target_country  text not null,
    competitor_accounts jsonb default '[]'::jsonb,
    analysis_period_start date not null,
    analysis_period_end   date not null,
    platforms       jsonb not null default '["tiktok","instagram","facebook","youtube"]'::jsonb,
    status          job_status not null default 'queued'
);

comment on table jobs is 'Analysis job metadata — one row per user-initiated or scheduled analysis run.';

-- ============================================================
-- 2. Video Records table
-- ============================================================
create table video_records (
    record_id              uuid primary key default extensions.uuid_generate_v4(),
    job_id                 uuid not null references jobs(job_id) on delete cascade,
    platform               platform_type not null,
    video_id               text not null,
    video_url              text not null,
    published_at           timestamptz,
    creator_username       text,
    creator_follower_count bigint,
    creator_verified       boolean default false,
    like_count             bigint default 0,
    comment_count          bigint default 0,
    share_count            bigint default 0,
    view_count             bigint default 0,
    caption                text,
    hashtags               jsonb default '[]'::jsonb,
    audio_id               text,          -- TikTok only
    duration_seconds       integer,
    media_type             text,          -- image, video, reel, carousel, short
    transcript             text,
    thumbnail_url          text,
    raw_data               jsonb,         -- full API response
    collected_at           timestamptz not null default now()
);

comment on table video_records is 'Extracted video data per platform — one row per video per job.';

-- ============================================================
-- 3. Trend Analysis table
-- ============================================================
create table trend_analysis (
    analysis_id              uuid primary key default extensions.uuid_generate_v4(),
    job_id                   uuid not null references jobs(job_id) on delete cascade,
    platform                 text not null,
    period_start             date not null,
    period_end               date not null,
    top_videos               jsonb default '[]'::jsonb,   -- array of record_ids ranked by engagement
    engagement_score_formula text not null default '(likes * 1) + (comments * 2) + (shares * 3) + (views / 1000)',
    top_hashtags             jsonb default '[]'::jsonb,
    top_content_themes       jsonb default '[]'::jsonb,
    avg_like_count           double precision,
    avg_view_count           double precision,
    avg_comment_count        double precision,
    content_brief            text,         -- AI-generated brief
    generated_at             timestamptz not null default now()
);

comment on table trend_analysis is 'Scored results per platform per job — engagement rankings, themes, and AI content brief.';

-- ============================================================
-- Indexes
-- ============================================================

-- Jobs: status lookup for scheduler
create index idx_jobs_status on jobs(status);

-- Video records: FK + common query patterns
create index idx_video_records_job_id on video_records(job_id);
create index idx_video_records_platform on video_records(platform);
create index idx_video_records_published_at on video_records(published_at);
create index idx_video_records_job_platform on video_records(job_id, platform);

-- Trend analysis: FK + platform lookup
create index idx_trend_analysis_job_id on trend_analysis(job_id);
create index idx_trend_analysis_platform on trend_analysis(platform);

-- ============================================================
-- Row Level Security
-- ============================================================

alter table jobs enable row level security;
alter table video_records enable row level security;
alter table trend_analysis enable row level security;

-- Service role (backend) can do everything.
-- These policies use the built-in `auth.role()` function.
-- Phase 1 is internal-only; we allow authenticated users full access.
-- Phase 3 (client portal) will add scoped read policies per client.

create policy "Authenticated users can read jobs"
    on jobs for select
    to authenticated
    using (true);

create policy "Authenticated users can insert jobs"
    on jobs for insert
    to authenticated
    with check (true);

create policy "Authenticated users can update jobs"
    on jobs for update
    to authenticated
    using (true)
    with check (true);

create policy "Authenticated users can read video_records"
    on video_records for select
    to authenticated
    using (true);

create policy "Authenticated users can insert video_records"
    on video_records for insert
    to authenticated
    with check (true);

create policy "Authenticated users can read trend_analysis"
    on trend_analysis for select
    to authenticated
    using (true);

create policy "Authenticated users can insert trend_analysis"
    on trend_analysis for insert
    to authenticated
    with check (true);

create policy "Authenticated users can update trend_analysis"
    on trend_analysis for update
    to authenticated
    using (true)
    with check (true);

-- Service role bypasses RLS, so backend pipelines (using service_role key)
-- have unrestricted access without needing explicit policies.
