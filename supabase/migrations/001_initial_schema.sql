-- ═══════════════════════════════════════════════════════════════════════════════
--  KashBet — Production PostgreSQL Schema (Supabase)
--  Version: 2.0 — Full RLS, system categories complete, views fixed
-- ═══════════════════════════════════════════════════════════════════════════════

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Clean slate (safe re-run)
DROP VIEW  IF EXISTS transactions_with_details CASCADE;
DROP VIEW  IF EXISTS budget_summary_view       CASCADE;
DROP VIEW  IF EXISTS monthly_summary_view      CASCADE;

DROP TABLE IF EXISTS audit_log                 CASCADE;
DROP TABLE IF EXISTS custom_dropdown_options   CASCADE;
DROP TABLE IF EXISTS ai_insights               CASCADE;
DROP TABLE IF EXISTS alerts                    CASCADE;
DROP TABLE IF EXISTS shopping_list_items       CASCADE;
DROP TABLE IF EXISTS shopping_lists            CASCADE;
DROP TABLE IF EXISTS price_records             CASCADE;
DROP TABLE IF EXISTS products                  CASCADE;
DROP TABLE IF EXISTS net_worth_snapshots       CASCADE;
DROP TABLE IF EXISTS savings_records           CASCADE;
DROP TABLE IF EXISTS savings_goals             CASCADE;
DROP TABLE IF EXISTS debt_payments             CASCADE;
DROP TABLE IF EXISTS debt_records              CASCADE;
DROP TABLE IF EXISTS income_records            CASCADE;
DROP TABLE IF EXISTS income_streams            CASCADE;
DROP TABLE IF EXISTS recurring_transactions    CASCADE;
DROP TABLE IF EXISTS transactions              CASCADE;
DROP TABLE IF EXISTS budget_plans              CASCADE;
DROP TABLE IF EXISTS transaction_categories    CASCADE;
DROP TABLE IF EXISTS accounts                  CASCADE;
DROP TABLE IF EXISTS household_members         CASCADE;
DROP TABLE IF EXISTS households                CASCADE;
DROP TABLE IF EXISTS user_profiles             CASCADE;

-- ════════════════════════════════════════════════════════════════════════════════
--  1. USERS & HOUSEHOLDS
-- ════════════════════════════════════════════════════════════════════════════════

