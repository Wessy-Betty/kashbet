import { useState, useMemo } from "react";
import { Line as LineChart } from "react-chartjs-2";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui";
import toast from "react-hot-toast";
import { supabase } from "@/lib/supabase";
import { useAuthGuard as useAuth } from "@/hooks/useAuthGuard";
import { useAccounts, useInvestmentAccounts, useDebtRecords } from "@/hooks/useFinance";
import { useQuery } from "@tanstack/react-query";

export function NetWorth() {
  const { user } = useAuth();
  const { data: accounts = [] } = useAccounts();
  const { data: investmentAccounts = [] } = useInvestmentAccounts();
  const { data: allDebts = [] } = useDebtRecords();

  // Net worth snapshot history — rarely changes, long staleTime
  const { data: history = [], refetch: refetchHistory } = useQuery({
    queryKey: ["net_worth_snapshots"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("net_worth_snapshots")
        .select("net_worth, snapshot_date")
        .order("snapshot_date", { ascending: true })
        .limit(12);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    staleTime: 1000 * 60 * 5,
  });

  // Only active debts I owe count as liabilities
  const debts = allDebts.filter(
    (d) => d.direction === "owed_by_me" && d.status !== "paid"
  );

  const totals = useMemo(() => {
    const assetList = accounts.filter(
      (a) => !["credit", "loan"].includes(a.type),
    );

    const bankAssets = assetList.reduce(
      (sum: number, a) => sum + (Number(a.balance) || 0),
      0,
    );
    const investmentTotal = investmentAccounts.reduce(
      (sum, a) => sum + (Number(a.balance) || 0),
      0,
    );
    const totalAssets = bankAssets + investmentTotal;

    const debtSum = debts.reduce(
      (sum: number, d) => sum + (Number(d.remaining_balance) || 0),
      0,
    );
    const loanAccSum = accounts
      .filter((a) => ["credit", "loan"].includes(a.type))
      .reduce((sum: number, a) => sum + (Number(a.balance) || 0), 0);

    const totalLiabilities = debtSum + loanAccSum;

    return {
      assetList,
      investmentTotal,
      totalAssets,
      totalLiabilities,
      netWorth: totalAssets - totalLiabilities,
    };
  }, [accounts, debts, investmentAccounts]);

  async function handleSaveSnapshot() {
    const { error } = await supabase.from("net_worth_snapshots").upsert(
      {
        user_id: user?.id,
        snapshot_date: new Date().toISOString().split("T")[0],
        net_worth: totals.netWorth,
        total_assets: totals.totalAssets,
        total_liabilities: totals.totalLiabilities,
        breakdown: { assets: accounts.length, liabilities: debts.length },
      },
      { onConflict: "user_id,snapshot_date" },
    );

    if (error) toast.error(error.message);
    else {
      toast.success("Snapshot saved");
      refetchHistory();
    }
  }

  return (
    <div className="page-enter">
      <div className="page-header">
        <div>
          <h1 className="page-title">Net Worth</h1>
        </div>
        <button className="btn-primary btn" onClick={handleSaveSnapshot}>
          Save Snapshot
        </button>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "24px",
          background:
            "linear-gradient(135deg,rgba(59,130,246,.1),rgba(139,92,246,.1))",
          border: "1px solid rgba(59,130,246,.2)",
          borderRadius: 16,
          marginBottom: 24,
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
            Total Net Worth
          </div>
          <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>
            Current Balance: Assets − Liabilities
          </div>
        </div>
        <div
          style={{
            fontFamily: "DM Mono",
            fontSize: 32,
            color: "var(--accent2)",
          }}
        >
          KSh {totals.netWorth.toLocaleString()}
        </div>
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
            <CardTitle>Assets</CardTitle>
            <span
              style={{
                fontFamily: "DM Mono",
                fontSize: 14,
                color: "var(--green2)",
              }}
            >
              KSh {totals.totalAssets.toLocaleString()}
            </span>
          </CardHeader>
          <CardBody>
            {investmentAccounts.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: "var(--text3)",
                    textTransform: "uppercase",
                    marginBottom: 8,
                    letterSpacing: "0.5px",
                  }}
                >
                  Investments · KSh {totals.investmentTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
                {investmentAccounts.map((acc) => (
                  <div
                    key={acc.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "10px 14px",
                      background: "var(--surface2)",
                      borderRadius: 10,
                      marginBottom: 6,
                    }}
                  >
                    <span style={{ fontSize: 13, color: "var(--text2)" }}>{acc.code}</span>
                    <span style={{ fontFamily: "DM Mono", fontSize: 13, color: "var(--green2)" }}>
                      KSh {Number(acc.balance).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {["checking", "savings", "cash", "investment"].map((group) => {
              const groupItems = totals.assetList.filter(
                (a) => a.type === group,
              );
              if (groupItems.length === 0) return null;
              return (
                <div key={group} style={{ marginBottom: 16 }}>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: "var(--text3)",
                      textTransform: "uppercase",
                      marginBottom: 8,
                      letterSpacing: "0.5px",
                    }}
                  >
                    {group === "checking" ? "Bank Accounts" : group}
                  </div>
                  {groupItems.map((acc) => (
                    <div
                      key={acc.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "10px 14px",
                        background: "var(--surface2)",
                        borderRadius: 10,
                        marginBottom: 6,
                      }}
                    >
                      <span style={{ fontSize: 13, color: "var(--text2)" }}>
                        {acc.name}
                      </span>
                      <span
                        style={{
                          fontFamily: "DM Mono",
                          fontSize: 13,
                          color: "var(--green2)",
                        }}
                      >
                        KSh {Number(acc.balance).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Liabilities</CardTitle>
            <span
              style={{
                fontFamily: "DM Mono",
                fontSize: 14,
                color: "var(--red2)",
              }}
            >
              KSh {totals.totalLiabilities.toLocaleString()}
            </span>
          </CardHeader>
          <CardBody>
            {debts.length === 0 &&
              accounts.filter((a) => ["credit", "loan"].includes(a.type))
                .length === 0 && (
                <div
                  style={{
                    textAlign: "center",
                    padding: 20,
                    color: "var(--text3)",
                    fontSize: 12,
                  }}
                >
                  No outstanding debt.
                </div>
              )}
            {debts.map((debt) => (
              <div
                key={debt.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "10px 14px",
                  background: "var(--surface2)",
                  borderRadius: 10,
                  marginBottom: 6,
                }}
              >
                <span style={{ fontSize: 13, color: "var(--text2)" }}>
                  {debt.person_entity}
                </span>
                <span
                  style={{
                    fontFamily: "DM Mono",
                    fontSize: 13,
                    color: "var(--red2)",
                  }}
                >
                  − KSh {Number(debt.remaining_balance).toLocaleString()}
                </span>
              </div>
            ))}
            {accounts
              .filter((a) => ["credit", "loan"].includes(a.type))
              .map((acc) => (
                <div
                  key={acc.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "10px 14px",
                    background: "var(--surface2)",
                    borderRadius: 10,
                    marginBottom: 6,
                  }}
                >
                  <span style={{ fontSize: 13, color: "var(--text2)" }}>
                    {acc.name} (Acc)
                  </span>
                  <span
                    style={{
                      fontFamily: "DM Mono",
                      fontSize: 13,
                      color: "var(--red2)",
                    }}
                  >
                    − KSh {Number(acc.balance).toLocaleString()}
                  </span>
                </div>
              ))}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Net Worth Progression</CardTitle>
        </CardHeader>
        <CardBody>
          <div style={{ height: 260 }}>
            <LineChart
              data={{
                labels:
                  history.length > 0
                    ? history.map((h) =>
                        new Date(h.snapshot_date).toLocaleDateString(
                          "default",
                          { month: "short" },
                        ),
                      )
                    : ["Current"],
                datasets: [
                  {
                    label: "Net Worth",
                    data:
                      history.length > 0
                        ? history.map((h) => h.net_worth)
                        : [totals.netWorth],
                    borderColor: "#8b5cf6",
                    backgroundColor: "rgba(139,92,246,.08)",
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                  x: {
                    grid: { color: "rgba(30,48,80,.4)" },
                    ticks: { color: "#506a8a" },
                  },
                  y: {
                    grid: { color: "rgba(30,48,80,.4)" },
                    ticks: {
                      color: "#506a8a",
                      callback: (v: any) =>
                        "KSh " + (v / 1000).toFixed(0) + "k",
                    },
                  },
                },
              }}
            />
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
