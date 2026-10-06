-- ═══════════════════════════════════════════════════════════════════════════════
--  KashBet / Fedika — Migration 021  (Unified Ledger · Phase B)
--
--  First-class transfers through the ledger. A "two-sided transfer" is one
--  transaction with type='transfer' AND to_account_id set: money leaves
--  account_id (the source) and enters to_account_id (the destination), where
--  either side may live in accounts, investment_accounts, or savings_goals.
--
--  SAFE TO APPLY: nothing creates two-sided transfers yet, so behaviour is
--  unchanged until a later phase rewires the Accounts/Savings forms. This only
--  adds the mechanism (and teaches the existing trigger to step aside for it).
--
--  Fees: the source is debited amount + transaction_cost; the destination is
--  credited amount. So the M-PESA fee on a transfer finally lands correctly.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Helpers: adjust / read a balance regardless of which table the account is in ─
CREATE OR REPLACE FUNCTION apply_account_delta(acct uuid, delta numeric)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE accounts SET balance = balance + delta WHERE id = acct;
  IF FOUND THEN RETURN; END IF;
  UPDATE investment_accounts SET balance = balance + delta WHERE id = acct;
  IF FOUND THEN RETURN; END IF;
  UPDATE savings_goals SET current_balance = current_balance + delta WHERE id = acct;
END;
$$;

CREATE OR REPLACE FUNCTION get_account_balance(acct uuid)
RETURNS numeric LANGUAGE plpgsql AS $$
DECLARE b numeric;
BEGIN
  SELECT balance INTO b FROM accounts WHERE id = acct;
  IF FOUND THEN RETURN b; END IF;
  SELECT balance INTO b FROM investment_accounts WHERE id = acct;
  IF FOUND THEN RETURN b; END IF;
  SELECT current_balance INTO b FROM savings_goals WHERE id = acct;
  RETURN b; -- NULL if the account does not exist
END;
$$;

CREATE OR REPLACE FUNCTION is_two_sided_transfer(t_type text, to_acct uuid)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT t_type = 'transfer' AND to_acct IS NOT NULL;
$$;

-- ── New trigger: move money for two-sided transfers (both legs, any table) ──────
CREATE OR REPLACE FUNCTION sync_transfer_balances()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  src_balance numeric;
  deduct      numeric;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT is_two_sided_transfer(NEW.type, NEW.to_account_id) THEN RETURN NEW; END IF;
    IF NEW.account_id IS NULL THEN RETURN NEW; END IF;

    deduct := ABS(NEW.amount) + COALESCE(NEW.transaction_cost, 0);
    src_balance := get_account_balance(NEW.account_id);
    IF src_balance IS NOT NULL AND src_balance - deduct < 0 THEN
      RAISE EXCEPTION
        'Insufficient funds: source has KSh %, transfer needs KSh %',
        src_balance, deduct;
    END IF;

    PERFORM apply_account_delta(NEW.account_id, -deduct);             -- debit source (+ fee)
    PERFORM apply_account_delta(NEW.to_account_id, ABS(NEW.amount));  -- credit destination
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    IF NOT is_two_sided_transfer(OLD.type, OLD.to_account_id) THEN RETURN OLD; END IF;
    IF OLD.account_id IS NULL THEN RETURN OLD; END IF;

    PERFORM apply_account_delta(
      OLD.account_id, ABS(OLD.amount) + COALESCE(OLD.transaction_cost, 0)); -- restore source
    PERFORM apply_account_delta(OLD.to_account_id, -ABS(OLD.amount));       -- remove from destination
    RETURN OLD;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_transfer_balances ON transactions;
CREATE TRIGGER trg_sync_transfer_balances
  BEFORE INSERT OR DELETE ON transactions
  FOR EACH ROW EXECUTE FUNCTION sync_transfer_balances();

-- ── Teach the existing single-account trigger to step aside for two-sided ──────
--  transfers (identical to migration 009 otherwise; the only change is the two
--  new skip guards). This prevents both triggers acting on the same row.
CREATE OR REPLACE FUNCTION sync_account_on_transaction()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  cur_balance NUMERIC;
  deduct      NUMERIC;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF is_two_sided_transfer(NEW.type, NEW.to_account_id) THEN RETURN NEW; END IF;  -- handled elsewhere
    IF NEW.account_id IS NULL THEN RETURN NEW; END IF;

    IF NEW.type = 'income' THEN
      UPDATE accounts SET balance = balance + ABS(NEW.amount) WHERE id = NEW.account_id;

    ELSIF NEW.type IN ('expense', 'transfer') THEN
      deduct := ABS(NEW.amount) + COALESCE(NEW.transaction_cost, 0);
      SELECT balance INTO cur_balance FROM accounts WHERE id = NEW.account_id;
      IF cur_balance - deduct < 0 THEN
        RAISE EXCEPTION
          'Insufficient funds: account has KSh %, transaction needs KSh %',
          cur_balance, deduct;
      END IF;
      UPDATE accounts SET balance = balance - deduct WHERE id = NEW.account_id;
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    IF is_two_sided_transfer(OLD.type, OLD.to_account_id) THEN RETURN OLD; END IF;  -- handled elsewhere
    IF OLD.account_id IS NULL THEN RETURN OLD; END IF;

    IF OLD.type = 'income' THEN
      UPDATE accounts SET balance = balance - ABS(OLD.amount) WHERE id = OLD.account_id;
    ELSIF OLD.type IN ('expense', 'transfer') THEN
      UPDATE accounts
         SET balance = balance + ABS(OLD.amount) + COALESCE(OLD.transaction_cost, 0)
       WHERE id = OLD.account_id;
    END IF;
    RETURN OLD;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;
