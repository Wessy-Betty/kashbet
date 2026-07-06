-- ═══════════════════════════════════════════════════════════════════════════════
--  KashBet — Migration 006
--  Subscriptions tracker: recurring bills with monthly cost overview.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS subscriptions (
    id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id       UUID        NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    name          TEXT        NOT NULL,
    amount        NUMERIC(10,2) NOT NULL,
    billing_cycle TEXT        NOT NULL DEFAULT 'monthly', -- monthly | annual | weekly
    next_due_date DATE,
    category      TEXT        NOT NULL DEFAULT 'Subscriptions',
    notes         TEXT,
    is_active     BOOLEAN     NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own subscriptions"
    ON subscriptions FOR ALL
    USING  (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
