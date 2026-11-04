-- ============================================================================
-- Migration: Fix Supabase Storage RLS Policies for References and Receipts
-- Resolves "Failed to upload reference images (new row violates row-level security policy)"
-- ============================================================================

-- 1. Ensure storage buckets exist and are properly marked private
insert into storage.buckets (id, name, public)
values 
  ('commission-references', 'commission-references', false),
  ('commission-receipts', 'commission-receipts', false),
  ('commission-wips', 'commission-wips', false)
on conflict (id) do update set public = false;

-- 2. References Bucket Policies
drop policy if exists "references_participant_insert" on storage.objects;
drop policy if exists "references_client_insert" on storage.objects;
drop policy if exists "references_participant_select" on storage.objects;
drop policy if exists "references_owner_delete" on storage.objects;
drop policy if exists "storage_artist_delete_references" on storage.objects;
drop policy if exists "references_participant_update" on storage.objects;

-- Allow authenticated clients to upload references into their own {clientId}/* folder, or artist admin
-- Note: Does NOT check commissions table because files are uploaded BEFORE the commission row is created
create policy "references_participant_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'commission-references'
    and (
      public.is_artist_admin()
      or auth.uid()::text = (storage.foldername(name))[1]
    )
  );

-- Allow authenticated clients to view their own uploaded files, order participants, or artist admin
create policy "references_participant_select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'commission-references'
    and (
      public.is_artist_admin()
      or auth.uid()::text = (storage.foldername(name))[1]
      or public.can_access_commission(public.safe_cast_uuid((storage.foldername(name))[2]))
    )
  );

-- Allow authenticated clients to update/upsert their own files, or artist admin
create policy "references_participant_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'commission-references'
    and (
      public.is_artist_admin()
      or auth.uid()::text = (storage.foldername(name))[1]
    )
  )
  with check (
    bucket_id = 'commission-references'
    and (
      public.is_artist_admin()
      or auth.uid()::text = (storage.foldername(name))[1]
    )
  );

-- Allow clients to delete their own uploaded references or artist admin
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

-- 3. Receipts Bucket Policies
drop policy if exists "receipts_participant_select" on storage.objects;
drop policy if exists "receipts_client_insert" on storage.objects;
drop policy if exists "receipts_client_update" on storage.objects;
drop policy if exists "receipts_artist_admin_delete" on storage.objects;
drop policy if exists "storage_artist_delete_receipts" on storage.objects;

create policy "receipts_client_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'commission-receipts'
    and (
      public.is_artist_admin()
      or auth.uid()::text = (storage.foldername(name))[1]
    )
  );

create policy "receipts_participant_select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'commission-receipts'
    and (
      public.is_artist_admin()
      or auth.uid()::text = (storage.foldername(name))[1]
      or public.can_access_commission(public.safe_cast_uuid((storage.foldername(name))[2]))
    )
  );

create policy "receipts_client_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'commission-receipts'
    and (
      public.is_artist_admin()
      or auth.uid()::text = (storage.foldername(name))[1]
    )
  )
  with check (
    bucket_id = 'commission-receipts'
    and (
      public.is_artist_admin()
      or auth.uid()::text = (storage.foldername(name))[1]
    )
  );

create policy "receipts_artist_admin_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'commission-receipts'
    and (
      public.is_artist_admin()
      or auth.uid()::text = (storage.foldername(name))[1]
    )
  );
