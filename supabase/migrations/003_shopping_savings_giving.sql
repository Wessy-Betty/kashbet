-- ═══════════════════════════════════════════════════════════════════════════════
--  KashBet — Migration 003
--  P3: real_price column on price_records (real/tag price vs what you paid)
--  P4: giving_records table (+ custom)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
--  P3 — real_price on price_records
--  real_price = shelf / tag / RRP price
--  price      = what you actually paid (already exists)
--  savings    = real_price - price  (computed in the app)
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE price_records
    ADD COLUMN IF NOT EXISTS real_price NUMERIC(10,2) CHECK (real_price > 0);

-- ────────────────────────────────────────────────────────────────────────────
--  P4 — giving_records
-- ────────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS giving_records CASCADE;

CREATE TABLE giving_records (
    id         UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID          NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    person     TEXT          NOT NULL,        
    amount     NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    given_date DATE          NOT NULL DEFAULT CURRENT_DATE,
    notes      TEXT,
    created_at TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX idx_giving_user_date ON giving_records(user_id, given_date DESC);

ALTER TABLE giving_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own giving records"
    ON giving_records FOR ALL
    USING (user_id = auth.uid());

-- Add to realtime publication if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE giving_records;
    END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  END OF MIGRATION 003
-- ════════════════════════════════════════════════════════════════════════════
