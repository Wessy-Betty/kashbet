-- ═══════════════════════════════════════════════════════════════════════════════
--  KashBet — Migration 015
--  Add a 'special_fund' investment account type (Special / Fixed Income Funds).
--
--  The Add Account form can now create these self-serve, so the account_type
--  CHECK needs to accept the new value alongside the existing ones. Purely
--  additive — no existing rows change.
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE investment_accounts
  DROP CONSTRAINT IF EXISTS investment_accounts_account_type_check;

ALTER TABLE investment_accounts
  ADD CONSTRAINT investment_accounts_account_type_check
  CHECK (account_type IN ('mmf','sacco','insurance','bank','stocks','special_fund','other'));

-- Verify: \d investment_accounts  (the CHECK should list special_fund)
