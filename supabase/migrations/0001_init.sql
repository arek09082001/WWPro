-- WWPro initial schema (Postgres 17 / Supabase).
-- v1 runs without end-user auth: RLS is ENABLED on every table with NO
-- policies (default deny). All access goes through the app server using the
-- service-role key, which bypasses RLS. Adding auth later only requires
-- policies + workspace_members, no schema migration.

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  timezone text not null default 'Europe/Berlin',
  default_calendar_id uuid,
  bundesland text,
  created_at timestamptz not null default now()
);

create table calendars (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  name text not null,
  kind text not null check (kind in ('base', 'resource')),
  base_calendar_id uuid references calendars,
  -- 7 entries Monday..Sunday: {"working": bool, "intervals": [[480,720],...]}
  week jsonb not null,
  created_at timestamptz not null default now()
);

alter table workspaces
  add constraint workspaces_default_calendar_fk
  foreign key (default_calendar_id) references calendars;

create table calendar_exceptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  calendar_id uuid not null references calendars on delete cascade,
  date date not null,
  name text not null,
  working boolean not null default false,
  intervals jsonb,
  unique (calendar_id, date)
);

create table employees (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  name text not null,
  email text,
  calendar_id uuid references calendars,
  color text not null default '#6366f1',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table absences (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  employee_id uuid not null references employees on delete cascade,
  type text not null check (type in ('vacation', 'sick', 'other')),
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  note text
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  name text not null,
  code text,
  status text not null default 'active' check (status in ('active', 'on_hold', 'done', 'archived')),
  start_date date not null,
  calendar_id uuid not null references calendars,
  color text not null default '#0ea5e9',
  created_at timestamptz not null default now()
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  project_id uuid not null references projects on delete cascade,
  parent_id uuid references tasks on delete cascade,
  sort_key text not null,
  name text not null,
  task_type text not null default 'fixed_units'
    check (task_type in ('fixed_units', 'fixed_work', 'fixed_duration')),
  scheduling_mode text not null default 'auto' check (scheduling_mode in ('auto', 'manual')),
  is_milestone boolean not null default false,
  constraint_type text not null default 'asap'
    check (constraint_type in ('asap', 'start_no_earlier_than', 'must_start_on')),
  constraint_date date,
  start_at timestamptz,
  end_at timestamptz,
  duration_minutes int not null default 480,
  work_minutes int not null default 480,
  percent_complete int not null default 0 check (percent_complete between 0 and 100),
  notes text
);
create index tasks_project_sort on tasks (project_id, sort_key);

create table task_dependencies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  project_id uuid not null references projects on delete cascade,
  predecessor_id uuid not null references tasks on delete cascade,
  successor_id uuid not null references tasks on delete cascade,
  type text not null default 'FS' check (type in ('FS', 'SS', 'FF', 'SF')),
  lag_minutes int not null default 0,
  unique (predecessor_id, successor_id),
  check (predecessor_id <> successor_id)
);

create table task_assignments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  task_id uuid not null references tasks on delete cascade,
  employee_id uuid not null references employees on delete cascade,
  units numeric(4,2) not null default 1.0 check (units > 0 and units <= 2.0),
  unique (task_id, employee_id)
);

-- Default deny: RLS on, no policies. Service-role access only.
alter table workspaces enable row level security;
alter table calendars enable row level security;
alter table calendar_exceptions enable row level security;
alter table employees enable row level security;
alter table absences enable row level security;
alter table projects enable row level security;
alter table tasks enable row level security;
alter table task_dependencies enable row level security;
alter table task_assignments enable row level security;
