/**
 * Store factory. v1 uses the zero-setup JSON file store; the SQL schema for a
 * Supabase-backed store ships in supabase/migrations and shares the exact same
 * row shapes, so swapping the implementation is a drop-in follow-up.
 * All access is strictly server-side (route handlers) — no database
 * credentials or keys ever reach the client.
 */

import 'server-only';

import { JsonStore } from './json-store';
import type { Store } from './types';

let store: Store | undefined;

/** Returns the singleton store instance used by all API routes. */
export function getStore(): Store {
  if (!store) {
    store = new JsonStore();
  }
  return store;
}

export type { Store } from './types';
