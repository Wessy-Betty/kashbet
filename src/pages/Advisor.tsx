import { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import DOMPurify from "dompurify";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import {
  useTransactions,
  useBudget,
  useAccounts,
  useInvestmentAccounts,
  useDebtRecords,
  useSavingsGoals,
  useSubscriptions,
  useIncomeStreams,
  useMonthlyStats,
} from "@/hooks/useFinance";
import { useAppStore } from "@/store/appStore";
import { CONFIG } from "@/config";
import type { Transaction, BudgetPlan } from "@/types/finance";

interface Message {
  role: "user" | "ai";
  text: string;
}

interface Insight {
  icon: string;
  text: string;
  tone: "good" | "warn" | "bad";
  link?: string; // route to the relevant page
  linkLabel?: string;
}

function formatAI(text: string): string {
  const raw = text
    .replace(/\*\*(.*?)\*\*/g, '<strong style="color:var(--text)">$1</strong>')
    .replace(/\n/g, "<br>");
  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: ["strong", "br"],
    ALLOWED_ATTR: ["style"],
  });
}

const fmt = (n: number) =>
  Math.round(n).toLocaleString(undefined, { maximumFractionDigits: 0 });

// ─── Context builder — the advisor's full view of the user's finances ─────────
function buildContext(args: {
  periodName: string;
  currencySymbol: string;
  transactions: Transaction[];
  budgetLines: BudgetPlan[];
  accounts: any[];
  investments: any[];
  debts: any[];
  goals: any[];
  subscriptions: any[];
  incomeStreams: any[];
  monthlyStats: { labels: string[]; income: number[]; expenses: number[] } | undefined;
}): string {
  const {
    periodName, currencySymbol: c, transactions, budgetLines, accounts,
    investments, debts, goals, subscriptions, incomeStreams, monthlyStats,
  } = args;

  const income = transactions.filter((t) => t.type === "income").reduce((s, t) => s + Math.abs(t.amount), 0);
  const expenses = Math.abs(transactions.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0));
  const savingsRate = income > 0 ? (((income - expenses) / income) * 100).toFixed(1) : "0";

  // Spending by category, with subcategory detail where recorded
  const byCategory: Record<string, { total: number; subs: Record<string, number> }> = {};
  for (const t of transactions.filter((t) => t.type === "expense")) {
    const cat = t.category_name ?? "Uncategorized";
    byCategory[cat] ??= { total: 0, subs: {} };
    byCategory[cat].total += Math.abs(t.amount);
    if (t.subcategory_name) {
      byCategory[cat].subs[t.subcategory_name] =
        (byCategory[cat].subs[t.subcategory_name] ?? 0) + Math.abs(t.amount);
    }
  }
  const categoryLines = Object.entries(byCategory)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 8)
    .map(([k, v]) => {
      const subs = Object.entries(v.subs)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([sk, sv]) => `${sk} ${c}${fmt(sv)}`)
        .join(", ");
      return `  - ${k}: ${c}${fmt(v.total)}${subs ? ` (${subs})` : ""}`;
    })
    .join("\n");

  // Budget vs actual
  const budgetVsActual = budgetLines
    .map((b) => {
      const actual = byCategory[b.category_name]?.total ?? 0;
      const pct = b.planned_amount > 0 ? Math.round((actual / b.planned_amount) * 100) : 0;
      return `  - ${b.category_name}: planned ${c}${fmt(b.planned_amount)}, spent ${c}${fmt(actual)} (${pct}%)`;
    })
    .join("\n");

  // Accounts & investments
  const bankAssets = accounts.filter((a) => !["credit", "loan"].includes(a.type));
  const bankTotal = bankAssets.reduce((s, a) => s + Number(a.balance ?? 0), 0);
  const invTotal = investments.reduce((s, a) => s + Number(a.balance ?? 0), 0);
  const accountLines = bankAssets.map((a) => `  - ${a.name} (${a.type}): ${c}${fmt(Number(a.balance ?? 0))}`).join("\n");
  const invLines = investments
    .filter((a) => Number(a.balance ?? 0) > 0)
    .map((a) => `  - ${a.name} [${a.account_type}]: ${c}${fmt(Number(a.balance))}${Number(a.annual_rate) > 0 ? ` @ ${(Number(a.annual_rate) * 100).toFixed(1)}% p.a.` : ""}`)
    .join("\n");

  // Debts
  const activeDebts = debts.filter((d) => d.status !== "paid");
  const iOwe = activeDebts.filter((d) => d.direction === "owed_by_me");
  const owedToMe = activeDebts.filter((d) => d.direction === "owed_to_me");
  const debtLines = [
    ...iOwe.map((d) => `  - I owe ${d.person_entity}: ${c}${fmt(Number(d.remaining_balance))}${d.due_date ? `, due ${d.due_date}` : ""}${Number(d.interest_rate) > 0 ? `, ${(Number(d.interest_rate) * 100).toFixed(1)}% interest` : ""}`),
    ...owedToMe.map((d) => `  - ${d.person_entity} owes me: ${c}${fmt(Number(d.remaining_balance))}${d.due_date ? `, due ${d.due_date}` : ""}`),
  ].join("\n");
  const totalLiabilities = iOwe.reduce((s, d) => s + Number(d.remaining_balance), 0);
  const netWorth = bankTotal + invTotal - totalLiabilities;

  // Savings goals
  const goalLines = goals
    .map((g) => {
      const pct = Number(g.target_amount) > 0 ? Math.round((Number(g.current_balance) / Number(g.target_amount)) * 100) : 0;
      return `  - ${g.name}: ${c}${fmt(Number(g.current_balance))} of ${c}${fmt(Number(g.target_amount))} (${pct}%)${g.target_date ? `, target ${g.target_date}` : ""}`;
    })
    .join("\n");

  // Income streams & subscriptions
  const streamLines = incomeStreams
    .map((s) => `  - ${s.name} (${s.type}, ${s.frequency}): expect ${c}${fmt(Number(s.expected_amount))}`)
    .join("\n");
  const subLines = subscriptions
    .map((s) => `  - ${s.name}: ${c}${fmt(Number(s.amount))}/${s.billing_cycle}${s.next_due_date ? `, next due ${s.next_due_date}` : ""}`)
    .join("\n");

  // 6-month trend
  const trendLines = monthlyStats
    ? monthlyStats.labels
        .map((l, i) => `  - ${l}: income ${c}${fmt(monthlyStats.income[i])}, expenses ${c}${fmt(monthlyStats.expenses[i])}`)
        .join("\n")
    : "  (no history)";

  return [
    `CURRENT PERIOD: ${periodName}`,
    ``,
    `NET WORTH: ${c}${fmt(netWorth)} (bank/liquid ${c}${fmt(bankTotal)} + investments ${c}${fmt(invTotal)} − debts ${c}${fmt(totalLiabilities)})`,
    ``,
    `THIS MONTH: income ${c}${fmt(income)}, expenses ${c}${fmt(expenses)}, savings rate ${savingsRate}%`,
    ``,
    `SPENDING BY CATEGORY (this month, with top subcategories):`,
    categoryLines || "  (no expenses recorded)",
    ``,
    `BUDGET VS ACTUAL:`,
    budgetVsActual || "  (no budget set)",
    ``,
    `BANK / LIQUID ACCOUNTS:`,
    accountLines || "  (none)",
    ``,
    `INVESTMENTS (MMFs, SACCOs, stocks):`,
    invLines || "  (none with balances)",
    ``,
    `DEBTS:`,
    debtLines || "  (none active)",
    ``,
    `SAVINGS GOALS:`,
    goalLines || "  (none)",
    ``,
    `INCOME STREAMS:`,
    streamLines || "  (none)",
    ``,
    `SUBSCRIPTIONS:`,
    subLines || "  (none)",
    ``,
    `LAST 6 MONTHS TREND:`,
    trendLines,
  ].join("\n");
}

