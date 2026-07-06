// ─── Shared Finance Types ───────────────────────────────────────────────────────
// Central type definitions used across the whole app.

export type Classification = "need" | "want" | "investment" | "transfer";

export interface Transaction {
  id: string;
  user_id: string;
  transaction_date: string; // ISO date string  e.g. "2026-02-25"
  description: string;
  category_name: string | null;
  subcategory_name?: string | null;
  product_name?: string | null;
  classification?: Classification;
  payment_method: string | null;
  amount: number; // positive = income, negative = expense
  type: "income" | "expense" | "transfer";
  ai_classified: boolean;
  category_id?: string;
  account_id?: string;
  account_name?: string | null;
  notes?: string | null;
  transaction_cost?: number | null;
}

export interface Category {
  id: string;
  name: string;
  classification: Classification;
  icon: string | null;
  is_system: boolean;
}

export interface BudgetPlan {
  id: string;
  user_id: string;
  year: number;
  month: number;
  category_id: string;
  category_name: string;
  planned_amount: number;
  classification?: Classification;
  actual_amount?: number; // computed from transactions
  total_expected_income: number;
  
  // Categorized Spending Targets
  needs_budget: number;      // Target for rent, utilities, food
  wants_budget: number;      // Target for entertainment, shopping
  investments_target: number; // Target for Sacco, MMF, Stocks
  
  
  // Metadata for the "Advisor"
  is_active: boolean;
  created_at: string;
  updated_at: string;
  notes?: string;

}

export interface Alert {
  id: string;
  type: string;
  severity: "info" | "warning" | "critical";
  message: string;
  is_dismissed: boolean;
  created_at: string;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  currency_code: string;
  currency_symbol: string;
  timezone: string;
  household_id: string | null;
  plan: "free" | "pro" | "household";
  created_at: string;
}

export interface SavingsGoal {
  id: string;
  name: string;
  icon: string | null;
  target_amount: number;
  current_balance: number;
  target_date: string | null;
}

export interface DebtRecord {
  id: string;
  direction: "owed_by_me" | "owed_to_me";
  person_entity: string;
  principal: number;
  interest_rate: number;
  start_date: string | null;
  due_date: string | null;
  remaining_balance: number;
  status: "active" | "paid" | "overdue" | "disputed";
}

export interface IncomeStream {
  id: string;
  name: string;
  type: string;
  frequency: string;
  expected_amount: number;
  source_person: string | null;
  is_active: boolean;
}

export type InvestmentTxType = 'deposit' | 'withdrawal' | 'interest' | 'dividend' | 'fee';
export type InvestmentAccountType = 'mmf' | 'sacco' | 'insurance' | 'bank' | 'other';

export interface InvestmentAccount {
  id: string;
  user_id: string;
  code: string;
  name: string;
  institution: string | null;
  account_type: InvestmentAccountType;
  balance: number;
  annual_rate: number;
  last_accrual_date: string | null;
  is_active: boolean;
  sort_order: number;
  notes: string | null;
  created_at: string;
}

export interface InvestmentTransaction {
  id: string;
  user_id: string;
  account_id: string;
  tx_type: InvestmentTxType;
  amount: number;
  tx_date: string;
  notes: string | null;
  created_at: string;
}

export interface NetWorthSnapshot {
  id: string;
  snapshot_date: string;
  total_assets: number;
  total_liabilities: number;
  net_worth: number;
  breakdown: Record<string, number>;
}
