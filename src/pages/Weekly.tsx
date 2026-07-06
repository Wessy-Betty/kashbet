import { useEffect, useState, useMemo } from "react";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui";
import { AddTransactionModal } from "@/components/AddTransactionModal";
import { supabase } from "@/lib/supabase";
import { useAuthGuard as useAuth } from "@/hooks/useAuthGuard";
import {
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  addWeeks,
  subWeeks,
  isSameDay,
  startOfMonth,
  endOfMonth,
} from "date-fns";

function weekOfMonth(date: Date): number {
  const day = date.getDate();
  if (day <= 7) return 1;
  if (day <= 14) return 2;
  if (day <= 21) return 3;
  return 4;
}

export function Weekly() {
  const { user } = useAuth();
  const [baseDate, setBaseDate] = useState(new Date());
  const [transactions, setTransactions] = useState<any[]>([]);
  const [monthTxs, setMonthTxs] = useState<any[]>([]);
  const [_loading, setLoading] = useState(true);
  const [modalDate, setModalDate] = useState<string | null>(null);

  const weekStart = startOfWeek(baseDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(baseDate, { weekStartsOn: 1 });
  const daysInWeek = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const monthStart = startOfMonth(baseDate);
  const monthEnd = endOfMonth(baseDate);

  // Fetch current week's transactions
  useEffect(() => {
    async function fetchWeeklyTransactions() {
      if (!user) return;
      setLoading(true);
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("user_id", user.id)
        .eq("type", "expense")
        .gte("transaction_date", format(weekStart, "yyyy-MM-dd"))
        .lte("transaction_date", format(weekEnd, "yyyy-MM-dd"));
      if (!error) setTransactions(data || []);
      setLoading(false);
    }
    fetchWeeklyTransactions();
  }, [user, baseDate]);

  // Fetch full month's transactions for Week 1–4 summary
  useEffect(() => {
    async function fetchMonthTransactions() {
      if (!user) return;
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("user_id", user.id)
        .eq("type", "expense")
        .gte("transaction_date", format(monthStart, "yyyy-MM-dd"))
        .lte("transaction_date", format(monthEnd, "yyyy-MM-dd"));
      if (!error) setMonthTxs(data || []);
    }
    fetchMonthTransactions();
  }, [user, baseDate]);

  const processedDays = useMemo(() => {
    return daysInWeek.map((day) => {
      const dayTxs = transactions.filter((t) =>
        isSameDay(new Date(t.transaction_date), day),
      );
      const total = dayTxs.reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);
      return {
        dayName: format(day, "EEE"),
        dateNum: format(day, "d"),
        fullDate: day,
        total,
        txs: dayTxs.map((t) => `${t.description} — ${Math.abs(t.amount).toLocaleString()}`),
      };
    });
  }, [transactions, daysInWeek]);

  const stats = useMemo(() => {
    const total = processedDays.reduce((sum, d) => sum + d.total, 0);
    const avg = total / 7;
    const projectedMonthly = total * 4.3;
    return { total, avg, projectedMonthly, count: transactions.length };
  }, [processedDays, transactions]);

  // Week 1–4 breakdown by category
  const weeklyBreakdown = useMemo(() => {
    const categories: Record<string, [number, number, number, number]> = {};
    for (const tx of monthTxs) {
      const cat = tx.category_name || "Other";
      const w = weekOfMonth(new Date(tx.transaction_date)) - 1; // 0-indexed
      if (!categories[cat]) categories[cat] = [0, 0, 0, 0];
      categories[cat][w] += Math.abs(Number(tx.amount));
    }
    const rows = Object.entries(categories).sort((a, b) => {
      const sumA = a[1].reduce((s, v) => s + v, 0);
      const sumB = b[1].reduce((s, v) => s + v, 0);
      return sumB - sumA;
    });
    const weekTotals: [number, number, number, number] = [0, 0, 0, 0];
    for (const [, weeks] of rows) weeks.forEach((v, i) => (weekTotals[i] += v));
    return { rows, weekTotals };
  }, [monthTxs]);

  const monthLabel = format(baseDate, "MMMM yyyy");

  return (
    <div className="page-enter">
      <div className="page-header">
        <div>
          <h1 className="page-title">Weekly View</h1>
          <p style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>
            {format(weekStart, "MMM d")} – {format(weekEnd, "MMM d, yyyy")}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn-ghost btn" onClick={() => setBaseDate(subWeeks(baseDate, 1))}>← Prev</button>
          <button className="btn-ghost btn" onClick={() => setBaseDate(new Date())}>Today</button>
          <button className="btn-ghost btn" onClick={() => setBaseDate(addWeeks(baseDate, 1))}>Next →</button>
        </div>
      </div>

      {/* KPI row */}
      <div className="stat-rail" style={{ marginBottom: 24 }}>
        {[
          ["Week Total", `KSh ${stats.total.toLocaleString()}`, "var(--blue2)"],
          ["Daily Avg", `KSh ${Math.round(stats.avg).toLocaleString()}`, "var(--amber2)"],
          ["Burn Rate (proj.)", `KSh ${Math.round(stats.projectedMonthly).toLocaleString()}/mo`, "var(--red2)"],
          ["Transactions", stats.count.toString(), "var(--green2)"],
        ].map(([l, v, c]) => (
          <div key={l} className="kpi-card" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "1px", textTransform: "uppercase", color: "var(--text3)", marginBottom: 8 }}>{l}</div>
            <div style={{ fontFamily: "DM Mono,monospace", fontSize: 20, fontWeight: 500, color: c, lineHeight: 1 }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Day grid */}
      <Card style={{ marginBottom: 24 }}>
        <CardHeader>
          <CardTitle>Spending Distribution</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="week-grid">
            {processedDays.map((d) => {
              const isToday = isSameDay(d.fullDate, new Date());
              const isoDate = format(d.fullDate, "yyyy-MM-dd");
              return (
                <div key={d.dayName}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text3)", textAlign: "center", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    {d.dayName}
                  </div>
                  <div
                    onClick={() => setModalDate(isoDate)}
                    style={{
                      background: isToday ? "var(--surface3)" : "var(--surface2)",
                      border: `1px solid ${isToday ? "var(--blue2)" : "var(--border)"}`,
                      borderRadius: 10,
                      padding: 8,
                      minHeight: 120,
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: isToday ? "var(--blue2)" : "var(--text3)" }}>{d.dateNum}</span>
                      <span style={{ fontSize: 14, color: "var(--text3)", lineHeight: 1 }}>+</span>
                    </div>
                    <div style={{ fontFamily: "DM Mono,monospace", fontSize: 11, color: "var(--text)", marginBottom: 6, fontWeight: 600 }}>
                      {d.total > 0 ? `KSh ${d.total.toLocaleString()}` : "—"}
                    </div>
                    {d.txs.slice(0, 3).map((t, i) => (
                      <div key={i} style={{ fontSize: 9, color: "var(--text3)", padding: "2px 4px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4, marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {t}
                      </div>
                    ))}
                    {d.txs.length > 3 && (
                      <div style={{ fontSize: 9, color: "var(--text3)", textAlign: "center" }}>+{d.txs.length - 3} more</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardBody>
      </Card>

      {/* Week 1–4 monthly breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>{monthLabel} — Weekly Breakdown by Category</CardTitle>
        </CardHeader>
        <CardBody>
          {weeklyBreakdown.rows.length === 0 ? (
            <div style={{ color: "var(--text3)", fontSize: 13, textAlign: "center", padding: "20px 0" }}>
              No expenses recorded for {monthLabel} yet.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <th style={{ textAlign: "left", padding: "10px 14px", fontSize: 11, color: "var(--text3)", fontWeight: 700, textTransform: "uppercase" }}>Category</th>
                    {["Week 1", "Week 2", "Week 3", "Week 4"].map((w) => (
                      <th key={w} style={{ textAlign: "right", padding: "10px 14px", fontSize: 11, color: "var(--text3)", fontWeight: 700, textTransform: "uppercase" }}>{w}</th>
                    ))}
                    <th style={{ textAlign: "right", padding: "10px 14px", fontSize: 11, color: "var(--text3)", fontWeight: 700, textTransform: "uppercase" }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {weeklyBreakdown.rows.map(([cat, weeks]) => {
                    const rowTotal = weeks.reduce((s, v) => s + v, 0);
                    return (
                      <tr key={cat} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "12px 14px", fontWeight: 600 }}>{cat}</td>
                        {weeks.map((v, i) => (
                          <td key={i} style={{ padding: "12px 14px", textAlign: "right", fontFamily: "DM Mono", color: v > 0 ? "var(--text)" : "var(--text3)" }}>
                            {v > 0 ? `KSh ${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"}
                          </td>
                        ))}
                        <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "DM Mono", fontWeight: 700, color: "var(--red2)" }}>
                          KSh {rowTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: "2px solid var(--border)", background: "var(--surface2)" }}>
                    <td style={{ padding: "12px 14px", fontWeight: 700, fontSize: 12 }}>TOTAL</td>
                    {weeklyBreakdown.weekTotals.map((v, i) => (
                      <td key={i} style={{ padding: "12px 14px", textAlign: "right", fontFamily: "DM Mono", fontWeight: 700 }}>
                        {v > 0 ? `KSh ${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"}
                      </td>
                    ))}
                    <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "DM Mono", fontWeight: 700, color: "var(--red2)" }}>
                      KSh {weeklyBreakdown.weekTotals.reduce((s, v) => s + v, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <AddTransactionModal
        open={!!modalDate}
        defaultDate={modalDate ?? undefined}
        onClose={() => setModalDate(null)}
      />
    </div>
  );
}
