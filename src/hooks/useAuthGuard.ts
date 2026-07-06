import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAppStore } from "@/store/appStore";
import type { User } from "@supabase/supabase-js";

async function loadProfile(authUser: User) {
  try {
    const { data } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("id", authUser.id)
      .single();

    useAppStore.getState().setUser(
      data ?? {
        id: authUser.id,
        email: authUser.email ?? "",
        full_name: authUser.user_metadata?.full_name ?? null,
        currency_code: "KES",
        currency_symbol: "KSh",
        timezone: "Africa/Nairobi",
        household_id: null,
        plan: "free",
        created_at: authUser.created_at,
      },
    );
  } catch {
    // Never block the app for a profile fetch failure
  }
}

export function useAuthGuard() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // getSession() reads from localStorage — fast (<50ms, no network needed
    // for valid non-expired tokens). We clear loading immediately after so
    // ProtectedRoute never sees loading=false with user=null simultaneously.
    supabase.auth.getSession().then(({ data: { session } }) => {
      const authUser = session?.user ?? null;
      setUser(authUser);
      setLoading(false);                          // unblock rendering NOW
      if (authUser) loadProfile(authUser);        // name loads quietly after
      else useAppStore.getState().setUser(null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const authUser = session?.user ?? null;
        setUser(authUser);
        setLoading(false);
        if (authUser) loadProfile(authUser);
        else useAppStore.getState().setUser(null);
      },
    );

    return () => subscription.unsubscribe();
  }, []);

  return { user, loading };
}
