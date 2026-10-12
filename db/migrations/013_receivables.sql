-- 013: "A receber". Money paid on someone else's behalf: each receivable is
-- part or all of an expense (a purchase or a Pix out) owed by a person; its
-- payments back are rows of receivable_payments, each from an incoming
-- transaction (a Pix received) or typed in by hand (transaction_id NULL).
-- Syncs never change them; when a bank replaces a transaction under a new ID,
-- the sync points them at the new one (server/db/sync.ts, carryEdits).
-- Run once in Neon's SQL Editor after 012 (docs/neon-setup.md). Safe to run again.

CREATE TABLE IF NOT EXISTS receivables (
  id              text PRIMARY KEY,
  transaction_id  text NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,  -- the expense paid on their behalf
  person          text NOT NULL CHECK (length(person) BETWEEN 1 AND 40),
  amount_cents    bigint NOT NULL CHECK (amount_cents > 0),                      -- what they owe, in BRL
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS receivables_transaction_idx ON receivables (transaction_id);

CREATE TABLE IF NOT EXISTS receivable_payments (
  id              text PRIMARY KEY,
  receivable_id   text NOT NULL REFERENCES receivables(id) ON DELETE CASCADE,
  transaction_id  text REFERENCES transactions(id) ON DELETE SET NULL,          -- the money that came in; NULL: typed in by hand
  received_on     date NOT NULL,
  amount_cents    bigint NOT NULL CHECK (amount_cents > 0),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS receivable_payments_receivable_idx ON receivable_payments (receivable_id);
CREATE INDEX IF NOT EXISTS receivable_payments_transaction_idx ON receivable_payments (transaction_id) WHERE transaction_id IS NOT NULL;
