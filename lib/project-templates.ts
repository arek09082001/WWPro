/**
 * Project templates: prebuilt task structures (sections, plans, dependencies)
 * that can be instantiated into a fresh project. Currently one template for a
 * railway bridge (Eisenbahnüberführung) covering the complete structural
 * engineering scope: Grundlagen, Statik, Übersichts-/Positionspläne,
 * Schalpläne, Bewehrungspläne und Ausschreibung.
 */

import { generateKeyBetween } from 'fractional-indexing';
import { addDays } from '@/engine/date-utils';
import type { DepType, IsoDate } from '@/engine/types';
import type { PlanCategory, PlanStatus } from '@/lib/plan-meta';
import type { DependencyRow, TaskRow } from '@/lib/store/types';

/** Available template ids ('leer' creates no tasks). */
export type ProjectTemplateId = 'leer' | 'eisenbahnbruecke';

/** Display metadata of a template for the create-project dialog. */
export interface ProjectTemplateMeta {
  id: ProjectTemplateId;
  label: string;
  description: string;
}

/** Templates offered in the create-project dialog. */
export const PROJECT_TEMPLATES: ProjectTemplateMeta[] = [
  {
    id: 'leer',
    label: 'Leeres Projekt',
    description: 'Startet ohne Aufgaben — Abschnitte und Pläne selbst anlegen.',
  },
  {
    id: 'eisenbahnbruecke',
    label: 'Eisenbahnbrücke (EÜ)',
    description:
      'Komplette Tragwerksplanung: Grundlagen, Statik, Übersichts- & Positionspläne, Schal- und Bewehrungspläne, Ausschreibung.',
  },
];

/** Blueprint of one template task before ids/sort keys are generated. */
interface TaskSpec {
  /** Template-local key used for parent/dependency references. */
  key: string;
  name: string;
  /** Section header (summary) — children reference it via `parent`. */
  parent?: string;
  /** Duration in working days (ignored for milestones). */
  days?: number;
  category?: PlanCategory;
  planNumber?: string;
  status?: PlanStatus;
  milestone?: boolean;
  /** Due date as calendar-day offset from the project start. */
  dueOffset?: number;
  notes?: string;
}

/** Blueprint of one template dependency. */
interface DepSpec {
  from: string;
  to: string;
  type?: DepType;
  /** Lag in working days. */
  lagDays?: number;
}

const DAY = 480;

/**
 * Task/dependency blueprint of the railway bridge template. Sections are
 * summary tasks; every plan the office typically delivers for an EÜ is
 * included, plus the tender (Ausschreibung) phase.
 */
