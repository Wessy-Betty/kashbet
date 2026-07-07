// ─── useFinance hooks ───────────────────────────────────────────────────────────
// All Supabase queries are automatically scoped to the authenticated user via
// Row Level Security (RLS). The hooks themselves do NOT need to pass a user_id
// filter — RLS handles isolation at the database level.
//
// Each hook uses React Query for caching, background refetch, and optimistic
// updates so the UI stays in sync with the database in real time.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type {
  Transaction,
  Category,
  BudgetPlan,
  Alert,
  SavingsGoal,
  DebtRecord,
  IncomeStream,
} from "@/types/finance";

// ─── Transactions ────────────────────────────────────────────────────────────

export function useTransactions(year: number, month: number) {
  return useQuery<Transaction[]>({
    queryKey: ["transactions", year, month],
    queryFn: async () => {
      // Build the first and last day of the requested month
      const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
      const endDate = new Date(year, month, 0) // day 0 of next month = last day of current
        .toISOString()
        .split("T")[0];

      const { data, error } = await supabase
        .from("transactions_with_details") // view that joins category name
        .select(
          "id, transaction_date, description, category_id, category_name, subcategory_name, product_name, classification, payment_method, amount, ai_classified, type, notes, account_id, account_name, transaction_cost",
        )
        .gte("transaction_date", startDate)
        .lte("transaction_date", endDate)
        .order("transaction_date", { ascending: false });

      if (error) throw new Error(error.message);
      return (data ?? []) as Transaction[];
    },
    staleTime: 1000 * 30, // 30 s cache
  });
}

export function useAddTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      user_id: string;
      amount: number;
      type: "income" | "expense" | "transfer";
      category_id?: string;
      subcategory_label?: string;
      product_name?: string;
      classification?: string;
      description: string;
      transaction_date: string;
      payment_method?: string;
      notes?: string;
      account_id?: string;
      transaction_cost?: number;
    }) => {
      const { error } = await supabase.from("transactions").insert([payload]);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
    },
  });
}

export function useDeleteTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("transactions")
        .delete()
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}

// ─── Categories ───────────────────────────────────────────────────────────────

export function useCategories() {
  return useQuery<Category[]>({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transaction_categories")
        .select("id, name, classification, icon, is_system")
        .order("sort_order");
      if (error) throw new Error(error.message);
      return (data ?? []) as Category[];
    },
    staleTime: 1000 * 60 * 5, // 5 min — categories rarely change
  });
}

// ─── Budget ──────────────────────────────────────────────────────────────────

export function useBudget(year: number, month: number) {
  return useQuery<BudgetPlan[]>({
    queryKey: ["budget", year, month],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("budget_plans")
        .select(
          "id, year, month, category_id, planned_amount, transaction_categories(name)",
        )
        .eq("year", year)
        .eq("month", month);
      if (error) throw new Error(error.message);
      return (data ?? []).map((row: Record<string, unknown>) => ({
        id: row.id,
        year: row.year,
        month: row.month,
        category_id: row.category_id,
        category_name:
          (row.transaction_categories as { name: string } | null)?.name ??
          "Unknown",
        planned_amount: row.planned_amount,
      })) as BudgetPlan[];
    },
    staleTime: 1000 * 60,
  });
}

export function useUpsertBudgetLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      year: number;
      month: number;
      category_id: string;
      planned_amount: number;
    }) => {
      const { error } = await supabase
        .from("budget_plans")
        .upsert([payload], { onConflict: "user_id,year,month,category_id" });
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["budget", vars.year, vars.month] });
    },
  });
}

// ─── Alerts ───────────────────────────────────────────────────────────────────

export function useAlerts() {
  return useQuery<Alert[]>({
    queryKey: ["alerts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("alerts")
        .select("id, type, severity, message, is_dismissed, created_at")
        .eq("is_dismissed", false)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as Alert[];
    },
    staleTime: 1000 * 30,
  });
}

export function useDismissAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("alerts")
        .update({ is_dismissed: true })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alerts"] });
    },
  });
}

// ─── Savings Goals ────────────────────────────────────────────────────────────

export function useSavingsGoals() {
  return useQuery<SavingsGoal[]>({
    queryKey: ["savings_goals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("savings_goals")
        .select("id, name, icon, target_amount, current_balance, target_date")
        .eq("is_active", true)
        .order("created_at");
      if (error) throw new Error(error.message);
      return (data ?? []) as SavingsGoal[];
    },
  });
}

