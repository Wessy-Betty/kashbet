// ─────────────────────────────────────────────
//  KashBet— Utility helpers
// ─────────────────────────────────────────────
import { format, parseISO, startOfMonth, endOfMonth } from "date-fns";
import type { Classification } from "@/types";

// ── Currency ─────────────────────────────────
export function formatCurrency(
  amount: number,
  symbol = "KSh",
  decimals = 0,
): string {
  const formatted = Math.abs(amount).toLocaleString("en-KE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${symbol} ${formatted}`;
}

export function formatCompact(amount: number, symbol = "KSh"): string {
  if (Math.abs(amount) >= 1_000_000)
    return `${symbol} ${(amount / 1_000_000).toFixed(1)}M`;
  if (Math.abs(amount) >= 1_000)
    return `${symbol} ${(amount / 1_000).toFixed(1)}k`;
  return formatCurrency(amount, symbol);
}

// ── Dates ─────────────────────────────────────
export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function monthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

export function isoToDisplay(isoDate: string): string {
  return format(parseISO(isoDate), "dd MMM yyyy");
}

export function getMonthRange(year: number, month: number) {
  const d = new Date(year, month - 1, 1);
  return {
    start: format(startOfMonth(d), "yyyy-MM-dd"),
    end: format(endOfMonth(d), "yyyy-MM-dd"),
  };
}

export function todayISO(): string {
  return format(new Date(), "yyyy-MM-dd");
}

/**
 * Smart date default for "add a record" forms: today's day-of-month, placed
 * within whichever year/month the user currently has selected. When you're
 * backfilling a past month, this defaults sensibly instead of silently
 * landing on today's real-world date — which would file the entry under
 * the wrong month unless you remember to change it yourself.
 */
export function defaultDateForPeriod(year: number, month: number): string {
  const day = Math.min(new Date().getDate(), new Date(year, month, 0).getDate());
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// ── Budget helpers ────────────────────────────
export function getBudgetStatus(pct: number): "ok" | "warn" | "over" {
  if (pct >= 100) return "over";
  if (pct >= 80) return "warn";
  return "ok";
}

export const STATUS_COLORS = {
  ok: { text: "text-emerald-400", bg: "bg-emerald-500", label: "🟢 OK" },
  warn: { text: "text-amber-400", bg: "bg-amber-500", label: "🟡 Watch" },
  over: { text: "text-red-400", bg: "bg-red-500", label: "🔴 Over" },
};

// ── Classification ────────────────────────────
export const CLASSIFICATION_COLORS: Record<Classification, string> = {
  need: "text-emerald-400 bg-emerald-400/10",
  want: "text-amber-400   bg-amber-400/10",
  investment: "text-violet-400  bg-violet-400/10",
  transfer: "text-cyan-400    bg-cyan-400/10",
};

export const CLASSIFICATION_LABELS: Record<Classification, string> = {
  need: "Need",
  want: "Want",
  investment: "Investment",
  transfer: "Transfer",
};

// ── Financial math ────────────────────────────
export function calcSavingsRate(income: number, expenses: number): number {
  if (income <= 0) return 0;
  return ((income - expenses) / income) * 100;
}

export function calcExpenseRatio(income: number, expenses: number): number {
  if (income <= 0) return 0;
  return (expenses / income) * 100;
}

export function calcDebtToIncome(
  monthlyDebtPayments: number,
  monthlyIncome: number,
): number {
  if (monthlyIncome <= 0) return 0;
  return (monthlyDebtPayments / monthlyIncome) * 100;
}

export function calcHealthScore(params: {
  savingsRate: number;
  needsRatioPct: number; // how close to 50% target
  debtOnTime: boolean;
  budgetAdherence: number; // 0–100
}): number {
  const { savingsRate, needsRatioPct, debtOnTime, budgetAdherence } = params;
  const savingsScore = Math.min(savingsRate / 30, 1) * 35;
  const needsScore = Math.max(0, 1 - Math.abs(needsRatioPct - 50) / 50) * 25;
  const debtScore = debtOnTime ? 20 : 0;
  const budgetScore = (budgetAdherence / 100) * 20;
  return Math.round(savingsScore + needsScore + debtScore + budgetScore);
}

/** Linear regression forecast — returns projected value `stepsAhead` periods out */
export function linearForecast(values: number[], stepsAhead = 1): number {
  const n = values.length;
  if (n < 2) return values[0] ?? 0;
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((a, b) => a + b, 0) / n;
  let num = 0,
    den = 0;
  values.forEach((y, x) => {
    num += (x - xMean) * (y - yMean);
    den += (x - xMean) ** 2;
  });
  const slope = den === 0 ? 0 : num / den;
  const intercept = yMean - slope * xMean;
  return intercept + slope * (n - 1 + stepsAhead);
}

/** Rolling average over `window` periods */
export function rollingAvg(
  values: number[],
  window: number,
): (number | null)[] {
  return values.map((_, i) => {
    if (i < window - 1) return null;
    const slice = values.slice(i - window + 1, i + 1);
    return slice.reduce((a, b) => a + b, 0) / window;
  });
}

// ── Debt payoff strategies ────────────────────
export interface DebtPayoffItem {
  id: string;
  name: string;
  balance: number;
  interestRate: number; // annual %
  minPayment: number;
}

export function snowballOrder(debts: DebtPayoffItem[]): DebtPayoffItem[] {
  return [...debts].sort((a, b) => a.balance - b.balance);
}

export function avalancheOrder(debts: DebtPayoffItem[]): DebtPayoffItem[] {
  return [...debts].sort((a, b) => b.interestRate - a.interestRate);
}

/** Estimate total interest paid with a given ordering + extra monthly payment */
export function estimateTotalInterest(
  ordered: DebtPayoffItem[],
  extraMonthly = 0,
): number {
  let totalInterest = 0;
  const balances = ordered.map((d) => d.balance);
  const rates = ordered.map((d) => d.interestRate / 100 / 12);
  const mins = ordered.map((d) => d.minPayment);
  let months = 0;
  const MAX_MONTHS = 360;
  while (balances.some((b) => b > 0) && months < MAX_MONTHS) {
    let extra = extraMonthly;
    for (let i = 0; i < balances.length; i++) {
      if (balances[i] <= 0) continue;
      const interest = balances[i] * rates[i];
      totalInterest += interest;
      balances[i] += interest;
      const payment = Math.min(balances[i], mins[i] + extra);
      balances[i] -= payment;
      extra = Math.max(0, extra - Math.max(0, payment - mins[i]));
      if (balances[i] < 0) balances[i] = 0;
    }
    months++;
  }
  return totalInterest;
}

// ── Chart palette ─────────────────────────────
export const CHART_COLORS = {
  blue: "rgba(29,126,244,",
  green: "rgba(16,185,129,",
  amber: "rgba(245,158,11,",
  red: "rgba(239,68,68,",
  purple: "rgba(167,107,250,",
  cyan: "rgba(6,182,212,",
};

export function chartColor(key: keyof typeof CHART_COLORS, alpha = 1): string {
  return CHART_COLORS[key] + `${alpha})`;
}
