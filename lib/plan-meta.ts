/**
 * Domain semantics of engineering-office plans (Tragwerksplanung/Statik):
 * plan categories with fixed colors/icons and the plan status workflow.
 * Shared by Gantt, plan list and detail sheet so the color language is
 * consistent everywhere.
 */

import type { LucideIcon } from 'lucide-react';
import { Calculator, FileText, Grid3x3, LandPlot, Layers } from 'lucide-react';

/** Plan categories used in structural engineering offices. */
export type PlanCategory = 'positionsplan' | 'schalplan' | 'bewehrungsplan' | 'berechnung' | 'sonstiges';

/** Plan status workflow: draft → in progress → checking → released. */
export type PlanStatus = 'entwurf' | 'in_bearbeitung' | 'zur_pruefung' | 'freigegeben';

/** Display metadata of a plan category. */
export interface PlanCategoryMeta {
  label: string;
  /** Bar/badge color (hex). */
  color: string;
  icon: LucideIcon;
  /** Short code used as prefix suggestion for plan numbers. */
  code: string;
}

/** Category metadata, keyed by category. */
export const PLAN_CATEGORIES: Record<PlanCategory, PlanCategoryMeta> = {
  positionsplan: { label: 'Positionsplan', color: '#8b5cf6', icon: LandPlot, code: 'P' },
  schalplan: { label: 'Schalplan', color: '#0ea5e9', icon: Layers, code: 'S' },
  bewehrungsplan: { label: 'Bewehrungsplan', color: '#10b981', icon: Grid3x3, code: 'B' },
  berechnung: { label: 'Statische Berechnung', color: '#f59e0b', icon: Calculator, code: 'ST' },
  sonstiges: { label: 'Sonstiges', color: '#64748b', icon: FileText, code: '' },
};

/** Display metadata of a plan status. */
export interface PlanStatusMeta {
  label: string;
  /** Dot/badge color (hex). */
  color: string;
  /** Tailwind classes for badges. */
  badgeClass: string;
}

/** Status metadata in workflow order. */
export const PLAN_STATUSES: Record<PlanStatus, PlanStatusMeta> = {
  entwurf: { label: 'Entwurf', color: '#94a3b8', badgeClass: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  in_bearbeitung: { label: 'In Bearbeitung', color: '#3b82f6', badgeClass: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
  zur_pruefung: { label: 'Zur Prüfung', color: '#f59e0b', badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300' },
  freigegeben: { label: 'Freigegeben', color: '#10b981', badgeClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300' },
};

/** Workflow order for status advancing. */
export const PLAN_STATUS_ORDER: PlanStatus[] = ['entwurf', 'in_bearbeitung', 'zur_pruefung', 'freigegeben'];

/** All categories in display order. */
export const PLAN_CATEGORY_ORDER: PlanCategory[] = [
  'berechnung', 'positionsplan', 'schalplan', 'bewehrungsplan', 'sonstiges',
];
