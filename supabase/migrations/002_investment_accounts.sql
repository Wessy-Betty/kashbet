-- ═══════════════════════════════════════════════════════════════════════════════
--  KashBet — Investment Accounts Migration
--  Adds dedicated investment account tracking with per-account transaction logs
--  and interest accrual. Mirrors the 7 accounts tracked in the Google Sheet:
--  ZIIDI (MMF), KCB (bank), ETICA (MMF), JUBILEE (insurance),
--  STIMA A / STIMA S / STIMA C (Stima Sacco products)
-- ═══════════════════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS investment_transactions CASCADE;
DROP TABLE IF EXISTS investment_accounts     CASCADE;

-- ────────────────────────────────────────────────────────────────────────────
--  1. INVESTMENT ACCOUNTS
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE investment_accounts (
    id                UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id           UUID          NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    code              TEXT          NOT NULL,            -- e.g. ZIIDI, KCB, STIMA_A
    name              TEXT          NOT NULL,            -- display name
    institution       TEXT,                              -- fund manager / bank / sacco
    account_type      TEXT          NOT NULL DEFAULT 'other'
                                   CHECK (account_type IN ('mmf','sacco','insurance','bank','stocks','other')),
    balance           NUMERIC(14,2) NOT NULL DEFAULT 0,
    annual_rate       NUMERIC(7,4)  NOT NULL DEFAULT 0   -- e.g. 0.1200 = 12%
                                   CHECK (annual_rate >= 0 AND annual_rate <= 5),
    last_accrual_date DATE,
    is_active         BOOLEAN       NOT NULL DEFAULT true,
    sort_order        INT           NOT NULL DEFAULT 0,
    notes             TEXT,
    created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
    UNIQUE (user_id, code)
);

CREATE INDEX idx_inv_accounts_user ON investment_accounts(user_id);

-- ────────────────────────────────────────────────────────────────────────────
--  2. INVESTMENT TRANSACTIONS
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE investment_transactions (
    id         UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID          NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    account_id UUID          NOT NULL REFERENCES investment_accounts(id) ON DELETE CASCADE,
    tx_type    TEXT          NOT NULL
               CHECK (tx_type IN ('deposit','withdrawal','interest','dividend','fee')),
    amount     NUMERIC(14,2) NOT NULL CHECK (amount > 0),  -- always positive; tx_type signals direction
    tx_date    DATE          NOT NULL DEFAULT CURRENT_DATE,
    notes      TEXT,
    created_at TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX idx_inv_tx_account ON investment_transactions(account_id, tx_date DESC);
CREATE INDEX idx_inv_tx_user    ON investment_transactions(user_id, tx_date DESC);

-- ────────────────────────────────────────────────────────────────────────────
--  3. TRIGGER — auto-update account balance on transaction insert/delete
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_investment_balance()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE investment_accounts
        SET balance = balance +
            CASE WHEN NEW.tx_type IN ('deposit','interest','dividend') THEN  NEW.amount
                 ELSE                                                        -NEW.amount
            END
        WHERE id = NEW.account_id;
    ELSIF TG_OP = 'DELETE' THEN
        -- Reverse the effect
        UPDATE investment_accounts
        SET balance = balance +
            CASE WHEN OLD.tx_type IN ('deposit','interest','dividend') THEN -OLD.amount
                 ELSE                                                         OLD.amount
            END
        WHERE id = OLD.account_id;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_investment_balance ON investment_transactions;
CREATE TRIGGER trg_investment_balance
    AFTER INSERT OR DELETE ON investment_transactions
    FOR EACH ROW EXECUTE FUNCTION update_investment_balance();

-- ────────────────────────────────────────────────────────────────────────────
--  4. ROW LEVEL SECURITY
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE investment_accounts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE investment_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own investment accounts"
    ON investment_accounts FOR ALL
    USING (user_id = auth.uid());

CREATE POLICY "Own investment transactions"
    ON investment_transactions FOR ALL
    USING (user_id = auth.uid());

-- ────────────────────────────────────────────────────────────────────────────
--  5. REALTIME
-- ────────────────────────────────────────────────────────────────────────────

-- Add to the existing publication if it exists; safe to re-run
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE investment_accounts;
        ALTER PUBLICATION supabase_realtime ADD TABLE investment_transactions;
    END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  END OF MIGRATION 002
-- ════════════════════════════════════════════════════════════════════════════
