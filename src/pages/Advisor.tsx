import { useState, useRef, useEffect } from "react";
import DOMPurify from "dompurify";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useTransactions, useBudget } from "@/hooks/useFinance";
import { useAppStore } from "@/store/appStore";
import { CONFIG } from "@/config";
import type { Transaction, BudgetPlan } from "@/types/finance";

interface Message {
  role: "user" | "ai";
  text: string;
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

function buildContext(
  transactions: Transaction[],
  budgetLines: BudgetPlan[],
  currencySymbol: string,
  periodName: string,
): string {
  const income = transactions
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + t.amount, 0);

  const expenses = Math.abs(
    transactions
      .filter((t) => t.type === "expense")
      .reduce((s, t) => s + t.amount, 0),
  );

  const savingsRate =
    income > 0 ? (((income - expenses) / income) * 100).toFixed(1) : "0";

  const byCategory: Record<string, number> = {};
  for (const t of transactions.filter((t) => t.type === "expense")) {
    const cat = t.category_name ?? "Other";
    byCategory[cat] = (byCategory[cat] ?? 0) + Math.abs(t.amount);
  }

  const topCats = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([k, v]) => `${k}: ${currencySymbol} ${v.toLocaleString()}`)
    .join(", ");

  const budgetSummary = budgetLines
    .map(
      (b) =>
        `${b.category_name}: planned ${currencySymbol} ${b.planned_amount.toLocaleString()}`,
    )
    .join("; ");

  return [
    `Current Period: ${periodName} 2026`,
    `Total income: ${currencySymbol} ${income.toLocaleString()}`,
    `Total expenses: ${currencySymbol} ${expenses.toLocaleString()}`,
    `Savings rate: ${savingsRate}%`,
    `Top spending categories: ${topCats || "none yet"}`,
    `Budget plan: ${budgetSummary || "none set"}`,
    `Currency: ${currencySymbol}`,
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

export function Advisor() {
  const { currentYear, currentMonth, user } = useAppStore();
  const currencySymbol = user?.currency_symbol ?? CONFIG.APP_CURRENCY_SYMBOL;

  const { data: transactions = [] } = useTransactions(
    currentYear,
    currentMonth,
  );
  const { data: budgetLines = [] } = useBudget(currentYear, currentMonth);

  const [messages, setMessages] = useState<Message[]>([
    {
      role: "ai",
      text: CONFIG.DEMO_MODE
        ? "Hello! I'm your AI financial advisor. I've analysed your complete financial data for February 2026. Ask me anything about your finances."
        : "Hello! I'm your AI financial advisor. I'll analyse your real financial data as we chat. What would you like to explore — spending patterns, savings goals, debt strategy, or investment ideas?",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatRef.current)
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

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
        const periodName = new Date(
          currentYear,
          currentMonth - 1,
        ).toLocaleString("default", { month: "long" });
        const context = buildContext(
          transactions,
          budgetLines as any,
          currencySymbol,
          periodName,
        );
        const conversationHistory = messages.concat(userMsg).map((m) => ({
          role: m.role === "ai" ? "assistant" : "user",
          content: m.text,
        }));

        const { data, error } = await supabase.functions.invoke("ai-advisor", {
          body: {
            messages: conversationHistory,
            context,
          },
        });

        if (error) throw new Error(error.message);
        reply = (data as { reply: string }).reply;
      }

      setMessages((m) => [...m, { role: "ai", text: reply }]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          role: "ai",
          text: "⚠️ I couldn't reach the AI service right now. Please try again in a moment.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const currentPeriod = new Date(currentYear, currentMonth - 1).toLocaleString(
    "default",
    { month: "long", year: "numeric" },
  );

  return (
    <div className="page-enter">
      <div className="page-header">
        <div>
          <h1 className="page-title">AI Financial Advisor</h1>
          <p style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>
            Powered by Claude · Analyses your complete financial picture
          </p>
        </div>
      </div>

      <div
        style={{
          background:
            "linear-gradient(135deg,rgba(59,130,246,.06),rgba(139,92,246,.06))",
          border: "1px solid rgba(59,130,246,.2)",
          borderRadius: 16,
          padding: 20,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 14,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              background: "linear-gradient(135deg,#3b82f6,#8b5cf6)",
              borderRadius: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 16,
            }}
          >
            🤖
          </div>
          <div>
            <div
              style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}
            >
              Monthly Analysis —{" "}
              {CONFIG.DEMO_MODE ? "February 2026" : currentPeriod}
            </div>
            <div style={{ fontSize: 12, color: "var(--text3)" }}>
              {CONFIG.DEMO_MODE
                ? "Demo analysis"
                : "Based on your real transactions"}
            </div>
          </div>
        </div>
        <div
          style={{
            fontSize: 13,
            color: "var(--text2)",
            lineHeight: 1.8,
            marginBottom: 16,
          }}
          dangerouslySetInnerHTML={{
            __html: CONFIG.DEMO_MODE
              ? 'Your savings rate improved to <strong style="color:var(--text)">32.4%</strong> — exceeding your 30% target. However, <strong style="color:var(--text)">dining & entertainment spiked 42%</strong> above your 3-month average. Reducing weekend dining by 30% would save <strong style="color:var(--text)">KSh 4,200/month</strong>.'
              : transactions.length === 0
                ? 'No transactions added yet for this period. <strong style="color:var(--text)">Add transactions</strong> to unlock AI-powered spending analysis and personalised recommendations.'
                : `You have <strong style="color:var(--text)">${transactions.length} transactions</strong> recorded this period. Use the chat below to ask for spending breakdowns, savings advice, or debt strategies based on your real data.`,
          }}
        />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {[
            ["Top 5 expenses", "Show me my top 5 expenses"],
            ["Reach 40% savings", "How do I reach a 40% savings rate?"],
            ["Emotional spending", "Analyse my emotional spending patterns"],
            ["1-year forecast", "Give me a 1-year net worth forecast"],
            ["Debt priority", "Which debt should I pay off first?"],
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
        </CardHeader>
        <CardBody>
          <div
            ref={chatRef}
            style={{
              maxHeight: 360,
              overflowY: "auto",
              padding: 14,
              display: "flex",
              flexDirection: "column",
              gap: 12,
              background: "var(--surface2)",
              borderRadius: 12,
              marginBottom: 12,
              scrollBehavior: "smooth",
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
                  background:
                    m.role === "user" ? "var(--accent)" : "var(--surface3)",
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
                  alignSelf: "flex-start",
                  padding: "10px 14px",
                  background: "var(--surface3)",
                  borderRadius: 12,
                  fontSize: 13,
                  color: "var(--text3)",
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