const DEMO_RESPONSES: Record<string, string> = {
  "top 5":
    "📊 Your **top 5 expenses** this month:\n1. Rent — KSh 18,000 (25.2%)\n2. Dining & Entertainment — KSh 14,200 (19.9%) ⚠️\n3. Investment/MMF — KSh 10,000 (14%)\n4. Groceries — KSh 9,250 (13%)\n5. Health/Gym — KSh 2,500 (3.5%)",
  "40%":
    "🎯 To reach a **40% savings rate**, you need to save KSh 39,000/month. Gap = KSh 12,920. Reduce dining from KSh 14,200 → KSh 8,000 and subscriptions by KSh 500.",
  emotional:
    '🧠 **Emotional spending patterns detected:**\n\n8 transactions totalling KSh 9,800 on Fri–Sun evenings vs KSh 1,800 on weekdays.\n\n**Suggestion:** Set a weekend "fun money" cap of KSh 2,500.',
  forecast:
    "🔮 **1-year net worth forecast:**\n\nCurrent: KSh 847,320\nProjected savings (12 months at 30% rate): KSh 352,800\n\n**Projected Feb 2027: KSh 1,272,000**",
  debt: "⚖️ **Debt recommendation:** Use the **Avalanche method** — pay Sacco Loan first (12% rate). Saves KSh 2,340 in interest vs Snowball.",
  default:
    "💡 Your finances are in **Good Standing** (score: 78/100). Key focus areas: reduce weekend dining, maintain your 32.4% savings rate, and consider the avalanche debt strategy.",
};

