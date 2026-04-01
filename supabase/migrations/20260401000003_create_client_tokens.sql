-- Client review tokens — token-based auth for the client review portal.
-- Each token is scoped to a single job and optionally time-limited.

CREATE TABLE client_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token         TEXT NOT NULL UNIQUE,
  client_name   TEXT NOT NULL,
  client_email  TEXT,
  job_id        UUID NOT NULL REFERENCES jobs(job_id) ON DELETE CASCADE,
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_tokens_token ON client_tokens (token);
CREATE INDEX idx_client_tokens_job ON client_tokens (job_id);

ALTER TABLE client_tokens ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS for backend token management.
-- Authenticated internal users can manage tokens.
CREATE POLICY "Authenticated users can manage client_tokens"
  ON client_tokens FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
