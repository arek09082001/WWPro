import { describe, expect, it } from 'vitest';
import { computeSchedule, wouldCreateCycle } from '../schedule';
import { mkAssignment, mkDep, mkInput, mkTask, stdCalendar } from './helpers';

describe('forward pass: dependency types', () => {
  it('schedules an FS chain across day boundaries', () => {
    const result = computeSchedule(
      mkInput({
        tasks: [mkTask('A', { durationMinutes: 960, workMinutes: 960 }), mkTask('B')],
        dependencies: [mkDep('A', 'B')],
      }),
    );
    expect(result.tasks.get('A')!.start).toEqual({ date: '2026-07-20', minute: 480 });
    expect(result.tasks.get('A')!.end).toEqual({ date: '2026-07-21', minute: 1020 });
    expect(result.tasks.get('B')!.start).toEqual({ date: '2026-07-22', minute: 480 });
    expect(result.tasks.get('B')!.end).toEqual({ date: '2026-07-22', minute: 1020 });
  });

  it('applies positive FS lag in working minutes', () => {
    const result = computeSchedule(
      mkInput({
        tasks: [mkTask('A'), mkTask('B')],
        dependencies: [mkDep('A', 'B', { lagMinutes: 480 })],
      }),
    );
    // A ends Mon 17:00; +480 working min = Tue 17:00 → B starts Wed 08:00.
    expect(result.tasks.get('B')!.start).toEqual({ date: '2026-07-22', minute: 480 });
  });

  it('applies negative FS lag (lead)', () => {
    const result = computeSchedule(
      mkInput({
        tasks: [mkTask('A', { durationMinutes: 960, workMinutes: 960 }), mkTask('B')],
        dependencies: [mkDep('A', 'B', { lagMinutes: -480 })],
      }),
    );
    // A ends Tue 17:00; -480 working min = Mon 17:00 → B starts Tue 08:00.
    expect(result.tasks.get('B')!.start).toEqual({ date: '2026-07-21', minute: 480 });
  });

  it('handles SS dependencies', () => {
    const result = computeSchedule(
      mkInput({
        tasks: [mkTask('A', { durationMinutes: 960, workMinutes: 960 }), mkTask('B')],
        dependencies: [mkDep('A', 'B', { type: 'SS' })],
      }),
    );
    expect(result.tasks.get('B')!.start).toEqual({ date: '2026-07-20', minute: 480 });
  });

  it('handles FF dependencies (align ends)', () => {
    const result = computeSchedule(
      mkInput({
        tasks: [mkTask('A', { durationMinutes: 960, workMinutes: 960 }), mkTask('B')],
        dependencies: [mkDep('A', 'B', { type: 'FF' })],
      }),
    );
    expect(result.tasks.get('B')!.end).toEqual(result.tasks.get('A')!.end);
    expect(result.tasks.get('B')!.start).toEqual({ date: '2026-07-21', minute: 480 });
  });

  it('handles SF dependencies (successor ends at predecessor start)', () => {
    const result = computeSchedule(
      mkInput({
        tasks: [
          mkTask('A', { constraintType: 'start_no_earlier_than', constraintDate: '2026-07-22' }),
          mkTask('B'),
        ],
        dependencies: [mkDep('A', 'B', { type: 'SF' })],
      }),
    );
    // A starts Wed 08:00 → B must end then → B runs Tuesday (ends at the Tue 17:00 boundary).
    expect(result.tasks.get('B')!.start).toEqual({ date: '2026-07-21', minute: 480 });
    expect(result.tasks.get('B')!.end).toEqual({ date: '2026-07-21', minute: 1020 });
  });

  it('lag spans the weekend in working minutes', () => {
    const result = computeSchedule(
      mkInput({
        tasks: [
          mkTask('A', {
            durationMinutes: 2400,
            workMinutes: 2400,
          }),
          mkTask('B'),
        ],
        dependencies: [mkDep('A', 'B', { lagMinutes: 480 })],
      }),
    );
    // A: Mon-Fri full week, ends Fri 17:00. Lag 480 working min = Mon. B starts Tue 08:00.
    expect(result.tasks.get('A')!.end).toEqual({ date: '2026-07-24', minute: 1020 });
    expect(result.tasks.get('B')!.start).toEqual({ date: '2026-07-28', minute: 480 });
  });
});

