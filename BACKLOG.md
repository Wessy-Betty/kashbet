# KashBet — Backlog

Last updated: 2026-07-07

Running list of pending work, ordered by priority. Items move to "Done" as they ship.

---

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

## 🔵 IN PROGRESS (paused mid-brainstorm — resume here) — Income "Expected" redesign

**Context:** Working folder is now `/Users/b.wessy/Documents/code/kashbetv` (renamed twice; was `claude/` then `claudecode/`). GitHub user `Wessy-Betty`, repo `kashbet`. **User preference: never use em dashes in output.**

**The problem we identified:** `income_streams.expected_amount` is a single fixed value per source, and Income Tracker's "Total Expected" just sums every source's expected amount — the SAME total every month, regardless of the month selected. Two consequences:
1. A one-time income counts as "expected" every month forever (the `frequency` field exists but is ignored in the expected math).
2. No way to say "I expect more in December" (bonus month), and no bulk-edit for expected amounts.

**Three model options discussed:**
- **A** — Bulk-edit popup, but keep one fixed value per source. Simplest; doesn't fix month-specificity or the one-time bug.
- **B** (recommended) — Expected becomes per-month (new lightweight table, mirroring how `budget_plans` already work: user_id, income_stream_id, year, month, expected_amount). Recurring sources auto-carry their default each month; one-time sources only count in their month. Bulk-edit popup = "set expected income for {month}". Makes Total Expected + Collection Rate finally month-meaningful.
- **C** — Hybrid: default-on-source + per-month override. Most flexible, most complex.

**User's requested UX:** click the "Total Expected" card → popup listing each source with an editable expected field → save all at once.

**Unexpected income question:** user sometimes receives money they didn't expect. Today you MUST pick an existing source to record income, and received-over-expected makes Collection Rate exceed 100% (looks odd). Framing to build toward: Expected = forecast, Received = reality, unexpected = positive variance. Options floated: allow a free-typed one-off source, and reframe overshoot as "on track + KSh X extra" rather than >100%.

**3 open decisions (need user's answer to proceed):**
1. Expected model: A, B (rec), or C?
2. Collection rate when received > expected: show real % (e.g. 150%), cap at 100%, or reframe as "on track + extra"?
3. Unexpected-income UX: allow free-typed one-off source, or always tie to a named source?

**No code written for this yet** — pure brainstorm. Last shipped commit: `e41bf0b` (Income Tracker column restore + edit/delete).

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
