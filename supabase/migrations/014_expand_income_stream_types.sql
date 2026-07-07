-- ═══════════════════════════════════════════════════════════════════════════════
--  KashBet — Migration 014
--  Expand the income_streams.type check constraint to match the same category
--  list used for the "Income" subcategory in Add Transaction, so the Income
--  Tracker page can offer the same categories.
--
--  The original 7 values are kept in the constraint (not the dropdown) so any
--  existing income streams created before this change remain valid.
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE income_streams DROP CONSTRAINT IF EXISTS income_streams_type_check;

ALTER TABLE income_streams
  ADD CONSTRAINT income_streams_type_check
  CHECK (type IN (
    -- original values — kept for backward compatibility with existing rows
    'salary', 'freelance', 'business', 'investment', 'family_support', 'rental',
    -- new categories, matching the Income subcategory list ('paycheck' dropped —
    -- 'salary' above already covers it, no need for both)
    'bonus', 'transfer_from_savings', 'cash', 'rent', 'water',
    'water_refill', 'food', 'gifts', 'internet', 'airtime', 'debts_paid',
    'shopping', 'electricity', 'dividends', 'holding_for_another', 'loan',
    'interest_income', 'refunds',
    'other'
  ));

-- ════════════════════════════════════════════════════════════════════════════
--  END OF MIGRATION 014
-- ════════════════════════════════════════════════════════════════════════════