export function useAddSavingsGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      name: string;
      icon?: string;
      target_amount: number;
      current_balance?: number;
      target_date?: string;
    }) => {
      const { error } = await supabase.from("savings_goals").insert([payload]);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["savings_goals"] });
    },
  });
}

// ─── Debt Records ─────────────────────────────────────────────────────────────

export function useDebts() {
  return useQuery<DebtRecord[]>({
    queryKey: ["debts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("debt_records")
        .select(
          "id, direction, person_entity, principal, interest_rate, start_date, due_date, remaining_balance, status",
        )
        .in("status", ["active", "overdue"])
        .order("created_at");
      if (error) throw new Error(error.message);
      return (data ?? []) as DebtRecord[];
    },
  });
}

export function useAddDebt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      direction: "owed_by_me" | "owed_to_me";
      person_entity: string;
      principal: number;
      interest_rate?: number;
      start_date?: string;
      due_date?: string;
      remaining_balance: number;
    }) => {
      const { error } = await supabase.from("debt_records").insert([payload]);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["debts"] });
    },
  });
}

// ─── Income Streams ───────────────────────────────────────────────────────────

export function useIncomeStreams() {
  return useQuery<IncomeStream[]>({
    queryKey: ["income_streams"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("income_streams")
        .select(
          "id, name, type, frequency, expected_amount, source_person, is_active",
        )
        .eq("is_active", true)
        .order("created_at");
      if (error) throw new Error(error.message);
      return (data ?? []) as IncomeStream[];
    },
  });
}

export function useAddIncomeStream() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      name: string;
      type: string;
      frequency: string;
      expected_amount: number;
      source_person?: string;
    }) => {
      const { error } = await supabase.from("income_streams").insert([payload]);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["income_streams"] });
    },
  });
}

// ─── Net Worth Snapshot ───────────────────────────────────────────────────────

export function useNetWorthHistory() {
  return useQuery({
    queryKey: ["net_worth"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("net_worth_snapshots")
        .select(
          "snapshot_date, net_worth, total_assets, total_liabilities, breakdown",
        )
        .order("snapshot_date", { ascending: true })
        .limit(24);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

export function useUpsertNetWorthSnapshot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      snapshot_date: string;
      total_assets: number;
      total_liabilities: number;
      breakdown: Record<string, number>;
    }) => {
      const { error } = await supabase
        .from("net_worth_snapshots")
        .upsert([payload], { onConflict: "user_id,snapshot_date" });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["net_worth"] });
    },
  });
}

// ─── User Profile ─────────────────────────────────────────────────────────────

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      full_name?: string;
      currency_code?: string;
      currency_symbol?: string;
      timezone?: string;
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("user_profiles")
        .update(payload)
        .eq("id", user.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user_profile"] });
    },
  });
}

// ─── Accounts ─────────────────────────────────────────────────────────────

/** Default liquid/bank accounts seeded for new users on first load */
const DEFAULT_ACCOUNTS = [
  { name: "M-PESA",      type: "checking" },
  { name: "Cash",        type: "cash" },
  { name: "KCB Account", type: "checking" },
] as const;

export function useAccounts() {
  return useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts")
        .select("id, name, type, balance, currency_code")
        .order("name");

      if (error) throw new Error(error.message);

      // Seed defaults on first visit — mirrors useInvestmentAccounts below.
      // Without this, brand-new users have zero rows and the whole
      // "Liquid / Mobile Money" section on the Accounts page stays hidden.
      if (data && data.length === 0) {
        const userId = (await supabase.auth.getUser()).data.user?.id;
        if (userId) {
          await supabase.from("accounts").insert(
            DEFAULT_ACCOUNTS.map((a) => ({ ...a, user_id: userId, balance: 0, currency_code: "KES" }))
          );
          const { data: seeded } = await supabase
            .from("accounts")
            .select("id, name, type, balance, currency_code")
            .order("name");
          return seeded ?? [];
        }
      }
      return data ?? [];
    },
    staleTime: 1000 * 30,
  });
}

export function useDebtRecords() {
  return useQuery({
    queryKey: ["debt_records"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("debt_records")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    staleTime: 1000 * 30,
  });
}

export function useUpdateAccountBalance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, balance }: { id: string; balance: number }) => {
      const { error } = await supabase
        .from("accounts")
        .update({ balance })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["accounts"] }),
  });
}

