import { useEffect, useState, useMemo } from "react";
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
import { useAccounts } from "@/hooks/useFinance";
import { useQueryClient } from "@tanstack/react-query";

const today = new Date().toISOString().split("T")[0];

export function Debt() {
  const { user } = useAuth();
  const { data: accounts = [] } = useAccounts();
  const queryClient = useQueryClient();
  const [strategy, setStrategy] = useState<"snowball" | "avalanche">("snowball");

  const [debts, setDebts] = useState<any[]>([]);
  const [payments, setPayments] = useState<Record<string, any[]>>({});
  const [expandedDebt, setExpandedDebt] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // ── Add Debt modal ──────────────────────────────────────────────────────────
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    direction: "owed_by_me",
    person_entity: "",
    principal: "",
    interest_rate: "0",
    start_date: today,
    due_date: "",
    linked_account_id: "",
    notes: "",
  });

  // ── Record Payment modal ────────────────────────────────────────────────────
  const [payOpen, setPayOpen] = useState(false);
  const [payDebt, setPayDebt] = useState<any>(null);
  const [payForm, setPayForm] = useState({
    amount: "",
    date: today,
    account_id: "",
    notes: "",
  });

  useEffect(() => {
    if (user) fetchData();
  }, [user]);

  async function fetchData() {
    const [{ data: debtData }, { data: payData }] = await Promise.all([
      supabase
        .from("debt_records")
        .select("*")
        .eq("user_id", user?.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("debt_payments")
        .select("*")
        .eq("user_id", user?.id)
        .order("payment_date", { ascending: false }),
    ]);

    setDebts(debtData ?? []);

    const grouped: Record<string, any[]> = {};
    for (const p of payData ?? []) {
      if (!grouped[p.debt_id]) grouped[p.debt_id] = [];
      grouped[p.debt_id].push(p);
    }
    setPayments(grouped);
  }

  const { iOwe, owedToMe, settled } = useMemo(
    () => ({
      iOwe: debts.filter((d) => d.direction === "owed_by_me" && d.status !== "paid"),
      owedToMe: debts.filter((d) => d.direction === "owed_to_me" && d.status !== "paid"),
      settled: debts.filter((d) => d.status === "paid"),
    }),
    [debts]
  );

  const sortedStrategyList = useMemo(() => {
    const list = [...iOwe.filter((d) => d.status !== "paid")];
    return strategy === "snowball"
      ? list.sort((a, b) => Number(a.remaining_balance) - Number(b.remaining_balance))
      : list.sort((a, b) => Number(b.interest_rate) - Number(a.interest_rate));
  }, [iOwe, strategy]);

  // ── Save new debt ───────────────────────────────────────────────────────────
  async function handleSaveDebt() {
    if (submitting) return;
    if (!addForm.person_entity) return toast.error("Person / entity name required");
    const principal = Number(addForm.principal);
    if (!principal || principal <= 0) return toast.error("Principal amount required");

    setSubmitting(true);
    try {
      const { error } = await supabase.from("debt_records").insert({
        user_id: user?.id,
        person_entity: addForm.person_entity,
        direction: addForm.direction,
        principal,
        remaining_balance: principal,
        interest_rate: (Number(addForm.interest_rate) || 0) / 100,
        start_date: addForm.start_date || null,
        due_date: addForm.due_date || null,
        notes: addForm.notes || null,
        status: "active",
      });
      if (error) { toast.error(error.message); return; }

      // Optionally update the linked account
      if (addForm.linked_account_id) {
        const isOwedByMe = addForm.direction === "owed_by_me";
        const txType = isOwedByMe ? "income" : "expense";
        const desc = isOwedByMe
          ? `Loan received — ${addForm.person_entity}`
          : `Loan given — ${addForm.person_entity}`;

        const { error: txErr } = await supabase.from("transactions").insert({
          user_id: user?.id,
          amount: principal,
          description: desc,
          transaction_date: addForm.start_date || today,
          type: txType,
          classification: "transfer",
          payment_method: "Bank Transfer",
          account_id: addForm.linked_account_id,
          notes: addForm.notes || null,
        });
        if (txErr) toast.error(`Debt saved, but account balance not updated: ${txErr.message}`);
        else queryClient.invalidateQueries({ queryKey: ["accounts"] });
      }

      queryClient.invalidateQueries({ queryKey: ["debt_records"] });
      toast.success("Debt record saved");
      setAddOpen(false);
      setAddForm({
        direction: "owed_by_me", person_entity: "", principal: "",
        interest_rate: "0", start_date: today, due_date: "",
        linked_account_id: "", notes: "",
      });
      fetchData();
    } finally {
      setSubmitting(false);
    }
  }

  // ── Record a payment ────────────────────────────────────────────────────────
  async function handleRecordPayment() {
    if (submitting || !payDebt) return;
    const amt = Number(payForm.amount);
    if (!amt || amt <= 0) return toast.error("Enter a valid amount");

    setSubmitting(true);
    try {
      // 1. Record in debt_payments — trigger auto-updates remaining_balance
      const { error: dpErr } = await supabase.from("debt_payments").insert({
        user_id: user?.id,
        debt_id: payDebt.id,
        amount: amt,
        payment_date: payForm.date || today,
        notes: payForm.notes || null,
      });
      if (dpErr) { toast.error(dpErr.message); return; }

      // 2. If account linked, create transaction to move money
      if (payForm.account_id) {
        // owed_by_me: I'm paying someone → expense (money leaves my account)
        // owed_to_me: someone pays me → income (money enters my account)
        const isOwedByMe = payDebt.direction === "owed_by_me";
        const txType = isOwedByMe ? "expense" : "income";
        const desc = isOwedByMe
          ? `Debt payment — ${payDebt.person_entity}`
          : `Debt received — ${payDebt.person_entity}`;

        const { error: txErr } = await supabase.from("transactions").insert({
          user_id: user?.id,
          amount: amt,
          description: desc,
          transaction_date: payForm.date || today,
          type: txType,
          classification: "transfer",
          payment_method: "Bank Transfer",
          account_id: payForm.account_id,
          notes: payForm.notes || null,
        });
        if (txErr) toast.error(`Payment recorded, but account not updated: ${txErr.message}`);
        else queryClient.invalidateQueries({ queryKey: ["accounts"] });
      }

      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["debt_records"] });
      toast.success("Payment recorded");
      setPayOpen(false);
      setPayForm({ amount: "", date: today, account_id: "", notes: "" });
      fetchData();
    } finally {
      setSubmitting(false);
    }
  }

  function openPayModal(debt: any) {
    setPayDebt(debt);
    setPayForm({ amount: "", date: today, account_id: "", notes: "" });
    setPayOpen(true);
  }

  const iOweTotals = iOwe.reduce((s, d) => s + Number(d.remaining_balance), 0);
  const owedToMeTotals = owedToMe.reduce((s, d) => s + Number(d.remaining_balance), 0);

  return (
    <div className="page-enter">
      <div className="page-header">
        <h1 className="page-title">Debt Tracker</h1>
        <button className="btn-primary btn" onClick={() => setAddOpen(true)}>
          + Add Debt
        </button>
      </div>

      {/* KPI cards */}
      <div className="stat-rail" style={{ marginBottom: 24 }}>
        {[
          { label: "I Owe", val: `KSh ${iOweTotals.toLocaleString()}`, sub: `${iOwe.filter(d => d.status !== "paid").length} active`, col: "var(--red2)" },
          { label: "Owed to Me", val: `KSh ${owedToMeTotals.toLocaleString()}`, sub: `${owedToMe.filter(d => d.status !== "paid").length} loans out`, col: "var(--green2)" },
          { label: "Debt-to-Income", val: "0.0%", sub: "Below 36% ✓", col: "var(--amber2)" },
          { label: "Interest Saved", val: "KSh 0", sub: "Strategy Benefit", col: "#a78bfa" },
        ].map((k) => (
          <div key={k.label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "var(--text3)", marginBottom: 8 }}>{k.label}</div>
            <div style={{ fontFamily: "DM Mono", fontSize: 22, color: k.col, marginBottom: 8 }}>{k.val}</div>
            <div style={{ fontSize: 12, color: "var(--text3)" }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Debt cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        {/* Money I Owe */}
        <Card>
          <CardHeader><CardTitle>Money I Owe</CardTitle></CardHeader>
          <CardBody>
            {iOwe.length === 0 && <p style={{ fontSize: 13, color: "var(--text3)", textAlign: "center", padding: 16 }}>No debts recorded</p>}
            {iOwe.map((d) => (
              <DebtCard
                key={d.id}
                debt={d}
                payments={payments[d.id] ?? []}
                expanded={expandedDebt === d.id}
                onToggle={() => setExpandedDebt(expandedDebt === d.id ? null : d.id)}
                onPay={() => openPayModal(d)}
                accentColor="var(--red2)"
                accentBg="rgba(239,68,68,.12)"
                badgeLabel="I Owe"
              />
            ))}
          </CardBody>
        </Card>

        {/* Money Owed to Me */}
        <Card>
          <CardHeader><CardTitle>Money Owed to Me</CardTitle></CardHeader>
          <CardBody>
            {owedToMe.length === 0 && <p style={{ fontSize: 13, color: "var(--text3)", textAlign: "center", padding: 16 }}>No loans out</p>}
            {owedToMe.map((d) => (
              <DebtCard
                key={d.id}
                debt={d}
                payments={payments[d.id] ?? []}
                expanded={expandedDebt === d.id}
                onToggle={() => setExpandedDebt(expandedDebt === d.id ? null : d.id)}
                onPay={() => openPayModal(d)}
                accentColor="var(--green2)"
                accentBg="rgba(16,185,129,.12)"
                badgeLabel="Owes Me"
                payLabel="Mark as Received"
              />
            ))}
          </CardBody>
        </Card>
      </div>

      {/* Settled / paid debts */}
      {settled.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Settled Debts</CardTitle></CardHeader>
          <CardBody>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["Person / Entity", "Direction", "Principal", "Settled Date"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "10px 14px", fontSize: 11, color: "var(--text3)", textTransform: "uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {settled.map((d) => {
                  const ps = payments[d.id] ?? [];
                  const lastPayment = ps[0];
                  return (
                    <tr key={d.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "12px 14px" }}>{d.person_entity}</td>
                      <td style={{ padding: "12px 14px" }}>
                        <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: d.direction === "owed_by_me" ? "rgba(239,68,68,.1)" : "rgba(16,185,129,.1)", color: d.direction === "owed_by_me" ? "var(--red2)" : "var(--green2)" }}>
                          {d.direction === "owed_by_me" ? "I Owed" : "Owed Me"}
                        </span>
                      </td>
                      <td style={{ padding: "12px 14px", fontFamily: "DM Mono", color: "var(--text3)" }}>KSh {Number(d.principal).toLocaleString()}</td>
                      <td style={{ padding: "12px 14px", color: "var(--text3)" }}>{lastPayment?.payment_date ?? d.due_date ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}

      {/* Payoff strategy */}
      <Card>
        <CardHeader><CardTitle>Payoff Strategy Comparison</CardTitle></CardHeader>
        <CardBody>
          <div style={{ display: "flex", gap: 2, background: "var(--surface2)", borderRadius: 10, padding: 3, border: "1px solid var(--border)", marginBottom: 20 }}>
            {(["snowball", "avalanche"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStrategy(s)}
                style={{ flex: 1, padding: "7px 14px", borderRadius: 8, fontSize: 13, border: "none", background: strategy === s ? "var(--surface)" : "transparent", color: strategy === s ? "var(--text)" : "var(--text3)", cursor: "pointer" }}
              >
                {s === "snowball" ? "❄️ Snowball Method" : "🌊 Avalanche Method"}
              </button>
            ))}
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["Priority", "Debt", strategy === "snowball" ? "Balance" : "Rate", "Due Date"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "10px 14px", fontSize: 11, color: "var(--text3)", textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedStrategyList.map((d, i) => (
                <tr key={d.id}>
                  <td style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)" }}>{i + 1}</td>
                  <td style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)" }}>{d.person_entity}</td>
                  <td style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)", fontFamily: "DM Mono" }}>
                    {strategy === "snowball"
                      ? `KSh ${Number(d.remaining_balance).toLocaleString()}`
                      : `${(Number(d.interest_rate) * 100).toFixed(1)}%`}
                  </td>
                  <td style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)" }}>{d.due_date || "N/A"}</td>
                </tr>
              ))}
              {sortedStrategyList.length === 0 && (
                <tr><td colSpan={4} style={{ padding: 20, textAlign: "center", color: "var(--text3)", fontSize: 13 }}>No active debts to strategize</td></tr>
              )}
            </tbody>
          </table>
        </CardBody>
      </Card>

      {/* ── Add Debt Modal ─────────────────────────────────────────────────────── */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Debt Record">
        <FormGrid>
          <FormGroup label="Direction">
            <select
              className="form-select"
              value={addForm.direction}
              onChange={(e) => setAddForm({ ...addForm, direction: e.target.value })}
            >
              <option value="owed_by_me">Money I Owe (I took a loan)</option>
              <option value="owed_to_me">Money Owed to Me (I lent money)</option>
            </select>
          </FormGroup>
          <FormGroup label="Person / Entity">
            <input
              className="form-input"
              type="text"
              value={addForm.person_entity}
              onChange={(e) => setAddForm({ ...addForm, person_entity: e.target.value })}
              placeholder="e.g. KCB, Sacco, John"
            />
          </FormGroup>
          <FormGroup label="Principal (KSh)">
            <input
              className="form-input"
              type="number" inputMode="decimal"
              value={addForm.principal}
              onChange={(e) => setAddForm({ ...addForm, principal: e.target.value })}
              placeholder="0"
            />
          </FormGroup>
          <FormGroup label="Interest Rate (%)">
            <input
              className="form-input"
              type="number" inputMode="decimal"
              value={addForm.interest_rate}
              onChange={(e) => setAddForm({ ...addForm, interest_rate: e.target.value })}
            />
          </FormGroup>
          <FormGroup label="Start Date">
            <input
              className="form-input"
              type="date"
              value={addForm.start_date}
              onChange={(e) => setAddForm({ ...addForm, start_date: e.target.value })}
            />
          </FormGroup>
          <FormGroup label="Due Date">
            <input
              className="form-input"
              type="date"
              value={addForm.due_date}
              onChange={(e) => setAddForm({ ...addForm, due_date: e.target.value })}
            />
          </FormGroup>
          <FormGroup label={addForm.direction === "owed_by_me" ? "Loan received into account (optional)" : "Money sent from account (optional)"}>
            <select
              className="form-select"
              value={addForm.linked_account_id}
              onChange={(e) => setAddForm({ ...addForm, linked_account_id: e.target.value })}
            >
              <option value="">— No account link —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · KSh {Number(a.balance ?? 0).toLocaleString()}
                </option>
              ))}
            </select>
          </FormGroup>
          <FormGroup label="Notes (optional)">
            <input
              className="form-input"
              type="text"
              value={addForm.notes}
              onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })}
              placeholder="Any details…"
            />
          </FormGroup>
        </FormGrid>
        <button className="btn-primary btn w-full mt-6" onClick={handleSaveDebt} disabled={submitting}>
          {submitting ? "Saving…" : "Save Debt Record"}
        </button>
      </Modal>

      {/* ── Record Payment Modal ───────────────────────────────────────────────── */}
      <Modal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title={payDebt?.direction === "owed_by_me" ? `Pay: ${payDebt?.person_entity}` : `Record Receipt: ${payDebt?.person_entity}`}
      >
        <div style={{ marginBottom: 16, padding: "10px 14px", background: "var(--surface2)", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13 }}>
          <span style={{ color: "var(--text3)" }}>Remaining balance: </span>
          <span style={{ fontFamily: "DM Mono", fontWeight: 700, color: payDebt?.direction === "owed_by_me" ? "var(--red2)" : "var(--green2)" }}>
            KSh {Number(payDebt?.remaining_balance ?? 0).toLocaleString()}
          </span>
        </div>
        <FormGrid cols={1}>
          <FormGroup label="Amount (KSh)">
            <input
              className="form-input"
              type="number" inputMode="decimal"
              value={payForm.amount}
              onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
              placeholder="0"
              autoFocus
            />
          </FormGroup>
          <FormGroup label="Date">
            <input
              className="form-input"
              type="date"
              value={payForm.date}
              onChange={(e) => setPayForm({ ...payForm, date: e.target.value })}
            />
          </FormGroup>
          <FormGroup label={payDebt?.direction === "owed_by_me" ? "Paid from account (optional)" : "Received into account (optional)"}>
            <select
              className="form-select"
              value={payForm.account_id}
              onChange={(e) => setPayForm({ ...payForm, account_id: e.target.value })}
            >
              <option value="">— No account link —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · KSh {Number(a.balance ?? 0).toLocaleString()}
                </option>
              ))}
            </select>
          </FormGroup>
          <FormGroup label="Notes (optional)">
            <input
              className="form-input"
              type="text"
              value={payForm.notes}
              onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })}
              placeholder="e.g. Partial payment"
            />
          </FormGroup>
        </FormGrid>
        <button className="btn-primary btn w-full mt-4" onClick={handleRecordPayment} disabled={submitting}>
          {submitting ? "Saving…" : payDebt?.direction === "owed_by_me" ? "Record Payment" : "Record Receipt"}
        </button>
      </Modal>
    </div>
  );
}

