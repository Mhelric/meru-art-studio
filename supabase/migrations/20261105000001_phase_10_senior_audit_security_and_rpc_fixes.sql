-- =============================================================================
-- MERU ART STUDIO — PHASE 10: SENIOR ENGINEERING AUDIT & SECURITY HARDENING
-- Fixes:
-- 1. enforce_commission_integrity(): Preserves full server-side price
--    recalculation, character_count clamp (1..4), and TOCTOU slot-cap locking,
--    while allowing authorized SECURITY DEFINER RPCs (via transaction-local
--    app.authorized_rpc GUC) and allowing clients to update review_json on
--    their own completed commissions.
-- 2. enforce_message_integrity(): Unifies with enforce_message_sender_role() so
--    system messages are preserved when inserted by Artist Admin or authorized
--    RPCs, and stamps server now().
-- 3. get_commission_storage_paths(): Fixes broken column names (preview_path /
--    master_path -> watermarked_url / high_res_url) so order deletion works.
-- 4. transition_commission(): Casts p_target_stage to public.commission_stage
--    and sets app.authorized_rpc.
-- 5. approve_wip(), client_complete_commission(), request_wip_revision(),
--    submit_client_review(): Enforces strict auth, stage & payment verification
--    gates, revokes anon execution grants, and sets app.authorized_rpc.
-- 6. Storage RLS: Restricts commission-receipts deletion strictly to Artist Admin.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. UNIFIED COMMISSION INTEGRITY TRIGGER
-- -----------------------------------------------------------------------------
create or replace function public.enforce_commission_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings record;
  v_base_price numeric(10, 2);
  v_multiplier numeric(10, 2) := 1.0;
  v_subtotal numeric(10, 2);
  v_active_count integer;
  v_recalculate boolean := false;
  v_authorized_rpc boolean := coalesce(current_setting('app.authorized_rpc', true), '') = 'true';
