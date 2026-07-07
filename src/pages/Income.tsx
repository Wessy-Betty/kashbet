import { useState, useMemo } from "react";
import { Card, CardBody, Modal, FormGroup, FormGrid, SearchableSelect } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import toast from "react-hot-toast";
import { useAuthGuard as useAuth } from "@/hooks/useAuthGuard";
import { useAppStore } from "@/store/appStore";
import { useQueryClient } from "@tanstack/react-query";
import { useAccounts, useIncomeStreamsAndRecords } from "@/hooks/useFinance";
import { defaultDateForPeriod, isoToDisplay } from "@/lib/utils";

const INCOME_TYPE_OPTIONS = [
  { value: "salary", label: "Salary" },
  { value: "bonus", label: "Bonus" },
  { value: "transfer_from_savings", label: "Transfer from savings" },
  { value: "cash", label: "Cash" },
  { value: "rent", label: "Rent" },
  { value: "water", label: "Water" },
  { value: "water_refill", label: "Water refill" },
  { value: "food", label: "Food" },
  { value: "gifts", label: "Gifts" },
  { value: "internet", label: "Internet" },
  { value: "airtime", label: "Airtime" },
  { value: "debts_paid", label: "Debts paid" },
  { value: "shopping", label: "Shopping" },
  { value: "electricity", label: "Electricity" },
  { value: "dividends", label: "Dividends" },
  { value: "holding_for_another", label: "Holding for another" },
  { value: "loan", label: "Loan" },
  { value: "interest_income", label: "Interest income" },
  { value: "refunds", label: "Refunds" },
  { value: "family_support", label: "Family Support" },
  { value: "other", label: "Other" },
];

