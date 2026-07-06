-- ═══════════════════════════════════════════════════════════════════════════════
--  KashBet — Migration 011
--  Add free-text subcategory + product tracking to transactions.
--
--  Subcategories and products in this app are free-text labels (not category rows),
--  so subcategory_id (a UUID FK) could never hold them — the selection was silently
--  discarded on save. These text columns persist both, product being optional.
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS subcategory_label TEXT,
  ADD COLUMN IF NOT EXISTS product_name      TEXT;

-- Recreate the detail view so the app can read the new fields.
-- subcategory_name falls back to the free-text label when no FK row is linked.
DROP VIEW IF EXISTS transactions_with_details;
CREATE VIEW transactions_with_details
WITH (security_invoker = true) AS
SELECT
    t.id,
    t.user_id,
    t.account_id,
    t.amount,
    t.type,
    t.category_id,
    t.classification,
    t.description,
    t.notes,
    t.transaction_date,
    t.payment_method,
    t.reference_number,
    t.transaction_cost,
    t.is_recurring,
    t.ai_classified,
    t.user_overridden,
    t.created_at,
    t.updated_at,
    c.name                              AS category_name,
    c.icon                              AS category_icon,
    COALESCE(sc.name, t.subcategory_label) AS subcategory_name,
    t.product_name                      AS product_name,
    a.name                              AS account_name
FROM transactions t
LEFT JOIN transaction_categories c  ON c.id = t.category_id
LEFT JOIN transaction_categories sc ON sc.id = t.subcategory_id
LEFT JOIN accounts a                ON a.id = t.account_id;

-- ════════════════════════════════════════════════════════════════════════════
--  END OF MIGRATION 011
-- ════════════════════════════════════════════════════════════════════════════
