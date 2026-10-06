-- 002: categories live in the database, transactions carry their
-- category, subcategory and "hidden" flag, and syncs are recorded.
--
-- For a database created from db/schema.sql before this change (PR #33). Run
-- it once in Neon's SQL Editor (docs/neon-setup.md). It replaces three tables
-- that nothing has written to yet (user_categories, subcategories,
-- transaction_overrides); everything else is kept. Running it again is safe.

BEGIN;

DROP TABLE IF EXISTS transaction_overrides;
DROP TABLE IF EXISTS user_categories;
-- The old subcategories table had no foreign key; replaced below.
DROP TABLE IF EXISTS subcategories CASCADE;

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

-- A transaction's category: Trove's guess on its first sync, then edits
-- only. Syncs never change these three columns once the row exists.
-- Deleting a category leaves its transactions uncategorized (SET NULL).
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS category_id    text REFERENCES categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS subcategory_id text REFERENCES subcategories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_hidden      boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS transactions_category_idx ON transactions (category_id) WHERE category_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS transactions_subcategory_idx ON transactions (subcategory_id) WHERE subcategory_id IS NOT NULL;

-- Small app-wide values: when categories were seeded, when everything last synced.
CREATE TABLE IF NOT EXISTS app_settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMIT;