export function Income() {
  const { user } = useAuth();
  const { currentYear, currentMonth } = useAppStore();
  const queryClient = useQueryClient();
  const { data: accounts = [] } = useAccounts();
  const { data: incomeData } = useIncomeStreamsAndRecords(currentYear, currentMonth);

  const streams = incomeData?.streams ?? [];
  const records = incomeData?.records ?? [];

  const [addOpen, setAddOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    type: "salary",
    expected_amount: "0",
    frequency: "monthly",
    source_person: "",
  });

  const [receiveForm, setReceiveForm] = useState({
    stream_id: "",
    amount: "",
    date: defaultDateForPeriod(currentYear, currentMonth),
    account_id: "",
  });

  const streamOptions = useMemo(
    () => streams.map((s) => ({ value: s.id, label: s.name })),
    [streams],
  );

  // Records sorted newest-first, joined with their stream name for display
  const sortedRecords = useMemo(() => {
    return [...records]
      .sort((a, b) => (a.received_date < b.received_date ? 1 : -1))
      .map((r) => ({
        ...r,
        streamName: streams.find((s) => s.id === r.income_stream_id)?.name ?? "Unknown source",
      }));
  }, [records, streams]);

  const stats = useMemo(() => {
    const expected = streams.reduce((s, x) => s + Number(x.expected_amount || 0), 0);
    const received = records.reduce((s, x) => s + Number(x.amount || 0), 0);
    const familyTotal = records
      .filter((r) => r.income_streams?.type === "family_support")
      .reduce((s, x) => s + Number(x.amount || 0), 0);

    return {
      expected: expected || 0,
      received: received || 0,
      familyTotal: familyTotal || 0,
      ratio: expected > 0 ? ((received / expected) * 100).toFixed(1) : "0.0",
    };
  }, [streams, records]);

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ["annual_summary"] });
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
    queryClient.invalidateQueries({ queryKey: ["accounts"] });
    queryClient.invalidateQueries({ queryKey: ["income_streams_and_records"] });
    queryClient.invalidateQueries({ queryKey: ["income_streams"] });
  }

  function openReceiveModal() {
    setReceiveForm({
      stream_id: streams[0]?.id ?? "",
      amount: "",
      date: defaultDateForPeriod(currentYear, currentMonth),
      account_id: "",
    });
    setReceiveOpen(true);
  }

  async function handleSaveStream() {
    if (submitting) return;
    if (!formData.name) return toast.error("Source name required");
    setSubmitting(true);

    const { error } = await supabase.from("income_streams").insert({
      user_id: user?.id,
      name: formData.name,
      type: formData.type,
      expected_amount: Number(formData.expected_amount) || 0,
      frequency: formData.frequency,
      source_person: formData.source_person || null,
    });

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Income Stream Added");
      setAddOpen(false);
      setFormData({ name: "", type: "salary", expected_amount: "0", frequency: "monthly", source_person: "" });
      invalidateAll();
    }
    setSubmitting(false);
  }

  async function handleRecordIncome() {
    if (submitting) return;
    if (!receiveForm.stream_id) return toast.error("Select a source");
    const amt = Number(receiveForm.amount);
    if (!amt || amt <= 0) return toast.error("Enter a valid amount");
    setSubmitting(true);

    const stream = streams.find((s) => s.id === receiveForm.stream_id);

    const [{ error }] = await Promise.all([
      supabase.from("income_records").insert({
        user_id: user?.id,
        income_stream_id: receiveForm.stream_id,
        amount: amt,
        received_date: receiveForm.date,
      }),
      supabase.from("transactions").insert({
        user_id: user?.id,
        amount: amt,
        description: stream?.name ?? "Income",
        transaction_date: receiveForm.date,
        type: "income",
        classification: "transfer",
        payment_method: "Other",
        account_id: receiveForm.account_id || null,
      }),
    ]);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Income Recorded");
      setReceiveOpen(false);
      invalidateAll();
    }
    setSubmitting(false);
  }

  // Best-effort: also remove the paired transaction row created alongside this
  // record (dual-write has no FK link between the two tables, so this matches
  // on amount + date + description + type — safe in the common case, but a
  // same-day duplicate with the identical amount and source could match the
  // wrong transaction row).
  async function handleDeleteRecord(record: (typeof sortedRecords)[number]) {
    const { error } = await supabase.from("income_records").delete().eq("id", record.id);
    if (error) return toast.error(error.message);

    await supabase
      .from("transactions")
      .delete()
      .eq("type", "income")
      .eq("amount", record.amount)
      .eq("transaction_date", record.received_date)
      .eq("description", record.streamName);

    toast.success("Income record deleted");
    invalidateAll();
  }

  const periodLabel = new Date(currentYear, currentMonth - 1).toLocaleString("default", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="page-enter">
      <div className="page-header">
        <h1 className="page-title">Income Tracker</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn-ghost btn" onClick={() => setAddOpen(true)}>
            + Add Source
          </button>
          <button className="btn-primary btn" onClick={openReceiveModal} disabled={streams.length === 0}>
            + Record Income
          </button>
        </div>
      </div>

      <div className="stat-rail" style={{ marginBottom: 24 }}>
        {[
          { label: "Total Expected", val: stats.expected, sub: `${streams.length} Sources`, col: "var(--text)" },
          { label: "Total Received", val: stats.received, sub: periodLabel, col: "var(--green2)" },
          { label: "Collection Rate", val: `${stats.ratio}%`, sub: "Progress", col: "var(--amber2)" },
          { label: "Family Support", val: stats.familyTotal, sub: periodLabel, col: "#a78bfa" },
        ].map((kpi, i) => (
          <div key={i} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "var(--text3)", marginBottom: 8 }}>
              {kpi.label}
            </div>
            <div style={{ fontFamily: "DM Mono", fontSize: 22, color: kpi.col, marginBottom: 8 }}>
              {kpi.label.includes("Rate") ? kpi.val : `KSh ${kpi.val.toLocaleString()}`}
            </div>
            <div style={{ fontSize: 12, color: "var(--text3)" }}>{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* Income received this period — one row per dated record, exactly like Transactions */}
      <Card>
        <CardBody>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--text3)", textTransform: "uppercase", fontSize: 11, borderBottom: "1px solid var(--border)" }}>
                  <th style={{ padding: "12px 14px" }}>Date</th>
                  <th style={{ padding: "12px 14px" }}>Source</th>
                  <th style={{ padding: "12px 14px" }}>Type</th>
                  <th style={{ padding: "12px 14px", textAlign: "right" }}>Amount</th>
                  <th style={{ padding: "12px 14px" }}></th>
                </tr>
              </thead>
              <tbody>
                {sortedRecords.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: 24, textAlign: "center", color: "var(--text3)" }}>
                      No income received in {periodLabel}.
                    </td>
                  </tr>
                )}
                {sortedRecords.map((r) => (
                  <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "14px", color: "var(--text3)", whiteSpace: "nowrap" }}>
                      {isoToDisplay(r.received_date)}
                    </td>
                    <td style={{ padding: "14px", fontWeight: 600 }}>{r.streamName}</td>
                    <td style={{ padding: "14px" }}>
                      <span className="badge-blue">{r.income_streams?.type ?? "—"}</span>
                    </td>
                    <td style={{ padding: "14px", fontFamily: "DM Mono", color: "var(--green2)", textAlign: "right" }}>
                      +KSh {Number(r.amount).toLocaleString()}
                    </td>
                    <td style={{ padding: "14px", textAlign: "right" }}>
                      <button
                        onClick={() => handleDeleteRecord(r)}
                        style={{ background: "none", border: "none", color: "var(--text3)", cursor: "pointer", padding: "4px 8px" }}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      {/* ── Add Source Modal ─────────────────────────────────────────────────── */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="New Income Source">
        <FormGrid>
          <FormGroup label="Source Name">
            <input
              className="form-input"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Consulting"
            />
          </FormGroup>

          <FormGroup label="Type">
            <SearchableSelect
              value={formData.type}
              onChange={(v) => setFormData({ ...formData, type: v })}
              options={INCOME_TYPE_OPTIONS}
              placeholder="Search type…"
              allowClear={false}
            />
          </FormGroup>

          <FormGroup label="Frequency">
            <select
              className="form-select"
              value={formData.frequency}
              onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
            >
              <option value="monthly">Monthly</option>
              <option value="weekly">Weekly</option>
              <option value="fortnightly">Fortnightly</option>
              <option value="annual">Annual</option>
              <option value="one_time">One-time</option>
            </select>
          </FormGroup>

          <FormGroup label="Expected Amount (KSh)">
            <input
              className="form-input"
              type="number" inputMode="decimal"
              value={formData.expected_amount}
              onChange={(e) => setFormData({ ...formData, expected_amount: e.target.value })}
            />
          </FormGroup>
        </FormGrid>

        <button className="btn-primary btn w-full mt-6" onClick={handleSaveStream} disabled={submitting}>
          {submitting ? "Saving…" : "Save Source"}
        </button>
      </Modal>

      {/* ── Record Income Modal ──────────────────────────────────────────────── */}
      <Modal open={receiveOpen} onClose={() => setReceiveOpen(false)} title="Record Income">
        <FormGrid cols={1}>
          <FormGroup label="Source">
            <SearchableSelect
              value={receiveForm.stream_id}
              onChange={(v) => setReceiveForm({ ...receiveForm, stream_id: v })}
              options={streamOptions}
              placeholder="Search source…"
              allowClear={false}
            />
          </FormGroup>
          <FormGroup label="Amount Received (KSh)">
            <input
              className="form-input"
              type="number" inputMode="decimal"
              value={receiveForm.amount}
              onChange={(e) => setReceiveForm({ ...receiveForm, amount: e.target.value })}
              autoFocus
            />
          </FormGroup>
          <FormGroup label="Date Received">
            <input
              className="form-input"
              type="date"
              value={receiveForm.date}
              onChange={(e) => setReceiveForm({ ...receiveForm, date: e.target.value })}
            />
          </FormGroup>
          <FormGroup label="Received into Account">
            <select
              className="form-select"
              value={receiveForm.account_id}
              onChange={(e) => setReceiveForm({ ...receiveForm, account_id: e.target.value })}
            >
              <option value="">— No account link —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · KSh {Number(a.balance ?? 0).toLocaleString()}
                </option>
              ))}
            </select>
          </FormGroup>
        </FormGrid>
        <button className="btn-primary btn w-full mt-4" onClick={handleRecordIncome} disabled={submitting}>
          {submitting ? "Saving…" : "Record Income"}
        </button>
      </Modal>
    </div>
  );
}
