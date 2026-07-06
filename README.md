# KashBet — Full-Stack AI Personal Finance App

A production-ready React + Supabase personal finance application with AI-powered insights via Claude.

---

## 📁 Project Structure

```
kashbet/
├── src/
│   ├── components/
│   │   ├── AppLayout.tsx          # Sidebar, routing shell
│   │   ├── AddTransactionModal.tsx
│   │   └── ui.tsx                 # Shared UI components
│   ├── hooks/
│   │   ├── useFinance.ts          # All React Query data hooks
│   │   └── useAuthGuard.ts        # Auth state hook
│   ├── lib/
│   │   ├── supabase.ts            # Supabase client
│   │   └── utils.ts               # Formatting, math, chart helpers
│   ├── pages/
│   │   ├── AuthPage.tsx
│   │   ├── Dashboard.tsx
│   │   ├── Transactions.tsx
│   │   ├── BudgetWeeklyIncomeSavingsDebt.tsx  # Budget, Weekly, Income, Savings, Debt
│   │   ├── ShoppingNetWorthAnnualAdvisorSettings.tsx
│   │   └── index.ts / pages2.ts   # Re-exports
│   ├── store/
│   │   └── appStore.ts            # Zustand global state
│   ├── types/
│   │   └── index.ts               # All TypeScript types
│   ├── main.tsx                   # App entry + routes
│   └── index.css                  # Global styles + design tokens
├── supabase/
│   ├── migrations/
│   │   └── 001_initial_schema.sql # Complete DB schema
│   └── functions/
│       └── ai-proxy/
│           └── index.ts           # Anthropic API edge function
├── public/
├── .env.example
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
└── package.json
```

---

## 🚀 Setup Guide

### Step 1 — Prerequisites

```bash
node --version   # Must be >= 18
npm --version    # Must be >= 9
```

Install Supabase CLI (optional but recommended):

```bash
npm install -g supabase
```

---

### Step 2 — Clone and Install

```bash
# If you downloaded the zip, extract it, then:
cd kashbet
npm install
```

---

### Step 3 — Create a Supabase Project

