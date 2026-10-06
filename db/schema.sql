-- Trove's database (Postgres on Neon). Run once in Neon's SQL Editor; see
-- docs/neon-setup.md. Safe to run again: every statement is IF NOT EXISTS.
--
-- Shape: Pluggy's model (connection -> account -> transaction, plus card
-- bills), keyed by Pluggy's IDs, so a sync is an upsert. Money is integer cents
-- (bigint), as in the app; Pluggy's decimal amounts are converted on write.
-- Each Pluggy row also keeps its full JSON in `raw`, so a field we don't map
-- today can be used later without fetching it again (Pluggy only returns about
-- the last 12 months; this database is what keeps older history).

-- One connection in Meu Pluggy (one per bank). The bank's accounts hang off it.
CREATE TABLE IF NOT EXISTS bank_connections (
  id                text PRIMARY KEY,            -- Pluggy item.id (Pluggy calls a connection an "item")
  connector_id      integer NOT NULL,
  connector_name    text NOT NULL,               -- "MeuPluggy" for every Meu Pluggy item
  bank_name         text,                        -- Trove's name for it (see server/pluggy/map.ts)
  status            text NOT NULL,               -- UPDATED, LOGIN_ERROR, OUTDATED…
  execution_status  text,
  last_updated_at   timestamptz,                 -- when Pluggy last refreshed it
  created_at        timestamptz,
  raw               jsonb NOT NULL,
  synced_at         timestamptz NOT NULL DEFAULT now()
);