const EISENBAHNBRUECKE: { tasks: TaskSpec[]; deps: DepSpec[] } = {
  tasks: [
    // ── Abschnitt 1: Grundlagen & Vorplanung ─────────────────────────────
    { key: 'grundlagen', name: 'Grundlagen & Vorplanung' },
    { key: 'bestand', name: 'Bestandsunterlagen & Baugrundgutachten auswerten', parent: 'grundlagen', days: 2, status: 'in_bearbeitung' },
    { key: 'vermessung', name: 'Vermessung & Bestandsaufnahme', parent: 'grundlagen', days: 2, status: 'in_bearbeitung' },
    { key: 'lichtraum', name: 'Lichtraumprofil & Kreuzungsmaße prüfen', parent: 'grundlagen', days: 1 },
    { key: 'vorstatik', name: 'Vorstatik & Machbarkeitsprüfung', parent: 'grundlagen', days: 3, category: 'berechnung', planNumber: 'ST-00' },

    // ── Abschnitt 2: Statische Berechnung ────────────────────────────────
    { key: 'statik', name: 'Statische Berechnung' },
    { key: 'lasten', name: 'Lastannahmen Eisenbahnverkehr (LM 71 / SW/2)', parent: 'statik', days: 2, category: 'berechnung', planNumber: 'ST-01' },
    { key: 'st-gruendung', name: 'Statik Gründung & Baugrube', parent: 'statik', days: 4, category: 'berechnung', planNumber: 'ST-02' },
    { key: 'st-widerlager', name: 'Statik Widerlager & Flügelwände', parent: 'statik', days: 5, category: 'berechnung', planNumber: 'ST-03' },
    { key: 'st-ueberbau', name: 'Statik Überbau', parent: 'statik', days: 6, category: 'berechnung', planNumber: 'ST-04' },
    { key: 'ermuedung', name: 'Ermüdungs- & Gebrauchstauglichkeitsnachweise', parent: 'statik', days: 3, category: 'berechnung', planNumber: 'ST-05' },
    { key: 'einreichung', name: 'Einreichung Prüfingenieur', parent: 'statik', milestone: true, category: 'berechnung', dueOffset: 40 },

    // ── Abschnitt 3: Übersichts- & Positionspläne ────────────────────────
    { key: 'positionsplaene', name: 'Übersichts- & Positionspläne' },
    { key: 'uebersichtsplan', name: 'Übersichtsplan', parent: 'positionsplaene', days: 3, category: 'positionsplan', planNumber: 'P-100' },
    { key: 'pos-gruendung', name: 'Positionsplan Gründung & Widerlager', parent: 'positionsplaene', days: 2, category: 'positionsplan', planNumber: 'P-101' },
    { key: 'pos-ueberbau', name: 'Positionsplan Überbau', parent: 'positionsplaene', days: 2, category: 'positionsplan', planNumber: 'P-102' },

    // ── Abschnitt 4: Schalpläne ──────────────────────────────────────────
    { key: 'schalplaene', name: 'Schalpläne' },
    { key: 'schal-fundamente', name: 'Schalplan Fundamente', parent: 'schalplaene', days: 3, category: 'schalplan', planNumber: 'S-100' },
    { key: 'schal-wl10', name: 'Schalplan Widerlager Achse 10', parent: 'schalplaene', days: 4, category: 'schalplan', planNumber: 'S-101' },
    { key: 'schal-wl20', name: 'Schalplan Widerlager Achse 20', parent: 'schalplaene', days: 4, category: 'schalplan', planNumber: 'S-102' },
    { key: 'schal-fluegel', name: 'Schalplan Flügelwände', parent: 'schalplaene', days: 3, category: 'schalplan', planNumber: 'S-103' },
    { key: 'schal-ueberbau', name: 'Schalplan Überbau', parent: 'schalplaene', days: 5, category: 'schalplan', planNumber: 'S-104' },
    { key: 'schal-kappen', name: 'Schalplan Kappen & Geländer', parent: 'schalplaene', days: 2, category: 'schalplan', planNumber: 'S-105' },

    // ── Abschnitt 5: Bewehrungspläne ─────────────────────────────────────
    { key: 'bewehrungsplaene', name: 'Bewehrungspläne' },
    { key: 'bew-fundamente', name: 'Bewehrung Fundamente', parent: 'bewehrungsplaene', days: 4, category: 'bewehrungsplan', planNumber: 'B-100' },
    { key: 'bew-wl10', name: 'Bewehrung Widerlager Achse 10', parent: 'bewehrungsplaene', days: 5, category: 'bewehrungsplan', planNumber: 'B-101' },
    { key: 'bew-wl20', name: 'Bewehrung Widerlager Achse 20', parent: 'bewehrungsplaene', days: 5, category: 'bewehrungsplan', planNumber: 'B-102' },
    { key: 'bew-fluegel', name: 'Bewehrung Flügelwände', parent: 'bewehrungsplaene', days: 3, category: 'bewehrungsplan', planNumber: 'B-103' },
    { key: 'bew-ueberbau', name: 'Bewehrung Überbau', parent: 'bewehrungsplaene', days: 6, category: 'bewehrungsplan', planNumber: 'B-104' },
    { key: 'bew-kappen', name: 'Bewehrung Kappen', parent: 'bewehrungsplaene', days: 2, category: 'bewehrungsplan', planNumber: 'B-105' },

    // ── Abschnitt 6: Ausschreibung & Vergabe ─────────────────────────────
    { key: 'ausschreibung', name: 'Ausschreibung & Vergabe' },
    { key: 'baubeschreibung', name: 'Baubeschreibung', parent: 'ausschreibung', days: 2 },
    { key: 'lv', name: 'Leistungsverzeichnis (LV) erstellen', parent: 'ausschreibung', days: 4 },
    { key: 'kosten', name: 'Kostenberechnung', parent: 'ausschreibung', days: 2 },
    { key: 'versand', name: 'Versand Ausschreibungsunterlagen', parent: 'ausschreibung', milestone: true, dueOffset: 42 },
    { key: 'angebote', name: 'Angebotsauswertung & Vergabevorschlag', parent: 'ausschreibung', days: 3 },

    // ── Schlussmeilenstein ───────────────────────────────────────────────
    { key: 'planlieferung', name: 'Planlieferung komplett', milestone: true, dueOffset: 55 },
  ],
  deps: [
    { from: 'bestand', to: 'vorstatik' },
    { from: 'vermessung', to: 'vorstatik' },
    { from: 'vermessung', to: 'uebersichtsplan' },
    { from: 'lichtraum', to: 'uebersichtsplan' },
    // Statik-Kette
    { from: 'vorstatik', to: 'lasten' },
    { from: 'lasten', to: 'st-gruendung' },
    { from: 'st-gruendung', to: 'st-widerlager' },
    { from: 'st-widerlager', to: 'st-ueberbau' },
    { from: 'st-ueberbau', to: 'ermuedung' },
    { from: 'ermuedung', to: 'einreichung' },
    // Übersichts-/Positionspläne
    { from: 'vorstatik', to: 'uebersichtsplan' },
    { from: 'uebersichtsplan', to: 'pos-gruendung' },
    { from: 'uebersichtsplan', to: 'pos-ueberbau' },
    // Schalpläne folgen der jeweiligen Statik
    { from: 'st-gruendung', to: 'schal-fundamente' },
    { from: 'pos-gruendung', to: 'schal-fundamente' },
    { from: 'st-widerlager', to: 'schal-wl10' },
    { from: 'st-widerlager', to: 'schal-wl20', type: 'SS', lagDays: 2 },
    { from: 'st-widerlager', to: 'schal-fluegel' },
    { from: 'st-ueberbau', to: 'schal-ueberbau' },
    { from: 'schal-ueberbau', to: 'schal-kappen' },
    // Bewehrung erst, wenn der Schalplan fertig ist
    { from: 'schal-fundamente', to: 'bew-fundamente' },
    { from: 'schal-wl10', to: 'bew-wl10' },
    { from: 'schal-wl20', to: 'bew-wl20' },
    { from: 'schal-fluegel', to: 'bew-fluegel' },
    { from: 'schal-ueberbau', to: 'bew-ueberbau' },
    { from: 'ermuedung', to: 'bew-ueberbau' },
    { from: 'schal-kappen', to: 'bew-kappen' },
    // Ausschreibung
    { from: 'uebersichtsplan', to: 'baubeschreibung' },
    { from: 'baubeschreibung', to: 'lv' },
    { from: 'st-ueberbau', to: 'lv' },
    { from: 'lv', to: 'kosten' },
    { from: 'kosten', to: 'versand' },
    // Angebotsfrist der Bieter (~3 Wochen)
    { from: 'versand', to: 'angebote', lagDays: 15 },
    // Alles mündet in die Planlieferung
    { from: 'bew-fundamente', to: 'planlieferung' },
    { from: 'bew-wl10', to: 'planlieferung' },
    { from: 'bew-wl20', to: 'planlieferung' },
    { from: 'bew-fluegel', to: 'planlieferung' },
    { from: 'bew-ueberbau', to: 'planlieferung' },
    { from: 'bew-kappen', to: 'planlieferung' },
  ],
};

