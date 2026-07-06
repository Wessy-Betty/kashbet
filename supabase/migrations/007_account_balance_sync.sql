-- ═══════════════════════════════════════════════════════════════════════════════
--  KashBet — Migration 007
--  Account balance sync + transaction cost tracking.
--
--  Every transaction that references an account now automatically updates
--  that account's running balance via a BEFORE INSERT trigger.
--  Investment deposits / withdrawals that reference a linked bank account
--  also move money in/out of that bank account automatically.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Add transaction_cost to transactions ───────────────────────────────────
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS transaction_cost NUMERIC(10,2) NOT NULL DEFAULT 0;

-- ── 2. Add linked_account_id to investment_transactions ──────────────────────
--    This records which bank account funded a deposit / received a withdrawal.
ALTER TABLE investment_transactions
  ADD COLUMN IF NOT EXISTS linked_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;

-- ── 3. Trigger: sync bank account balance when a transaction is recorded ──────
CREATE OR REPLACE FUNCTION sync_account_on_transaction()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  cur_balance NUMERIC;
  deduct      NUMERIC;
BEGIN
  -- Only act when the transaction is linked to an account
  IF NEW.account_id IS NULL THEN RETURN NEW; END IF;

  IF NEW.type = 'income' THEN
    -- Income arrives into the account
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
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_account_on_transaction ON transactions;
CREATE TRIGGER trg_sync_account_on_transaction
  BEFORE INSERT ON transactions
  FOR EACH ROW EXECUTE FUNCTION sync_account_on_transaction();

-- ── 4. Trigger: sync bank account when an investment transaction occurs ────────
--    deposit / fee  → deduct from bank account
--    withdrawal     → add back to bank account
--    interest / dividend → no bank movement (credited directly into investment)
CREATE OR REPLACE FUNCTION sync_bank_on_investment_tx()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  cur_balance NUMERIC;
BEGIN
  IF NEW.linked_account_id IS NULL THEN RETURN NEW; END IF;

  IF NEW.tx_type IN ('deposit', 'fee') THEN
    SELECT balance INTO cur_balance FROM accounts WHERE id = NEW.linked_account_id;

    IF cur_balance - NEW.amount < 0 THEN
      RAISE EXCEPTION
        'Insufficient funds in bank account: has KSh %, need KSh %',
        cur_balance, NEW.amount;
    END IF;

    UPDATE accounts
       SET balance = balance - NEW.amount
     WHERE id = NEW.linked_account_id;

  ELSIF NEW.tx_type = 'withdrawal' THEN
    -- Money returns from investment to bank account
    UPDATE accounts
       SET balance = balance + NEW.amount
     WHERE id = NEW.linked_account_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_bank_on_investment_tx ON investment_transactions;
CREATE TRIGGER trg_sync_bank_on_investment_tx
  BEFORE INSERT ON investment_transactions
  FOR EACH ROW EXECUTE FUNCTION sync_bank_on_investment_tx();

-- ════════════════════════════════════════════════════════════════════════════
--  END OF MIGRATION 007
-- ════════════════════════════════════════════════════════════════════════════
