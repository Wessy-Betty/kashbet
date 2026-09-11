-- ═══════════════════════════════════════════════════════════════════════════════
--  KashBet / Fedika — Migration 018
--  Auto-create a Family Giving record whenever a "Family Support" transaction is
--  saved, so giving is entered once (on the transaction) instead of twice.
--
--  The person's name is carried in the transaction's subcategory_label. A trigger
--  mirrors the row into giving_records, linked by transaction_id so that editing
--  (delete + re-insert) or deleting the transaction keeps giving in sync via the
--  ON DELETE CASCADE. Manually-entered giving records (transaction_id NULL) are
--  untouched.
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE giving_records
  ADD COLUMN IF NOT EXISTS transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_giving_transaction ON giving_records(transaction_id);

CREATE OR REPLACE FUNCTION sync_giving_from_transaction()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cat_name text;
BEGIN
  SELECT name INTO cat_name
  FROM transaction_categories
  WHERE id = NEW.category_id;

  IF cat_name = 'Family Support'
     AND NEW.subcategory_label IS NOT NULL
     AND btrim(NEW.subcategory_label) <> ''
     AND abs(NEW.amount) > 0 THEN
    INSERT INTO giving_records (user_id, person, amount, given_date, notes, transaction_id)
    VALUES (
      NEW.user_id,
      btrim(NEW.subcategory_label),
      abs(NEW.amount),
      NEW.transaction_date,
      NULLIF(NEW.description, ''),
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_giving_from_transaction ON transactions;
CREATE TRIGGER trg_sync_giving_from_transaction
AFTER INSERT ON transactions
FOR EACH ROW EXECUTE FUNCTION sync_giving_from_transaction();
