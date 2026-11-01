-- ============================================================================
-- Meru Art Studio — Phase 7: Admin Order Lifecycle, Decline Reason & Safe Purge (Revision 2)
-- Addresses:
--   1. Safe deletion trigger: prevent deleting active in-progress commissions
--   2. Tighten RLS delete policy on commissions to require terminal status
--   3. Storage RLS DELETE policies for Artist Admin across all 3 private buckets
--   4. Helper RPC: public.get_commission_storage_paths(p_commission_id)
--      including references, WIP previews/masters, payment receipts, and chat attachments
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Enforce Safe Deletion Gate (Terminal States Only)
-- ----------------------------------------------------------------------------
create or replace function public.enforce_commission_delete_safety()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_artist_admin() then
    raise exception 'Unauthorized: Only the Artist Admin may purge commission records.';
  end if;

  if old.status_stage not in ('declined', 'cancelled', 'completed') then
    raise exception 'Cannot delete an active commission (current stage: %). Move the order to declined, cancelled, or completed first.', old.status_stage;
  end if;

  return old;
end;
$$;

drop trigger if exists trg_enforce_commission_delete_safety on public.commissions;
create trigger trg_enforce_commission_delete_safety
  before delete on public.commissions
  for each row
  execute function public.enforce_commission_delete_safety();

-- Tighten RLS delete policy to also require terminal status_stage
drop policy if exists "commissions_artist_delete" on public.commissions;
create policy "commissions_artist_delete"
  on public.commissions for delete
  to authenticated
  using (
    public.is_artist_admin()
    and status_stage in ('declined', 'cancelled', 'completed')
  );

-- ----------------------------------------------------------------------------
-- 2. Storage Object Cleanup Policies for Artist Admin
-- ----------------------------------------------------------------------------
drop policy if exists "storage_artist_delete_references" on storage.objects;
create policy "storage_artist_delete_references"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'commission-references'
    and public.is_artist_admin()
  );

drop policy if exists "storage_artist_delete_wips" on storage.objects;
create policy "storage_artist_delete_wips"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'commission-wips'
    and public.is_artist_admin()
  );

drop policy if exists "storage_artist_delete_receipts" on storage.objects;
create policy "storage_artist_delete_receipts"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'commission-receipts'
    and public.is_artist_admin()
  );

-- ----------------------------------------------------------------------------
-- 3. Helper Function: Collect All Linked Storage Paths Before Purge
-- ----------------------------------------------------------------------------
create or replace function public.get_commission_storage_paths(p_commission_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_refs jsonb;
  v_wip_previews jsonb;
  v_wip_masters jsonb;
  v_receipts jsonb;
  v_chat_attachments jsonb;
begin
  if not public.is_artist_admin() then
    raise exception 'Unauthorized';
  end if;

  -- 1. Reference paths from commissions.reference_urls (bucket: commission-references)
  select coalesce(jsonb_agg(elem->>'storagePath'), '[]'::jsonb)
  into v_refs
  from public.commissions c,
       jsonb_array_elements(coalesce(c.reference_urls, '[]'::jsonb)) as elem
  where c.id = p_commission_id
    and elem->>'storagePath' is not null;

  -- 2. WIP preview & master paths (bucket: commission-wips)
  select
    coalesce(jsonb_agg(preview_path) filter (where preview_path is not null), '[]'::jsonb),
    coalesce(jsonb_agg(master_path) filter (where master_path is not null), '[]'::jsonb)
  into v_wip_previews, v_wip_masters
  from public.wip_uploads
  where commission_id = p_commission_id;

  -- 3. Payment receipt paths (bucket: commission-receipts)
  select coalesce(jsonb_agg(receipt_path) filter (where receipt_path is not null), '[]'::jsonb)
  into v_receipts
  from public.payments
  where commission_id = p_commission_id;

  -- 4. Chat attachments from messages (bucket: commission-references)
  select coalesce(jsonb_agg(attachment_url) filter (
    where attachment_url is not null
      and attachment_url not like 'http%'
      and attachment_url not like 'blob:%'
  ), '[]'::jsonb)
  into v_chat_attachments
  from public.messages
  where commission_id = p_commission_id;

  return jsonb_build_object(
    'references', v_refs,
    'wip_previews', v_wip_previews,
    'wip_masters', v_wip_masters,
    'receipts', v_receipts,
    'chat_attachments', v_chat_attachments
  );
end;
$$;
