import { useEffect, useState, useMemo } from "react";
import { Line } from "react-chartjs-2";
import {
  Card,
  CardHeader,
  CardTitle,
  CardBody,
  Modal,
  FormGroup,
  FormGrid,
} from "@/components/ui";
import { supabase } from "@/lib/supabase";
import toast from "react-hot-toast";
import { useAuthGuard as useAuth } from "@/hooks/useAuthGuard";
import { useAppStore } from "@/store/appStore";
import { rollingAvg } from "@/lib/utils";
import { useAccounts, useInvestmentAccounts } from "@/hooks/useFinance";

const BAL_MONTHS = [
  "Mar", "Apr", "May", "Jun", "Jul", "Aug",
  "Sep", "Oct", "Nov", "Dec", "Jan", "Feb",
];

export function Savings() {
  const { user } = useAuth();
  const { currentYear } = useAppStore();
  const { data: bankAccounts = [] } = useAccounts();
  const { data: investAccounts = [] } = useInvestmentAccounts();
  const [goalOpen, setGoalOpen] = useState(false);
  const [goals, setGoals] = useState<any[]>([]);
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [_loading, setLoading] = useState(true);

  const [goalForm, setGoalForm] = useState({
    name: "",
    target_amount: "",
    current_balance: "",
    target_date: "",
    linked_account: "",
  });

  // Edit goal
  const [editGoal, setEditGoal] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ name: "", target_amount: "", target_date: "", linked_account: "" });

  // Top-up
  const [topUpGoal, setTopUpGoal] = useState<any | null>(null);
  const [topUpAmount, setTopUpAmount] = useState("");

  useEffect(() => {
    if (user) fetchSavingsData();
  }, [user]);

  async function fetchSavingsData() {
    setLoading(true);
    try {
      const { data: gData } = await supabase
        .from("savings_goals")
        .select("*")
        .eq("user_id", user?.id)
        .order("created_at", { ascending: true });

      const fiscalStart = `${currentYear - 1}-03-01`;

      const { data: inc } = await supabase
        .from("income_records")
        .select("amount, received_date")
        .eq("user_id", user?.id)
        .gte("received_date", fiscalStart);

      const { data: exp } = await supabase
        .from("transactions")
        .select("amount, transaction_date")
        .eq("user_id", user?.id)
        .eq("type", "expense")
        .gte("transaction_date", fiscalStart);

      const processed = BAL_MONTHS.map((m) => ({
        month: m,
        income: 0,
        expense: 0,
      }));
      inc?.forEach((r) => {
        const m = new Date(r.received_date).toLocaleString("default", {
          month: "short",
        });
        const idx = BAL_MONTHS.indexOf(m);
        if (idx !== -1) processed[idx].income += Number(r.amount || 0);
      });
      exp?.forEach((e) => {
        const m = new Date(e.transaction_date).toLocaleString("default", {
          month: "short",
        });
        const idx = BAL_MONTHS.indexOf(m);
        if (idx !== -1)
          processed[idx].expense += Math.abs(Number(e.amount || 0));
      });

      let runningBal = 0;
      const finalData = processed.map((d) => {
        const saved = d.income - d.expense;
        const open = runningBal;
        runningBal += saved;
        return { ...d, open, saved, close: runningBal };
      });

      setGoals(gData || []);
      setMonthlyData(finalData);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveGoal() {
    if (!goalForm.name || !goalForm.target_amount)
      return toast.error("Name and Target required");
    const { error } = await supabase.from("savings_goals").insert({
      user_id: user?.id,
      name: goalForm.name,
      target_amount: Number(goalForm.target_amount),
      current_balance: Number(goalForm.current_balance) || 0,
      target_date: goalForm.target_date || null,
      icon: "🎯",
    });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Goal saved!");
      setGoalOpen(false);
      setGoalForm({
        name: "",
        target_amount: "",
        current_balance: "",
        target_date: "",
        linked_account: "Equity Bank Savings",
      });
      fetchSavingsData();
    }
  }

  async function handleUpdateGoal() {
    if (!editGoal || !editForm.name || !editForm.target_amount)
      return toast.error("Name and Target required");
    const { error } = await supabase
      .from("savings_goals")
      .update({
        name: editForm.name,
        target_amount: Number(editForm.target_amount),
        target_date: editForm.target_date || null,
      })
      .eq("id", editGoal.id);
    if (error) return toast.error(error.message);
    toast.success("Goal updated");
    setEditGoal(null);
    fetchSavingsData();
  }

  async function handleTopUp() {
    if (!topUpGoal) return;
    const add = parseFloat(topUpAmount);
    if (!add || add <= 0) return toast.error("Enter a valid amount");
    const newBal = Number(topUpGoal.current_balance || 0) + add;
    const { error } = await supabase
      .from("savings_goals")
      .update({ current_balance: newBal })
      .eq("id", topUpGoal.id);
    if (error) return toast.error(error.message);
    toast.success(`KSh ${add.toLocaleString()} added to ${topUpGoal.name}`);
    setTopUpGoal(null);
    setTopUpAmount("");
    fetchSavingsData();
  }

  const stats = useMemo(() => {
    const totalSaved = monthlyData.reduce((sum, d) => sum + (d.saved || 0), 0);
    const incomeTotal = monthlyData.reduce((s, d) => s + (d.income || 0), 0);
    const savings = monthlyData.map((d) => d.saved || 0);
    const avg3 = rollingAvg(savings, 3);
    return {
      totalSaved,
      recentAvg: avg3[avg3.length - 1] || 0,
      savingsRate:
        incomeTotal > 0 ? ((totalSaved / incomeTotal) * 100).toFixed(1) : "0",
    };
  }, [monthlyData]);

  return (
    <div className="page-enter">
      <div className="page-header">
        <div>
          <h1 className="page-title">Savings & Goals</h1>
        </div>
        <button className="btn-primary btn" onClick={() => setGoalOpen(true)}>
          + New Goal
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4,1fr)",
          gap: 16,
          marginBottom: 24,
        }}
      >
        {[
          [
            "Total Net Saved",
            `KSh ${stats.totalSaved.toLocaleString()}`,
            "Cumulative Growth",
          ],
          ["Savings Rate", `${stats.savingsRate}%`, "Avg Efficiency"],
          [
            "3-Month Avg",
            `KSh ${Math.round(stats.recentAvg).toLocaleString()}`,
            "Rolling Trend",
          ],
          [
            "Year-End Forecast",
            `KSh ${(stats.totalSaved + stats.recentAvg * 6).toLocaleString()}`,
            "Projected",
          ],
        ].map(([l, v, c]) => (
          <div
            key={l as string}
            className="kpi-card"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 16,
              padding: 20,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                textTransform: "uppercase",
                color: "var(--text3)",
                marginBottom: 8,
              }}
            >
              {l}
            </div>
            <div
              style={{
                fontFamily: "DM Mono,monospace",
                fontSize: 22,
                color: "var(--text)",
                lineHeight: 1,
                marginBottom: 8,
              }}
            >
              {v}
            </div>
            <div style={{ fontSize: 12, color: "var(--text3)" }}>{c}</div>
          </div>
        ))}
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
            <CardTitle>Savings Goals</CardTitle>
          </CardHeader>
          <CardBody>
            {goals.length === 0 && (
              <div
                style={{
                  color: "var(--text3)",
                  fontSize: 13,
                  textAlign: "center",
                  padding: 20,
                }}
              >
                No active goals.
              </div>
            )}
            {goals.map((g) => {
              const cur = g.current_balance || 0;
              const tar = g.target_amount || 1;
              const pct = Math.min(Math.round((cur / tar) * 100), 100);
              return (
                <div
                  key={g.id}
                  style={{
                    background: "var(--surface2)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    padding: 16,
                    marginBottom: 10,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      marginBottom: 10,
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: 14,
                          color: "var(--text)",
                        }}
                      >
                        🎯 {g.name}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--text3)",
                          marginTop: 3,
                        }}
                      >
                        Target: {g.target_date || "N/A"}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: "DM Mono", fontSize: 13 }}>
                        KSh {cur.toLocaleString()}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 6 }}>
                        of KSh {Number(g.target_amount).toLocaleString()} · {pct}%
                      </div>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <button
                          className="btn-ghost btn"
                          style={{ fontSize: 11, padding: "3px 10px" }}
                          onClick={() => {
                            setTopUpGoal(g);
                            setTopUpAmount("");
                          }}
                        >
                          + Top Up
                        </button>
                        <button
                          className="btn-ghost btn"
                          style={{ fontSize: 11, padding: "3px 10px" }}
                          onClick={() => {
                            setEditGoal(g);
                            setEditForm({
                              name: g.name,
                              target_amount: String(g.target_amount),
                              target_date: g.target_date || "",
                              linked_account: g.linked_account || "",
                            });
                          }}
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  </div>
                  <div
                    style={{
                      height: 6,
                      background: "var(--surface3)",
                      borderRadius: 3,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${pct}%`,
                        background: "linear-gradient(90deg,#3b82f6,#8b5cf6)",
                        transition: "width .8s",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Savings Trend</CardTitle>
          </CardHeader>
          <CardBody>
            <div style={{ height: 240 }}>
              <Line
                data={{
                  labels: BAL_MONTHS,
                  datasets: [
                    {
                      label: "Saved",
                      data: monthlyData.map((d) => d.saved),
                      borderColor: "#3b82f6",
                      backgroundColor: "rgba(59,130,246,.1)",
                      fill: true,
                      tension: 0.4,
                    },
                  ],
                }}
                options={{ responsive: true, maintainAspectRatio: false }}
              />
            </div>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Monthly Balance Tracker</CardTitle>
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
                    "Month",
                    "Opening",
                    "Income",
                    "Expenses",
                    "Net Saved",
                    "Closing",
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
                {monthlyData
                  .filter((r) => r.income > 0 || r.expense > 0)
                  .map((r) => (
                    <tr
                      key={r.month}
                      style={{ borderBottom: "1px solid var(--border)" }}
                    >
                      <td style={{ padding: "12px 14px", fontWeight: 600 }}>
                        {r.month}
                      </td>
                      <td
                        style={{ padding: "12px 14px", fontFamily: "DM Mono" }}
                      >
                        KSh {r.open.toLocaleString()}
                      </td>
                      <td
                        style={{
                          padding: "12px 14px",
                          fontFamily: "DM Mono",
                          color: "var(--green2)",
                        }}
                      >
                        {r.income.toLocaleString()}
                      </td>
                      <td
                        style={{
                          padding: "12px 14px",
                          fontFamily: "DM Mono",
                          color: "var(--red2)",
                        }}
                      >
                        {r.expense.toLocaleString()}
                      </td>
                      <td
                        style={{
                          padding: "12px 14px",
                          fontFamily: "DM Mono",
                          color: "var(--accent2)",
                        }}
                      >
                        {r.saved.toLocaleString()}
                      </td>
                      <td
                        style={{
                          padding: "12px 14px",
                          fontFamily: "DM Mono",
                          fontWeight: 600,
                        }}
                      >
                        {r.close.toLocaleString()}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <Modal
        open={goalOpen}
        onClose={() => setGoalOpen(false)}
        title="New Savings Goal"
      >
        <FormGrid cols={1}>
          <FormGroup label="Goal Name">
            <input
              className="form-input"
              value={goalForm.name}
              onChange={(e) =>
                setGoalForm({ ...goalForm, name: e.target.value })
              }
              placeholder="Emergency Fund"
            />
          </FormGroup>
        </FormGrid>
        <FormGrid>
          <FormGroup label="Target (KSh)">
            <input
              className="form-input"
              type="number"
              value={goalForm.target_amount}
              onChange={(e) =>
                setGoalForm({ ...goalForm, target_amount: e.target.value })
              }
            />
          </FormGroup>

          <FormGroup label="Current Bal">
            <input
              className="form-input"
              type="number"
              value={goalForm.current_balance}
              onChange={(e) =>
                setGoalForm({ ...goalForm, current_balance: e.target.value })
              }
            />
          </FormGroup>

          <FormGroup label="Target Date">
            <input
              className="form-input"
              type="date"
              style={{ colorScheme: "dark" }}
              value={goalForm.target_date}
              onChange={(e) =>
                setGoalForm({ ...goalForm, target_date: e.target.value })
              }
            />
          </FormGroup>

          <FormGroup label="Linked Account">
            <select
              className="form-select"
              value={goalForm.linked_account}
              onChange={(e) =>
                setGoalForm({ ...goalForm, linked_account: e.target.value })
              }
              style={{
                width: "100%",
                background: "var(--surface2)",
                color: "var(--text)",
              }}
            >
              <option value="" disabled>
                Select an account...
              </option>
              {bankAccounts.map((a) => (
                <option key={a.id} value={a.name}>{a.name}</option>
              ))}
              {investAccounts.map((a) => (
                <option key={a.id} value={a.code}>{a.code} — {a.institution}</option>
              ))}
              <option value="Cash">Cash</option>
            </select>
          </FormGroup>
        </FormGrid>
        <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
          <button
            className="btn-primary btn"
            style={{ flex: 1 }}
            onClick={handleSaveGoal}
          >
            Save Goal
          </button>
          <button className="btn-ghost btn" onClick={() => setGoalOpen(false)}>
            Cancel
          </button>
        </div>
      </Modal>

      {/* Edit Goal Modal */}
      <Modal open={!!editGoal} onClose={() => setEditGoal(null)} title={`Edit Goal — ${editGoal?.name ?? ""}`}>
        <div style={{ padding: "0 24px 24px" }}>
          <FormGrid cols={1}>
            <FormGroup label="Goal Name">
              <input
                className="form-input"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
            </FormGroup>
            <FormGroup label="Target Amount (KSh)">
              <input
                className="form-input"
                type="number"
                value={editForm.target_amount}
                onChange={(e) => setEditForm({ ...editForm, target_amount: e.target.value })}
              />
            </FormGroup>
            <FormGroup label="Target Date">
              <input
                className="form-input"
                type="date"
                value={editForm.target_date}
                onChange={(e) => setEditForm({ ...editForm, target_date: e.target.value })}
              />
            </FormGroup>
          </FormGrid>
          <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
            <button className="btn-primary btn" style={{ flex: 1, justifyContent: "center" }} onClick={handleUpdateGoal}>
              Save Changes
            </button>
            <button className="btn-ghost btn" onClick={() => setEditGoal(null)}>Cancel</button>
          </div>
        </div>
      </Modal>

      {/* Top Up Modal */}
      <Modal open={!!topUpGoal} onClose={() => setTopUpGoal(null)} title={`Top Up — ${topUpGoal?.name ?? ""}`}>
        <div style={{ padding: "0 24px 24px" }}>
          <div style={{ marginBottom: 16, padding: "12px 16px", background: "var(--surface2)", borderRadius: 10, fontSize: 13 }}>
            <div style={{ color: "var(--text3)", marginBottom: 4 }}>Current balance</div>
            <div style={{ fontFamily: "DM Mono", fontSize: 18, color: "var(--green2)" }}>
              KSh {Number(topUpGoal?.current_balance || 0).toLocaleString()}
            </div>
            <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 4 }}>
              of KSh {Number(topUpGoal?.target_amount || 0).toLocaleString()} target
            </div>
          </div>
          <FormGroup label="Amount to Add (KSh)">
            <input
              className="form-input"
              type="number"
              min="1"
              placeholder="0"
              value={topUpAmount}
              autoFocus
              onChange={(e) => setTopUpAmount(e.target.value)}
            />
          </FormGroup>
          <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
            <button className="btn-primary btn" style={{ flex: 1, justifyContent: "center" }} onClick={handleTopUp}>
              Add to Goal
            </button>
            <button className="btn-ghost btn" onClick={() => setTopUpGoal(null)}>Cancel</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
