-- ============================================================================
-- Meru Art Studio — Phase 6D Realtime Publication & Notification Pipeline
-- Addresses:
--   1. Realtime replication setup for core workflow tables
--   2. Replica identity configuration for full event payloads
--   3. Notification audit logs table (public.notification_logs) with strict RLS
--   4. Server-side notification enqueue triggers for briefs, stages, WIPs, & payments
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Idempotently Enable Realtime for Workflow Tables
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'commissions'
  ) then
    alter publication supabase_realtime add table public.commissions;
  end if;

  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;

  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'wip_uploads'
  ) then
    alter publication supabase_realtime add table public.wip_uploads;
  end if;

  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'payments'
  ) then
    alter publication supabase_realtime add table public.payments;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 2. Ensure Full Replica Identity for Complete Old/New Row Change Payloads
-- ----------------------------------------------------------------------------
alter table public.commissions replica identity full;
alter table public.messages replica identity full;
alter table public.wip_uploads replica identity full;
alter table public.payments replica identity full;

-- ----------------------------------------------------------------------------
-- 3. Create Notification Logs Table
-- ----------------------------------------------------------------------------
create table if not exists public.notification_logs (
  id uuid primary key default gen_random_uuid(),
  commission_id uuid references public.commissions(id) on delete cascade,
  event_type text not null, -- 'brief_submitted', 'stage_updated', 'wip_posted', 'payment_verified', 'message_sent'
  recipient_role text not null, -- 'client', 'artist'
  channel text not null default 'discord_webhook', -- 'discord_webhook', 'email', 'in_app'
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending', -- 'pending', 'delivered', 'failed'
  error_message text,
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);

alter table public.notification_logs enable row level security;

-- Only Artist Admin can manage or inspect all notification logs
drop policy if exists "notification_logs_artist_admin" on public.notification_logs;
create policy "notification_logs_artist_admin"
  on public.notification_logs for all
  to authenticated
  using (public.is_artist_admin())
  with check (public.is_artist_admin());

-- Clients can only inspect notifications generated for their own commissions
drop policy if exists "notification_logs_client_select" on public.notification_logs;
create policy "notification_logs_client_select"
  on public.notification_logs for select
  to authenticated
  using (
    commission_id is not null
    and public.can_access_commission(commission_id)
  );

-- ----------------------------------------------------------------------------
-- 4. Server-Side Trigger: Enqueue Notifications on Workflow Milestones
-- ----------------------------------------------------------------------------
create or replace function public.enqueue_commission_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Case A: New Brief Submitted (Notify Artist)
  if tg_op = 'INSERT' and tg_table_name = 'commissions' then
    insert into public.notification_logs (
      commission_id,
      event_type,
      recipient_role,
      channel,
      payload
    ) values (
      new.id,
      'brief_submitted',
      'artist',
      'discord_webhook',
      jsonb_build_object(
        'commission_id', new.id,
        'order_code', new.order_code,
        'client_handle', new.client_handle,
        'tier', new.tier,
        'total_price', new.total_price,
        'currency', new.currency,
        'character_name', new.character_name
      )
    );
    return new;
  end if;

  -- Case B: Stage Updated (Notify Client)
  if tg_op = 'UPDATE' and tg_table_name = 'commissions' then
    if old.status_stage is distinct from new.status_stage then
      insert into public.notification_logs (
        commission_id,
        event_type,
        recipient_role,
        channel,
        payload
      ) values (
        new.id,
        'stage_updated',
        'client',
        'in_app',
        jsonb_build_object(
          'commission_id', new.id,
          'order_code', new.order_code,
          'old_stage', old.status_stage,
          'new_stage', new.status_stage,
          'progress', new.progress
        )
      );
    end if;
    return new;
  end if;

  -- Case C: New WIP Uploaded (Notify Client)
  if tg_op = 'INSERT' and tg_table_name = 'wip_uploads' then
    insert into public.notification_logs (
      commission_id,
      event_type,
      recipient_role,
      channel,
      payload
    ) values (
      new.commission_id,
      'wip_posted',
      'client',
      'in_app',
      jsonb_build_object(
        'commission_id', new.commission_id,
        'wip_id', new.id,
        'title', new.title,
        'is_final', new.is_final,
        'stage', new.stage
      )
    );
    return new;
  end if;

  -- Case D: Payment Verified (Notify Client)
  if tg_op = 'UPDATE' and tg_table_name = 'payments' then
    if new.status = 'verified' and (old.status is distinct from 'verified') then
      insert into public.notification_logs (
        commission_id,
        event_type,
        recipient_role,
        channel,
        payload
      ) values (
        new.commission_id,
        'payment_verified',
        'client',
        'in_app',
        jsonb_build_object(
          'commission_id', new.commission_id,
          'payment_id', new.id,
          'kind', new.kind,
          'amount', new.amount,
          'currency', new.currency
        )
      );
    end if;
    return new;
  end if;

  return null;
end;
$$;

-- Drop and recreate triggers
drop trigger if exists trg_notify_new_commission on public.commissions;
create trigger trg_notify_new_commission
  after insert on public.commissions
  for each row
  execute function public.enqueue_commission_notification();

drop trigger if exists trg_notify_stage_update on public.commissions;
create trigger trg_notify_stage_update
  after update of status_stage on public.commissions
  for each row
  execute function public.enqueue_commission_notification();

drop trigger if exists trg_notify_wip_upload on public.wip_uploads;
create trigger trg_notify_wip_upload
  after insert on public.wip_uploads
  for each row
  execute function public.enqueue_commission_notification();

drop trigger if exists trg_notify_payment_verified on public.payments;
create trigger trg_notify_payment_verified
  after update of status on public.payments
  for each row
  execute function public.enqueue_commission_notification();
