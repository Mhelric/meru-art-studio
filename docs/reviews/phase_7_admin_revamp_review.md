# Phase 7 Audit Review Packet: Artist Admin Experience & Lifecycle Hardening (Revision 5)

**Submitted To:** Senior Database, Security & Architecture Engineering Audit  
**System:** Meru Art Studio  
**Audit Scope:** Phase 7 (Revision 5) — Verification of RPC Storage Abort Safety, Separation of Payment Verification from Stage Advancement, Atomic Non-Bypassable Cancellation, and Dialog Focus/Lifecycle Isolation  
**Status:** Verification Ready (16/16 Vitest Tests PASS, 0 TypeScript Errors, 0 Build Warnings)

---

## 1. Executive Summary & Verification of Audit Resolutions

Revision 5 resolves the final four items identified in the senior architectural review:

### 1.1 Path-Collection RPC Abort Safety (`deleteCommissionInDb`) — CLOSED
* **Defect:** If `get_commission_storage_paths()` errored, the error was merely warned to the console while the database row deletion proceeded, leaving files permanently orphaned with zero `failedStoragePaths` reported.
* **Resolution:** In `deleteCommissionInDb()`, if `rpcErr` is returned, the purge operation **aborts immediately** before executing the database `DELETE`. An error is returned:
  `Could not verify linked storage objects before deletion (<message>). Deletion aborted to prevent orphaned files.`
  The database row and all storage files remain intact and eligible for retry.

### 1.2 Separation of Payment Verification from Milestone Advancement (`updateCommissionStageInDb`) — CLOSED
* **Defect:** `updateCommissionStageInDb` was previously forcing `final_paid = true` and `deposit_paid = true` when advancing an order to `lineart_coloring` or `completed`, defeating the database financial gate and faking payment verification.
* **Resolution:** Removed the forced `final_paid` and `deposit_paid` mutations from `updateCommissionStageInDb()`. Advancing milestone stages now strictly updates `status_stage` and `progress`. Payment verification must occur exclusively through explicit artist review via `toggleCommissionPaymentInDb()`. Completed orders with unverified final balances now properly trigger the financial gate.

### 1.3 Atomic Non-Bypassable Order Cancellation (`archiveOrDeclineCommissionInDb`) — CLOSED
* **Defect:** `archiveOrDeclineCommissionInDb` previously included `'completed'` in the allowed cancellation stages, creating a loophole where an unpaid completed order could be cancelled and then purged (bypassing the completed-unpaid trigger).
* **Resolution:**
  - Removed `'completed'` from the allowed cancellation stages.
  - `allowedStages` is strictly:
    * `targetStage === 'declined'` -> `['pending_review']`
    * `targetStage === 'cancelled'` -> `['awaiting_deposit', 'sketching', 'sketch_approval', 'lineart_coloring']`
  - Added atomic SQL guard: `.in('status_stage', allowedStages)` on the update query, preventing race conditions if another client or admin modified the stage concurrently. Completed orders can never be cancelled.

### 1.4 Dialog Focus and Lifecycle Isolation (`DeleteOrderDialog.tsx`) — CLOSED
* **Defect:** Having `[isOpen, hasUnpaidCompletedBalance]` in the lifecycle effect caused the effect to re-run whenever a realtime payment update arrived while the dialog was open, wiping out typed `"DELETE"` input and bouncing focus to the trigger button behind the overlay.
* **Resolution:**
  - Separated the open/close lifecycle effect (strictly on `[isOpen]`) from focus placement.
  - Lifecycle effect captures `previouslyFocusedElementRef.current` on open and restores focus strictly when `isOpen` becomes false.
  - Focus placement runs in a separate effect targeting `inputRef`, `closeBtnRef`, or `modalRef` without resetting typed input or restoring focus on unmount.

### 1.5 Additional Non-Blocking Quality Refinements — CLOSED
* **Auto-Navigation Gated on Loading:** In `AdminDashboard.tsx`, auto-navigation to `briefs` waits until `!isLoadingOrders`. Initial auto-navigation evaluates the real asynchronously loaded orders, and will never hijack the screen on subsequent realtime briefs.
* **Storage Failure Logging:** If any storage objects fail removal, `res.failedStoragePaths` are explicitly logged with `console.error('Failed storage cleanup paths for order:', orderId, res.failedStoragePaths)`.

---

## 2. Technical Verification Summary

| Requirement / Criterion | Status | Verification Detail |
| :--- | :---: | :--- |
| **Storage Collection Abort Gate** | **PASS** | `deleteCommissionInDb()` aborts before DB DELETE if RPC fails; prevents silent file orphaning. |
| **Stage Stepper & Payment Decoupling** | **PASS** | `updateCommissionStageInDb()` updates only stage & progress; payment verification requires explicit artist action. |
| **Atomic Non-Bypassable Cancel** | **PASS** | Cancellation strictly restricted to active in-progress stages; atomic `.in('status_stage', allowedStages)` guard. |
| **Dialog Lifecycle & Focus Isolation** | **PASS** | Lifecycle effect strictly on `[isOpen]`; focus placement effect separated; no input reset on realtime state changes. |
| **Cascade & Migration Bypass** | **PASS** | `public.enforce_commission_delete_safety()` is `SECURITY INVOKER` with `if current_user in ('authenticated', 'anon')`. |
| **Storage URL Normalization** | **PASS** | Strips `?token=...` query params via `split_part()`; filters external non-storage URLs. |
| **Safe Auto-Navigation** | **PASS** | Gated on `!isLoadingOrders` and `!userInteractedRef.current`. |
| **Mathematical Invariant** | **PASS** | Unit tests assert `counts.briefs + counts.active + counts.archived === counts.total` across all 8 stages. |
| **Automated Test Suite** | **PASS** | 16/16 Vitest unit tests pass in 2.99s. |
| **Production Build** | **PASS** | `tsc && vite build` completes in 2.00s with 0 errors and 0 warnings. |

---

## 3. Automated Test Suite & Build Verification

### 3.1 Vitest Test Suite Output (16/16 PASS)
```text
> meru-art-studio@1.0.0 test
> vitest run

 RUN  v5.0.5 C:/Users/mhelric/OneDrive/Desktop/meru-art-studio

 ✓ tests/unit.test.ts (16 tests) 2990ms
   ✓ HTML Escaping & XSS Sanitization (escapeHtml) > escapes HTML characters correctly
   ✓ HTML Escaping & XSS Sanitization (escapeHtml) > neutralizes script injection and image error payloads
   ✓ HTML Escaping & XSS Sanitization (escapeHtml) > handles null, undefined, numbers, and clean strings safely
   ✓ Dynamic Date Helpers & Formatting > returns valid YYYY-MM-DD local today date
   ✓ Dynamic Date Helpers & Formatting > calculates future dates with arbitrary positive offsets
   ✓ Dynamic Date Helpers & Formatting > formats short dates and currencies correctly
   ✓ TOS Refund Schedule Calculation (getRefundTierInfo) > awards 100% full refund before sketching begins
   ✓ TOS Refund Schedule Calculation (getRefundTierInfo) > awards 50% refund during sketching with 50/50 split
   ✓ TOS Refund Schedule Calculation (getRefundTierInfo) > awards 75% refund during sketching with upfront full payment
   ✓ TOS Refund Schedule Calculation (getRefundTierInfo) > awards 0% refund once lineart and coloring begins
   ✓ Availability Calendar Slot Calculations (getAvailableSlotsForDate) > respects studio pause and returns 0 slots
   ✓ Availability Calendar Slot Calculations (getAvailableSlotsForDate) > blocks specific dates in blockedDates set
   ✓ Availability Calendar Slot Calculations (getAvailableSlotsForDate) > computes remaining slots against target capacity
   ✓ Admin Order Lifecycle Segmentation (segmentAdminOrders) > correctly partitions incoming briefs from active pipeline and terminal archive
   ✓ Admin Order Lifecycle Segmentation (segmentAdminOrders) > verifies partition invariant: briefs + active + archived === total across all commission stages
   ✓ Admin Order Lifecycle Segmentation (segmentAdminOrders) > flags completed orders with unpaid 50/50 balance in pendingPayments

 Test Files  1 passed (1)
      Tests  16 passed (16)
   Start at  17:56:53
   Duration  2.99s (import 78%, transform 19%, tests 2%, worker 1%)
```

### 3.2 Vite Production Build Output
```text
> meru-art-studio@1.0.0 build
> tsc && vite build

vite v8.3.5 building client environment for production...
transforming...
✓ 2605 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                                 1.81 kB │ gzip:   0.69 kB
dist/assets/index-DKvv8FHm.css                 68.00 kB │ gzip:  11.41 kB
dist/assets/rolldown-runtime-WkwZ5CU-.js        0.59 kB │ gzip:   0.36 kB
dist/assets/vendor-query-B9tB4Llq.js            2.50 kB │ gzip:   1.19 kB
dist/assets/Lightbox-Bp7ma_NP.js                6.12 kB │ gzip:   2.17 kB
dist/assets/realtime-BCSLILOW.js                6.22 kB │ gzip:   2.15 kB
dist/assets/vendor-supabase-D_1rPncu.js        10.62 kB │ gzip:   4.32 kB
dist/assets/AvailabilityCalendar-BnBR1Jg1.js   10.79 kB │ gzip:   3.23 kB
dist/assets/TierModal-BAoIXsux.js              23.71 kB │ gzip:   6.33 kB
dist/assets/vendor-motion-DYdf6MWt.js          28.37 kB │ gzip:  10.94 kB
dist/assets/vendor-icons-CnulAtS_.js           32.96 kB │ gzip:  12.66 kB
dist/assets/OrderTracker-kJqccUUE.js           52.41 kB │ gzip:  12.40 kB
dist/assets/AdminPanel-Ce8Aquyr.js             55.72 kB │ gzip:  12.15 kB
dist/assets/index-BjKprGXj.js                 102.30 kB │ gzip:  32.13 kB
dist/assets/vendor-react-Do5m6qWo.js          207.04 kB │ gzip:  64.49 kB
dist/assets/vendor-misc-DbncZmyQ.js           375.87 kB │ gzip: 105.43 kB

✓ built in 2.00s
```

---

## 4. Complete, Unabridged Implementation Code Artifacts

### 4.1 `supabase/migrations/20261102000001_phase_7_admin_lifecycle_and_deletion.sql`

```sql
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
```

---

### 4.2 Data Layer Operations (`src/lib/supabase.ts`)

