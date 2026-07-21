-- Engineering-office plan semantics on tasks: category, plan number,
-- workflow status and agreed delivery date.

alter table tasks
  add column category text not null default 'sonstiges'
    check (category in ('positionsplan', 'schalplan', 'bewehrungsplan', 'berechnung', 'sonstiges')),
  add column plan_number text,
  add column status text not null default 'in_bearbeitung'
    check (status in ('entwurf', 'in_bearbeitung', 'zur_pruefung', 'freigegeben')),
  add column due_date date;
