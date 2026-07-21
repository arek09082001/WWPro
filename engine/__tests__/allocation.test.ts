import { describe, expect, it } from 'vitest';
import { computeSchedule } from '../schedule';
import { mkAssignment, mkInput, mkTask, stdCalendar } from './helpers';

describe('workload / overallocation', () => {
  it('does not flag a part-time employee working at 100% units', () => {
    const partTimeWeek = stdCalendar({ id: 'cal-pt' });
    // Part-time: only mornings (4h).
    partTimeWeek.week = partTimeWeek.week.map((d) =>
      d.working ? { working: true, intervals: [[480, 720] as [number, number]] } : d,
    );
    const result = computeSchedule(
      mkInput({
        tasks: [mkTask('A', { durationMinutes: 480, workMinutes: 480 })],
        assignments: [mkAssignment('A', 'emp1')],
        employeeCalendars: { emp1: partTimeWeek },
      }),
    );
    expect(result.overallocations).toHaveLength(0);
  });

  it('flags two overlapping 60% tasks as overallocation', () => {
    const result = computeSchedule(
      mkInput({
        tasks: [mkTask('A'), mkTask('B')],
        assignments: [mkAssignment('A', 'emp1', 0.6), mkAssignment('B', 'emp1', 0.6)],
        employeeCalendars: { emp1: stdCalendar({ id: 'cal-emp1' }) },
      }),
    );
    // Both run Monday: 480*0.6*2 = 576 assigned vs 480 capacity.
    expect(result.overallocations).toHaveLength(1);
    expect(result.overallocations[0]).toMatchObject({
      employeeId: 'emp1',
      date: '2026-07-20',
      assignedMinutes: 576,
      capacityMinutes: 480,
    });
    expect(result.overallocations[0].taskIds.sort()).toEqual(['A', 'B']);
  });

  it('flags work scheduled onto an absence day of a multi-assignee task', () => {
    // Two assignees → project calendar drives the task, ignoring emp1's absence.
    const result = computeSchedule(
      mkInput({
        tasks: [mkTask('A')],
        assignments: [mkAssignment('A', 'emp1', 1), mkAssignment('A', 'emp2', 1)],
        employeeCalendars: {
          emp1: stdCalendar({
            id: 'cal-emp1',
            absences: [{ start: '2026-07-20', end: '2026-07-20', type: 'sick' }],
          }),
          emp2: stdCalendar({ id: 'cal-emp2' }),
        },
      }),
    );
    const emp1Cell = result.overallocations.find((o) => o.employeeId === 'emp1');
    expect(emp1Cell).toBeDefined();
    expect(emp1Cell!.capacityMinutes).toBe(0);
    expect(result.overallocations.some((o) => o.employeeId === 'emp2')).toBe(false);
  });

  it('does not report unassigned tasks', () => {
    const result = computeSchedule(mkInput({ tasks: [mkTask('A')] }));
    expect(result.overallocations).toHaveLength(0);
  });
});
