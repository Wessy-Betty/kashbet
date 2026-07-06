import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardBody,
  FormGroup,
  FormGrid,
} from "@/components/ui";
import toast from "react-hot-toast";
import { supabase } from "@/lib/supabase";
import { useAppStore } from "@/store/appStore";

// ── helpers ──────────────────────────────────────────────────────────────────

function genCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I confusion
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

// ── Household panel ───────────────────────────────────────────────────────────

function HouseholdPanel() {
  const { user, setUser } = useAppStore();
  const [hh, setHh] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [invite, setInvite] = useState<any>(null);
  const [hhLoading, setHhLoading] = useState(true);

  const [hhName, setHhName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [generating, setGenerating] = useState(false);

  const loadHousehold = useCallback(async () => {
    if (!user?.household_id) { setHhLoading(false); return; }
    setHhLoading(true);
    try {
      const [hhRes, memRes, invRes] = await Promise.all([
        supabase.from("households").select("*").eq("id", user.household_id).single(),
        supabase
          .from("household_members")
          .select("user_id, role, joined_at, user_profiles(full_name, email)")
          .eq("household_id", user.household_id),
        supabase
          .from("household_invites")
          .select("*")
          .eq("household_id", user.household_id)
          .is("used_by", null)
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false })
          .limit(1),
      ]);
      if (hhRes.data) setHh(hhRes.data);
      if (memRes.data) setMembers(memRes.data);
      if (invRes.data?.[0]) setInvite(invRes.data[0]);
    } finally {
      setHhLoading(false);
    }
  }, [user?.household_id]);

  useEffect(() => { loadHousehold(); }, [loadHousehold]);

  async function handleCreate() {
    if (!hhName.trim() || !user?.id) return toast.error("Enter a household name");
    setCreating(true);
    try {
      // 1. Create household
      const { data: newHh, error: hhErr } = await supabase
        .from("households")
        .insert({ name: hhName.trim(), owner_id: user.id })
        .select()
        .single();
      if (hhErr) throw hhErr;

      // 2. Add owner to household_members
      const { error: memErr } = await supabase
        .from("household_members")
        .insert({ household_id: newHh.id, user_id: user.id, role: "owner" });
      if (memErr) throw memErr;

      // 3. Link user_profiles to household
      const { error: profErr } = await supabase
        .from("user_profiles")
        .update({ household_id: newHh.id })
        .eq("id", user.id);
      if (profErr) throw profErr;

      // 4. Generate first invite
      const code = genCode();
      await supabase.from("household_invites").insert({
        household_id: newHh.id,
        invite_code: code,
        created_by: user.id,
      });

      setUser({ ...user, household_id: newHh.id });
      toast.success("Household created!");
      loadHousehold();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleGenerateCode() {
    if (!user?.household_id || !user?.id) return;
    setGenerating(true);
    try {
      const code = genCode();
      const { data, error } = await supabase
        .from("household_invites")
        .insert({
          household_id: user.household_id,
          invite_code: code,
          created_by: user.id,
        })
        .select()
        .single();
      if (error) throw error;
      setInvite(data);
      toast.success("New invite code generated");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setGenerating(false);
    }
  }

  async function handleJoin() {
    const code = joinCode.trim().toUpperCase();
    if (!code || !user?.id) return toast.error("Enter an invite code");
    setJoining(true);
    try {
      // Look up the invite
      const { data: inv, error: invErr } = await supabase
        .from("household_invites")
        .select("*")
        .eq("invite_code", code)
        .is("used_by", null)
        .gt("expires_at", new Date().toISOString())
        .single();

      if (invErr || !inv) throw new Error("Invalid or expired invite code");

      // Check not already in a household
      if (user.household_id) throw new Error("You are already in a household. Leave it first.");

      // Add to household_members
      const { error: memErr } = await supabase
        .from("household_members")
        .insert({ household_id: inv.household_id, user_id: user.id, role: "member" });
      if (memErr) throw memErr;

      // Link user_profiles
      const { error: profErr } = await supabase
        .from("user_profiles")
        .update({ household_id: inv.household_id })
        .eq("id", user.id);
      if (profErr) throw profErr;

      // Mark invite used
      await supabase
        .from("household_invites")
        .update({ used_by: user.id, used_at: new Date().toISOString() })
        .eq("id", inv.id);

      setUser({ ...user, household_id: inv.household_id });
      toast.success("You joined the household!");
      loadHousehold();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setJoining(false);
    }
  }

  async function handleLeave() {
    if (!user?.id || !user?.household_id) return;
    if (!confirm("Leave this household? Your personal data stays, but shared data will no longer be visible.")) return;
    try {
      await supabase
        .from("household_members")
        .delete()
        .eq("user_id", user.id)
        .eq("household_id", user.household_id);

      await supabase
        .from("user_profiles")
        .update({ household_id: null })
        .eq("id", user.id);

      setUser({ ...user, household_id: null });
      setHh(null); setMembers([]); setInvite(null);
      toast.success("Left the household");
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  function copyCode() {
    if (!invite?.invite_code) return;
    navigator.clipboard.writeText(invite.invite_code);
    toast.success("Code copied!");
  }

  // ── No household ─────────────────────────────────────────────────────────
  if (!user?.household_id) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Household</CardTitle>
        </CardHeader>
        <CardBody>
          <p style={{ fontSize: 13, color: "var(--text3)", marginBottom: 20, lineHeight: 1.7 }}>
            A household lets you and a partner share transactions, budgets, and income — seeing the full two-earner picture in one place.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            {/* Create */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text2)", marginBottom: 10 }}>
                Create a household
              </div>
              <FormGroup label="Household name">
                <input
                  className="form-input"
                  placeholder="e.g. The Okellos"
                  value={hhName}
                  onChange={(e) => setHhName(e.target.value)}
                />
              </FormGroup>
              <button
                className="btn-primary btn"
                style={{ marginTop: 12, width: "100%", justifyContent: "center" }}
                onClick={handleCreate}
                disabled={creating}
              >
                {creating ? "Creating…" : "Create Household"}
              </button>
            </div>

            {/* Join */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text2)", marginBottom: 10 }}>
                Join with an invite code
              </div>
              <FormGroup label="Invite code">
                <input
                  className="form-input"
                  placeholder="e.g. AB3K9ZX2"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  maxLength={8}
                  style={{ fontFamily: "DM Mono", letterSpacing: "0.1em" }}
                />
              </FormGroup>
              <button
                className="btn-ghost btn"
                style={{ marginTop: 12, width: "100%", justifyContent: "center" }}
                onClick={handleJoin}
                disabled={joining}
              >
                {joining ? "Joining…" : "Join Household"}
              </button>
            </div>
          </div>
        </CardBody>
      </Card>
    );
  }

  // ── In a household ────────────────────────────────────────────────────────
  if (hhLoading) {
    return (
      <Card>
        <CardBody>
          <div style={{ color: "var(--text3)", fontSize: 13 }}>Loading household…</div>
        </CardBody>
      </Card>
    );
  }

  const isOwner = hh?.owner_id === user?.id;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          🏠 {hh?.name ?? "Household"}
        </CardTitle>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            padding: "3px 8px",
            borderRadius: 6,
            background: isOwner ? "rgba(59,130,246,.12)" : "rgba(16,185,129,.12)",
            color: isOwner ? "var(--accent2)" : "var(--green2)",
          }}
        >
          {isOwner ? "Owner" : "Member"}
        </span>
      </CardHeader>
      <CardBody>
        {/* Members */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", marginBottom: 10 }}>
            Members ({members.length})
          </div>
          {members.map((m) => {
            const profile = (m as any).user_profiles;
            return (
              <div
                key={m.user_id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 14px",
                  background: "var(--surface2)",
                  borderRadius: 10,
                  marginBottom: 6,
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                    {profile?.full_name ?? profile?.email ?? m.user_id}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text3)" }}>{profile?.email}</div>
                </div>
                <span style={{ fontSize: 11, color: "var(--text3)", textTransform: "capitalize" }}>
                  {m.role}
                </span>
              </div>
            );
          })}
        </div>

        {/* Invite code — only owner sees this */}
        {isOwner && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", marginBottom: 10 }}>
              Invite Code
            </div>
            {invite ? (
              <>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "14px 18px",
                    background: "rgba(59,130,246,.06)",
                    border: "1px solid rgba(59,130,246,.2)",
                    borderRadius: 12,
                  }}
                >
                  <span
                    style={{
                      fontFamily: "DM Mono",
                      fontSize: 22,
                      fontWeight: 700,
                      color: "var(--accent2)",
                      letterSpacing: "0.15em",
                      flex: 1,
                    }}
                  >
                    {invite.invite_code}
                  </span>
                  <button className="btn-ghost btn" style={{ fontSize: 12 }} onClick={copyCode}>
                    Copy
                  </button>
                </div>
                <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 6 }}>
                  Expires {new Date(invite.expires_at).toLocaleDateString()} · Share this code with your partner
                </div>
              </>
            ) : (
              <div style={{ fontSize: 13, color: "var(--text3)" }}>No active invite.</div>
            )}
            <button
              className="btn-ghost btn"
              style={{ marginTop: 10, fontSize: 12 }}
              onClick={handleGenerateCode}
              disabled={generating}
            >
              {generating ? "Generating…" : invite ? "Generate New Code" : "Generate Invite Code"}
            </button>
          </div>
        )}

        {/* Leave */}
        <button
          style={{
            padding: "8px 14px",
            borderRadius: 10,
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            border: "1px solid rgba(239,68,68,.3)",
            background: "rgba(239,68,68,.06)",
            color: "var(--red2)",
          }}
          onClick={handleLeave}
        >
          Leave Household
        </button>
      </CardBody>
    </Card>
  );
}

