-- 011: previdência privada tracked by hand. Each plan is a row of
-- manual_accounts (a name set in Trove, optionally PGBL or VGBL); its balances
-- are rows of manual_balances (kind 'pension') pointing at it, so the history
-- stays and goes with the plan when it's deleted. Whether they're shown is the
-- app_settings key 'pension' ({ "tracking": true }). Syncs never touch them.
-- Run once in Neon's SQL Editor after 010 (docs/neon-setup.md). Safe to run again.

CREATE TABLE IF NOT EXISTS manual_accounts (
  id          text PRIMARY KEY,
  kind        text NOT NULL CHECK (kind IN ('pension')),
  name        text NOT NULL CHECK (length(name) BETWEEN 1 AND 40),
  plan_type   text CHECK (plan_type IN ('PGBL', 'VGBL')),
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE manual_balances ADD COLUMN IF NOT EXISTS account_id text REFERENCES manual_accounts(id) ON DELETE CASCADE;
ALTER TABLE manual_balances DROP CONSTRAINT IF EXISTS manual_balances_kind_check;
ALTER TABLE manual_balances ADD CONSTRAINT manual_balances_kind_check CHECK (kind IN ('fgts', 'pension'));
-- The FGTS is one total; each pension balance belongs to a plan.
ALTER TABLE manual_balances DROP CONSTRAINT IF EXISTS manual_balances_account_check;
ALTER TABLE manual_balances ADD CONSTRAINT manual_balances_account_check CHECK ((kind = 'fgts') = (account_id IS NULL));
CREATE INDEX IF NOT EXISTS manual_balances_account_idx ON manual_balances (account_id, as_of DESC);