1. Go to [https://supabase.com](https://supabase.com) and sign up / log in
2. Click **New Project**
3. Choose a name (e.g. `kashbet-pro`), set a strong database password, choose your region
4. Wait ~2 minutes for the project to provision
5. Go to **Settings → API**
6. Copy:
   - **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - **anon public** key (long JWT string)

---

### Step 4 — Configure Environment Variables

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

### Step 5 — Run the SQL Schema

This is the most important step. It creates all tables, views, triggers, RLS policies, and seed data.

#### Option A — Supabase Dashboard (easiest)

1. In your Supabase project, go to **SQL Editor** (left sidebar)
2. Click **New Query**
3. Open the file `supabase/migrations/001_initial_schema.sql`
4. Copy the entire contents and paste into the SQL editor
5. Click **Run** (or press Ctrl+Enter)
6. You should see: `Success. No rows returned`

#### Option B — Supabase CLI

```bash
supabase login
supabase link --project-ref your-project-ref
supabase db push
```

#### Option C — Direct psql connection

```bash
psql "postgresql://postgres:[YOUR_DB_PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres" \
  -f supabase/migrations/001_initial_schema.sql
```

Find your database password in **Supabase → Settings → Database → Connection string**.

---

### Step 6 — Verify the Schema

Run this in the SQL Editor to confirm everything was created:

```sql
-- Check all tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- Should return 20+ tables including:
-- accounts, alerts, ai_insights, audit_log, budget_plans,
-- custom_dropdown_options, debt_payments, debt_records,
-- household_members, households, income_records, income_streams,
-- net_worth_snapshots, price_records, products, recurring_transactions,
-- savings_goals, savings_records, shopping_list_items, shopping_lists,
-- transaction_categories, transactions, user_profiles

-- Check views
SELECT table_name
FROM information_schema.views
WHERE table_schema = 'public';

-- Should return:
-- budget_summary_view, monthly_summary_view, transactions_with_details

-- Check system categories were seeded
SELECT name, classification FROM transaction_categories WHERE is_system = true ORDER BY sort_order;
```

---

### Step 7 — Add Demo Seed Data (Optional)

After creating your first account in the app:

1. Go to **Supabase → Authentication → Users**
2. Copy your user's UUID (format: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)
3. Go to **SQL Editor** and run:

```sql
-- Replace the UUID below with your actual user ID
DO $$
DECLARE
    demo_user UUID := 'paste-your-uuid-here';
    acc_savings UUID := uuid_generate_v4();
    acc_mpesa   UUID := uuid_generate_v4();
BEGIN
    INSERT INTO accounts (id, user_id, name, type, balance, institution) VALUES
        (acc_savings, demo_user, 'Equity Bank Savings', 'savings', 247000, 'Equity Bank'),
        (acc_mpesa,   demo_user, 'M-Pesa Wallet',       'cash',    8320,   'Safaricom');

    INSERT INTO budget_plans (user_id, year, month, category_id, planned_amount) VALUES
        (demo_user, 2026, 2, '00000000-0001-0000-0000-000000000000', 18000),
        (demo_user, 2026, 2, '00000000-0002-0000-0000-000000000000', 12000),
        (demo_user, 2026, 2, '00000000-0009-0000-0000-000000000000', 10000),
        (demo_user, 2026, 2, '00000000-0015-0000-0000-000000000000', 20000);

    INSERT INTO alerts (user_id, type, severity, message) VALUES
        (demo_user, 'budget_over', 'critical', '<strong>Dining & Entertainment</strong> is 142% of budget this month.'),
        (demo_user, 'debt_due',    'info',     'Loan to <strong>James Otieno</strong> of KSh 5,000 is due in 3 days.');

    RAISE NOTICE 'Seed data inserted for %', demo_user;
END;
$$;
```

---

### Step 8 — Start the Development Server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

Create an account, and you'll land on the dashboard with demo data.

---

### Step 9 — Set Up AI Advisor (Optional)

The AI Advisor requires an Anthropic API key. Without it, the app still works — the Advisor page shows pre-built demo responses.

**To enable live AI:**

1. Get an API key from [https://console.anthropic.com](https://console.anthropic.com)

2. Install Supabase CLI and deploy the edge function:

```bash
supabase login
supabase link --project-ref your-project-ref

# Set the secret (never put this in frontend code)
supabase secrets set ANTHROPIC_API_KEY=sk-ant-api03-...

# Deploy the function
supabase functions deploy ai-proxy
```

3. In `src/pages/ShoppingNetWorthAnnualAdvisorSettings.tsx`, find the `sendMessage` function in the `Advisor` component and replace the demo response with a real API call:

```typescript
// Replace the fake delay + demo response with:
const { data } = await supabase.functions.invoke("ai-proxy", {
  body: { prompt: text, context_type: "general" },
});
const response = data?.response ?? "Unable to connect to AI advisor.";
```

---

### Step 10 — Build for Production

```bash
npm run build
```

Deploy the `dist/` folder to:

- **Vercel**: `vercel --prod` (recommended — zero config)
- **Netlify**: drag & drop `dist/` folder
- **Cloudflare Pages**: connect your Git repo

---

## 🗄️ Database Schema Overview

| Table                     | Purpose                                        |
| ------------------------- | ---------------------------------------------- |
| `user_profiles`           | User settings, currency, plan                  |
| `accounts`                | Bank accounts, M-Pesa, investments             |
| `transaction_categories`  | System + custom categories with classification |
| `transactions`            | All financial transactions                     |
| `budget_plans`            | Monthly planned amounts per category           |
| `income_streams`          | Named income sources                           |
| `income_records`          | Actual income received                         |
| `debt_records`            | Loans owed / loaned out                        |
| `debt_payments`           | Payment history per debt                       |
| `savings_goals`           | Named savings targets                          |
| `savings_records`         | Monthly balance history                        |
| `net_worth_snapshots`     | Monthly net worth history                      |
| `products`                | Product catalogue for price tracking           |
| `price_records`           | Price history per product/store                |
| `shopping_lists`          | Shopping list containers                       |
| `shopping_list_items`     | Items in each list                             |
| `alerts`                  | System-generated financial alerts              |
| `ai_insights`             | Stored AI analysis results                     |
| `custom_dropdown_options` | User-defined dropdown values                   |
| `audit_log`               | Change history for sensitive tables            |

**Views:**

- `transactions_with_details` — joins category/account names onto transactions
- `budget_summary_view` — planned vs actual per category per month
- `monthly_summary_view` — aggregate income/expenses per user per month

---

## 🔐 Security Architecture

- **Row Level Security (RLS)** enabled on all tables — users can only access their own data
- **Auth** via Supabase Auth (email/password + Google OAuth)
- **Anthropic API key** stored as a Supabase Vault secret — never in frontend code
- **AI prompts** contain only aggregated summaries, no PII
- **Audit log** records all writes to transactions, debt, and income tables
- **GDPR export** available from Settings page

---

## 💡 Customisation Tips

### Change the default currency

In `src/store/appStore.ts`, change the `currency_symbol` default:

```typescript
currency_symbol: "KSh"; // change to '$', '£', '€', etc.
```

Or update it per-user in the Settings page.

### Add a new category

```sql
INSERT INTO transaction_categories (name, classification, icon, is_system)
VALUES ('Pet Care', 'need', '🐾', true);
```

### Add a new product

```sql
INSERT INTO products (name, category, unit, is_system)
VALUES ('Unga wa Ugali (2kg)', 'Flour', 'kg', true);
```

### Enable Google OAuth

In Supabase → Authentication → Providers → Google, follow the setup guide and add your OAuth credentials.

---

## 📦 Tech Stack

| Layer              | Technology                           |
| ------------------ | ------------------------------------ |
| Frontend framework | React 18 + TypeScript                |
| Build tool         | Vite 5                               |
| Styling            | Tailwind CSS + CSS variables         |
| Charts             | Chart.js + react-chartjs-2           |
| Server state       | TanStack React Query v5              |
| Global state       | Zustand                              |
| Forms              | React Hook Form + Zod                |
| Routing            | React Router v6                      |
| Backend / DB       | Supabase (PostgreSQL)                |
| Auth               | Supabase Auth                        |
| Realtime           | Supabase Realtime                    |
| AI                 | Anthropic Claude (via Edge Function) |
| Date handling      | date-fns                             |
| Toasts             | react-hot-toast                      |

---

## 🛠️ Common Issues

**"Missing Supabase environment variables"**
→ Make sure you created `.env.local` (not `.env`) and it contains both variables.

**"RLS policy violation"**
→ Make sure you're signed in. Check that the `user_profiles` row was created for your user (it's auto-created by the `handle_new_user` trigger, but if you ran schema before enabling Auth, you may need to insert manually).

**Charts not rendering**
→ Chart.js requires the canvas to have a measured width. Make sure parent containers have explicit heights.

**AI Advisor returns demo responses**
→ The Edge Function hasn't been deployed yet. This is expected — the app is fully functional without it.
