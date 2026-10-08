-- 008: advanced sync. A sync job keeps how far back it reads (period) and
-- which accounts and cards it reads (account_ids, null: all). Each account
-- keeps when its transactions were last read, so an account left out of a
-- sync still gets everything since its own last read.
-- Run once in Neon's SQL Editor after 007 (docs/neon-setup.md). Safe to run again.

ALTER TABLE sync_jobs ADD COLUMN IF NOT EXISTS period text NOT NULL DEFAULT 'default';
ALTER TABLE sync_jobs DROP CONSTRAINT IF EXISTS sync_jobs_period_check;
ALTER TABLE sync_jobs ADD CONSTRAINT sync_jobs_period_check CHECK (period IN ('default', '3m', '6m', '1y', 'all'));
ALTER TABLE sync_jobs ADD COLUMN IF NOT EXISTS account_ids text[];

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS transactions_synced_at timestamptz;
