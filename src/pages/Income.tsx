import { useEffect, useState, useMemo } from "react";
import { Card, CardBody, Modal, FormGroup, FormGrid } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import toast from "react-hot-toast";
import { useAuthGuard as useAuth } from "@/hooks/useAuthGuard";
import { useAppStore } from "@/store/appStore";
import { useQueryClient } from "@tanstack/react-query";
import { useAccounts } from "@/hooks/useFinance";

export function Income() {
  const { user } = useAuth();
  const { currentYear, currentMonth } = useAppStore();
  const queryClient = useQueryClient();
  const { data: accounts = [] } = useAccounts();

  const [addOpen, setAddOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [streams, setStreams] = useState<any[]>([]);
  const [records, setRecords] = useState<any[]>([]);
  const [_loading, setLoading] = useState(true);
  const [selectedStream, setSelectedStream] = useState<any>(null);

  const [formData, setFormData] = useState({
    name: "",
    type: "salary",
    expected_amount: "0",
    frequency: "monthly",
    source_person: "",
    amount_received: "",
    received_into: "",   // account_id where funds land
  });
  const [receiveAmount, setReceiveAmount] = useState("0");
  const [receiveIntoId, setReceiveIntoId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) fetchData();
  }, [user, currentMonth, currentYear]);

  async function fetchData() {
    setLoading(true);
    const startOfMonth = `${currentYear}-${String(currentMonth).padStart(2, "0")}-01`;

    const { data: sData } = await supabase
      .from("income_streams")
      .select("*")
      .eq("user_id", user?.id);
    const { data: rData } = await supabase
      .from("income_records")
      .select("*, income_streams(type)")
      .eq("user_id", user?.id)
      .gte("received_date", startOfMonth);

    setStreams(sData || []);
    setRecords(rData || []);
    setLoading(false);
  }

  const stats = useMemo(() => {
    const expected = streams.reduce(
      (s, x) => s + Number(x.expected_amount || 0),
      0,
    );
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

  async function handleSaveStream() {
    if (submitting) return;
    if (!formData.name) return toast.error("Source name required");
    setSubmitting(true);

    const { data: streamData, error } = await supabase
      .from("income_streams")
      .insert({
        user_id: user?.id,
        name: formData.name,
        type: formData.type,
        expected_amount: Number(formData.expected_amount) || 0,
        frequency: formData.frequency,
        source_person: formData.source_person || null,
      })
      .select()
      .single();

    if (error) { toast.error(error.message); return; }

    // If an amount was already received, log it in both income_records AND transactions
    const received = parseFloat(formData.amount_received);
    if (!isNaN(received) && received > 0 && streamData) {
      const today = new Date().toISOString().split("T")[0];
      await Promise.all([
        supabase.from("income_records").insert({
          user_id: user?.id,
          income_stream_id: streamData.id,
          amount: received,
          received_date: today,
        }),
        supabase.from("transactions").insert({
          user_id: user?.id,
          amount: received,
          description: formData.name,
          transaction_date: today,
          type: "income",
          classification: "transfer",
          payment_method: "Other",
          account_id: formData.received_into || null,
        }),
      ]);
    }

    toast.success(received > 0 ? "Stream added & payment recorded" : "Income Stream Added");
    setAddOpen(false);
    setFormData({ name: "", type: "salary", expected_amount: "0", frequency: "monthly", source_person: "", amount_received: "", received_into: "" });
    queryClient.invalidateQueries({ queryKey: ["annual_summary"] });
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
    queryClient.invalidateQueries({ queryKey: ["accounts"] });
    fetchData();
    setSubmitting(false);
  }

  async function handleRecordPayment() {
    if (submitting || !selectedStream) return;
    setSubmitting(true);
    const today = new Date().toISOString().split("T")[0];
    const amt = Number(receiveAmount) || 0;

    const [{ error }] = await Promise.all([
      supabase.from("income_records").insert({
        user_id: user?.id,
        income_stream_id: selectedStream.id,
        amount: amt,
        received_date: today,
      }),
      supabase.from("transactions").insert({
        user_id: user?.id,
        amount: amt,
        description: selectedStream.name,
        transaction_date: today,
        type: "income",
        classification: "transfer",
        payment_method: "Other",
        account_id: receiveIntoId || null,
      }),
    ]);

    if (!error) {
      toast.success("Payment Recorded");
      setReceiveOpen(false);
      setReceiveAmount("0");
      setReceiveIntoId("");
      queryClient.invalidateQueries({ queryKey: ["annual_summary"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      fetchData();
    }
    setSubmitting(false);
  }

  return (
    <div className="page-enter">
      <div className="page-header">
        <h1 className="page-title">Income Tracker</h1>
        <button className="btn-primary btn" onClick={() => setAddOpen(true)}>
          + Add Stream
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 16,
          marginBottom: 24,
        }}
      >
        {[
          {
            label: "Total Expected",
            val: stats.expected,
            sub: `${streams.length} Streams`,
            col: "var(--text)",
          },
          {
            label: "Total Received",
            val: stats.received,
            sub: "Current Month",
            col: "var(--green2)",
          },
          {
            label: "Collection Rate",
            val: `${stats.ratio}%`,
            sub: "Progress",
            col: "var(--amber2)",
          },
          {
            label: "Family Support",
            val: stats.familyTotal,
            sub: "Live Data",
            col: "#a78bfa",
          },
        ].map((kpi, i) => (
          <div
            key={i}
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
              {kpi.label}
            </div>
            <div
              style={{
                fontFamily: "DM Mono",
                fontSize: 22,
                color: kpi.col,
                marginBottom: 8,
              }}
            >
              {kpi.label.includes("Rate")
                ? kpi.val
                : `KSh ${kpi.val.toLocaleString()}`}
            </div>
            <div style={{ fontSize: 12, color: "var(--text3)" }}>{kpi.sub}</div>
          </div>
        ))}
      </div>

      <Card>
        <CardBody>
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
          >
            <thead>
              <tr
                style={{
                  textAlign: "left",
                  color: "var(--text3)",
                  textTransform: "uppercase",
                  fontSize: 11,
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <th style={{ padding: "12px 14px" }}>Source</th>
                <th style={{ padding: "12px 14px" }}>Type</th>
                <th style={{ padding: "12px 14px" }}>Frequency</th>
                <th style={{ padding: "12px 14px" }}>Expected</th>
                <th style={{ padding: "12px 14px" }}>Received</th>
                <th style={{ padding: "12px 14px" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {streams.map((s) => {
                const received = records
                  .filter((r) => r.income_stream_id === s.id)
                  .reduce((sum, r) => sum + Number(r.amount), 0);
                const expected = Number(s.expected_amount);
                const isFull = received >= expected && expected > 0;
                return (
                  <tr
                    key={s.id}
                    onClick={() => {
                      setSelectedStream(s);
                      setReceiveOpen(true);
                    }}
                    style={{
                      cursor: "pointer",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <td style={{ padding: "16px 14px", fontWeight: 600 }}>
                      {s.name}
                    </td>
                    <td style={{ padding: "14px" }}>
                      <span className="badge-blue">{s.type}</span>
                    </td>
                    <td style={{ padding: "14px" }}>{s.frequency}</td>
                    <td style={{ padding: "14px", fontFamily: "DM Mono" }}>
                      KSh {expected.toLocaleString()}
                    </td>
                    <td
                      style={{
                        padding: "14px",
                        fontFamily: "DM Mono",
                        color: "var(--green2)",
                      }}
                    >
                      KSh {received.toLocaleString()}
                    </td>
                    <td style={{ padding: "14px" }}>
                      <span
                        style={{
                          padding: "4px 10px",
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 700,
                          background: isFull
                            ? "rgba(16,185,129,.1)"
                            : "rgba(245,158,11,.1)",
                          color: isFull ? "var(--green2)" : "var(--amber2)",
                        }}
                      >
                        {isFull
                          ? "Received"
                          : received > 0
                            ? "Partial"
                            : "Pending"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardBody>
      </Card>

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="New Income Stream"
      >
        <FormGrid>
          <FormGroup label="Source Name">
            <input
              className="form-input"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              placeholder="e.g. Consulting"
            />
          </FormGroup>

          <FormGroup label="Type">
            <select
              className="form-select"
              value={formData.type}
              onChange={(e) =>
                setFormData({ ...formData, type: e.target.value })
              }
            >
              <option value="salary">Salary</option>
              <option value="freelance">Freelance</option>
              <option value="business">Business</option>
              <option value="investment">Investment</option>
              <option value="family_support">Family Support</option>
              <option value="rental">Rental</option>
              <option value="other">Other</option>
            </select>
          </FormGroup>

          <FormGroup label="Frequency">
            <select
              className="form-select"
              value={formData.frequency}
              onChange={(e) =>
                setFormData({ ...formData, frequency: e.target.value })
              }
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
              type="number"
              value={formData.expected_amount}
              onChange={(e) =>
                setFormData({ ...formData, expected_amount: e.target.value })
              }
            />
          </FormGroup>

          <FormGroup label="Amount Already Received (KSh) — optional">
            <input
              className="form-input"
              type="number"
              min="0"
              placeholder="Leave blank if not yet received"
              value={formData.amount_received}
              onChange={(e) =>
                setFormData({ ...formData, amount_received: e.target.value })
              }
            />
          </FormGroup>

          {formData.amount_received && parseFloat(formData.amount_received) > 0 && (
            <FormGroup label="Received into Account">
              <select
                className="form-select"
                value={formData.received_into}
                onChange={(e) => setFormData({ ...formData, received_into: e.target.value })}
              >
                <option value="">— No account link —</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · KSh {Number(a.balance ?? 0).toLocaleString()}
                  </option>
                ))}
              </select>
            </FormGroup>
          )}
        </FormGrid>

        <button
          className="btn-primary btn w-full mt-6"
          onClick={handleSaveStream}
          disabled={submitting}
        >
          {submitting ? "Saving…" : "Save Stream"}
        </button>
      </Modal>

      <Modal
        open={receiveOpen}
        onClose={() => { setReceiveOpen(false); setReceiveIntoId(""); }}
        title={`Record Payment: ${selectedStream?.name}`}
      >
        <FormGrid cols={1}>
          <FormGroup label="Amount Received (KSh)">
            <input
              className="form-input"
              type="number"
              value={receiveAmount}
              onChange={(e) => setReceiveAmount(e.target.value)}
              autoFocus
            />
          </FormGroup>
          <FormGroup label="Received into Account">
            <select
              className="form-select"
              value={receiveIntoId}
              onChange={(e) => setReceiveIntoId(e.target.value)}
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
        <button
          className="btn-primary btn w-full mt-4"
          onClick={handleRecordPayment}
          disabled={submitting}
        >
          {submitting ? "Saving…" : "Confirm Receipt"}
        </button>
      </Modal>
    </div>
  );
}