export function useAddAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { name: string; type: string; balance: number; currency?: string }) => {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      if (!userId) throw new Error("Not authenticated");
      const { error } = await supabase.from("accounts").insert({
        user_id: userId,
        name: payload.name,
        type: payload.type,
        balance: payload.balance,
        currency_code: payload.currency ?? "KES",
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["accounts"] }),
  });
}

// ─── Investment Accounts ───────────────────────────────────────────────────────

/** Default investment accounts seeded for new users on first load */
const DEFAULT_INVESTMENT_ACCOUNTS = [
  // MMFs
  { code: 'ZIIDI',     name: 'ZIIDI MMF',          institution: 'Ziidi',       account_type: 'mmf',    annual_rate: 0.12, sort_order: 1  },
  { code: 'KCB',       name: 'KCB MMF',            institution: 'KCB',         account_type: 'mmf',    annual_rate: 0.10, sort_order: 2  },
  { code: 'ETICA',     name: 'Etica MMF',           institution: 'Etica',       account_type: 'mmf',    annual_rate: 0.13, sort_order: 3  },
  { code: 'JUBILEE',   name: 'Jubilee MMF',         institution: 'Jubilee',     account_type: 'mmf',    annual_rate: 0.08, sort_order: 4  },
  { code: 'JUBILEE_J', name: 'Joint Jubilee MMF',   institution: 'Jubilee',     account_type: 'mmf',    annual_rate: 0.08, sort_order: 5  },
  // Special Funds
  { code: 'KUZA',      name: 'Kuza Special Fund',   institution: 'Kuza',        account_type: 'mmf',    annual_rate: 0.12, sort_order: 6  },
  // SACCOs
  { code: 'STIMA_A',   name: 'Stima Alpha',         institution: 'Stima Sacco', account_type: 'sacco',  annual_rate: 0.09, sort_order: 7  },
  { code: 'STIMA_S',   name: 'Stima Shares',        institution: 'Stima Sacco', account_type: 'sacco',  annual_rate: 0.09, sort_order: 8  },
  { code: 'STIMA_P',   name: 'Stima Prime',         institution: 'Stima Sacco', account_type: 'sacco',  annual_rate: 0.09, sort_order: 9  },
  // NSE Stocks
  { code: 'NSE_KPLC',   name: 'KPLC Shares',       institution: 'NSE',         account_type: 'stocks', annual_rate: 0.0,  sort_order: 10 },
  { code: 'NSE_SAFCOM', name: 'Saf Shares',   institution: 'NSE',         account_type: 'stocks', annual_rate: 0.0,  sort_order: 11 },
  { code: 'NSE_UCHUMI', name: 'Uchumi Shares',      institution: 'NSE',         account_type: 'stocks', annual_rate: 0.0,  sort_order: 12 },
  { code: 'NSE_KPC',    name: 'KPC IPO',     institution: 'NSE',         account_type: 'stocks', annual_rate: 0.0,  sort_order: 13 },
] as const;

export function useInvestmentAccounts() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['investment_accounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('investment_accounts')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw new Error(error.message);

      // Seed defaults on first visit
      if (data && data.length === 0) {
        const userId = (await supabase.auth.getUser()).data.user?.id;
        if (userId) {
          await supabase.from('investment_accounts').insert(
            DEFAULT_INVESTMENT_ACCOUNTS.map((a) => ({ ...a, user_id: userId }))
          );
          const { data: seeded } = await supabase
            .from('investment_accounts')
            .select('*')
            .eq('is_active', true)
            .order('sort_order');
          return seeded ?? [];
        }
      }
      return data ?? [];
    },
    staleTime: 1000 * 30,
  });
  return { ...query, invalidate: () => qc.invalidateQueries({ queryKey: ['investment_accounts'] }) };
}

