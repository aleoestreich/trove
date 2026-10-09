-- 009: card closing days in the database.
-- - accounts.card_close_day / card_due_day: the closing and due days set by
--   hand for a card (until now kept on each device). Syncs never change them.
-- - card_bills.closing_date: the day each bill closed, when the bank reports
--   it (Pluggy's billClosingDate), filled in from the stored bills.
-- Run once in Neon's SQL Editor after 008 (docs/neon-setup.md). Safe to run again.

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS card_close_day smallint;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS card_due_day smallint;
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_card_days_check;
ALTER TABLE accounts ADD CONSTRAINT accounts_card_days_check CHECK (
  (card_close_day IS NULL AND card_due_day IS NULL)
  OR (card_close_day BETWEEN 1 AND 31 AND card_due_day BETWEEN 1 AND 31)
);

ALTER TABLE card_bills ADD COLUMN IF NOT EXISTS closing_date date;
UPDATE card_bills
SET closing_date = CASE
  WHEN raw->>'billClosingDate' ~ '^\d{4}-\d{2}-\d{2}$' THEN (raw->>'billClosingDate')::date
  ELSE ((raw->>'billClosingDate')::timestamptz AT TIME ZONE 'America/Sao_Paulo')::date
END
WHERE closing_date IS NULL AND raw->>'billClosingDate' ~ '^\d{4}-\d{2}-\d{2}';
