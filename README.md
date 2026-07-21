# WWPro – Projektplanung mit automatischer Terminberechnung

WWPro ist ein Projektverwaltungs-Tool im Stil von MS Project: Projekte, Aufgaben,
Mitarbeiter und Kalender — mit einer eigenen Scheduling-Engine, die Start- und
Endtermine automatisch aus Arbeitszeit, Abhängigkeiten und Arbeitskalendern
berechnet.

## Features

- **Automatische Terminberechnung** — Aufgaben nach MS-Project-Semantik:
  `Arbeit = Dauer × Zuweisung` mit den Berechnungsarten *Feste Zuweisung*,
  *Feste Arbeit* und *Feste Dauer*. Termine folgen aus Arbeitszeit, aus
  Start+Ende oder aus der Kombination.
- **Abhängigkeiten** — Ende–Anfang, Anfang–Anfang, Ende–Ende, Anfang–Ende,
  jeweils mit positivem/negativem Puffer (in Arbeitszeit), inkl. Zyklus-Schutz.
- **Einstellbare Work Week** — Arbeitstage und Tageszeiten pro Kalender
  (z. B. Mo–Fr 8h, Teilzeit vormittags), Feiertags-Import für alle deutschen
  Bundesländer (lokal berechnet, inkl. Oster-Formel), Sondertage und halbe Tage.
- **Mitarbeiter & Abwesenheiten** — eigener Kalender je Mitarbeiter (Teilzeit),
  Urlaub/Krankheit verschiebt zugewiesene Aufgaben automatisch.
- **Interaktives Gantt** — Drag zum Verschieben, Kanten-Drag zum Ändern der
  Dauer, Drag-to-Link für Abhängigkeiten, Ghost-Preview („Was-wäre-wenn“)
  während jedes Drags, kritischer Pfad mit Puffer-Whiskern, Heute-Linie,
  Wochenend-/Feiertags-/Abwesenheits-Schattierung, Zoom Tag/Woche/Monat/Quartal,
  virtualisiert für 1.000+ Aufgaben.
- **„Warum dieses Datum?“** — jede berechnete Zeit erklärt sich selbst:
  welche Abhängigkeit, welche Einschränkung, welcher Kalender-Sprung maßgeblich war.
- **Team-Auslastung** — Heatmap Mitarbeiter × Tage mit Kapazität aus dem
  jeweiligen Kalender, Überlastung, Abwesenheiten und Task-Drilldown.
- **Versteckte UI** — ⌘K-Command-Palette, Hover-Cards, Inline-Editing,
  Kontextmenüs, Slide-over-Detailpanel (deep-linkbar via `?task=`),
  durchgängige Tastatursteuerung, Undo-Toast beim Löschen.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript strict · Tailwind CSS v4 ·
shadcn/ui · TanStack Query & Virtual · Zustand · Zod · react-hook-form · Vitest.

## Starten

```bash
npm install
npm run dev
```

Beim ersten Start wird `data/wwpro.db.json` mit einem Demo-Projekt angelegt
(JSON-Datei-Store, kein Setup nötig). Die App läuft auf http://localhost:3000.

```bash
npm run test    # Engine- und Logik-Tests (Vitest)
npm run build   # Produktions-Build
```

## Architektur

- `engine/` — **pure TypeScript Scheduling-Engine** (keine React/Next-Imports):
  DST-freie Arbeitszeit-Arithmetik (`WorkMoment` = Datum + Minute), Kalender-
  Kompilierung (Wochentemplate → Ausnahmen → Abwesenheiten), topologischer
  Forward-Pass, CPM-Backward-Pass (kritischer Pfad, Puffer), Auslastung,
  strukturierte Erklärungen, deutscher Feiertags-Generator. Vollständig
  unit-getestet.
- `lib/store/` — Persistenz hinter einem Store-Interface. v1: JSON-Datei-Store
  (`data/wwpro.db.json`). Das Supabase-Schema liegt als Migration unter
  `supabase/migrations/` bereit (identische Zeilenformen, RLS default-deny,
  Zugriff ausschließlich serverseitig) — ein Drop-in-Wechsel.
- `app/api/` — schlanke, Zod-validierte Route-Handler; **die Datenbank ist nie
  vom Client erreichbar**.
- `lib/queries/` — TanStack-Query-Hooks. Zentrales Muster: Edit →
  synchroner Engine-Recompute → optimistisches Cache-Update → EIN
  Batch-Persist der geänderten Zeilen.
- `features/` — Feature-Ordner (gantt, tasks, projects, team, employees,
  calendars, shell) mit `pages/` + `components/`.

## Zeitzonen

Die Engine rechnet ausschließlich mit Kalenderdatum + Tagesminute und ist damit
per Konstruktion DST-frei. Konvertierung nach UTC passiert nur an der
Persistenz-Grenze (`lib/mappers.ts`, Workspace-Zeitzone, Standard
`Europe/Berlin`).
