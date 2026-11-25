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
-- Money that really arrived (filled from the GCash messages your phone forwards); lets the app check the exact amount.
create table if not exists public.incoming_payments (
  reference  text primary key,
  amount     numeric,
  raw        text,
  created_at timestamptz not null default now()
);
-- A person taps "Pay" and gets their own amount (for example 10.37). The GCash message with that amount unlocks their account.
create table if not exists public.payment_requests (
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users(id) on delete cascade,
  email      text,
  plan       text,
  amount     numeric,
  status     text not null default 'open',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
-- Only the Komute server (secret key) can read or change these tables. Users cannot give themselves free months.
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;
alter table public.manual_payments enable row level security;
alter table public.incoming_payments enable row level security;
alter table public.payment_requests enable row level security;
grant select, insert, update on public.subscriptions, public.payments, public.manual_payments, public.incoming_payments, public.payment_requests to service_role;
