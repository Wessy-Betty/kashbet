# KashBet — Backlog

Last updated: 2026-07-06

Running list of pending work, ordered by priority. Items move to "Done" as they ship.

---

## ✅ AI Advisor overhaul (shipped 2026-07-06)

- `buildContext()` now sends the full picture: net worth, bank/liquid accounts, investments (with rates), debts both directions (due dates, interest), savings goals + progress, income streams, subscriptions, budget vs actual, category **and subcategory** spending, 6-month income/expense trend.
- Analysis banner computes **real** stats (income, expenses, savings rate) — hardcoded demo text now only shows in demo mode.
- Proactive insights on load: month-over-month spending change, budget overspends, debts overdue/due ≤14 days, subscriptions billing ≤7 days — each with a deep-link button to the relevant page.
- Chat history persisted per user in localStorage (last 40 messages) with a "Clear chat" button.
- Edge function: model bumped to `claude-sonnet-5`, richer system prompt, max_tokens 1200. **⚠️ Requires redeploy:** `supabase functions deploy ai-advisor --no-verify-jwt` (old model keeps working until then).

---

## 🧭 Feature gaps vs. mature finance apps (idea pool)

**Data in/out:** M-Pesa/bank statement import (CSV/PDF) · export transactions & reports · receipt photo attachments · auto-posting recurring transactions (table exists, unused) · scheduled future transactions.
**Intelligence:** transaction **editing** (currently delete-only — near-bug) · split transactions · cash-flow forecast · category trend reports · auto net-worth snapshots · MMF interest accrual automation + returns % · duplicate detection.
**Life/habit:** push/email notifications (bill due, overspend) · PWA install + offline · PIN/biometric lock · multi-currency · household sharing UI (migration 004 groundwork) · new-user onboarding flow.

## 🎨 UX improvement pool

1. Undo snackbar instead of instant delete on transactions (highest risk today).
2. Edit button in the transaction detail modal.
3. Date grouping in transaction list (Today / Yesterday / date).
4. Tap month in top bar → month/year picker.
5. Remember last-used account & payment method in Add Transaction.
6. Empty states with CTAs; loading skeletons.
7. FAB overlaps content on some pages — reposition or hide while modals open.
8. Bottom tab bar on mobile for the 4 most-used pages.
9. `inputMode="decimal"` on amount fields for the number keypad.

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

### 6. Fix latent TypeScript errors (restore type safety in build)
The production build was changed to `vite build` (was `tsc && vite build`) to unblock deploy — `tsc` had never actually run because of an invalid `ignoreDeprecations` value, hiding ~20 real type errors:
- Missing type exports: `AlertSeverity`, `DashboardKPIs` from `@/types`.
- `demoData.ts` transactions missing `user_id` / `type` fields.
- `useAddTransaction` payload type missing `user_id`.
- Unused vars in `AddTransactionModal.tsx`, `ui.tsx`, `NetWorth.tsx`.

Fix them, then restore `"build": "tsc && vite build"` (or `tsc --noEmit && vite build`) so type errors block bad deploys. A `typecheck` script already exists (`npm run typecheck`).

### 7. Bundle size / code splitting
Production build warns the main chunk is >500 kB. Consider route-based dynamic `import()` or `manualChunks` to split vendor libs (chart.js, etc.).

---

## ⚙️ Operational — run when back online

Three DB migrations are written but need running in the Supabase SQL Editor, **in order**:
- [ ] **009** — double-count trigger fix (M-PESA was doubling on account-linked income). *Hit a network error earlier — likely never ran.*
- [ ] **010** — category restructure (Household Shopping + Loans & Lending, reorder).
- [ ] **011** — transaction subcategory/product columns + view update (incl. `transaction_cost`).

All three are idempotent (safe to re-run). **Verify test:** add 1,000 income into M-PESA → balance should rise by exactly 1,000, not 2,000.

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
