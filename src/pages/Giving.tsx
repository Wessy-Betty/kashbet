import { useState, useEffect, useMemo } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardBody,
  Modal,
  FormGroup,
  FormGrid,
} from "@/components/ui";
import toast from "react-hot-toast";
import { supabase } from "@/lib/supabase";
import { useAuthGuard as useAuth } from "@/hooks/useAuthGuard";

interface GivingRecord {
  id: string;
  person: string;
  amount: number;
  given_date: string;
  notes: string | null;
}

export function Giving() {
  const { user } = useAuth();
  const [records, setRecords] = useState<GivingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const [showModal, setShowModal] = useState(false);
  const [person, setPerson] = useState("");
  const [customPerson, setCustomPerson] = useState("");
  const [amount, setAmount] = useState("");
  const [givenDate, setGivenDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Filter controls
  const [filterPerson, setFilterPerson] = useState("All");
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [filterMonth, setFilterMonth] = useState(0); // 0 = all months

  useEffect(() => {
    if (!user?.id) return;
    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from("giving_records")
        .select("*")
        .eq("user_id", user!.id)
        .order("given_date", { ascending: false });
      if (error) toast.error(error.message);
      else setRecords((data as GivingRecord[]) ?? []);
      setLoading(false);
    }
    load();
  }, [user, refreshTrigger]);

  // People this user has actually recorded giving to — no preset names.
  const allPeople = useMemo(
    () => Array.from(new Set(records.map((r) => r.person))),
    [records],
  );

  // Filtered records
  const filtered = useMemo(() => {
    return records.filter((r) => {
      const d = new Date(r.given_date);
      const yearMatch = d.getFullYear() === filterYear;
      const monthMatch = filterMonth === 0 || d.getMonth() + 1 === filterMonth;
      const personMatch = filterPerson === "All" || r.person === filterPerson;
      return yearMatch && monthMatch && personMatch;
    });
  }, [records, filterYear, filterMonth, filterPerson]);

  // Per-person totals for the filtered period
  const personTotals = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of filtered) {
      map[r.person] = (map[r.person] ?? 0) + Number(r.amount);
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  const grandTotal = useMemo(
    () => filtered.reduce((s, r) => s + Number(r.amount), 0),
    [filtered],
  );

  // Monthly breakdown for selected person (or all)
  const monthlyBreakdown = useMemo(() => {
    const months: Record<string, number> = {};
    const source = records.filter(
      (r) =>
        new Date(r.given_date).getFullYear() === filterYear &&
        (filterPerson === "All" || r.person === filterPerson),
    );
    for (const r of source) {
      const key = new Date(r.given_date).toLocaleString("default", { month: "short" });
      months[key] = (months[key] ?? 0) + Number(r.amount);
    }
    return months;
  }, [records, filterYear, filterPerson]);

  async function handleSave() {
    const name = person === "__custom__" ? customPerson.trim() : person;
    const amt = parseFloat(amount);
    if (!name) return toast.error("Enter a person name");
    if (!amt || amt <= 0) return toast.error("Enter a valid amount");
    setSaving(true);
    try {
      const { error } = await supabase.from("giving_records").insert({
        user_id: user!.id,
        person: name,
        amount: amt,
        given_date: givenDate,
        notes: notes.trim() || null,
      });
      if (error) throw error;
      toast.success(`Recorded KSh ${amt.toLocaleString()} to ${name}`);
      setShowModal(false);
      setAmount(""); setNotes(""); setPerson(""); setCustomPerson("");
      setGivenDate(new Date().toISOString().split("T")[0]);
      setRefreshTrigger((p) => p + 1);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  return (
    <div className="page-enter">
      <div className="page-header">
        <div>
          <h1 className="page-title">Family Giving</h1>
          <p style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>
            Track money you give to family and others
          </p>
        </div>
        <button className="btn-primary btn" onClick={() => setShowModal(true)}>
          + Record Giving
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <select
          className="form-select"
          style={{ width: 120 }}
          value={filterYear}
          onChange={(e) => setFilterYear(Number(e.target.value))}
        >
          {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 1 + i).map((y) => <option key={y}>{y}</option>)}
        </select>
        <select
          className="form-select"
          style={{ width: 130 }}
          value={filterMonth}
          onChange={(e) => setFilterMonth(Number(e.target.value))}
        >
          <option value={0}>All months</option>
          {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <select
          className="form-select"
          style={{ width: 130 }}
          value={filterPerson}
          onChange={(e) => setFilterPerson(e.target.value)}
        >
          <option value="All">All people</option>
          {allPeople.map((p) => <option key={p}>{p}</option>)}
        </select>
      </div>

      {/* KPI cards — per person */}
      <div className="stat-rail" style={{ marginBottom: 24 }}>
        {personTotals.map(([name, total]) => (
          <div
            key={name}
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 14,
              padding: "16px 18px",
              cursor: "pointer",
            }}
            onClick={() => setFilterPerson(name === filterPerson ? "All" : name)}
          >
            <div style={{ fontSize: 11, color: "var(--text3)", fontWeight: 700, marginBottom: 4 }}>
              {name}
            </div>
            <div style={{ fontFamily: "DM Mono", fontSize: 20, color: "var(--accent2)" }}>
              KSh {total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
          </div>
        ))}

        {/* Grand total */}
        <div
          style={{
            background: "rgba(29,126,244,.06)",
            border: "1px solid rgba(29,126,244,.2)",
            borderRadius: 14,
            padding: "16px 18px",
          }}
        >
          <div style={{ fontSize: 11, color: "var(--text3)", fontWeight: 700, marginBottom: 4 }}>
            Total Given
          </div>
          <div style={{ fontFamily: "DM Mono", fontSize: 20, color: "var(--text)" }}>
            KSh {grandTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Monthly breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>
              Monthly Breakdown — {filterYear}
              {filterPerson !== "All" ? ` (${filterPerson})` : ""}
            </CardTitle>
          </CardHeader>
          <CardBody>
            {Object.keys(monthlyBreakdown).length === 0 ? (
              <div style={{ color: "var(--text3)", fontSize: 13, textAlign: "center", padding: 20 }}>
                No giving recorded for this period.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {MONTH_NAMES.filter((m) => monthlyBreakdown[m]).map((m) => {
                  const val = monthlyBreakdown[m] ?? 0;
                  const maxVal = Math.max(...Object.values(monthlyBreakdown));
                  return (
                    <div key={m} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 12, color: "var(--text3)", width: 28 }}>{m}</span>
                      <div
                        style={{
                          flex: 1,
                          height: 8,
                          background: "var(--surface2)",
                          borderRadius: 4,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${(val / maxVal) * 100}%`,
                            height: "100%",
                            background: "var(--accent)",
                            borderRadius: 4,
                          }}
                        />
                      </div>
                      <span style={{ fontFamily: "DM Mono", fontSize: 12, color: "var(--text2)", width: 80, textAlign: "right" }}>
                        KSh {val.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardBody>
        </Card>

        {/* Transaction log */}
        <Card>
          <CardHeader>
            <CardTitle>Giving Log</CardTitle>
          </CardHeader>
          <CardBody>
            {loading ? (
              <div style={{ color: "var(--text3)", fontSize: 13, textAlign: "center", padding: 20 }}>
                Loading…
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ color: "var(--text3)", fontSize: 13, textAlign: "center", padding: 20 }}>
                No records for this period.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 360, overflowY: "auto" }}>
                {filtered.map((r) => (
                  <div
                    key={r.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 14px",
                      background: "var(--surface2)",
                      borderRadius: 10,
                    }}
                  >
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                        {r.person}
                      </span>
                      {r.notes && (
                        <span style={{ fontSize: 11, color: "var(--text3)", marginLeft: 8 }}>
                          {r.notes}
                        </span>
                      )}
                      <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>
                        {r.given_date}
                      </div>
                    </div>
                    <span style={{ fontFamily: "DM Mono", fontSize: 13, color: "var(--accent2)" }}>
                      KSh {Number(r.amount).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Record Giving Modal */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title="Record Giving"
      >
        <div style={{ padding: "0 24px 24px" }}>
          <FormGrid cols={1}>
            <FormGroup label="Person">
              <select
                className="form-select"
                value={person}
                onChange={(e) => setPerson(e.target.value)}
              >
                <option value="" disabled>Select or add a person…</option>
                {allPeople.map((p) => <option key={p}>{p}</option>)}
                <option value="__custom__">Other (type name)…</option>
              </select>
            </FormGroup>

            {person === "__custom__" && (
              <FormGroup label="Name">
                <input
                  className="form-input"
                  placeholder="Enter person name"
                  value={customPerson}
                  onChange={(e) => setCustomPerson(e.target.value)}
                />
              </FormGroup>
            )}

            <FormGroup label="Amount (KSh)">
              <input
                className="form-input"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                autoFocus
              />
            </FormGroup>

            <FormGroup label="Date">
              <input
                className="form-input"
                type="date"
                value={givenDate}
                onChange={(e) => setGivenDate(e.target.value)}
              />
            </FormGroup>

            <FormGroup label="Notes (optional)">
              <input
                className="form-input"
                placeholder="e.g. Monthly upkeep, school fees…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </FormGroup>
          </FormGrid>

          <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
            <button
              className="btn-primary btn"
              style={{ flex: 1, justifyContent: "center" }}
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button className="btn-ghost btn" onClick={() => setShowModal(false)}>
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
