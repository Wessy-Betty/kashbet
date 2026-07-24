import { useState, useMemo } from "react";
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
import toast from "react-hot-toast";
import { useCategories, useBudgetWithSpending, useUpsertBudgetLine, useCopyBudgetFromMonth, useDeleteBudgetLine } from "@/hooks/useFinance";

const TYPE_BADGE: Record<string, { bg: string; color: string }> = {
  need: { bg: "rgba(16,185,129,.12)", color: "#34d8a5" },
  want: { bg: "rgba(245,158,11,.12)", color: "#fbbf24" },
  investment: { bg: "rgba(167,107,250,.12)", color: "#a76bfa" },
  transfer: { bg: "rgba(6,182,212,.12)", color: "#22d3ee" },
};

export function Budget() {
  const [filterDate, setFilterDate] = useState({
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
  });

  const [addOpen, setAddOpen] = useState(false);

  const { data: categories = [] } = useCategories();
  const { data: budgetData, isLoading: loading } = useBudgetWithSpending(filterDate.year, filterDate.month);
  const upsertBudget = useUpsertBudgetLine();
  const deleteBudget = useDeleteBudgetLine();

  const budgets = budgetData?.budgets ?? [];
  const actualSpending = budgetData?.actualSpending ?? {};
  const rolloverMap = budgetData?.rolloverMap ?? {};

  const [form, setForm] = useState({ category_id: "", planned_amount: "" });
  // When editing an existing line we lock the category (changing it would make a
  // different line rather than edit this one).
  const [editMode, setEditMode] = useState(false);

  function openAdd() {
    setEditMode(false);
    setForm({ category_id: "", planned_amount: "" });
    setAddOpen(true);
  }

  function openEdit(b: { category_id: string; planned_amount: number | string }) {
    setEditMode(true);
    setForm({
      category_id: b.category_id,
      planned_amount: String(b.planned_amount),
    });
    setAddOpen(true);
  }

  async function handleDeleteLine(b: {
    id: string;
    transaction_categories?: { name?: string } | null;
  }) {
    const name = b.transaction_categories?.name ?? "this line";
    if (!window.confirm(`Delete the budget for ${name}?`)) return;
    try {
      await deleteBudget.mutateAsync({
        id: b.id,
        year: filterDate.year,
        month: filterDate.month,
      });
      toast.success("Budget line deleted");
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  const monthOptions = useMemo(() => {
    const options = [];
    // 3 future months (for planning ahead) down through the current month and
    // the previous 11 — newest first. setDate(1) first so month-end dates like
    // the 31st don't skip a month when we shift.
    for (let i = 3; i >= -11; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() + i);
      options.push({
        label: d.toLocaleString("default", { month: "long", year: "numeric" }),
        month: d.getMonth() + 1,
        year: d.getFullYear(),
        key: `${d.getMonth() + 1}-${d.getFullYear()}`,
      });
    }
    return options;
  }, []);

  const copyBudget = useCopyBudgetFromMonth();

  // Is the selected month in the future (not yet started)?
  const now = new Date();
  const curY = now.getFullYear();
  const curM = now.getMonth() + 1;
  const isFuture =
    filterDate.year > curY ||
    (filterDate.year === curY && filterDate.month > curM);

  // First of next month (handles year wrap).
  const nextD = new Date(curY, curM, 1);
  const nextMonth = nextD.getMonth() + 1;
  const nextYear = nextD.getFullYear();
  const alreadyNext =
    filterDate.month === nextMonth && filterDate.year === nextYear;

  // The month immediately before the selected month — the copy source.
  const srcD = new Date(filterDate.year, filterDate.month - 2, 1);
  const srcMonth = srcD.getMonth() + 1;
  const srcYear = srcD.getFullYear();
  const srcLabel = srcD.toLocaleString("default", {
    month: "long",
    year: "numeric",
  });

  const selectedLabel = monthOptions.find(
    (o) => o.month === filterDate.month && o.year === filterDate.year,
  )?.label;

  async function handleCopyFromPrev() {
    try {
      const res = await copyBudget.mutateAsync({
        fromYear: srcYear,
        fromMonth: srcMonth,
        toYear: filterDate.year,
        toMonth: filterDate.month,
      });
      if (res.copied === 0) {
        toast(`Nothing to copy from ${srcLabel}`);
      } else {
        toast.success(
          `Copied ${res.copied} budget line${res.copied > 1 ? "s" : ""} from ${srcLabel}`,
        );
      }
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleSaveBudget() {
    if (!form.category_id || !form.planned_amount)
      return toast.error("Fill all fields");

    try {
      await upsertBudget.mutateAsync({
        category_id: form.category_id,
        month: filterDate.month,
        year: filterDate.year,
        planned_amount: Number(form.planned_amount),
      });
      toast.success(editMode ? "Budget line updated" : "Budget line added");
      setAddOpen(false);
      setEditMode(false);
      setForm({ category_id: "", planned_amount: "" });
    } catch (e: any) {
      toast.error(e.message);
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
        <div style={{ display: "flex", gap: 8 }}>
          {!alreadyNext && (
            <button
              className="btn-ghost btn"
              onClick={() => setFilterDate({ month: nextMonth, year: nextYear })}
            >
              Plan next month
            </button>
          )}
          <button className="btn-primary btn" onClick={openAdd}>
            + Add Budget Line
          </button>
        </div>
      </div>

      {isFuture ? (
        <Card style={{ marginBottom: 24 }}>
          <CardBody>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 12,
              }}
            >
              <div style={{ maxWidth: 460 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: "var(--accent2)",
                  }}
                >
                  Planning ahead
                </div>
                <div
                  style={{ fontSize: 12, color: "var(--text3)", marginTop: 4 }}
                >
                  {selectedLabel} hasn't started yet. Set your planned amounts
                  now — spending and adherence start tracking once the month
                  begins.
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, color: "var(--text3)" }}>
                  Total Planned
                </div>
                <div
                  style={{
                    fontFamily: "DM Mono",
                    fontSize: 22,
                    fontWeight: 600,
                    color: "var(--text)",
                  }}
                >
                  KSh {totals.planned.toLocaleString()}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button
                className="btn-ghost btn"
                onClick={handleCopyFromPrev}
                disabled={copyBudget.isPending}
              >
                {copyBudget.isPending ? "Copying…" : `Copy from ${srcLabel}`}
              </button>
            </div>
          </CardBody>
        </Card>
      ) : (
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
                color="linear-gradient(90deg,#0db187,#1d7ef4)"
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
      )}

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
                  {(isFuture
                    ? ["Category", "Planned", ""]
                    : [
                        "Category",
                        "Planned",
                        "Rollover",
                        "Effective",
                        "Actual",
                        "Remaining",
                        "% Used",
                        "",
                      ]
                  ).map((h, hi) => (
                    <th
                      key={hi}
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
                      colSpan={isFuture ? 3 : 8}
                      style={{
                        textAlign: "center",
                        padding: 24,
                        color: "var(--text3)",
                      }}
                    >
                      {isFuture
                        ? `No budget lines yet. Add lines or copy from ${srcLabel}.`
                        : "No budget lines set for this month."}
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
                      {!isFuture && (
                      <>
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
                      </>
                      )}
                      <td style={{ padding: "12px 14px", whiteSpace: "nowrap", textAlign: "right" }}>
                        <button
                          className="btn-ghost btn"
                          style={{ padding: "4px 10px", fontSize: 12 }}
                          onClick={() => openEdit(b)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn-ghost btn"
                          style={{ padding: "4px 10px", fontSize: 12, marginLeft: 6, color: "var(--red2)" }}
                          onClick={() => handleDeleteLine(b)}
                        >
                          Delete
                        </button>
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
        title={`${editMode ? "Edit" : "Set"} Budget (${selectedLabel ?? `${filterDate.month}/${filterDate.year}`})`}
      >
        <FormGrid>
          <FormGroup label="Category">
            <select
              className="form-select"
              value={form.category_id}
              disabled={editMode}
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
              type="number" inputMode="decimal"
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
            {editMode ? "Update Budget" : "Save Budget"}
          </button>
          <button className="btn-ghost btn" onClick={() => setAddOpen(false)}>
            Cancel
          </button>
        </div>
      </Modal>
    </div>
  );
}
