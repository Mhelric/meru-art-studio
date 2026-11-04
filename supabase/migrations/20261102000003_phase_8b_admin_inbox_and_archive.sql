-- ============================================================================
-- Meru Art Studio — Phase 8B: Admin Inbox Read State & Message Tracking
-- Enables realtime unread message tracking, read state synchronization,
-- and system notifications for the Admin Backoffice Inbox.
-- ============================================================================

-- 1. Table: commission_read_state
create table if not exists public.commission_read_state (
  commission_id uuid not null references public.commissions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (commission_id, user_id)
);

create index if not exists idx_commission_read_state_user
  on public.commission_read_state(user_id, commission_id);

alter table public.commission_read_state enable row level security;

-- RLS: Authenticated users can manage their own read states
drop policy if exists "read_state_user_select" on public.commission_read_state;
create policy "read_state_user_select"
  on public.commission_read_state for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "read_state_user_insert" on public.commission_read_state;
create policy "read_state_user_insert"
  on public.commission_read_state for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "read_state_user_update" on public.commission_read_state;
create policy "read_state_user_update"
  on public.commission_read_state for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 2. Allow 'system' in messages.sender_role
alter table public.messages drop constraint if exists messages_sender_role_check;
alter table public.messages add constraint messages_sender_role_check
  check (sender_role in ('client', 'artist', 'system'));

-- Update sender role enforcement trigger to support system role for artist admin
create or replace function public.enforce_message_sender_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if public.is_artist_admin() then
      -- Artist can send as 'artist' or 'system'
      if new.sender_role not in ('artist', 'system') then
        new.sender_role := 'artist';
      end if;
    else
      -- Clients can strictly ONLY send as 'client'
      new.sender_role := 'client';
    end if;
    new.created_at := now();
  elsif tg_op = 'UPDATE' then
    if new.sender_id is distinct from old.sender_id
       or new.commission_id is distinct from old.commission_id
       or new.sender_role is distinct from old.sender_role
       or new.created_at is distinct from old.created_at then
      raise exception 'Message audit fields are immutable once sent';
    end if;
  end if;
  return new;
end;
$$;

-- 3. RPC: Mark commission as read
create or replace function public.mark_commission_read(p_commission_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  insert into public.commission_read_state (commission_id, user_id, last_read_at)
  values (p_commission_id, auth.uid(), now())
  on conflict (commission_id, user_id)
  do update set last_read_at = excluded.last_read_at;
end;
$$;

grant execute on function public.mark_commission_read(uuid) to authenticated;

-- 4. RPC: Get unread message counts across commissions for the current user
create or replace function public.get_unread_message_counts()
returns table (
  commission_id uuid,
  unread_count bigint
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select
    m.commission_id,
    count(*)::bigint as unread_count
  from public.messages m
  join public.commissions c on c.id = m.commission_id
  left join public.commission_read_state r
    on r.commission_id = m.commission_id
   and r.user_id = auth.uid()
  where (
    -- If caller is artist admin, count client messages
    (public.is_artist_admin() and m.sender_role = 'client')
    -- If caller is client, count artist or system messages on their own commissions
    or (c.client_id = auth.uid() and m.sender_role in ('artist', 'system'))
  )
  and (r.last_read_at is null or m.created_at > r.last_read_at)
  group by m.commission_id;
$$;

grant execute on function public.get_unread_message_counts() to authenticated;

-- 5. Add commission_read_state to realtime publication if not already present
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.commission_read_state;
  end if;
exception
  when duplicate_object then null;
end;
$$;