describe('constraints', () => {
  it('start_no_earlier_than pushes the start', () => {
    const result = computeSchedule(
      mkInput({
        tasks: [mkTask('A', { constraintType: 'start_no_earlier_than', constraintDate: '2026-07-23' })],
      }),
    );
    expect(result.tasks.get('A')!.start).toEqual({ date: '2026-07-23', minute: 480 });
    const binding = result.tasks.get('A')!.explanation.startDrivers.find(
      (d) => d.kind === 'constraint' && d.binding,
    );
    expect(binding).toBeDefined();
  });

  it('must_start_on overrides dependencies and records a conflict warning', () => {
    const result = computeSchedule(
      mkInput({
        tasks: [
          mkTask('A', { durationMinutes: 960, workMinutes: 960 }),
          mkTask('B', { constraintType: 'must_start_on', constraintDate: '2026-07-20' }),
        ],
        dependencies: [mkDep('A', 'B')],
      }),
    );
    expect(result.tasks.get('B')!.start).toEqual({ date: '2026-07-20', minute: 480 });
    expect(result.tasks.get('B')!.explanation.warnings.some((w) => w.code === 'CONSTRAINT_CONFLICT')).toBe(true);
  });

  it('snaps a weekend constraint date to Monday and explains it', () => {
    const result = computeSchedule(
      mkInput({
        tasks: [mkTask('A', { constraintType: 'start_no_earlier_than', constraintDate: '2026-07-25' })],
      }),
    );
    const a = result.tasks.get('A')!;
    expect(a.start).toEqual({ date: '2026-07-27', minute: 480 });
    const snap = a.explanation.startDrivers.find((d) => d.kind === 'calendarSnap');
    expect(snap && snap.kind === 'calendarSnap' && snap.reason).toBe('weekend');
  });
});

describe('milestones, summaries, hierarchy', () => {
  it('schedules milestones with zero duration', () => {
    const result = computeSchedule(
      mkInput({
        tasks: [mkTask('A'), mkTask('M', { isMilestone: true })],
        dependencies: [mkDep('A', 'M')],
      }),
    );
    const m = result.tasks.get('M')!;
    expect(m.start).toEqual(m.end);
    expect(m.durationMinutes).toBe(0);
  });

  it('rolls up summary start/end/work and weighted percent', () => {
    const result = computeSchedule(
      mkInput({
        tasks: [
          mkTask('S'),
          mkTask('A', { parentId: 'S', orderKey: 'a', percentComplete: 100 }),
          mkTask('B', {
            parentId: 'S',
            orderKey: 'b',
            durationMinutes: 960,
            workMinutes: 960,
            percentComplete: 0,
          }),
        ],
        dependencies: [mkDep('A', 'B')],
      }),
    );
    const s = result.tasks.get('S')!;
    expect(s.isSummary).toBe(true);
    expect(s.start).toEqual({ date: '2026-07-20', minute: 480 });
    // A: Mon; B: Tue+Wed → summary ends Wed 17:00.
    expect(s.end).toEqual({ date: '2026-07-22', minute: 1020 });
    expect(s.workMinutes).toBe(1440);
  });

  it('expands dependencies on summary tasks to their leaves', () => {
    const result = computeSchedule(
      mkInput({
        tasks: [
          mkTask('S'),
          mkTask('A', { parentId: 'S', orderKey: 'a' }),
          mkTask('B', { parentId: 'S', orderKey: 'b', durationMinutes: 960, workMinutes: 960 }),
          mkTask('C'),
        ],
        dependencies: [mkDep('S', 'C')],
      }),
    );
    // C must start after ALL leaves of S; B (longest) ends Tue 17:00 → C starts Wed.
    expect(result.tasks.get('C')!.start).toEqual({ date: '2026-07-22', minute: 480 });
  });

  it('supports 3-level rollups', () => {
    const result = computeSchedule(
      mkInput({
        tasks: [
          mkTask('root'),
          mkTask('mid', { parentId: 'root' }),
          mkTask('leaf1', { parentId: 'mid', orderKey: 'a' }),
          mkTask('leaf2', { parentId: 'mid', orderKey: 'b', durationMinutes: 960, workMinutes: 960 }),
        ],
        dependencies: [mkDep('leaf1', 'leaf2')],
      }),
    );
    const root = result.tasks.get('root')!;
    expect(root.isSummary).toBe(true);
    expect(root.workMinutes).toBe(1440);
    expect(root.end).toEqual({ date: '2026-07-22', minute: 1020 });
  });
});

