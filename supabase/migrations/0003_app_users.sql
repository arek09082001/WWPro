-- Application users for NextAuth credentials login (password hashes via bcrypt).

create table app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  name text,
  created_at timestamptz not null default now()
);

alter table app_users enable row level security;
