-- ═══════════════════════════════════════════════════════════════════════════════
--  KashBet — Migration 010
--  Category restructure:
--   • Add "Household Shopping" (non-food supplies — distinct from Groceries)
--   • Add "Loans & Lending" (giving/receiving loans — a transfer, not a debt payment)
--   • Renumber sort_order into a clean, logical spending-first order
--  Non-destructive: no categories are deleted, existing transactions keep their links.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Add the two new categories (id fixed so they are stable across environments) ──
INSERT INTO transaction_categories (id, name, classification, icon, is_system, sort_order) VALUES
    ('00000000-0019-0000-0000-000000000000', 'Household Shopping', 'need',     '🧴', true, 3),
    ('00000000-0020-0000-0000-000000000000', 'Loans & Lending',    'transfer', '🤝', true, 14)
ON CONFLICT (id) DO UPDATE
    SET name = EXCLUDED.name,
        classification = EXCLUDED.classification,
        icon = EXCLUDED.icon,
        sort_order = EXCLUDED.sort_order;

-- ── 2. Renumber existing categories into the canonical order ──────────────────
UPDATE transaction_categories SET sort_order = 1  WHERE id = '00000000-0001-0000-0000-000000000000'; -- Rent & Housing
UPDATE transaction_categories SET sort_order = 2  WHERE id = '00000000-0002-0000-0000-000000000000'; -- Groceries
-- 3 = Household Shopping (new)
UPDATE transaction_categories SET sort_order = 4  WHERE id = '00000000-0004-0000-0000-000000000000'; -- Utilities
UPDATE transaction_categories SET sort_order = 5  WHERE id = '00000000-0003-0000-0000-000000000000'; -- Transport
UPDATE transaction_categories SET sort_order = 6  WHERE id = '00000000-0005-0000-0000-000000000000'; -- Health & Medical
UPDATE transaction_categories SET sort_order = 7  WHERE id = '00000000-0006-0000-0000-000000000000'; -- Education
UPDATE transaction_categories SET sort_order = 8  WHERE id = '00000000-0012-0000-0000-000000000000'; -- Clothing & Personal
UPDATE transaction_categories SET sort_order = 9  WHERE id = '00000000-0009-0000-0000-000000000000'; -- Dining
UPDATE transaction_categories SET sort_order = 10 WHERE id = '00000000-0010-0000-0000-000000000000'; -- Entertainment
UPDATE transaction_categories SET sort_order = 11 WHERE id = '00000000-0008-0000-0000-000000000000'; -- Travel
UPDATE transaction_categories SET sort_order = 12 WHERE id = '00000000-0011-0000-0000-000000000000'; -- Subscriptions
UPDATE transaction_categories SET sort_order = 13 WHERE id = '00000000-0015-0000-0000-000000000000'; -- Debt Payment
-- 14 = Loans & Lending (new)
UPDATE transaction_categories SET sort_order = 15 WHERE id = '00000000-0014-0000-0000-000000000000'; -- Family Support
UPDATE transaction_categories SET sort_order = 16 WHERE id = '00000000-0007-0000-0000-000000000000'; -- Emergency Fund
UPDATE transaction_categories SET sort_order = 17 WHERE id = '00000000-0013-0000-0000-000000000000'; -- Investment
UPDATE transaction_categories SET sort_order = 18 WHERE id = '00000000-0016-0000-0000-000000000000'; -- Salary / Wages
UPDATE transaction_categories SET sort_order = 19 WHERE id = '00000000-0017-0000-0000-000000000000'; -- Income
UPDATE transaction_categories SET sort_order = 20 WHERE id = '00000000-0018-0000-0000-000000000000'; -- Other

-- ════════════════════════════════════════════════════════════════════════════
--  END OF MIGRATION 010
-- ════════════════════════════════════════════════════════════════════════════
