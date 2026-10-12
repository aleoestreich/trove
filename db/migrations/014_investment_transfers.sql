-- 014: money moved into or out of an investment (an aplicação, a resgate, a
-- caixinha) is a transfer: neither income nor an expense. It can be set by
-- hand, like an own transfer or a card bill payment.
-- Run once in Neon's SQL Editor after 013 (docs/neon-setup.md). Safe to run again.

ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_transfer_override_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_transfer_override_check
  CHECK (transfer_override IN ('own', 'card-payment', 'investment', 'none'));
