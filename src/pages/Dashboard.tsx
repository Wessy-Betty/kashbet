import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Line, Bar, Doughnut } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import {
  useTransactions,
  useAlerts,
  useDismissAlert,
  useInvestmentAccounts,
  useMonthlyStats,
  useNetWorthHistory,
  useSubscriptions,
  useSavingsGoals,
  useBudget,
} from "@/hooks/useFinance";
import { useAppStore } from "@/store/appStore";
import {
  KpiCard,
  Card,
  CardHeader,
  CardTitle,
  CardBody,
  AlertItem,
} from "@/components/ui";
import {
  calcSavingsRate,
  calcHealthScore,
  rollingAvg,
  chartColor,
  linearForecast,
  formatCompact,
} from "@/lib/utils";
import { AddTransactionModal } from "@/components/AddTransactionModal";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@tanstack/react-query";

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, Tooltip, Legend, Filler
);

const CHART_OPTS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: {
        usePointStyle: true,
        boxWidth: 7,
        font: { family: "DM Sans" },
        color: "#8fa3be",
      },
    },
  },
  scales: {
    x: {
      grid: { color: "rgba(30,48,80,.5)" },
      ticks: { color: "#506a8a", font: { family: "DM Sans", size: 11 } },
    },
    y: {
      grid: { color: "rgba(30,48,80,.5)" },
      ticks: {
        color: "#506a8a",
        font: { family: "DM Sans", size: 11 },
        callback: (v: number) =>
          v === 0 ? "KSh 0" : "KSh " + (v / 1000).toFixed(0) + "k",
      },
    },
  },
};

// Fetches accounts + debts for net worth — same query as NetWorth page
function useNetWorthLive() {
  return useQuery({
    queryKey: ["nw_live"],
    queryFn: async () => {
      const [accRes, debtRes] = await Promise.all([
        supabase.from("accounts").select("*").eq("is_active", true),
        supabase
          .from("debt_records")
          .select("*")
          .eq("direction", "owed_by_me")
          .neq("status", "paid"),
      ]);
      return {
        accounts: accRes.data ?? [],
        debts: debtRes.data ?? [],
      };
    },
  });
}

