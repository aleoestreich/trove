-- 006: the hand-set answer can also mark a transaction as a transfer between
-- own accounts ('own'), next to 'card-payment' and 'none'.
-- Run once in Neon's SQL Editor after 005 (docs/neon-setup.md). Safe to run again.

ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_transfer_override_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_transfer_override_check CHECK (transfer_override IN ('own', 'card-payment', 'none'));
