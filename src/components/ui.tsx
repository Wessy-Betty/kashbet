// ─────────────────────────────────────────────
//  KashBet — Shared UI Components
// ─────────────────────────────────────────────
import { useState, useEffect, useRef } from "react";
import { useAppStore } from "@/store/appStore";
import type { Classification, AlertSeverity } from "@/types";
import {
  CLASSIFICATION_COLORS,
  CLASSIFICATION_LABELS,
  STATUS_COLORS,
} from "@/lib/utils";

// ── Card ─────────────────────────────────────
interface CardProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}
export function Card({ children, className = "", style }: CardProps) {
  return (
    <div className={`card ${className}`} style={style}>
      {children}
    </div>
  );
}

export function CardHeader({ children, style }: CardProps) {
  return (
    <div
      style={{
        padding: "18px 20px 0",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.8px",
        textTransform: "uppercase",
        color: "var(--text3)",
      }}
    >
      {children}
    </span>
  );
}

export function CardBody({ children, style }: CardProps) {
  return <div style={{ padding: "16px 20px 20px", ...style }}>{children}</div>;
}

// ── KPI Card ──────────────────────────────────
type KpiColor = "blue" | "green" | "amber" | "red" | "purple" | "cyan";
const KPI_COLORS: Record<KpiColor, string> = {
  blue: "#3b82f6",
  green: "#10b981",
  amber: "#f59e0b",
  red: "#ef4444",
  purple: "#8b5cf6",
  cyan: "#06b6d4",
};

interface KpiCardProps {
  label: string;
  value: string;
  change?: string;
  changeDir?: "up" | "down" | "neutral";
  icon?: string;
  color?: KpiColor;
}
export function KpiCard({
  label,
  value,
  change,
  changeDir = "neutral",
  icon,
  color = "blue",
}: KpiCardProps) {
  const c = KPI_COLORS[color];
  return (
    <div
      className="kpi-card"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 16,
        padding: 20,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -20,
          right: -20,
          width: 80,
          height: 80,
          borderRadius: "50%",
          background: c,
          opacity: 0.06,
        }}
      />
      {icon && (
        <div
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            fontSize: 20,
            opacity: 0.4,
          }}
        >
          {icon}
        </div>
      )}
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "1px",
          textTransform: "uppercase",
          color: "var(--text3)",
          marginBottom: 10,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "DM Mono,monospace",
          fontSize: 26,
          fontWeight: 500,
          color: "var(--text)",
          letterSpacing: "-0.5px",
          lineHeight: 1,
          marginBottom: 10,
        }}
      >
        {value}
      </div>
      {change && (
        <div
          style={{
            fontSize: 12,
            fontWeight: 500,
            color:
              changeDir === "up"
                ? "var(--green2)"
                : changeDir === "down"
                  ? "var(--red2)"
                  : "var(--text3)",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          {change}
        </div>
      )}
    </div>
  );
}

// ── Badge ─────────────────────────────────────
export function ClassificationBadge({ value }: { value: Classification }) {
  return (
    <span
      className="badge"
      style={{
        background: CLASSIFICATION_COLORS[value]
          .split(" ")[1]
          ?.replace("bg-", ""),
      }}
    >
      <span className={CLASSIFICATION_COLORS[value].split(" ")[0]}>
        {CLASSIFICATION_LABELS[value]}
      </span>
    </span>
  );
}

// ── Alert Item ────────────────────────────────
interface AlertItemProps {
  severity: AlertSeverity;
  message: string;
  onDismiss?: () => void;
}
const ALERT_STYLES: Record<
  AlertSeverity,
  { bg: string; border: string; icon: string }
