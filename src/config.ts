// ─── App-wide configuration ────────────────────────────────────────────────────
// Controls demo mode and environment settings.
//
// DEMO MODE:
//   To ENABLE  demo mode: set VITE_DEMO_MODE=true  in your .env file
//   To DISABLE demo mode: set VITE_DEMO_MODE=false in your .env file (default)
//
// The app will show empty/zero state for real users and demo data for demo mode.

export const CONFIG = {
  /** Master demo mode switch — driven purely by the env variable */
  DEMO_MODE: import.meta.env.VITE_DEMO_MODE === "true",

  /** Supabase connection (required in production) */
  SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL as string,
  SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY as string,

  /** App name */
  APP_NAME: "Fedika",
  APP_CURRENCY_SYMBOL: "KSh",
  APP_CURRENCY_CODE: "KES",
  APP_TIMEZONE: "Africa/Nairobi",
} as const;