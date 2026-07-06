// ─── Transactions Page ──────────────────────────────────────────────────────────
import { useState, useMemo } from "react";
import { useTransactions, useDeleteTransaction, useCategories } from "@/hooks/useFinance";
import { useAppStore } from "@/store/appStore";
import { Card, Modal } from "@/components/ui";
import { AddTransactionModal } from "@/components/AddTransactionModal";
import { isoToDisplay } from "@/lib/utils";
import { CONFIG } from "@/config";
import { DEMO_TRANSACTIONS} from "@/data/demoData";
import type { Transaction } from "@/types/finance";

const CLF_BADGE: Record<string, { bg: string; color: string }> = {
  need: { bg: "rgba(16,185,129,.12)", color: "#34d399" },
  want: { bg: "rgba(245,158,11,.12)", color: "#fbbf24" },
  investment: { bg: "rgba(139,92,246,.12)", color: "#a78bfa" },
  transfer: { bg: "rgba(6,182,212,.12)", color: "#22d3ee" },
};

// Never leave the Category column blank. Fall back to a sensible label
// derived from the transaction's shape when no category is assigned.
function categoryLabel(t: Transaction): string {
  if (t.category_name) return t.category_name;
  if (t.classification === "transfer") {
    return t.amount >= 0 ? "Transfer In" : "Transfer Out";
  }
  if (t.amount > 0) return "Income";
  return "Uncategorized";
}

