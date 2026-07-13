# KashBet — Backlog

Last updated: 2026-07-12

Running list of pending work, ordered by priority. Items move to "Done" as they ship.

---

## ✅ Personalization fast path (shipped 2026-07-12)

Prep for letting friends test the app, so nobody inherits Betty's personal data. All frontend/hooks except one tiny migration.

- **Add Account is now self-serve for investments.** The Accounts page (`Investments.tsx`) Add Account form previously only created liquid `accounts` (checking/savings/cash) and told users to "add MMFs in Supabase." It now also creates `investment_accounts` (MMF, Special Fund / Fixed Income Fund, SACCO, NSE Stocks, Other Investment / Stocks) via a new `useAddInvestmentAccount` hook, with conditional Institution + Expected-annual-return fields. Fixed a latent bug: the type state defaulted to `"mobile_money"`, which matched no option.
- **Neutral new-user seeds.** `useInvestmentAccounts` no longer seeds Betty's specific funds (Ziidi/Stima/Etica/NSE shares) for everyone — new users start with **zero** investment accounts and add their own. Liquid seed trimmed to **M-PESA + Cash** only (dropped "KCB Account"). Existing users keep all their rows (seeding only ran on an empty account).
- **Family names de-hardcoded.** `Giving.tsx` no longer ships "Mum, Dad, Braiso, Kelly" — the person list builds only from the user's own records, with a "Select or add a person" prompt. `AddTransactionModal.tsx` "Family Support" subcategory now uses neutral labels (Parents, Sibling, Child, Relative, Other Family). Historical transactions keep their stored labels.
- **RLS audit: clean.** Every user-data table (`accounts`, `investment_accounts`, `investment_transactions`, `giving_records`, `income_streams`, `income_records`, `subscriptions`, …) enforces `user_id = auth.uid()`; the two views were fixed in 012. Nothing real leaks between users.
- **⚠️ Requires migration 015** (`015_investment_special_fund_type.sql`) for the Special Fund type — until run, adding one fails the account_type CHECK. Everything else works without a migration.

