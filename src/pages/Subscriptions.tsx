import { useState, useMemo } from "react";
import {
  Card, CardHeader, CardTitle, CardBody,
  Modal, FormGroup, FormGrid,
} from "@/components/ui";
import toast from "react-hot-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

type BillingCycle = "monthly" | "annual" | "weekly";

interface Subscription {
  id: string;
  name: string;
  amount: number;
  billing_cycle: BillingCycle;
  next_due_date: string | null;
  category: string;
  notes: string | null;
  is_active: boolean;
}

const CYCLE_LABELS: Record<BillingCycle, string> = {
  monthly: "Monthly",
  annual: "Annual",
  weekly: "Weekly",
};

function toMonthly(amount: number, cycle: BillingCycle): number {
  if (cycle === "annual") return amount / 12;
  if (cycle === "weekly") return amount * 4.33;
  return amount;
}

const EMPTY_FORM = {
  name: "",
  amount: "",
  billing_cycle: "monthly" as BillingCycle,
  next_due_date: "",
  category: "Subscriptions",
  notes: "",
};

export function Subscriptions() {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState<string | null>(null);

  const { data: subs = [], isLoading } = useQuery({
    queryKey: ["subscriptions"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", user.id)
        .order("name");
      if (error) throw new Error(error.message);
      return (data ?? []) as Subscription[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not logged in");
      const amt = parseFloat(form.amount);
      if (!form.name.trim()) throw new Error("Name is required");
      if (!amt || amt <= 0) throw new Error("Enter a valid amount");

      const payload = {
        user_id: user.id,
        name: form.name.trim(),
        amount: amt,
        billing_cycle: form.billing_cycle,
        next_due_date: form.next_due_date || null,
        category: form.category,
        notes: form.notes.trim() || null,
        is_active: true,
      };

      if (editId) {
        const { error } = await supabase.from("subscriptions").update(payload).eq("id", editId);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("subscriptions").insert([payload]);
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      toast.success(editId ? "Subscription updated" : "Subscription added");
      setModalOpen(false);
      setForm(EMPTY_FORM);
      setEditId(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("subscriptions").update({ is_active }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["subscriptions"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("subscriptions").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      toast.success("Deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });

  function openEdit(sub: Subscription) {
    setForm({
      name: sub.name,
      amount: String(sub.amount),
      billing_cycle: sub.billing_cycle,
      next_due_date: sub.next_due_date ?? "",
      category: sub.category,
      notes: sub.notes ?? "",
    });
    setEditId(sub.id);
    setModalOpen(true);
  }

  function openNew() {
    setForm(EMPTY_FORM);
    setEditId(null);
    setModalOpen(true);
  }

  const { totalMonthly, active, inactive } = useMemo(() => {
    const active = subs.filter((s) => s.is_active);
    const inactive = subs.filter((s) => !s.is_active);
    const totalMonthly = active.reduce((sum, s) => sum + toMonthly(s.amount, s.billing_cycle), 0);
    return { totalMonthly, active, inactive };
  }, [subs]);

  const isDueSoon = (dateStr: string | null) => {
    if (!dateStr) return false;
    const due = new Date(dateStr);
    const diff = (due.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 7;
  };

  if (isLoading) return (
    <div className="page-enter" style={{ color: "var(--text3)", padding: 40, textAlign: "center" }}>
      Loading subscriptions…
    </div>
  );

  return (
    <div className="page-enter">
      <div className="page-header">
        <div>
          <h1 className="page-title">Subscriptions</h1>
          <p style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>
            Recurring bills and services
          </p>
        </div>
        <button className="btn-primary btn" onClick={openNew}>+ Add Subscription</button>
      </div>

      {/* Summary bar */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginBottom: 24,
      }}>
        {[
          { label: "Monthly Cost", value: `KSh ${Math.round(totalMonthly).toLocaleString()}`, color: "var(--red2)" },
          { label: "Annual Cost", value: `KSh ${Math.round(totalMonthly * 12).toLocaleString()}`, color: "var(--amber2)" },
          { label: "Active / Total", value: `${active.length} / ${subs.length}`, color: "var(--green2)" },
        ].map((kpi) => (
          <div key={kpi.label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "1px", color: "var(--text3)", marginBottom: 8 }}>{kpi.label}</div>
            <div style={{ fontFamily: "DM Mono", fontSize: 22, color: kpi.color }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Active subscriptions */}
      <Card style={{ marginBottom: 20 }}>
        <CardHeader>
          <CardTitle>Active ({active.length})</CardTitle>
        </CardHeader>
        <CardBody>
          {active.length === 0 ? (
            <div style={{ color: "var(--text3)", fontSize: 13, textAlign: "center", padding: "20px 0" }}>
              No active subscriptions. Add one to get started.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {active.map((sub) => {
                const monthly = toMonthly(sub.amount, sub.billing_cycle);
                const dueSoon = isDueSoon(sub.next_due_date);
                return (
                  <div key={sub.id} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "14px 16px", background: "var(--surface2)", borderRadius: 12,
                    border: dueSoon ? "1px solid var(--amber2)" : "1px solid var(--border)",
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: 14 }}>{sub.name}</span>
                        {dueSoon && (
                          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "rgba(245,158,11,.15)", color: "var(--amber2)" }}>
                            DUE SOON
                          </span>
                        )}
                        <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "var(--surface)", color: "var(--text3)", border: "1px solid var(--border)" }}>
                          {CYCLE_LABELS[sub.billing_cycle]}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 3 }}>
                        {sub.category}
                        {sub.next_due_date && ` · Next: ${sub.next_due_date}`}
                        {sub.notes && ` · ${sub.notes}`}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontFamily: "DM Mono", fontSize: 15, fontWeight: 600 }}>
                          KSh {Number(sub.amount).toLocaleString()}
                        </div>
                        {sub.billing_cycle !== "monthly" && (
                          <div style={{ fontSize: 11, color: "var(--text3)" }}>
                            ≈ KSh {Math.round(monthly).toLocaleString()}/mo
                          </div>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="btn-ghost btn" style={{ fontSize: 11, padding: "4px 10px" }} onClick={() => openEdit(sub)}>Edit</button>
                        <button className="btn-ghost btn" style={{ fontSize: 11, padding: "4px 10px" }} onClick={() => toggleMutation.mutate({ id: sub.id, is_active: false })}>Pause</button>
                        <button className="btn-ghost btn" style={{ fontSize: 11, padding: "4px 10px", color: "var(--red2)" }} onClick={() => { if (confirm(`Delete "${sub.name}"?`)) deleteMutation.mutate(sub.id); }}>✕</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Inactive / paused */}
      {inactive.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Paused ({inactive.length})</CardTitle>
          </CardHeader>
          <CardBody>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {inactive.map((sub) => (
                <div key={sub.id} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "12px 16px", background: "var(--surface2)", borderRadius: 12,
                  border: "1px solid var(--border)", opacity: 0.6,
                }}>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{sub.name}</span>
                    <span style={{ fontSize: 11, color: "var(--text3)", marginLeft: 8 }}>{sub.category}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontFamily: "DM Mono", fontSize: 13 }}>KSh {Number(sub.amount).toLocaleString()}</span>
                    <button className="btn-ghost btn" style={{ fontSize: 11, padding: "4px 10px" }} onClick={() => toggleMutation.mutate({ id: sub.id, is_active: true })}>Resume</button>
                    <button className="btn-ghost btn" style={{ fontSize: 11, padding: "4px 10px", color: "var(--red2)" }} onClick={() => { if (confirm(`Delete "${sub.name}"?`)) deleteMutation.mutate(sub.id); }}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Add / Edit modal */}
      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setEditId(null); setForm(EMPTY_FORM); }} title={editId ? "Edit Subscription" : "Add Subscription"}>
        <div style={{ padding: "0 24px 24px" }}>
          <FormGrid cols={1}>
            <FormGroup label="Name">
              <input className="form-input" placeholder="e.g. Netflix, Gym, Spotify" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
            </FormGroup>

            <FormGrid>
              <FormGroup label="Amount (KSh)">
                <input className="form-input" type="number" min="0" step="1" placeholder="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </FormGroup>
              <FormGroup label="Billing Cycle">
                <select className="form-select" value={form.billing_cycle} onChange={(e) => setForm({ ...form, billing_cycle: e.target.value as BillingCycle })}>
                  <option value="monthly">Monthly</option>
                  <option value="annual">Annual</option>
                  <option value="weekly">Weekly</option>
                </select>
              </FormGroup>
            </FormGrid>

            <FormGroup label="Next Due Date (optional)">
              <input className="form-input" type="date" value={form.next_due_date} onChange={(e) => setForm({ ...form, next_due_date: e.target.value })} />
            </FormGroup>

            <FormGroup label="Category">
              <select className="form-select" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option>Subscriptions</option>
                <option>Utilities</option>
                <option>Entertainment</option>
                <option>Health & Medical</option>
                <option>Education</option>
                <option>Other</option>
              </select>
            </FormGroup>

            <FormGroup label="Notes (optional)">
              <input className="form-input" placeholder="e.g. family plan, shared with partner" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </FormGroup>
          </FormGrid>

          <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
            <button className="btn-primary btn" style={{ flex: 1, justifyContent: "center" }} onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving…" : editId ? "Update" : "Add"}
            </button>
            <button className="btn-ghost btn" onClick={() => { setModalOpen(false); setEditId(null); setForm(EMPTY_FORM); }}>Cancel</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
