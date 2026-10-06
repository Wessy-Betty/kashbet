-- ═══════════════════════════════════════════════════════════════════════════════
--  KashBet / Fedika — Migration 020  (Unified Ledger · Phase A)
--
--  ADDITIVE ONLY. Nothing is dropped or changed; existing behaviour is identical.
--  This lays the foundation for one ledger + one accounts model:
--    1. A read-only `all_accounts` view that unifies the three account tables
--       (liquid `accounts`, `investment_accounts`, savings `savings_goals`) into
--       one shape. Nothing reads it yet — later phases migrate reads to it.
--    2. A `to_account_id` column on transactions for future first-class transfers
--       (a transfer debits account_id and credits to_account_id). Unused for now.
--
--  security_invoker = true so the view enforces each base table's RLS (same fix
--  as migration 012), i.e. a user only ever sees their own accounts.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Unified read view ──────────────────────────────────────────────────────
CREATE OR REPLACE VIEW all_accounts
WITH (security_invoker = true) AS
  SELECT
    id,
    user_id,
    name,
    type              AS kind,
    'liquid'          AS source,
    balance,
    institution,
    NULL::numeric     AS annual_rate,
    NULL::numeric     AS target_amount,
    NULL::date        AS target_date,
    is_active
  FROM accounts
  UNION ALL
  SELECT
    id,
    user_id,
    name,
    account_type      AS kind,
    'investment'      AS source,
    balance,
    institution,
    annual_rate,
    NULL::numeric     AS target_amount,
    NULL::date        AS target_date,
    is_active
  FROM investment_accounts
  UNION ALL
  SELECT
    id,
    user_id,
    name,
    'savings_goal'    AS kind,
    'goal'            AS source,
    current_balance   AS balance,
    NULL::text        AS institution,
    NULL::numeric     AS annual_rate,
    target_amount,
    target_date,
    is_active
  FROM savings_goals;

-- ── 2. Destination account for future transfers ───────────────────────────────
--  No FK: a transfer destination can be any account (liquid, investment, or
--  goal), which live in different tables. Integrity is enforced in app/trigger
--  logic in later phases. Unused until Phase B.
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS to_account_id UUID;

COMMENT ON COLUMN transactions.to_account_id IS
  'Destination account for transfers; references all_accounts (any account table). No FK by design.';
