// ─── Auth Page ──────────────────────────────────────────────────────────────────
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAppStore } from "@/store/appStore";
import { CONFIG } from "@/config";
import toast from "react-hot-toast";
import type { UserProfile } from "@/types/finance";

export function AuthPage() {
  const navigate = useNavigate();
  const setUser = useAppStore((state) => state.setUser);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      if (mode === "login") {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;

        if (data.user) {
          // Fetch the full profile from user_profiles table
          const { data: profile, error: profileError } = await supabase
            .from("user_profiles")
            .select(
              "id, email, full_name, currency_code, currency_symbol, timezone, household_id, plan, created_at",
            )
            .eq("id", data.user.id)
            .single();

          if (profileError) {
            console.warn("Profile fetch error:", profileError.message);
          }

          // Use DB profile if available, otherwise use safe defaults
          setUser(
            profile
              ? (profile as UserProfile)
              : {
                  id: data.user.id,
                  email: data.user.email ?? "",
                  full_name: data.user.user_metadata?.full_name ?? "New User",
                  currency_code: CONFIG.APP_CURRENCY_CODE,
                  currency_symbol: CONFIG.APP_CURRENCY_SYMBOL,
                  timezone: CONFIG.APP_TIMEZONE,
                  household_id: null,
                  plan: "free",
                  created_at: new Date().toISOString(),
                },
          );

          navigate("/dashboard");
        }
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        });
        if (error) throw error;
        toast.success(
          "Account created! Check your email to confirm, then sign in.",
        );
        setMode("login");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Authentication error");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/dashboard` },
    });
    if (error) toast.error(error.message);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div style={{ width: "100%", maxWidth: 420 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div
            style={{
              width: 52,
              height: 52,
              background: "linear-gradient(135deg,#1d7ef4,#a76bfa)",
              borderRadius: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 24,
              margin: "0 auto 14px",
            }}
          >
            💎
          </div>
          <div
            style={{
              fontFamily: "Poppins,sans-serif",
              fontSize: 26,
              fontWeight: 600,
              color: "var(--text)",
            }}
          >
            {CONFIG.APP_NAME}
          </div>
          {CONFIG.DEMO_MODE && (
            <div
              style={{
                marginTop: 6,
                display: "inline-block",
                padding: "2px 10px",
                borderRadius: 20,
                background: "rgba(245,158,11,.15)",
                color: "#fbbf24",
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              DEMO MODE
            </div>
          )}
        </div>

        <div className="card" style={{ padding: 28 }}>
          {/* Mode toggle */}
          <div
            style={{
              display: "flex",
              background: "var(--surface2)",
              borderRadius: 10,
              padding: 3,
              marginBottom: 24,
            }}
          >
            {(["login", "signup"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                style={{
                  flex: 1,
                  padding: "7px 14px",
                  borderRadius: 8,
                  fontSize: 13,
                  border: "none",
                  cursor: "pointer",
                  background: mode === m ? "var(--surface)" : "transparent",
                  color: mode === m ? "var(--text)" : "var(--text3)",
                }}
              >
                {m === "login" ? "Sign In" : "Create Account"}
              </button>
            ))}
          </div>

          {/* Form */}
          <form
            onSubmit={handleSubmit}
            style={{ display: "flex", flexDirection: "column", gap: 14 }}
          >
            {mode === "signup" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--text2)",
                  }}
                >
                  Full Name
                </label>
                <input
                  className="form-input"
                  type="text"
                  placeholder="Jane Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--text2)",
                }}
              >
                Email
              </label>
              <input
                className="form-input"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--text2)",
                }}
              >
                Password
              </label>
              <input
                className="form-input"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>

            <button
              className="btn-primary btn"
              type="submit"
              disabled={loading}
              style={{ width: "100%", justifyContent: "center" }}
            >
              {loading ? "…" : mode === "login" ? "Sign In" : "Create Account"}
            </button>
          </form>

          <div
            style={{
              textAlign: "center",
              margin: "18px 0",
              fontSize: 12,
              color: "var(--text3)",
            }}
          >
            or continue with
          </div>

          <button
            className="btn-ghost btn"
            onClick={handleGoogle}
            style={{ width: "100%", justifyContent: "center", gap: 10 }}
          >
            <svg width="18" height="18" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            Continue with Google
          </button>
        </div>
      </div>
    </div>
  );
}
