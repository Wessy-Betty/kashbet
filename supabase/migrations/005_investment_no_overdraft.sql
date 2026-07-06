-- ═══════════════════════════════════════════════════════════════════════════════
--  KashBet — Migration 005
--  Prevent investment account overdraft at the database level.
--  The trigger on investment_transactions already updates balance.
--  This migration adds a trigger that aborts the transaction BEFORE the
--  balance would go negative — giving a clear error message.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION prevent_investment_overdraft()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    current_bal NUMERIC;
    debit_types TEXT[] := ARRAY['withdrawal', 'fee'];
BEGIN
    IF NEW.tx_type = ANY(debit_types) THEN
        SELECT balance INTO current_bal
        FROM investment_accounts
        WHERE id = NEW.account_id;

        IF current_bal - NEW.amount < 0 THEN
            RAISE EXCEPTION
                'Insufficient balance: account has %, withdrawal amount is %',
                current_bal, NEW.amount;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_no_overdraft ON investment_transactions;
CREATE TRIGGER trg_no_overdraft
    BEFORE INSERT ON investment_transactions
    FOR EACH ROW EXECUTE FUNCTION prevent_investment_overdraft();