CREATE TABLE user_profiles (
    id              UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email           TEXT        UNIQUE NOT NULL,
    full_name       TEXT,
    currency_code   CHAR(3)     NOT NULL DEFAULT 'KES',
    currency_symbol TEXT        NOT NULL DEFAULT 'KSh',
    timezone        TEXT        NOT NULL DEFAULT 'Africa/Nairobi',
    household_id    UUID,
    plan            TEXT        NOT NULL DEFAULT 'free' CHECK (plan IN ('free','pro','household')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE households (
    id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    name       TEXT        NOT NULL,
    owner_id   UUID        NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE user_profiles
    ADD CONSTRAINT fk_household
    FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE SET NULL;

CREATE TABLE household_members (
    id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    household_id UUID        NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    user_id      UUID        NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    role         TEXT        NOT NULL DEFAULT 'member' CHECK (role IN ('owner','member','viewer')),
    joined_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (household_id, user_id)
);

-- ════════════════════════════════════════════════════════════════════════════════
--  2. ACCOUNTS
-- ════════════════════════════════════════════════════════════════════════════════

CREATE TABLE accounts (
    id             UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id        UUID          NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    name           TEXT          NOT NULL,
    type           TEXT          NOT NULL DEFAULT 'savings'
                                 CHECK (type IN ('checking','savings','cash','investment','credit','loan','other')),
    balance        NUMERIC(14,2) NOT NULL DEFAULT 0,
    currency_code  CHAR(3)       NOT NULL DEFAULT 'KES',
    institution    TEXT,
    account_number TEXT,
    is_active      BOOLEAN       NOT NULL DEFAULT true,
    sort_order     INT           NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX idx_accounts_user ON accounts(user_id);

-- ════════════════════════════════════════════════════════════════════════════════
--  3. TRANSACTION CATEGORIES
--  System categories are pre-seeded and available to all users.
--  Users can add their own custom categories (user_id IS NOT NULL).
-- ════════════════════════════════════════════════════════════════════════════════

CREATE TABLE transaction_categories (
    id             UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id        UUID    REFERENCES user_profiles(id) ON DELETE CASCADE,
    name           TEXT    NOT NULL,
    parent_id      UUID    REFERENCES transaction_categories(id) ON DELETE SET NULL,
    classification TEXT    NOT NULL DEFAULT 'need'
                           CHECK (classification IN ('need','want','investment','transfer')),
    icon           TEXT,
    color          TEXT,
    is_system      BOOLEAN NOT NULL DEFAULT false,
    sort_order     INT     NOT NULL DEFAULT 0
);

-- ── System categories (full set matching demoData.ts SYSTEM_CATEGORY_NAMES) ───
INSERT INTO transaction_categories (id, name, classification, icon, is_system, sort_order) VALUES
    ('00000000-0001-0000-0000-000000000000', 'Rent & Housing',     'need',       '🏠', true,  1),
    ('00000000-0002-0000-0000-000000000000', 'Groceries',          'need',       '🛒', true,  2),
    ('00000000-0003-0000-0000-000000000000', 'Transport',          'need',       '🚗', true,  3),
    ('00000000-0004-0000-0000-000000000000', 'Utilities',          'need',       '💡', true,  4),
    ('00000000-0005-0000-0000-000000000000', 'Health & Medical',   'need',       '🏥', true,  5),
    ('00000000-0006-0000-0000-000000000000', 'Education',          'need',       '📚', true,  6),
    ('00000000-0007-0000-0000-000000000000', 'Emergency Fund',     'need',       '🛡️', true,  7),
    ('00000000-0008-0000-0000-000000000000', 'Travel',             'want',       '✈️', true,  8),
    ('00000000-0009-0000-0000-000000000000', 'Dining',             'want',       '🍽️', true,  9),
    ('00000000-0010-0000-0000-000000000000', 'Entertainment',      'want',       '🎬', true, 10),
    ('00000000-0011-0000-0000-000000000000', 'Subscriptions',      'want',       '📱', true, 11),
    ('00000000-0012-0000-0000-000000000000', 'Clothing & Personal','want',       '👗', true, 12),
    ('00000000-0013-0000-0000-000000000000', 'Investment',         'investment', '📈', true, 13),
    ('00000000-0014-0000-0000-000000000000', 'Family Support',     'transfer',   '👨‍👩‍👧', true, 14),
    ('00000000-0015-0000-0000-000000000000', 'Debt Payment',       'need',       '💳', true, 15),
    ('00000000-0016-0000-0000-000000000000', 'Salary / Wages',     'transfer',   '💰', true, 16),
    ('00000000-0017-0000-0000-000000000000', 'Income',             'transfer',   '💵', true, 17),
    ('00000000-0018-0000-0000-000000000000', 'Other',              'need',       '📦', true, 18);

-- ════════════════════════════════════════════════════════════════════════════════
--  4. TRANSACTIONS
-- ════════════════════════════════════════════════════════════════════════════════

CREATE TABLE transactions (
    id               UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id          UUID          NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    account_id       UUID          REFERENCES accounts(id) ON DELETE SET NULL,
    amount           NUMERIC(14,2) NOT NULL,
    type             TEXT          NOT NULL CHECK (type IN ('income','expense','transfer')),
    category_id      UUID          REFERENCES transaction_categories(id) ON DELETE SET NULL,
    subcategory_id   UUID          REFERENCES transaction_categories(id) ON DELETE SET NULL,
    classification   TEXT          CHECK (classification IN ('need','want','investment','transfer')),
    description      TEXT          NOT NULL,
    notes            TEXT,
    transaction_date DATE          NOT NULL,
    payment_method   TEXT,
    reference_number TEXT,
    is_recurring     BOOLEAN       NOT NULL DEFAULT false,
    recurring_id     UUID,
    ai_classified    BOOLEAN       NOT NULL DEFAULT false,
    user_overridden  BOOLEAN       NOT NULL DEFAULT false,
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX idx_transactions_user_date ON transactions(user_id, transaction_date DESC);
CREATE INDEX idx_transactions_user_month ON transactions(user_id, transaction_date);

-- ════════════════════════════════════════════════════════════════════════════════
--  5. RECURRING TRANSACTIONS
-- ════════════════════════════════════════════════════════════════════════════════

CREATE TABLE recurring_transactions (
    id             UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id        UUID          NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    description    TEXT          NOT NULL,
    amount         NUMERIC(14,2) NOT NULL,
    type           TEXT          NOT NULL CHECK (type IN ('income','expense','transfer')),
    category_id    UUID          REFERENCES transaction_categories(id),
    classification TEXT          CHECK (classification IN ('need','want','investment','transfer')),
    frequency      TEXT          NOT NULL
                                 CHECK (frequency IN ('daily','weekly','fortnightly','monthly','annual')),
    next_date      DATE          NOT NULL,
    end_date       DATE,
    is_active      BOOLEAN       NOT NULL DEFAULT true,
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT now()
);

ALTER TABLE transactions
    ADD CONSTRAINT fk_recurring
    FOREIGN KEY (recurring_id) REFERENCES recurring_transactions(id) ON DELETE SET NULL;

-- ════════════════════════════════════════════════════════════════════════════════
--  6. BUDGET PLANS
-- ════════════════════════════════════════════════════════════════════════════════

CREATE TABLE budget_plans (
    id             UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id        UUID          NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    year           SMALLINT      NOT NULL CHECK (year BETWEEN 2000 AND 2100),
    month          SMALLINT      NOT NULL CHECK (month BETWEEN 1 AND 12),
    category_id    UUID          NOT NULL REFERENCES transaction_categories(id),
    planned_amount NUMERIC(14,2) NOT NULL CHECK (planned_amount >= 0),
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
    UNIQUE (user_id, year, month, category_id)
);

-- ════════════════════════════════════════════════════════════════════════════════
--  7. INCOME
-- ════════════════════════════════════════════════════════════════════════════════

CREATE TABLE income_streams (
    id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID          NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    name            TEXT          NOT NULL,
    type            TEXT          NOT NULL DEFAULT 'other'
                                  CHECK (type IN ('salary','freelance','business','investment','family_support','rental','other')),
    frequency       TEXT          NOT NULL DEFAULT 'monthly'
                                  CHECK (frequency IN ('one_time','daily','weekly','fortnightly','monthly','annual')),
    expected_amount NUMERIC(14,2),
    source_person   TEXT,
    is_active       BOOLEAN       NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE TABLE income_records (
    id               UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id          UUID          NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    income_stream_id UUID          REFERENCES income_streams(id) ON DELETE SET NULL,
    amount           NUMERIC(14,2) NOT NULL,
    received_date    DATE          NOT NULL DEFAULT CURRENT_DATE,
    notes            TEXT,
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- ════════════════════════════════════════════════════════════════════════════════
--  8. DEBT
-- ════════════════════════════════════════════════════════════════════════════════

CREATE TABLE debt_records (
    id                UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id           UUID          NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    direction         TEXT          NOT NULL CHECK (direction IN ('owed_by_me','owed_to_me')),
    person_entity     TEXT          NOT NULL,
    principal         NUMERIC(14,2) NOT NULL CHECK (principal > 0),
    interest_rate     NUMERIC(5,4)  DEFAULT 0 CHECK (interest_rate >= 0),
    start_date        DATE,
    due_date          DATE,
    remaining_balance NUMERIC(14,2) NOT NULL CHECK (remaining_balance >= 0),
    payment_frequency TEXT,
    status            TEXT          NOT NULL DEFAULT 'active'
                                    CHECK (status IN ('active','paid','overdue','disputed')),
    notes             TEXT,
    updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
    created_at        TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE TABLE debt_payments (
    id           UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID          NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    debt_id      UUID          NOT NULL REFERENCES debt_records(id) ON DELETE CASCADE,
    amount       NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    payment_date DATE          NOT NULL DEFAULT CURRENT_DATE,
    notes        TEXT,
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- ════════════════════════════════════════════════════════════════════════════════
--  9. SAVINGS & NET WORTH
-- ════════════════════════════════════════════════════════════════════════════════

CREATE TABLE savings_goals (
    id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID          NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    name            TEXT          NOT NULL,
    icon            TEXT,
    target_amount   NUMERIC(14,2) NOT NULL CHECK (target_amount > 0),
    current_balance NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (current_balance >= 0),
    target_date     DATE,
    is_active       BOOLEAN       NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE TABLE savings_records (
    id          UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID          NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    goal_id     UUID          NOT NULL REFERENCES savings_goals(id) ON DELETE CASCADE,
    amount      NUMERIC(14,2) NOT NULL,
    record_date DATE          NOT NULL DEFAULT CURRENT_DATE,
    notes       TEXT,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE TABLE net_worth_snapshots (
    id                UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id           UUID          NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    snapshot_date     DATE          NOT NULL,
    total_assets      NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_assets >= 0),
    total_liabilities NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_liabilities >= 0),
    net_worth         NUMERIC(14,2) GENERATED ALWAYS AS (total_assets - total_liabilities) STORED,
    breakdown         JSONB         NOT NULL DEFAULT '{}',
    UNIQUE (user_id, snapshot_date)
);

-- ════════════════════════════════════════════════════════════════════════════════
--  10. SHOPPING & PRICE TRACKING
-- ════════════════════════════════════════════════════════════════════════════════

CREATE TABLE products (
    id        UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id   UUID    REFERENCES user_profiles(id) ON DELETE CASCADE,
    name      TEXT    NOT NULL,
    category  TEXT    NOT NULL,
    unit      TEXT,
    is_system BOOLEAN NOT NULL DEFAULT false
);

-- Seed system products (shared, not user-specific)
INSERT INTO products (name, category, unit, is_system) VALUES
    ('Cooking Oil (2L)',     'Cooking Oil',   'L',    true),
    ('Rice (Pishori 2kg)',   'Rice',          'kg',   true),
    ('Flour (2kg)',          'Flour',         'kg',   true),
    ('Sugar (2kg)',          'Sugar',         'kg',   true),
    ('Tissue Paper (72pk)',  'Tissue Paper',  'pack', true),
    ('Detergent (2kg)',      'Detergent',     'kg',   true),
    ('Dettol Soap',          'Personal Care', 'piece',true),
    ('Toothpaste',           'Personal Care', 'piece',true),
    ('Water (500ml x12)',    'Beverages',     'pack', true),
    ('Juice (1L)',           'Beverages',     'L',    true);

CREATE TABLE price_records (
    id           UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID          NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    product_id   UUID          NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    brand        TEXT,
    store        TEXT          NOT NULL,
    price        NUMERIC(10,2) NOT NULL CHECK (price > 0),
    quantity     NUMERIC(10,3) NOT NULL DEFAULT 1,
    unit         TEXT,
    purchased_at DATE          NOT NULL DEFAULT CURRENT_DATE
);

CREATE TABLE shopping_lists (
    id        UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id   UUID    NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    name      TEXT    NOT NULL DEFAULT 'My Shopping List',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE shopping_list_items (
    id           UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    list_id      UUID          NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
    product_id   UUID          REFERENCES products(id) ON DELETE SET NULL,
    custom_name  TEXT,
    quantity     NUMERIC(10,3) NOT NULL DEFAULT 1,
    estimated_price NUMERIC(10,2),
    is_completed BOOLEAN       NOT NULL DEFAULT false
);

-- ════════════════════════════════════════════════════════════════════════════════
--  11. ALERTS & AI INSIGHTS
-- ════════════════════════════════════════════════════════════════════════════════

CREATE TABLE alerts (
    id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID        NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    type         TEXT        NOT NULL,
    severity     TEXT        NOT NULL DEFAULT 'info'
                             CHECK (severity IN ('info','warning','critical')),
    message      TEXT        NOT NULL,
    is_dismissed BOOLEAN     NOT NULL DEFAULT false,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ai_insights (
    id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID        NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    type         TEXT        NOT NULL
                             CHECK (type IN ('monthly_summary','anomaly','forecast','advice','chat')),
    content      JSONB       NOT NULL,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ════════════════════════════════════════════════════════════════════════════════
--  12. CUSTOM OPTIONS & AUDIT
-- ════════════════════════════════════════════════════════════════════════════════

CREATE TABLE custom_dropdown_options (
    id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id   UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    list_name TEXT NOT NULL,
    value     TEXT NOT NULL,
    label     TEXT NOT NULL,
    UNIQUE (user_id, list_name, value)
);

CREATE TABLE audit_log (
    id         BIGSERIAL   PRIMARY KEY,
    user_id    UUID        REFERENCES user_profiles(id) ON DELETE SET NULL,
    table_name TEXT        NOT NULL,
    record_id  UUID,
    action     TEXT        NOT NULL,
    old_data   JSONB,
    new_data   JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ════════════════════════════════════════════════════════════════════════════════
--  13. VIEWS
-- ════════════════════════════════════════════════════════════════════════════════

-- transactions_with_details: used by useTransactions() hook
-- RLS on the base transactions table means each user only sees their own rows.
CREATE VIEW transactions_with_details AS
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
    t.is_recurring,
    t.ai_classified,
    t.user_overridden,
    t.created_at,
    t.updated_at,
    c.name       AS category_name,
    c.icon       AS category_icon,
    sc.name      AS subcategory_name,
    a.name       AS account_name
FROM transactions t
LEFT JOIN transaction_categories c  ON c.id = t.category_id
LEFT JOIN transaction_categories sc ON sc.id = t.subcategory_id
LEFT JOIN accounts a                ON a.id = t.account_id;

-- monthly_summary_view: handy for the advisor context builder
CREATE VIEW monthly_summary_view AS
SELECT
    user_id,
    date_trunc('month', transaction_date)::date AS month,
    SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END)  AS total_income,
    SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) AS total_expenses,
    COUNT(*) AS transaction_count
FROM transactions
GROUP BY user_id, date_trunc('month', transaction_date);

-- ════════════════════════════════════════════════════════════════════════════════
--  14. FUNCTIONS & TRIGGERS
-- ════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_user_profiles_updated_at
    BEFORE UPDATE ON user_profiles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_transactions_updated_at
    BEFORE UPDATE ON transactions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_debt_records_updated_at
    BEFORE UPDATE ON debt_records
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Auto-update account balance on transaction insert/update/delete
CREATE OR REPLACE FUNCTION update_account_balance()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.account_id IS NOT NULL THEN
        UPDATE accounts SET balance = balance + NEW.amount WHERE id = NEW.account_id;
    ELSIF TG_OP = 'DELETE' AND OLD.account_id IS NOT NULL THEN
        UPDATE accounts SET balance = balance - OLD.amount WHERE id = OLD.account_id;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.account_id IS NOT NULL THEN
            UPDATE accounts SET balance = balance - OLD.amount WHERE id = OLD.account_id;
        END IF;
        IF NEW.account_id IS NOT NULL THEN
            UPDATE accounts SET balance = balance + NEW.amount WHERE id = NEW.account_id;
        END IF;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_transaction_balance ON transactions;
CREATE TRIGGER trg_transaction_balance
    AFTER INSERT OR UPDATE OR DELETE ON transactions
    FOR EACH ROW EXECUTE FUNCTION update_account_balance();

-- Auto-update debt remaining_balance on payment insert
CREATE OR REPLACE FUNCTION update_debt_on_payment()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    UPDATE debt_records
    SET
        remaining_balance = GREATEST(remaining_balance - NEW.amount, 0),
        status = CASE
            WHEN remaining_balance - NEW.amount <= 0 THEN 'paid'
            ELSE status
        END,
        updated_at = now()
    WHERE id = NEW.debt_id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_debt_payment ON debt_payments;
CREATE TRIGGER trg_debt_payment
    AFTER INSERT ON debt_payments
    FOR EACH ROW EXECUTE FUNCTION update_debt_on_payment();

-- Audit logging for transactions
CREATE OR REPLACE FUNCTION write_audit_log()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO audit_log (user_id, table_name, record_id, action, old_data, new_data)
    VALUES (
        COALESCE(NEW.user_id, OLD.user_id),
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id),
        TG_OP,
        CASE WHEN TG_OP != 'INSERT' THEN row_to_json(OLD)::jsonb ELSE NULL END,
        CASE WHEN TG_OP != 'DELETE' THEN row_to_json(NEW)::jsonb ELSE NULL END
    );
    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_transactions ON transactions;
CREATE TRIGGER trg_audit_transactions
    AFTER INSERT OR UPDATE OR DELETE ON transactions
    FOR EACH ROW EXECUTE FUNCTION write_audit_log();

-- Auto-create user_profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    INSERT INTO public.user_profiles (id, email, full_name)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.raw_user_meta_data->>'full_name'
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ════════════════════════════════════════════════════════════════════════════════
--  15. ROW LEVEL SECURITY (RLS)
-- ════════════════════════════════════════════════════════════════════════════════

-- Enable RLS on all user-data tables
DO $$
DECLARE t text;
BEGIN
    FOR t IN
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    END LOOP;
END $$;

-- user_profiles: users can only read/edit their own profile
CREATE POLICY "Own profile only"
    ON user_profiles FOR ALL
    USING (id = auth.uid());

-- accounts
CREATE POLICY "Own accounts"
    ON accounts FOR ALL
    USING (user_id = auth.uid());

-- categories: select system + own; insert/update/delete only own
CREATE POLICY "Read system and own categories"
    ON transaction_categories FOR SELECT
    USING (is_system = true OR user_id = auth.uid());

CREATE POLICY "Manage own categories"
    ON transaction_categories FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Update own categories"
    ON transaction_categories FOR UPDATE
    USING (user_id = auth.uid());

CREATE POLICY "Delete own categories"
    ON transaction_categories FOR DELETE
    USING (user_id = auth.uid());

-- transactions
CREATE POLICY "Own transactions"
    ON transactions FOR ALL
    USING (user_id = auth.uid());

-- recurring_transactions
CREATE POLICY "Own recurring"
    ON recurring_transactions FOR ALL
    USING (user_id = auth.uid());

-- budget_plans
CREATE POLICY "Own budget"
    ON budget_plans FOR ALL
    USING (user_id = auth.uid());

-- income
CREATE POLICY "Own income streams"
    ON income_streams FOR ALL
    USING (user_id = auth.uid());

CREATE POLICY "Own income records"
    ON income_records FOR ALL
    USING (user_id = auth.uid());

-- debt
CREATE POLICY "Own debt records"
    ON debt_records FOR ALL
    USING (user_id = auth.uid());

CREATE POLICY "Own debt payments"
    ON debt_payments FOR ALL
    USING (user_id = auth.uid());

-- savings
CREATE POLICY "Own savings goals"
    ON savings_goals FOR ALL
    USING (user_id = auth.uid());

CREATE POLICY "Own savings records"
    ON savings_records FOR ALL
    USING (user_id = auth.uid());

-- net worth
CREATE POLICY "Own net worth"
    ON net_worth_snapshots FOR ALL
    USING (user_id = auth.uid());

-- products: read system + own; manage own
CREATE POLICY "Read system and own products"
    ON products FOR SELECT
    USING (is_system = true OR user_id = auth.uid());

CREATE POLICY "Manage own products"
    ON products FOR ALL
    USING (user_id = auth.uid());

-- price records, shopping
CREATE POLICY "Own price records"
    ON price_records FOR ALL
    USING (user_id = auth.uid());

CREATE POLICY "Own shopping lists"
    ON shopping_lists FOR ALL
    USING (user_id = auth.uid());

CREATE POLICY "Own list items"
    ON shopping_list_items FOR ALL
    USING (
        list_id IN (SELECT id FROM shopping_lists WHERE user_id = auth.uid())
    );

-- alerts, insights
CREATE POLICY "Own alerts"
    ON alerts FOR ALL
    USING (user_id = auth.uid());

CREATE POLICY "Own insights"
    ON ai_insights FOR ALL
    USING (user_id = auth.uid());

-- custom options
CREATE POLICY "Own dropdown options"
    ON custom_dropdown_options FOR ALL
    USING (user_id = auth.uid());

-- audit log: users can read their own entries only; inserts are SECURITY DEFINER
CREATE POLICY "Read own audit log"
    ON audit_log FOR SELECT
    USING (user_id = auth.uid());

-- ════════════════════════════════════════════════════════════════════════════════
--  16. REALTIME SUBSCRIPTIONS
-- ════════════════════════════════════════════════════════════════════════════════

BEGIN;
    DROP PUBLICATION IF EXISTS supabase_realtime;
    CREATE PUBLICATION supabase_realtime FOR TABLE
        transactions,
        budget_plans,
        alerts,
        savings_goals,
        debt_records,
        net_worth_snapshots,
        income_streams,
        savings_records;
COMMIT;

-- ════════════════════════════════════════════════════════════════════════════════
--  END OF SCHEMA
-- ════════════════════════════════════════════════════════════════════════════════

-- Verify: SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';