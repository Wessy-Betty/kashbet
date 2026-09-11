// ─── Reset Password Page ──────────────────────────────────────────────────────
// Landing page for the password-recovery email link. Supabase establishes a
// short-lived recovery session from the link; the user then sets a new password.
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { CONFIG } from "@/config";
import { PasswordField } from "@/components/PasswordField";
import toast from "react-hot-toast";

export function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // The recovery link sets a session (detectSessionInUrl). Confirm we have one.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) return toast.error("Passwords don't match");
    if (password.length < 8)
      return toast.error("Password must be at least 8 characters");

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) return toast.error(error.message);
    toast.success("Password updated. Please sign in.");
    await supabase.auth.signOut();
    navigate("/auth");
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
        </div>

        <div className="card" style={{ padding: 28 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text)" }}>
            Set a new password
          </div>
          <div
            style={{ fontSize: 12, color: "var(--text3)", marginTop: 4, marginBottom: 20 }}
          >
            {ready
              ? "Choose a new password for your account."
              : "Waiting for your recovery link. Open this page from the reset email if you haven't."}
          </div>

          <form
            onSubmit={handleSubmit}
            style={{ display: "flex", flexDirection: "column", gap: 14 }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text2)" }}>
                New password
              </label>
              <PasswordField
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text2)" }}>
                Confirm new password
              </label>
              <PasswordField
                placeholder="••••••••"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={8}
              />
            </div>

            <button
              className="btn-primary btn"
              type="submit"
              disabled={loading || !ready}
              style={{ width: "100%", justifyContent: "center" }}
            >
              {loading ? "…" : "Update password"}
            </button>
          </form>

          <button
            onClick={() => navigate("/auth")}
            style={{
              marginTop: 16,
              width: "100%",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text3)",
              fontSize: 12,
            }}
          >
            Back to sign in
          </button>
        </div>
      </div>
    </div>
  );
}