// ── Main Settings page ────────────────────────────────────────────────────────

export function Settings() {
  const { user, setUser } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [fullNameState, setFullNameState] = useState(user?.full_name || "");
  const [currencyState, setCurrencyState] = useState(user?.currency_code || "KES");

  async function handleSaveProfile() {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from("user_profiles")   // was "profiles" — bug fixed
        .update({
          full_name: fullNameState,
          currency_code: currencyState,
          currency_symbol: currencyState === "KES" ? "KSh" : "$",
        })
        .eq("id", user.id);
      if (error) throw error;

      setUser({ ...user, full_name: fullNameState, currency_code: currencyState });
      toast.success("Settings saved!");
    } catch (err: any) {
      toast.error(err.message || "Failed to save settings");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-enter">
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {/* Profile */}
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
            </CardHeader>
            <CardBody>
              <FormGrid cols={1}>
                <FormGroup label="Full Name">
                  <input
                    className="form-input"
                    value={fullNameState}
                    onChange={(e) => setFullNameState(e.target.value)}
                    placeholder="Enter your name"
                  />
                </FormGroup>
                <FormGroup label="Email">
                  <input
                    className="form-input"
                    type="email"
                    defaultValue={user?.email || ""}
                    disabled
                  />
                </FormGroup>
                <FormGroup label="Currency">
                  <select
                    className="form-select"
                    value={currencyState}
                    onChange={(e) => setCurrencyState(e.target.value)}
                  >
                    <option value="KES">KES — Kenyan Shilling (KSh)</option>
                    <option value="USD">USD — US Dollar ($)</option>
                  </select>
                </FormGroup>
              </FormGrid>
              <button
                className="btn-primary btn"
                onClick={handleSaveProfile}
                disabled={loading}
                style={{ marginTop: 20, width: "100%", justifyContent: "center" }}
              >
                {loading ? "Saving…" : "Save Changes"}
              </button>
            </CardBody>
          </Card>

          {/* Data & Privacy */}
          <Card>
            <CardHeader>
              <CardTitle>Data & Privacy</CardTitle>
            </CardHeader>
            <CardBody>
              <p style={{ fontSize: 13, color: "var(--text2)", lineHeight: 1.7, marginBottom: 16 }}>
                Logged in as <strong>{user?.email}</strong>. Your data is stored securely and linked to your unique user ID.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button
                  className="btn-ghost btn"
                  onClick={() => toast.success("Data export initiated")}
                >
                  Export My Data (JSON)
                </button>
                <button
                  style={{
                    padding: "8px 14px",
                    borderRadius: 10,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    border: "1px solid rgba(239,68,68,.3)",
                    background: "rgba(239,68,68,.08)",
                    color: "var(--red2)",
                  }}
                  onClick={() => toast.error("Please contact support to delete account")}
                >
                  Delete My Account
                </button>
              </div>
            </CardBody>
          </Card>
        </div>

        {/* Household — full width */}
        <HouseholdPanel />
      </div>
    </div>
  );
}
