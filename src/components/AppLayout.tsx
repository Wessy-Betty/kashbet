import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAppStore } from "@/store/appStore";
import { useAlerts } from "@/hooks/useFinance";
import { AddTransactionModal } from "@/components/AddTransactionModal";

const NAV = [
  { label: "Dashboard", path: "/dashboard", icon: "📊", section: "Overview" },
  { label: "Net Worth", path: "/networth", icon: "🏦", section: "Overview" },
  { label: "Annual Summary", path: "/annual", icon: "📅", section: "Overview" },
  {
    label: "Transactions",
    path: "/transactions",
    icon: "💳",
    section: "Tracking",
  },
  { label: "Budget", path: "/budget", icon: "🎯", section: "Tracking" },
  { label: "Weekly View", path: "/weekly", icon: "📆", section: "Tracking" },
  { label: "Income", path: "/income", icon: "💰", section: "Tracking" },
  { label: "Savings", path: "/savings", icon: "🐖", section: "Finance" },
  { label: "Accounts", path: "/investments", icon: "🏦", section: "Finance" },
  {
    label: "Debt Tracker",
    path: "/debt",
    icon: "📋",
    section: "Finance",
    alert: true,
  },
  { label: "Shopping", path: "/shopping", icon: "🛒", section: "Finance" },
  { label: "Family Giving", path: "/giving", icon: "🫶", section: "Finance" },
  { label: "Subscriptions", path: "/subscriptions", icon: "🔁", section: "Finance" },
  { label: "AI Advisor", path: "/advisor", icon: "🤖", section: "AI" },
  { label: "Settings", path: "/settings", icon: "⚙️", section: "AI" },
];