export function useInvestmentTransactions(accountId: string | null) {
  return useQuery({
    queryKey: ['investment_transactions', accountId],
    enabled: !!accountId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('investment_transactions')
        .select('*')
        .eq('account_id', accountId!)
        .order('tx_date', { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

export function useAddInvestmentTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      account_id: string;
      tx_type: 'deposit' | 'withdrawal' | 'interest' | 'dividend' | 'fee';
      amount: number;
      tx_date: string;
      notes?: string;
      linked_account_id?: string;
      account_name?: string; // used for the transfer description
    }) => {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      if (!userId) throw new Error('Not authenticated');

      const { account_name, ...invPayload } = payload;
      const { error } = await supabase
        .from('investment_transactions')
        .insert({ ...invPayload, user_id: userId });
      if (error) throw new Error(error.message);

      // For withdrawals, create a transaction record for history visibility.
      // account_id is intentionally null here — trg_sync_bank_on_investment_tx
      // already credited the bank account when investment_transactions was inserted.
      if (payload.tx_type === 'withdrawal') {
        await supabase.from('transactions').insert({
          user_id: userId,
          amount: Math.abs(payload.amount),
          description: `MMF Withdrawal — ${account_name ?? 'Investment'}`,
          transaction_date: payload.tx_date,
          type: 'income',
          classification: 'transfer',
          payment_method: 'Bank Transfer',
          account_id: null,
          notes: payload.notes ?? null,
        });
      }
    },
    onSuccess: (_d, variables) => {
      qc.invalidateQueries({ queryKey: ['investment_accounts'] });
      qc.invalidateQueries({ queryKey: ['investment_transactions', variables.account_id] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      if (variables.linked_account_id) {
        qc.invalidateQueries({ queryKey: ['accounts'] });
      }
    },
  });
}

export function useUpdateInvestmentRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, annual_rate }: { id: string; annual_rate: number }) => {
      const { error } = await supabase
        .from('investment_accounts')
        .update({ annual_rate })
        .eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['investment_accounts'] }),
  });
}

// ─── Monthly history (last N calendar months) ─────────────────────────────────
// Returns per-month income, expense, savings, and a flat transaction list
// for the period — used by the Dashboard charts so they show real data.

export function useMonthlyStats(months: number) {
  return useQuery({
    queryKey: ["monthly_stats", months],
    queryFn: async () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
      const startISO = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-01`;
      const endISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-31`;

      const { data, error } = await supabase
        .from("transactions")
        .select("amount, type, classification, transaction_date")
        .gte("transaction_date", startISO)
        .lte("transaction_date", endISO);

      if (error) throw new Error(error.message);

      // Build ordered month buckets
      type Bucket = { label: string; income: number; expense: number };
      const buckets: Record<string, Bucket> = {};
      for (let i = 0; i < months; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - (months - 1) + i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        buckets[key] = {
          label: d.toLocaleString("default", { month: "short" }),
          income: 0,
          expense: 0,
        };
      }

      for (const tx of data ?? []) {
        const key = tx.transaction_date.substring(0, 7);
        if (!buckets[key]) continue;
        if (tx.type === "income")  buckets[key].income  += Math.abs(tx.amount);
        if (tx.type === "expense") buckets[key].expense += Math.abs(tx.amount);
      }

      const sorted = Object.entries(buckets).sort(([a], [b]) => a.localeCompare(b));
      return {
        labels:   sorted.map(([, v]) => v.label),
        income:   sorted.map(([, v]) => v.income),
        expenses: sorted.map(([, v]) => v.expense),
        savings:  sorted.map(([, v]) => v.income - v.expense),
        all:      data ?? [],
      };
    },
  });
}

// ─── Subscriptions ────────────────────────────────────────────────────────────

export function useSubscriptions() {
  return useQuery({
    queryKey: ["subscriptions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("id, name, amount, billing_cycle, next_due_date, category, is_active")
        .eq("is_active", true)
        .order("next_due_date");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    staleTime: 1000 * 60 * 5,
  });
}

// ─── Annual Income ─────────────────────────────────────────────────────────────
export function useAnnualIncome(year: number) {
  return useQuery({
    queryKey: ["annual_income", year],
    queryFn: async () => {
      const startDate = `${year}-01-01`;
      const endDate = `${year}-12-31`;

      const { data, error } = await supabase
        .from("income_records")
        .select("amount, received_date")
        .gte("received_date", startDate)
        .lte("received_date", endDate);

      if (error) throw new Error(error.message);

      // Group by month for the summary chart
      const monthlyData = Array(12).fill(0);
      data?.forEach((record) => {
        const month = new Date(record.received_date).getMonth();
        monthlyData[month] += Number(record.amount);
      });

      return {
        total: data?.reduce((sum, r) => sum + Number(r.amount), 0) || 0,
        monthlyBreakdown: monthlyData,
      };
    },
  });
}