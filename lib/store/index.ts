/**
 * Store factory: uses the Supabase store when SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY are configured, otherwise the zero-setup JSON
 * file store. All access is strictly server-side (route handlers) — no
 * database credentials or keys ever reach the client.
 */

import 'server-only';

import { JsonStore } from './json-store';
import { SupabaseStore } from './supabase-store';
import type { Store } from './types';

let store: Store | undefined;

/** True when the app runs against Supabase (live data + auth). */
export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** Returns the singleton store instance used by all API routes. */
export function getStore(): Store {
  if (!store) {
    store = isSupabaseConfigured()
      ? new SupabaseStore(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
      : new JsonStore();
  }
  return store;
}

export type { Store } from './types';