Left for the full build (backlog #2/#3): moving `SUBCATS`/`PRODUCTS` into per-user DB data with Settings management UIs.

## ✅ Flash-of-empty-data fix (shipped 2026-07-07)

Budget, Debt, Income, Savings, Settings, Shopping, and Weekly all used to fetch data via local `useState` + manual `useEffect`, so every page visit briefly showed 0/empty before the real numbers loaded. All 7 now use cached React Query hooks (`useBudgetWithSpending`, `useDebtsWithPayments`, `useIncomeStreamsAndRecords`, `useSavingsPageData`, `useHousehold`, `useShoppingData`, `useWeeklyPageData`) — same pattern as Dashboard/Net Worth/Transactions/Accounts already used. Revisiting a page within its cache window is now instant.

Fixed along the way:
- `useUpsertBudgetLine` was dead code (never called) with a bug — missing `user_id` in its upsert payload, would have failed against the `NOT NULL` constraint. Fixed and wired up for real use.
- Savings page used the same Mar–Feb "fiscal year" bug as Annual Summary did before its fix — aligned to calendar year (Jan–Dec) for consistency.
- `useAddTransaction`/`useDeleteTransaction` now also invalidate `weekly_page_data` so the Weekly view stays in sync when a transaction is added/deleted from elsewhere.

## ✅ AI Advisor overhaul (shipped 2026-07-06)

- `buildContext()` now sends the full picture: net worth, bank/liquid accounts, investments (with rates), debts both directions (due dates, interest), savings goals + progress, income streams, subscriptions, budget vs actual, category **and subcategory** spending, 6-month income/expense trend.
- Analysis banner computes **real** stats (income, expenses, savings rate) — hardcoded demo text now only shows in demo mode.
- Proactive insights on load: month-over-month spending change, budget overspends, debts overdue/due ≤14 days, subscriptions billing ≤7 days — each with a deep-link button to the relevant page.
- Chat history persisted per user in localStorage (last 40 messages) with a "Clear chat" button.
- Edge function: model bumped to `claude-sonnet-5`, richer system prompt, max_tokens 1200. **⚠️ Requires redeploy:** `supabase functions deploy ai-advisor --no-verify-jwt` (old model keeps working until then).

---

## ✅ P1 quick wins (shipped 2026-07-06)

Undo-delete with 6s restore toast · transaction **editing** (detail modal → Edit, implemented as delete+re-insert so balance triggers stay correct, with auto-restore on failure) · date grouping (Today/Yesterday) in transactions · tap month → month/year picker · remember last-used account & method · save toast with "View" · CSV export of filtered transactions · month-end cash-flow forecast KPI · duplicate warning (same description+amount ±3 days) · FAB bottom clearance · `inputMode="decimal"` on all money inputs.

## 🟡 P2 — next up (high impact, medium effort)

PWA/installable app · auto recurring transactions (catch-up-on-login) · auto net-worth snapshots · onboarding flow · category trend reports · empty states + skeletons · bottom tab bar on mobile · MMF accrual/returns · consistent page headers.

## 🔴 P3 — big bets

M-Pesa statement import · notifications (pair with PWA push) · receipt photos · scheduled transactions · app lock · split transactions.

## ⚪ P4 — later

Household sharing UI · multi-currency.

---

## 🔵 IN PROGRESS — Income "Expected" redesign (single-table model, decided)

**Context:** Working folder `/Users/b.wessy/Documents/code/kashbetv`. GitHub `Wessy-Betty/kashbet`. **User preference: never use em dashes in output.**

**Problem:** `income_streams.expected_amount` is a single fixed value per source, and "Total Expected" sums every source's expected amount — the SAME total every month regardless of month selected. So a one-time income counts as expected forever, there's no month-specificity, and received-over-expected pushes Collection Rate past 100% (looks like a bug).

**Decided model (user's own, chosen over the earlier A/B/C options):** Expected and Received live TOGETHER on one entry, per source, per month — no separate expected table, no auto-carry. The "Record Income" flow gets an **Expected amount** field alongside Received. Workflow: create an entry when you're expecting money (Received = 0), then edit it later to fill Received + date + account when it arrives. Update Expected any time before the money comes.

**Why this shape:** matches how Betty originally worked; kills the one-time-forever bug (nothing carries forward); overshoot and unexpected income become natural variance (received > expected on a row, or a row with Expected = 0).

**Decided design points:**
- **Multiple receipts in a month → option (b):** one entry per source/month carries the Expected; extra money that month is a separate entry with Expected = 0 (pure surplus, keeps its own date/account). No double-counted expected.
- **Pre-fill Expected:** blank field, source baseline shown as a placeholder hint only (never auto-committed). No carry-from-previous-month.
- **Overshoot:** show "On track + KSh X extra", never a raw >100%.
- **Month anchor:** an entry can exist before it's received, so it needs its own for-month stamp (received_date can't be the anchor). Add period_year/period_month to `income_records`.
- **Account on the entry:** account link is currently NOT stored on `income_records` (only on the paired transaction). Add `account_id` so editing-in a receipt later can set/update the right balance.
- **Transaction timing:** a pending entry (Received = 0) must NOT write a balance-moving transaction; the dual-write fires only when a real Received amount is filled.

**Out of scope:** the fragile `income_records`↔`transactions` match-on-amount+date+description dual-write stays untouched.

**Migration:** `016_income_expected_per_month.sql` — adds `expected_amount`, `period_year`, `period_month`, `account_id` to `income_records`; makes `received_date` nullable; backfills period from received_date for existing rows. Additive; `amount` still means received.

**Status:** BUILT (typecheck + build clean), **needs migration 016 run + live test**. Changes: `useIncomeStreamsAndRecords` filters by period_year/month; `Income.tsx` stats sum per-entry expected, per-row status, "On track + extra" collection rate, modal gains an Expected field and allows expected-only (Pending) entries that move no money until a receipt is entered.

**Merged Add Source + Record Income into ONE form (2026-07-12):** the two separate buttons were redundant under the new model. Now a single "+ Add Income" button opens one form whose Source field is a pick-or-type combobox (`SearchableSelect allowCustom`). Typing a name that isn't an existing source creates the source on save (seeding its baseline `expected_amount` from the entry; a small Type field appears only for new sources; frequency defaults monthly). The standalone "Add Source" button/modal and `handleSaveStream`/`formData` are gone. No manage-sources edit/delete screen yet (deferred). No migration for this part.

---

## 📋 Backlog

### 2. Settings → Category management
Let the user add / rename / delete their own categories **and** subcategories from the Settings page, instead of them being hardcoded.
- Categories live in the DB (`transaction_categories`) — already user-scoped.
- Subcategories & products are currently **hardcoded** in `AddTransactionModal.tsx` (`SUBCATS`, `PRODUCTS`). Moving these to the DB is the bigger piece of this task.
- Should preserve the system defaults while allowing custom additions.

### 3. Seed the Shopping page with the product catalog
The ~130-item product list from the spending sheet is a ready-made master shopping catalog.
- Seed the **Shopping page** item list from it (Groceries + Household Shopping products).
- Ties into the Product field already added to transactions (migration 011).

### 4. Additional categories from the spending sheet
Gap analysis of the PDF surfaced categories not yet in the app. User added **Household Shopping** and **Loans & Lending**; these remain optional:
- [ ] Insurance (Car, Health, Home, Life)
- [ ] Technology (Software, Hardware, Hosting, Online services)
- [ ] Pets
- [ ] Children (Allowance, Childcare, School, Activities)

### 5. Category filtering guardrails (optional tightening)
Currently the Add Transaction category dropdown uses "show all, just reorder" — income categories float to the ends by type but nothing is hidden. If mis-categorisation becomes a problem, tighten to strict filtering by transaction type.

### 6. ~~Fix latent TypeScript errors~~ — already resolved
`package.json`'s build script is `tsc --noEmit && vite build` and the full project typechecks clean (exit 0, zero errors) as of 2026-07-07. This must have been fixed in an earlier session — the backlog note describing ~20 hidden errors was stale.

### 7. Bundle size / code splitting
Production build warns the main chunk is >500 kB. Consider route-based dynamic `import()` or `manualChunks` to split vendor libs (chart.js, etc.).

---

## ⚙️ Operational — migration status

- [x] **009** — double-count trigger fix. Verified via `pg_trigger` query — old `trg_transaction_balance` confirmed gone.
- [x] **010** — category restructure. Verified — Household Shopping + Loans & Lending both present.
- [x] **011** — subcategory/product columns. Verified — both columns present on `transactions`.
- [x] **012** — RLS view security fix. Verified — both views show `security_invoker=true`.
- [x] **014** — income_streams type constraint (final form, without `paycheck`). User confirmed ran.
- [ ] **017** — make `write_audit_log()` skip logging when the owning user is gone, so deleting a user (cascade) no longer aborts on `audit_log_user_id_fkey`. **Needs running.** After it runs, `DELETE FROM auth.users WHERE id = '<uuid>'` works with no trigger workaround.
- [ ] **015** — add `special_fund` to investment_accounts account_type CHECK. **Needs running** for the Special Fund / Fixed Income Fund account type to insert. Additive only.
- [ ] **013** — backfill missing liquid accounts for existing users + rename NSE_IPO → NSE_KPC. **Not confirmed run** — this was given to fix a friend's account showing no "Liquid" section on Accounts. Confirm it ran, or have the friend refresh and check.

---

## 🚀 Deployment

- **Live:** https://kashbet.vercel.app
- **Repo:** github.com/Wessy-Betty/kashbet (private)
- **Host:** Vercel project under `wessy-betty` — auto-deploys on every push to `main`.
- **Env vars** set in Vercel: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_DEMO_MODE=false`.
- **Supabase Auth URLs:** Site URL = production; Redirect URLs include production + localhost (`/**` wildcards).
- Workflow going forward: commit + `git push` → Vercel rebuilds automatically.

---

## 🔒 Security

- **RLS view leak fixed (migration 012):** `transactions_with_details` and `monthly_summary_view` ran as the view owner, bypassing Row-Level Security — every user saw everyone's transactions. Fixed with `security_invoker = true` on both views. Verify: `SELECT relname, reloptions FROM pg_class WHERE relname IN (...)` shows `{security_invoker=true}`.

---

## 📱 Mobile / responsive (done)

- App-shell layout: pinned header, only the page body scrolls.
- Collapsible sidebar drawer (hamburger + backdrop) below 900px; sidebar uses `100dvh` so the user footer stays visible.
- `.stat-rail`: KPI rows are one flexible row (min 200px cards, scroll if too many) on desktop, Carrefour-style swipe on mobile. Applied to Dashboard, Annual, Income, Savings, Debt, Weekly, Subscriptions, Giving, Transactions summary.
- `.card-rail`: Accounts sections wrap on desktop, swipe on mobile.
- Transactions list = scrollable table (reverted from cards per feedback); rows tap to open detail.
- Tables inside cards scroll horizontally on mobile; Weekly 7-day grid is a swipe strip.
- Shopping price-tracker keeps 2-column inputs on mobile (`keep-2col`).
- No horizontal page scroll (overflow guards).

---

## ✅ Done (this session — 2026-07-05)

- Pushed to GitHub + deployed to Vercel with GitHub auto-deploy; verified live login works.
- Fixed the build: removed invalid `ignoreDeprecations` from tsconfig, set build to `vite build`, added `typecheck` script.
- Fixed double-counted M-PESA balance (duplicate triggers on `transactions`) — migration 009.
- Debt Tracker: record payments (partial/full), link to accounts, payment history per debt, auto-move to "Settled Debts" section when paid.
- Debt: link account when taking a loan / lending money.
- Net Worth page: converted to cached React Query hooks — no more balance flicker/reload on visit.
- Transactions: Category column never blank (Income / Transfer In / Transfer Out fallbacks).
- Category restructure: added Household Shopping + Loans & Lending, fixed broken subcategory name mappings, income-aware reordering — migration 010.
- Expanded Groceries & House Shopping subcategories from the real spending sheet.
- Added optional **Product** field (predefined dropdown per subcategory + free-typed entries) — migration 011. Also fixed subcategory never being saved.
- Transaction detail modal — tap any row to see full details (subcategory, product, account, transaction cost, notes).
