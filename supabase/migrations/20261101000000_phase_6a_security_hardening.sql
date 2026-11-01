-- ============================================================================
-- Meru Art Studio — Phase 6A Security Hardening & Data Model Integrity (Revision 2)
-- Addresses Argon Senior Audit Feedback:
--   1. Server-side price recalculation on UPDATE during pending_review
--   2. Strict clamp (1..4) on character_count against zero/negative bypass
--   3. Comprehensive non-admin UPDATE guard covering all protected columns
--   4. Row lock on studio_settings (FOR UPDATE) to prevent slot-cap TOCTOU race
--   5. Safe JSONB boolean checks preventing 22P02 type casting errors
--   6. Unconditional server now() on message insertion & immutable message trigger
--   7. Automated audit stamp trigger on payments (verified_by, verified_at, updated_at)
--   8. payments & commission_events audit tables with strict RLS
--   9. Masked public_queue_view (SLOT-N aliases)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Add missing columns to commissions if not already present
-- ----------------------------------------------------------------------------
alter table public.commissions
  add column if not exists tos_version text not null default '2026-v1',
  add column if not exists usd_to_php_rate numeric(8, 2) not null default 58.00 check (usd_to_php_rate > 0);

-- ----------------------------------------------------------------------------
-- 2. Audit Trail: payments table
-- Tracks deposit, final, and full payments with verification workflow
-- ----------------------------------------------------------------------------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  commission_id uuid not null references public.commissions(id) on delete cascade,
  kind text not null check (kind in ('deposit', 'final', 'full')),
  amount numeric(10, 2) not null check (amount >= 0),
  currency public.currency_code not null default 'USD',
  receipt_path text,
  status text not null default 'submitted' check (status in ('submitted', 'verified', 'rejected')),
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_payments_commission_id on public.payments (commission_id);
create index if not exists idx_payments_status on public.payments (status);

alter table public.payments enable row level security;

-- RLS: Client owner or artist admin can read payment records
drop policy if exists "payments_participant_select" on public.payments;
create policy "payments_participant_select"
  on public.payments for select
  to authenticated
  using (public.can_access_commission(commission_id));

-- RLS: Client can submit a payment receipt, but status MUST be 'submitted'
drop policy if exists "payments_client_insert" on public.payments;
create policy "payments_client_insert"
  on public.payments for insert
  to authenticated
  with check (
    public.can_access_commission(commission_id)
    and status = 'submitted'
    and verified_by is null
    and verified_at is null
  );

-- RLS: Only artist admin can update verification status or amounts
drop policy if exists "payments_artist_admin_update" on public.payments;
create policy "payments_artist_admin_update"
  on public.payments for update
  to authenticated
  using (public.is_artist_admin())
  with check (public.is_artist_admin());

