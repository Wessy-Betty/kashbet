import { useEffect, useState, useMemo } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardBody,
  ScoreRing,
  ProgressBar,
  Modal,
  FormGroup,
  FormGrid,
} from "@/components/ui";
import { calcHealthScore } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import toast from "react-hot-toast";
import { useAuthGuard as useAuth } from "@/hooks/useAuthGuard";

const TYPE_BADGE: Record<string, { bg: string; color: string }> = {
  need: { bg: "rgba(16,185,129,.12)", color: "#34d399" },
  want: { bg: "rgba(245,158,11,.12)", color: "#fbbf24" },
  investment: { bg: "rgba(139,92,246,.12)", color: "#a78bfa" },
  transfer: { bg: "rgba(6,182,212,.12)", color: "#22d3ee" },
};

export function Budget() {
  const { user } = useAuth();

  const [filterDate, setFilterDate] = useState({
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
  });

  const [addOpen, setAddOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const [budgets, setBudgets] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [actualSpending, setActualSpending] = useState<Record<string, number>>({});
  const [rolloverMap, setRolloverMap] = useState<Record<string, number>>({}); // category_id → surplus from prev month

  const [form, setForm] = useState({ category_id: "", planned_amount: "" });

  const monthOptions = useMemo(() => {
    const options = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      options.push({
        label: d.toLocaleString("default", { month: "long", year: "numeric" }),
        month: d.getMonth() + 1,
        year: d.getFullYear(),
        key: `${d.getMonth() + 1}-${d.getFullYear()}`,
      });
    }
    return options;
  }, []);

  useEffect(() => {
    if (user) {
      fetchBudgetData();
      fetchCategories();
    }
  }, [user, filterDate]);

  async function fetchCategories() {
    const { data } = await supabase
      .from("transaction_categories")
      .select("*")
      .order("name");
    setCategories(data || []);
  }

  async function fetchBudgetData() {
    setLoading(true);
    try {
      // Current month budgets + spending
      const { data: bData } = await supabase
        .from("budget_plans")
        .select(`*, transaction_categories(name, classification, icon)`)
        .eq("user_id", user?.id)
        .eq("month", filterDate.month)
        .eq("year", filterDate.year);

      const startDate = `${filterDate.year}-${String(filterDate.month).padStart(2, "0")}-01`;
      const lastDay = new Date(filterDate.year, filterDate.month, 0).getDate();
      const endDate = `${filterDate.year}-${String(filterDate.month).padStart(2, "0")}-${lastDay}`;

      const { data: tData } = await supabase
        .from("transactions")
        .select("amount, category_id")
        .eq("user_id", user?.id)
        .eq("type", "expense")
        .gte("transaction_date", startDate)
        .lte("transaction_date", endDate);

      const spendingMap: Record<string, number> = {};
      tData?.forEach((t) => {
        spendingMap[t.category_id] =
          (spendingMap[t.category_id] || 0) + Math.abs(Number(t.amount));
      });

      // Previous month — for rollover calculation
      const prevDate = new Date(filterDate.year, filterDate.month - 2, 1); // month is 1-based
      const prevMonth = prevDate.getMonth() + 1;
      const prevYear = prevDate.getFullYear();

      const { data: prevBudgets } = await supabase
        .from("budget_plans")
        .select("category_id, planned_amount")
        .eq("user_id", user?.id)
        .eq("month", prevMonth)
        .eq("year", prevYear);

      const prevStart = `${prevYear}-${String(prevMonth).padStart(2, "0")}-01`;
      const prevLastDay = new Date(prevYear, prevMonth, 0).getDate();
      const prevEnd = `${prevYear}-${String(prevMonth).padStart(2, "0")}-${prevLastDay}`;

      const { data: prevTx } = await supabase
        .from("transactions")
        .select("amount, category_id")
        .eq("user_id", user?.id)
        .eq("type", "expense")
        .gte("transaction_date", prevStart)
        .lte("transaction_date", prevEnd);

      const prevSpending: Record<string, number> = {};
      prevTx?.forEach((t) => {
        prevSpending[t.category_id] =
          (prevSpending[t.category_id] || 0) + Math.abs(Number(t.amount));
      });

      const rollover: Record<string, number> = {};
      prevBudgets?.forEach((b) => {
        const surplus = Number(b.planned_amount) - (prevSpending[b.category_id] || 0);
        if (surplus > 0) rollover[b.category_id] = surplus;
      });

      setBudgets(bData || []);
      setActualSpending(spendingMap);
      setRolloverMap(rollover);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveBudget() {
    if (!form.category_id || !form.planned_amount)
      return toast.error("Fill all fields");

    const { error } = await supabase.from("budget_plans").upsert(
      {
        user_id: user?.id,
        category_id: form.category_id,
        month: filterDate.month,
        year: filterDate.year,
        planned_amount: Number(form.planned_amount),
      },
      { onConflict: "user_id, year, month, category_id" },
    );

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Budget line updated");
      setAddOpen(false);
      setForm({ category_id: "", planned_amount: "" });
      fetchBudgetData();
    }
  }

  const totals = useMemo(() => {
    const planned = budgets.reduce((s, b) => s + Number(b.planned_amount), 0);
    const totalRollover = budgets.reduce((s, b) => s + (rolloverMap[b.category_id] || 0), 0);
    const effective = planned + totalRollover;
    const actual = budgets.reduce(
      (s, b) => s + (actualSpending[b.category_id] || 0),
      0,
    );
    return { planned, totalRollover, effective, actual, variance: effective - actual };
  }, [budgets, actualSpending, rolloverMap]);

  const score = useMemo(() => {
    const adherence =
      totals.planned > 0
        ? Math.max(0, 1 - totals.actual / totals.planned)
        : 1;

    const realSavingsRate =
      totals.planned > 0
        ? ((totals.planned - totals.actual) / totals.planned) * 100
        : 0;

    const needsSpend = budgets
      .filter((b) => b.transaction_categories?.classification === "need")
      .reduce((s, b) => s + (actualSpending[b.category_id] || 0), 0);

    const realNeedsRatio =
      totals.actual > 0 ? (needsSpend / totals.actual) * 100 : 50;

    return calcHealthScore({
      savingsRate: Math.max(0, realSavingsRate),
      needsRatioPct: realNeedsRatio,
      debtOnTime: true,
      budgetAdherence: Math.round(adherence * 100),
    });
  }, [totals, budgets, actualSpending]);

  return (
    <div className="page-enter">
      <div className="page-header">
        <div>
          <h1 className="page-title">Budget Planner</h1>
          <p style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>
            Viewing data for{" "}
            {
              monthOptions.find(
                (o) =>
                  o.month === filterDate.month && o.year === filterDate.year,
              )?.label
            }
          </p>
        </div>
        <button className="btn-primary btn" onClick={() => setAddOpen(true)}>
          + Add Budget Line
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <Card>
          <CardHeader>
            <CardTitle>Monthly Health Score</CardTitle>
          </CardHeader>
          <CardBody style={{ textAlign: "center" }}>
            <ScoreRing score={score} />
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "var(--accent2)",
                marginTop: 8,
              }}
            >
              {score > 80
                ? "Excellent Standing"
                : score > 60
                  ? "Good Standing"
                  : "Needs Review"}
            </div>
            <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 4 }}>
              Based on adherence for {filterDate.month}/{filterDate.year}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Budget Overview</CardTitle>
          </CardHeader>
          <CardBody>
            {[
              [
                "Total Planned",
                `KSh ${totals.planned.toLocaleString()}`,
                "var(--text)",
              ],
              ...(totals.totalRollover > 0 ? [[
                "Rolled Over",
                `+ KSh ${totals.totalRollover.toLocaleString()}`,
                "var(--amber)",
              ]] : []),
              [
                "Effective Budget",
                `KSh ${totals.effective.toLocaleString()}`,
                "var(--accent2)",
              ],
              [
                "Total Spent",
                `KSh ${totals.actual.toLocaleString()}`,
                "var(--text)",
              ],
              [
                "Remaining",
                `${totals.variance >= 0 ? "+" : ""} KSh ${totals.variance.toLocaleString()}`,
                totals.variance >= 0 ? "var(--green2)" : "var(--red2)",
              ],
            ].map(([l, v, c]) => (
              <div
                key={l}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 12,
                }}
              >
                <span style={{ fontSize: 13, color: "var(--text3)" }}>{l}</span>
                <span
                  style={{
                    fontFamily: "DM Mono",
                    fontSize: 13,
                    color: c as string,
                  }}
                >
                  {v}
                </span>
              </div>
            ))}
            <div style={{ marginTop: 16 }}>
              <ProgressBar
                pct={
                  totals.planned > 0
                    ? (totals.actual / totals.planned) * 100
                    : 0
                }
                color="linear-gradient(90deg,#10b981,#3b82f6)"
              />
              <div
                style={{ fontSize: 11, color: "var(--text3)", marginTop: 6 }}
              >
                {Math.round((totals.actual / totals.planned) * 100 || 0)}% of
                monthly budget utilized
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Category Breakdown</CardTitle>
          <select
            className="form-select"
            style={{
              width: "auto",
              padding: "6px 28px 6px 10px",
              fontSize: 12,
            }}
            value={`${filterDate.month}-${filterDate.year}`}
            onChange={(e) => {
              const [m, y] = e.target.value.split("-").map(Number);
              setFilterDate({ month: m, year: y });
            }}
          >
            {monthOptions.map((opt) => (
              <option key={opt.key} value={`${opt.month}-${opt.year}`}>
                {opt.label}
              </option>
            ))}
          </select>
        </CardHeader>
        <CardBody>
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 13,
              }}
            >
              <thead>
                <tr>
                  {[
                    "Category",
                    "Planned",
                    "Rollover",
                    "Effective",
                    "Actual",
                    "Remaining",
                    "% Used",
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: "left",
                        padding: "10px 14px",
                        fontSize: 11,
                        fontWeight: 600,
                        color: "var(--text3)",
                        borderBottom: "1px solid var(--border)",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {budgets.length === 0 && !loading && (
                  <tr>
                    <td
                      colSpan={7}
                      style={{
                        textAlign: "center",
                        padding: 24,
                        color: "var(--text3)",
                      }}
                    >
                      No budget lines set for this month.
                    </td>
                  </tr>
                )}
                {budgets.map((b) => {
                  const actual = actualSpending[b.category_id] || 0;
                  const planned = Number(b.planned_amount);
                  const rollover = rolloverMap[b.category_id] || 0;
                  const effective = planned + rollover;
                  const pct = effective > 0 ? Math.round((actual / effective) * 100) : 0;
                  const remaining = effective - actual;
                  const cat = b.transaction_categories;
                  const tb = TYPE_BADGE[cat?.classification] || TYPE_BADGE.need;

                  return (
                    <tr
                      key={b.id}
                      style={{ borderBottom: "1px solid var(--border)" }}
                    >
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ fontWeight: 600 }}>
                          {cat?.icon} {cat?.name}
                        </div>
                        <span
                          style={{
                            display: "inline-flex",
                            padding: "2px 6px",
                            borderRadius: 4,
                            fontSize: 10,
                            background: tb.bg,
                            color: tb.color,
                            marginTop: 4,
                            textTransform: "capitalize",
                          }}
                        >
                          {cat?.classification}
                        </span>
                      </td>
                      <td style={{ padding: "12px 14px", fontFamily: "DM Mono", fontSize: 13 }}>
                        KSh {planned.toLocaleString()}
                      </td>
                      <td style={{ padding: "12px 14px", fontFamily: "DM Mono", fontSize: 13 }}>
                        {rollover > 0 ? (
                          <span style={{ color: "var(--amber)" }}>+{rollover.toLocaleString()}</span>
                        ) : (
                          <span style={{ color: "var(--text3)" }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: "12px 14px", fontFamily: "DM Mono", fontSize: 13, fontWeight: rollover > 0 ? 600 : 400, color: rollover > 0 ? "var(--accent2)" : "var(--text2)" }}>
                        KSh {effective.toLocaleString()}
                      </td>
                      <td style={{ padding: "12px 14px", fontFamily: "DM Mono", fontSize: 13 }}>
                        KSh {actual.toLocaleString()}
                      </td>
                      <td style={{ padding: "12px 14px", fontFamily: "DM Mono", fontSize: 13, color: remaining >= 0 ? "var(--green2)" : "var(--red2)" }}>
                        {remaining >= 0 ? "+" : ""}KSh {Math.abs(remaining).toLocaleString()}
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ fontSize: 12, marginBottom: 4, color: pct > 100 ? "var(--red2)" : "var(--text)" }}>
                          {pct}%
                        </div>
                        <div style={{ height: 4, background: "var(--surface3)", borderRadius: 2, overflow: "hidden", width: 80 }}>
                          <div
                            style={{
                              height: "100%",
                              width: `${Math.min(pct, 100)}%`,
                              background: pct > 100 ? "var(--red2)" : pct > 85 ? "var(--amber)" : "var(--green2)",
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title={`Set Budget (${filterDate.month}/${filterDate.year})`}
      >
        <FormGrid>
          <FormGroup label="Category">
            <select
              className="form-select"
              value={form.category_id}
              onChange={(e) =>
                setForm({ ...form, category_id: e.target.value })
              }
            >
              <option value="">Select Category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
          </FormGroup>
          <FormGroup label="Planned Amount (KSh)">
            <input
              className="form-input"
              type="number"
              value={form.planned_amount}
              onChange={(e) =>
                setForm({ ...form, planned_amount: e.target.value })
              }
            />
          </FormGroup>
        </FormGrid>
        <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
          <button
            className="btn-primary btn"
            style={{ flex: 1 }}
            onClick={handleSaveBudget}
          >
            Save Budget
          </button>
          <button className="btn-ghost btn" onClick={() => setAddOpen(false)}>
            Cancel
          </button>
        </div>
      </Modal>
    </div>
  );
}
