# KashBet — Backlog

Last updated: 2026-07-05

Running list of pending work, ordered by priority. Items move to "Done" as they ship.

---

## 🔜 Next session (priority)

### 1. AI Advisor overhaul
**Goal:** Turn the advisor from a thin single-month helper into an assistant that sees the whole financial picture and gives specific, data-grounded advice.

**Current limitations** (`src/pages/Advisor.tsx`):
- Context only includes **current-month** transactions + budget (income, expenses, savings rate, top 6 categories, budget lines).
- **Blind to:** net worth, account balances, investments/MMFs, debts (owed to me & owed by me), savings goals, income streams, and the new subcategory/product data.
- The purple "Monthly Analysis" banner shows **hardcoded demo stats** (e.g. "32.4% savings rate") even in live mode — should reflect real numbers.
- No multi-month trend analysis — can't answer "how does this compare to last month?"
- Chat history isn't persisted (resets on refresh).
- Formatting is limited to bold + line breaks.

**Proposed scope:**
- [ ] Expand `buildContext()` to include: net worth (assets − liabilities), account balances, investment balances by account, active debts (both directions) with due dates, savings goals + progress, income streams (expected vs received), and top spending by **subcategory/product**.
- [ ] Pull **3–6 months** of history for trend/comparison questions (net worth snapshots + monthly transaction totals).
- [ ] Make the analysis banner compute **real** stats (savings rate, biggest category, month-over-month change), replacing the hardcoded demo text.
- [ ] Add proactive insights on load (e.g. "dining up 42% vs your 3-month average", "KCB debt due in 5 days").
- [ ] Persist chat history per user (new `advisor_messages` table or local storage).
- [ ] Optionally: suggested-action buttons that deep-link to the relevant page (e.g. "Review debts" → Debt Tracker).
- [ ] Review the `ai-advisor` Supabase Edge Function — confirm model, system prompt, and token limits handle the richer context.

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
