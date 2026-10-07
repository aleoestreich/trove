-- 004: marks categories set by an edit, so a sync or a read never replaces
-- them: not with a guess, not by pairing the transaction as an own transfer,
-- and not when the bank replaces a pending transaction with a posted one under
-- a new ID (the edit moves to the new row).
-- Run once in Neon's SQL Editor after 003 (docs/neon-setup.md). Safe to run again.

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS category_edited_at timestamptz;