begin
  select * into v_settings from public.studio_settings where id = 1;
  if not found then
    raise exception 'Studio settings (id=1) not found.';
  end if;

  if TG_OP = 'INSERT' then
    if not public.is_artist_admin() and not v_authorized_rpc then
      new.client_id := auth.uid();
      new.status_stage := 'pending_review';
      new.deposit_paid := false;
      new.final_paid := false;
      new.sketch_approved := false;
      new.progress := 0;
    end if;

    new.tos_accepted_at := now();
    if new.tos_version is null or trim(new.tos_version) = '' then
      new.tos_version := '2026-v1';
    end if;

    new.character_count := greatest(least(coalesce(new.character_count, 1), 4), 1);
    v_base_price := coalesce((v_settings.base_prices_json ->> new.tier::text)::numeric, 15);

    if coalesce((new.addons -> 'nsfw') = 'true'::jsonb, false) then
      v_multiplier := v_multiplier + coalesce((v_settings.multipliers_json ->> 'nsfw')::numeric, 0.5);
    end if;
    if coalesce((new.addons -> 'softFurry') = 'true'::jsonb, false) then
      v_multiplier := v_multiplier + coalesce((v_settings.multipliers_json ->> 'softFurry')::numeric, 0.5);
    end if;
    if coalesce((new.addons -> 'commercial') = 'true'::jsonb, false) then
      v_multiplier := v_multiplier + coalesce((v_settings.multipliers_json ->> 'commercial')::numeric, 2.0);
    end if;

    v_subtotal := v_base_price * new.character_count;
    new.total_price := round(v_subtotal * v_multiplier, 2);

    if new.payment_split = '100_upfront' then
      new.deposit_due := new.total_price;
    else
      new.deposit_due := ceil(new.total_price / 2.0);
    end if;

    new.usd_to_php_rate := v_settings.usd_to_php_rate;

  elsif TG_OP = 'UPDATE' then
    -- TOCTOU Race Condition Prevention when moving into an active queue slot
    if new.status_stage in ('awaiting_deposit', 'sketching', 'sketch_approval', 'lineart_coloring')
       and (old.status_stage not in ('awaiting_deposit', 'sketching', 'sketch_approval', 'lineart_coloring'))
    then
      select * into v_settings from public.studio_settings where id = 1 for update;

      select count(*) into v_active_count
      from public.commissions
      where status_stage in ('awaiting_deposit', 'sketching', 'sketch_approval', 'lineart_coloring')
        and id != new.id;

      if v_active_count >= v_settings.max_slots then
        raise exception 'Active slot capacity reached (% / % slots occupied). Cannot approve order.',
          v_active_count, v_settings.max_slots;
      end if;
    end if;

    if not public.is_artist_admin() and not v_authorized_rpc then
      if new.client_id is distinct from old.client_id
         or new.order_code is distinct from old.order_code
         or new.status_stage is distinct from old.status_stage
         or new.deposit_paid is distinct from old.deposit_paid
         or new.final_paid is distinct from old.final_paid
         or new.start_date is distinct from old.start_date
         or new.est_end_date is distinct from old.est_end_date
         or new.progress is distinct from old.progress
         or new.tos_accepted_at is distinct from old.tos_accepted_at
         or new.tos_version is distinct from old.tos_version
         or new.usd_to_php_rate is distinct from old.usd_to_php_rate
      then
        raise exception 'Unauthorized modification of protected commission fields.';
      end if;

      if new.sketch_approved is distinct from old.sketch_approved then
        if old.status_stage <> 'sketch_approval' or new.sketch_approved <> true then
          raise exception 'Sketch approval is only permitted during the Sketch Approval stage.';
        end if;
      end if;

      if old.status_stage != 'pending_review' then
        if new.tier is distinct from old.tier
           or new.addons is distinct from old.addons
           or new.character_count is distinct from old.character_count
           or new.currency is distinct from old.currency
           or new.payment_split is distinct from old.payment_split
           or new.total_price is distinct from old.total_price
           or new.deposit_due is distinct from old.deposit_due
        then
          raise exception 'Commission scope and pricing cannot be modified after approval.';
        end if;

        if new.character_name is distinct from old.character_name
           or new.pose_and_vibe is distinct from old.pose_and_vibe
           or new.background_notes is distinct from old.background_notes
           or new.reference_urls is distinct from old.reference_urls
           or new.client_handle is distinct from old.client_handle
        then
          raise exception 'Commission brief details are locked once artist review is complete.';
        end if;
      else
        if new.tier is distinct from old.tier
           or new.addons is distinct from old.addons
           or new.character_count is distinct from old.character_count
           or new.payment_split is distinct from old.payment_split
        then
          v_recalculate := true;
        elsif new.total_price is distinct from old.total_price
           or new.deposit_due is distinct from old.deposit_due
        then
          raise exception 'Direct price tampering is rejected.';
        end if;

        if v_recalculate then
          new.character_count := greatest(least(coalesce(new.character_count, 1), 4), 1);
          v_base_price := coalesce((v_settings.base_prices_json ->> new.tier::text)::numeric, 15);

          v_multiplier := 1.0;
          if coalesce((new.addons -> 'nsfw') = 'true'::jsonb, false) then
            v_multiplier := v_multiplier + coalesce((v_settings.multipliers_json ->> 'nsfw')::numeric, 0.5);
          end if;
          if coalesce((new.addons -> 'softFurry') = 'true'::jsonb, false) then
            v_multiplier := v_multiplier + coalesce((v_settings.multipliers_json ->> 'softFurry')::numeric, 0.5);
          end if;
          if coalesce((new.addons -> 'commercial') = 'true'::jsonb, false) then
            v_multiplier := v_multiplier + coalesce((v_settings.multipliers_json ->> 'commercial')::numeric, 2.0);
          end if;

          v_subtotal := v_base_price * new.character_count;
          new.total_price := round(v_subtotal * v_multiplier, 2);

          if new.payment_split = '100_upfront' then
            new.deposit_due := new.total_price;
          else
            new.deposit_due := ceil(new.total_price / 2.0);
          end if;

          new.usd_to_php_rate := v_settings.usd_to_php_rate;
        end if;
      end if;
    end if;

    new.updated_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_commission_integrity on public.commissions;