function getDemoResponse(text: string): string {
  const lower = text.toLowerCase();
  for (const [key, val] of Object.entries(DEMO_RESPONSES)) {
    if (lower.includes(key)) return val;
  }
  return DEMO_RESPONSES.default;
}

const GREETING: Message = {
  role: "ai",
  text: "Hello! I'm your AI financial advisor. I can see your full picture — accounts, investments, debts, goals, budgets and 6 months of history. What would you like to explore?",
};

export function Advisor() {
  const navigate = useNavigate();
  const { currentYear, currentMonth, user } = useAppStore();
  const currencySymbol = user?.currency_symbol ?? CONFIG.APP_CURRENCY_SYMBOL;
  const chatKey = `kashbet-advisor-chat-${user?.id ?? "anon"}`;

  const { data: transactions = [] } = useTransactions(currentYear, currentMonth);
  const { data: budgetLines = [] } = useBudget(currentYear, currentMonth);
  const { data: accounts = [] } = useAccounts();
  const { data: investments = [] } = useInvestmentAccounts();
  const { data: debts = [] } = useDebtRecords();
  const { data: goals = [] } = useSavingsGoals();
  const { data: subscriptions = [] } = useSubscriptions();
  const { data: incomeStreams = [] } = useIncomeStreams();
  const { data: monthlyStats } = useMonthlyStats(6);

  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);

  // Load persisted chat once the user is known
  useEffect(() => {
    try {
      const saved = localStorage.getItem(chatKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) setMessages(parsed);
      }
    } catch { /* corrupt storage — start fresh */ }
  }, [chatKey]);

  // Persist chat (skip the pristine greeting-only state)
  useEffect(() => {
    if (messages.length > 1) {
      try { localStorage.setItem(chatKey, JSON.stringify(messages.slice(-40))); } catch { /* full */ }
    }
  }, [messages, chatKey]);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  // ── Real banner stats + proactive insights ──────────────────────────────────
  const analysis = useMemo(() => {
    const income = transactions.filter((t) => t.type === "income").reduce((s, t) => s + Math.abs(t.amount), 0);
    const expenses = Math.abs(transactions.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0));
    const savingsRate = income > 0 ? ((income - expenses) / income) * 100 : 0;

    const insights: Insight[] = [];
    const today = new Date();

    // Month-over-month spending (needs at least 2 buckets)
    if (monthlyStats && monthlyStats.expenses.length >= 2) {
      const cur = monthlyStats.expenses[monthlyStats.expenses.length - 1];
      const prev = monthlyStats.expenses[monthlyStats.expenses.length - 2];
      if (prev > 0 && cur > 0) {
        const change = ((cur - prev) / prev) * 100;
        if (change > 15) {
          insights.push({ icon: "📈", text: `Spending is up ${Math.round(change)}% vs last month (${currencySymbol} ${fmt(cur)} vs ${fmt(prev)})`, tone: "warn", link: "/transactions", linkLabel: "Review" });
        } else if (change < -10) {
          insights.push({ icon: "📉", text: `Spending is down ${Math.abs(Math.round(change))}% vs last month — nice`, tone: "good" });
        }
      }
    }

    // Budget overspends
    const byCat: Record<string, number> = {};
    for (const t of transactions.filter((t) => t.type === "expense")) {
      const cat = t.category_name ?? "Uncategorized";
      byCat[cat] = (byCat[cat] ?? 0) + Math.abs(t.amount);
    }
    for (const b of budgetLines) {
      const actual = byCat[b.category_name] ?? 0;
      if (b.planned_amount > 0 && actual > b.planned_amount) {
        insights.push({ icon: "🎯", text: `${b.category_name} is over budget: ${currencySymbol} ${fmt(actual)} of ${fmt(b.planned_amount)} planned`, tone: "bad", link: "/budget", linkLabel: "Budget" });
      }
    }

    // Debts due soon / overdue
    for (const d of debts.filter((d) => d.status !== "paid" && d.direction === "owed_by_me" && d.due_date)) {
      const due = new Date(d.due_date);
      const days = Math.ceil((due.getTime() - today.getTime()) / 86400000);
      if (days < 0) insights.push({ icon: "⚠️", text: `Debt to ${d.person_entity} (${currencySymbol} ${fmt(Number(d.remaining_balance))}) is overdue`, tone: "bad", link: "/debt", linkLabel: "Debts" });
      else if (days <= 14) insights.push({ icon: "📋", text: `Debt to ${d.person_entity} due in ${days} day${days === 1 ? "" : "s"} (${currencySymbol} ${fmt(Number(d.remaining_balance))})`, tone: "warn", link: "/debt", linkLabel: "Debts" });
    }

    // Subscriptions due within 7 days
    for (const s of subscriptions) {
      if (!s.next_due_date) continue;
      const days = Math.ceil((new Date(s.next_due_date).getTime() - today.getTime()) / 86400000);
      if (days >= 0 && days <= 7) {
        insights.push({ icon: "🔁", text: `${s.name} (${currencySymbol} ${fmt(Number(s.amount))}) bills in ${days === 0 ? "today" : `${days} day${days === 1 ? "" : "s"}`}`, tone: "warn", link: "/subscriptions", linkLabel: "Subs" });
      }
    }

    return { income, expenses, savingsRate, insights: insights.slice(0, 4) };
  }, [transactions, budgetLines, debts, subscriptions, monthlyStats, currencySymbol]);

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return;
    const userMsg: Message = { role: "user", text };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);

    try {
      let reply: string;

      if (CONFIG.DEMO_MODE) {
        await new Promise((r) => setTimeout(r, 800));
        reply = getDemoResponse(text);
      } else {
        const periodName = `${new Date(currentYear, currentMonth - 1).toLocaleString("default", { month: "long" })} ${currentYear}`;
        const context = buildContext({
          periodName,
          currencySymbol,
          transactions,
          budgetLines: budgetLines as BudgetPlan[],
          accounts,
          investments,
          debts,
          goals,
          subscriptions,
          incomeStreams,
          monthlyStats,
        });
        const conversationHistory = messages.concat(userMsg).slice(-12).map((m) => ({
          role: m.role === "ai" ? "assistant" : "user",
          content: m.text,
        }));

        const { data, error } = await supabase.functions.invoke("ai-advisor", {
          body: { messages: conversationHistory, context },
        });

        if (error) throw new Error(error.message);
        reply = (data as { reply: string }).reply;
      }

      setMessages((m) => [...m, { role: "ai", text: reply }]);
    } catch (err) {
      console.error(err);
      setMessages((m) => [
        ...m,
        { role: "ai", text: "⚠️ I couldn't reach the AI service right now. Please try again in a moment." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function clearChat() {
    setMessages([GREETING]);
    try { localStorage.removeItem(chatKey); } catch { /* noop */ }
  }

  const currentPeriod = new Date(currentYear, currentMonth - 1).toLocaleString("default", { month: "long", year: "numeric" });
  const hasData = transactions.length > 0;
  const toneColor = { good: "var(--green2)", warn: "var(--amber2, #fbbf24)", bad: "var(--red2)" } as const;

  return (
    <div className="page-enter">
      <div className="page-header">
        <div>
          <h1 className="page-title">AI Financial Advisor</h1>
          <p style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>
            Powered by Claude · Sees your full financial picture
          </p>
        </div>
      </div>

      {/* ── Analysis banner (real numbers) ── */}
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
              justifyContent: "center", fontSize: 16,
            }}
          >
            🤖
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
              Monthly Analysis — {CONFIG.DEMO_MODE ? "February 2026" : currentPeriod}
            </div>
            <div style={{ fontSize: 12, color: "var(--text3)" }}>
              {CONFIG.DEMO_MODE ? "Demo analysis" : "Live, from your real data"}
            </div>
          </div>
        </div>

        {CONFIG.DEMO_MODE ? (
          <div
            style={{ fontSize: 13, color: "var(--text2)", lineHeight: 1.8, marginBottom: 16 }}
            dangerouslySetInnerHTML={{
              __html: 'Your savings rate improved to <strong style="color:var(--text)">32.4%</strong> — exceeding your 30% target. However, <strong style="color:var(--text)">dining & entertainment spiked 42%</strong> above your 3-month average.',
            }}
          />
        ) : !hasData ? (
          <div style={{ fontSize: 13, color: "var(--text2)", lineHeight: 1.8, marginBottom: 16 }}>
            No transactions recorded for {currentPeriod} yet. Add income and expenses to unlock live analysis and personalised advice.
          </div>
        ) : (
          <>
            <div style={{ fontSize: 13, color: "var(--text2)", lineHeight: 1.8, marginBottom: analysis.insights.length ? 12 : 16 }}>
              Income <strong style={{ color: "var(--green2)" }}>{currencySymbol} {fmt(analysis.income)}</strong> · Expenses{" "}
              <strong style={{ color: "var(--text)" }}>{currencySymbol} {fmt(analysis.expenses)}</strong> · Savings rate{" "}
              <strong style={{ color: analysis.savingsRate >= 20 ? "var(--green2)" : "var(--red2)" }}>
                {analysis.savingsRate.toFixed(1)}%
              </strong>
            </div>
            {analysis.insights.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
                {analysis.insights.map((ins, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                    <span>{ins.icon}</span>
                    <span style={{ color: toneColor[ins.tone], flex: 1 }}>{ins.text}</span>
                    {ins.link && (
                      <button
                        onClick={() => navigate(ins.link!)}
                        style={{
                          background: "transparent", border: "1px solid var(--border2)",
                          borderRadius: 8, padding: "2px 10px", fontSize: 11,
                          color: "var(--text2)", cursor: "pointer", flexShrink: 0,
                        }}
                      >
                        {ins.linkLabel} →
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {[
            ["Top 5 expenses", "Show me my top 5 expenses this month with subcategory detail"],
            ["Reach 40% savings", "How do I reach a 40% savings rate? Base it on my actual numbers."],
            ["Where can I cut?", "Looking at my categories and subscriptions, where can I realistically cut spending?"],
            ["1-year forecast", "Give me a 1-year net worth forecast based on my trend"],
            ["Debt priority", "Which debt should I pay off first and why?"],
            ["Goal check", "Am I on track for my savings goals?"],
          ].map(([label, prompt]) => (
            <button
              key={label}
              onClick={() => sendMessage(prompt)}
              style={{
                padding: "6px 12px",
                background: "rgba(59,130,246,.1)",
                border: "1px solid rgba(59,130,246,.2)",
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 500,
                color: "var(--accent2)",
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Chat with your Advisor</CardTitle>
          {messages.length > 1 && (
            <button
              onClick={clearChat}
              style={{
                background: "transparent", border: "1px solid var(--border2)",
                borderRadius: 8, padding: "4px 12px", fontSize: 12,
                color: "var(--text3)", cursor: "pointer",
              }}
            >
              Clear chat
            </button>
          )}
        </CardHeader>
        <CardBody>
          <div
            ref={chatRef}
            style={{
              maxHeight: 360, overflowY: "auto", padding: 14,
              display: "flex", flexDirection: "column", gap: 12,
              background: "var(--surface2)", borderRadius: 12,
              marginBottom: 12, scrollBehavior: "smooth",
            }}
          >
            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  maxWidth: "85%",
                  padding: "10px 14px",
                  borderRadius: 12,
                  fontSize: 13,
                  lineHeight: 1.6,
                  alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                  background: m.role === "user" ? "var(--accent)" : "var(--surface3)",
                  color: m.role === "user" ? "white" : "var(--text2)",
                  borderBottomRightRadius: m.role === "user" ? 4 : 12,
                  borderBottomLeftRadius: m.role === "ai" ? 4 : 12,
                }}
                dangerouslySetInnerHTML={{ __html: formatAI(m.text) }}
              />
            ))}
            {loading && (
              <div
                style={{
                  alignSelf: "flex-start", padding: "10px 14px",
                  background: "var(--surface3)", borderRadius: 12,
                  fontSize: 13, color: "var(--text3)",
                }}
              >
                Analysing your data…
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              className="form-input"
              style={{ flex: 1 }}
              type="text"
              placeholder="Ask anything about your finances…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) sendMessage(input);
              }}
              disabled={loading}
            />
            <button
              className="btn-primary btn"
              onClick={() => sendMessage(input)}
              disabled={loading}
            >
              {loading ? "…" : "Send"}
            </button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
