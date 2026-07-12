-- ═══════════════════════════════════════════════════════════════════════════════
--  KashBet — Migration 016
--  Income "Expected" redesign: Expected and Received now live TOGETHER on one
--  income_records entry, per source, per month.
--
--  Before: income_streams.expected_amount was a single fixed value per source and
--  "Total Expected" summed every source the same way every month (one-time income
--  counted forever, no month-specificity). Now each entry carries its own expected
--  amount for a specific month, and an entry can exist before the money arrives
--  (Received = 0, no received_date yet).
--
--  `amount` keeps meaning RECEIVED (annual summaries already sum it), so this is
--  purely additive to existing rows.
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE income_records
  ADD COLUMN IF NOT EXISTS expected_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS period_year     SMALLINT,
  ADD COLUMN IF NOT EXISTS period_month    SMALLINT,
  ADD COLUMN IF NOT EXISTS account_id      UUID REFERENCES accounts(id) ON DELETE SET NULL;

-- Received is 0 until money lands; received_date is null until then.
ALTER TABLE income_records ALTER COLUMN amount SET DEFAULT 0;
ALTER TABLE income_records ALTER COLUMN received_date DROP NOT NULL;
ALTER TABLE income_records ALTER COLUMN received_date DROP DEFAULT;

-- Guard the month range (null allowed only defensively; the app always sets it).
ALTER TABLE income_records
  DROP CONSTRAINT IF EXISTS income_records_period_month_check;
ALTER TABLE income_records
  ADD CONSTRAINT income_records_period_month_check
  CHECK (period_month IS NULL OR period_month BETWEEN 1 AND 12);

-- Backfill the for-month anchor for existing receipts (all existing rows have a
-- received_date, so derive the period from it).
UPDATE income_records
   SET period_year  = EXTRACT(YEAR  FROM received_date)::smallint,
       period_month = EXTRACT(MONTH FROM received_date)::smallint
 WHERE period_year IS NULL AND received_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_income_records_period
  ON income_records (user_id, period_year, period_month);

-- Verify: \d income_records  (expected_amount, period_year, period_month, account_id present)
