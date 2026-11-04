-- ============================================================================
-- Meru Art Studio — Phase 9: WIP Revisions Reflection & Client Reviews
-- Enables storing revision request state directly on wip_uploads
-- and saving client star reviews and testimonials on commissions.
-- ============================================================================

-- 1. Extend wip_uploads with revision tracking columns
alter table public.wip_uploads
  add column if not exists revision_requested boolean not null default false,
  add column if not exists revision_notes text,
  add column if not exists revision_category text,
  add column if not exists revision_scale text,
  add column if not exists revision_requested_at timestamptz;

-- 2. Extend commissions with review_json column
alter table public.commissions
  add column if not exists review_json jsonb;

-- 3. RPC: Request WIP Revision
create or replace function public.request_wip_revision(
  target_wip_id uuid,
  p_category text,
  p_notes text,
  p_scale text default 'minor'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_wip record;
  v_caller_id uuid;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    return jsonb_build_object('success', false, 'error', 'Authentication required.');
  end if;

  select w.id, w.commission_id, w.title, w.stage, c.client_id, c.order_code
  into v_wip
  from public.wip_uploads w
  join public.commissions c on c.id = w.commission_id
  where w.id = target_wip_id;

  if not found then
    return jsonb_build_object('success', false, 'error', 'WIP item not found.');
  end if;

  if v_wip.client_id != v_caller_id and not public.is_artist_admin() then
    return jsonb_build_object('success', false, 'error', 'Unauthorized to request revision on this WIP.');
  end if;

  update public.wip_uploads
  set revision_requested = true,
      revision_category = p_category,
      revision_notes = p_notes,
      revision_scale = p_scale,
      revision_requested_at = now()
  where id = target_wip_id;

  return jsonb_build_object('success', true, 'wip_id', target_wip_id);
end;
$$;

grant execute on function public.request_wip_revision(uuid, text, text, text) to authenticated, anon;

-- 4. RPC: Submit Client Review & Complete Commission
create or replace function public.submit_client_review(
  target_commission_id uuid,
  review_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_comm record;
  v_caller_id uuid;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    return jsonb_build_object('success', false, 'error', 'Authentication required.');
  end if;

  select id, client_id, order_code, status_stage
  into v_comm
  from public.commissions
  where id = target_commission_id;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Commission not found.');
  end if;

  if v_comm.client_id != v_caller_id and not public.is_artist_admin() then
    return jsonb_build_object('success', false, 'error', 'Unauthorized to review this commission.');
  end if;

  update public.commissions
  set review_json = review_payload,
      status_stage = 'completed',
      progress = 100,
      updated_at = now()
  where id = target_commission_id;

  return jsonb_build_object('success', true, 'commission_id', target_commission_id);
end;
$$;

grant execute on function public.submit_client_review(uuid, jsonb) to authenticated, anon;