// ── Debt Card component ───────────────────────────────────────────────────────

function DebtCard({
  debt,
  payments,
  expanded,
  onToggle,
  onPay,
  accentColor,
  accentBg,
  badgeLabel,
  payLabel = "Record Payment",
}: {
  debt: any;
  payments: any[];
  expanded: boolean;
  onToggle: () => void;
  onPay: () => void;
  accentColor: string;
  accentBg: string;
  badgeLabel: string;
  payLabel?: string;
}) {
  const isPaid = debt.status === "paid";
  const progress = debt.principal > 0 ? ((debt.principal - debt.remaining_balance) / debt.principal) * 100 : 0;

  return (
    <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, marginBottom: 10, overflow: "hidden" }}>
      {/* Card header */}
      <div style={{ padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{debt.person_entity}</div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {isPaid && (
              <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: "rgba(16,185,129,.15)", color: "var(--green2)" }}>Paid</span>
            )}
            <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: accentBg, color: accentColor }}>{badgeLabel}</span>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: "var(--text3)" }}>Remaining</span>
          <span style={{ fontFamily: "DM Mono", fontSize: 13, color: isPaid ? "var(--text3)" : accentColor }}>
            KSh {Number(debt.remaining_balance).toLocaleString()}
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontSize: 12, color: "var(--text3)" }}>Due</span>
          <span style={{ fontSize: 12, color: "var(--text)" }}>{debt.due_date || "N/A"}</span>
        </div>

        {/* Progress bar */}
        <div style={{ height: 4, background: "var(--surface3)", borderRadius: 2, overflow: "hidden", marginBottom: 12 }}>
          <div style={{ height: "100%", width: `${progress}%`, background: isPaid ? "var(--green2)" : accentColor, borderRadius: 2 }} />
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 8 }}>
          {!isPaid && (
            <button
              onClick={onPay}
              style={{ flex: 1, padding: "7px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, border: `1px solid ${accentColor}`, background: "transparent", color: accentColor, cursor: "pointer" }}
            >
              {payLabel}
            </button>
          )}
          <button
            onClick={onToggle}
            style={{ padding: "7px 14px", borderRadius: 8, fontSize: 12, border: "1px solid var(--border)", background: "transparent", color: "var(--text3)", cursor: "pointer" }}
          >
            {expanded ? "▲" : "▼"} History {payments.length > 0 ? `(${payments.length})` : ""}
          </button>
        </div>
      </div>

      {/* Payment history */}
      {expanded && (
        <div style={{ borderTop: "1px solid var(--border)", background: "var(--surface)", padding: 12 }}>
          {payments.length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--text3)", textAlign: "center", padding: 8 }}>No payments recorded yet</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ color: "var(--text3)", textTransform: "uppercase", fontSize: 10 }}>
                  <th style={{ textAlign: "left", padding: "4px 8px" }}>Date</th>
                  <th style={{ textAlign: "right", padding: "4px 8px" }}>Amount</th>
                  <th style={{ textAlign: "left", padding: "4px 8px" }}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "6px 8px", color: "var(--text3)" }}>{p.payment_date}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "DM Mono", color: accentColor }}>
                      KSh {Number(p.amount).toLocaleString()}
                    </td>
                    <td style={{ padding: "6px 8px", color: "var(--text3)" }}>{p.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
