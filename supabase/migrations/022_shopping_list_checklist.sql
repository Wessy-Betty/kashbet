-- ═══════════════════════════════════════════════════════════════════════════════
--  KashBet / Fedika — Migration 022
--  Make the shopping list a real, dated checklist.
--  Adds the columns the list UI needs: category and unit for each item, and a
--  completed_at timestamp recording WHEN an item was checked off / bought.
--  Additive only.
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE shopping_list_items
  ADD COLUMN IF NOT EXISTS category     TEXT,
  ADD COLUMN IF NOT EXISTS unit         TEXT,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
