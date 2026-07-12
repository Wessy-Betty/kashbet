import { useState, useMemo } from "react";
import { Modal, FormGroup, FormGrid } from "@/components/ui";
import toast from "react-hot-toast";
import {
  useInvestmentAccounts,
  useInvestmentTransactions,
  useAddInvestmentTransaction,
  useAccounts,
  useUpdateAccountBalance,
  useAddAccount,
  useAddInvestmentAccount,
} from "@/hooks/useFinance";
import type { InvestmentAccount, InvestmentTxType } from "@/types/finance";

// ── Constants ──────────────────────────────────────────────────────────────────

const ACCOUNT_GROUPS: { key: string; label: string; icon: string; types: string[] }[] = [
  { key: "liquid",    label: "Liquid / Mobile Money", icon: "📱", types: ["checking", "cash"] },
  { key: "savings",   label: "Savings Accounts",      icon: "🏛️", types: ["savings"] },
  { key: "mmf",       label: "Money Market Funds",    icon: "📈", types: ["mmf"] },
  { key: "special_fund", label: "Special / Fixed Income Funds", icon: "💼", types: ["special_fund"] },
  { key: "sacco",     label: "SACCOs",                icon: "🏦", types: ["sacco"] },
  { key: "stocks",    label: "NSE Stocks",            icon: "📊", types: ["stocks", "nse"] },
  { key: "insurance", label: "Insurance / Bonds",     icon: "🛡️", types: ["insurance", "bond"] },
  { key: "other",     label: "Other",                 icon: "💰", types: ["other", "investment", "credit", "loan"] },
];

const TX_OPTIONS: { value: InvestmentTxType; label: string; hint: string }[] = [
  { value: "deposit",    label: "Deposit",    hint: "Money you put in"          },
  { value: "withdrawal", label: "Withdrawal", hint: "Money you took out"        },
  { value: "interest",   label: "Interest",   hint: "Interest earned (manual)"  },
  { value: "dividend",   label: "Dividend",   hint: "Dividend received"         },
  { value: "fee",        label: "Fee",        hint: "Management / transaction fee" },
];

// Every account type addable from the "Add Account" form. `investment: true`
// routes the insert to the investment_accounts table (MMF/SACCO/stocks) instead
// of the liquid `accounts` table; `rate: true` shows the annual-return field.
const ACCOUNT_TYPE_OPTIONS = [
  { value: "checking", label: "Mobile Money / Current Account (M-Pesa, KCB, Equity…)", investment: false, rate: false },
  { value: "savings",  label: "Savings Account",              investment: false, rate: false },
  { value: "cash",     label: "Cash in Hand",                 investment: false, rate: false },
  { value: "mmf",          label: "Money Market Fund (MMF)",          investment: true, rate: true },
  { value: "special_fund", label: "Special Fund / Fixed Income Fund", investment: true, rate: true },
  { value: "sacco",        label: "SACCO",                            investment: true, rate: true },
  { value: "stocks",   label: "NSE Stocks",                    investment: true,  rate: false },
  { value: "other",    label: "Other Investment / Stocks",     investment: true,  rate: false },
] as const;

const isInflow = (t: InvestmentTxType) =>
  ["deposit", "interest", "dividend"].includes(t);

const TX_COLOR = (t: InvestmentTxType) =>
  isInflow(t) ? "var(--green2)" : "var(--red2)";

