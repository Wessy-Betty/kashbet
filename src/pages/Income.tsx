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

  const [receiveOpen, setReceiveOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);

  // One form does both jobs now: the Source field is a pick-or-type combobox,
  // so a name that isn't an existing source gets created on save. `type` is
  // only used when creating that new source.
  const [receiveForm, setReceiveForm] = useState({
    stream_id: "",
    type: "salary",
    expected: "",
    amount: "",
    date: defaultDateForPeriod(currentYear, currentMonth),
    account_id: "",
  });

  const streamOptions = useMemo(
    () => streams.map((s) => ({ value: s.id, label: s.name })),
    [streams],
  );

  // One row per income entry this month. Each entry now carries BOTH its own
  // expected amount and how much has been received against it, so status is
  // per-row: Pending (nothing received) / Partial (some) / Received (met or
  // exceeded, or a 0-expected "extra" entry). Pending entries (no received
  // date) sort to the top since they still need action.
  const rows = useMemo(() => {
    return [...records]
      .sort((a, b) => {
        const ap = a.received_date ? 1 : 0;
        const bp = b.received_date ? 1 : 0;
        if (ap !== bp) return ap - bp; // pending (0) first
        return (a.received_date ?? "") < (b.received_date ?? "") ? 1 : -1;
      })
      .map((r) => {
        const stream = streams.find((s) => s.id === r.income_stream_id);
        const expected = Number(r.expected_amount ?? 0);
        const received = Number(r.amount ?? 0);
        const status =
          received === 0 ? "Pending" : expected > 0 && received < expected ? "Partial" : "Received";
        return {
          ...r,
          streamName: stream?.name ?? "Unknown source",
          type: stream?.type ?? r.income_streams?.type ?? "—",
          frequency: stream?.frequency ?? "—",
          expected,
          received,
          status,
        };
      });
  }, [records, streams]);

  const stats = useMemo(() => {
    const expected = records.reduce((s, x) => s + Number(x.expected_amount || 0), 0);
    const received = records.reduce((s, x) => s + Number(x.amount || 0), 0);
    const familyTotal = records
      .filter((r) => r.income_streams?.type === "family_support")
      .reduce((s, x) => s + Number(x.amount || 0), 0);

    return {
      expected: expected || 0,
      received: received || 0,
      familyTotal: familyTotal || 0,
      // Reframe overshoot as positive variance instead of a confusing >100%.
      extra: Math.max(0, received - expected),
      onTrack: expected > 0 && received >= expected,
      ratio: expected > 0 ? ((received / expected) * 100).toFixed(1) : "0.0",
    };
  }, [records]);

  const selectedStream = streams.find((s) => s.id === receiveForm.stream_id);
  const baselineHint = Number(selectedStream?.expected_amount ?? 0);
  // A source already has a planned entry this month if another record for it
  // carries a positive expected amount — a second entry is then "extra".
  const plannedExists = records.some(
    (r) =>
      r.income_stream_id === receiveForm.stream_id &&
      Number(r.expected_amount) > 0 &&
      (!editRecord || r.id !== editRecord.id),
  );
  // A typed source name that matches no existing source is a new source to create.
  const isNewSource = !!receiveForm.stream_id && !streams.some((s) => s.id === receiveForm.stream_id);

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ["annual_summary"] });
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
    queryClient.invalidateQueries({ queryKey: ["accounts"] });
    queryClient.invalidateQueries({ queryKey: ["income_streams_and_records"] });
    queryClient.invalidateQueries({ queryKey: ["income_streams"] });
  }

  function openReceiveModal() {
    setEditRecord(null);
    setReceiveForm({
      stream_id: "",
      type: "salary",
      expected: "",
      amount: "",
      date: defaultDateForPeriod(currentYear, currentMonth),
      account_id: "",
    });
    setReceiveOpen(true);
  }

  function openEditModal(record: (typeof rows)[number]) {
    setEditRecord(record);
    setReceiveForm({
      stream_id: record.income_stream_id,
      type: record.type ?? "salary",
      expected: record.expected ? String(record.expected) : "",
      amount: record.received ? String(record.received) : "",
      date: record.received_date ?? defaultDateForPeriod(currentYear, currentMonth),
      account_id: record.account_id ?? "",
    });
    setReceiveOpen(true);
  }

  // Best-effort: also removes/replaces the paired transaction row from the
  // dual-write. There's no FK link between income_records and transactions,
  // so the match is on amount + date + description + type=income — safe in
  // the common case, but a same-day duplicate with an identical amount and
  // source could match the wrong transaction row.
  async function deletePairedTransaction(amount: number, date: string, description: string) {
    await supabase
      .from("transactions")
      .delete()
      .eq("type", "income")
      .eq("amount", amount)
      .eq("transaction_date", date)
      .eq("description", description);
  }

  async function handleRecordIncome() {
    if (submitting) return;
    if (!receiveForm.stream_id.trim()) return toast.error("Select or add a source");
    const expected = Number(receiveForm.expected) || 0;
    const received = Number(receiveForm.amount) || 0;
    if (expected <= 0 && received <= 0)
      return toast.error("Enter an expected amount, a received amount, or both");
    setSubmitting(true);

    // The Source combobox holds either an existing source id or a typed new
    // name. If it's a new name, create the source first (seeding its baseline
    // expected from this entry) and use the new id.
    let streamId = receiveForm.stream_id;
    let sourceName = streams.find((s) => s.id === streamId)?.name ?? receiveForm.stream_id.trim();
    if (isNewSource) {
      const { data: created, error: sErr } = await supabase
        .from("income_streams")
        .insert({
          user_id: user?.id,
          name: receiveForm.stream_id.trim(),
          type: receiveForm.type,
          frequency: "monthly",
          expected_amount: expected,
          source_person: null,
        })
        .select("id, name")
        .single();
      if (sErr || !created) {
        toast.error(sErr?.message ?? "Could not create the source");
        setSubmitting(false);
        return;
      }
      streamId = created.id;
      sourceName = created.name;
    }

    // A pending entry (nothing received) has no date and moves no money.
    const receivedDate = received > 0 ? receiveForm.date || defaultDateForPeriod(currentYear, currentMonth) : null;

    // Editing = delete the old record + its paired transaction first, then
    // insert fresh. The account-balance trigger only fires on INSERT/DELETE
    // (not UPDATE), so this is the only way to keep balances correct if the
    // amount or account changes. Only delete a paired transaction if the old
    // entry had actually recorded a receipt.
    if (editRecord) {
      const { error: delErr } = await supabase.from("income_records").delete().eq("id", editRecord.id);
      if (delErr) { toast.error(delErr.message); setSubmitting(false); return; }
      if (Number(editRecord.amount) > 0 && editRecord.received_date) {
        await deletePairedTransaction(Number(editRecord.amount), editRecord.received_date, editRecord.streamName);
      }
    }

    const writes: any[] = [
      supabase.from("income_records").insert({
        user_id: user?.id,
        income_stream_id: streamId,
        expected_amount: expected,
        amount: received,
        received_date: receivedDate,
        period_year: currentYear,
        period_month: currentMonth,
        account_id: receiveForm.account_id || null,
      }),
    ];
    // Only write the balance-moving transaction when money was actually received.
    if (received > 0) {
      writes.push(
        supabase.from("transactions").insert({
          user_id: user?.id,
          amount: received,
          description: sourceName || "Income",
          transaction_date: receivedDate,
          type: "income",
          classification: "transfer",
          payment_method: "Other",
          account_id: receiveForm.account_id || null,
        }),
      );
    }

    const [{ error }] = await Promise.all(writes);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(editRecord ? "Entry updated" : received > 0 ? "Income recorded" : "Expected income saved");
      setReceiveOpen(false);
      setEditRecord(null);
      invalidateAll();
    }
    setSubmitting(false);
  }

  async function handleDeleteRecord(record: (typeof rows)[number]) {
    const { error } = await supabase.from("income_records").delete().eq("id", record.id);
    if (error) return toast.error(error.message);

    // Only a received entry has a paired transaction to remove.
    if (Number(record.amount) > 0 && record.received_date) {
      await deletePairedTransaction(Number(record.amount), record.received_date, record.streamName);
    }

    toast.success("Entry deleted");
    invalidateAll();
  }

  const periodLabel = new Date(currentYear, currentMonth - 1).toLocaleString("default", {
    month: "long",
    year: "numeric",
  });

  const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
    Received: { bg: "rgba(16,185,129,.1)", color: "var(--green2)" },
    Partial: { bg: "rgba(245,158,11,.1)", color: "var(--amber2)" },
    Pending: { bg: "rgba(148,163,184,.12)", color: "var(--text3)" },
  };

  return (
    <div className="page-enter">
      <div className="page-header">
        <h1 className="page-title">Income Tracker</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn-primary btn" onClick={openReceiveModal}>
            + Add Income
          </button>
        </div>
      </div>

      <div className="stat-rail" style={{ marginBottom: 24 }}>
        {[
          { label: "Total Expected", val: stats.expected, sub: periodLabel, col: "var(--text)" },
          { label: "Total Received", val: stats.received, sub: periodLabel, col: "var(--green2)" },
          {
            label: "Collection Rate",
            val: stats.onTrack ? "On track" : stats.expected > 0 ? `${stats.ratio}%` : "—",
            sub: stats.extra > 0 ? `+ KSh ${stats.extra.toLocaleString()} extra` : "Progress",
            col: stats.onTrack ? "var(--green2)" : "var(--amber2)",
          },
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

      {/* Income received this period — original columns, plus Date, one row per dated record */}
      <Card>
        <CardBody>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--text3)", textTransform: "uppercase", fontSize: 11, borderBottom: "1px solid var(--border)" }}>
                  <th style={{ padding: "12px 14px" }}>Date</th>
                  <th style={{ padding: "12px 14px" }}>Source</th>
                  <th style={{ padding: "12px 14px" }}>Type</th>
                  <th style={{ padding: "12px 14px" }}>Frequency</th>
                  <th style={{ padding: "12px 14px" }}>Expected</th>
                  <th style={{ padding: "12px 14px" }}>Received</th>
                  <th style={{ padding: "12px 14px" }}>Status</th>
                  <th style={{ padding: "12px 14px" }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ padding: 24, textAlign: "center", color: "var(--text3)" }}>
                      No income entries for {periodLabel} yet. Use "Record Income" to add what you expect or receive.
                    </td>
                  </tr>
                )}
                {rows.map((r) => {
                  const st = STATUS_STYLE[r.status] ?? STATUS_STYLE.Pending;
                  return (
                    <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "14px", color: "var(--text3)", whiteSpace: "nowrap" }}>
                        {r.received_date ? isoToDisplay(r.received_date) : "Pending"}
                      </td>
                      <td style={{ padding: "14px", fontWeight: 600 }}>{r.streamName}</td>
                      <td style={{ padding: "14px" }}>
                        <span className="badge-blue">{r.type}</span>
                      </td>
                      <td style={{ padding: "14px" }}>{r.frequency}</td>
                      <td style={{ padding: "14px", fontFamily: "DM Mono" }}>KSh {r.expected.toLocaleString()}</td>
                      <td style={{ padding: "14px", fontFamily: "DM Mono", color: r.received > 0 ? "var(--green2)" : "var(--text3)" }}>
                        {r.received > 0 ? `KSh ${r.received.toLocaleString()}` : "—"}
                      </td>
                      <td style={{ padding: "14px" }}>
                        <span style={{ padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: st.bg, color: st.color }}>
                          {r.status}
                        </span>
                      </td>
                      <td style={{ padding: "14px", textAlign: "right", whiteSpace: "nowrap" }}>
                        <button
                          onClick={() => openEditModal(r)}
                          title="Edit"
                          style={{ background: "none", border: "none", color: "var(--text3)", cursor: "pointer", padding: "4px 8px" }}
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => handleDeleteRecord(r)}
                          title="Delete"
                          style={{ background: "none", border: "none", color: "var(--text3)", cursor: "pointer", padding: "4px 8px" }}
                        >
                          ✕
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

      {/* ── Add / Edit Income Modal ──────────────────────────────────────────── */}
      <Modal
        open={receiveOpen}
        onClose={() => { setReceiveOpen(false); setEditRecord(null); }}
        title={editRecord ? "Edit Income" : "Add Income"}
      >
        <FormGrid cols={1}>
          <FormGroup label="Source">
            <SearchableSelect
              value={receiveForm.stream_id}
              onChange={(v) => setReceiveForm({ ...receiveForm, stream_id: v })}
              options={streamOptions}
              placeholder="Pick a source or type a new one…"
              allowCustom
              allowClear={false}
            />
          </FormGroup>
          {isNewSource && (
            <FormGroup label="New source — type">
              <SearchableSelect
                value={receiveForm.type}
                onChange={(v) => setReceiveForm({ ...receiveForm, type: v })}
                options={INCOME_TYPE_OPTIONS}
                placeholder="Search type…"
                allowClear={false}
              />
            </FormGroup>
          )}
          <FormGroup label={`Expected this month (KSh) — ${periodLabel}`}>
            <input
              className="form-input"
              type="number" inputMode="decimal"
              value={receiveForm.expected}
              placeholder={baselineHint > 0 ? `Usually ${baselineHint.toLocaleString()}` : "0"}
              onChange={(e) => setReceiveForm({ ...receiveForm, expected: e.target.value })}
              autoFocus
            />
            {plannedExists && (
              <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 4 }}>
                This source already has an expected amount this month. Leave this at 0 to just record extra income.
              </div>
            )}
          </FormGroup>
          <FormGroup label="Amount received (KSh) — leave blank if not received yet">
            <input
              className="form-input"
              type="number" inputMode="decimal"
              value={receiveForm.amount}
              placeholder="0"
              onChange={(e) => setReceiveForm({ ...receiveForm, amount: e.target.value })}
            />
          </FormGroup>
          <FormGroup label="Date received">
            <input
              className="form-input"
              type="date"
              value={receiveForm.date}
              onChange={(e) => setReceiveForm({ ...receiveForm, date: e.target.value })}
            />
          </FormGroup>
          <FormGroup label="Received into account">
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
          <div style={{ fontSize: 11, color: "var(--text3)" }}>
            Date and account only apply once you enter a received amount. An entry with nothing received shows as "Pending" and moves no money.
          </div>
        </FormGrid>
        <button className="btn-primary btn w-full mt-4" onClick={handleRecordIncome} disabled={submitting}>
          {submitting ? "Saving…" : editRecord ? "Save changes" : "Save"}
        </button>
      </Modal>
    </div>
  );
}
