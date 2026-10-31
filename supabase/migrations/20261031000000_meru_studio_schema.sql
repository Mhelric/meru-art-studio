-- ============================================================================
-- Meru Art Studio — Phase 3 Database Schema, Views, Storage & RLS Policies
-- Target: Supabase PostgreSQL 15+
-- ============================================================================

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 0. Helper: Identify the Artist Admin
-- Replace the fallback UUID below with your Supabase auth.users UID, OR set
-- `raw_app_meta_data = '{"role":"artist"}'` on your admin user in Supabase Auth.
-- ----------------------------------------------------------------------------
create or replace function public.is_artist_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'artist'
    or auth.uid() = nullif(current_setting('app.artist_admin_uid', true), '')::uuid,
    false
  );
$$;

-- ----------------------------------------------------------------------------
-- 1. Enums & Domain Constraints
-- ----------------------------------------------------------------------------
do $$ begin
  create type public.commission_tier as enum ('headshot', 'halfbody', 'fullbody', 'chibi', 'graphics');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.currency_code as enum ('USD', 'PHP');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_split_mode as enum ('50_50', '100_upfront');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.commission_stage as enum (
    'pending_review',
    'awaiting_deposit',
    'sketching',
    'sketch_approval',
    'lineart_coloring',
    'completed',
    'declined',
    'cancelled'
  );
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- 2. Table: studio_settings (Singleton row id = 1)
-- Stores live open/waitlist/closed state, slot cap, dynamic tier prices,
-- add-on multipliers, USD->PHP exchange rate, and blocked date ranges.
-- ----------------------------------------------------------------------------
create table if not exists public.studio_settings (
  id smallint primary key default 1 check (id = 1),
  is_open boolean not null default true,
  availability_status text not null default 'open' check (availability_status in ('open', 'waitlist', 'closed')),
  max_slots smallint not null default 5 check (max_slots between 1 and 20),
  base_prices_json jsonb not null default '{
    "headshot": 15,
    "halfbody": 25,
    "fullbody": 40,
    "chibi": 10,
    "graphics": 5
  }'::jsonb,
  multipliers_json jsonb not null default '{
    "nsfw": 0.5,
    "softFurry": 0.5,
    "commercial": 2.0
  }'::jsonb,
  usd_to_php_rate numeric(8, 2) not null default 58.00 check (usd_to_php_rate > 0),
  blocked_dates jsonb not null default '[
    {"id":"block-1","startDate":"2026-11-20","endDate":"2026-11-23","reason":"CS Midterm Exams · Studio Paused"},
    {"id":"block-2","startDate":"2026-12-12","endDate":"2026-12-14","reason":"Artist Rest & Finals Prep"}
  ]'::jsonb,
  updated_at timestamptz not null default now()
);

