import { useState, useEffect, useMemo } from "react";
import { Bar } from "react-chartjs-2";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useAuthGuard as useAuth } from "@/hooks/useAuthGuard";
import { useAppStore } from "@/store/appStore";
import { chartColor } from "@/lib/utils";
import { useYearMatrix } from "@/hooks/useFinance";

const ANN_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function Annual() {
  const { user, loading: authLoading } = useAuth();
  const { currentYear } = useAppStore();
  const [monthlyData, setMonthlyData] = useState(
    ANN_MONTHS.map((m) => ({ month: m, income: 0, expense: 0 })),
  );
  const [openingBal, setOpeningBal] = useState(0);
  const [_loading, setLoading] = useState(true);
  const [view, setView] = useState<"month" | "category">("category");
  const { data: matrix } = useYearMatrix(currentYear);

  useEffect(() => {
    async function fetchAnnualData() {
      if (authLoading || !user) return;
      setLoading(true);

      try {
        const yearStart = `${currentYear}-01-01`;
        const yearEnd = `${currentYear}-12-31`;

        // Opening balance = net worth snapshot nearest to Jan 1
        const { data: snapshots } = await supabase
          .from("net_worth_snapshots")
          .select("net_worth, snapshot_date")
          .eq("user_id", user.id)
          .lte("snapshot_date", yearStart)
          .order("snapshot_date", { ascending: false })
          .limit(1);
        if (snapshots && snapshots.length > 0) {
          setOpeningBal(Number(snapshots[0].net_worth));
        }

        const { data: incomeRecords } = await supabase
          .from("income_records")
          .select("amount, received_date")
          .eq("user_id", user.id)
          .gte("received_date", yearStart)
          .lte("received_date", yearEnd);

        const { data: expenses } = await supabase
          .from("transactions")
          .select("amount, transaction_date")
          .eq("user_id", user.id)
          .eq("type", "expense")
          .gte("transaction_date", yearStart)
          .lte("transaction_date", yearEnd);

        const processed = ANN_MONTHS.map((m) => ({
          month: m,
          income: 0,
          expense: 0,
        }));

        incomeRecords?.forEach((r) => {
          const monthName = new Date(r.received_date).toLocaleString(
            "default",
            { month: "short" },
          );
          const idx = ANN_MONTHS.indexOf(monthName);
          if (idx !== -1) processed[idx].income += Number(r.amount);
        });

        expenses?.forEach((e) => {
          const monthName = new Date(e.transaction_date).toLocaleString(
            "default",
            { month: "short" },
          );
          const idx = ANN_MONTHS.indexOf(monthName);
          if (idx !== -1) {
            processed[idx].expense += Math.abs(Number(e.amount));
          }
        });

        setMonthlyData(processed);
      } catch (err) {
        console.error("Kashbet Annual Error:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchAnnualData();
  }, [user, authLoading, currentYear]);

  const stats = useMemo(() => {
    const totalIncome = monthlyData.reduce((sum, d) => sum + d.income, 0);
    const totalExpenses = monthlyData.reduce((sum, d) => sum + d.expense, 0);
    const netSaved = totalIncome - totalExpenses;
    const closingBal = openingBal + netSaved;

    return { openingBal, totalIncome, totalExpenses, netSaved, closingBal };
  }, [monthlyData, openingBal]);

  return (
    <div className="page-enter">
      <div className="page-header">
        <h1 className="page-title">Annual Summary</h1>
      </div>

      <div className="stat-rail" style={{ marginBottom: 24 }}>
        {[
          {
            label: "Opening Balance",
            val: stats.openingBal,
            col: "var(--green2)",
          },
          {
            label: "Total Income",
            val: stats.totalIncome,
            col: "var(--blue2)",
          },
          {
            label: "Total Expenses",
            val: stats.totalExpenses,
            col: "var(--amber2)",
          },
          { label: "Net Saved", val: stats.netSaved, col: "var(--purple2)" },
          {
            label: "Closing Balance",
            val: stats.closingBal,
            col: "var(--cyan2)",
          },
        ].map((kpi, i) => (
          <div
            key={i}
            className="kpi-card"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 16,
              padding: "20px 16px",
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.5px",
                textTransform: "uppercase",
                color: "var(--text3)",
                marginBottom: 10,
              }}
            >
              {kpi.label}
            </div>
            <div
              style={{
                fontFamily: "DM Mono, monospace",
                fontSize: 18,
                fontWeight: 500,
                color: "var(--text)",
                whiteSpace: "nowrap",
              }}
            >
              KSh {kpi.val.toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      <Card style={{ marginBottom: 24 }}>
        <CardBody>
          <div style={{ height: 300 }}>
            <Bar
              data={{
                labels: ANN_MONTHS,
                datasets: [
                  {
                    label: "Income",
                    data: monthlyData.map((d) => d.income),
                    backgroundColor: chartColor("green", 0.7),
                    borderRadius: 4,
                  },
                  {
                    label: "Expenses",
                    data: monthlyData.map((d) => d.expense),
                    backgroundColor: chartColor("red", 0.6),
                    borderRadius: 4,
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { position: "top" as const, align: "end" as const },
                },
              }}
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {view === "month" ? "Monthly Performance" : "Year at a Glance"}
          </CardTitle>
          <div style={{ display: "inline-flex", gap: 4, background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 9, padding: 3 }}>
            {([["category", "By category"], ["month", "By month"]] as const).map(
              ([v, label]) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  style={{
                    border: "none", cursor: "pointer", font: "inherit",
                    fontSize: 12, fontWeight: 600, padding: "5px 12px", borderRadius: 6,
                    background: view === v ? "var(--accent)" : "transparent",
                    color: view === v ? "#fff" : "var(--text3)",
                  }}
                >
                  {label}
                </button>
              ),
            )}
          </div>
        </CardHeader>
        <CardBody>
          {view === "month" ? (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 13,
              }}
            >
              <thead>
                <tr
                  style={{
                    color: "var(--text3)",
                    textTransform: "uppercase",
                    fontSize: 11,
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <th style={{ textAlign: "left", padding: "12px 14px" }}>
                    Month
                  </th>
                  <th style={{ textAlign: "left", padding: "12px 14px" }}>
                    Income
                  </th>
                  <th style={{ textAlign: "left", padding: "12px 14px" }}>
                    Expenses
                  </th>
                  <th style={{ textAlign: "left", padding: "12px 14px" }}>
                    Net Saved
                  </th>
                </tr>
              </thead>
              <tbody>
                {monthlyData.map((d, i) => (
                  <tr
                    key={i}
                    style={{ borderBottom: "1px solid var(--border)" }}
                  >
                    <td style={{ padding: "14px", fontWeight: 600 }}>
                      {d.month} {currentYear}
                    </td>
                    <td
                      style={{
                        padding: "14px",
                        color: "var(--green2)",
                        fontFamily: "DM Mono",
                      }}
                    >
                      KSh {d.income.toLocaleString()}
                    </td>
                    <td
                      style={{
                        padding: "14px",
                        color: "var(--red2)",
                        fontFamily: "DM Mono",
                      }}
                    >
                      KSh {d.expense.toLocaleString()}
                    </td>
                    <td style={{ padding: "14px", fontFamily: "DM Mono" }}>
                      KSh {(d.income - d.expense).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          ) : (
          <div style={{ overflowX: "auto" }}>
            {(() => {
              const cats = matrix?.categories ?? [];
              const inc = matrix?.incomeTotals ?? Array(12).fill(0);
              const exp = matrix?.expenseTotals ?? Array(12).fill(0);
              const flatMax = Math.max(1, ...cats.flatMap((c) => c.values));
              const round = (n: number) => Math.round(n).toLocaleString();
              const heat = (v: number) => {
                const a = Math.min(0.28, (v / flatMax) * 0.28);
                return v > 0 ? `rgba(229,98,77,${a.toFixed(3)})` : "transparent";
              };
              const cell = { padding: "9px 10px", fontFamily: "DM Mono", fontSize: 12, textAlign: "right" as const, whiteSpace: "nowrap" as const };
              const stickyCat = { padding: "9px 12px", textAlign: "left" as const, position: "sticky" as const, left: 0, background: "var(--surface)", fontWeight: 500, minWidth: 140, zIndex: 1 };
              const th = { padding: "9px 10px", textAlign: "right" as const, fontSize: 11, color: "var(--text3)", fontWeight: 600, whiteSpace: "nowrap" as const };
              if (cats.length === 0) {
                return <div style={{ padding: 24, textAlign: "center", color: "var(--text3)" }}>No data for {currentYear} yet.</div>;
              }
              const incTot = inc.reduce((s: number, v: number) => s + v, 0);
              const expTot = exp.reduce((s: number, v: number) => s + v, 0);
              const netTot = incTot - expTot;
              return (
                <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      <th style={{ ...th, textAlign: "left", position: "sticky", left: 0, background: "var(--surface)", zIndex: 2 }}>Category</th>
                      {ANN_MONTHS.map((m) => <th key={m} style={th}>{m}</th>)}
                      <th style={{ ...th, borderLeft: "2px solid var(--border)" }}>Avg</th>
                      <th style={th}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ ...stickyCat, color: "var(--green2)" }}>Total income</td>
                      {inc.map((v: number, i: number) => <td key={i} style={{ ...cell, color: "var(--green2)" }}>{round(v)}</td>)}
                      <td style={{ ...cell, borderLeft: "2px solid var(--border)", fontWeight: 600 }}>{round(incTot / 12)}</td>
                      <td style={{ ...cell, fontWeight: 600 }}>{round(incTot)}</td>
                    </tr>
                    {cats.map((c) => (
                      <tr key={c.name} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={stickyCat}>{c.name}</td>
                        {c.values.map((v, i) => <td key={i} style={{ ...cell, background: heat(v) }}>{v ? round(v) : "—"}</td>)}
                        <td style={{ ...cell, borderLeft: "2px solid var(--border)", fontWeight: 600 }}>{round(c.avg)}</td>
                        <td style={{ ...cell, fontWeight: 600 }}>{round(c.total)}</td>
                      </tr>
                    ))}
                    <tr style={{ borderTop: "2px solid var(--border)" }}>
                      <td style={{ ...stickyCat, fontWeight: 700 }}>Total expenses</td>
                      {exp.map((v: number, i: number) => <td key={i} style={{ ...cell, fontWeight: 700 }}>{round(v)}</td>)}
                      <td style={{ ...cell, borderLeft: "2px solid var(--border)", fontWeight: 700 }}>{round(expTot / 12)}</td>
                      <td style={{ ...cell, fontWeight: 700 }}>{round(expTot)}</td>
                    </tr>
                    <tr style={{ borderTop: "2px solid var(--border)" }}>
                      <td style={{ ...stickyCat, fontWeight: 700 }}>Net saved</td>
                      {ANN_MONTHS.map((_, i) => {
                        const n = (inc[i] || 0) - (exp[i] || 0);
                        return <td key={i} style={{ ...cell, fontWeight: 700, color: n >= 0 ? "var(--green2)" : "var(--red2)" }}>{n >= 0 ? "+" : ""}{round(n)}</td>;
                      })}
                      <td style={{ ...cell, borderLeft: "2px solid var(--border)", fontWeight: 700, color: netTot >= 0 ? "var(--green2)" : "var(--red2)" }}>{round(netTot / 12)}</td>
                      <td style={{ ...cell, fontWeight: 700, color: netTot >= 0 ? "var(--green2)" : "var(--red2)" }}>{netTot >= 0 ? "+" : ""}{round(netTot)}</td>
                    </tr>
                  </tbody>
                </table>
              );
            })()}
          </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
