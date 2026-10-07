-- 007: a name set in Trove for an account or card, shown instead of the
-- bank's. Syncs never change it (they only write the bank's own columns).
-- Run once in Neon's SQL Editor after 006 (docs/neon-setup.md). Safe to run again.

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS nickname text;
