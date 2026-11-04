-- ============================================================================
-- Meru Art Studio — Phase 8: Multi-Stage WIP Confirmations & Client Final Completion Gate
-- Enables clients to approve in-production WIPs (colors, lineart, shading, retouches)
-- and mark the commission as Completed once satisfied with the final product.
-- ============================================================================

-- 1. RPC: Client or Artist approves a specific WIP item
create or replace function public.approve_wip(
  target_wip_id uuid
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

  -- Ensure caller is client or artist
  if v_wip.client_id != v_caller_id and not public.is_artist_admin() then
    return jsonb_build_object('success', false, 'error', 'Unauthorized to approve this WIP.');
  end if;

  -- Update WIP approval status
  update public.wip_uploads
  set approved_by_client = true
  where id = target_wip_id;

  -- Log approval message to order chat
  insert into public.messages (
    commission_id,
    sender_id,
    sender_role,
    body,
    attachment_kind
  ) values (
    v_wip.commission_id,
    v_caller_id,
    'client',
    '[WIP Approved]: Client reviewed and approved "' || v_wip.title || '"! Ready for the next stage.',
    'other'
  );

  return jsonb_build_object('success', true, 'wip_id', target_wip_id);
end;
$$;

grant execute on function public.approve_wip(uuid) to authenticated, anon;


-- 2. RPC: Client accepts final artwork and marks commission as completed
create or replace function public.client_complete_commission(
  target_commission_id uuid
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

  select id, client_id, order_code, status_stage, progress, payment_split, final_paid
  into v_comm
  from public.commissions
  where id = target_commission_id;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Commission not found.');
  end if;

  -- Ensure caller is the owning client or artist admin
  if v_comm.client_id != v_caller_id and not public.is_artist_admin() then
    return jsonb_build_object('success', false, 'error', 'Unauthorized to complete this commission.');
  end if;

  -- Prevent completed or terminal orders from re-completing
  if v_comm.status_stage in ('completed', 'declined', 'cancelled') then
    return jsonb_build_object('success', false, 'error', 'Commission is already in a terminal stage (' || v_comm.status_stage || ').');
  end if;

  -- Update commission to completed milestone with 100% progress
  update public.commissions
  set
    status_stage = 'completed',
    progress = 100,
    updated_at = now()
  where id = target_commission_id;

  -- Insert celebratory chat notification
  insert into public.messages (
    commission_id,
    sender_id,
    sender_role,
    body,
    attachment_kind
  ) values (
    v_comm.id,
    v_caller_id,
    'client',
    '🎉 [Order Completed]: Client reviewed and accepted the final artwork! High-resolution 300 DPI master download unlocked.',
    'other'
  );

  return jsonb_build_object('success', true, 'commission_id', target_commission_id);
end;
$$;

grant execute on function public.client_complete_commission(uuid) to authenticated, anon;
