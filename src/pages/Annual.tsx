import { useState, useEffect, useMemo } from "react";
import { Bar } from "react-chartjs-2";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useAuthGuard as useAuth } from "@/hooks/useAuthGuard";
import { useAppStore } from "@/store/appStore";
import { chartColor } from "@/lib/utils";

const ANN_MONTHS = [
  "Mar", "Apr", "May", "Jun", "Jul", "Aug",
  "Sep", "Oct", "Nov", "Dec", "Jan", "Feb",
];

export function Annual() {
  const { user, loading: authLoading } = useAuth();
  const { currentYear } = useAppStore();
  const [monthlyData, setMonthlyData] = useState(
    ANN_MONTHS.map((m) => ({ month: m, income: 0, expense: 0 })),
  );
  const [openingBal, setOpeningBal] = useState(0);
  const [_loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAnnualData() {
      if (authLoading || !user) return;
      setLoading(true);

      try {
        const fiscalStart = `${currentYear - 1}-03-01`;

        // Opening balance = net worth snapshot nearest to fiscal year start
        const { data: snapshots } = await supabase
          .from("net_worth_snapshots")
          .select("net_worth, snapshot_date")
          .eq("user_id", user.id)
          .lte("snapshot_date", fiscalStart)
          .order("snapshot_date", { ascending: false })
          .limit(1);
        if (snapshots && snapshots.length > 0) {
          setOpeningBal(Number(snapshots[0].net_worth));
        }

        const { data: incomeRecords } = await supabase
          .from("income_records")
          .select("amount, received_date")
          .eq("user_id", user.id)
          .gte("received_date", fiscalStart);

        const { data: expenses } = await supabase
          .from("transactions")
          .select("amount, transaction_date")
          .eq("user_id", user.id)
          .eq("type", "expense")
          .gte("transaction_date", fiscalStart);

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
  }, [user, authLoading]);

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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 16,
          marginBottom: 24,
        }}
      >
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
          <CardTitle>Monthly Performance</CardTitle>
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
        </CardBody>
      </Card>
    </div>
  );
}
