'use client';

/**
 * Browser-side Supabase client — used exclusively for authentication
 * (login, registration, logout). All data access goes through the app's own
 * API routes; the anon key never touches table data (RLS is default-deny).
 */

import { createBrowserClient } from '@supabase/ssr';

/** True when Supabase auth is configured for this build. */
export const authEnabled = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

/** Creates the browser auth client (only call when {@link authEnabled}). */
export function supabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
