-- Komute accounts: paste this in Supabase -> SQL Editor -> Run (once).
-- Free route plans used and "unlimited until" date, one row per user
create table if not exists public.subscriptions (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  free_used  int not null default 0,
  paid_until timestamptz
);
-- Every PayMongo payment, so a payment is never counted twice
create table if not exists public.payments (
  checkout_id text primary key,
  user_id     uuid references auth.users(id) on delete cascade,
  plan        text,
  amount      int,
  created_at  timestamptz not null default now()
);
-- Manual payments (people pay your GCash/Maya/bank and send the reference number; you approve them)
create table if not exists public.manual_payments (
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users(id) on delete cascade,
  email      text,
  plan       text,
  amount     int,
  reference  text unique,
  status     text not null default 'pending',
  created_at timestamptz not null default now()
);
-- Only the Komute server (secret key) can read or change these tables. Users cannot give themselves free months.
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;
alter table public.manual_payments enable row level security;
grant select, insert, update on public.subscriptions, public.payments, public.manual_payments to service_role;