```typescript
/** Update commission status stage in Supabase (Admin action). */
export async function updateCommissionStageInDb(
  commissionId: string,
  stage: CommissionStage,
  progress?: number,
): Promise<{ success: boolean; error: string | null }> {
  if (!supabase) return { success: false, error: 'Supabase not connected' };

  // Only update the milestone stage and progress.
  // Never forcibly overwrite deposit_paid or final_paid here; payment flags must only be
  // modified through explicit payment verification (toggleCommissionPaymentInDb).
  const updates: Record<string, unknown> = { status_stage: stage };
  if (progress !== undefined) updates.progress = progress;

  const { error } = await supabase.from('commissions').update(updates).eq('id', commissionId);
  return { success: !error, error: error?.message ?? null };
}

/** Decline a commission in Supabase (Admin action). */
/**
 * Decline or cancel a commission with an optional reason logged to order chat.
 * Strictly guards against declining in-progress commissions mid-production without formal cancellation.
 */
export async function archiveOrDeclineCommissionInDb(
  commissionId: string,
  targetStage: 'declined' | 'cancelled',
  reason?: string,
): Promise<{ success: boolean; error: string | null }> {
  if (!supabase) return { success: false, error: 'Supabase not connected' };

  // Fetch current stage to validate transition
  const { data: currentOrder, error: fetchErr } = await supabase
    .from('commissions')
    .select('id, status_stage')
    .eq('id', commissionId)
    .maybeSingle();

  if (fetchErr || !currentOrder) {
    return { success: false, error: fetchErr?.message ?? 'Commission not found' };
  }

  // Allowed source stages:
  // - 'declined' is ONLY permitted from 'pending_review'
  // - 'cancelled' is ONLY permitted from active in-progress stages (completed orders cannot be cancelled)
  const allowedStages =
    targetStage === 'declined'
      ? ['pending_review']
      : ['awaiting_deposit', 'sketching', 'sketch_approval', 'lineart_coloring'];

  if (!allowedStages.includes(currentOrder.status_stage)) {
    return {
      success: false,
      error: `Cannot ${targetStage} order in stage "${currentOrder.status_stage}". Allowed source stages: ${allowedStages.join(', ')}.`,
    };
  }

  // Execute stage update with atomic status_stage guard to prevent concurrent race conditions
  const { data, error } = await supabase
    .from('commissions')
    .update({ status_stage: targetStage, progress: 0 })
    .eq('id', commissionId)
    .in('status_stage', allowedStages)
    .select('id')
    .maybeSingle();

  if (error || !data) {
    return { success: false, error: error?.message ?? `Failed to mark order as ${targetStage}` };
  }

  if (reason && reason.trim()) {
    const msgRes = await sendCommissionMessageInDb(
      commissionId,
      `[${targetStage.toUpperCase()} Notice]: ${reason.trim()}`,
      { attachmentKind: 'other' },
    );
    if (msgRes.error) {
      console.warn('Decline reason message notice could not be delivered:', msgRes.error);
    }
  }

  return { success: true, error: null };
}

/** Decline a commission in Supabase (Admin action). */
export async function declineCommissionInDb(
  commissionId: string,
  reason?: string,
): Promise<{ success: boolean; error: string | null }> {
  return archiveOrDeclineCommissionInDb(commissionId, 'declined', reason);
}

/** Cancel an active commission in Supabase (Admin action). */
export async function cancelCommissionInDb(
  commissionId: string,
  reason?: string,
): Promise<{ success: boolean; error: string | null }> {
  return archiveOrDeclineCommissionInDb(commissionId, 'cancelled', reason);
}

export interface DeleteCommissionResult {
  success: boolean;
  error: string | null;
  failedStoragePaths?: string[];
}

/**
 * Permanently purge a terminal commission ('declined', 'cancelled', 'completed')
 * along with its associated private storage objects across all 3 studio buckets.
 *
 * Safe Order of Operations:
 * 1. Collect storage paths before deletion.
 * 2. Execute guarded hard DELETE on PostgreSQL first.
 *    (If trigger or RLS rejects, the database operation aborts and no storage files are removed).
 * 3. Only upon confirmed database row deletion, remove storage blobs and inspect API errors.
 */
export async function deleteCommissionInDb(
  commissionId: string,
): Promise<DeleteCommissionResult> {
  if (!supabase) return { success: false, error: 'Supabase not connected' };

  try {
    // Step 1: Collect linked storage paths via security-definer RPC
    const { data: pathBundle, error: rpcErr } = await supabase.rpc(
      'get_commission_storage_paths',
      { p_commission_id: commissionId },
    );

    if (rpcErr) {
      console.error('Failed to collect commission storage paths via RPC:', rpcErr.message);
      return {
        success: false,
        error: `Could not verify linked storage objects before deletion (${rpcErr.message}). Deletion aborted to prevent orphaned files.`,
      };
    }

    // Step 2: Execute guarded hard DELETE on public.commissions FIRST
    const { data: deletedRow, error: deleteErr } = await supabase
      .from('commissions')
      .delete()
      .eq('id', commissionId)
      .in('status_stage', ['declined', 'cancelled', 'completed'])
      .select('id')
      .maybeSingle();

    if (deleteErr || !deletedRow) {
      return {
        success: false,
        error:
          deleteErr?.message ??
          'Order could not be deleted. Ensure the order is in Declined, Cancelled, or Completed state with zero outstanding unpaid balance.',
      };
    }

    // Step 3: Database row deletion succeeded; now purge storage objects
    const failedStoragePaths: string[] = [];
    if (pathBundle) {
      const bundle = pathBundle as {
        references?: string[];
        wip_previews?: string[];
        wip_masters?: string[];
        receipts?: string[];
      };
      const refPaths: string[] = Array.isArray(bundle.references) ? bundle.references : [];
      const wipPaths: string[] = [
        ...(Array.isArray(bundle.wip_previews) ? bundle.wip_previews : []),
        ...(Array.isArray(bundle.wip_masters) ? bundle.wip_masters : []),
      ];
      const receiptPaths: string[] = Array.isArray(bundle.receipts) ? bundle.receipts : [];

      const cleanupResults = await Promise.allSettled([
        refPaths.length > 0
          ? supabase.storage.from('commission-references').remove(refPaths)
          : Promise.resolve({ data: [], error: null }),
        wipPaths.length > 0
          ? supabase.storage.from('commission-wips').remove(wipPaths)
          : Promise.resolve({ data: [], error: null }),
        receiptPaths.length > 0
          ? supabase.storage.from('commission-receipts').remove(receiptPaths)
          : Promise.resolve({ data: [], error: null }),
      ]);

      const bucketPathArrays = [refPaths, wipPaths, receiptPaths];
      cleanupResults.forEach((res, idx) => {
        if (res.status === 'rejected') {
          console.warn('Storage purge error:', res.reason);
          failedStoragePaths.push(...bucketPathArrays[idx]);
        } else if (res.value?.error) {
          console.warn('Storage removal API error:', res.value.error.message);
          failedStoragePaths.push(...bucketPathArrays[idx]);
        }
      });
    }

    return {
      success: true,
      error: null,
      failedStoragePaths: failedStoragePaths.length > 0 ? failedStoragePaths : undefined,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unexpected error during commission purge';
    return { success: false, error: message };
  }
}



/** Toggle payment verified flag in Supabase and reconcile payments audit trail (Admin action). */
export async function toggleCommissionPaymentInDb(
  commissionId: string,
  field: 'deposit_paid' | 'final_paid',
  value: boolean,
  currentStage?: CommissionStage,
): Promise<{ success: boolean; error: string | null }> {
  if (!supabase) return { success: false, error: 'Supabase not connected' };

  const updates: Record<string, unknown> = { [field]: value };
  if (field === 'deposit_paid' && value && currentStage === 'awaiting_deposit') {
    updates.status_stage = 'sketching';
    updates.progress = 42;
  } else if (field === 'final_paid' && value && currentStage === 'sketch_approval') {
    updates.status_stage = 'lineart_coloring';
    updates.progress = 85;
  }

  // 1. Update commission row
  const { error: commError } = await supabase.from('commissions').update(updates).eq('id', commissionId);
  if (commError) return { success: false, error: commError.message };

  // 2. Reconcile payments audit record if verifying
  if (value) {
    const paymentKinds = field === 'deposit_paid' ? ['deposit', 'full'] : ['final', 'full'];
    await supabase
      .from('payments')
      .update({ status: 'verified', updated_at: new Date().toISOString() })
      .eq('commission_id', commissionId)
      .in('kind', paymentKinds)
      .eq('status', 'submitted');
  }

  return { success: true, error: null };
}
```

---

### 4.3 Data Layer Mutations (`src/lib/queries.ts`)

```typescript
export function useDeclineCommissionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      commissionId,
      reason,
      targetStage = 'declined',
    }: {
      commissionId: string;
      reason?: string;
      targetStage?: 'declined' | 'cancelled';
    }) => {
      const res = await archiveOrDeclineCommissionInDb(commissionId, targetStage, reason);
      if (!res.success) throw new Error(res.error ?? `Failed to mark order as ${targetStage}`);
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.commissions });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.publicStudioData });
    },
  });
}

export function useDeleteCommissionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (commissionId: string) => {
      const res = await deleteCommissionInDb(commissionId);
      if (!res.success) throw new Error(res.error ?? 'Failed to delete commission');
      return { commissionId, failedStoragePaths: res.failedStoragePaths };
    },
    onMutate: async (deletedId) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.commissions });
      const previousAdmin = queryClient.getQueryData<SubmittedOrder[]>(QUERY_KEYS.adminCommissions);

      if (previousAdmin) {
        queryClient.setQueryData<SubmittedOrder[]>(
          QUERY_KEYS.adminCommissions,
          previousAdmin.filter((o) => o.id !== deletedId),
        );
      }
      return { previousAdmin };
    },
    onError: (_err, _deletedId, context) => {
      if (context?.previousAdmin) {
        queryClient.setQueryData(QUERY_KEYS.adminCommissions, context.previousAdmin);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.commissions });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.publicStudioData });
    },
  });
}

export function useTogglePaymentFlagMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      commissionId,
      field,
      value,
      currentStage,
    }: {
      commissionId: string;
      field: 'deposit_paid' | 'final_paid';
      value: boolean;
      currentStage?: CommissionStage;
    }) => {
      return toggleCommissionPaymentInDb(commissionId, field, value, currentStage);
    },
    onSuccess: (_, { commissionId }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.commissions });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.payments(commissionId) });
    },
  });
}

export function useSubmitPaymentReceiptMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      commissionId,
      kind,
      amount,
      currency,
      receiptPath,
    }: {
      commissionId: string;
      kind: 'deposit' | 'final' | 'full';
      amount: number;
      currency: any;
      receiptPath?: string;
    }) => {
      return submitPaymentReceiptInDb(commissionId, kind, amount, currency, receiptPath);
    },
    onSuccess: (_, { commissionId }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.commissions });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.payments(commissionId) });
    },
  });
}

export function useUpdateScheduleMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      commissionId,
      startDate,
      estEndDate,
    }: {
      commissionId: string;
      startDate: string;
      estEndDate: string;
    }) => {
      return updateCommissionScheduleInDb(commissionId, startDate, estEndDate);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.commissions });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.publicStudioData });
    },
  });
}

export function useSendMessageMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      commissionId,
      body,
      opts,
    }: {
      commissionId: string;
      body: string;
      opts?: { attachmentUrl?: string; attachmentKind?: any };
    }) => {
      return sendCommissionMessageInDb(commissionId, body, opts);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.commissions });
    },
  });
}

export function useUpdateStudioSettingsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (patch: Partial<StudioSettingsRow>) => {
      return updateStudioSettingsInDb(patch);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.publicStudioData });
    },
  });
}


export function useUpdateCommissionBriefMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      commissionId,
      patch,
    }: {
      commissionId: string;
      patch: { characterName?: string; poseAndVibe?: string; backgroundNotes?: string };
    }) => {
      return updateCommissionBriefInDb(commissionId, patch);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.commissions });
    },
  });
}

export function useRequestCancellationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      commissionId,
      reason,
    }: {
      commissionId: string;
      reason: string;
    }) => {
      return requestCommissionCancellationInDb(commissionId, reason);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.commissions });
    },
  });
}
```

---

### 4.4 Context Wiring (`src/context/StudioContext.tsx` Lifecycle Actions)

```typescript
const setOrderStage = useCallback(
    (orderId: string, stage: CommissionStage) => {
      const meta = STAGE_STEPS.find((s) => s.id === stage);
      const progress = meta?.progress;
      const target = submittedOrders.find((o) => o.id === orderId);
      const orderLabel = target?.orderCode || orderId.slice(0, 8);

      if (isSupabaseConfigured && orderId !== DEMO_SHOWCASE_ORDER.id) {
        updateStageMut.mutate(
          { commissionId: orderId, stage, progress },
          {
            onSuccess: () => showToast(`Order #${orderLabel} moved to ${meta?.shortLabel ?? stage}.`),
            onError: (err) => showToast(err.message),
          },
        );
      } else {
        setLocalOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, stage, progress: progress ?? o.progress } : o)),
        );
        showToast(`Order #${orderLabel} moved to ${meta?.shortLabel ?? stage}.`);
      }
    },
    [isSupabaseConfigured, showToast, submittedOrders, updateStageMut],
  );

  const declineOrder = useCallback(
    (orderId: string, reason?: string) => {
      const target = submittedOrders.find((o) => o.id === orderId);
      const orderLabel = target?.orderCode || orderId.slice(0, 8);
      if (isSupabaseConfigured && orderId !== DEMO_SHOWCASE_ORDER.id) {
        declineMut.mutate(
          { commissionId: orderId, reason, targetStage: 'declined' },
          {
            onSuccess: () => showToast(`Order #${orderLabel} declined and moved to Archive.`),
            onError: (err) => showToast(err.message),
          },
        );
      } else {
        setLocalOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, declined: true, stage: 'declined' } : o)),
        );
        showToast(`Order #${orderLabel} moved to Archive.`);
      }
    },
    [declineMut, isSupabaseConfigured, showToast, submittedOrders],
  );

  const cancelOrder = useCallback(
    (orderId: string, reason?: string) => {
      const target = submittedOrders.find((o) => o.id === orderId);
      const orderLabel = target?.orderCode || orderId.slice(0, 8);
      if (isSupabaseConfigured && orderId !== DEMO_SHOWCASE_ORDER.id) {
        declineMut.mutate(
          { commissionId: orderId, reason, targetStage: 'cancelled' },
          {
            onSuccess: () => showToast(`Order #${orderLabel} cancelled and moved to Archive.`),
            onError: (err) => showToast(err.message),
          },
        );
      } else {
        setLocalOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, stage: 'cancelled' } : o)),
        );
        showToast(`Order #${orderLabel} cancelled and moved to Archive.`);
      }
    },
    [declineMut, isSupabaseConfigured, showToast, submittedOrders],
  );

  const deleteOrder = useCallback(
    async (orderId: string): Promise<boolean> => {
      const target = submittedOrders.find((o) => o.id === orderId);
      const orderLabel = target?.orderCode || orderId.slice(0, 8);
      if (isSupabaseConfigured && orderId !== DEMO_SHOWCASE_ORDER.id) {
        try {
          const res = await deleteMut.mutateAsync(orderId);
          if (res.failedStoragePaths && res.failedStoragePaths.length > 0) {
            console.error('Failed storage cleanup paths for order:', orderId, res.failedStoragePaths);
            showToast(
              `Order #${orderLabel} deleted from database, but ${res.failedStoragePaths.length} storage files failed to remove.`,
            );
          } else {
            showToast(`Order #${orderLabel} permanently purged.`);
          }
          return true;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Failed to delete order';
          showToast(msg);
          return false;
        }
      } else {
        setLocalOrders((prev) => prev.filter((o) => o.id !== orderId));
        showToast(`Order #${orderLabel} removed.`);
        return true;
      }
    },
    [deleteMut, isSupabaseConfigured, showToast, submittedOrders],
  );
