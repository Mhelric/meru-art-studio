-- ============================================================================
-- Meru Art Studio — Phase 8A: Studio Closed Submission Guard Trigger
-- Enforces server-side rejection of new commission briefs when the studio
-- availability_status is 'closed' or is_open is false.
-- ============================================================================

create or replace function public.enforce_commission_submission_gate()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
  v_is_open boolean;
begin
  -- Artist admin may bypass submission gates for manual entries or testing
  if public.is_artist_admin() then
    return new;
  end if;

  -- Query authoritative studio settings singleton
  select availability_status, is_open
  into v_status, v_is_open
  from public.studio_settings
  where id = 1;

  -- Block insertions when studio is explicitly closed or paused
  if not coalesce(v_is_open, true) or v_status = 'closed' then
    raise exception 'Studio is currently closed for new commission requests. Please check back when slots reopen.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_commission_submission_gate on public.commissions;
create trigger trg_enforce_commission_submission_gate
  before insert on public.commissions
  for each row execute function public.enforce_commission_submission_gate();