> = {
  critical: { bg: "rgba(239,68,68,.08)", border: "var(--red)", icon: "🔴" },
  warning: { bg: "rgba(245,158,11,.08)", border: "var(--amber)", icon: "🟡" },
  info: { bg: "rgba(59,130,246,.08)", border: "var(--accent)", icon: "🔵" },
};
export function AlertItem({ severity, message, onDismiss }: AlertItemProps) {
  const s = ALERT_STYLES[severity];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "12px 14px",
        borderRadius: 10,
        fontSize: 13,
        lineHeight: 1.5,
        background: s.bg,
        borderLeft: `3px solid ${s.border}`,
      }}
    >
      <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>
        {s.icon}
      </span>
      <span
        style={{ flex: 1, color: "var(--text2)" }}
        dangerouslySetInnerHTML={{ __html: message }}
      />
      {onDismiss && (
        <button
          onClick={onDismiss}
          style={{
            background: "none",
            border: "none",
            color: "var(--text3)",
            cursor: "pointer",
            fontSize: 12,
            padding: "0 4px",
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
}

// ── Progress Bar ──────────────────────────────
interface ProgressBarProps {
  pct: number;
  color?: string;
  height?: number;
}
export function ProgressBar({
  pct,
  color = "linear-gradient(90deg,#3b82f6,#8b5cf6)",
  height = 6,
}: ProgressBarProps) {
  return (
    <div className="progress-bar" style={{ height }}>
      <div
        className="progress-fill"
        style={{ width: `${Math.min(pct, 100)}%`, background: color }}
      />
    </div>
  );
}

// ── Budget Bar ────────────────────────────────
export function BudgetBar({ pct }: { pct: number }) {
  const s =
    pct >= 100
      ? STATUS_COLORS.over
      : pct >= 80
        ? STATUS_COLORS.warn
        : STATUS_COLORS.ok;
  return (
    <div>
      <div
        style={{
          height: 4,
          background: "var(--surface3)",
          borderRadius: 2,
          overflow: "hidden",
          marginTop: 6,
          width: 120,
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${Math.min(pct, 100)}%`,
            borderRadius: 2,
            background:
              pct >= 100
                ? "var(--red)"
                : pct >= 80
                  ? "var(--amber)"
                  : "var(--green)",
            transition: "width .6s",
          }}
        />
      </div>
    </div>
  );
}

// ── Score Ring ────────────────────────────────
export function ScoreRing({ score }: { score: number }) {
  const circumference = 2 * Math.PI * 42;
  const offset = circumference * (1 - score / 100);
  const color = score >= 75 ? "#3b82f6" : score >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <div
      style={{
        position: "relative",
        width: 100,
        height: 100,
        margin: "0 auto 12px",
      }}
    >
      <svg
        width="100"
        height="100"
        viewBox="0 0 100 100"
        style={{ transform: "rotate(-90deg)" }}
      >
        <circle
          cx="50"
          cy="50"
          r="42"
          fill="none"
          stroke="var(--surface2)"
          strokeWidth="10"
        />
        <circle
          cx="50"
          cy="50"
          r="42"
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1s cubic-bezier(.4,0,.2,1)" }}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            fontFamily: "DM Mono,monospace",
            fontSize: 22,
            fontWeight: 500,
            color: "var(--text)",
            lineHeight: 1,
          }}
        >
          {score}
        </div>
        <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 2 }}>
          / 100
        </div>
      </div>
    </div>
  );
}

// ── Modal ─────────────────────────────────────
interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: number;
}
export function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = 560,
}: ModalProps) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.7)",
        backdropFilter: "blur(4px)",
        zIndex: 999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        className="modal-enter"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border2)",
          borderRadius: 20,
          width: "100%",
          maxWidth,
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            padding: "20px 24px 0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 20,
          }}
        >
          <h2
            style={{
              fontFamily: "Fraunces,serif",
              fontSize: 18,
              fontWeight: 600,
              color: "var(--text)",
            }}
          >
            {title}
          </h2>
          <button
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: "var(--surface2)",
              border: "none",
              color: "var(--text2)",
              cursor: "pointer",
              fontSize: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ✕
          </button>
        </div>
        <div style={{ padding: "0 24px 24px" }}>{children}</div>
      </div>
    </div>
  );
}

// ── Tabs ──────────────────────────────────────
interface TabsProps {
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
}
export function Tabs({ tabs, active, onChange }: TabsProps) {
  return (
    <div
      style={{
        display: "flex",
        gap: 2,
        background: "var(--surface2)",
        borderRadius: 10,
        padding: 3,
        border: "1px solid var(--border)",
        marginBottom: 20,
      }}
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          style={{
            flex: 1,
            padding: "7px 14px",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            color: active === t.id ? "var(--text)" : "var(--text3)",
            background: active === t.id ? "var(--surface)" : "transparent",
            border: "none",
            cursor: "pointer",
            transition: "all var(--transition)",
            boxShadow: active === t.id ? "0 1px 4px rgba(0,0,0,.3)" : "none",
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ── Empty State ───────────────────────────────
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div style={{ textAlign: "center", padding: "40px 20px" }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>{icon}</div>
      <div
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: "var(--text)",
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: 13, color: "var(--text3)", marginBottom: 16 }}>
        {description}
      </div>
      {action}
    </div>
  );
}

// ── Currency Amount ───────────────────────────
export function Amount({ value, size = 13 }: { value: number; size?: number }) {
  const fmt = useAppStore((s) => s.formatCurrency);
  return (
    <span
      className={value >= 0 ? "amount-pos" : "amount-neg"}
      style={{ fontSize: size }}
    >
      {value >= 0 ? "+" : "−"}
      {fmt(Math.abs(value))}
    </span>
  );
}

// ── Form helpers ──────────────────────────────
export function FormGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text2)" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

export function FormGrid({
  children,
  cols = 2,
}: {
  children: React.ReactNode;
  cols?: number;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: 14,
        marginBottom: 14,
      }}
    >
      {children}
    </div>
  );
}

// ── SearchableSelect ──────────────────────────
export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Search or select…",
  disabled = false,
  allowCustom = false,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  disabled?: boolean;
  allowCustom?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);
  // With allowCustom, a value not in the option list is a user-typed entry.
  const selectedLabel = selected ? selected.label : (allowCustom && value ? value : "");
  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase())
  );
  const trimmed = search.trim();
  const showCustomOption =
    allowCustom &&
    trimmed.length > 0 &&
    !options.some((o) => o.label.toLowerCase() === trimmed.toLowerCase());

  const commitCustom = () => {
    onChange(trimmed);
    setOpen(false);
    setSearch("");
  };

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div
        onClick={() => !disabled && setOpen(!open)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 12px",
          height: 40,
          borderRadius: 10,
          border: "1px solid var(--border2)",
          background: "var(--surface2)",
          cursor: disabled ? "not-allowed" : "pointer",
          color: selected ? "var(--text)" : "var(--text3)",
          fontSize: 13,
          opacity: disabled ? 0.5 : 1,
          userSelect: "none",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: selectedLabel ? "var(--text)" : "var(--text3)" }}>
          {selectedLabel || placeholder}
        </span>
        <span style={{ color: "var(--text3)", marginLeft: 6, fontSize: 11, flexShrink: 0 }}>▾</span>
      </div>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            background: "var(--surface2)",
            border: "1px solid var(--border2)",
            borderRadius: 10,
            zIndex: 2000,
            boxShadow: "0 8px 32px rgba(0,0,0,.35)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)" }}>
            <input
              ref={inputRef}
              className="form-input"
              placeholder={allowCustom ? "Type to search or add…" : "Type to search…"}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Enter" && showCustomOption) {
                  e.preventDefault();
                  commitCustom();
                }
              }}
              style={{ padding: "6px 10px", marginBottom: 0 }}
            />
          </div>
          <div style={{ maxHeight: 200, overflowY: "auto" }}>
            {value && (
              <div
                onClick={() => { onChange(""); setOpen(false); setSearch(""); }}
                style={{ padding: "9px 14px", fontSize: 13, color: "var(--text3)", cursor: "pointer", borderBottom: "1px solid var(--border)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface3)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                — Clear selection —
              </div>
            )}
            {showCustomOption && (
              <div
                onClick={commitCustom}
                style={{ padding: "9px 14px", fontSize: 13, cursor: "pointer", color: "var(--accent2)", fontWeight: 600, borderBottom: "1px solid var(--border)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface3)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                ➕ Use “{trimmed}”
              </div>
            )}
            {filtered.length === 0 && !showCustomOption ? (
              <div style={{ padding: "12px 14px", color: "var(--text3)", fontSize: 13 }}>No results</div>
            ) : (
              filtered.map((o) => (
                <div
                  key={o.value}
                  onClick={() => { onChange(o.value); setOpen(false); setSearch(""); }}
                  style={{
                    padding: "9px 14px",
                    fontSize: 13,
                    cursor: "pointer",
                    color: o.value === value ? "var(--accent2)" : "var(--text)",
                    background: o.value === value ? "rgba(59,130,246,.08)" : "transparent",
                    fontWeight: o.value === value ? 600 : 400,
                  }}
                  onMouseEnter={(e) => { if (o.value !== value) e.currentTarget.style.background = "var(--surface3)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = o.value === value ? "rgba(59,130,246,.08)" : "transparent"; }}
                >
                  {o.label}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
