-- 005: a hand-set answer to "is this a card bill payment?", from the
-- transaction's details: 'card-payment' marks it as one (never income or an
-- expense, no category); 'none' says it isn't (detection no longer applies).
-- Syncs never change it.
-- Run once in Neon's SQL Editor after 004 (docs/neon-setup.md). Safe to run again.

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS transfer_override text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_transfer_override_check') THEN
    ALTER TABLE transactions ADD CONSTRAINT transactions_transfer_override_check CHECK (transfer_override IN ('card-payment', 'none'));
  END IF;
END $$;
