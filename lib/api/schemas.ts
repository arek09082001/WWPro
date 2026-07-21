/**
 * Shared Zod schemas used by multiple API routes.
 */

import { z } from 'zod';

const intervalSchema = z.tuple([
  z.number().int().min(0).max(1440),
  z.number().int().min(0).max(1440),
]);

/** Validates a 7-entry Monday-first work week definition. */
export const weekSchema = z
  .array(
    z.object({
      working: z.boolean(),
      intervals: z.array(intervalSchema),
    }),
  )
  .length(7);

/** Validates a calendar exception payload (without ids). */
export const exceptionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  name: z.string().min(1),
  working: z.boolean(),
  intervals: z.array(intervalSchema).nullable(),
});