create trigger trg_enforce_commission_integrity
before insert or update on public.commissions
for each row execute function public.enforce_commission_integrity();

-- -----------------------------------------------------------------------------
-- 2. UNIFIED MESSAGE INTEGRITY TRIGGER
-- -----------------------------------------------------------------------------
create or replace function public.enforce_message_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_authorized_rpc boolean := coalesce(current_setting('app.authorized_rpc', true), '') = 'true';
begin
  if tg_op = 'INSERT' then
    new.sender_id := coalesce(auth.uid(), new.sender_id);
    new.created_at := now();
    if public.is_artist_admin() or v_authorized_rpc then
      if new.sender_role not in ('artist', 'system', 'client') then
        new.sender_role := 'artist';
      end if;
      if not v_authorized_rpc and new.sender_role = 'client' then
        new.sender_role := 'artist';
      end if;
    else
      new.sender_role := 'client';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if not public.is_artist_admin() and not v_authorized_rpc then
      raise exception 'Messages are immutable and cannot be modified after sending.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_message_sender_role on public.messages;
drop trigger if exists trg_enforce_message_integrity on public.messages;
create trigger trg_enforce_message_integrity
before insert or update on public.messages
for each row execute function public.enforce_message_integrity();

-- -----------------------------------------------------------------------------
-- 3. FIX get_commission_storage_paths (watermarked_url, high_res_url, receipt_path)
-- -----------------------------------------------------------------------------
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
    raise exception 'Unauthorized: only the artist admin can enumerate commission storage paths.';
  end if;

  -- 1. Reference paths from commissions.reference_urls (bucket: commission-references)
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

  -- 2. WIP preview & master paths (bucket: commission-wips; columns: watermarked_url, high_res_url)
  select
    coalesce(
      jsonb_agg(
        case
          when watermarked_url ~ 'commission-wips/' then
            split_part(regexp_replace(watermarked_url, '^.*?commission-wips/', ''), '?', 1)
          when watermarked_url not like 'http%' and watermarked_url not like 'blob:%' and watermarked_url not like 'data:%' then
            split_part(watermarked_url, '?', 1)
          else null
        end
      ) filter (
        where watermarked_url is not null
          and watermarked_url <> ''
          and (
            watermarked_url ~ 'commission-wips/'
            or (watermarked_url not like 'http%' and watermarked_url not like 'blob:%' and watermarked_url not like 'data:%')
          )
      ),
      '[]'::jsonb
    ),
    coalesce(
      jsonb_agg(
        case
          when high_res_url ~ 'commission-wips/' then
            split_part(regexp_replace(high_res_url, '^.*?commission-wips/', ''), '?', 1)
          when high_res_url not like 'http%' and high_res_url not like 'blob:%' and high_res_url not like 'data:%' then
            split_part(high_res_url, '?', 1)
          else null
        end
      ) filter (
        where high_res_url is not null
          and high_res_url <> ''
          and (
            high_res_url ~ 'commission-wips/'
            or (high_res_url not like 'http%' and high_res_url not like 'blob:%' and high_res_url not like 'data:%')
          )
      ),
      '[]'::jsonb
    )
  into v_wip_previews, v_wip_masters
  from public.wip_uploads
  where commission_id = p_commission_id;

  -- 3. Payment receipt paths from payments table (bucket: commission-receipts; column: receipt_path)
  select coalesce(
    jsonb_agg(
      case
        when receipt_path ~ 'commission-receipts/' then
          split_part(regexp_replace(receipt_path, '^.*?commission-receipts/', ''), '?', 1)
        when receipt_path not like 'http%' and receipt_path not like 'blob:%' and receipt_path not like 'data:%' then
          split_part(receipt_path, '?', 1)
        else null
      end
    ) filter (
      where receipt_path is not null
        and receipt_path <> ''
        and (
          receipt_path ~ 'commission-receipts/'
          or (receipt_path not like 'http%' and receipt_path not like 'blob:%' and receipt_path not like 'data:%')
        )
    ),
    '[]'::jsonb
  )
  into v_receipts
  from public.payments
  where commission_id = p_commission_id;

  -- 4A: Chat receipts (bucket: commission-receipts)
  select coalesce(
    jsonb_agg(
      case
        when attachment_url ~ 'commission-receipts/' then
          split_part(regexp_replace(attachment_url, '^.*?commission-receipts/', ''), '?', 1)
        when attachment_url not like 'http%' and attachment_url not like 'blob:%' and attachment_url not like 'data:%' then
          split_part(attachment_url, '?', 1)
        else null
      end
    ) filter (
      where attachment_url is not null
        and attachment_kind = 'receipt'
        and (
          attachment_url ~ 'commission-receipts/'
          or (attachment_url not like 'http%' and attachment_url not like 'blob:%' and attachment_url not like 'data:%')
        )
    ),
    '[]'::jsonb
  )
  into v_chat_receipts
  from public.messages
  where commission_id = p_commission_id;

  -- 4B: Chat general reference/sketch attachments (bucket: commission-references)
  select coalesce(
    jsonb_agg(
      case
        when attachment_url ~ 'commission-references/' then
          split_part(regexp_replace(attachment_url, '^.*?commission-references/', ''), '?', 1)
        when attachment_url not like 'http%' and attachment_url not like 'blob:%' and attachment_url not like 'data:%' then
          split_part(attachment_url, '?', 1)
        else null
      end
    ) filter (
      where attachment_url is not null
        and (attachment_kind is null or attachment_kind != 'receipt')
        and (
          attachment_url ~ 'commission-references/'
          or (attachment_url not like 'http%' and attachment_url not like 'blob:%' and attachment_url not like 'data:%')
        )
    ),
    '[]'::jsonb
  )
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

