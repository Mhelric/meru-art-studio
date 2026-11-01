-- ============================================================================
-- Meru Art Studio — Phase 7: Admin Order Lifecycle, Decline Reason & Safe Purge (Revision 4)
-- Addresses:
--   1. Safe deletion trigger: enforce terminal status & unpaid balance checks for client roles
--   2. Security invoker trigger: bypasses safely for postgres, supabase_admin, migrations, and GoTrue cascades
--   3. Storage RLS DELETE policies for Artist Admin across all 3 private buckets
--   4. Helper RPC: public.get_commission_storage_paths(p_commission_id)
--      Partitioned storage collection with token/query stripping and external URL filtering
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Enforce Safe Deletion Gate (Terminal States & Paid Safeguard)
-- ----------------------------------------------------------------------------
create or replace function public.enforce_commission_delete_safety()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  -- Only enforce deletion safeguards for client-facing roles (authenticated / anon).
  -- Administrative maintenance, SQL editor queries, migrations, and GoTrue cascades
  -- run as postgres / supabase_admin / service_role and bypass this trigger automatically.
  if current_user in ('authenticated', 'anon') then
    -- 1. Must be in terminal stage
    if old.status_stage not in ('declined', 'cancelled', 'completed') then
      raise exception 'Cannot delete an active commission (current stage: %). Move the order to declined, cancelled, or completed first.', old.status_stage;
    end if;

    -- 2. Safeguard: Block deleting completed commissions that still have an unpaid 50/50 balance
    if old.status_stage = 'completed' and old.payment_split = '50_50' and not old.final_paid then
      raise exception 'Cannot delete a completed commission with an outstanding unpaid balance. Verify payment first.';
    end if;
  end if;

  return old;
end;
$$;

drop trigger if exists trg_enforce_commission_delete_safety on public.commissions;
create trigger trg_enforce_commission_delete_safety
  before delete on public.commissions
  for each row
  execute function public.enforce_commission_delete_safety();

-- Tighten RLS delete policy to require terminal status_stage and artist admin role
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
set search_path = public, pg_temp
as $$
declare
  v_refs jsonb;
  v_wip_previews jsonb;
  v_wip_masters jsonb;
  v_receipts jsonb;
  v_chat_refs jsonb;
  v_chat_receipts jsonb;
begin
  if not public.is_artist_admin() then
    raise exception 'Unauthorized';
  end if;

  -- 1. Reference paths from commissions.reference_urls (bucket: commission-references)
  -- Strips tokens (?token=...) and domain prefixes; excludes external URLs (http% without bucket) and blob: URLs
  select coalesce(jsonb_agg(
    case
      when (elem->>'storagePath') ~ 'commission-references/' then
        split_part(regexp_replace(elem->>'storagePath', '^.*?commission-references/', ''), '?', 1)
      when (elem->>'storagePath') not like 'http%' and (elem->>'storagePath') not like 'blob:%' then
        split_part(elem->>'storagePath', '?', 1)
      else null
    end
  ) filter (
    where elem->>'storagePath' is not null
      and (
        (elem->>'storagePath') ~ 'commission-references/'
        or ((elem->>'storagePath') not like 'http%' and (elem->>'storagePath') not like 'blob:%')
      )
  ), '[]'::jsonb)
  into v_refs
  from public.commissions c,
       jsonb_array_elements(coalesce(c.reference_urls, '[]'::jsonb)) as elem
  where c.id = p_commission_id;

  -- 2. WIP preview & master paths (bucket: commission-wips)
  select
    coalesce(jsonb_agg(split_part(preview_path, '?', 1)) filter (where preview_path is not null), '[]'::jsonb),
    coalesce(jsonb_agg(split_part(master_path, '?', 1)) filter (where master_path is not null), '[]'::jsonb)
  into v_wip_previews, v_wip_masters
  from public.wip_uploads
  where commission_id = p_commission_id;

  -- 3. Payment receipt paths from payments table (bucket: commission-receipts)
  select coalesce(jsonb_agg(split_part(receipt_path, '?', 1)) filter (where receipt_path is not null), '[]'::jsonb)
  into v_receipts
  from public.payments
  where commission_id = p_commission_id;

  -- 4. Chat attachments partitioned by kind:
  -- 4A: Chat receipts (bucket: commission-receipts)
  select coalesce(jsonb_agg(
    case
      when attachment_url ~ 'commission-receipts/' then
        split_part(regexp_replace(attachment_url, '^.*?commission-receipts/', ''), '?', 1)
      when attachment_url not like 'http%' and attachment_url not like 'blob:%' then
        split_part(attachment_url, '?', 1)
      else null
    end
  ) filter (
    where attachment_url is not null
      and attachment_kind = 'receipt'
      and (
        attachment_url ~ 'commission-receipts/'
        or (attachment_url not like 'http%' and attachment_url not like 'blob:%')
      )
  ), '[]'::jsonb)
  into v_chat_receipts
  from public.messages
  where commission_id = p_commission_id;

  -- 4B: Chat general reference/sketch attachments (bucket: commission-references)
  select coalesce(jsonb_agg(
    case
      when attachment_url ~ 'commission-references/' then
        split_part(regexp_replace(attachment_url, '^.*?commission-references/', ''), '?', 1)
      when attachment_url not like 'http%' and attachment_url not like 'blob:%' then
        split_part(attachment_url, '?', 1)
      else null
    end
  ) filter (
    where attachment_url is not null
      and (attachment_kind is null or attachment_kind != 'receipt')
      and (
        attachment_url ~ 'commission-references/'
        or (attachment_url not like 'http%' and attachment_url not like 'blob:%')
      )
  ), '[]'::jsonb)
  into v_chat_refs
  from public.messages
  where commission_id = p_commission_id;

  return jsonb_build_object(
    'references', v_refs || v_chat_refs,
    'wip_previews', v_wip_previews,
    'wip_masters', v_wip_masters,
    'receipts', v_receipts || v_chat_receipts
  );
end;
$$;

revoke execute on function public.get_commission_storage_paths(uuid) from public;
grant execute on function public.get_commission_storage_paths(uuid) to authenticated;
