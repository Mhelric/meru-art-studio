-- ============================================================================
-- Meru Art Studio — Phase 6C Storage Buckets & Row-Level Security Policies
-- Addresses:
--   1. Creation of private buckets: commission-references, commission-receipts, commission-wips
--   2. Storage RLS policies checking ownership and commission access
--   3. Completion-gating for high-res unwatermarked deliverables (masters/)
--   4. Safe UUID casting function to prevent malformed path exceptions
--   5. Function can_download_final_master()
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Safe UUID Caster: Prevents 22P02 exceptions on malformed storage folder paths
-- ----------------------------------------------------------------------------
create or replace function public.safe_cast_uuid(val text)
returns uuid
language plpgsql
immutable
as $$
begin
  if val is null or val = '' then
    return null;
  end if;
  return val::uuid;
exception when others then
  return null;
end;
$$;

-- ----------------------------------------------------------------------------
-- 1. Create Storage Buckets (Private)
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values
  ('commission-references', 'commission-references', false),
  ('commission-receipts', 'commission-receipts', false),
  ('commission-wips', 'commission-wips', false)
on conflict (id) do update set public = false;

-- ----------------------------------------------------------------------------
-- 2. Helper: Check if caller can download completed final master deliverable
-- ----------------------------------------------------------------------------
create or replace function public.can_download_final_master(target_commission_id uuid)
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
      and c.status_stage = 'completed'
      and (c.client_id = auth.uid() or public.is_artist_admin())
  );
$$;

-- ----------------------------------------------------------------------------
-- 3. Storage Policies: commission-references
-- Path structure: {client_id}/{commission_id}/{filename}
-- ----------------------------------------------------------------------------
drop policy if exists "references_participant_select" on storage.objects;
create policy "references_participant_select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'commission-references'
    and (
      public.is_artist_admin()
      or (
        auth.uid()::text = (storage.foldername(name))[1]
        and public.can_access_commission(public.safe_cast_uuid((storage.foldername(name))[2]))
      )
    )
  );

drop policy if exists "references_participant_insert" on storage.objects;
create policy "references_participant_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'commission-references'
    and (
      public.is_artist_admin()
      or (
        auth.uid()::text = (storage.foldername(name))[1]
        and public.can_access_commission(public.safe_cast_uuid((storage.foldername(name))[2]))
      )
    )
  );

drop policy if exists "references_owner_delete" on storage.objects;
create policy "references_owner_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'commission-references'
    and (
      public.is_artist_admin()
      or auth.uid()::text = (storage.foldername(name))[1]
    )
  );

-- ----------------------------------------------------------------------------
-- 4. Storage Policies: commission-receipts
-- Path structure: {client_id}/{commission_id}/{filename}
-- ----------------------------------------------------------------------------
drop policy if exists "receipts_participant_select" on storage.objects;
create policy "receipts_participant_select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'commission-receipts'
    and (
      public.is_artist_admin()
      or (
        auth.uid()::text = (storage.foldername(name))[1]
        and public.can_access_commission(public.safe_cast_uuid((storage.foldername(name))[2]))
      )
    )
  );

drop policy if exists "receipts_client_insert" on storage.objects;
create policy "receipts_client_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'commission-receipts'
    and (
      public.is_artist_admin()
      or (
        auth.uid()::text = (storage.foldername(name))[1]
        and public.can_access_commission(public.safe_cast_uuid((storage.foldername(name))[2]))
      )
    )
  );

drop policy if exists "receipts_artist_admin_delete" on storage.objects;
create policy "receipts_artist_admin_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'commission-receipts'
    and public.is_artist_admin()
  );

-- ----------------------------------------------------------------------------
-- 5. Storage Policies: commission-wips
-- Path structure:
--   previews/{commission_id}/{filename} -> Watermarked WIP previews
--   masters/{commission_id}/{filename}  -> Unwatermarked 300 DPI master files
-- ----------------------------------------------------------------------------
drop policy if exists "wips_artist_admin_insert" on storage.objects;
create policy "wips_artist_admin_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'commission-wips'
    and public.is_artist_admin()
  );

drop policy if exists "wips_artist_admin_update" on storage.objects;
create policy "wips_artist_admin_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'commission-wips'
    and public.is_artist_admin()
  );

drop policy if exists "wips_artist_admin_delete" on storage.objects;
create policy "wips_artist_admin_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'commission-wips'
    and public.is_artist_admin()
  );

-- Completion-Gated Select:
-- - Previews are readable by order participants during progress
-- - Masters are ONLY readable if status_stage = 'completed'
drop policy if exists "wips_authorized_select" on storage.objects;
create policy "wips_authorized_select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'commission-wips'
    and (
      -- Artist admin can always read any WIP or master
      public.is_artist_admin()
      -- Client can view watermarked progress previews
      or (
        (storage.foldername(name))[1] = 'previews'
        and public.can_access_commission(public.safe_cast_uuid((storage.foldername(name))[2]))
      )
      -- Client can ONLY view unwatermarked master file once stage is completed
      or (
        (storage.foldername(name))[1] = 'masters'
        and public.can_download_final_master(public.safe_cast_uuid((storage.foldername(name))[2]))
      )
    )
  );