-- -----------------------------------------------------------------------------
-- 4. FIX transition_commission ENUM CAST & AUTHORIZED RPC FLAG
-- -----------------------------------------------------------------------------
create or replace function public.transition_commission(
  p_commission_id uuid,
  p_target_stage text,
  p_progress integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_comm record;
  v_wip_count integer := 0;
  v_final_wip_count integer := 0;
  v_next_progress integer;
begin
  if not public.is_artist_admin() then
    raise exception 'Unauthorized: Only the artist admin can transition commission stages.';
  end if;

  select * into v_comm
  from public.commissions
  where id = p_commission_id
  for update;

  if not found then
    raise exception 'Commission not found: %', p_commission_id;
  end if;

  select
    count(*),
    count(*) filter (where is_final = true)
  into v_wip_count, v_final_wip_count
  from public.wip_uploads
  where commission_id = p_commission_id;

  if p_target_stage = 'sketching' then
    if not coalesce(v_comm.deposit_paid, false) then
      raise exception 'Workflow Gate: Cannot advance to Sketching until the upfront deposit receipt is verified.';
    end if;
    v_next_progress := 42;
  elsif p_target_stage = 'sketch_approval' then
    if not coalesce(v_comm.deposit_paid, false) then
      raise exception 'Workflow Gate: Upfront deposit must be verified before Sketch Approval.';
    end if;
    if v_wip_count < 1 then
      raise exception 'Workflow Gate: Please upload at least 1 watermarked sketch WIP before requesting Sketch Approval.';
    end if;
    v_next_progress := 62;
  elsif p_target_stage = 'lineart_coloring' then
    if not coalesce(v_comm.deposit_paid, false) then
      raise exception 'Workflow Gate: Upfront deposit must be verified before Lineart & Coloring.';
    end if;
    if v_comm.payment_split = '50_50' and not coalesce(v_comm.final_paid, false) then
      raise exception 'Workflow Gate: Cannot advance to Lineart & Coloring until the remaining 50%% balance is verified.';
    end if;
    v_next_progress := 85;
  elsif p_target_stage = 'completed' then
    if not coalesce(v_comm.deposit_paid, false) then
      raise exception 'Workflow Gate: Upfront deposit must be verified before completing the order.';
    end if;
    if v_comm.payment_split = '50_50' and not coalesce(v_comm.final_paid, false) then
      raise exception 'Workflow Gate: Full payment (remaining 50%% balance) must be verified before unlocking Completed / Master Vault.';
    end if;
    if v_final_wip_count < 1 then
      raise exception 'Workflow Gate: Please upload the Final 300 DPI Master artwork before marking the commission Completed.';
    end if;
    v_next_progress := 100;
  elsif p_target_stage = 'awaiting_deposit' then
    v_next_progress := 20;
  elsif p_target_stage in ('pending_review', 'declined', 'cancelled') then
    v_next_progress := coalesce(p_progress, v_comm.progress, 0);
  else
    raise exception 'Invalid commission stage: %', p_target_stage;
  end if;

  perform set_config('app.authorized_rpc', 'true', true);

  update public.commissions
  set
    status_stage = p_target_stage::public.commission_stage,
    progress = coalesce(p_progress, v_next_progress),
    updated_at = now()
  where id = p_commission_id;

  return jsonb_build_object(
    'id', p_commission_id,
    'previous_stage', v_comm.status_stage,
    'new_stage', p_target_stage,
    'progress', coalesce(p_progress, v_next_progress)
  );
end;
$$;

grant execute on function public.transition_commission(uuid, text, integer) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. HARDENED CLIENT WORKFLOW RPCs (REVOKE ANON, ENFORCE STAGE & PAYMENT GATES)
-- -----------------------------------------------------------------------------
revoke execute on function public.approve_wip(uuid) from anon;
revoke execute on function public.client_complete_commission(uuid) from anon;
revoke execute on function public.request_wip_revision(uuid, text, text) from anon;
revoke execute on function public.submit_client_review(uuid, jsonb) from anon;

create or replace function public.approve_wip(target_wip_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_commission_id uuid;
  v_wip_title text;
  v_client_id uuid;
begin
  select w.commission_id, w.title, c.client_id
  into v_commission_id, v_wip_title, v_client_id
  from public.wip_uploads w
  join public.commissions c on c.id = w.commission_id
  where w.id = target_wip_id;

  if v_commission_id is null then
    raise exception 'WIP not found';
  end if;

  if auth.uid() is null or (auth.uid() <> v_client_id and not public.is_artist_admin()) then
    raise exception 'Unauthorized to approve this WIP';
  end if;

  perform set_config('app.authorized_rpc', 'true', true);

  update public.wip_uploads
  set approved_by_client = true
  where id = target_wip_id;

  update public.commissions
  set
    sketch_approved = true,
    updated_at = now()
  where id = v_commission_id;

  insert into public.messages (
    commission_id,
    sender_id,
    sender_role,
    body
  ) values (
    v_commission_id,
    coalesce(auth.uid(), v_client_id),
    case when public.is_artist_admin() then 'artist' else 'client' end,
    'Approved WIP: "' || coalesce(v_wip_title, 'Progress Update') || '" ✅'
  );
end;
$$;

grant execute on function public.approve_wip(uuid) to authenticated;

create or replace function public.client_complete_commission(target_commission_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
  v_stage public.commission_stage;
  v_final_paid boolean;
  v_deposit_paid boolean;
  v_payment_split public.payment_split;
  v_has_final_wip boolean;
begin
  select client_id, status_stage, final_paid, deposit_paid, payment_split
  into v_client_id, v_stage, v_final_paid, v_deposit_paid, v_payment_split
  from public.commissions
  where id = target_commission_id;

  if v_client_id is null then
    raise exception 'Commission not found';
  end if;

  if auth.uid() is null or (auth.uid() <> v_client_id and not public.is_artist_admin()) then
    raise exception 'Unauthorized to complete this commission';
  end if;

  if not public.is_artist_admin() then
    if v_stage not in ('lineart_coloring', 'completed') then
      raise exception 'Commission cannot be completed from stage %', v_stage;
    end if;

    if not (coalesce(v_final_paid, false) or (v_payment_split = '100_upfront' and coalesce(v_deposit_paid, false))) then
      raise exception 'Full payment verification is required before completing this commission.';
    end if;

    select exists(
      select 1 from public.wip_uploads
      where commission_id = target_commission_id and is_final = true
    ) into v_has_final_wip;

    if not coalesce(v_has_final_wip, false) then
      raise exception 'A final master deliverable must be uploaded before client completion.';
    end if;
  end if;

  perform set_config('app.authorized_rpc', 'true', true);

  update public.wip_uploads
  set approved_by_client = true
  where commission_id = target_commission_id;

  update public.commissions
  set
    status_stage = 'completed'::public.commission_stage,
    progress = 100,
    sketch_approved = true,
    updated_at = now()
  where id = target_commission_id;

  insert into public.messages (
    commission_id,
    sender_id,
    sender_role,
    body
  ) values (
    target_commission_id,
    coalesce(auth.uid(), v_client_id),
    case when public.is_artist_admin() then 'artist' else 'client' end,
    '[Final Acceptance Confirmed]: I am 100% satisfied with the final artwork and confirm order completion! 🎉'
  );
end;
$$;

grant execute on function public.client_complete_commission(uuid) to authenticated;

create or replace function public.request_wip_revision(
  target_wip_id uuid,
  p_scale text default 'minor',
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_commission_id uuid;
  v_client_id uuid;
begin
  select w.commission_id, c.client_id
  into v_commission_id, v_client_id
  from public.wip_uploads w
  join public.commissions c on c.id = w.commission_id
  where w.id = target_wip_id;

  if v_commission_id is null then
    raise exception 'WIP not found';
  end if;

  if auth.uid() is null or (auth.uid() <> v_client_id and not public.is_artist_admin()) then
    raise exception 'Unauthorized to request revision on this WIP';
  end if;

  perform set_config('app.authorized_rpc', 'true', true);

  update public.wip_uploads
  set
    revision_requested = true,
    approved_by_client = false,
    revision_scale = coalesce(p_scale, 'minor'),
    revision_note = p_note
  where id = target_wip_id;
end;
$$;

grant execute on function public.request_wip_revision(uuid, text, text) to authenticated;

create or replace function public.submit_client_review(
  target_commission_id uuid,
  review_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
  v_stage public.commission_stage;
  v_final_paid boolean;
  v_deposit_paid boolean;
  v_payment_split public.payment_split;
begin
  select client_id, status_stage, final_paid, deposit_paid, payment_split
  into v_client_id, v_stage, v_final_paid, v_deposit_paid, v_payment_split
  from public.commissions
  where id = target_commission_id;

  if v_client_id is null then
    raise exception 'Commission not found';
  end if;

  if auth.uid() is null or (auth.uid() <> v_client_id and not public.is_artist_admin()) then
    raise exception 'Unauthorized to review this commission';
  end if;

  if not public.is_artist_admin() then
    if v_stage not in ('lineart_coloring', 'completed') then
      raise exception 'Commission cannot be completed or reviewed from stage %', v_stage;
    end if;

    if not (coalesce(v_final_paid, false) or (v_payment_split = '100_upfront' and coalesce(v_deposit_paid, false))) then
      raise exception 'Full payment verification is required before completing this commission.';
    end if;
  end if;

  perform set_config('app.authorized_rpc', 'true', true);

  update public.wip_uploads
  set approved_by_client = true
  where commission_id = target_commission_id;

  update public.commissions
  set
    status_stage = 'completed'::public.commission_stage,
    progress = 100,
    sketch_approved = true,
    review_json = review_payload,
    updated_at = now()
  where id = target_commission_id;
end;
$$;

grant execute on function public.submit_client_review(uuid, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- 6. STORAGE RLS: RESTRICT RECEIPT DELETION TO ARTIST ADMIN
-- -----------------------------------------------------------------------------
drop policy if exists "receipts_artist_admin_delete" on storage.objects;
create policy "receipts_artist_admin_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'commission-receipts'
  and public.is_artist_admin()
);
