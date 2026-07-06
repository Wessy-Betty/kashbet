-- ═══════════════════════════════════════════════════════════════════════════════
--  KashBet — Migration 009
--  Fix double-counted account balance updates.
--
--  Root cause: migration 001 created trg_transaction_balance (AFTER INSERT/UPDATE/DELETE)
--  and migration 007 created trg_sync_account_on_transaction (BEFORE INSERT).
--  Both fired on every transaction insert, doubling every balance update.
--
--  Fix:
--  1. Drop the old (naive) trigger from migration 001.
--  2. Extend sync_account_on_transaction to also handle DELETE so reversals still work.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Drop the old duplicate trigger ────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_transaction_balance ON transactions;

-- ── 2. Rebuild sync_account_on_transaction to handle INSERT + DELETE ──────────
CREATE OR REPLACE FUNCTION sync_account_on_transaction()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  cur_balance NUMERIC;
  deduct      NUMERIC;
BEGIN
  -- ── INSERT: apply the transaction to the linked account ──────────────────
  IF TG_OP = 'INSERT' THEN
    IF NEW.account_id IS NULL THEN RETURN NEW; END IF;

    IF NEW.type = 'income' THEN
      UPDATE accounts
         SET balance = balance + ABS(NEW.amount)
       WHERE id = NEW.account_id;

    ELSIF NEW.type IN ('expense', 'transfer') THEN
      deduct := ABS(NEW.amount) + COALESCE(NEW.transaction_cost, 0);

      SELECT balance INTO cur_balance FROM accounts WHERE id = NEW.account_id;

      IF cur_balance - deduct < 0 THEN
        RAISE EXCEPTION
          'Insufficient funds: account has KSh %, transaction needs KSh %',
          cur_balance, deduct;
      END IF;

      UPDATE accounts
         SET balance = balance - deduct
       WHERE id = NEW.account_id;
    END IF;

    RETURN NEW;

  -- ── DELETE: reverse the transaction's effect on the linked account ────────
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.account_id IS NULL THEN RETURN OLD; END IF;

    IF OLD.type = 'income' THEN
      -- Reverse the income credit
      UPDATE accounts
         SET balance = balance - ABS(OLD.amount)
       WHERE id = OLD.account_id;

    ELSIF OLD.type IN ('expense', 'transfer') THEN
      -- Restore what was deducted (amount + any transaction cost)
      UPDATE accounts
         SET balance = balance + ABS(OLD.amount) + COALESCE(OLD.transaction_cost, 0)
       WHERE id = OLD.account_id;
    END IF;

    RETURN OLD;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_account_on_transaction ON transactions;
CREATE TRIGGER trg_sync_account_on_transaction
  BEFORE INSERT OR DELETE ON transactions
  FOR EACH ROW EXECUTE FUNCTION sync_account_on_transaction();

-- ════════════════════════════════════════════════════════════════════════════
--  END OF MIGRATION 009
-- ════════════════════════════════════════════════════════════════════════════
