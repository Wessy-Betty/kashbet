import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";
import "./index.css";

import { AppLayout } from "@/components/AppLayout";
import { AuthPage } from "@/pages/AuthPage";
import { ResetPassword } from "@/pages/ResetPassword";
import { Dashboard } from "@/pages/Dashboard";
import { Transactions } from "@/pages/Transactions";
import { Budget } from "@/pages/Budget";
import { Weekly } from "@/pages/Weekly";
import { Income } from "@/pages/Income";
import { Savings } from "@/pages/Savings";
import { Debt } from "@/pages/Debt";
import { Shopping } from "@/pages/Shopping";
import { NetWorth } from "@/pages/NetWorth";
import { Annual } from "@/pages/Annual";
import { Advisor } from "@/pages/Advisor";
import { Settings } from "@/pages/Settings";
import { Investments } from "@/pages/Investments";
import { Giving } from "@/pages/Giving";
import { Subscriptions } from "@/pages/Subscriptions";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useAppStore } from "@/store/appStore";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 min
      retry: 1,
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthGuard();
  const hasHydrated = useAppStore((s) => s.hasHydrated);

  // loading is only true on first visit (no token in localStorage).
  // On refresh with a stored token it starts as false, so no flash.
  //
  // hasHydrated guards against a separate race: the app store's
  // currentYear/currentMonth persist to localStorage, but the store
  // initializes with today's date synchronously and only overwrites it with
  // the saved period once the async localStorage read completes. Without
  // this gate, every page would mount and fire its month-scoped queries
  // with today's month first, then re-fetch moments later once the real
  // saved month lands — showing the wrong month's data for a beat.
  if (loading || !hasHydrated) return null;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="transactions" element={<Transactions />} />
            <Route path="budget" element={<Budget />} />
            <Route path="weekly" element={<Weekly />} />
            <Route path="income" element={<Income />} />
            <Route path="savings" element={<Savings />} />
            <Route path="debt" element={<Debt />} />
            <Route path="shopping" element={<Shopping />} />
            <Route path="networth" element={<NetWorth />} />
            <Route path="investments" element={<Investments />} />
            <Route path="giving" element={<Giving />} />
            <Route path="subscriptions" element={<Subscriptions />} />
            <Route path="annual" element={<Annual />} />
            <Route path="advisor" element={<Advisor />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: "#1e1e20",
            color: "#e8edf5",
            border: "1px solid #2a4060",
          },
        }}
      />
    </QueryClientProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
