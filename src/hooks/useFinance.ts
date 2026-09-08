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
      qc.invalidateQueries({ queryKey: ["weekly_page_data"] });
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
      qc.invalidateQueries({ queryKey: ["weekly_page_data"] });
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

/**
 * Budget lines for a month plus actual spending per category and rollover
 * (unused surplus) carried in from the previous month. One cached query
 * replaces the multi-step manual fetch that used to run on every page visit.
 */
export function useBudgetWithSpending(year: number, month: number) {
  return useQuery({
    queryKey: ["budget_with_spending", year, month],
    queryFn: async () => {
      const { data: bData } = await supabase
        .from("budget_plans")
        .select("*, transaction_categories(name, classification, icon)")
        .eq("month", month)
        .eq("year", year);

      const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${year}-${String(month).padStart(2, "0")}-${lastDay}`;

      const { data: tData } = await supabase
        .from("transactions")
        .select("amount, category_id")
        .eq("type", "expense")
        .gte("transaction_date", startDate)
        .lte("transaction_date", endDate);

      const spendingMap: Record<string, number> = {};
      tData?.forEach((t) => {
        spendingMap[t.category_id] = (spendingMap[t.category_id] || 0) + Math.abs(Number(t.amount));
      });

      // Previous month — for rollover calculation
      const prevDate = new Date(year, month - 2, 1); // month is 1-based
      const prevMonth = prevDate.getMonth() + 1;
      const prevYear = prevDate.getFullYear();

      const { data: prevBudgets } = await supabase
        .from("budget_plans")
        .select("category_id, planned_amount")
        .eq("month", prevMonth)
        .eq("year", prevYear);

      const prevStart = `${prevYear}-${String(prevMonth).padStart(2, "0")}-01`;
      const prevLastDay = new Date(prevYear, prevMonth, 0).getDate();
      const prevEnd = `${prevYear}-${String(prevMonth).padStart(2, "0")}-${prevLastDay}`;

      const { data: prevTx } = await supabase
        .from("transactions")
        .select("amount, category_id")
        .eq("type", "expense")
        .gte("transaction_date", prevStart)
        .lte("transaction_date", prevEnd);

      const prevSpending: Record<string, number> = {};
      prevTx?.forEach((t) => {
        prevSpending[t.category_id] = (prevSpending[t.category_id] || 0) + Math.abs(Number(t.amount));
      });

      const rollover: Record<string, number> = {};
      prevBudgets?.forEach((b) => {
        const surplus = Number(b.planned_amount) - (prevSpending[b.category_id] || 0);
        if (surplus > 0) rollover[b.category_id] = surplus;
      });

      return { budgets: bData ?? [], actualSpending: spendingMap, rolloverMap: rollover };
    },
    staleTime: 1000 * 30,
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
      const userId = (await supabase.auth.getUser()).data.user?.id;
      if (!userId) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("budget_plans")
        .upsert([{ ...payload, user_id: userId }], { onConflict: "user_id,year,month,category_id" });
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["budget", vars.year, vars.month] });
      qc.invalidateQueries({ queryKey: ["budget_with_spending", vars.year, vars.month] });
    },
  });
}

export function useDeleteBudgetLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; year: number; month: number }) => {
      const { error } = await supabase
        .from("budget_plans")
        .delete()
        .eq("id", vars.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["budget", vars.year, vars.month] });
      qc.invalidateQueries({
        queryKey: ["budget_with_spending", vars.year, vars.month],
      });
    },
  });
}

/**
 * Pre-fill one month's budget from another month's planned amounts. Only fills
 * categories the target month doesn't already have, so it never clobbers lines
 * you've already set or tweaked. Used to plan a future month from the last one.
 */
export function useCopyBudgetFromMonth() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      fromYear: number;
      fromMonth: number;
      toYear: number;
      toMonth: number;
    }) => {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      if (!userId) throw new Error("Not authenticated");

      const { data: src, error: e1 } = await supabase
        .from("budget_plans")
        .select("category_id, planned_amount")
        .eq("year", p.fromYear)
        .eq("month", p.fromMonth);
      if (e1) throw new Error(e1.message);
      if (!src || src.length === 0) return { copied: 0 };

      const { data: existing } = await supabase
        .from("budget_plans")
        .select("category_id")
        .eq("year", p.toYear)
        .eq("month", p.toMonth);
      const have = new Set((existing ?? []).map((r) => r.category_id));

      const rows = src
        .filter((r) => !have.has(r.category_id))
        .map((r) => ({
          user_id: userId,
          year: p.toYear,
          month: p.toMonth,
          category_id: r.category_id,
          planned_amount: r.planned_amount,
        }));
      if (rows.length === 0) return { copied: 0 };

      const { error: e2 } = await supabase.from("budget_plans").insert(rows);
      if (e2) throw new Error(e2.message);
      return { copied: rows.length };
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["budget", vars.toYear, vars.toMonth] });
      qc.invalidateQueries({
        queryKey: ["budget_with_spending", vars.toYear, vars.toMonth],
      });
    },
  });
}

/**
 * Year-at-a-glance matrix: expenses grouped by category x month (12), plus
 * income totals per month. Powers the Annual page's "By category" view.
 */
export function useYearMatrix(year: number) {
  return useQuery({
    queryKey: ["year_matrix", year],
    queryFn: async () => {
      const yearStart = `${year}-01-01`;
      const yearEnd = `${year}-12-31`;

      const { data: exp } = await supabase
        .from("transactions")
        .select("amount, transaction_date, category_id")
        .eq("type", "expense")
        .gte("transaction_date", yearStart)
        .lte("transaction_date", yearEnd);

      // Look up category names separately: `transactions` has two FKs to
      // transaction_categories (category_id + subcategory_id), so an embedded
      // join is ambiguous and returns nothing.
      const { data: catRows } = await supabase
        .from("transaction_categories")
        .select("id, name");
      const catName: Record<string, string> = {};
      catRows?.forEach((c) => (catName[c.id as string] = c.name as string));

      const { data: inc } = await supabase
        .from("income_records")
        .select("amount, received_date")
        .gte("received_date", yearStart)
        .lte("received_date", yearEnd);

      const monthOf = (d: string) => new Date(d).getMonth(); // 0-11

      const catMap: Record<string, number[]> = {};
      exp?.forEach((e) => {
        const name = catName[e.category_id as string] ?? "Uncategorized";
        const i = monthOf(e.transaction_date);
        if (i < 0 || i > 11) return;
        (catMap[name] ??= Array(12).fill(0))[i] += Math.abs(Number(e.amount));
      });

      const categories = Object.entries(catMap)
        .map(([name, values]) => {
          const total = values.reduce((s, v) => s + v, 0);
          return { name, values, total, avg: total / 12 };
        })
        .sort((a, b) => b.total - a.total);

      const incomeTotals = Array(12).fill(0);
      inc?.forEach((r) => {
        const i = monthOf(r.received_date);
        if (i >= 0 && i <= 11) incomeTotals[i] += Number(r.amount);
      });

      const expenseTotals = Array(12).fill(0);
      categories.forEach((c) =>
        c.values.forEach((v, i) => (expenseTotals[i] += v)),
      );

      return { categories, incomeTotals, expenseTotals };
    },
    staleTime: 1000 * 60,
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

/**
 * Income Tracker page data: every stream (active or not — this page manages
 * them) plus the current month's received payments. One cached query.
 */
export function useIncomeStreamsAndRecords(year: number, month: number) {
  return useQuery({
    queryKey: ["income_streams_and_records", year, month],
    queryFn: async () => {
      // Filter by the entry's for-month anchor (period_year/period_month), not
      // received_date — a "still expected" entry has no received_date yet but
      // must still appear in its month.
      const [{ data: sData }, { data: rData }] = await Promise.all([
        supabase.from("income_streams").select("*"),
        supabase
          .from("income_records")
          .select("*, income_streams(type)")
          .eq("period_year", year)
          .eq("period_month", month),
      ]);

      return { streams: sData ?? [], records: rData ?? [] };
    },
    staleTime: 1000 * 30,
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

/**
 * Default liquid accounts seeded for new users on first load. Kept generic
 * (M-PESA + Cash are near-universal in Kenya) so a new user never inherits
 * someone else's specific banks — they add their own from the Add Account form.
 */
const DEFAULT_ACCOUNTS = [
  { name: "M-PESA", type: "checking" },
  { name: "Cash",   type: "cash" },
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

/** Debts plus their payment history, grouped by debt_id — one cached query for the Debt Tracker page. */
export function useDebtsWithPayments() {
  return useQuery({
    queryKey: ["debts_with_payments"],
    queryFn: async () => {
      const [{ data: debtData }, { data: payData }] = await Promise.all([
        supabase.from("debt_records").select("*").order("created_at", { ascending: false }),
        supabase.from("debt_payments").select("*").order("payment_date", { ascending: false }),
      ]);

      const grouped: Record<string, any[]> = {};
      for (const p of payData ?? []) {
        if (!grouped[p.debt_id]) grouped[p.debt_id] = [];
        grouped[p.debt_id].push(p);
      }

      return { debts: debtData ?? [], payments: grouped };
    },
    staleTime: 1000 * 30,
  });
}

const SAVINGS_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Savings page data: goals plus a calendar-year (Jan-Dec) month-by-month
 * income/expense/running-balance breakdown. One cached query.
 */
export function useSavingsPageData(year: number) {
  return useQuery({
    queryKey: ["savings_page_data", year],
    queryFn: async () => {
      const { data: gData } = await supabase
        .from("savings_goals")
        .select("*")
        .order("created_at", { ascending: true });

      const yearStart = `${year}-01-01`;
      const yearEnd = `${year}-12-31`;

      const [{ data: inc }, { data: exp }] = await Promise.all([
        supabase
          .from("income_records")
          .select("amount, received_date")
          .gte("received_date", yearStart)
          .lte("received_date", yearEnd),
        supabase
          .from("transactions")
          .select("amount, transaction_date")
          .eq("type", "expense")
          .gte("transaction_date", yearStart)
          .lte("transaction_date", yearEnd),
      ]);

      const processed = SAVINGS_MONTHS.map((m) => ({ month: m, income: 0, expense: 0 }));
      inc?.forEach((r) => {
        processed[new Date(r.received_date).getMonth()].income += Number(r.amount || 0);
      });
      exp?.forEach((e) => {
        processed[new Date(e.transaction_date).getMonth()].expense += Math.abs(Number(e.amount || 0));
      });

      let runningBal = 0;
      const monthlyData = processed.map((d) => {
        const saved = d.income - d.expense;
        const open = runningBal;
        runningBal += saved;
        return { ...d, open, saved, close: runningBal };
      });

      return { goals: gData ?? [], monthlyData };
    },
    staleTime: 1000 * 30,
  });
}

/** Household + members + active invite for the Settings page. Disabled until a household_id is known. */
export function useHousehold(householdId: string | null | undefined) {
  return useQuery({
    queryKey: ["household", householdId],
    queryFn: async () => {
      const [hhRes, memRes, invRes] = await Promise.all([
        supabase.from("households").select("*").eq("id", householdId).single(),
        supabase
          .from("household_members")
          .select("user_id, role, joined_at, user_profiles(full_name, email)")
          .eq("household_id", householdId),
        supabase
          .from("household_invites")
          .select("*")
          .eq("household_id", householdId)
          .is("used_by", null)
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false })
          .limit(1),
      ]);
      return {
        household: hhRes.data ?? null,
        members: memRes.data ?? [],
        invite: invRes.data?.[0] ?? null,
      };
    },
    enabled: !!householdId,
    staleTime: 1000 * 30,
  });
}

/** Products (system + own) and price records for the Shopping page. */
export function useShoppingData() {
  return useQuery({
    queryKey: ["shopping_data"],
    queryFn: async () => {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      const [prodRes, priceRes] = await Promise.all([
        supabase.from("products").select("*").or(`user_id.eq.${userId},is_system.eq.true`),
        supabase.from("price_records").select("*, products(name, category)").order("purchased_at", { ascending: false }),
      ]);
      return { products: prodRes.data ?? [], priceRecords: priceRes.data ?? [] };
    },
    staleTime: 1000 * 30,
  });
}

/**
 * Weekly View page data: the current week's expenses plus the full month's
 * expenses (for the Week 1-4 breakdown). Two ranges, one cached query.
 */
export function useWeeklyPageData(
  weekStartISO: string,
  weekEndISO: string,
  monthStartISO: string,
  monthEndISO: string,
) {
  return useQuery({
    queryKey: ["weekly_page_data", weekStartISO, weekEndISO, monthStartISO, monthEndISO],
    queryFn: async () => {
      const [{ data: weekData, error: weekErr }, { data: monthData, error: monthErr }] = await Promise.all([
        supabase
          .from("transactions")
          .select("*")
          .eq("type", "expense")
          .gte("transaction_date", weekStartISO)
          .lte("transaction_date", weekEndISO),
        supabase
          .from("transactions")
          .select("*")
          .eq("type", "expense")
          .gte("transaction_date", monthStartISO)
          .lte("transaction_date", monthEndISO),
      ]);
      if (weekErr) throw new Error(weekErr.message);
      if (monthErr) throw new Error(monthErr.message);
      return { transactions: weekData ?? [], monthTxs: monthData ?? [] };
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

// New users start with NO investment accounts. MMFs, SACCOs, funds and stocks
// are personal choices, so nobody inherits someone else's — each user adds their
// own from the Add Account form (see useAddInvestmentAccount below).
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
      return data ?? [];
    },
    staleTime: 1000 * 30,
  });
  return { ...query, invalidate: () => qc.invalidateQueries({ queryKey: ['investment_accounts'] }) };
}

/**
 * Add an MMF / SACCO / stock / other investment account. `investment_accounts`
 * requires a non-null `code`; we derive a stable-ish one from the name since the
 * self-serve form only asks for a display name. Balance is a starting value —
 * the trigger on investment_transactions adjusts it incrementally from there.
 */
export function useAddInvestmentAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      name: string;
      account_type: string;
      institution?: string;
      annual_rate?: number;
      balance?: number;
      sort_order?: number;
    }) => {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      if (!userId) throw new Error("Not authenticated");
      const base =
        payload.name.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 16) || "ACCT";
      const code = `${base}_${Date.now().toString(36).slice(-4).toUpperCase()}`;
      const { error } = await supabase.from("investment_accounts").insert({
        user_id: userId,
        code,
        name: payload.name,
        institution: payload.institution || null,
        account_type: payload.account_type,
        annual_rate: payload.annual_rate ?? 0,
        balance: payload.balance ?? 0,
        sort_order: payload.sort_order ?? 0,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["investment_accounts"] }),
  });
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
      // First day of the month AFTER now, used with a strict < bound. Avoids
      // building invalid end-of-month dates like "2026-09-31" (September has 30
      // days), which would make the query error out and zero the charts.
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const endISO = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-01`;

      const { data: expenses, error } = await supabase
        .from("transactions")
        .select("amount, transaction_date")
        .eq("type", "expense")
        .gte("transaction_date", startISO)
        .lt("transaction_date", endISO);
      if (error) throw new Error(error.message);

      // Income lives in income_records (dual-write source of truth), same as
      // the Annual page and year matrix.
      const { data: incomeRecs } = await supabase
        .from("income_records")
        .select("amount, received_date")
        .gte("received_date", startISO)
        .lt("received_date", endISO);

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

      for (const tx of expenses ?? []) {
        const key = tx.transaction_date.substring(0, 7);
        if (buckets[key]) buckets[key].expense += Math.abs(Number(tx.amount));
      }
      for (const r of incomeRecs ?? []) {
        const key = (r.received_date as string).substring(0, 7);
        if (buckets[key]) buckets[key].income += Number(r.amount);
      }

      const sorted = Object.entries(buckets).sort(([a], [b]) => a.localeCompare(b));
      return {
        labels:   sorted.map(([, v]) => v.label),
        income:   sorted.map(([, v]) => v.income),
        expenses: sorted.map(([, v]) => v.expense),
        savings:  sorted.map(([, v]) => v.income - v.expense),
        all:      expenses ?? [],
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