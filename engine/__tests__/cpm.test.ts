import { describe, expect, it } from 'vitest';
import { computeSchedule } from '../schedule';
import { mkDep, mkInput, mkTask } from './helpers';

describe('critical path (CPM)', () => {
  it('computes the critical path and slack of a textbook diamond network', () => {
    // A(2d) → B(3d) → D(1d)
    // A(2d) → C(1d) → D(1d)
    // Critical: A, B, D. C has 2 days (960 min) of slack.
    const result = computeSchedule(
      mkInput({
        tasks: [
          mkTask('A', { durationMinutes: 960, workMinutes: 960 }),
          mkTask('B', { durationMinutes: 1440, workMinutes: 1440 }),
          mkTask('C'),
          mkTask('D'),
        ],
        dependencies: [mkDep('A', 'B'), mkDep('A', 'C'), mkDep('B', 'D'), mkDep('C', 'D')],
      }),
    );
    expect(result.tasks.get('A')!.isCritical).toBe(true);
    expect(result.tasks.get('B')!.isCritical).toBe(true);
    expect(result.tasks.get('D')!.isCritical).toBe(true);
    expect(result.tasks.get('C')!.isCritical).toBe(false);
    expect(result.tasks.get('C')!.totalSlackMinutes).toBe(960);
    expect(result.tasks.get('A')!.totalSlackMinutes).toBe(0);
  });

  it('marks every task of a single chain as critical', () => {
    const result = computeSchedule(
      mkInput({
        tasks: [mkTask('A'), mkTask('B'), mkTask('C')],
        dependencies: [mkDep('A', 'B'), mkDep('B', 'C')],
      }),
    );
    for (const id of ['A', 'B', 'C']) {
      expect(result.tasks.get(id)!.isCritical).toBe(true);
      expect(result.tasks.get(id)!.totalSlackMinutes).toBe(0);
    }
  });

  it('gives independent short tasks slack against the project end', () => {
    const result = computeSchedule(
      mkInput({
        tasks: [
          mkTask('long', { durationMinutes: 2400, workMinutes: 2400 }),
          mkTask('short'),
        ],
      }),
    );
    expect(result.tasks.get('long')!.isCritical).toBe(true);
    expect(result.tasks.get('short')!.isCritical).toBe(false);
    // Project ends after 5 days; short (1d) can start up to 4 days late.
    expect(result.tasks.get('short')!.totalSlackMinutes).toBe(4 * 480);
  });

  it('marks a summary as critical when any child is critical', () => {
    const result = computeSchedule(
      mkInput({
        tasks: [
          mkTask('S'),
          mkTask('A', { parentId: 'S', orderKey: 'a', durationMinutes: 2400, workMinutes: 2400 }),
          mkTask('B', { parentId: 'S', orderKey: 'b' }),
        ],
      }),
    );
    expect(result.tasks.get('S')!.isCritical).toBe(true);
  });

  it('projectEnd equals the latest task end', () => {
    const result = computeSchedule(
      mkInput({
        tasks: [mkTask('A'), mkTask('B', { durationMinutes: 1440, workMinutes: 1440 })],
      }),
    );
    expect(result.projectEnd).toEqual({ date: '2026-07-22', minute: 1020 });
  });
});