describe('cycles and manual tasks', () => {
  it('detects cycles, reports them and still schedules', () => {
    const result = computeSchedule(
      mkInput({
        tasks: [mkTask('A'), mkTask('B')],
        dependencies: [mkDep('A', 'B'), mkDep('B', 'A')],
      }),
    );
    expect(result.errors.some((e) => e.code === 'CYCLE')).toBe(true);
    expect(result.tasks.get('A')).toBeDefined();
    expect(result.tasks.get('B')).toBeDefined();
  });

  it('wouldCreateCycle detects a would-be cycle without mutating input', () => {
    const input = mkInput({
      tasks: [mkTask('A'), mkTask('B')],
      dependencies: [mkDep('A', 'B')],
    });
    expect(wouldCreateCycle(input, { predecessorId: 'B', successorId: 'A' })).toBe(true);
    expect(wouldCreateCycle(input, { predecessorId: 'A', successorId: 'B' })).toBe(false);
    expect(input.dependencies).toHaveLength(1);
  });

  it('uses manual tasks as fixed predecessors', () => {
    const result = computeSchedule(
      mkInput({
        tasks: [
          mkTask('A', {
            schedulingMode: 'manual',
            manualStart: { date: '2026-07-23', minute: 480 },
            manualEnd: { date: '2026-07-23', minute: 1020 },
          }),
          mkTask('B'),
        ],
        dependencies: [mkDep('A', 'B')],
      }),
    );
    expect(result.tasks.get('A')!.start).toEqual({ date: '2026-07-23', minute: 480 });
    expect(result.tasks.get('B')!.start).toEqual({ date: '2026-07-24', minute: 480 });
  });
});

describe('calendars drive task dates', () => {
  it('uses the single assignee employee calendar', () => {
    const result = computeSchedule(
      mkInput({
        tasks: [mkTask('A', { durationMinutes: 960, workMinutes: 960 })],
        assignments: [mkAssignment('A', 'emp1')],
        employeeCalendars: {
          emp1: stdCalendar({
            id: 'cal-emp1',
            exceptions: [{ date: '2026-07-21', working: false, name: 'Frei' }],
          }),
        },
      }),
    );
    // Tuesday is off for emp1 → 2-day task ends Wednesday 17:00.
    expect(result.tasks.get('A')!.end).toEqual({ date: '2026-07-22', minute: 1020 });
  });

  it('falls back to the project calendar for multi-assignee tasks', () => {
    const result = computeSchedule(
      mkInput({
        tasks: [mkTask('A', { durationMinutes: 960, workMinutes: 960 })],
        assignments: [mkAssignment('A', 'emp1'), mkAssignment('A', 'emp2')],
        employeeCalendars: {
          emp1: stdCalendar({
            id: 'cal-emp1',
            exceptions: [{ date: '2026-07-21', working: false, name: 'Frei' }],
          }),
        },
      }),
    );
    expect(result.tasks.get('A')!.end).toEqual({ date: '2026-07-21', minute: 1020 });
  });

  it('an absence pushes the dates of a solo-assigned task', () => {
    const result = computeSchedule(
      mkInput({
        tasks: [mkTask('A', { durationMinutes: 960, workMinutes: 960 })],
        assignments: [mkAssignment('A', 'emp1')],
        employeeCalendars: {
          emp1: stdCalendar({
            id: 'cal-emp1',
            absences: [{ start: '2026-07-20', end: '2026-07-21', type: 'vacation' }],
          }),
        },
      }),
    );
    expect(result.tasks.get('A')!.start).toEqual({ date: '2026-07-22', minute: 480 });
    expect(result.tasks.get('A')!.end).toEqual({ date: '2026-07-23', minute: 1020 });
  });

  it('reports NO_WORKING_TIME instead of hanging on dead calendars', () => {
    const result = computeSchedule(
      mkInput({
        tasks: [mkTask('A')],
        assignments: [mkAssignment('A', 'emp1')],
        employeeCalendars: {
          emp1: {
            id: 'cal-dead',
            week: Array.from({ length: 7 }, () => ({ working: false, intervals: [] })),
            exceptions: [],
          },
        },
      }),
    );
    expect(result.errors.some((e) => e.code === 'NO_WORKING_TIME')).toBe(true);
  });
});

describe('performance', () => {
  it('schedules a 1000-task chain quickly', () => {
    const tasks = Array.from({ length: 1000 }, (_, i) =>
      mkTask(`T${i}`, { orderKey: String(i).padStart(6, '0') }),
    );
    const dependencies = Array.from({ length: 999 }, (_, i) => mkDep(`T${i}`, `T${i + 1}`));
    const started = performance.now();
    const result = computeSchedule(mkInput({ tasks, dependencies }));
    const elapsed = performance.now() - started;
    expect(result.tasks.size).toBe(1000);
    expect(result.errors).toHaveLength(0);
    expect(elapsed).toBeLessThan(1000);
  });
});