/** Instantiated template content ready for the batch/dependency APIs. */
export interface TemplateInstance {
  tasks: TaskRow[];
  dependencies: Omit<DependencyRow, 'id'>[];
}

/**
 * Instantiates a template into concrete task/dependency rows.
 * @param templateId - Which template to build ('leer' yields empty lists).
 * @param projectId - Target project id set on every row.
 * @param projectStart - Project start date (anchors template due dates).
 * @param makeId - Id factory (defaults to crypto.randomUUID; injectable for seeds).
 * @returns Tasks in display order plus dependency rows referencing them.
 */
export function buildProjectTemplate(
  templateId: ProjectTemplateId,
  projectId: string,
  projectStart: IsoDate,
  makeId: (key: string) => string = () => crypto.randomUUID(),
): TemplateInstance {
  if (templateId !== 'eisenbahnbruecke') return { tasks: [], dependencies: [] };
  const { tasks: specs, deps } = EISENBAHNBRUECKE;

  const idByKey = new Map<string, string>(specs.map((spec) => [spec.key, makeId(spec.key)]));
  let sortKey: string | null = null;
  const tasks: TaskRow[] = specs.map((spec) => {
    sortKey = generateKeyBetween(sortKey, null);
    const minutes = spec.milestone ? 0 : (spec.days ?? 1) * DAY;
    return {
      id: idByKey.get(spec.key)!,
      projectId,
      parentId: spec.parent ? idByKey.get(spec.parent)! : null,
      sortKey,
      name: spec.name,
      taskType: 'fixed_units',
      schedulingMode: 'auto',
      isMilestone: spec.milestone ?? false,
      constraintType: 'asap',
      constraintDate: null,
      startAt: null,
      endAt: null,
      durationMinutes: minutes,
      workMinutes: minutes,
      percentComplete: 0,
      notes: spec.notes ?? null,
      category: spec.category ?? 'sonstiges',
      planNumber: spec.planNumber ?? null,
      status: spec.status ?? 'entwurf',
      dueDate: spec.dueOffset !== undefined ? addDays(projectStart, spec.dueOffset) : null,
    };
  });

  const dependencies: Omit<DependencyRow, 'id'>[] = deps.map((dep) => ({
    projectId,
    predecessorId: idByKey.get(dep.from)!,
    successorId: idByKey.get(dep.to)!,
    type: dep.type ?? 'FS',
    lagMinutes: (dep.lagDays ?? 0) * DAY,
  }));

  return { tasks, dependencies };
}
