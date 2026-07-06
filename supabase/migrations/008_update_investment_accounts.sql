-- Migration 008: Correct investment account names/types and add all missing accounts
-- Run this in the Supabase SQL Editor

-- Get your user_id from existing investment accounts (avoids auth.uid() which is null in SQL editor)
DO $$
DECLARE
  uid UUID;
BEGIN
  -- Pull uid from the existing investment accounts you already have
  SELECT user_id INTO uid FROM investment_accounts LIMIT 1;

  IF uid IS NULL THEN
    RAISE EXCEPTION 'Could not find a user_id in investment_accounts. Make sure you are logged in and have existing accounts.';
  END IF;

  -- ── 1. Fix existing account names and types ───────────────────────────────

  UPDATE investment_accounts SET name = 'ZIIDI MMF',    account_type = 'mmf',   institution = 'Ziidi'   WHERE code = 'ZIIDI'   AND user_id = uid;
  UPDATE investment_accounts SET name = 'KCB MMF',      account_type = 'mmf',   institution = 'KCB'     WHERE code = 'KCB'     AND user_id = uid;
  UPDATE investment_accounts SET name = 'Etica MMF',    account_type = 'mmf',   institution = 'Etica'   WHERE code = 'ETICA'   AND user_id = uid;
  UPDATE investment_accounts SET name = 'Jubilee MMF',  account_type = 'mmf',   institution = 'Jubilee' WHERE code = 'JUBILEE' AND user_id = uid;

  UPDATE investment_accounts SET name = 'Stima Alpha',  account_type = 'sacco', institution = 'Stima Sacco' WHERE code = 'STIMA_A' AND user_id = uid;
  UPDATE investment_accounts SET name = 'Stima Shares', account_type = 'sacco', institution = 'Stima Sacco' WHERE code = 'STIMA_S' AND user_id = uid;
  UPDATE investment_accounts SET name = 'Stima Prime',  account_type = 'sacco', institution = 'Stima Sacco', code = 'STIMA_P' WHERE code = 'STIMA_C' AND user_id = uid;

  -- ── 1b. Extend the account_type check constraint to include 'stocks' ────

  ALTER TABLE investment_accounts
    DROP CONSTRAINT IF EXISTS investment_accounts_account_type_check;

  ALTER TABLE investment_accounts
    ADD CONSTRAINT investment_accounts_account_type_check
    CHECK (account_type IN ('mmf','sacco','insurance','bank','stocks','other'));

  -- ── 2. Add new investment accounts ───────────────────────────────────────

  INSERT INTO investment_accounts (user_id, code, name, institution, account_type, annual_rate, sort_order, is_active)
  VALUES
    (uid, 'JUBILEE_J',  'Joint Jubilee MMF',  'Jubilee',     'mmf',    0.08, 5,  true),
    (uid, 'KUZA',       'Kuza Special Fund',  'Kuza',        'mmf',    0.12, 6,  true),
    (uid, 'NSE_KPLC',   'KPLC Shares',        'NSE',         'stocks', 0.0,  10, true),
    (uid, 'NSE_SAFCOM', 'Safaricom Shares',   'NSE',         'stocks', 0.0,  11, true),
    (uid, 'NSE_UCHUMI', 'Uchumi Shares',      'NSE',         'stocks', 0.0,  12, true),
    (uid, 'NSE_IPO',    'IPO Allocation',     'NSE',         'stocks', 0.0,  13, true)
  ON CONFLICT (user_id, code) DO NOTHING;

  -- ── 3. Ensure liquid/bank accounts exist in the accounts table ────────────

  INSERT INTO accounts (user_id, name, type, balance, currency_code)
  SELECT uid, 'M-PESA', 'checking', 0, 'KES'
  WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE user_id = uid AND lower(name) LIKE '%pesa%');

  INSERT INTO accounts (user_id, name, type, balance, currency_code)
  SELECT uid, 'Cash', 'cash', 0, 'KES'
  WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE user_id = uid AND lower(name) = 'cash');

  INSERT INTO accounts (user_id, name, type, balance, currency_code)
  SELECT uid, 'KCB Account', 'checking', 0, 'KES'
  WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE user_id = uid AND lower(name) LIKE '%kcb%');

  RAISE NOTICE 'Done! User ID used: %', uid;
END;
$$;
