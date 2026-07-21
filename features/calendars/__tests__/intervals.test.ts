import { describe, expect, it } from 'vitest';
import type { Interval } from '@/engine/types';
import {
  cloneWeek,
  formatIntervals,
  intervalsTotalMinutes,
  minutesToTime,
  normalizeIntervals,
  timeToMinutes,
} from '../lib/intervals';

describe('timeToMinutes / minutesToTime', () => {
  it('round-trips regular times', () => {
    expect(timeToMinutes('08:00')).toBe(480);
    expect(timeToMinutes('23:59')).toBe(1439);
    expect(minutesToTime(480)).toBe('08:00');
    expect(minutesToTime(1439)).toBe('23:59');
  });

  it('rejects malformed input', () => {
    expect(timeToMinutes('')).toBeUndefined();
    expect(timeToMinutes('24:00')).toBeUndefined();
    expect(timeToMinutes('12:60')).toBeUndefined();
    expect(timeToMinutes('abc')).toBeUndefined();
  });
});

describe('normalizeIntervals', () => {
  it('sorts unordered intervals', () => {
    const result = normalizeIntervals([
      [780, 1020],
      [480, 720],
    ]);
    expect(result).toEqual({
      ok: true,
      intervals: [
        [480, 720],
        [780, 1020],
      ],
    });
  });

  it('allows touching intervals (half-open semantics)', () => {
    const result = normalizeIntervals([
      [480, 720],
      [720, 1020],
    ]);
    expect(result.ok).toBe(true);
  });

  it('rejects an interval that ends before it starts', () => {
    const result = normalizeIntervals([[720, 480]]);
    expect(result.ok).toBe(false);
  });

  it('rejects overlapping intervals', () => {
    const result = normalizeIntervals([
      [480, 800],
      [780, 1020],
    ]);
    expect(result.ok).toBe(false);
  });
});

describe('intervalsTotalMinutes / formatIntervals', () => {
  it('sums interval lengths', () => {
    const intervals: Interval[] = [
      [480, 720],
      [780, 1020],
    ];
    expect(intervalsTotalMinutes(intervals)).toBe(480);
    expect(formatIntervals(intervals)).toBe('08:00–12:00, 13:00–17:00');
  });
});

describe('cloneWeek', () => {
  it('produces an independent deep copy', () => {
    const week = [{ working: true, intervals: [[480, 720]] as Interval[] }];
    const copy = cloneWeek(week);
    copy[0].intervals[0][0] = 0;
    expect(week[0].intervals[0][0]).toBe(480);
  });
});
