-- 008: Mercado Livre is a marketplace, not a supermarket. Purchases the sync
-- guessed as groceries ("Mercado") because of "mercado" in the merchant's name
-- move to shopping ("Compras"), with no subcategory. Categories set by hand
-- (category_edited_at) are left alone. New syncs guess this way already
-- (server/pluggy/map.ts, MERCADO_LIVRE).
-- Run once in Neon's SQL Editor after 007 (docs/neon-setup.md). Safe to run again.

UPDATE transactions SET category_id = 'shopping', subcategory_id = NULL
WHERE category_id = 'groceries'
  AND category_edited_at IS NULL
  AND EXISTS (SELECT 1 FROM categories WHERE id = 'shopping')
  AND concat_ws(' ', description, description_raw, merchant_name, raw->'merchant'->>'businessName') ~* '\mmercado\s*livre\M|\mmercadolivre';
