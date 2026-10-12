-- 012: "Equilíbrio do mês". Each expense category may be in a spending group,
-- Essencial ('essential') or Estilo de vida ('lifestyle'); a subcategory may
-- be in a group of its own (NULL: it follows its category). The target split
-- is the app_settings key 'balance_target' ({ "essential": 50, "lifestyle":
-- 30, "future": 20 }; the defaults when absent). Syncs never touch them.
-- Run once in Neon's SQL Editor after 011 (docs/neon-setup.md). Safe to run again.

ALTER TABLE categories ADD COLUMN IF NOT EXISTS spending_group text;
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_spending_group_check;
ALTER TABLE categories ADD CONSTRAINT categories_spending_group_check
  CHECK (spending_group IN ('essential', 'lifestyle') AND type = 'expense' OR spending_group IS NULL);

ALTER TABLE subcategories ADD COLUMN IF NOT EXISTS spending_group text;
ALTER TABLE subcategories DROP CONSTRAINT IF EXISTS subcategories_spending_group_check;
ALTER TABLE subcategories ADD CONSTRAINT subcategories_spending_group_check
  CHECK (spending_group IN ('essential', 'lifestyle') OR spending_group IS NULL);