const SECTIONS = ["Overview", "Tracking", "Finance", "AI"];

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export function AppLayout() {
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const { user, setUser, theme, setTheme, currentYear, currentMonth, setPeriod } = useAppStore();
  const { data: alerts } = useAlerts();
  const alertCount = alerts?.filter((a) => !a.is_dismissed).length ?? 0;

  // Apply persisted theme on mount
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  function prevMonth() {
    if (currentMonth === 1) setPeriod(currentYear - 1, 12);
    else setPeriod(currentYear, currentMonth - 1);
  }
  function nextMonth() {
    const now = new Date();
    if (currentYear === now.getFullYear() && currentMonth === now.getMonth() + 1) return;
    if (currentMonth === 12) setPeriod(currentYear + 1, 1);
    else setPeriod(currentYear, currentMonth + 1);
  }

  // Generate initials for the avatar (e.g., Shaz Wilber-> SW)
  const initials = user?.full_name
    ? user.full_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
    : "??";

  async function handleSignOut() {
    await supabase.auth.signOut();
    setUser(null); // Clear store on sign out
    navigate("/auth");
  }

  return (
    <div
      className="app-shell"
      style={{
        display: "flex",
        position: "relative",
        zIndex: 1,
      }}
    >
      {/* Sidebar */}
      <aside
        style={{
          width: 240,
          minHeight: "100vh",
          background: "var(--surface)",
          borderRight: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          zIndex: 100,
          transform: mobileOpen ? "translateX(0)" : undefined,
        }}
        className="sidebar"
      >
        <div
          style={{
            padding: "24px 20px 20px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                fontSize: 16,
                background: "linear-gradient(135deg,#3b82f6,#8b5cf6)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              💎
            </div>
            <div>
              <div
                style={{
                  fontFamily: "Fraunces,serif",
                  fontSize: 18,
                  fontWeight: 600,
                  color: "var(--text)",
                }}
              >
                KashBet
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: "var(--text3)",
                  fontWeight: 500,
                  textTransform: "uppercase",
                }}
              >
                Personal Finance
              </div>
            </div>
          </div>
        </div>

        <nav style={{ padding: "12px 10px", flex: 1, overflowY: "auto" }}>
          {SECTIONS.map((section) => (
            <div key={section} style={{ marginBottom: 20 }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: "var(--text3)",
                  padding: "4px 10px",
                  marginBottom: 4,
                }}
              >
                {section}
              </div>
              {NAV.filter((n) => n.section === section).map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileOpen(false)}
                  style={({ isActive }) => ({
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "9px 10px",
                    borderRadius: 10,
                    textDecoration: "none",
                    fontSize: 14,
                    color: isActive ? "var(--accent2)" : "var(--text2)",
                    background: isActive
                      ? "rgba(59,130,246,.12)"
                      : "transparent",
                  })}
                >
                  <span
                    style={{ fontSize: 16, width: 20, textAlign: "center" }}
                  >
                    {item.icon}
                  </span>
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {item.alert && alertCount > 0 && (
                    <span
                      style={{
                        background: "var(--red)",
                        color: "white",
                        fontSize: 10,
                        padding: "1px 6px",
                        borderRadius: 10,
                      }}
                    >
                      {alertCount}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* User footer - Now DYNAMIC */}
        <div
          style={{ padding: "16px 10px", borderTop: "1px solid var(--border)" }}
        >
          <div
            onClick={handleSignOut}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 10px",
              borderRadius: 10,
              cursor: "pointer",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "var(--surface2)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "transparent")
            }
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                fontWeight: 700,
                color: "white",
                background: "linear-gradient(135deg,#10b981,#3b82f6)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {initials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--text)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {user?.full_name || "New User"}
              </div>
              <div style={{ fontSize: 11, color: "var(--accent2)" }}>
                ✦ Pro Plan · Sign out
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile backdrop — tap to close the sidebar */}
      {mobileOpen && (
        <div className="sidebar-backdrop" onClick={() => setMobileOpen(false)} />
      )}

      {/* Global floating quick-add button */}
      <button
        onClick={() => setQuickAddOpen(true)}
        title="Add transaction (anywhere)"
        style={{
          position: "fixed",
          bottom: 28,
          right: 28,
          zIndex: 200,
          width: 52,
          height: 52,
          borderRadius: "50%",
          background: "linear-gradient(135deg,var(--accent),var(--purple))",
          border: "none",
          cursor: "pointer",
          fontSize: 24,
          color: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 4px 20px rgba(59,130,246,.45)",
          transition: "transform 0.2s, box-shadow 0.2s",
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.1)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 6px 28px rgba(59,130,246,.6)"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 20px rgba(59,130,246,.45)"; }}
      >
        +
      </button>
      <AddTransactionModal open={quickAddOpen} onClose={() => setQuickAddOpen(false)} />

      <main className="main-content" style={{ flex: 1 }}>
        <div
          style={{
            flexShrink: 0,
            height: 64,
            background: "var(--surface)",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            padding: "0 16px",
            gap: 12,
          }}
        >
          {/* Hamburger — mobile only */}
          <button
            className="menu-btn"
            onClick={() => setMobileOpen(true)}
            title="Open menu"
            aria-label="Open menu"
            style={{
              background: "var(--surface2)",
              border: "1px solid var(--border2)",
              borderRadius: 8,
              width: 38,
              height: 38,
              cursor: "pointer",
              fontSize: 18,
              color: "var(--text2)",
              flexShrink: 0,
            }}
          >
            ☰
          </button>
          <div className="topbar-title" style={{ fontFamily: "Fraunces,serif", fontSize: 20, fontWeight: 600, color: "var(--text)" }}>
            KashBet
          </div>
          <div style={{ flex: 1 }} />

          {/* Month / year picker */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button
              onClick={prevMonth}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text3)", fontSize: 16, padding: "4px 8px", borderRadius: 6 }}
              title="Previous month"
            >‹</button>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text2)", minWidth: 88, textAlign: "center" }}>
              {MONTHS[currentMonth - 1]} {currentYear}
            </span>
            <button
              onClick={nextMonth}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text3)", fontSize: 16, padding: "4px 8px", borderRadius: 6 }}
              title="Next month"
            >›</button>
          </div>

          {/* Theme toggle */}
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            style={{
              background: "var(--surface2)",
              border: "1px solid var(--border2)",
              borderRadius: 8,
              padding: "6px 10px",
              cursor: "pointer",
              fontSize: 15,
              lineHeight: 1,
              color: "var(--text2)",
            }}
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
        </div>
        <div className="page-enter page-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
