-- ═══════════════════════════════════════════════════════════════════════════════
--  KashBet — Migration 004
--  P5: Household invite flow + household-aware RLS for two-earner setup
-- ═══════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
--  1. HOUSEHOLD INVITES TABLE
-- ────────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS household_invites CASCADE;

CREATE TABLE household_invites (
    id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    household_id UUID        NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    invite_code  TEXT        UNIQUE NOT NULL,
    created_by   UUID        NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    expires_at   TIMESTAMPTZ NOT NULL DEFAULT now() + interval '7 days',
    used_by      UUID        REFERENCES user_profiles(id) ON DELETE SET NULL,
    used_at      TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_invites_code ON household_invites(invite_code);

ALTER TABLE household_invites ENABLE ROW LEVEL SECURITY;

-- Household owner can manage invites; anyone can read an invite by code
-- (reading by code is needed to validate it before the user is a member)
CREATE POLICY "Owner can manage invites"
    ON household_invites FOR ALL
    USING (created_by = auth.uid());

CREATE POLICY "Anyone can read invite by code"
    ON household_invites FOR SELECT
    USING (true);   -- validated by code lookup, not by ownership

-- ────────────────────────────────────────────────────────────────────────────
--  2. RLS HELPER — reusable function to get the caller's household_id
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION auth_household_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT household_id FROM user_profiles WHERE id = auth.uid()
$$;

-- ────────────────────────────────────────────────────────────────────────────
--  3. HOUSEHOLD-AWARE RLS
--  Each policy is: own row  OR  same household as caller.
--  For users with no household, auth_household_id() is NULL so the
--  household branch matches nothing — purely personal data as before.
-- ────────────────────────────────────────────────────────────────────────────

-- households: members can read; owner manages
DROP POLICY IF EXISTS "Own household" ON households;
CREATE POLICY "Household read"
    ON households FOR SELECT
    USING (
        owner_id = auth.uid() OR
        id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid())
    );
CREATE POLICY "Household owner manage"
    ON households FOR ALL
    USING (owner_id = auth.uid());

-- household_members: members can read; only owners can insert/delete
DROP POLICY IF EXISTS "Own household members" ON household_members;
CREATE POLICY "Household members read"
    ON household_members FOR SELECT
    USING (
        user_id = auth.uid() OR
        household_id = auth_household_id()
    );
CREATE POLICY "Household members insert"
    ON household_members FOR INSERT
    WITH CHECK (
        -- owner can add members, or user adds themselves (join flow)
        household_id IN (SELECT id FROM households WHERE owner_id = auth.uid())
        OR user_id = auth.uid()
    );
CREATE POLICY "Household members delete"
    ON household_members FOR DELETE
    USING (
        user_id = auth.uid() OR
        household_id IN (SELECT id FROM households WHERE owner_id = auth.uid())
    );

-- transactions — shared across household
DROP POLICY IF EXISTS "Own transactions" ON transactions;
CREATE POLICY "Household transactions"
    ON transactions FOR ALL
    USING (
        user_id = auth.uid() OR (
            auth_household_id() IS NOT NULL AND
            user_id IN (
                SELECT user_id FROM household_members
                WHERE household_id = auth_household_id()
            )
        )
    );

-- accounts
DROP POLICY IF EXISTS "Own accounts" ON accounts;
CREATE POLICY "Household accounts"
    ON accounts FOR ALL
    USING (
        user_id = auth.uid() OR (
            auth_household_id() IS NOT NULL AND
            user_id IN (
                SELECT user_id FROM household_members
                WHERE household_id = auth_household_id()
            )
        )
    );

-- budget_plans
DROP POLICY IF EXISTS "Own budget" ON budget_plans;
CREATE POLICY "Household budget"
    ON budget_plans FOR ALL
    USING (
        user_id = auth.uid() OR (
            auth_household_id() IS NOT NULL AND
            user_id IN (
                SELECT user_id FROM household_members
                WHERE household_id = auth_household_id()
            )
        )
    );

-- income_streams + income_records
DROP POLICY IF EXISTS "Own income streams" ON income_streams;
CREATE POLICY "Household income streams"
    ON income_streams FOR ALL
    USING (
        user_id = auth.uid() OR (
            auth_household_id() IS NOT NULL AND
            user_id IN (
                SELECT user_id FROM household_members
                WHERE household_id = auth_household_id()
            )
        )
    );

DROP POLICY IF EXISTS "Own income records" ON income_records;
CREATE POLICY "Household income records"
    ON income_records FOR ALL
    USING (
        user_id = auth.uid() OR (
            auth_household_id() IS NOT NULL AND
            user_id IN (
                SELECT user_id FROM household_members
                WHERE household_id = auth_household_id()
            )
        )
    );

-- net_worth_snapshots
DROP POLICY IF EXISTS "Own net worth" ON net_worth_snapshots;
CREATE POLICY "Household net worth"
    ON net_worth_snapshots FOR ALL
    USING (
        user_id = auth.uid() OR (
            auth_household_id() IS NOT NULL AND
            user_id IN (
                SELECT user_id FROM household_members
                WHERE household_id = auth_household_id()
            )
        )
    );

-- ════════════════════════════════════════════════════════════════════════════
--  END OF MIGRATION 004
-- ════════════════════════════════════════════════════════════════════════════
