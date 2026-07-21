/**
 * Shared helpers for API route handlers: uniform JSON responses and error
 * mapping. Store errors may carry a `status` property (404/409) which is
 * passed through to the HTTP response.
 */

import 'server-only';

import { NextResponse } from 'next/server';

/** Wraps a route handler body with uniform error handling. */
export async function handleRoute<T>(fn: () => Promise<T>): Promise<NextResponse> {
  try {
    const data = await fn();
    return NextResponse.json(data ?? { ok: true });
  } catch (error) {
    const status =
      typeof error === 'object' && error !== null && 'status' in error
        ? Number((error as { status: unknown }).status) || 500
        : 500;
    const message = error instanceof Error ? error.message : 'Interner Fehler';
    if (status >= 500) console.error('[api]', error);
    return NextResponse.json({ error: message }, { status });
  }
}

/** Generates a UUID for new rows. */
export function newId(): string {
  return crypto.randomUUID();
}
