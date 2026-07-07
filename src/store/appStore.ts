import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { UserProfile, Alert } from "@/types";

interface AppState {
  // Theme
  theme: "dark" | "light";
  setTheme: (theme: "dark" | "light") => void;

  // Auth & Identity
  user: UserProfile | null;
  setUser: (user: UserProfile | null) => void;
  isDemoMode: boolean;
  setDemoMode: (val: boolean) => void;

  // UI state
  activePage: string;
  setActivePage: (page: string) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;

  // Current period
  currentYear: number;
  currentMonth: number;
  setPeriod: (year: number, month: number) => void;

  // Alerts (cached)
  alerts: Alert[];
  setAlerts: (alerts: Alert[]) => void;
  dismissAlert: (id: string) => void;

  // Currency helpers
  formatCurrency: (amount: number) => string;
}

const now = new Date();

// This is the UUID you seeded in Section 20 of your SQL script
const JANE_DOE_ID = "59946369-b298-48c4-8af0-4dceb0f8409b";

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      theme: "dark",
      setTheme: (theme) => {
        document.documentElement.setAttribute("data-theme", theme);
        set({ theme });
      },

      isDemoMode: false, // Only one entry!
      user: null, // Start as null so the real login can take over

      setUser: (user) => set({ user }),
      setDemoMode: (isDemoMode) => {
        if (isDemoMode) {
          set({
            isDemoMode: true,
            user: {
              id: JANE_DOE_ID,
              full_name: "Jane Doe",
              currency_symbol: "KSh",
            } as UserProfile,
          });
        } else {
          set({ isDemoMode: false, user: null });
        }
      },

      activePage: "dashboard",
      setActivePage: (page) => set({ activePage: page }),
      sidebarOpen: false,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),

      currentYear: now.getFullYear(),
      currentMonth: now.getMonth() + 1,
      setPeriod: (year, month) =>
        set({ currentYear: year, currentMonth: month }),

      alerts: [],
      setAlerts: (alerts) => set({ alerts }),
      dismissAlert: (id) =>
        set((state) => ({
          alerts: state.alerts.filter((a) => a.id !== id),
        })),

      formatCurrency: (amount) => {
        const { user } = get();
        const symbol = user?.currency_symbol ?? "KSh";
        const formatted = Math.abs(amount).toLocaleString("en-KE", {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        });
        return `${symbol} ${formatted}`;
      },
    }),
    {
      name: "kashbet-app-state",
      partialize: (state) => ({
        theme: state.theme,
        activePage: state.activePage,
        currentYear: state.currentYear,
        currentMonth: state.currentMonth,
        isDemoMode: state.isDemoMode,
      }),
    },
  ),
);
