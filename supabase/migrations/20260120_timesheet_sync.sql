-- Timesheet + settings storage in Postgres (avoid auth.user_metadata to prevent oversized JWT)

-- 1) Timesheet rows (one row per work day entry)
create table if not exists public.timesheet_rows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  work_date date not null,
  start_time text not null,
  end_time text not null,
  break_minutes int not null default 0,
  hours numeric not null,
  wage numeric not null,
  overtime_pay numeric not null,
  total_pay numeric not null,
  holiday text not null default 'none',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, work_date)
);

create index if not exists timesheet_rows_user_date_idx
  on public.timesheet_rows (user_id, work_date);

-- keep updated_at fresh
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_timesheet_rows_updated_at on public.timesheet_rows;
create trigger trg_timesheet_rows_updated_at
before update on public.timesheet_rows
for each row execute function public.set_updated_at();

-- 2) Pay settings (one row per user)
create table if not exists public.pay_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  cycles_per_month int not null default 2,
  paydays jsonb not null default '[20,5]'::jsonb,
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_pay_settings_updated_at on public.pay_settings;
create trigger trg_pay_settings_updated_at
before update on public.pay_settings
for each row execute function public.set_updated_at();

-- 3) RLS
alter table public.timesheet_rows enable row level security;
alter table public.pay_settings enable row level security;

drop policy if exists "timesheet_rows_select_own" on public.timesheet_rows;
create policy "timesheet_rows_select_own"
on public.timesheet_rows for select
using (auth.uid() = user_id);

drop policy if exists "timesheet_rows_insert_own" on public.timesheet_rows;
create policy "timesheet_rows_insert_own"
on public.timesheet_rows for insert
with check (auth.uid() = user_id);

drop policy if exists "timesheet_rows_update_own" on public.timesheet_rows;
create policy "timesheet_rows_update_own"
on public.timesheet_rows for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "timesheet_rows_delete_own" on public.timesheet_rows;
create policy "timesheet_rows_delete_own"
on public.timesheet_rows for delete
using (auth.uid() = user_id);

drop policy if exists "pay_settings_select_own" on public.pay_settings;
create policy "pay_settings_select_own"
on public.pay_settings for select
using (auth.uid() = user_id);

drop policy if exists "pay_settings_upsert_own" on public.pay_settings;
create policy "pay_settings_upsert_own"
on public.pay_settings for insert
with check (auth.uid() = user_id);

drop policy if exists "pay_settings_update_own" on public.pay_settings;
create policy "pay_settings_update_own"
on public.pay_settings for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

