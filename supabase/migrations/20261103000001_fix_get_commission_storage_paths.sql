-- ============================================================================
-- Meru Art Studio — Migration: Fix get_commission_storage_paths RPC
-- Resolves "COALESCE types text[] and jsonb cannot be matched" error
-- ============================================================================

create or replace function public.get_commission_storage_paths(p_commission_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_refs jsonb := '[]'::jsonb;
  v_wip_previews jsonb := '[]'::jsonb;
  v_wip_masters jsonb := '[]'::jsonb;
  v_receipts jsonb := '[]'::jsonb;
  v_chat_refs jsonb := '[]'::jsonb;
  v_chat_receipts jsonb := '[]'::jsonb;
begin
  if not public.is_artist_admin() then
    raise exception 'Unauthorized';
  end if;

  -- 1. Reference paths from commissions.reference_urls (bucket: commission-references)
  -- Strips tokens (?token=...) and domain prefixes; excludes external URLs (http% without bucket) and blob: URLs
  select coalesce(
    (
      select jsonb_agg(
        case
          when ref_path ~ 'commission-references/' then
            split_part(regexp_replace(ref_path, '^.*?commission-references/', ''), '?', 1)
          when ref_path not like 'http%' and ref_path not like 'blob:%' and ref_path not like 'data:%' then
            split_part(ref_path, '?', 1)
          else null
        end
      ) filter (
        where ref_path is not null
          and (
            ref_path ~ 'commission-references/'
            or (ref_path not like 'http%' and ref_path not like 'blob:%' and ref_path not like 'data:%')
          )
      )
      from unnest(c.reference_urls) as ref_path
    ),
    '[]'::jsonb
  )
  into v_refs
  from public.commissions c
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

  v_refs := coalesce(v_refs, '[]'::jsonb);
  v_wip_previews := coalesce(v_wip_previews, '[]'::jsonb);
  v_wip_masters := coalesce(v_wip_masters, '[]'::jsonb);
  v_receipts := coalesce(v_receipts, '[]'::jsonb);
  v_chat_refs := coalesce(v_chat_refs, '[]'::jsonb);
  v_chat_receipts := coalesce(v_chat_receipts, '[]'::jsonb);

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

-- ----------------------------------------------------------------------------
-- Storage Policies for commission-references:
-- Allow authenticated users to upload references to their folder: {client_id}/*
-- and allow artist admin full access
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('commission-references', 'commission-references', false)
on conflict (id) do update set public = false;

drop policy if exists "references_participant_insert" on storage.objects;
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

drop policy if exists "references_participant_select" on storage.objects;
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