```

---

### 4.5 `src/components/admin/useSegmentedAdminOrders.ts`

```typescript
import { useMemo } from 'react';
import type { SubmittedOrder } from '@/types';

export interface SegmentedAdminOrders {
  incomingBriefs: SubmittedOrder[];
  activePipeline: SubmittedOrder[];
  pendingPayments: SubmittedOrder[];
  archivedOrders: SubmittedOrder[];
  counts: {
    briefs: number;
    active: number;
    payments: number;
    archived: number;
    total: number;
  };
}

/**
 * Pure segmentation function categorizing commissions into administrative lifecycles:
 * - incomingBriefs: status_stage === 'pending_review'
 * - activePipeline: in progress ('awaiting_deposit', 'sketching', 'sketch_approval', 'lineart_coloring')
 * - pendingPayments: awaiting deposit or final payment verification
 * - archivedOrders: terminal states ('declined', 'cancelled', 'completed')
 */
export function segmentAdminOrders(orders: SubmittedOrder[]): SegmentedAdminOrders {
  const incomingBriefs = orders.filter((o) => o.stage === 'pending_review');

  const activePipeline = orders.filter((o) =>
    ['awaiting_deposit', 'sketching', 'sketch_approval', 'lineart_coloring'].includes(o.stage),
  );

  const pendingPayments = orders.filter((o) => {
    if (o.stage === 'awaiting_deposit' && !o.depositPaid) return true;
    if (
      ['sketch_approval', 'lineart_coloring', 'completed'].includes(o.stage) &&
      o.paymentSplit === '50_50' &&
      !o.finalPaid
    ) {
      return true;
    }
    return false;
  });

  const archivedOrders = orders.filter((o) =>
    ['declined', 'cancelled', 'completed'].includes(o.stage),
  );

  return {
    incomingBriefs,
    activePipeline,
    pendingPayments,
    archivedOrders,
    counts: {
      briefs: incomingBriefs.length,
      active: activePipeline.length,
      payments: pendingPayments.length,
      archived: archivedOrders.length,
      total: orders.length,
    },
  };
}

/**
 * React hook wrapper around segmentAdminOrders.
 */
export function useSegmentedAdminOrders(orders: SubmittedOrder[]): SegmentedAdminOrders {
  return useMemo(() => segmentAdminOrders(orders), [orders]);
}
```

---

### 4.6 `src/components/admin/AdminNav.tsx`

```typescript
import { type KeyboardEvent } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  FileText,
  Layers,
  CreditCard,
  Sliders,
  Archive,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type AdminSubTab = 'pipeline' | 'briefs' | 'payments' | 'settings' | 'archive';

interface NavItem {
  id: AdminSubTab;
  label: string;
  short: string;
  icon: typeof Layers;
  badge?: number;
  badgeColor?: string;
}

interface AdminNavProps {
  activeSubTab: AdminSubTab;
  onChangeSubTab: (tab: AdminSubTab) => void;
  counts: {
    briefs: number;
    active: number;
    payments: number;
    archived: number;
  };
}

