import { describe, expect, it } from 'vitest';
import { applyTaskEdit, effectiveUnits, type TaskEdit } from '../recalc';
import { mkAssignment, mkTask } from './helpers';

describe('effectiveUnits', () => {
  it('defaults to 1.0 without assignments', () => {
    expect(effectiveUnits([])).toBe(1);
  });
  it('sums assignment units', () => {
    expect(effectiveUnits([mkAssignment('t', 'a', 0.5), mkAssignment('t', 'b', 0.75)])).toBe(1.25);
  });
});

describe('applyTaskEdit matrix', () => {
  const base = { durationMinutes: 480, workMinutes: 480 };

  interface Case {
    name: string;
    taskType: 'fixed_units' | 'fixed_work' | 'fixed_duration';
    units: number;
    edit: TaskEdit;
    expectDuration: number;
    expectWork: number;
    expectUnits?: number;
  }

  const cases: Case[] = [
    // fixed_units: units stay, the "other" of work/duration follows.
    { name: 'fixed_units: setWork → duration', taskType: 'fixed_units', units: 1, edit: { kind: 'setWork', workMinutes: 960 }, expectDuration: 960, expectWork: 960 },
    { name: 'fixed_units: setWork at 2 units → half duration', taskType: 'fixed_units', units: 2, edit: { kind: 'setWork', workMinutes: 960 }, expectDuration: 480, expectWork: 960 },
    { name: 'fixed_units: setDuration → work', taskType: 'fixed_units', units: 1, edit: { kind: 'setDuration', durationMinutes: 960 }, expectDuration: 960, expectWork: 960 },
    { name: 'fixed_units: resize → work', taskType: 'fixed_units', units: 2, edit: { kind: 'resize', durationMinutes: 240 }, expectDuration: 240, expectWork: 480 },
    // fixed_work: work stays, units absorb duration changes.
    { name: 'fixed_work: setDuration → units', taskType: 'fixed_work', units: 1, edit: { kind: 'setDuration', durationMinutes: 960 }, expectDuration: 960, expectWork: 480, expectUnits: 0.5 },
    { name: 'fixed_work: resize shorter → units up', taskType: 'fixed_work', units: 1, edit: { kind: 'resize', durationMinutes: 240 }, expectDuration: 240, expectWork: 480, expectUnits: 2 },
    { name: 'fixed_work: setWork → duration', taskType: 'fixed_work', units: 1, edit: { kind: 'setWork', workMinutes: 240 }, expectDuration: 240, expectWork: 240 },
    // fixed_duration: duration stays, work/units adjust.
    { name: 'fixed_duration: setWork → units', taskType: 'fixed_duration', units: 1, edit: { kind: 'setWork', workMinutes: 960 }, expectDuration: 480, expectWork: 960, expectUnits: 2 },
    { name: 'fixed_duration: setDuration → work', taskType: 'fixed_duration', units: 1, edit: { kind: 'setDuration', durationMinutes: 960 }, expectDuration: 960, expectWork: 960 },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const task = mkTask('t', { taskType: c.taskType, ...base });
      const assignments = c.units === 1 ? [mkAssignment('t', 'emp', 1)] : [mkAssignment('t', 'emp', c.units)];
      const result = applyTaskEdit(task, assignments, c.edit);
      expect(result.task.durationMinutes).toBe(c.expectDuration);
      expect(result.task.workMinutes).toBe(c.expectWork);
      if (c.expectUnits !== undefined) {
        expect(effectiveUnits(result.assignments)).toBeCloseTo(c.expectUnits, 2);
      }
    });
  }

  it('setAssignments on fixed_units recomputes duration', () => {
    const task = mkTask('t', { taskType: 'fixed_units', durationMinutes: 960, workMinutes: 960 });
    const result = applyTaskEdit(task, [], {
      kind: 'setAssignments',
      assignments: [mkAssignment('t', 'a', 1), mkAssignment('t', 'b', 1)],
    });
    expect(result.task.durationMinutes).toBe(480);
    expect(result.task.workMinutes).toBe(960);
  });

  it('setAssignments on fixed_duration recomputes work', () => {
    const task = mkTask('t', { taskType: 'fixed_duration', durationMinutes: 480, workMinutes: 480 });
    const result = applyTaskEdit(task, [], {
      kind: 'setAssignments',
      assignments: [mkAssignment('t', 'a', 1), mkAssignment('t', 'b', 1)],
    });
    expect(result.task.durationMinutes).toBe(480);
    expect(result.task.workMinutes).toBe(960);
  });

  it('unassigned tasks behave like a single virtual full resource', () => {
    const task = mkTask('t', { taskType: 'fixed_units' });
    const result = applyTaskEdit(task, [], { kind: 'setWork', workMinutes: 1440 });
    expect(result.task.durationMinutes).toBe(1440);
  });

  it('milestones pin duration and work to zero', () => {
    const task = mkTask('m', { isMilestone: true, durationMinutes: 480, workMinutes: 480 });
    const result = applyTaskEdit(task, [], { kind: 'setDuration', durationMinutes: 960 });
    expect(result.task.durationMinutes).toBe(0);
    expect(result.task.workMinutes).toBe(0);
  });
});
