-- ═══════════════════════════════════════════════════════════════════════════════
--  KashBet — Migration 012  (SECURITY FIX)
--
--  Postgres views run with the privileges of their OWNER by default, which
--  bypasses Row-Level Security on the underlying tables. Both app views were
--  created this way, so ANY authenticated user querying `transactions_with_details`
--  received EVERY user's transactions — new users saw other people's data.
--
--  Fix: set security_invoker = true so the views run as the querying user and
--  the RLS policies on the base tables are enforced. (Postgres 15+, Supabase.)
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER VIEW transactions_with_details SET (security_invoker = true);
ALTER VIEW monthly_summary_view      SET (security_invoker = true);

-- ════════════════════════════════════════════════════════════════════════════
--  END OF MIGRATION 012
-- ════════════════════════════════════════════════════════════════════════════