-- Seed singleton row
insert into public.studio_settings (id)
values (1)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 3. Table: commissions
-- Core order record. New requests MUST start in `pending_review` and do NOT
-- deduct an active slot until the artist transitions `status_stage` to an
-- active stage (`awaiting_deposit`, `sketching`, `sketch_approval`, `lineart_coloring`).
-- ----------------------------------------------------------------------------
create table if not exists public.commissions (
  id uuid primary key default gen_random_uuid(),
  order_code text not null unique default ('MRU-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))),
  client_id uuid not null references auth.users(id) on delete cascade,
  client_handle text not null default 'anonymous',
  tier public.commission_tier not null,
  character_count smallint not null default 1 check (character_count between 1 and 4),
  addons jsonb not null default '{"nsfw":false,"softFurry":false,"commercial":false}'::jsonb,
  currency public.currency_code not null default 'USD',
  payment_split public.payment_split_mode not null default '50_50',
  total_price numeric(10, 2) not null check (total_price >= 0),
  deposit_due numeric(10, 2) not null check (deposit_due >= 0),
  deposit_paid boolean not null default false,
  final_paid boolean not null default false,
  status_stage public.commission_stage not null default 'pending_review',
  progress smallint not null default 0 check (progress between 0 and 100),
  character_name text not null default '',
  pose_and_vibe text not null,
  background_notes text not null default '',
  reference_urls text[] not null default '{}',
  start_date date,
  est_end_date date,
  tos_accepted_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- SCAM & SPAM PROTECTION #1:
-- Partial unique index limiting each authenticated user (`client_id`) to at
-- most ONE `pending_review` commission request at a time. Once the artist
-- approves or declines the request, the client can submit another.
-- ----------------------------------------------------------------------------
create unique index if not exists idx_commissions_one_pending_per_client
  on public.commissions (client_id)
  where (status_stage = 'pending_review');

create index if not exists idx_commissions_client_id on public.commissions (client_id);
create index if not exists idx_commissions_status_stage on public.commissions (status_stage);

-- ----------------------------------------------------------------------------
-- SCAM & SPAM PROTECTION #2:
-- Trigger preventing clients from forging status_stage, payment flags, or
-- bypassing `pending_review` on INSERT or UPDATE.
-- ----------------------------------------------------------------------------
create or replace function public.enforce_commission_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    -- Force new client submissions into pending_review with unpaid flags
    if not public.is_artist_admin() then
      new.client_id := auth.uid();
      new.status_stage := 'pending_review';
      new.deposit_paid := false;
      new.final_paid := false;
      new.progress := 0;
    end if;
    if new.tos_accepted_at is null then
      raise exception 'Terms of Service acceptance timestamp is required.';
    end if;
  elsif TG_OP = 'UPDATE' then
    -- Only the artist admin may change stage, payment verification, or schedule dates
    if not public.is_artist_admin() then
      if new.status_stage is distinct from old.status_stage
         or new.deposit_paid is distinct from old.deposit_paid
         or new.final_paid is distinct from old.final_paid
         or new.total_price is distinct from old.total_price
         or new.deposit_due is distinct from old.deposit_due
         or new.start_date is distinct from old.start_date
         or new.est_end_date is distinct from old.est_end_date
      then
        raise exception 'Only the artist admin can update stage, pricing, or payment verification.';
      end if;
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_commission_integrity on public.commissions;
create trigger trg_enforce_commission_integrity
  before insert or update on public.commissions
  for each row execute function public.enforce_commission_integrity();

-- ----------------------------------------------------------------------------
-- 4. Public Read-Only View: public_queue_view
-- Safe anonymised projection for the public Availability & Queue Calendar.
-- Exposes ONLY active accepted slots (excludes `pending_review`, `declined`,
-- `cancelled`, and `completed`), masks the client handle (e.g. "k***o"),
-- and never leaks private briefs, contact info, or reference URLs.
-- ----------------------------------------------------------------------------
create or replace view public.public_queue_view
with (security_invoker = false)
as
select
  row_number() over (order by c.start_date nulls last, c.created_at asc)::int as slot_number,
  c.id,
  case
    when length(trim(c.client_handle)) <= 2 then left(trim(c.client_handle), 1) || '***'
    else left(trim(c.client_handle), 1) || '***' || right(trim(c.client_handle), 1)
  end as handle_hint,
  c.tier,
  c.status_stage as stage,
  case c.status_stage
    when 'awaiting_deposit' then 'Awaiting Deposit'
    when 'sketching' then 'Sketching'
    when 'sketch_approval' then 'Sketch Approval Gate'
    when 'lineart_coloring' then 'Lineart & Coloring'
    else 'In Progress'
  end as stage_label,
  c.progress,
  coalesce(c.start_date, current_date) as start_date,
  coalesce(c.est_end_date, (current_date + interval '14 days')::date) as est_end_date
from public.commissions c
where c.status_stage in ('awaiting_deposit', 'sketching', 'sketch_approval', 'lineart_coloring')
order by c.start_date nulls last, c.created_at asc;

grant select on public.public_queue_view to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5. Table: messages (Realtime Order Chat)
-- Strictly locked to the owning commission's client_id and the artist admin.
-- ----------------------------------------------------------------------------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  commission_id uuid not null references public.commissions(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  sender_role text not null default 'client' check (sender_role in ('client', 'artist')),
  body text not null default '',
  attachment_url text,
  attachment_kind text check (attachment_kind in ('receipt', 'redline', 'reference', 'other')),
  created_at timestamptz not null default now()
);

create index if not exists idx_messages_commission_id on public.messages (commission_id, created_at asc);

-- ----------------------------------------------------------------------------
-- 6. Table: wip_uploads (Watermarked WIPs & Final High-Res Unlock)
-- Watermarked previews are visible during progress; `high_res_url` is only
-- unlocked to the client once the parent commission reaches `completed`.
-- ----------------------------------------------------------------------------
create table if not exists public.wip_uploads (
  id uuid primary key default gen_random_uuid(),
  commission_id uuid not null references public.commissions(id) on delete cascade,
  stage public.commission_stage not null default 'sketching',
  title text not null,
  watermarked_url text not null,
  high_res_url text,
  is_final boolean not null default false,
  artist_note text not null default '',
  approved_by_client boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_wip_uploads_commission_id on public.wip_uploads (commission_id, created_at asc);

-- ----------------------------------------------------------------------------
-- 7. Row-Level Security (RLS) Policies
-- ----------------------------------------------------------------------------
alter table public.studio_settings enable row level security;
alter table public.commissions enable row level security;
alter table public.messages enable row level security;
alter table public.wip_uploads enable row level security;

-- studio_settings: public read, artist admin write
drop policy if exists "studio_settings_public_read" on public.studio_settings;
create policy "studio_settings_public_read"
  on public.studio_settings for select
  to anon, authenticated
  using (true);

drop policy if exists "studio_settings_artist_write" on public.studio_settings;
create policy "studio_settings_artist_write"
  on public.studio_settings for all
  to authenticated
  using (public.is_artist_admin())
  with check (public.is_artist_admin());

-- commissions: private to owning client_id or artist admin
drop policy if exists "commissions_owner_or_artist_select" on public.commissions;
create policy "commissions_owner_or_artist_select"
  on public.commissions for select
  to authenticated
  using (client_id = auth.uid() or public.is_artist_admin());

drop policy if exists "commissions_client_insert" on public.commissions;
create policy "commissions_client_insert"
  on public.commissions for insert
  to authenticated
  with check (
    client_id = auth.uid()
    and status_stage = 'pending_review'
    and tos_accepted_at is not null
  );

drop policy if exists "commissions_owner_or_artist_update" on public.commissions;
create policy "commissions_owner_or_artist_update"
  on public.commissions for update
  to authenticated
  using (client_id = auth.uid() or public.is_artist_admin())
  with check (client_id = auth.uid() or public.is_artist_admin());

drop policy if exists "commissions_artist_delete" on public.commissions;
create policy "commissions_artist_delete"
  on public.commissions for delete
  to authenticated
  using (public.is_artist_admin());

-- Helper to check if the current user owns a commission or is the artist admin
create or replace function public.can_access_commission(target_commission_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.commissions c
    where c.id = target_commission_id
      and (c.client_id = auth.uid() or public.is_artist_admin())
  );
$$;

-- messages: strictly locked to owning client_id and artist admin
drop policy if exists "messages_participant_select" on public.messages;
create policy "messages_participant_select"
  on public.messages for select
  to authenticated
  using (public.can_access_commission(commission_id));

drop policy if exists "messages_participant_insert" on public.messages;
create policy "messages_participant_insert"
  on public.messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and public.can_access_commission(commission_id)
  );

-- wip_uploads: participants can read; only artist admin can insert/delete
drop policy if exists "wip_uploads_participant_select" on public.wip_uploads;
create policy "wip_uploads_participant_select"
  on public.wip_uploads for select
  to authenticated
  using (public.can_access_commission(commission_id));

drop policy if exists "wip_uploads_artist_write" on public.wip_uploads;
create policy "wip_uploads_artist_write"
  on public.wip_uploads for all
  to authenticated
  using (public.is_artist_admin())
  with check (public.is_artist_admin());

-- ----------------------------------------------------------------------------
-- 8. Supabase Realtime Publication
-- Enables live order stage transitions, WIP drops, and chat messages.
-- ----------------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.commissions;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.wip_uploads;
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- 9. Storage Buckets (references, receipts, wips)
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values
  ('commission-references', 'commission-references', false),
  ('commission-wips', 'commission-wips', false)
on conflict (id) do nothing;
