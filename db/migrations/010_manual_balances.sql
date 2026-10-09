-- 010: balances typed in by hand, for what no bank connection reports. One
-- row per update, so the history stays; `kind` says what it is (today only
-- 'fgts', the FGTS total). Whether the FGTS balance is shown is the
-- app_settings key 'fgts' ({ "tracking": true }). Syncs never touch them.
-- Run once in Neon's SQL Editor after 009 (docs/neon-setup.md). Safe to run again.

CREATE TABLE IF NOT EXISTS manual_balances (
  id             text PRIMARY KEY,
  kind           text NOT NULL CHECK (kind IN ('fgts')),
  as_of          date NOT NULL,                  -- the day the balance refers to
  balance_cents  bigint NOT NULL CHECK (balance_cents >= 0),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS manual_balances_kind_idx ON manual_balances (kind, as_of DESC);
