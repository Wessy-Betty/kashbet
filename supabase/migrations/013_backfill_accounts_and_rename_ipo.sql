-- ═══════════════════════════════════════════════════════════════════════════════
--  KashBet — Migration 013
--
--  1. Backfill default liquid accounts (M-PESA, Cash, KCB Account) for any
--     existing user who has zero rows in `accounts`. New users get these from
--     the app's own seeding logic now (useAccounts in useFinance.ts) — this
--     migration only catches users who signed up before that fix landed and
--     therefore see no "Liquid / Mobile Money" section on the Accounts page.
--
--  2. Rename the IPO investment account: code 'NSE_IPO' → 'NSE_KPC',
--     name → 'KPC IPO' (was previously 'IPO Allocation').
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Backfill missing liquid accounts, per user ──────────────────────────────
DO $$
DECLARE u RECORD;
BEGIN
  FOR u IN SELECT id FROM user_profiles LOOP
    IF NOT EXISTS (SELECT 1 FROM accounts WHERE user_id = u.id) THEN
      INSERT INTO accounts (user_id, name, type, balance, currency_code) VALUES
        (u.id, 'M-PESA',      'checking', 0, 'KES'),
        (u.id, 'Cash',        'cash',     0, 'KES'),
        (u.id, 'KCB Account', 'checking', 0, 'KES');
    END IF;
  END LOOP;
END $$;

-- ── 2. Rename NSE_IPO → NSE_KPC for every user who already has it ─────────────
UPDATE investment_accounts
   SET code = 'NSE_KPC',
       name = 'KPC IPO'
 WHERE code = 'NSE_IPO';

-- ════════════════════════════════════════════════════════════════════════════
--  END OF MIGRATION 013
-- ════════════════════════════════════════════════════════════════════════════
