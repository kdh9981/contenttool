-- Approval workflow schema: content packages + event-sourced audit trail.
-- State machine: draft → internal_review → approved → client_review → final
-- Rejection loops back to draft with feedback for AI re-generation.

-- ============================================================
-- ENUM types
-- ============================================================
CREATE TYPE approval_status AS ENUM (
  'draft',
  'internal_review',
  'approved',
  'rejected',
  'client_review',
  'revision_requested',
  'final'
);

-- ============================================================
-- 1. Content packages — one row per generated content package
-- ============================================================
CREATE TABLE content_packages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          UUID NOT NULL REFERENCES jobs(job_id),
  title           TEXT NOT NULL,
  status          approval_status NOT NULL DEFAULT 'draft',

  -- Generated content payload
  content_type    TEXT NOT NULL DEFAULT 'brief',  -- brief, image, video, copy
  content_body    JSONB NOT NULL DEFAULT '{}'::JSONB,
  -- e.g. { "brief_text": "...", "image_urls": [...], "copy_variants": [...] }

  -- Metadata
  platform        platform_type,
  target_audience TEXT,
  created_by      TEXT,                  -- agent or user who triggered generation
  assigned_reviewer TEXT,                -- internal reviewer assigned

  -- Timestamps
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_content_packages_status ON content_packages (status);
CREATE INDEX idx_content_packages_job ON content_packages (job_id);
CREATE INDEX idx_content_packages_reviewer ON content_packages (assigned_reviewer)
  WHERE assigned_reviewer IS NOT NULL;

ALTER TABLE content_packages ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. Approval events — immutable audit trail
-- ============================================================
CREATE TABLE approval_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id      UUID NOT NULL REFERENCES content_packages(id),
  from_status     approval_status NOT NULL,
  to_status       approval_status NOT NULL,
  triggered_by    TEXT NOT NULL,          -- user email, agent name, or system
  feedback        TEXT,                   -- rejection/revision notes
  metadata        JSONB DEFAULT '{}'::JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_approval_events_package ON approval_events (package_id, created_at);

ALTER TABLE approval_events ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. Auto-update updated_at on content_packages
-- ============================================================
CREATE OR REPLACE FUNCTION update_content_packages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_content_packages_updated_at
  BEFORE UPDATE ON content_packages
  FOR EACH ROW
  EXECUTE FUNCTION update_content_packages_updated_at();