export function Transactions() {
  const { currentYear, currentMonth, formatCurrency } = useAppStore();
  const { data: dbTxs } = useTransactions(currentYear, currentMonth);
  const { data: allCategories = [] } = useCategories();
  const deleteTx = useDeleteTransaction();

  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<Transaction | null>(null);
  const [filterCat, setFilterCat] = useState("");
  const [filterType, setFilterType] = useState("");
  const [search, setSearch] = useState("");

  const txs: Transaction[] = CONFIG.DEMO_MODE && (!dbTxs || dbTxs.length === 0)
    ? DEMO_TRANSACTIONS : (dbTxs ?? []);

  const filtered = useMemo(() => {
    return txs.filter((t) => {
      const matchesCat = !filterCat || t.category_name === filterCat;
      const matchesType = !filterType || t.classification === filterType;
      const matchesSearch = !search || t.description.toLowerCase().includes(search.toLowerCase());
      return matchesCat && matchesType && matchesSearch;
    });
  }, [txs, filterCat, filterType, search]);

  const stats = useMemo(() => {
    const income = filtered.filter(t => t.amount > 0).reduce((sum, t) => sum + t.amount, 0);
    const expenses = filtered.filter(t => t.amount < 0).reduce((sum, t) => sum + Math.abs(t.amount), 0);
    return { income, expenses, net: income - expenses };
  }, [filtered]);

  return (
    <div className="page-enter" style={{ width: "100%", padding: "0 24px", boxSizing: "border-box" }}>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, width: "100%" }}>
        <div>
          <h1 className="page-title">Transactions</h1>
          <p style={{ fontSize: 12, color: "var(--text3)" }}>
            {new Date(currentYear, currentMonth - 1).toLocaleString('default', { month: 'long' })} {currentYear} • {txs.length} records
          </p>
        </div>
        <button className="btn-primary btn" onClick={() => setModalOpen(true)}>+ Add Transaction</button>
      </div>

      {/* Summary Row - Full Width Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 24, width: "100%" }}>
        {[
          { label: "Money In", val: stats.income, color: "var(--green2)" },
          { label: "Money Out", val: stats.expenses, color: "var(--text)" },
          { label: "Net Growth", val: stats.net, color: "var(--accent2)" }
        ].map((item, idx) => (
          <div key={idx} style={{ background: 'var(--surface)', padding: '20px', borderRadius: 12, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 8, letterSpacing: '1px' }}>{item.label}</div>
            <div style={{ fontSize: 22, fontWeight: 600, color: item.color, fontFamily: 'DM Mono' }}>{formatCurrency(item.val)}</div>
          </div>
        ))}
      </div>

      {/* Filters bar expanded */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, width: "100%" }}>
        <input className="form-input" style={{ flex: 1 }} placeholder="Search transactions..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="form-select" style={{ width: 180 }} value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
          <option value="">All Categories</option>
          {allCategories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
        <select className="form-select" style={{ width: 140 }} value={filterType} onChange={(e) => setFilterType(e.target.value)}>
          <option value="">All Types</option>
          <option value="need">Need</option>
          <option value="want">Want</option>
          <option value="investment">Investment</option>
          <option value="transfer">Transfer</option>
        </select>
      </div>

      {/* Table - Set to full width */}
      <Card style={{ padding: 0, overflow: 'hidden', width: "100%" }}>
        <div style={{ overflowX: "auto" }}>
          <table className="tx-table" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border)' }}>
                {["Date", "Description", "Category", "Type", "Method", "Amount", ""].map(h => (
                  <th key={h} style={{ textAlign: h === 'Amount' ? 'right' : 'left', padding: '14px 20px', fontSize: 10, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => {
                const clf = CLF_BADGE[t.classification ?? "need"];
                const isPositive = t.amount >= 0;
                return (
                  <tr key={t.id} className="hover-row" onClick={() => setSelected(t)} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' }}>
                    <td data-label="Date" style={{ padding: '16px 20px', fontSize: 12, color: 'var(--text3)', whiteSpace: 'nowrap' }}>{isoToDisplay(t.transaction_date)}</td>
                    <td className="tx-desc" style={{ padding: '16px 20px' }}>
                      <div style={{ fontWeight: 600, color: "var(--text)", fontSize: 13 }}>{t.description}</div>
                      {(t.product_name || t.subcategory_name) && (
                        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                          {[t.subcategory_name, t.product_name].filter(Boolean).join(" · ")}
                        </div>
                      )}
                      {t.ai_classified && <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>🪄 AI classified</div>}
                    </td>
                    <td data-label="Category" style={{ padding: '16px 20px', color: t.category_name ? 'var(--text2)' : 'var(--text3)', fontSize: 12 }}>{categoryLabel(t)}</td>
                    <td data-label="Type" style={{ padding: '16px 20px' }}>
                      <span style={{ padding: '4px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, background: clf.bg, color: clf.color, textTransform: 'uppercase' }}>
                        {t.classification}
                      </span>
                    </td>
                    <td data-label="Method" style={{ padding: '16px 20px', color: 'var(--text3)', fontSize: 12 }}>{t.payment_method}</td>
                    <td data-label="Amount" className="tx-amount" style={{ padding: '16px 20px', textAlign: 'right', fontFamily: 'DM Mono', fontSize: 14, color: isPositive ? 'var(--green2)' : 'var(--text)' }}>
                      {isPositive ? '+' : ''}{formatCurrency(t.amount)}
                    </td>
                    <td className="tx-actions" style={{ padding: '16px 20px', textAlign: 'right' }}>
                      <button onClick={(e) => { e.stopPropagation(); deleteTx.mutate(t.id); }} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: '4px 8px' }}>✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <AddTransactionModal open={modalOpen} onClose={() => setModalOpen(false)} />

      <Modal open={!!selected} onClose={() => setSelected(null)} title="Transaction Details">
        {selected && (
          <div>
            {/* Amount banner */}
            <div style={{ textAlign: 'center', padding: '16px 0 20px' }}>
              <div style={{ fontFamily: 'DM Mono', fontSize: 30, fontWeight: 600, color: selected.amount >= 0 ? 'var(--green2)' : 'var(--text)' }}>
                {selected.amount >= 0 ? '+' : ''}{formatCurrency(selected.amount)}
              </div>
              <div style={{ fontSize: 14, color: 'var(--text2)', marginTop: 4 }}>{selected.description}</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              <DetailRow label="Date" value={isoToDisplay(selected.transaction_date)} />
              <DetailRow label="Type" value={selected.type} capitalize />
              <DetailRow label="Category" value={categoryLabel(selected)} />
              <DetailRow label="Subcategory" value={selected.subcategory_name || "—"} />
              <DetailRow label="Product" value={selected.product_name || "—"} />
              <DetailRow label="Classification" value={selected.classification || "—"} capitalize />
              <DetailRow label="Payment Method" value={selected.payment_method || "—"} />
              <DetailRow label="Account" value={selected.account_name || "Not linked"} />
              {!!selected.transaction_cost && selected.transaction_cost > 0 && (
                <DetailRow label="Transaction Cost" value={formatCurrency(selected.transaction_cost)} />
              )}
              {selected.notes && <DetailRow label="Notes" value={selected.notes} full />}
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button
                className="btn-ghost btn"
                style={{ flex: 1, justifyContent: 'center', color: 'var(--red2)' }}
                onClick={() => { deleteTx.mutate(selected.id); setSelected(null); }}
              >
                Delete Transaction
              </button>
              <button className="btn-primary btn" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setSelected(null)}>
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function DetailRow({ label, value, capitalize, full }: { label: string; value: string; capitalize?: boolean; full?: boolean }) {
  return (
    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', gridColumn: full ? '1 / -1' : 'auto' }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text3)', letterSpacing: '0.5px', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--text)', textTransform: capitalize ? 'capitalize' : 'none', wordBreak: 'break-word' }}>{value}</div>
    </div>
  );
}