function fmt(n: number | string | null | undefined) {
  return Number(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

// ── Component ──────────────────────────────────────────────────────────────────

export function Investments() {
  const { data: bankAccounts = [], isLoading: bankLoading } = useAccounts();
  const { data: investAccounts = [], isLoading: invLoading } = useInvestmentAccounts();
  const addTx = useAddInvestmentTransaction();
  const updateBalance = useUpdateAccountBalance();
  const addAccount = useAddAccount();
  const addInvestmentAccount = useAddInvestmentAccount();

  // Investment transaction modal
  const [modalAcc, setModalAcc] = useState<InvestmentAccount | null>(null);
  const [txType, setTxType]     = useState<InvestmentTxType>("deposit");
  const [amount, setAmount]     = useState("");
  const [txDate, setTxDate]     = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes]       = useState("");
  const [linkedAccountId, setLinkedAccountId] = useState("");

  // Selected investment account for tx log
  const [selectedInvId, setSelectedInvId] = useState<string | null>(null);
  const { data: txLog = [], isLoading: txLoading } = useInvestmentTransactions(selectedInvId);

  // Balance edit modal (for bank/liquid accounts)
  const [editBankAcc, setEditBankAcc] = useState<{ id: string; name: string; balance: number } | null>(null);
  const [editBalance, setEditBalance] = useState("");

  // Add account modal
  const [addAccOpen, setAddAccOpen] = useState(false);
  const [newAccName, setNewAccName]     = useState("");
  const [newAccType, setNewAccType]     = useState("checking");
  const [newAccBalance, setNewAccBalance] = useState("0");
  const [newAccInstitution, setNewAccInstitution] = useState("");
  const [newAccRate, setNewAccRate]     = useState("");

  // ── Computed totals ──────────────────────────────────────────────────────────

  const totals = useMemo(() => {
    const liquid = bankAccounts
      .filter((a) => ["checking", "cash"].includes(a.type))
      .reduce((s, a) => s + Number(a.balance ?? 0), 0);
    const savings = bankAccounts
      .filter((a) => a.type === "savings")
      .reduce((s, a) => s + Number(a.balance ?? 0), 0);
    const invested = investAccounts.reduce((s, a) => s + Number(a.balance ?? 0), 0);
    return { liquid, savings, invested, total: liquid + savings + invested };
  }, [bankAccounts, investAccounts]);

  // ── Group bank accounts by type ──────────────────────────────────────────────

  const groupedBankAccounts = useMemo(() => {
    const result: Record<string, typeof bankAccounts> = {};
    for (const grp of ACCOUNT_GROUPS.slice(0, 2)) {
      const matched = bankAccounts.filter((a) => grp.types.includes(a.type ?? "checking"));
      if (matched.length) result[grp.key] = matched;
    }
    return result;
  }, [bankAccounts]);

  // ── Group investment accounts by type ────────────────────────────────────────

  const groupedInvAccounts = useMemo(() => {
    const result: Record<string, InvestmentAccount[]> = {};
    for (const grp of ACCOUNT_GROUPS.slice(2)) {
      const matched = investAccounts.filter((a) => grp.types.includes(a.account_type));
      if (matched.length) result[grp.key] = matched;
    }
    return result;
  }, [investAccounts]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function openInvModal(acc: InvestmentAccount) {
    setModalAcc(acc);
    setTxType("deposit");
    setAmount("");
    setNotes("");
    setTxDate(new Date().toISOString().split("T")[0]);
    // Default to "no account link" — linking is an explicit choice, not a
    // silent default, since it deducts/credits real money from that account.
    setLinkedAccountId("");
  }

  async function handleSaveInvTx() {
    const amt = parseFloat(amount);
    if (!modalAcc) return;
    if (!amt || amt <= 0) { toast.error("Enter a valid amount"); return; }
    if (["withdrawal", "fee"].includes(txType) && amt > Number(modalAcc.balance)) {
      toast.error(`Insufficient balance — ${modalAcc.name} has KSh ${fmt(modalAcc.balance)}`);
      return;
    }
    const linksBankAccount = ["deposit", "withdrawal", "fee"].includes(txType);
    try {
      await addTx.mutateAsync({
        account_id: modalAcc.id,
        tx_type: txType,
        amount: amt,
        tx_date: txDate,
        notes: notes.trim() || undefined,
        linked_account_id: (linksBankAccount && linkedAccountId) ? linkedAccountId : undefined,
        account_name: modalAcc.name,
      });
      toast.success(`${TX_OPTIONS.find((o) => o.value === txType)?.label} saved`);
      setSelectedInvId(modalAcc.id);
      setModalAcc(null);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleSaveBalance() {
    if (!editBankAcc) return;
    const bal = parseFloat(editBalance);
    if (isNaN(bal)) { toast.error("Enter a valid number"); return; }
    try {
      await updateBalance.mutateAsync({ id: editBankAcc.id, balance: bal });
      toast.success("Balance updated");
      setEditBankAcc(null);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  const selectedAccType = ACCOUNT_TYPE_OPTIONS.find((t) => t.value === newAccType);

  async function handleAddAccount() {
    if (!newAccName.trim()) { toast.error("Enter an account name"); return; }
    const opt = ACCOUNT_TYPE_OPTIONS.find((t) => t.value === newAccType);
    try {
      if (opt?.investment) {
        await addInvestmentAccount.mutateAsync({
          name: newAccName.trim(),
          account_type: newAccType,
          institution: newAccInstitution.trim() || undefined,
          annual_rate: opt.rate ? (parseFloat(newAccRate) || 0) / 100 : 0,
          balance: parseFloat(newAccBalance) || 0,
          sort_order: investAccounts.length + 1,
        });
      } else {
        await addAccount.mutateAsync({
          name: newAccName.trim(),
          type: newAccType,
          balance: parseFloat(newAccBalance) || 0,
        });
      }
      toast.success("Account added");
      setAddAccOpen(false);
      setNewAccName(""); setNewAccType("checking"); setNewAccBalance("0");
      setNewAccInstitution(""); setNewAccRate("");
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  // ── Render helpers ────────────────────────────────────────────────────────────

  function BankCard({ acc }: { acc: typeof bankAccounts[0] }) {
    const grp = ACCOUNT_GROUPS.find((g) => g.types.includes(acc.type));
    return (
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: 18,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <span style={{ fontSize: 16 }}>{grp?.icon ?? "💳"}</span>{" "}
            <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>{acc.name}</span>
          </div>
          <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 7px", borderRadius: 6, background: "rgba(59,130,246,.12)", color: "var(--accent2)", textTransform: "uppercase" }}>
            {acc.type.replace("_", " ")}
          </span>
        </div>

        <div style={{ fontFamily: "DM Mono", fontSize: 22, color: "var(--green2)" }}>
          KSh {fmt(acc.balance)}
        </div>

        <button
          onClick={() => { setEditBankAcc({ id: acc.id, name: acc.name, balance: Number(acc.balance) }); setEditBalance(String(acc.balance ?? 0)); }}
          style={{
            width: "100%",
            background: "var(--surface2)",
            border: "1px solid var(--border2)",
            borderRadius: 9,
            padding: "8px 12px",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 600,
            color: "var(--text2)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border2)")}
        >
          ✏️ Update Balance
        </button>
      </div>
    );
  }

  function InvCard({ acc }: { acc: InvestmentAccount }) {
    const isSelected = selectedInvId === acc.id;
    return (
      <div
        onClick={() => setSelectedInvId(isSelected ? null : acc.id)}
        style={{
          background: isSelected ? "var(--surface2)" : "var(--surface)",
          border: `1px solid ${isSelected ? "var(--accent)" : "var(--border)"}`,
          borderRadius: 14,
          padding: 18,
          cursor: "pointer",
          transition: "all var(--transition)",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>{acc.name}</span>
            <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>{acc.institution}</div>
          </div>
          <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 7px", borderRadius: 6, background: "rgba(16,185,129,.12)", color: "var(--green2)", textTransform: "uppercase" }}>
            {acc.account_type}
          </span>
        </div>

        <div style={{ fontFamily: "DM Mono", fontSize: 22, color: "var(--green2)" }}>
          KSh {fmt(acc.balance)}
        </div>

        {acc.annual_rate > 0 && (
          <div style={{ fontSize: 11, color: "var(--text3)" }}>
            {(acc.annual_rate * 100).toFixed(0)}% p.a. indicative
          </div>
        )}

        <button
          className="btn-primary btn"
          style={{ width: "100%", justifyContent: "center", fontSize: 12 }}
          onClick={(e) => { e.stopPropagation(); openInvModal(acc); }}
        >
          + Record Transaction
        </button>
      </div>
    );
  }

  function SectionHeader({ icon, label, subtotal }: { icon: string; label: string; subtotal: number }) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>{icon}</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text2)" }}>{label}</span>
        </div>
        <span style={{ fontFamily: "DM Mono", fontSize: 13, color: "var(--text3)" }}>
          KSh {fmt(subtotal)}
        </span>
      </div>
    );
  }

  if (bankLoading || invLoading) {
    return <div style={{ color: "var(--text3)", padding: 40, textAlign: "center" }}>Loading accounts…</div>;
  }

  // ── JSX ───────────────────────────────────────────────────────────────────────

  return (
    <div className="page-enter">
      <div className="page-header">
        <div>
          <h1 className="page-title">All Accounts</h1>
          <p style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>
            {bankAccounts.length + investAccounts.length} accounts across liquid, bank, MMF, SACCO &amp; stocks
          </p>
        </div>
        <button className="btn-primary btn" onClick={() => setAddAccOpen(true)}>
          + Add Account
        </button>
      </div>

      {/* ── Net worth summary bar ───────────────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr 1fr 1fr",
          gap: 1,
          background: "linear-gradient(135deg,rgba(59,130,246,.08),rgba(16,185,129,.08))",
          border: "1px solid rgba(59,130,246,.2)",
          borderRadius: 16,
          marginBottom: 28,
          overflow: "hidden",
        }}
      >
        {[
          { label: "Total Net Worth", val: totals.total, col: "var(--green2)", big: true },
          { label: "Liquid (M-Pesa/Cash)", val: totals.liquid, col: "var(--accent2)", big: false },
          { label: "Savings Accounts", val: totals.savings, col: "var(--text)", big: false },
          { label: "Investments", val: totals.invested, col: "#a78bfa", big: false },
        ].map((item, i) => (
          <div key={i} style={{ padding: "20px 24px", borderRight: i < 3 ? "1px solid rgba(59,130,246,.15)" : "none" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text3)", textTransform: "uppercase", marginBottom: 6 }}>
              {item.label}
            </div>
            <div style={{ fontFamily: "DM Mono", fontSize: item.big ? 28 : 18, color: item.col }}>
              KSh {fmt(item.val)}
            </div>
          </div>
        ))}
      </div>

      {/* ── Liquid accounts ─────────────────────────────────────────────────── */}
      {groupedBankAccounts["liquid"] && (
        <section style={{ marginBottom: 32 }}>
          <SectionHeader
            icon="📱"
            label="Liquid / Mobile Money"
            subtotal={groupedBankAccounts["liquid"].reduce((s, a) => s + Number(a.balance ?? 0), 0)}
          />
          <div className="card-rail">
            {groupedBankAccounts["liquid"].map((acc) => <BankCard key={acc.id} acc={acc} />)}
          </div>
        </section>
      )}

      {/* ── Bank accounts ───────────────────────────────────────────────────── */}
      {groupedBankAccounts["savings"] && (
        <section style={{ marginBottom: 32 }}>
          <SectionHeader
            icon="🏛️"
            label="Savings Accounts"
            subtotal={groupedBankAccounts["savings"].reduce((s, a) => s + Number(a.balance ?? 0), 0)}
          />
          <div className="card-rail">
            {groupedBankAccounts["savings"].map((acc) => <BankCard key={acc.id} acc={acc} />)}
          </div>
        </section>
      )}

      {/* ── Investment account groups ───────────────────────────────────────── */}
      {ACCOUNT_GROUPS.slice(2).map((grp) => {
        const accs = groupedInvAccounts[grp.key];
        if (!accs?.length) return null;
        const subtotal = accs.reduce((s, a) => s + Number(a.balance ?? 0), 0);
        return (
          <section key={grp.key} style={{ marginBottom: 32 }}>
            <SectionHeader icon={grp.icon} label={grp.label} subtotal={subtotal} />
            <div className="card-rail">
              {accs.map((acc) => <InvCard key={acc.id} acc={acc} />)}
            </div>
          </section>
        );
      })}

      {/* ── Transaction log for selected investment account ─────────────────── */}
      {selectedInvId && (
        <section>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text2)" }}>
              Transaction Log — {investAccounts.find((a) => a.id === selectedInvId)?.name}
            </span>
            <button
              onClick={() => setSelectedInvId(null)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text3)", fontSize: 18 }}
            >
              ×
            </button>
          </div>
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 14,
              overflow: "hidden",
            }}
          >
            {txLoading ? (
              <div style={{ padding: 20, color: "var(--text3)", textAlign: "center", fontSize: 13 }}>Loading…</div>
            ) : txLog.length === 0 ? (
              <div style={{ padding: 20, color: "var(--text3)", textAlign: "center", fontSize: 13 }}>
                No transactions yet — record one above.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {txLog.map((tx, i) => {
                  const type = tx.tx_type as InvestmentTxType;
                  const opt = TX_OPTIONS.find((o) => o.value === type);
                  return (
                    <div
                      key={tx.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "12px 18px",
                        borderBottom: i < txLog.length - 1 ? "1px solid var(--border)" : "none",
                      }}
                    >
                      <div>
                        <span style={{ fontSize: 13, fontWeight: 600, color: TX_COLOR(type) }}>{opt?.label ?? type}</span>
                        {tx.notes && <span style={{ fontSize: 12, color: "var(--text3)", marginLeft: 8 }}>{tx.notes}</span>}
                        <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>{tx.tx_date}</div>
                      </div>
                      <span style={{ fontFamily: "DM Mono", fontSize: 13, color: TX_COLOR(type) }}>
                        {isInflow(type) ? "+" : "−"} KSh {fmt(tx.amount)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Record Investment Transaction Modal ─────────────────────────────── */}
      <Modal open={!!modalAcc} onClose={() => setModalAcc(null)} title={`Record Transaction — ${modalAcc?.name ?? ""}`}>
        <div style={{ padding: "0 24px 24px" }}>
          <FormGrid cols={1}>
            <FormGroup label="Transaction Type">
              <select className="form-select" value={txType} onChange={(e) => setTxType(e.target.value as InvestmentTxType)}>
                {TX_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label} — {o.hint}</option>
                ))}
              </select>
            </FormGroup>

            <FormGroup label="Amount (KSh)">
              <input className="form-input" type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
            </FormGroup>

            <FormGroup label="Date">
              <input className="form-input" type="date" value={txDate} onChange={(e) => setTxDate(e.target.value)} />
            </FormGroup>

            {["deposit", "withdrawal", "fee"].includes(txType) && bankAccounts.length > 0 && (
              <FormGroup label={txType === "withdrawal" ? "Credit to Account" : "Deduct from Account"}>
                <select className="form-select" value={linkedAccountId} onChange={(e) => setLinkedAccountId(e.target.value)}>
                  <option value="">None (manual / no account link)</option>
                  {bankAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name} · KSh {fmt(a.balance)}</option>
                  ))}
                </select>
              </FormGroup>
            )}

            <FormGroup label="Notes (optional)">
              <input
                className="form-input"
                placeholder={txType === "interest" ? "e.g. June interest credit" : txType === "withdrawal" ? "e.g. Partial withdrawal" : "e.g. Monthly top-up"}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </FormGroup>
          </FormGrid>

          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button className="btn-primary btn" style={{ flex: 1, justifyContent: "center" }} onClick={handleSaveInvTx} disabled={addTx.isPending}>
              {addTx.isPending ? "Saving…" : "Save"}
            </button>
            <button className="btn-ghost btn" onClick={() => setModalAcc(null)}>Cancel</button>
          </div>
        </div>
      </Modal>

      {/* ── Update Bank Balance Modal ────────────────────────────────────────── */}
      <Modal open={!!editBankAcc} onClose={() => setEditBankAcc(null)} title={`Update Balance — ${editBankAcc?.name ?? ""}`}>
        <div style={{ padding: "0 24px 24px" }}>
          <p style={{ fontSize: 13, color: "var(--text3)", marginBottom: 16, lineHeight: 1.6 }}>
            Enter the current balance shown on your phone or bank statement. This overwrites the stored balance and is useful for periodic reconciliation.
          </p>
          <FormGrid cols={1}>
            <FormGroup label="Current Balance (KSh)">
              <input className="form-input" type="number" inputMode="decimal" min="0" step="0.01" value={editBalance} onChange={(e) => setEditBalance(e.target.value)} autoFocus />
            </FormGroup>
          </FormGrid>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button className="btn-primary btn" style={{ flex: 1, justifyContent: "center" }} onClick={handleSaveBalance} disabled={updateBalance.isPending}>
              {updateBalance.isPending ? "Saving…" : "Update Balance"}
            </button>
            <button className="btn-ghost btn" onClick={() => setEditBankAcc(null)}>Cancel</button>
          </div>
        </div>
      </Modal>

      {/* ── Add Account Modal ────────────────────────────────────────────────── */}
      <Modal open={addAccOpen} onClose={() => setAddAccOpen(false)} title="Add Account">
        <div style={{ padding: "0 24px 24px" }}>
          <FormGrid cols={1}>
            <FormGroup label="Account Name">
              <input className="form-input" placeholder="e.g. M-Pesa, Equity Bank, Cash in Wallet" value={newAccName} onChange={(e) => setNewAccName(e.target.value)} autoFocus />
            </FormGroup>
            <FormGroup label="Account Type">
              <select className="form-select" value={newAccType} onChange={(e) => setNewAccType(e.target.value)}>
                {ACCOUNT_TYPE_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </FormGroup>
            {selectedAccType?.investment && (
              <FormGroup label="Institution (optional)">
                <input className="form-input" placeholder="e.g. Ziidi, Stima Sacco, NSE" value={newAccInstitution} onChange={(e) => setNewAccInstitution(e.target.value)} />
              </FormGroup>
            )}
            {selectedAccType?.rate && (
              <FormGroup label="Expected annual return (%) — optional">
                <input className="form-input" type="number" inputMode="decimal" min="0" step="0.01" placeholder="e.g. 12" value={newAccRate} onChange={(e) => setNewAccRate(e.target.value)} />
              </FormGroup>
            )}
            <FormGroup label={selectedAccType?.investment ? "Current Balance (KSh)" : "Opening Balance (KSh)"}>
              <input className="form-input" type="number" inputMode="decimal" min="0" step="0.01" value={newAccBalance} onChange={(e) => setNewAccBalance(e.target.value)} />
            </FormGroup>
          </FormGrid>
          <p style={{ fontSize: 12, color: "var(--text3)", marginBottom: 12, lineHeight: 1.6 }}>
            {selectedAccType?.investment
              ? "Balances update automatically as you record deposits, withdrawals, interest and dividends on the account."
              : "Add cash, M-Pesa, bank and savings accounts here. Switch the type above to add an MMF, SACCO or stock."}
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn-primary btn" style={{ flex: 1, justifyContent: "center" }} onClick={handleAddAccount} disabled={addAccount.isPending || addInvestmentAccount.isPending}>
              {addAccount.isPending || addInvestmentAccount.isPending ? "Adding…" : "Add Account"}
            </button>
            <button className="btn-ghost btn" onClick={() => setAddAccOpen(false)}>Cancel</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
