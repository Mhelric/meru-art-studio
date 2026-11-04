-- ============================================================================
-- Meru Art Studio — Phase 8F: Authoritative Workflow Engine & RPC Transitions
-- Provides atomic server-side milestone transitions, payment verification gates,
-- and automated system audit logging in order chat.
-- ============================================================================

create or replace function public.transition_commission(
  p_commission_id uuid,
  p_target_stage text,
  p_progress integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current_record record;
  v_new_progress integer;
  v_stage_label text;
begin
  -- 1. Ensure caller is an authorized artist admin
  if not public.is_artist_admin() then
    return jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: Only artist admins can execute workflow transitions'
    );
  end if;

  -- 2. Fetch current commission state
  select
    id,
    order_code,
    status_stage,
    progress,
    deposit_paid,
    final_paid,
    payment_split
  into v_current_record
  from public.commissions
  where id = p_commission_id;

  if not found then
    return jsonb_build_object(
      'success', false,
      'error', 'Commission not found'
    );
  end if;

  -- 3. Terminal state check: completed, declined, and cancelled cannot be transitioned backwards
  if v_current_record.status_stage in ('completed', 'declined', 'cancelled') then
    return jsonb_build_object(
      'success', false,
      'error', 'Commission is in terminal stage and cannot be modified'
    );
  end if;

  -- 4. Calculate default progress if not provided
  if p_progress is not null then
    v_new_progress := p_progress;
  else
    case p_target_stage
      when 'pending_review' then v_new_progress := 10;
      when 'awaiting_deposit' then v_new_progress := 22;
      when 'sketching' then v_new_progress := 42;
      when 'sketch_approval' then v_new_progress := 62;
      when 'lineart_coloring' then v_new_progress := 85;
      when 'completed' then v_new_progress := 100;
      when 'declined' then v_new_progress := 0;
      when 'cancelled' then v_new_progress := v_current_record.progress;
      else v_new_progress := v_current_record.progress;
    end case;
  end if;

  -- 5. Business logic gates for advancing stages
  if p_target_stage = 'sketching' and not v_current_record.deposit_paid then
    return jsonb_build_object(
      'success', false,
      'error', 'Cannot advance to Sketching: upfront deposit receipt has not been verified'
    );
  end if;

  if p_target_stage = 'completed' and not (v_current_record.final_paid or v_current_record.payment_split = '100_upfront') then
    return jsonb_build_object(
      'success', false,
      'error', 'Cannot mark Completed: final payment has not been verified'
    );
  end if;

  -- 6. Perform atomic update
  update public.commissions
  set
    status_stage = p_target_stage,
    progress = v_new_progress,
    updated_at = now()
  where id = p_commission_id;

  -- 7. Log system audit message into chat
  case p_target_stage
    when 'awaiting_deposit' then v_stage_label := 'Awaiting Upfront Deposit';
    when 'sketching' then v_stage_label := 'Sketching in Progress';
    when 'sketch_approval' then v_stage_label := 'Sketch Approval & Remaining 50% Gate';
    when 'lineart_coloring' then v_stage_label := 'Lineart & Rendering';
    when 'completed' then v_stage_label := 'Completed · Master Download Unlocked';
    when 'declined' then v_stage_label := 'Request Declined';
    when 'cancelled' then v_stage_label := 'Commission Cancelled';
    else v_stage_label := p_target_stage;
  end case;

  insert into public.messages (
    commission_id,
    sender_id,
    sender_role,
    body,
    created_at
  ) values (
    p_commission_id,
    auth.uid(),
    'system',
    'Milestone updated: ' || v_stage_label || ' (' || v_new_progress || '% complete).',
    now()
  );

  return jsonb_build_object(
    'success', true,
    'stage', p_target_stage,
    'progress', v_new_progress
  );
end;
$$;

grant execute on function public.transition_commission(uuid, text, integer) to authenticated;