export function AdminNav({ activeSubTab, onChangeSubTab, counts }: AdminNavProps) {
  const shouldReduceMotion = useReducedMotion();

  const tabs: NavItem[] = [
    {
      id: 'pipeline',
      label: 'Pipeline & Queue',
      short: 'Pipeline',
      icon: Layers,
      badge: counts.active,
      badgeColor: 'bg-teal text-white',
    },
    {
      id: 'briefs',
      label: 'Incoming Briefs',
      short: 'Briefs',
      icon: FileText,
      badge: counts.briefs,
      badgeColor: 'bg-mustard text-ink font-bold animate-pulse motion-reduce:animate-none',
    },
    {
      id: 'payments',
      label: 'Payments & Ledger',
      short: 'Payments',
      icon: CreditCard,
      badge: counts.payments,
      badgeColor: 'bg-coral text-white',
    },
    {
      id: 'settings',
      label: 'Studio & Availability',
      short: 'Settings',
      icon: Sliders,
    },
    {
      id: 'archive',
      label: 'Archive & Purge',
      short: 'Archive',
      icon: Archive,
      badge: counts.archived,
      badgeColor: 'bg-line text-ink-soft',
    },
  ];

  const handleKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const target = e.target as HTMLElement;
    const tabButton = target.closest<HTMLButtonElement>('button[role="tab"]');
    const tabId = tabButton?.id.replace('admin-tab-', '');
    let currentIndex = tabs.findIndex((t) => t.id === tabId);
    if (currentIndex === -1) {
      currentIndex = tabs.findIndex((t) => t.id === activeSubTab);
    }
    if (currentIndex === -1) return;

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const nextIndex = (currentIndex + 1) % tabs.length;
      onChangeSubTab(tabs[nextIndex].id);
      document.getElementById(`admin-tab-${tabs[nextIndex].id}`)?.focus();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      onChangeSubTab(tabs[prevIndex].id);
      document.getElementById(`admin-tab-${tabs[prevIndex].id}`)?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      onChangeSubTab(tabs[0].id);
      document.getElementById(`admin-tab-${tabs[0].id}`)?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      onChangeSubTab(tabs[tabs.length - 1].id);
      document.getElementById(`admin-tab-${tabs[tabs.length - 1].id}`)?.focus();
    }
  };

  return (
    <nav
      aria-label="Admin Dashboard Tabs"
      role="tablist"
      onKeyDown={handleKeyDown}
      className="mb-8 flex flex-wrap gap-2 rounded-2xl border border-line bg-paper/90 p-1.5 backdrop-blur sm:gap-2.5 sm:p-2"
    >
      {tabs.map((tab) => {
        const active = activeSubTab === tab.id;
        const Icon = tab.icon;

        return (
          <button
            key={tab.id}
            id={`admin-tab-${tab.id}`}
            role="tab"
            type="button"
            aria-selected={active}
            aria-controls={active ? `admin-panel-${tab.id}` : undefined}
            tabIndex={active ? 0 : -1}
            onClick={() => onChangeSubTab(tab.id)}
            className={cn(
              'relative flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold whitespace-nowrap transition-all duration-200 sm:px-4 sm:py-3 sm:text-sm',
              active
                ? 'text-white'
                : 'text-ink-soft hover:bg-cream hover:text-ink',
            )}
          >
            {active && (
              <motion.span
                layoutId={shouldReduceMotion ? undefined : 'admin-subtab-pill'}
                className="absolute inset-0 rounded-xl bg-ink"
                transition={shouldReduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5 sm:gap-2">
              <Icon className={cn('size-4 shrink-0', active ? 'text-mustard' : 'text-ink-mute')} />
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="inline sm:hidden">{tab.short}</span>
              {typeof tab.badge === 'number' && tab.badge > 0 && (
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.2 text-[10px] font-bold sm:px-2 sm:py-0.5 sm:text-xs',
                    tab.badgeColor ?? 'bg-line text-ink',
                  )}
                >
                  {tab.badge}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
```

---

### 4.7 `src/components/admin/dialogs/DeleteOrderDialog.tsx`

```typescript
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trash2, AlertOctagon, Loader2, AlertTriangle, Ban } from 'lucide-react';
import type { SubmittedOrder } from '@/types';
import { getTier, formatUsd } from '@/lib/utils';

interface DeleteOrderDialogProps {
  order: SubmittedOrder | null;
  isOpen: boolean;
  isDeleting: boolean;
  onClose: () => void;
  onConfirmDelete: (orderId: string) => Promise<boolean>;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])';

export function DeleteOrderDialog({
  order,
  isOpen,
  isDeleting,
  onClose,
  onConfirmDelete,
}: DeleteOrderDialogProps) {
  const [confirmInput, setConfirmInput] = useState('');
  const onCloseRef = useRef(onClose);

  // Update ref in effect to comply with strict React linting
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  const isConfirmed = confirmInput.trim().toUpperCase() === 'DELETE';
  const hasPaidRecords = Boolean(order?.depositPaid || order?.finalPaid);
  const hasUnpaidCompletedBalance = Boolean(
    order?.stage === 'completed' && order?.paymentSplit === '50_50' && !order?.finalPaid,
  );

  // 1. Capture previously focused element on open and restore on close (strictly dependent on isOpen)
  useEffect(() => {
    if (isOpen) {
      previouslyFocusedElementRef.current = document.activeElement as HTMLElement;
      setConfirmInput('');

      return () => {
        previouslyFocusedElementRef.current?.focus();
      };
    } else {
      setConfirmInput('');
    }
  }, [isOpen]);

  // 2. Separate focus placement effect (does NOT clear typed confirmation or restore background focus)
  useEffect(() => {
    if (!isOpen) return;

    const timer = window.setTimeout(() => {
      if (!hasUnpaidCompletedBalance && inputRef.current) {
        inputRef.current.focus();
      } else if (closeBtnRef.current) {
        closeBtnRef.current.focus();
      } else if (modalRef.current) {
        modalRef.current.focus();
      }
    }, 50);

    return () => window.clearTimeout(timer);
  }, [isOpen, hasUnpaidCompletedBalance]);

  // 2. Keyboard focus trap (ignoring disabled elements so Tab wraps properly)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isDeleting) {
        e.preventDefault();
        onCloseRef.current();
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
        if (focusable.length === 0) {
          e.preventDefault();
          modalRef.current?.focus();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isDeleting]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!order || !isConfirmed || isDeleting || hasUnpaidCompletedBalance) return;
    const ok = await onConfirmDelete(order.id);
    if (ok) {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && order && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
          aria-describedby="delete-dialog-desc"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-ink/70 backdrop-blur-sm"
            onClick={() => !isDeleting && onClose()}
          />

          <motion.div
            ref={modalRef}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ duration: 0.2 }}
            className="relative w-full max-w-md overflow-hidden rounded-3xl border border-coral/30 bg-paper p-6 shadow-2xl focus:outline-none"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-coral/10 text-coral">
                  <AlertOctagon className="size-5" />
                </span>
                <div>
                  <h3 id="delete-dialog-title" className="font-display text-lg font-bold text-coral">
                    Permanently Purge Order
                  </h3>
                  <p id="delete-dialog-desc" className="text-xs text-ink-soft">
                    #{order.orderCode || order.id} · {getTier(order.tier).label} ({formatUsd(order.totalUsd)})
                  </p>
                </div>
              </div>

              <button
                type="button"
                ref={closeBtnRef}
                disabled={isDeleting}
                onClick={onClose}
                aria-label="Close dialog"
                className="rounded-full p-1.5 text-ink-mute transition hover:bg-cream hover:text-ink disabled:opacity-50"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Unpaid Completed Order Block */}
            {hasUnpaidCompletedBalance ? (
              <div className="mt-4 rounded-2xl border border-coral/40 bg-coral-soft p-4 text-xs text-ink">
                <div className="flex items-start gap-2.5">
                  <Ban className="size-5 shrink-0 text-coral" />
                  <div>
                    <p className="font-bold text-coral">Purge Blocked: Outstanding Balance Due</p>
                    <p className="mt-1 text-ink-soft">
                      This completed order has an unverified 50% final payment balance ({formatUsd(Math.max(0, order.totalUsd - order.depositUsd))}). To protect your studio records, completed orders with unpaid amounts cannot be purged. Reconcile or verify payment in the Payments tab first.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-coral/30 bg-coral-soft/50 p-4 text-xs text-ink">
                <p className="font-semibold text-coral">⚠️ Destructive Action (Cannot Be Undone):</p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-ink-soft">
                  <li>Permanently deletes this commission and all chat history from the database.</li>
                  <li>Purges uploaded client references, chat attachments, WIP previews, and 300 DPI master files from storage buckets.</li>
                  <li>This action is final and irrecoverable.</li>
                </ul>
              </div>
            )}

            {/* Financial Ledger Warning */}
            {hasPaidRecords && !hasUnpaidCompletedBalance && (
              <div className="mt-3 rounded-2xl border border-mustard/60 bg-mustard-soft/80 p-3 text-xs text-ink">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="size-4 shrink-0 text-mustard" />
                  <div>
                    <p className="font-bold text-ink">Financial Ledger Notice:</p>
                    <p className="mt-0.5 text-ink-soft">
                      This order contains verified payment records ({order.depositPaid ? 'Deposit Verified' : ''}{order.depositPaid && order.finalPaid ? ' + ' : ''}{order.finalPaid ? 'Final Verified' : ''}). Hard-deleting it will permanently purge the associated payment transactions.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              {!hasUnpaidCompletedBalance && (
                <div>
                  <label htmlFor="confirm-delete-input" className="block text-xs font-semibold text-ink">
                    Type <span className="font-mono font-bold text-coral">DELETE</span> to confirm:
                  </label>
                  <input
                    id="confirm-delete-input"
                    ref={inputRef}
                    type="text"
                    disabled={isDeleting}
                    value={confirmInput}
                    onChange={(e) => setConfirmInput(e.target.value)}
                    placeholder="DELETE"
                    autoComplete="off"
                    className="mt-1.5 w-full rounded-2xl border border-line bg-canvas p-3 font-mono text-sm tracking-wider text-ink uppercase transition focus:border-coral focus:outline-none focus:ring-1 focus:ring-coral"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={onClose}
                  className="rounded-full border border-line px-4 py-2 text-xs font-medium text-ink transition hover:bg-cream disabled:opacity-50"
                >
                  {hasUnpaidCompletedBalance ? 'Close' : 'Cancel'}
                </button>
                {!hasUnpaidCompletedBalance && (
                  <button
                    type="submit"
                    disabled={!isConfirmed || isDeleting}
                    className="inline-flex items-center gap-1.5 rounded-full bg-coral px-5 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isDeleting ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin" /> Purging Storage & DB...
                      </>
                    ) : (
                      <>
                        <Trash2 className="size-3.5" /> Purge Order Forever
                      </>
                    )}
                  </button>
                )}
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
```

---

### 4.8 `src/components/admin/dialogs/DeclineReasonModal.tsx`

```typescript
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, XCircle, AlertTriangle } from 'lucide-react';
import type { SubmittedOrder } from '@/types';
import { getTier } from '@/lib/utils';

interface DeclineReasonModalProps {
  order: SubmittedOrder | null;
  isOpen: boolean;
  mode?: 'decline' | 'cancel';
  onClose: () => void;
  onConfirmDecline: (orderId: string, reason?: string) => void;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])';

export function DeclineReasonModal({
  order,
  isOpen,
  mode = 'decline',
  onClose,
  onConfirmDecline,
}: DeclineReasonModalProps) {
  const [reason, setReason] = useState('');
  const onCloseRef = useRef(onClose);

  // Update ref in effect to comply with strict React linting
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 1. Reset input and capture focus strictly on isOpen transitions
  useEffect(() => {
    if (isOpen) {
      previouslyFocusedElementRef.current = document.activeElement as HTMLElement;
      setReason('');
      const timer = window.setTimeout(() => {
        textareaRef.current?.focus();
      }, 50);

      return () => {
        window.clearTimeout(timer);
        previouslyFocusedElementRef.current?.focus();
      };
    } else {
      setReason('');
    }
  }, [isOpen]);

  // 2. Keyboard listener uses onCloseRef to prevent re-render resets
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!order) return;
    onConfirmDecline(order.id, reason.trim());
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && order && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="decline-dialog-title"
          aria-describedby="decline-dialog-desc"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-ink/60 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            ref={modalRef}
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ duration: 0.2 }}
            className="relative w-full max-w-md overflow-hidden rounded-3xl border border-line bg-paper p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-coral-soft text-coral">
                  <XCircle className="size-5" />
                </span>
                <div>
                  <h3 id="decline-dialog-title" className="font-display text-lg font-bold text-ink">
                    {mode === 'cancel' ? 'Cancel Commission Order' : 'Decline Commission Brief'}
                  </h3>
                  <p id="decline-dialog-desc" className="text-xs text-ink-soft">
                    #{order.orderCode || order.id} · {getTier(order.tier).label}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="Close dialog"
                className="rounded-full p-1.5 text-ink-mute transition hover:bg-cream hover:text-ink"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="mt-4 rounded-2xl border border-coral/30 bg-coral-soft/40 p-3 text-xs text-ink-soft">
              <div className="flex items-start gap-2">
                <AlertTriangle className="size-4 shrink-0 text-coral" />
                <p>
                  {mode === 'cancel'
                    ? 'Cancelling this commission will move the order into the Archive and release any scheduled calendar slot. The client will be notified in chat.'
                    : 'Declining this brief will move the order into the Archive and release any temporary slot lock. The client will be able to see the status when tracking.'}
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div>
                <label htmlFor="decline-reason" className="block text-xs font-semibold text-ink">
                  Reason / Note to Client <span className="font-normal text-ink-mute">(optional)</span>:
                </label>
                <textarea
                  id="decline-reason"
                  ref={textareaRef}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={
                    mode === 'cancel'
                      ? 'e.g. Mutual cancellation agreed with client; partial refund issued per TOS.'
                      : 'e.g. Schedule is currently full for complex mecha/armor; suggest booking next month.'
                  }
                  rows={3}
                  className="mt-1.5 w-full rounded-2xl border border-line bg-canvas p-3 text-xs text-ink transition focus:border-coral focus:outline-none focus:ring-1 focus:ring-coral"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full border border-line px-4 py-2 text-xs font-medium text-ink transition hover:bg-cream"
                >
                  Keep Order
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-full bg-coral px-5 py-2 text-xs font-semibold text-white transition hover:opacity-90"
                >
                  <XCircle className="size-3.5" />
                  {mode === 'cancel' ? 'Cancel Commission' : 'Decline Order'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
```

---

### 4.9 `src/components/admin/tabs/PipelineTab.tsx`

```typescript
import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  Calendar,
  Check,
  Eye,
  ImagePlus,
  Layers,
  Send,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { STAGE_STEPS } from '@/data/orders';
import { useStudio } from '@/context/StudioContext';
import {
  ACCENT_CLASSES,
  TIER_ACCENT,
  cn,
  formatUsd,
  getTier,
  getLocalTodayDate,
  getLocalFutureDate,
} from '@/lib/utils';
import { uploadWipArtwork } from '@/lib/storage';
import type { SubmittedOrder } from '@/types';

interface PipelineTabProps {
  orders: SubmittedOrder[];
  activeOrderId: string;
  setActiveOrderId: (id: string) => void;
  onOpenCancelModal?: (order: SubmittedOrder) => void;
}

export function PipelineTab({
  orders,
  activeOrderId,
  setActiveOrderId,
  onOpenCancelModal,
}: PipelineTabProps) {
  const {
    setOrderStage,
    toggleOrderPaymentFlag,
    updateOrderSchedule,
    uploadArtistWip,
    sendOrderMessage,
    setActiveTab,
    showToast,
  } = useStudio();

  // Active Order Fallback Guard (prevents null reference renders)
  const selectedOrder = useMemo(() => {
    return orders.find((o) => o.id === activeOrderId) ?? orders[0] ?? null;
  }, [orders, activeOrderId]);

  // WIP uploader state
  const [wipTitle, setWipTitle] = useState('');
  const [wipNote, setWipNote] = useState('');
  const [wipIsFinal, setWipIsFinal] = useState(false);
  const [artistReply, setArtistReply] = useState('');
  const wipFileRef = useRef<HTMLInputElement | null>(null);

  const handleWipUpload = (e: FormEvent, customUrl?: string) => {
    e.preventDefault();
    if (!selectedOrder) return;
    const defaultTitle = wipIsFinal
      ? `Final · High-Res ${getTier(selectedOrder.tier).label} Illustration`
      : `WIP #${selectedOrder.wips.length + 1} · Updated Progress`;
    uploadArtistWip(selectedOrder.id, {
      title: wipTitle.trim() || defaultTitle,
      artistNote: wipNote.trim() || 'Uploaded from Artist Admin Controller! Let me know your thoughts.',
      isFinal: wipIsFinal,
      imageUrl: customUrl,
    });
    setWipTitle('');
    setWipNote('');
  };

  const handleWipFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedOrder) return;

    const title = wipTitle.trim() || `${wipIsFinal ? 'Final' : 'WIP'} · ${file.name}`;
    const artistNote = wipNote.trim() || 'Uploaded new progress image from Admin Panel.';

    if (selectedOrder.id !== 'MRU-KITSUNE') {
      showToast('Processing artwork, applying watermark shield & uploading...');
      const { previewPath, masterPath, error } = await uploadWipArtwork(
        selectedOrder.id,
        selectedOrder.orderCode || selectedOrder.id,
        file,
        wipIsFinal,
      );
      if (error || !previewPath) {
        showToast(`Upload failed: ${error ?? 'Unknown error'}`);
      } else {
        uploadArtistWip(selectedOrder.id, {
          title,
          artistNote,
          isFinal: wipIsFinal,
          imageUrl: previewPath,
          highResUrl: masterPath || undefined,
        });
      }
    } else {
      const url = URL.createObjectURL(file);
      uploadArtistWip(selectedOrder.id, {
        title,
        artistNote,
        isFinal: wipIsFinal,
        imageUrl: url,
      });
    }

    setWipTitle('');
    setWipNote('');
    e.target.value = '';
  };

  const handleSendArtistMessage = (e: FormEvent) => {
    e.preventDefault();
    if (!selectedOrder || !artistReply.trim()) return;
    sendOrderMessage(selectedOrder.id, artistReply.trim(), { senderRole: 'artist' });
    setArtistReply('');
    showToast('Sent message as Meru Art!');
  };

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-3xl border border-line bg-paper/60 p-12 text-center">
        <div className="grid size-14 place-items-center rounded-full bg-cream text-ink-mute">
          <Layers className="size-7" />
        </div>
        <h3 className="mt-4 font-display text-xl font-bold text-ink">No Active Commissions in Pipeline</h3>
        <p className="mt-1 max-w-md text-xs text-ink-soft">
          There are currently no commissions in progress. Review incoming briefs in the "Incoming Briefs" tab to accept new projects into the active pipeline.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Active Order Horizontal Switcher */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold text-ink">
            Active Commissions In Production ({orders.length}):
          </p>
          <span className="text-[11px] text-ink-mute">Select an order to manage</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {orders.map((o) => {
            const active = selectedOrder?.id === o.id;
            const code = o.orderCode || o.id;
            const tier = getTier(o.tier);

            return (
              <button
                key={o.id}
                type="button"
                onClick={() => setActiveOrderId(o.id)}
                className={cn(
                  'flex items-center gap-2 rounded-2xl px-3.5 py-2 text-xs font-semibold transition-all',
                  active
                    ? 'bg-ink text-white shadow-xs'
                    : 'border border-line bg-paper text-ink-soft hover:border-ink/30 hover:text-ink',
                )}
              >
                <span>#{code}</span>
                <span className="opacity-70">· {tier.label}</span>
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.2 text-[10px] font-bold uppercase',
                    active ? 'bg-mustard text-ink' : 'bg-cream text-ink-mute',
                  )}
                >
                  {o.stage.replace('_', ' ')}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {selectedOrder && (
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Left Column (7 cols): Brief Details, Stage Controller & Schedule */}
          <div className="space-y-4 lg:col-span-7">
            {/* Header info */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-line bg-paper p-5 shadow-xs">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${ACCENT_CLASSES[TIER_ACCENT[selectedOrder.tier]].soft} ${ACCENT_CLASSES[TIER_ACCENT[selectedOrder.tier]].text}`}
                  >
                    {getTier(selectedOrder.tier).label} × {selectedOrder.characterCount}
                  </span>
                  <span className="font-display text-xl font-bold text-ink">
                    #{selectedOrder.orderCode || selectedOrder.id} · {selectedOrder.characterName || 'Client Request'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-ink-soft">
                  Client: <span className="font-semibold text-ink">{selectedOrder.clientContact || 'Anonymous'}</span>
                  {selectedOrder.poseAndVibe ? ` — "${selectedOrder.poseAndVibe}"` : ''}
                </p>
              </div>

              <div className="text-right">
                <p className="font-display text-2xl font-bold text-ink">
                  {formatUsd(selectedOrder.totalUsd)}
                </p>
                <p className="text-[11px] text-ink-mute">
                  Deposit: {formatUsd(selectedOrder.depositUsd)} ({selectedOrder.paymentSplit === '50_50' ? '50/50' : '100% upfront'})
                </p>
              </div>
            </div>

            {/* Payment Verification Toggles */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  toggleOrderPaymentFlag(selectedOrder.id, 'depositPaid');
                  showToast('Updated upfront deposit verification!');
                }}
                className={cn(
                  'flex items-center justify-between rounded-2xl border p-3.5 text-left transition-all',
                  selectedOrder.depositPaid
                    ? 'border-teal bg-teal-soft/50 text-ink'
                    : 'border-line bg-canvas text-ink-soft',
                )}
              >
                <div>
                  <p className="text-xs font-semibold text-ink">Upfront Deposit ({formatUsd(selectedOrder.depositUsd)})</p>
                  <p className="text-[11px] text-ink-mute">
                    {selectedOrder.depositPaid ? 'Verified · Sketch Unlocked' : 'Click to mark receipt verified'}
                  </p>
                </div>
                <span
                  className={cn(
                    'grid size-6 place-items-center rounded-full',
                    selectedOrder.depositPaid ? 'bg-teal text-white' : 'border border-line bg-paper',
                  )}
                >
                  {selectedOrder.depositPaid && <Check className="size-3.5" strokeWidth={3} />}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  toggleOrderPaymentFlag(selectedOrder.id, 'finalPaid');
                  showToast('Updated final payment verification!');
                }}
                className={cn(
                  'flex items-center justify-between rounded-2xl border p-3.5 text-left transition-all',
                  selectedOrder.finalPaid
                    ? 'border-teal bg-teal-soft/50 text-ink'
                    : 'border-line bg-canvas text-ink-soft',
                )}
              >
                <div>
                  <p className="text-xs font-semibold text-ink">
                    Remaining ({formatUsd(Math.max(0, selectedOrder.totalUsd - selectedOrder.depositUsd))})
                  </p>
                  <p className="text-[11px] text-ink-mute">
                    {selectedOrder.finalPaid ? 'Verified · Deliverable Unlocked' : 'Click to mark receipt verified'}
                  </p>
                </div>
                <span
                  className={cn(
                    'grid size-6 place-items-center rounded-full',
                    selectedOrder.finalPaid ? 'bg-teal text-white' : 'border border-line bg-paper',
                  )}
                >
                  {selectedOrder.finalPaid && <Check className="size-3.5" strokeWidth={3} />}
                </span>
              </button>
            </div>

            {/* Stage Controller Pills */}
            <div className="rounded-3xl border border-line bg-paper p-5">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold text-ink">Set Milestone Stage:</p>
                <span className="text-[11px] text-ink-mute">High-Res unlocked at Completed</span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {STAGE_STEPS.map((st, idx) => {
                  const active = selectedOrder.stage === st.id;
                  return (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => {
                        setOrderStage(selectedOrder.id, st.id);
                        showToast(`#${selectedOrder.id} moved to ${st.shortLabel}`);
                      }}
                      className={cn(
                        'rounded-xl border px-3 py-2 text-left text-xs font-semibold transition-all',
                        active
                          ? 'border-ink bg-ink text-white shadow-xs'
                          : 'border-line bg-canvas text-ink-soft hover:border-ink/30 hover:text-ink',
                      )}
                    >
                      {idx + 1}. {st.shortLabel}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-3">
                <span className="text-[11px] text-ink-mute">Client requested cancellation or unable to fulfill?</span>
                <button
                  type="button"
                  onClick={() => onOpenCancelModal?.(selectedOrder)}
                  className="inline-flex items-center gap-1 rounded-xl border border-coral/30 bg-coral/5 px-2.5 py-1.5 text-xs font-semibold text-coral transition hover:bg-coral hover:text-white"
                >
                  <XCircle className="size-3.5" /> Cancel Commission
                </button>
              </div>
            </div>

            {/* Start & Delivery Schedule Date Pickers */}
            <div className="grid grid-cols-2 gap-3 rounded-3xl border border-line bg-paper p-4">
              <div>
                <label className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-ink-soft">
                  <Calendar className="size-3 text-coral" /> Est. Start Date
                </label>
                <input
                  type="date"
                  value={selectedOrder.startDate ?? selectedOrder.preferredStartDate ?? getLocalTodayDate()}
                  onChange={(e) =>
                    updateOrderSchedule(
                      selectedOrder.id,
                      e.target.value,
                      selectedOrder.estEndDate ?? getLocalFutureDate(14),
                    )
                  }
                  className="w-full rounded-xl border border-line bg-canvas px-3 py-1.5 text-xs text-ink"
                />
              </div>
              <div>
                <label className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-ink-soft">
                  <Calendar className="size-3 text-teal" /> Est. Delivery Date
                </label>
                <input
                  type="date"
                  value={selectedOrder.estEndDate ?? getLocalFutureDate(14)}
                  onChange={(e) =>
                    updateOrderSchedule(
                      selectedOrder.id,
                      selectedOrder.startDate ?? selectedOrder.preferredStartDate ?? getLocalTodayDate(),
                      e.target.value,
                    )
                  }
                  className="w-full rounded-xl border border-line bg-canvas px-3 py-1.5 text-xs text-ink"
                />
              </div>
            </div>
          </div>

          {/* Right Column (5 cols): WIP Uploader & Chat */}
          <div className="space-y-4 lg:col-span-5">
            {/* Upload WIP */}
            <form onSubmit={handleWipUpload} className="space-y-3 rounded-3xl border border-line bg-paper p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <h4 className="font-display text-base font-bold text-ink">Upload WIP or Final Master</h4>
                <span className="text-[11px] text-ink-mute">{selectedOrder.wips.length} in vault</span>
              </div>

              <input
                type="text"
                value={wipTitle}
                onChange={(e) => setWipTitle(e.target.value)}
                placeholder="Title (e.g. WIP #2 · Lineart & Shading)"
                className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-xs text-ink focus:border-ink focus:outline-none"
              />

              <textarea
                rows={2}
                value={wipNote}
                onChange={(e) => setWipNote(e.target.value)}
                placeholder="Artist note shown to the client..."
                className="w-full resize-none rounded-xl border border-line bg-canvas p-2.5 text-xs text-ink focus:border-ink focus:outline-none"
              />

              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-ink">
                <input
                  type="checkbox"
                  checked={wipIsFinal}
                  onChange={(e) => setWipIsFinal(e.target.checked)}
                  className="size-4 accent-ink"
                />
                Mark as Final Master (Unlocks 300 DPI high-res)
              </label>

              <input
                ref={wipFileRef}
                type="file"
                accept="image/*"
                onChange={handleWipFileSelect}
                className="hidden"
              />

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => wipFileRef.current?.click()}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-line bg-canvas py-2.5 text-xs font-semibold text-ink transition hover:border-ink"
                >
                  <ImagePlus className="size-3.5 text-coral" /> Choose File
                </button>
                <button
                  type="submit"
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-ink py-2.5 text-xs font-semibold text-white transition hover:bg-coral"
                >
                  <Sparkles className="size-3.5 text-mustard" /> Post Sample WIP
                </button>
              </div>
            </form>

            {/* Quick Artist Chat */}
            <form onSubmit={handleSendArtistMessage} className="space-y-2.5 rounded-3xl border border-line bg-paper p-5 shadow-xs">
              <h4 className="font-display text-base font-bold text-ink">Send Message as Meru Art</h4>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={artistReply}
                  onChange={(e) => setArtistReply(e.target.value)}
                  placeholder="Send a live update to the client room..."
                  className="flex-1 rounded-full border border-line bg-canvas px-3.5 py-2 text-xs text-ink focus:border-ink focus:outline-none"
                />
                <button
                  type="submit"
                  aria-label="Send artist message"
                  className="grid size-9 shrink-0 place-items-center rounded-full bg-ink text-white transition hover:bg-coral"
                >
                  <Send className="size-3.5" />
                </button>
              </div>
            </form>

            <button
              type="button"
              onClick={() => setActiveTab('track')}
              className="flex w-full items-center justify-center gap-1.5 rounded-full border border-ink/20 bg-cream/80 py-2.5 text-xs font-semibold text-ink transition hover:bg-ink hover:text-white"
            >
              <Eye className="size-3.5" /> View #{selectedOrder.orderCode || selectedOrder.id} in Client Tracker Room →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

---

### 4.10 `src/components/admin/tabs/IncomingBriefsTab.tsx`

```typescript
import { CheckCircle2, XCircle, Clock, ExternalLink } from 'lucide-react';
import type { SubmittedOrder } from '@/types';
import { getTier, formatUsd, ACCENT_CLASSES, TIER_ACCENT } from '@/lib/utils';

interface IncomingBriefsTabProps {
  orders: SubmittedOrder[];
  onAcceptBrief: (orderId: string) => void;
  onOpenDeclineModal: (order: SubmittedOrder) => void;
}

export function IncomingBriefsTab({
  orders,
  onAcceptBrief,
  onOpenDeclineModal,
}: IncomingBriefsTabProps) {
  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-3xl border border-line bg-paper/60 p-12 text-center">
        <div className="grid size-14 place-items-center rounded-full bg-teal-soft text-teal">
          <CheckCircle2 className="size-7" />
        </div>
        <h3 className="mt-4 font-display text-xl font-bold text-ink">No Incoming Briefs</h3>
        <p className="mt-1 max-w-md text-xs text-ink-soft">
          All submitted commission briefs have been reviewed and accepted or archived. New inquiries submitted from the storefront will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-lg font-bold text-ink">
            Pending Client Briefs ({orders.length})
          </h3>
          <p className="text-xs text-ink-soft">
            Review incoming briefs, agree on scope, and accept to lock in the client’s deposit gate.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {orders.map((order) => {
          const tier = getTier(order.tier);
          const accent = ACCENT_CLASSES[TIER_ACCENT[order.tier]];

          return (
            <div
              key={order.id}
              className="flex flex-col justify-between rounded-3xl border border-line bg-paper p-5 shadow-xs transition hover:border-ink/20"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${accent.soft} ${accent.text}`}
                    >
                      {tier.label} × {order.characterCount}
                    </span>
                    <span className="rounded-full bg-mustard px-2 py-0.5 text-[10px] font-bold text-ink uppercase">
                      Pending Review
                    </span>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-xl font-bold text-ink">
                      {formatUsd(order.totalUsd)}
                    </p>
                    <p className="text-[11px] text-ink-mute">
                      Deposit: {formatUsd(order.depositUsd)} ({order.paymentSplit === '50_50' ? '50/50' : '100% upfront'})
                    </p>
                  </div>
                </div>

                <div className="mt-3">
                  <h4 className="font-display text-base font-bold text-ink">
                    #{order.orderCode || order.id} · {order.characterName || 'Untitled Character'}
                  </h4>
                  <p className="text-xs font-medium text-ink-soft">
                    Client: <span className="font-semibold text-ink">{order.clientContact || 'Anonymous'}</span>
                  </p>
                </div>

                <div className="mt-3 space-y-2 rounded-2xl border border-line/60 bg-canvas/70 p-3 text-xs text-ink">
                  <div>
                    <span className="font-semibold text-ink-mute">Pose & Vibe: </span>
                    <span>{order.poseAndVibe || 'Artist free reign'}</span>
                  </div>
                  {order.backgroundNotes && (
                    <div>
                      <span className="font-semibold text-ink-mute">Background / Details: </span>
                      <span>{order.backgroundNotes}</span>
                    </div>
                  )}
                  {/* Add-ons badges */}
                  <div className="flex flex-wrap gap-1 pt-1">
                    {order.addons.nsfw && (
                      <span className="rounded-md bg-coral/10 px-1.5 py-0.5 text-[10px] font-semibold text-coral">
                        +50% NSFW
                      </span>
                    )}
                    {order.addons.softFurry && (
                      <span className="rounded-md bg-teal/10 px-1.5 py-0.5 text-[10px] font-semibold text-teal">
                        +50% Soft Furry
                      </span>
                    )}
                    {order.addons.commercial && (
                      <span className="rounded-md bg-mustard/20 px-1.5 py-0.5 text-[10px] font-semibold text-ink">
                        +200% Commercial Use
                      </span>
                    )}
                  </div>
                </div>

                {/* References */}
                {order.references && order.references.length > 0 && (
                  <div className="mt-3">
                    <p className="text-[11px] font-semibold text-ink-mute">
                      Attached References ({order.references.length}):
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {order.references.map((ref, idx) => (
                        <a
                          key={idx}
                          href={ref.previewUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-full border border-line bg-canvas px-2.5 py-1 text-[11px] font-medium text-ink transition hover:border-ink"
                        >
                          Ref #{idx + 1} <ExternalLink className="size-2.5 text-ink-mute" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Actions: Accept or Decline */}
              <div className="mt-5 flex items-center justify-between gap-2 border-t border-line/70 pt-3">
                <span className="inline-flex items-center gap-1 text-[11px] text-ink-mute">
                  <Clock className="size-3" /> Submitted {order.createdAt ? new Date(order.createdAt).toLocaleDateString() : 'recently'}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenDeclineModal(order)}
                    className="inline-flex items-center gap-1 rounded-full border border-coral/30 px-3.5 py-1.5 text-xs font-semibold text-coral transition hover:bg-coral-soft"
                  >
                    <XCircle className="size-3.5" /> Decline
                  </button>
                  <button
                    type="button"
                    onClick={() => onAcceptBrief(order.id)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-teal px-4 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:opacity-90"
                  >
                    <CheckCircle2 className="size-3.5" /> Accept Brief
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

---

### 4.11 `src/components/admin/tabs/PaymentsTab.tsx`

```typescript
import { CheckCircle2, ExternalLink, ShieldCheck } from 'lucide-react';
import type { SubmittedOrder } from '@/types';
import { getTier, formatUsd } from '@/lib/utils';

interface PaymentsTabProps {
  orders: SubmittedOrder[];
  onTogglePaymentFlag: (orderId: string, field: 'depositPaid' | 'finalPaid') => void;
}

export function PaymentsTab({ orders, onTogglePaymentFlag }: PaymentsTabProps) {
  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-3xl border border-line bg-paper/60 p-12 text-center">
        <div className="grid size-14 place-items-center rounded-full bg-teal-soft text-teal">
          <ShieldCheck className="size-7" />
        </div>
        <h3 className="mt-4 font-display text-xl font-bold text-ink">All Payments Verified</h3>
        <p className="mt-1 max-w-md text-xs text-ink-soft">
          There are currently no active orders with outstanding unverified payment receipts. When clients submit payment slips, they will be surfaced here for 1-click verification.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-display text-lg font-bold text-ink">
          Payment Verification & Ledger ({orders.length})
        </h3>
        <p className="text-xs text-ink-soft">
          Verify client deposits before starting sketches, or verify final payments to unlock unwatermarked master file downloads.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {orders.map((order) => {
          const remainingUsd = Math.max(0, order.totalUsd - order.depositUsd);
          const needsDeposit = order.stage === 'awaiting_deposit' && !order.depositPaid;
          const needsFinal =
            ['sketch_approval', 'lineart_coloring', 'completed'].includes(order.stage) &&
            order.paymentSplit === '50_50' &&
            !order.finalPaid;

          // Find any receipt attachment uploaded in order chat
          const receiptAttachment = order.messages.find((m) => m.attachmentKind === 'receipt')?.attachmentUrl;

          return (
            <div
              key={order.id}
              className="flex flex-col justify-between rounded-3xl border border-line bg-paper p-5 shadow-xs transition hover:border-ink/20"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="rounded-full bg-cream px-2.5 py-0.5 text-[11px] font-semibold text-ink">
                      #{order.orderCode || order.id}
                    </span>
                    <h4 className="mt-1 font-display text-base font-bold text-ink">
                      {order.characterName || 'Commission Order'} · {getTier(order.tier).label}
                    </h4>
                    <p className="text-xs text-ink-soft">Client: {order.clientContact || 'Anonymous'}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-xl font-bold text-ink">
                      {formatUsd(order.totalUsd)}
                    </p>
                    <p className="text-[11px] text-ink-mute">
                      Split: {order.paymentSplit === '50_50' ? '50% / 50%' : '100% Upfront'}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-line/70 bg-canvas p-3">
                    <p className="text-[11px] font-semibold text-ink-mute">Deposit (Upfront)</p>
                    <p className="mt-0.5 font-display text-lg font-bold text-ink">
                      {formatUsd(order.depositUsd)}
                    </p>
                    <div className="mt-2">
                      {order.depositPaid ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-teal-soft px-2 py-0.5 text-[10px] font-bold text-teal">
                          <CheckCircle2 className="size-3" /> Verified
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-mustard px-2 py-0.5 text-[10px] font-bold text-ink">
                          Pending Verification
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-line/70 bg-canvas p-3">
                    <p className="text-[11px] font-semibold text-ink-mute">Final Balance</p>
                    <p className="mt-0.5 font-display text-lg font-bold text-ink">
                      {formatUsd(remainingUsd)}
                    </p>
                    <div className="mt-2">
                      {order.paymentSplit === '100_upfront' ? (
                        <span className="rounded-full bg-line px-2 py-0.5 text-[10px] font-medium text-ink-mute">
                          Paid in Full
                        </span>
                      ) : order.finalPaid ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-teal-soft px-2 py-0.5 text-[10px] font-bold text-teal">
                          <CheckCircle2 className="size-3" /> Verified
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-coral-soft px-2 py-0.5 text-[10px] font-bold text-coral">
                          Unpaid
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Attached receipt link if found */}
                {receiptAttachment && (
                  <div className="mt-3">
                    <a
                      href={receiptAttachment}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full border border-teal/40 bg-teal-soft/40 px-3 py-1 text-xs font-semibold text-teal transition hover:bg-teal-soft"
                    >
                      <ExternalLink className="size-3" /> View Uploaded Receipt Slip
                    </a>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-line/70 pt-3">
                {needsDeposit && (
                  <button
                    type="button"
                    onClick={() => onTogglePaymentFlag(order.id, 'depositPaid')}
                    className="inline-flex items-center gap-1.5 rounded-full bg-teal px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:opacity-90"
                  >
                    <CheckCircle2 className="size-3.5" /> Verify Deposit ({formatUsd(order.depositUsd)})
                  </button>
                )}

                {needsFinal && (
                  <button
                    type="button"
                    onClick={() => onTogglePaymentFlag(order.id, 'finalPaid')}
                    className="inline-flex items-center gap-1.5 rounded-full bg-teal px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:opacity-90"
                  >
                    <CheckCircle2 className="size-3.5" /> Verify Final Balance ({formatUsd(remainingUsd)})
                  </button>
                )}

                {!needsDeposit && !needsFinal && (
                  <button
                    type="button"
                    onClick={() => onTogglePaymentFlag(order.id, 'depositPaid')}
                    className="inline-flex items-center gap-1 rounded-full border border-line px-3 py-1.5 text-xs text-ink-soft hover:bg-cream"
                  >
                    Toggle Deposit Status
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

---

### 4.12 `src/components/admin/tabs/StudioSettingsTab.tsx`

```typescript
import { useState, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Lock,
  Minus,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { useStudio } from '@/context/StudioContext';
import { cn, formatMoney, formatShortDate } from '@/lib/utils';
import type { AvailabilityStatus, TierId } from '@/types';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function toIsoDate(year: number, monthIndex: number, day: number) {
  const m = String(monthIndex + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

export function StudioSettingsTab() {
  const {
    studioSettings,
    tiers,
    updateStudioSettings,
    resetStudioSettings,
    toggleBlockedDate,
    removeBlockedRange,
    queueSlots,
    showToast,
  } = useStudio();

  // Mini-calendar state for 1-click date blocking
  const [cursor, setCursor] = useState<{ year: number; month: number }>(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [blockReason, setBlockReason] = useState('Studio Busy / Exam Day');

  const monthLabel = useMemo(
    () => new Date(cursor.year, cursor.month, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
    [cursor],
  );

  const calendarDays = useMemo(() => {
    const firstDow = new Date(cursor.year, cursor.month, 1).getDay();
    const totalDays = new Date(cursor.year, cursor.month + 1, 0).getDate();
    const cells: Array<{ iso: string; day: number; blocked: boolean } | null> = [];
    for (let i = 0; i < firstDow; i++) cells.push(null);
    for (let day = 1; day <= totalDays; day++) {
      const iso = toIsoDate(cursor.year, cursor.month, day);
      const blocked = studioSettings.blockedRanges.some((b) => iso >= b.startDate && iso <= b.endDate);
      cells.push({ iso, day, blocked });
    }
    return cells;
  }, [cursor, studioSettings.blockedRanges]);

  const handlePriceChange = (tierId: TierId, raw: string) => {
    const val = Math.max(1, Number(raw) || 0);
    updateStudioSettings({
      basePrices: { ...studioSettings.basePrices, [tierId]: val },
    });
  };

  const handleMultiplierChange = (key: 'nsfw' | 'softFurry' | 'commercial', pctString: string) => {
    const pct = Math.max(0, Number(pctString) || 0);
    updateStudioSettings({
      multipliers: { ...studioSettings.multipliers, [key]: pct / 100 },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 border-b border-line pb-4 sm:flex-row sm:items-center">
        <div>
          <h3 className="font-display text-lg font-bold text-ink">
            Studio Availability & Storefront Settings
          </h3>
          <p className="text-xs text-ink-soft">
            Control commission intake status, slot capacity, blocked vacation days, live USD tier prices, and GCash conversion rate.
          </p>
        </div>

        <button
          type="button"
          onClick={resetStudioSettings}
          title="Reset all prices, multipliers & blocked dates to defaults"
          className="inline-flex items-center gap-1.5 self-start rounded-full border border-line bg-paper px-3.5 py-1.5 text-xs font-semibold text-ink-soft transition hover:border-ink hover:text-ink sm:self-auto"
        >
          <RotateCcw className="size-3.5" /> Reset to Defaults
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Availability & Slots (6 cols) */}
        <div className="card space-y-5 p-5 lg:col-span-6">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <div>
              <p className="text-[11px] font-semibold text-coral uppercase">1. Availability & Slots</p>
              <h4 className="font-display text-xl font-bold text-ink">Quick Studio Toggles</h4>
            </div>
            <span className="rounded-full bg-canvas px-3 py-1 text-xs font-semibold text-ink ring-1 ring-line">
              {queueSlots.length}/{studioSettings.maxSlots} Active Slots
            </span>
          </div>

          {/* Status Flipper */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-ink">Commission Status Badge</label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'open', label: 'OPEN', tone: 'bg-teal text-white' },
                  { id: 'waitlist', label: 'WAITLIST', tone: 'bg-mustard text-ink' },
                  { id: 'closed', label: 'CLOSED', tone: 'bg-coral text-white' },
                ] as { id: AvailabilityStatus; label: string; tone: string }[]
              ).map((st) => {
                const active = studioSettings.status === st.id;
                return (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => {
                      updateStudioSettings({ status: st.id });
                      showToast(`Studio status flipped to ${st.label}!`);
                    }}
                    className={cn(
                      'rounded-2xl border py-2.5 text-xs font-semibold tracking-wider transition-all',
                      active
                        ? `${st.tone} border-transparent shadow-xs`
                        : 'border-line bg-canvas text-ink-soft hover:border-ink/30',
                    )}
                  >
                    {st.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Max Slots Stepper */}
          <div className="flex items-center justify-between rounded-2xl border border-line bg-canvas px-4 py-3">
            <div>
              <p className="text-xs font-semibold text-ink">Maximum Active Commission Slots</p>
              <p className="text-[11px] text-ink-mute">
                Currently {Math.max(0, studioSettings.maxSlots - queueSlots.length)} open slot(s) on public calendar
              </p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-line bg-paper px-3 py-1">
              <button
                type="button"
                onClick={() => updateStudioSettings({ maxSlots: Math.max(1, studioSettings.maxSlots - 1) })}
                aria-label="Decrease max slots"
                className="text-ink-soft hover:text-ink"
              >
                <Minus className="size-3.5" />
              </button>
              <span className="font-display text-lg font-semibold text-ink">{studioSettings.maxSlots}</span>
              <button
                type="button"
                onClick={() => updateStudioSettings({ maxSlots: Math.min(10, studioSettings.maxSlots + 1) })}
                aria-label="Increase max slots"
                className="text-ink-soft hover:text-ink"
              >
                <Plus className="size-3.5" />
              </button>
            </div>
          </div>

          {/* Interactive Date Blocker */}
          <div className="rounded-2xl border border-line bg-canvas p-3.5">
            <div className="mb-2.5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-ink">Click Dates to Block / Unblock</p>
                <p className="text-[11px] text-ink-mute">{monthLabel} · Syncs with Schedule tab</p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    setCursor((c) => {
                      const d = new Date(c.year, c.month - 1, 1);
                      return { year: d.getFullYear(), month: d.getMonth() };
                    })
                  }
                  aria-label="Previous month"
                  className="grid size-7 place-items-center rounded-full border border-line bg-paper text-ink transition hover:bg-cream"
                >
                  <ChevronLeft className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setCursor((c) => {
                      const d = new Date(c.year, c.month + 1, 1);
                      return { year: d.getFullYear(), month: d.getMonth() };
                    })
                  }
                  aria-label="Next month"
                  className="grid size-7 place-items-center rounded-full border border-line bg-paper text-ink transition hover:bg-cream"
                >
                  <ChevronRight className="size-3.5" />
                </button>
              </div>
            </div>

            <input
              type="text"
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
              placeholder="Reason for blocking (e.g. CS Finals Week)"
              className="mb-2.5 w-full rounded-xl border border-line bg-paper px-3 py-1.5 text-xs text-ink focus:border-ink focus:outline-none"
            />

            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium text-ink-mute">
              {WEEKDAYS.map((w) => (
                <div key={w}>{w}</div>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {calendarDays.map((cell, i) =>
                !cell ? (
                  <div key={`e-${i}`} className="h-8" />
                ) : (
                  <button
                    key={cell.iso}
                    type="button"
                    onClick={() => {
                      toggleBlockedDate(cell.iso, blockReason);
                      showToast(
                        cell.blocked
                          ? `Unblocked ${formatShortDate(cell.iso)}`
                          : `Blocked ${formatShortDate(cell.iso)} (${blockReason})`,
                      );
                    }}
                    className={cn(
                      'flex h-8 items-center justify-center gap-0.5 rounded-lg border text-xs font-medium transition-colors',
                      cell.blocked
                        ? 'border-coral bg-coral text-white'
                        : 'border-line bg-paper text-ink hover:border-ink/40',
                    )}
                  >
                    <span>{cell.day}</span>
                    {cell.blocked && <Lock className="size-2.5" />}
                  </button>
                ),
              )}
            </div>

            {studioSettings.blockedRanges.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-2.5">
                {studioSettings.blockedRanges.map((b) => (
                  <span
                    key={b.id}
                    className="inline-flex items-center gap-1.5 rounded-full bg-coral-soft px-2.5 py-1 text-[11px] font-medium text-coral"
                  >
                    {formatShortDate(b.startDate)}
                    {b.endDate !== b.startDate ? `–${formatShortDate(b.endDate)}` : ''} · {b.reason}
                    <button
                      type="button"
                      onClick={() => removeBlockedRange(b.id)}
                      aria-label="Remove block"
                      className="hover:text-ink"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Dynamic Pricing & Multiplier Editor (6 cols) */}
        <div className="card space-y-5 p-5 lg:col-span-6">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <div>
              <p className="text-[11px] font-semibold text-coral uppercase">2. Live Storefront Pricing</p>
              <h4 className="font-display text-xl font-bold text-ink">Dynamic Price & Rate Editor</h4>
            </div>
            <DollarSign className="size-5 text-teal" />
          </div>

          {/* Base Tier Prices */}
          <div>
            <p className="mb-2 text-xs font-semibold text-ink">Base Tier Rates (USD $) — Updates Storefront Live</p>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {tiers.map((t) => (
                <label
                  key={t.id}
                  className="flex flex-col justify-between rounded-2xl border border-line bg-canvas p-3"
                >
                  <span className="text-xs font-medium text-ink-soft">{t.label}</span>
                  <div className="mt-1.5 flex items-center gap-1">
                    <span className="font-display text-lg font-semibold text-ink-mute">$</span>
                    <input
                      type="number"
                      min={1}
                      max={999}
                      value={studioSettings.basePrices[t.id]}
                      onChange={(e) => handlePriceChange(t.id, e.target.value)}
                      className="w-full rounded-lg border border-line bg-paper px-2 py-1 font-display text-lg font-semibold text-ink focus:border-ink focus:outline-none"
                    />
                  </div>
                  <span className="mt-1 text-[10px] text-ink-mute">
                    ≈ {formatMoney(studioSettings.basePrices[t.id], 'PHP')}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Add-on Multipliers */}
          <div>
            <p className="mb-2 text-xs font-semibold text-ink">Add-On Multipliers (% of Base Price)</p>
            <div className="grid grid-cols-3 gap-2.5">
              {(
                [
                  { key: 'nsfw', label: 'NSFW (+%)' },
                  { key: 'softFurry', label: 'Soft Furry (+%)' },
                  { key: 'commercial', label: 'Commercial (+%)' },
                ] as const
              ).map((m) => (
                <label key={m.key} className="rounded-2xl border border-line bg-canvas p-3">
                  <span className="block text-[11px] font-medium text-ink-soft">{m.label}</span>
                  <div className="mt-1.5 flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      max={500}
                      step={10}
                      value={Math.round(studioSettings.multipliers[m.key] * 100)}
                      onChange={(e) => handleMultiplierChange(m.key, e.target.value)}
                      className="w-full rounded-lg border border-line bg-paper px-2 py-1 font-display text-lg font-semibold text-ink focus:border-ink focus:outline-none"
                    />
                    <span className="text-xs font-semibold text-ink-mute">%</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* USD to PHP Exchange Rate */}
          <div className="flex flex-col justify-between gap-3 rounded-2xl border border-line bg-canvas p-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-xs font-semibold text-ink">GCash Exchange Rate (₱ PHP per $1 USD)</p>
              <p className="text-[11px] text-ink-mute">
                Used automatically when clients switch the calculator to ₱ PHP
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-display text-lg font-semibold text-ink">₱</span>
              <input
                type="number"
                min={1}
                max={200}
                step={0.5}
                value={studioSettings.usdToPhpRate}
                onChange={(e) =>
                  updateStudioSettings({ usdToPhpRate: Math.max(1, Number(e.target.value) || 58) })
                }
                className="w-24 rounded-xl border border-line bg-paper px-3 py-1.5 font-display text-lg font-semibold text-ink focus:border-ink focus:outline-none"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

---

### 4.13 `src/components/admin/tabs/ArchiveTab.tsx`

```typescript
import { useState, useMemo } from 'react';
import {
  Archive,
  Trash2,
  Calendar,
  XCircle,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import type { SubmittedOrder } from '@/types';
import { getTier, formatUsd, cn } from '@/lib/utils';

interface ArchiveTabProps {
  orders: SubmittedOrder[];
  onOpenDeleteDialog: (order: SubmittedOrder) => void;
}

type ArchiveFilter = 'all' | 'declined' | 'completed' | 'cancelled';

export function ArchiveTab({ orders, onOpenDeleteDialog }: ArchiveTabProps) {
  const [filter, setFilter] = useState<ArchiveFilter>('all');

  const filteredOrders = useMemo(() => {
    if (filter === 'all') return orders;
    return orders.filter((o) => o.stage === filter);
  }, [orders, filter]);

  const counts = useMemo(
    () => ({
      all: orders.length,
      declined: orders.filter((o) => o.stage === 'declined').length,
      completed: orders.filter((o) => o.stage === 'completed').length,
      cancelled: orders.filter((o) => o.stage === 'cancelled').length,
    }),
    [orders],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h3 className="font-display text-lg font-bold text-ink">
            Archive & Terminal Orders ({orders.length})
          </h3>
          <p className="text-xs text-ink-soft">
            Historical record of declined inquiries, completed deliveries, and cancellations. Safely purge unwanted briefs to minimize stored data.
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-line bg-paper p-1">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={cn(
              'rounded-xl px-3 py-1.5 text-xs font-semibold transition',
              filter === 'all'
                ? 'bg-ink text-white'
                : 'text-ink-soft hover:bg-cream hover:text-ink',
            )}
          >
            All ({counts.all})
          </button>
          <button
            type="button"
            onClick={() => setFilter('declined')}
            className={cn(
              'rounded-xl px-3 py-1.5 text-xs font-semibold transition',
              filter === 'declined'
                ? 'bg-coral text-white'
                : 'text-ink-soft hover:bg-cream hover:text-ink',
            )}
          >
            Declined ({counts.declined})
          </button>
          <button
            type="button"
            onClick={() => setFilter('completed')}
            className={cn(
              'rounded-xl px-3 py-1.5 text-xs font-semibold transition',
              filter === 'completed'
                ? 'bg-teal text-white'
                : 'text-ink-soft hover:bg-cream hover:text-ink',
            )}
          >
            Completed ({counts.completed})
          </button>
          <button
            type="button"
            onClick={() => setFilter('cancelled')}
            className={cn(
              'rounded-xl px-3 py-1.5 text-xs font-semibold transition',
              filter === 'cancelled'
                ? 'bg-ink-mute text-white'
                : 'text-ink-soft hover:bg-cream hover:text-ink',
            )}
          >
            Cancelled ({counts.cancelled})
          </button>
        </div>
      </div>

      {filteredOrders.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-line bg-paper/60 p-12 text-center">
          <div className="grid size-14 place-items-center rounded-full bg-cream text-ink-mute">
            <Archive className="size-7" />
          </div>
          <h4 className="mt-4 font-display text-lg font-bold text-ink">No Archived Orders Found</h4>
          <p className="mt-1 text-xs text-ink-soft">
            {filter === 'all'
              ? 'No orders have been declined, completed, or cancelled yet.'
              : `No orders matching filter "${filter}".`}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filteredOrders.map((order) => {
            const isDeclined = order.stage === 'declined';
            const isCompleted = order.stage === 'completed';
            const isCancelled = order.stage === 'cancelled';

            return (
              <div
                key={order.id}
                className="flex flex-col justify-between rounded-3xl border border-line bg-paper p-5 shadow-xs transition hover:border-ink/20"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-ink-mute">
                        #{order.orderCode || order.id}
                      </span>
                      {isDeclined && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-coral-soft px-2 py-0.5 text-[10px] font-bold text-coral">
                          <XCircle className="size-3" /> Declined
                        </span>
                      )}
                      {isCompleted && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-teal-soft px-2 py-0.5 text-[10px] font-bold text-teal">
                          <CheckCircle2 className="size-3" /> Completed
                        </span>
                      )}
                      {isCancelled && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-cream px-2 py-0.5 text-[10px] font-bold text-ink-mute">
                          <AlertCircle className="size-3" /> Cancelled
                        </span>
                      )}
                    </div>

                    <p className="font-display text-lg font-bold text-ink">
                      {formatUsd(order.totalUsd)}
                    </p>
                  </div>

                  <div className="mt-3">
                    <h4 className="font-display text-base font-bold text-ink">
                      {order.characterName || 'Untitled'} · {getTier(order.tier).label}
                    </h4>
                    <p className="text-xs text-ink-soft">Client: {order.clientContact || 'Anonymous'}</p>
                    {order.poseAndVibe && (
                      <p className="mt-1 line-clamp-2 text-xs text-ink-mute italic">
                        "{order.poseAndVibe}"
                      </p>
                    )}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-3 text-[11px] text-ink-mute">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="size-3" /> Created: {order.createdAt ? new Date(order.createdAt).toLocaleDateString() : 'N/A'}
                    </span>
                    {order.startDate && (
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="size-3 text-teal" /> Started: {order.startDate}
                      </span>
                    )}
                  </div>
                </div>

                {/* Purge button */}
                <div className="mt-5 flex items-center justify-between border-t border-line/70 pt-3">
                  <span className="text-[11px] text-ink-mute">
                    {order.wips.length} WIPs · {order.messages.length} messages
                  </span>
                  <button
                    type="button"
                    onClick={() => onOpenDeleteDialog(order)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-coral/30 bg-coral-soft/40 px-3.5 py-1.5 text-xs font-semibold text-coral transition hover:bg-coral hover:text-white"
                  >
                    <Trash2 className="size-3.5" /> Purge Order Forever
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

---

### 4.14 `src/components/admin/AdminDashboard.tsx`

```typescript
import { useState, useRef, useEffect } from 'react';
import { Eye, RotateCcw, Sliders } from 'lucide-react';
import { useStudio } from '@/context/StudioContext';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { Reveal } from '@/components/ui/Reveal';
import { useAdminRealtime } from '@/lib/realtime';
import { cn } from '@/lib/utils';
import { AdminNav, type AdminSubTab } from './AdminNav';
import { useSegmentedAdminOrders } from './useSegmentedAdminOrders';
import { PipelineTab } from './tabs/PipelineTab';
import { IncomingBriefsTab } from './tabs/IncomingBriefsTab';
import { PaymentsTab } from './tabs/PaymentsTab';
import { StudioSettingsTab } from './tabs/StudioSettingsTab';
import { ArchiveTab } from './tabs/ArchiveTab';
import { DeclineReasonModal } from './dialogs/DeclineReasonModal';
import { DeleteOrderDialog } from './dialogs/DeleteOrderDialog';
import type { SubmittedOrder } from '@/types';

export function AdminDashboard() {
  const {
    submittedOrders,
    isLoadingOrders,
    activeOrderId,
    setActiveOrderId,
    setOrderStage,
    declineOrder,
    cancelOrder,
    deleteOrder,
    toggleOrderPaymentFlag,
    resetStudioSettings,
    devAdminPreview,
    setDevAdminPreview,
    isArtistAdmin,
    user,
    showToast,
  } = useStudio();

  // Realtime WebSocket Subscription for Artist Admin control surface
  useAdminRealtime(isArtistAdmin, user?.id);

  // Segmented orders taxonomy
  const segmented = useSegmentedAdminOrders(submittedOrders);

  // Default to Incoming Briefs if there are any new briefs to review, otherwise Pipeline
  const [activeSubTab, setActiveSubTab] = useState<AdminSubTab>(() => {
    return segmented.counts.briefs > 0 ? 'briefs' : 'pipeline';
  });

  // Safe initial navigation: waits for async orders to load, then auto-selects briefs if new briefs exist
  // and the artist has not manually clicked a tab.
  // Realtime updates after initial load will NEVER hijack the artist's current workspace.
  const userInteractedRef = useRef(false);
  const initialNavDoneRef = useRef(false);

  const handleSubTabChange = (tab: AdminSubTab) => {
    userInteractedRef.current = true;
    setActiveSubTab(tab);
  };

  useEffect(() => {
    if (isLoadingOrders) return;

    if (!initialNavDoneRef.current) {
      if (!userInteractedRef.current && segmented.counts.briefs > 0) {
        setActiveSubTab('briefs');
      }
      initialNavDoneRef.current = true;
    }
  }, [isLoadingOrders, segmented.counts.briefs]);

  // Modal dialog states
  const [orderToDeclineOrCancel, setOrderToDeclineOrCancel] = useState<SubmittedOrder | null>(null);
  const [reasonModalMode, setReasonModalMode] = useState<'decline' | 'cancel'>('decline');
  const [orderToDelete, setOrderToDelete] = useState<SubmittedOrder | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Keep live order reference for deletion dialog to reflect real-time payment updates
  const liveOrderToDelete =
    (orderToDelete && submittedOrders.find((o) => o.id === orderToDelete.id)) || orderToDelete;

  const handleAcceptBrief = (orderId: string) => {
    setOrderStage(orderId, 'awaiting_deposit');
    const order = submittedOrders.find((o) => o.id === orderId);
    showToast(`Approved #${order?.orderCode || orderId.slice(0, 8)}! Client notified to upload deposit.`);
    // Automatically switch to pipeline tab if desired
    setActiveOrderId(orderId);
    setActiveSubTab('pipeline');
  };

  const handleConfirmDeclineOrCancel = (orderId: string, reason?: string) => {
    if (reasonModalMode === 'cancel') {
      cancelOrder(orderId, reason);
    } else {
      declineOrder(orderId, reason);
    }
  };

  const handleConfirmDelete = async (orderId: string): Promise<boolean> => {
    setIsDeleting(true);
    try {
      const ok = await deleteOrder(orderId);
      return ok;
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <section className="pt-28 pb-14 sm:pt-32">
      {/* Top Dev Mode Showcase Banner */}
      <Reveal className="mb-6 flex flex-col justify-between gap-3 rounded-3xl border border-ink/20 bg-cream/80 p-4 sm:flex-row sm:items-center sm:px-6">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-ink text-mustard">
            <Sliders className="size-5" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold tracking-wider text-coral uppercase">
                Artist Admin & Backoffice
              </span>
              <span className="rounded-full bg-teal-soft px-2 py-0.5 text-[10px] font-semibold text-teal">
                RLS Protected (`is_artist_admin()`)
              </span>
            </div>
            <p className="mt-0.5 text-xs text-ink-soft">
              Changes made here update the public storefront, calculator, availability calendar, and client order tracker in real time.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {import.meta.env.DEV && (
            <button
              type="button"
              onClick={() => setDevAdminPreview(!devAdminPreview)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition-colors',
                devAdminPreview ? 'bg-ink text-white' : 'border border-line bg-paper text-ink-soft',
              )}
            >
              <Eye className="size-3.5 text-mustard" />
              Dev Preview: {devAdminPreview ? 'ON' : 'OFF'}
            </button>
          )}
          <button
            type="button"
            onClick={resetStudioSettings}
            title="Reset all prices, multipliers & blocked dates to defaults"
            className="inline-flex items-center gap-1 rounded-full border border-line bg-paper px-3 py-2 text-xs font-semibold text-ink-soft transition hover:border-ink hover:text-ink"
          >
            <RotateCcw className="size-3.5" /> Reset
          </button>
        </div>
      </Reveal>

      <SectionHeading
        eyebrow="Studio Backoffice"
        title="Artist Admin Dashboard"
        subtitle="Manage commission pipeline, incoming client briefs, payment verification gates, live storefront rates, and order archiving."
      />

      {/* Sub-Navigation Tabs */}
      <AdminNav
        activeSubTab={activeSubTab}
        onChangeSubTab={handleSubTabChange}
        counts={{
          briefs: segmented.counts.briefs,
          active: segmented.counts.active,
          payments: segmented.counts.payments,
          archived: segmented.counts.archived,
        }}
      />

      {/* Active Tab Panel (WCAG tabpanel) */}
      <div
        role="tabpanel"
        id={`admin-panel-${activeSubTab}`}
        aria-labelledby={`admin-tab-${activeSubTab}`}
        tabIndex={0}
        className="focus:outline-none"
      >
        {activeSubTab === 'pipeline' && (
          <PipelineTab
            orders={segmented.activePipeline}
            activeOrderId={activeOrderId}
            setActiveOrderId={setActiveOrderId}
            onOpenCancelModal={(order) => {
              setReasonModalMode('cancel');
              setOrderToDeclineOrCancel(order);
            }}
          />
        )}

        {activeSubTab === 'briefs' && (
          <IncomingBriefsTab
            orders={segmented.incomingBriefs}
            onAcceptBrief={handleAcceptBrief}
            onOpenDeclineModal={(order) => {
              setReasonModalMode('decline');
              setOrderToDeclineOrCancel(order);
            }}
          />
        )}

        {activeSubTab === 'payments' && (
          <PaymentsTab
            orders={segmented.pendingPayments}
            onTogglePaymentFlag={toggleOrderPaymentFlag}
          />
        )}

        {activeSubTab === 'settings' && <StudioSettingsTab />}

        {activeSubTab === 'archive' && (
          <ArchiveTab
            orders={segmented.archivedOrders}
            onOpenDeleteDialog={(order) => setOrderToDelete(order)}
          />
        )}
      </div>

      {/* Decline & Cancel Reason Modal */}
      <DeclineReasonModal
        order={orderToDeclineOrCancel}
        isOpen={Boolean(orderToDeclineOrCancel)}
        mode={reasonModalMode}
        onClose={() => setOrderToDeclineOrCancel(null)}
        onConfirmDecline={handleConfirmDeclineOrCancel}
      />

      {/* Two-Step Destructive Delete Dialog */}
      <DeleteOrderDialog
        order={liveOrderToDelete}
        isOpen={Boolean(orderToDelete)}
        isDeleting={isDeleting}
        onClose={() => setOrderToDelete(null)}
        onConfirmDelete={handleConfirmDelete}
      />
    </section>
  );
}
```

---

### 4.15 `src/components/admin/AdminPanel.tsx`

```typescript
export { AdminDashboard as AdminPanel } from './AdminDashboard';
```

---

### 4.16 `tests/unit.test.ts` (Admin Order Segmentation Test Suite)

```typescript
describe('Admin Order Lifecycle Segmentation (segmentAdminOrders)', () => {
  const dummyBaseOrder: SubmittedOrder = {
    id: 'test-1',
    orderCode: 'MERU-20261102-TEST',
    createdAt: new Date().toISOString(),
    tier: 'fullbody',
    characterCount: 1,
    addons: { nsfw: false, softFurry: false, commercial: false },
    currency: 'USD',
    paymentSplit: '50_50',
    preferredStartDate: null,
    characterName: 'Test Character',
    poseAndVibe: 'Action pose',
    backgroundNotes: '',
    clientContact: 'client@example.com',
    references: [],
    tosAccepted: true,
    tosAcceptedAt: new Date().toISOString(),
    totalUsd: 100,
    depositUsd: 50,
    depositPaid: false,
    finalPaid: false,
    sketchApproved: false,
    stage: 'pending_review',
    progress: 0,
    authMethod: 'google',
    wips: [],
    messages: [],
  };

  it('correctly partitions incoming briefs from active pipeline and terminal archive', () => {
    const orders: SubmittedOrder[] = [
      { ...dummyBaseOrder, id: '1', stage: 'pending_review' },
      { ...dummyBaseOrder, id: '2', stage: 'awaiting_deposit', depositPaid: false },
      { ...dummyBaseOrder, id: '3', stage: 'sketching', depositPaid: true },
      { ...dummyBaseOrder, id: '4', stage: 'sketch_approval', depositPaid: true, finalPaid: false },
      { ...dummyBaseOrder, id: '5', stage: 'lineart_coloring', depositPaid: true, finalPaid: true },
      { ...dummyBaseOrder, id: '6', stage: 'completed', depositPaid: true, finalPaid: true },
      { ...dummyBaseOrder, id: '7', stage: 'declined' },
      { ...dummyBaseOrder, id: '8', stage: 'cancelled' },
    ];

    const result = segmentAdminOrders(orders);

    // Incoming briefs
    expect(result.incomingBriefs.map((o) => o.id)).toEqual(['1']);
    expect(result.counts.briefs).toBe(1);

    // Active pipeline
    expect(result.activePipeline.map((o) => o.id)).toEqual(['2', '3', '4', '5']);
    expect(result.counts.active).toBe(4);

    // Terminal archive (declined, cancelled, completed)
    expect(result.archivedOrders.map((o) => o.id)).toEqual(['6', '7', '8']);
    expect(result.counts.archived).toBe(3);

    // Pending payments: order 2 (unpaid deposit) and order 4 (unpaid final on 50/50 split)
    expect(result.pendingPayments.map((o) => o.id)).toEqual(['2', '4']);
    expect(result.counts.payments).toBe(2);

    // Invariant: briefs + active + archived must always partition total orders exactly
    expect(result.counts.briefs + result.counts.active + result.counts.archived).toBe(result.counts.total);
    expect(result.counts.total).toBe(8);
  });

  it('verifies partition invariant: briefs + active + archived === total across all commission stages', () => {
    const orders: SubmittedOrder[] = [
      { ...dummyBaseOrder, id: '1', stage: 'pending_review' },
      { ...dummyBaseOrder, id: '2', stage: 'awaiting_deposit' },
      { ...dummyBaseOrder, id: '3', stage: 'sketching' },
      { ...dummyBaseOrder, id: '4', stage: 'sketch_approval' },
      { ...dummyBaseOrder, id: '5', stage: 'lineart_coloring' },
      { ...dummyBaseOrder, id: '6', stage: 'completed' },
      { ...dummyBaseOrder, id: '7', stage: 'declined' },
      { ...dummyBaseOrder, id: '8', stage: 'cancelled' },
    ];

    const result = segmentAdminOrders(orders);
    expect(result.counts.briefs + result.counts.active + result.counts.archived).toBe(result.counts.total);
    expect(result.counts.total).toBe(orders.length);
  });

  it('flags completed orders with unpaid 50/50 balance in pendingPayments', () => {
    const orders: SubmittedOrder[] = [
      {
        ...dummyBaseOrder,
        id: 'comp-unpaid',
        stage: 'completed',
        paymentSplit: '50_50',
        depositPaid: true,
        finalPaid: false,
      },
      {
        ...dummyBaseOrder,
        id: 'comp-paid',
        stage: 'completed',
        paymentSplit: '50_50',
        depositPaid: true,
        finalPaid: true,
      },
    ];

    const result = segmentAdminOrders(orders);
    expect(result.counts.archived).toBe(2);
    expect(result.counts.payments).toBe(1);
    expect(result.pendingPayments.map((o) => o.id)).toEqual(['comp-unpaid']);
    expect(result.counts.briefs + result.counts.active + result.counts.archived).toBe(result.counts.total);
  });
});
```
