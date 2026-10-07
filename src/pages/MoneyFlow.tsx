import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui";
import { useAppStore } from "@/store/appStore";
import { useMoneyFlow } from "@/hooks/useFinance";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const BUCKETS: { key: string; color: string; hint: string }[] = [
  { key: "Needs", color: "var(--blue2)", hint: "Rent, food, utilities, transport…" },
  { key: "Wants", color: "var(--amber)", hint: "Dining, entertainment, shopping…" },
  { key: "Saving & Investing", color: "var(--green2)", hint: "MMFs, SACCOs, savings goals" },
  { key: "Giving", color: "var(--purple2)", hint: "Family support, gifts, goodwill" },
  { key: "Debt", color: "var(--red2)", hint: "Loan repayments, lending" },
  { key: "Other", color: "var(--text3)", hint: "Uncategorised outflows" },
];

export function MoneyFlow() {
  const { currentYear, currentMonth } = useAppStore();
  const { data } = useMoneyFlow(currentYear, currentMonth);

  const income = data?.income ?? 0;
  const buckets = data?.buckets ?? {};
  const totalOut = data?.totalOut ?? 0;
  const leftover = data?.leftover ?? 0;
  const ksh = (n: number) => `KSh ${Math.round(n).toLocaleString()}`;
  // Percentages are of income when there is income, else of total outflow.
  const base = income > 0 ? income : totalOut || 1;

  const active = BUCKETS.filter((b) => (buckets[b.key] ?? 0) > 0);

  return (
    <div className="page-enter">
      <div className="page-header">
        <div>
          <h1 className="page-title">Money Flow</h1>
          <p style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>
            Where your income went in {MONTHS[currentMonth - 1]} {currentYear}
          </p>
        </div>
      </div>

      <div className="stat-rail" style={{ marginBottom: 24 }}>
        {[
          ["Income", income, "var(--green2)"],
          ["Spent & Allocated", totalOut, "var(--amber2)"],
          [leftover >= 0 ? "Left over" : "Overspent", Math.abs(leftover), leftover >= 0 ? "var(--blue2)" : "var(--red2)"],
        ].map(([label, val, col]) => (
          <div
            key={label as string}
            className="kpi-card"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: "20px 16px" }}
          >
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.5px", textTransform: "uppercase", color: "var(--text3)", marginBottom: 10 }}>
              {label}
            </div>
            <div style={{ fontFamily: "DM Mono, monospace", fontSize: 18, fontWeight: 500, color: col as string, whiteSpace: "nowrap" }}>
              {ksh(val as number)}
            </div>
          </div>
        ))}
      </div>

      {/* Stacked bar */}
      <Card style={{ marginBottom: 24 }}>
        <CardBody>
          {totalOut === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: "var(--text3)" }}>
              No outflows recorded for {MONTHS[currentMonth - 1]} yet.
            </div>
          ) : (
            <>
              <div style={{ display: "flex", height: 16, borderRadius: 8, overflow: "hidden", marginBottom: 16 }}>
                {active.map((b) => (
                  <div
                    key={b.key}
                    title={`${b.key} ${ksh(buckets[b.key])}`}
                    style={{ width: `${(buckets[b.key] / totalOut) * 100}%`, background: b.color }}
                  />
                ))}
              </div>

              {active.map((b) => {
                const amt = buckets[b.key] ?? 0;
                const pct = Math.round((amt / base) * 100);
                return (
                  <div key={b.key} style={{ marginBottom: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 600 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 3, background: b.color }} />
                        {b.key}
                        <span style={{ fontSize: 11, color: "var(--text3)", fontWeight: 400 }}>· {pct}% of income</span>
                      </span>
                      <span style={{ fontFamily: "DM Mono", fontSize: 13 }}>{ksh(amt)}</span>
                    </div>
                    <div style={{ height: 6, background: "var(--surface3)", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${(amt / totalOut) * 100}%`, background: b.color }} />
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 3 }}>{b.hint}</div>
                  </div>
                );
              })}
            </>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader><CardTitle>How to read this</CardTitle></CardHeader>
        <CardBody>
          <p style={{ fontSize: 13, color: "var(--text2)", lineHeight: 1.7 }}>
            Every shilling that left your accounts this month is grouped by purpose.
            Investing and saving appear here too (money set aside, not spent), and
            giving and debt are their own buckets, so this is the full picture of
            how you distributed your income, not just your spending.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