-- Auto-stamp verified_by, verified_at, and updated_at on payments
create or replace function public.enforce_payment_update_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  if new.status = 'verified' and old.status is distinct from 'verified' then
    new.verified_by := coalesce(new.verified_by, auth.uid());
    new.verified_at := coalesce(new.verified_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_payments_enforce_update_integrity on public.payments;
create trigger trg_payments_enforce_update_integrity
  before update on public.payments
  for each row execute function public.enforce_payment_update_integrity();

-- ----------------------------------------------------------------------------
-- 3. Audit Trail: commission_events table
-- Immutable log of stage transitions, notes, and actor audit trail
-- ----------------------------------------------------------------------------
create table if not exists public.commission_events (
  id uuid primary key default gen_random_uuid(),
  commission_id uuid not null references public.commissions(id) on delete cascade,
  from_stage public.commission_stage,
  to_stage public.commission_stage not null,
  actor_id uuid references auth.users(id),
  actor_role text not null check (actor_role in ('artist', 'client', 'system')),
  note text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_commission_events_commission on public.commission_events (commission_id, created_at desc);

alter table public.commission_events enable row level security;

-- RLS: Client owner or artist admin can read events
drop policy if exists "commission_events_participant_select" on public.commission_events;
create policy "commission_events_participant_select"
  on public.commission_events for select
  to authenticated
  using (public.can_access_commission(commission_id));

-- Events are written strictly by system triggers or artist admin
drop policy if exists "commission_events_artist_insert" on public.commission_events;
create policy "commission_events_artist_insert"
  on public.commission_events for insert
  to authenticated
  with check (public.is_artist_admin());

-- ----------------------------------------------------------------------------
-- 4. Automatic Transition Logger Trigger
-- ----------------------------------------------------------------------------
create or replace function public.log_commission_stage_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_role text;
begin
  if TG_OP = 'INSERT' then
    insert into public.commission_events (
      commission_id,
      from_stage,
      to_stage,
      actor_id,
      actor_role,
      note
    ) values (
      new.id,
      null,
      new.status_stage,
      auth.uid(),
      case when public.is_artist_admin() then 'artist' else 'client' end,
      'Commission request submitted'
    );
  elsif TG_OP = 'UPDATE' and new.status_stage is distinct from old.status_stage then
    v_actor_role := case when public.is_artist_admin() then 'artist' else 'client' end;
    insert into public.commission_events (
      commission_id,
      from_stage,
      to_stage,
      actor_id,
      actor_role,
      note
    ) values (
      new.id,
      old.status_stage,
      new.status_stage,
      auth.uid(),
      v_actor_role,
      'Stage transitioned to ' || new.status_stage::text
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_commission_stage_transition on public.commissions;
create trigger trg_log_commission_stage_transition
  after insert or update on public.commissions
  for each row execute function public.log_commission_stage_transition();

-- ----------------------------------------------------------------------------
-- 5. Enhanced Commission Integrity Trigger:
--    - Authoritative server-side price calculation on INSERT and pending_review UPDATE
--    - Enforces strict character_count clamp (1..4)
--    - Safe JSONB boolean comparisons (immune to 22P02 text-cast exceptions)
--    - Locks studio_settings (FOR UPDATE) to eliminate TOCTOU slot-cap race condition
--    - Comprehensive column immutability for non-admin updates
-- ----------------------------------------------------------------------------
create or replace function public.enforce_commission_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings record;
  v_base_price numeric(10, 2);
  v_multiplier numeric(10, 2) := 1.0;
  v_subtotal numeric(10, 2);
  v_active_count integer;
  v_recalculate boolean := false;
begin
  -- Fetch current studio settings
  select * into v_settings from public.studio_settings where id = 1;
  if not found then
    raise exception 'Studio settings (id=1) not found.';
  end if;

  if TG_OP = 'INSERT' then
    -- Non-admin clients MUST be forced into pending_review and ownership verified
    if not public.is_artist_admin() then
      new.client_id := auth.uid();
      new.status_stage := 'pending_review';
      new.deposit_paid := false;
      new.final_paid := false;
      new.progress := 0;
    end if;

    -- Force server-side timestamp for TOS acceptance
    new.tos_accepted_at := now();
    if new.tos_version is null or trim(new.tos_version) = '' then
      new.tos_version := '2026-v1';
    end if;

    -- Clamp character_count strictly between 1 and 4
    new.character_count := greatest(least(coalesce(new.character_count, 1), 4), 1);

    -- Calculate base price from studio_settings
    v_base_price := coalesce((v_settings.base_prices_json ->> new.tier::text)::numeric, 15);

    -- Safe JSONB comparison (no unhandled 22P02 cast exceptions on malformed strings)
    if coalesce((new.addons -> 'nsfw') = 'true'::jsonb, false) then
      v_multiplier := v_multiplier + coalesce((v_settings.multipliers_json ->> 'nsfw')::numeric, 0.5);
    end if;
    if coalesce((new.addons -> 'softFurry') = 'true'::jsonb, false) then
      v_multiplier := v_multiplier + coalesce((v_settings.multipliers_json ->> 'softFurry')::numeric, 0.5);
    end if;
    if coalesce((new.addons -> 'commercial') = 'true'::jsonb, false) then
      v_multiplier := v_multiplier + coalesce((v_settings.multipliers_json ->> 'commercial')::numeric, 2.0);
    end if;

    -- Authoritative server pricing
    v_subtotal := v_base_price * new.character_count;
    new.total_price := round(v_subtotal * v_multiplier, 2);
    
    if new.payment_split = '100_upfront' then
      new.deposit_due := new.total_price;
    else
      new.deposit_due := ceil(new.total_price / 2.0);
    end if;

    new.usd_to_php_rate := v_settings.usd_to_php_rate;

  elsif TG_OP = 'UPDATE' then
    -- TOCTOU Race Condition Prevention:
    -- If transition is moving into an active slot, acquire row-level lock on studio_settings
    if new.status_stage in ('awaiting_deposit', 'sketching', 'sketch_approval', 'lineart_coloring')
       and (old.status_stage not in ('awaiting_deposit', 'sketching', 'sketch_approval', 'lineart_coloring'))
    then
      select * into v_settings from public.studio_settings where id = 1 for update;

      select count(*) into v_active_count
      from public.commissions
      where status_stage in ('awaiting_deposit', 'sketching', 'sketch_approval', 'lineart_coloring')
        and id != new.id;

      if v_active_count >= v_settings.max_slots then
        raise exception 'Active slot capacity reached (% / % slots occupied). Cannot approve order.',
          v_active_count, v_settings.max_slots;
      end if;
    end if;

    -- Non-admin permission and scope guards
    if not public.is_artist_admin() then
      -- Comprehensive protected column rejection
      if new.client_id is distinct from old.client_id
         or new.order_code is distinct from old.order_code
         or new.status_stage is distinct from old.status_stage
         or new.deposit_paid is distinct from old.deposit_paid
         or new.final_paid is distinct from old.final_paid
         or new.start_date is distinct from old.start_date
         or new.est_end_date is distinct from old.est_end_date
         or new.progress is distinct from old.progress
         or new.tos_accepted_at is distinct from old.tos_accepted_at
         or new.tos_version is distinct from old.tos_version
         or new.usd_to_php_rate is distinct from old.usd_to_php_rate
      then
        raise exception 'Unauthorized modification of protected commission fields.';
      end if;

      if old.status_stage != 'pending_review' then
        -- Once approved, all scope and pricing fields are frozen
        if new.tier is distinct from old.tier
           or new.addons is distinct from old.addons
           or new.character_count is distinct from old.character_count
           or new.currency is distinct from old.currency
           or new.payment_split is distinct from old.payment_split
           or new.total_price is distinct from old.total_price
           or new.deposit_due is distinct from old.deposit_due
        then
          raise exception 'Commission scope and pricing cannot be modified after approval.';
        end if;
      else
        -- When in pending_review:
        -- If scope fields changed, recompute price authoritatively to prevent underpaying
        if new.tier is distinct from old.tier
           or new.addons is distinct from old.addons
           or new.character_count is distinct from old.character_count
           or new.payment_split is distinct from old.payment_split
        then
          v_recalculate := true;
        elsif new.total_price is distinct from old.total_price
           or new.deposit_due is distinct from old.deposit_due
        then
          -- Client attempted direct price edit without scope change
          raise exception 'Direct price tampering is rejected.';
        end if;

        if v_recalculate then
          new.character_count := greatest(least(coalesce(new.character_count, 1), 4), 1);
          v_base_price := coalesce((v_settings.base_prices_json ->> new.tier::text)::numeric, 15);

          v_multiplier := 1.0;
          if coalesce((new.addons -> 'nsfw') = 'true'::jsonb, false) then
            v_multiplier := v_multiplier + coalesce((v_settings.multipliers_json ->> 'nsfw')::numeric, 0.5);
          end if;
          if coalesce((new.addons -> 'softFurry') = 'true'::jsonb, false) then
            v_multiplier := v_multiplier + coalesce((v_settings.multipliers_json ->> 'softFurry')::numeric, 0.5);
          end if;
          if coalesce((new.addons -> 'commercial') = 'true'::jsonb, false) then
            v_multiplier := v_multiplier + coalesce((v_settings.multipliers_json ->> 'commercial')::numeric, 2.0);
          end if;

          v_subtotal := v_base_price * new.character_count;
          new.total_price := round(v_subtotal * v_multiplier, 2);

          if new.payment_split = '100_upfront' then
            new.deposit_due := new.total_price;
          else
            new.deposit_due := ceil(new.total_price / 2.0);
          end if;

          new.usd_to_php_rate := v_settings.usd_to_php_rate;
        end if;
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
-- 6. Trigger: Force Real Message Sender Role & Guard Chat Immutability
-- Prevents a client from spoofing sender_role = 'artist', manipulating timestamps,
-- or editing historical messages.
-- ----------------------------------------------------------------------------
create or replace function public.enforce_message_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    new.sender_id := auth.uid();
    if public.is_artist_admin() then
      new.sender_role := 'artist';
    else
      new.sender_role := 'client';
    end if;
    -- Force server timestamp unconditionally
    new.created_at := now();
  elsif TG_OP = 'UPDATE' then
    if not public.is_artist_admin() then
      raise exception 'Chat messages cannot be edited after sending.';
    else
      if new.sender_id is distinct from old.sender_id
         or new.sender_role is distinct from old.sender_role
         or new.commission_id is distinct from old.commission_id
         or new.created_at is distinct from old.created_at
      then
        raise exception 'Message sender, role, commission, and timestamps are immutable.';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_message_integrity on public.messages;
drop trigger if exists trg_enforce_message_sender_role on public.messages;
create trigger trg_enforce_message_integrity
  before insert or update on public.messages
  for each row execute function public.enforce_message_integrity();

-- ----------------------------------------------------------------------------
-- 7. Update public_queue_view: Anonymise & Remove Internal Commission UUIDs
-- ----------------------------------------------------------------------------
drop view if exists public.public_queue_view cascade;
create or replace view public.public_queue_view
with (security_invoker = false)
as
select
  row_number() over (order by c.start_date nulls last, c.created_at asc)::int as slot_number,
  -- Masked pseudo-ID using slot number to avoid exposing internal UUIDs
  ('SLOT-' || row_number() over (order by c.start_date nulls last, c.created_at asc)::text) as id,
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
-- 8. Add payments and commission_events to Realtime Publication
-- ----------------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.payments;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.commission_events;
exception when duplicate_object then null; end $$;
