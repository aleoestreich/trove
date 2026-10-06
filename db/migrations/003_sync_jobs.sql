-- 003: background sync. Each Sync creates a job with one item per bank
-- connection; the server works through the items after answering, so the sync
-- continues with the app closed, and the app polls the job for progress.
-- Run once in Neon's SQL Editor after 002 (docs/neon-setup.md). Safe to run again.

BEGIN;

CREATE TABLE IF NOT EXISTS sync_jobs (
  id           text PRIMARY KEY,                -- a UUID
  created_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz                      -- set when no item is queued or running
);
CREATE INDEX IF NOT EXISTS sync_jobs_created_idx ON sync_jobs (created_at DESC);

CREATE TABLE IF NOT EXISTS sync_job_items (
  job_id         text NOT NULL REFERENCES sync_jobs(id) ON DELETE CASCADE,
  connection_id  text NOT NULL,                 -- Pluggy item ID (no FK: it may not be synced yet)
  position       smallint NOT NULL,             -- order within the job
  status         text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'ok', 'failed')),
  started_at     timestamptz,
  finished_at    timestamptz,
  inserted       integer,
  updated        integer,
  removed        integer,
  error          text,                          -- a status code only, never values
  PRIMARY KEY (job_id, connection_id)
);

COMMIT;
