// ─── Supabase client ───────────────────────────────────────────────────────────
// Single shared Supabase instance for the entire app.
// Auth state changes are listened to here and synced to the global store.

import { createClient } from "@supabase/supabase-js";
import { CONFIG } from "@/config";

if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY) {
  throw new Error(
    "Missing Supabase environment variables.\n" +
      "Make sure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in your .env file.",
  );
}

export const supabase = createClient(
  CONFIG.SUPABASE_URL,
  CONFIG.SUPABASE_ANON_KEY,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  },
);

// ─── Auth listener ────────────────────────────────────────────────────────────
// Keeps the Zustand store in sync when the session changes (sign in, sign out,
// token refresh).  Import this once in main.tsx / App.tsx to activate it.

import type { UserProfile } from "@/types/finance";

export function initAuthListener(
  setUser: (u: UserProfile | null) => void,
  setLoading: (v: boolean) => void,
) {
  // Hydrate session on first load
  supabase.auth.getSession().then(async ({ data: { session } }) => {
    if (session?.user) {
      await hydrateProfile(session.user.id, setUser);
    }
    setLoading(false);
  });

  // Listen for subsequent changes
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange(async (_event, session) => {
    if (session?.user) {
      await hydrateProfile(session.user.id, setUser);
    } else {
      setUser(null);
    }
  });

  return () => subscription.unsubscribe();
}

async function hydrateProfile(
  userId: string,
  setUser: (u: UserProfile | null) => void,
) {
  const { data, error } = await supabase
    .from("user_profiles")
    .select(
      "id, email, full_name, currency_code, currency_symbol, timezone, household_id, plan, created_at",
    )
    .eq("id", userId)
    .single();

  if (error || !data) {
    console.warn("Could not load user profile:", error?.message);
    return;
  }
  setUser(data as UserProfile);
}