export function Dashboard() {
  const navigate = useNavigate();
  const { currentYear, currentMonth, formatCurrency, user } = useAppStore();
  const [txModalOpen, setTxModalOpen] = useState(false);

  // Data sources
  const { data: alerts = [] } = useAlerts();
  const { data: txMonth = [] } = useTransactions(currentYear, currentMonth);
  const { data: history6m } = useMonthlyStats(6);
  const { data: nwRaw, isLoading: nwLoading } = useNetWorthLive();
  const { data: investmentAccounts = [], isLoading: invLoading } = useInvestmentAccounts();
  const { data: nwSnapshots = [] } = useNetWorthHistory();
  const { data: subscriptions = [] } = useSubscriptions();
  const { data: savingsGoals = [] } = useSavingsGoals();
  const { data: budgetLines = [] } = useBudget(currentYear, currentMonth);
  const dismissAlert = useDismissAlert();

  // ── Onboarding checklist — shown to new users until all 3 steps are done ────
  const onboarding = useMemo(() => {
    const accountsReady =
      (nwRaw?.accounts ?? []).some((a: any) => Number(a.balance) > 0) ||
      investmentAccounts.some((a: any) => Number(a.balance) > 0);
    const budgetReady = budgetLines.length > 0;
    const txReady = (history6m?.all?.length ?? 0) > 0 || txMonth.length > 0;
    return { accountsReady, budgetReady, txReady, allDone: accountsReady && budgetReady && txReady };
  }, [nwRaw, investmentAccounts, budgetLines, history6m, txMonth]);

  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  useEffect(() => {
    if (user?.id) {
      setOnboardingDismissed(localStorage.getItem(`kashbet-onboarding-dismissed-${user.id}`) === "1");
    }
  }, [user?.id]);

  function dismissOnboarding() {
    setOnboardingDismissed(true);
    if (user?.id) localStorage.setItem(`kashbet-onboarding-dismissed-${user.id}`, "1");
  }

  // Net worth is only shown when both data sources have loaded.
  // This prevents a flash where bank accounts appear before investment
  // accounts arrive, showing a temporarily lower (wrong) number.
  const netWorthReady = !nwLoading && !invLoading;

  // ── Net Worth — identical formula to NetWorth page ──────────────────────────
  const netWorthData = useMemo(() => {
    const accounts = nwRaw?.accounts ?? [];
    const debts = nwRaw?.debts ?? [];

    const bankAssets = accounts
      .filter((a) => !["credit", "loan"].includes(a.type))
      .reduce((s, a) => s + (Number(a.balance) || 0), 0);

    const investmentTotal = investmentAccounts
      .reduce((s, a) => s + (Number(a.balance) || 0), 0);

    const totalAssets = bankAssets + investmentTotal;

    const debtSum = debts.reduce((s, d) => s + (Number(d.remaining_balance) || 0), 0);
    const loanAccSum = accounts
      .filter((a) => ["credit", "loan"].includes(a.type))
      .reduce((s, a) => s + (Number(a.balance) || 0), 0);

    const totalLiabilities = debtSum + loanAccSum;
    return { totalAssets, totalLiabilities, netWorth: totalAssets - totalLiabilities, debts, totalDebt: debtSum + loanAccSum };
  }, [nwRaw, investmentAccounts]);

  // ── Current month KPIs ──────────────────────────────────────────────────────
  const monthKpis = useMemo(() => {
    const income = txMonth
      .filter((t) => t.type === "income")
      .reduce((s, t) => s + Math.abs(t.amount), 0);
    const expenses = txMonth
      .filter((t) => t.type === "expense")
      .reduce((s, t) => s + Math.abs(t.amount), 0);
    const savingsRate = calcSavingsRate(income, expenses);

    // Spending by classification
    const byClass: Record<string, number> = { need: 0, want: 0, investment: 0, transfer: 0 };
    for (const t of txMonth.filter((t) => t.type === "expense")) {
      const c = (t.classification ?? "need") as string;
      byClass[c] = (byClass[c] ?? 0) + Math.abs(t.amount);
    }
    const needsRatioPct = expenses > 0 ? (byClass.need / expenses) * 100 : 50;

    // Health score — same formula as Budget page
    const healthScore = calcHealthScore({
      savingsRate,
      needsRatioPct,
      debtOnTime: true,
      budgetAdherence: Math.min(savingsRate * 2, 100),
    });

    // Debt-to-income
    const monthlyDebt = netWorthData.totalDebt;
    const annualIncome = income * 12;
    const debtToIncome = annualIncome > 0
      ? ((monthlyDebt / annualIncome) * 100).toFixed(1)
      : null;

    return { income, expenses, savingsRate, byClass, needsRatioPct, healthScore, debtToIncome };
  }, [txMonth, netWorthData.totalDebt]);

  // ── Safe to spend ────────────────────────────────────────────────────────────
  const safeToSpend = useMemo(() => {
    const income = monthKpis.income;
    const expenses = monthKpis.expenses;

    // Monthly cost of each active subscription
    const subMonthly = subscriptions.reduce((s, sub) => {
      const amt = Number(sub.amount);
      if (sub.billing_cycle === "annual") return s + amt / 12;
      if (sub.billing_cycle === "weekly")  return s + amt * 4.33;
      return s + amt; // monthly
    }, 0);

    // Monthly savings goal contributions — use the goal's own monthly_contribution
    // field if set, otherwise fall back to a gentle (remaining / months) estimate
    // capped at 50% of received income so one big goal can't wipe out safe-to-spend.
    const today = new Date();
    const rawGoalMonthly = savingsGoals.reduce((s, g) => {
      // Prefer explicit monthly contribution if the goal stores one
      if ((g as any).monthly_contribution > 0) return s + Number((g as any).monthly_contribution);
      const remaining = Number(g.target_amount) - Number(g.current_balance);
      if (remaining <= 0 || !g.target_date) return s;
      const months = Math.max(
        1,
        (new Date(g.target_date).getFullYear() - today.getFullYear()) * 12 +
          new Date(g.target_date).getMonth() - today.getMonth()
      );
      return s + remaining / months;
    }, 0);
    // Cap so savings goals alone can't consume more than 50% of income
    const goalMonthly = income > 0 ? Math.min(rawGoalMonthly, income * 0.5) : 0;

    return income - expenses - subMonthly - goalMonthly;
  }, [monthKpis, subscriptions, savingsGoals]);

  // ── Month-end cash-flow forecast — "at this pace" projection ────────────────
  // Only meaningful while viewing the current calendar month.
  const monthEndForecast = useMemo(() => {
    const now = new Date();
    const isCurrentMonth =
      currentYear === now.getFullYear() && currentMonth === now.getMonth() + 1;
    if (!isCurrentMonth || monthKpis.expenses <= 0) return null;
    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const spend = (monthKpis.expenses / dayOfMonth) * daysInMonth;
    return { spend, net: monthKpis.income - spend };
  }, [monthKpis, currentYear, currentMonth]);

  // ── Bill reminders — subscriptions due within 7 days ─────────────────────────
  const dueSoon = useMemo(() => {
    const today = new Date();
    const in7 = new Date(today);
    in7.setDate(today.getDate() + 7);
    return subscriptions.filter((s) => {
      if (!s.next_due_date) return false;
      const due = new Date(s.next_due_date);
      return due >= today && due <= in7;
    });
  }, [subscriptions]);

  // ── Year-end forecast — linear extrapolation on net worth snapshots ─────────
  const yearEndForecast = useMemo(() => {
    const nwValues = nwSnapshots.map((s) => Number(s.net_worth));
    if (nwValues.length < 2) {
      // Fall back to current NW + savings-rate projection
      const monthsLeft = 12 - currentMonth;
      const monthlySavings = monthKpis.income - monthKpis.expenses;
      if (monthlySavings <= 0 || netWorthData.netWorth === 0) return null;
      return netWorthData.netWorth + monthlySavings * monthsLeft;
    }
    return linearForecast(nwValues, 12 - nwSnapshots.length);
  }, [nwSnapshots, monthKpis, netWorthData.netWorth, currentMonth]);

  // ── 6-month chart data ──────────────────────────────────────────────────────
  const hasHistory = (history6m?.income?.some((v) => v > 0)) ?? false;
  const chartLabels  = history6m?.labels   ?? ["M1","M2","M3","M4","M5","Now"];
  const incomeData   = history6m?.income   ?? [0,0,0,0,0,0];
  const expenseData  = history6m?.expenses ?? [0,0,0,0,0,0];
  const savingsData  = history6m?.savings  ?? [0,0,0,0,0,0];
  const avg3 = rollingAvg(savingsData, 3);
  const avg6 = rollingAvg(savingsData, 6);

  // Net worth trend from snapshots
  const nwTrendLabels = nwSnapshots.length > 0
    ? nwSnapshots.map((s) => new Date(s.snapshot_date).toLocaleDateString("default", { month: "short" }))
    : chartLabels;
  const nwTrendData = nwSnapshots.length > 0
    ? nwSnapshots.map((s) => Number(s.net_worth))
    : [0,0,0,0,0,netWorthData.netWorth];

  // Spending-by-type doughnut
  const { byClass } = monthKpis;
  const hasClassData = Object.values(byClass).some((v) => v > 0);
  const doughnutData = hasClassData
    ? [byClass.need, byClass.want, byClass.investment, byClass.transfer]
    : [1, 1, 1, 1];
  const totalExpenses = monthKpis.expenses;
  const classPct = (key: string) =>
    hasClassData && totalExpenses > 0
      ? ((byClass[key] / totalExpenses) * 100).toFixed(0) + "%"
      : "—";

  const hasMonthData = txMonth.length > 0;
  const currentPeriod = new Date(currentYear, currentMonth - 1).toLocaleString(
    "default", { month: "long", year: "numeric" }
  );

  return (
    <div className="page-enter">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>
            {currentPeriod} · Real-time financial overview
          </p>
        </div>
        <button className="btn-primary btn" onClick={() => setTxModalOpen(true)}>
          + Add Transaction
        </button>
      </div>

      {!onboarding.allDone && !onboardingDismissed && (
        <OnboardingChecklist
          accountsReady={onboarding.accountsReady}
          budgetReady={onboarding.budgetReady}
          txReady={onboarding.txReady}
          onConfirmAccounts={() => navigate("/investments")}
          onSetBudget={() => navigate("/budget")}
          onLogTransaction={() => setTxModalOpen(true)}
          onDismiss={dismissOnboarding}
        />
      )}

      {/* KPI cards */}
      <div className="stat-rail" style={{ marginBottom: 24 }}>
        <KpiCard
          label="Net Worth"
          value={netWorthReady ? formatCurrency(netWorthData.netWorth) : "—"}
          change={netWorthReady ? "Assets − liabilities + investments" : "Loading…"}
          changeDir="neutral"
          icon="💰"
          color="green"
        />
        <KpiCard
          label="Savings Rate"
          value={hasMonthData ? `${monthKpis.savingsRate.toFixed(1)}%` : "—"}
          change="Based on this month"
          changeDir={monthKpis.savingsRate >= 20 ? "up" : "neutral"}
          icon="📈"
          color="blue"
        />
        <KpiCard
          label="Expense Ratio"
          value={hasMonthData
            ? `${monthKpis.income > 0 ? ((monthKpis.expenses / monthKpis.income) * 100).toFixed(1) : "0"}%`
            : "—"}
          change="Based on this month"
          changeDir="neutral"
          icon="🧾"
          color="amber"
        />
        <KpiCard
          label="Health Score"
          value={hasMonthData ? `${monthKpis.healthScore} / 100` : "—"}
          change={
            !hasMonthData ? "Add transactions to score"
            : monthKpis.healthScore >= 70 ? "● Good standing"
            : monthKpis.healthScore >= 50 ? "● Fair standing"
            : "● Needs attention"
          }
          changeDir={monthKpis.healthScore >= 70 ? "up" : "neutral"}
          icon="📊"
          color="purple"
        />
        <KpiCard
          label="Debt-to-Income"
          value={monthKpis.debtToIncome ? `${monthKpis.debtToIncome}%` : "—"}
          change={monthKpis.debtToIncome ? "Total debt vs annual income" : "Add debts to track"}
          changeDir={Number(monthKpis.debtToIncome) < 36 ? "up" : "down"}
          icon="⚖️"
          color="red"
        />
        <KpiCard
          label="Month-End Forecast"
          value={monthEndForecast ? formatCurrency(monthEndForecast.net) : "—"}
          change={monthEndForecast ? `At this pace you'll spend ${formatCompact(monthEndForecast.spend)}` : "Shows for the current month"}
          changeDir={monthEndForecast && monthEndForecast.net >= 0 ? "up" : "down"}
          icon="⏳"
          color="amber"
        />
        <KpiCard
          label="Year-End Forecast"
          value={yearEndForecast ? formatCompact(yearEndForecast) : "—"}
          change={yearEndForecast ? "Based on savings trend" : "Add data to forecast"}
          changeDir={yearEndForecast && yearEndForecast > netWorthData.netWorth ? "up" : "neutral"}
          icon="🔮"
          color="cyan"
        />
      </div>

      {/* Safe to spend + Bill reminders row */}
      {(hasMonthData || dueSoon.length > 0) && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: hasMonthData && dueSoon.length > 0 ? "1fr 1fr" : "1fr",
            gap: 16,
            marginBottom: 24,
          }}
        >
          {/* Safe to spend — only when month has transactions */}
          {hasMonthData && (
            <div
              style={{
                background: safeToSpend >= 0
                  ? "linear-gradient(135deg,rgba(16,185,129,.08),rgba(59,130,246,.08))"
                  : "linear-gradient(135deg,rgba(239,68,68,.08),rgba(245,158,11,.08))",
                border: `1px solid ${safeToSpend >= 0 ? "rgba(16,185,129,.25)" : "rgba(239,68,68,.25)"}`,
                borderRadius: 16,
                padding: "20px 24px",
                display: "flex",
                alignItems: "center",
                gap: 20,
              }}
            >
              <div style={{ fontSize: 32 }}>{safeToSpend >= 0 ? "✅" : "⚠️"}</div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 4 }}>
                  Safe to Spend
                </div>
                <div style={{ fontFamily: "DM Mono", fontSize: 26, fontWeight: 600, color: safeToSpend >= 0 ? "var(--green2)" : "var(--red2)" }}>
                  KSh {Math.abs(safeToSpend).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
                <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 4 }}>
                  {safeToSpend >= 0
                    ? "After expenses, subscriptions & goals"
                    : "You've exceeded your projected budget"}
                </div>
              </div>
            </div>
          )}

          {/* Bill reminders — always visible when subscriptions are due soon */}
          {dueSoon.length > 0 && (
            <div
              style={{
                background: "linear-gradient(135deg,rgba(245,158,11,.06),rgba(239,68,68,.06))",
                border: "1px solid rgba(245,158,11,.25)",
                borderRadius: 16,
                padding: "16px 20px",
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 10 }}>
                🔔 Due in 7 days
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {dueSoon.map((s) => {
                  const due = new Date(s.next_due_date);
                  const today = new Date();
                  const daysLeft = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                  return (
                    <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{s.name}</span>
                        <span style={{ fontSize: 11, color: "var(--text3)", marginLeft: 8 }}>
                          {daysLeft === 0 ? "Today" : daysLeft === 1 ? "Tomorrow" : `in ${daysLeft} days`}
                        </span>
                      </div>
                      <span style={{ fontFamily: "DM Mono", fontSize: 13, color: "var(--amber)", fontWeight: 600 }}>
                        KSh {Number(s.amount).toLocaleString()}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Alerts */}
      {alerts.length > 0 && (
        <Card style={{ marginBottom: 24 }}>
          <CardHeader>
            <CardTitle>⚠️ Active Alerts</CardTitle>
            <span style={{ fontSize: 12, color: "var(--text3)" }}>
              {alerts.length} alert{alerts.length !== 1 ? "s" : ""}
            </span>
          </CardHeader>
          <CardBody>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {alerts.map((a) => (
                <AlertItem
                  key={a.id}
                  severity={a.severity}
                  message={a.message}
                  onDismiss={() => dismissAlert.mutate(a.id)}
                />
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {/* AI Advisor panel */}
      <div
        style={{
          background: "linear-gradient(135deg,rgba(59,130,246,.06),rgba(139,92,246,.06))",
          border: "1px solid rgba(59,130,246,.2)",
          borderRadius: 16,
          padding: 20,
          marginBottom: 24,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div
            style={{
              width: 36, height: 36,
              background: "linear-gradient(135deg,#3b82f6,#8b5cf6)",
              borderRadius: 10, display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: 16, flexShrink: 0,
            }}
          >
            🤖
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
              AI Financial Advisor
            </div>
            <div style={{ fontSize: 12, color: "var(--text3)" }}>
              Analysis for {currentPeriod}
            </div>
          </div>
          <span
            style={{
              marginLeft: "auto",
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "4px 10px",
              background: "rgba(139,92,246,.12)",
              border: "1px solid rgba(139,92,246,.2)",
              borderRadius: 20, fontSize: 12, color: "#a78bfa", fontWeight: 500,
            }}
          >
            ✦ Pro
          </span>
        </div>
        <p style={{ fontSize: 13, color: "var(--text2)", lineHeight: 1.7, marginBottom: 14 }}>
          {hasMonthData ? (
            <>
              Your savings rate is{" "}
              <strong style={{ color: "var(--text)" }}>{monthKpis.savingsRate.toFixed(1)}%</strong>{" "}
              this month with a health score of{" "}
              <strong style={{ color: "var(--text)" }}>{monthKpis.healthScore}/100</strong>.{" "}
              {monthKpis.savingsRate < 20
                ? "Try reducing discretionary spending to reach the 20% savings target."
                : "You're on track — keep up the momentum."}
            </>
          ) : (
            <>
              Welcome to KashBet. Start by adding your transactions, income streams, and budget lines.
              Once you have data, the AI advisor will surface spending patterns, savings opportunities,
              and personalised forecasts here.
            </>
          )}
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {["💬 Ask a question", "📋 Debt payoff plan", "🎯 Optimise savings", "📊 Budget breakdown"].map(
            (chip) => (
              <a
                key={chip}
                href="/advisor"
                style={{
                  padding: "6px 12px",
                  background: "rgba(59,130,246,.1)",
                  border: "1px solid rgba(59,130,246,.2)",
                  borderRadius: 20, fontSize: 12, fontWeight: 500,
                  color: "var(--accent2)", cursor: "pointer", textDecoration: "none",
                }}
              >
                {chip}
              </a>
            )
          )}
        </div>
      </div>

      {/* Charts row 1 */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginBottom: 24 }}>
        <Card>
          <CardHeader>
            <CardTitle>Income vs Expenses</CardTitle>
            <span style={{ fontSize: 11, color: "var(--text3)" }}>
              {hasHistory ? "Last 6 months (real)" : "Last 6 months"}
            </span>
          </CardHeader>
          <CardBody>
            <div style={{ height: 260 }}>
              <Bar
                data={{
                  labels: chartLabels,
                  datasets: [
                    { label: "Income",   data: incomeData,  backgroundColor: chartColor("green", 0.7), borderRadius: 6 },
                    { label: "Expenses", data: expenseData, backgroundColor: chartColor("blue",  0.6), borderRadius: 6 },
                  ],
                }}
                options={CHART_OPTS as never}
              />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Spending by Type</CardTitle>
            <span style={{ fontSize: 11, color: "var(--text3)" }}>This month</span>
          </CardHeader>
          <CardBody>
            <div style={{ display: "flex", alignItems: "center" }}>
              <div style={{ width: 130, height: 130, flexShrink: 0 }}>
                <Doughnut
                  data={{
                    labels: ["Needs", "Wants", "Investments", "Transfers"],
                    datasets: [{
                      data: doughnutData,
                      backgroundColor: ["#10b981","#f59e0b","#8b5cf6","#06b6d4"],
                      borderWidth: 0,
                    }],
                  }}
                  options={{ responsive: true, cutout: "68%", plugins: { legend: { display: false } } }}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingLeft: 16 }}>
                {(
                  [
                    ["#10b981", "Needs",    classPct("need")],
                    ["#f59e0b", "Wants",    classPct("want")],
                    ["#8b5cf6", "Invest",   classPct("investment")],
                    ["#06b6d4", "Transfer", classPct("transfer")],
                  ] as [string, string, string][]
                ).map(([c, l, v]) => (
                  <div key={l} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: c, flexShrink: 0 }} />
                    <span style={{ color: "var(--text2)", flex: 1 }}>{l}</span>
                    <span style={{ fontFamily: "DM Mono,monospace", fontSize: 11, color: "var(--text)" }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Charts row 2 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card>
          <CardHeader>
            <CardTitle>Savings Growth</CardTitle>
            <span
              style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "2px 8px",
                background: "rgba(139,92,246,.12)",
                border: "1px solid rgba(139,92,246,.2)",
                borderRadius: 20, fontSize: 10, color: "#a78bfa", fontWeight: 500,
              }}
            >
              3M + 6M avg
            </span>
          </CardHeader>
          <CardBody>
            <div style={{ height: 200 }}>
              <Line
                data={{
                  labels: chartLabels,
                  datasets: [
                    { label: "Monthly Savings", data: savingsData, borderColor: "#3b82f6", backgroundColor: chartColor("blue", 0.08), fill: true, tension: 0.4, pointRadius: 4 },
                    { label: "3M Avg", data: avg3, borderColor: "#10b981", borderDash: [5,4], fill: false, tension: 0.4, pointRadius: 0 },
                    { label: "6M Avg", data: avg6, borderColor: "#f59e0b", borderDash: [3,3], fill: false, tension: 0.4, pointRadius: 0 },
                  ],
                }}
                options={CHART_OPTS as never}
              />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Net Worth Trend</CardTitle>
            {yearEndForecast && (
              <span style={{ fontSize: 11, color: "var(--green2)" }}>
                Forecast: {formatCompact(yearEndForecast)}
              </span>
            )}
          </CardHeader>
          <CardBody>
            <div style={{ height: 200 }}>
              <Line
                data={{
                  labels: nwTrendLabels,
                  datasets: [{
                    label: "Net Worth",
                    data: nwTrendData,
                    borderColor: "#8b5cf6",
                    backgroundColor: chartColor("purple", 0.08),
                    fill: true, tension: 0.4, pointRadius: 3,
                  }],
                }}
                options={{ ...CHART_OPTS, plugins: { legend: { display: false } } } as never}
              />
            </div>
          </CardBody>
        </Card>
      </div>

      <AddTransactionModal open={txModalOpen} onClose={() => setTxModalOpen(false)} />
    </div>
  );
}

// ── Onboarding checklist ──────────────────────────────────────────────────────
// Shown to new users until all three steps are satisfied by real data (no
// separate "progress" table — each step reads state that already exists).
function OnboardingChecklist({
  accountsReady,
  budgetReady,
  txReady,
  onConfirmAccounts,
  onSetBudget,
  onLogTransaction,
  onDismiss,
}: {
  accountsReady: boolean;
  budgetReady: boolean;
  txReady: boolean;
  onConfirmAccounts: () => void;
  onSetBudget: () => void;
  onLogTransaction: () => void;
  onDismiss: () => void;
}) {
  const steps = [
    {
      done: accountsReady,
      icon: "🏦",
      label: "Confirm your accounts",
      desc: "We've set up M-PESA, Cash & KCB for you — check the balances are right.",
      action: onConfirmAccounts,
      actionLabel: "Open Accounts",
    },
    {
      done: budgetReady,
      icon: "🎯",
      label: "Set a budget",
      desc: "Plan how much you want to spend this month (optional, but helpful).",
      action: onSetBudget,
      actionLabel: "Set Budget",
    },
    {
      done: txReady,
      icon: "💳",
      label: "Log your first transaction",
      desc: "Add an expense or income to see your dashboard come alive.",
      action: onLogTransaction,
      actionLabel: "Add Transaction",
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div
      style={{
        background: "linear-gradient(135deg,rgba(59,130,246,.08),rgba(139,92,246,.08))",
        border: "1px solid rgba(59,130,246,.2)",
        borderRadius: 16,
        padding: 20,
        marginBottom: 24,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>Welcome to KashBet 👋</div>
          <div style={{ fontSize: 12, color: "var(--text3)" }}>
            {doneCount} of {steps.length} steps done — let's get you set up
          </div>
        </div>
        <button
          onClick={onDismiss}
          title="Dismiss"
          style={{ background: "none", border: "none", color: "var(--text3)", cursor: "pointer", fontSize: 16, padding: 4, flexShrink: 0 }}
        >
          ✕
        </button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {steps.map((s, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 12px",
              borderRadius: 10,
              background: s.done ? "rgba(16,185,129,.06)" : "var(--surface)",
            }}
          >
            <div style={{ fontSize: 18, flexShrink: 0 }}>{s.done ? "✅" : s.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", textDecoration: s.done ? "line-through" : "none" }}>
                {s.label}
              </div>
              <div style={{ fontSize: 11, color: "var(--text3)" }}>{s.desc}</div>
            </div>
            {!s.done && (
              <button
                onClick={s.action}
                style={{ background: "var(--accent)", color: "white", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}
              >
                {s.actionLabel}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