-- Checking, savings and credit-card accounts.
CREATE TABLE IF NOT EXISTS accounts (
  id                      text PRIMARY KEY,      -- Pluggy account.id
  connection_id           text NOT NULL REFERENCES bank_connections(id) ON DELETE CASCADE,  -- Pluggy account.itemId
  type                    text NOT NULL,         -- BANK | CREDIT
  subtype                 text NOT NULL,         -- CHECKING_ACCOUNT | SAVINGS_ACCOUNT | CREDIT_CARD
  name                    text NOT NULL,
  marketing_name          text,
  number                  text,                  -- as Pluggy masks it
  currency_code           char(3) NOT NULL,
  balance_cents           bigint NOT NULL,       -- current balance (card: amount owed)
  -- Credit cards only (creditData):
  credit_limit_cents      bigint,
  available_limit_cents   bigint,
  minimum_payment_cents   bigint,
  balance_close_date      date,
  balance_due_date        date,
  card_brand              text,
  card_level              text,
  raw                     jsonb NOT NULL,
  synced_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS accounts_connection_idx ON accounts (connection_id);

-- Pluggy only reports today's balance; one row per account per day builds the
-- balance and limit history.
CREATE TABLE IF NOT EXISTS account_balances (
  account_id             text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  as_of                  date NOT NULL,          -- day in America/Sao_Paulo
  balance_cents          bigint NOT NULL,
  available_limit_cents  bigint,
  PRIMARY KEY (account_id, as_of)
);

-- Monthly statements of a credit-card account (GET /bills?accountId=), when
-- the bank sends them. The card itself is a row in accounts.
CREATE TABLE IF NOT EXISTS card_bills (
  id                     text PRIMARY KEY,       -- Pluggy bill.id
  account_id             text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  due_date               date NOT NULL,
  total_cents            bigint NOT NULL,
  currency_code          char(3) NOT NULL,
  minimum_payment_cents  bigint,
  allows_installments    boolean,
  finance_charges        jsonb,                  -- interest, IOF, late fees…
  raw                    jsonb NOT NULL,
  synced_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS card_bills_account_due_idx ON card_bills (account_id, due_date);

-- Categories, seeded on first run from the defaults
-- (src/data/categoryCatalog.ts) in the app's language.
CREATE TABLE IF NOT EXISTS categories (
  id          text PRIMARY KEY,                  -- default ones: "home", "groceries"…; new ones: a UUID
  name        text NOT NULL,
  type        text NOT NULL CHECK (type IN ('expense', 'income')),
  color       text NOT NULL,                     -- a colour key, e.g. "orange" (CSS token --cat-orange)
  icon        text NOT NULL,                     -- an icon key, e.g. "fork" (src/assets/icons/categories/)
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS categories_name_idx ON categories (lower(name));

CREATE TABLE IF NOT EXISTS subcategories (
  id           text PRIMARY KEY,
  category_id  text NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name         text NOT NULL,
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS subcategories_name_idx ON subcategories (category_id, lower(name));

CREATE TABLE IF NOT EXISTS transactions (
  id                     text PRIMARY KEY,       -- Pluggy transaction.id
  account_id             text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  card_bill_id           text,                   -- creditCardMetadata.billId (no FK: the bill may not be synced yet)
  provider_id            text,                   -- the bank's own ID, when sent
  date                   timestamptz NOT NULL,
  booked_on              date NOT NULL,          -- `date` as a day in America/Sao_Paulo
  description            text NOT NULL,
  description_raw        text,
  type                   text NOT NULL,          -- DEBIT (out) | CREDIT (in)
  amount_cents           bigint NOT NULL,        -- as Pluggy sends it, in currency_code
  currency_code          char(3) NOT NULL,
  amount_in_account_currency_cents bigint,       -- e.g. a USD card purchase in BRL
  balance_cents          bigint,                 -- account balance after it, when sent
  status                 text,                   -- PENDING | POSTED
  operation_type         text,                   -- PIX, TED, BOLETO, CARTAO…
  pluggy_category        text,
  pluggy_category_id     text,
  -- Card purchases (creditCardMetadata):
  installment_number     smallint,
  total_installments     smallint,
  purchase_total_cents   bigint,
  purchase_date          date,
  card_last_digits       text,
  mcc                    text,                   -- merchant category code
  -- Merchant and payment details:
  merchant_name          text,
  merchant_cnpj          text,
  payment_method         text,                   -- paymentData.paymentMethod
  counterparty_name      text,                   -- the other side of a PIX/TED
  -- Trove's guess on the first sync, then edits only; syncs never change these.
  category_id            text REFERENCES categories(id) ON DELETE SET NULL,
  subcategory_id         text REFERENCES subcategories(id) ON DELETE SET NULL,
  is_hidden              boolean NOT NULL DEFAULT false,  -- left out of every total and chart
  raw                    jsonb NOT NULL,
  pluggy_updated_at      timestamptz,
  first_seen_at          timestamptz NOT NULL DEFAULT now(),
  last_seen_at           timestamptz NOT NULL DEFAULT now(),
  -- Set when a sync no longer finds it (e.g. a PENDING one the bank replaced
  -- with a POSTED one under a new id). Kept, not deleted, and hidden in the app.
  removed_at             timestamptz
);
-- The app's main read: every live transaction since the first month shown,
-- newest first (see "How the app reads it" in docs/neon-setup.md).
CREATE INDEX IF NOT EXISTS transactions_live_booked_idx ON transactions (booked_on DESC, date DESC) WHERE removed_at IS NULL;
-- The sync: an account's live transactions in the window it just fetched, to
-- mark the ones Pluggy no longer returns as removed.
CREATE INDEX IF NOT EXISTS transactions_live_account_idx ON transactions (account_id, booked_on) WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS transactions_card_bill_idx ON transactions (card_bill_id) WHERE card_bill_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS transactions_provider_idx ON transactions (account_id, provider_id) WHERE provider_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS transactions_category_idx ON transactions (category_id) WHERE category_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS transactions_subcategory_idx ON transactions (subcategory_id) WHERE subcategory_id IS NOT NULL;

-- BRL per unit of a foreign currency (e.g. Wise USD), one per currency per
-- day. The sync fetches it, so loading the app calls no rate service; the
-- latest row replaces today's in-memory "last good rate". Not money: a rate.
CREATE TABLE IF NOT EXISTS exchange_rates (
  currency_code  char(3) NOT NULL,
  as_of          date NOT NULL,                 -- day in America/Sao_Paulo
  brl_per_unit   numeric(14, 6) NOT NULL CHECK (brl_per_unit > 0),
  source         text NOT NULL,                 -- AwesomeAPI | Banco Central | ExchangeRate-API
  PRIMARY KEY (currency_code, as_of)
);

-- Trove's own data.

-- Per-card closing and due days, for banks that don't send them.
CREATE TABLE IF NOT EXISTS card_settings (
  account_id   text PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  closing_day  smallint NOT NULL CHECK (closing_day BETWEEN 1 AND 31),
  due_day      smallint NOT NULL CHECK (due_day BETWEEN 1 AND 31),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Bookkeeping.

-- One row per sync, for the debug screen. Counts and status codes only: never
-- amounts, descriptions or credentials.
CREATE TABLE IF NOT EXISTS sync_runs (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  connection_id          text REFERENCES bank_connections(id) ON DELETE CASCADE,
  trigger                text NOT NULL,          -- webhook | manual | schedule
  started_at             timestamptz NOT NULL DEFAULT now(),
  finished_at            timestamptz,
  ok                     boolean,
  transactions_upserted  integer,
  transactions_removed   integer,
  error                  text
);
-- "Last updated" and the debug screen: the latest runs per connection.
CREATE INDEX IF NOT EXISTS sync_runs_connection_started_idx ON sync_runs (connection_id, started_at DESC);

-- Pluggy webhook deliveries, so a repeated delivery is processed once.
CREATE TABLE IF NOT EXISTS webhook_events (
  event_id      text PRIMARY KEY,                -- Pluggy eventId
  event         text NOT NULL,                   -- item/updated, transactions/created…
  connection_id text,                            -- Pluggy itemId
  received_at   timestamptz NOT NULL DEFAULT now(),
  processed_at  timestamptz
);

-- Small app-wide values: when categories were seeded, when everything last synced.
CREATE TABLE IF NOT EXISTS app_settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
