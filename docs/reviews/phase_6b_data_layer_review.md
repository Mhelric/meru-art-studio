# Phase 6B: Real Data Layer & OAuth Return Resumption (Revision 2)

## Overview
This updated review packet addresses all findings from the Gemini Argon Phase 6B engineering audit:
1. **OAuth Draft Preservation & In-Memory Lock:** Added `isResumingOAuthRef` to prevent duplicate submissions across React 19 StrictMode double-mounts. The brief `meru_pending_draft` is **strictly retained in `sessionStorage` and restored to active state** if Supabase insertion encounters a network drop or trigger rejection, preventing data loss.
2. **Pre-Redirect Cleanup:** If `signInWithOAuthProvider('google')` errors before redirecting, `sessionStorage` keys are immediately purged.
3. **Query Key Prefix Invalidation:** Standardized `QUERY_KEYS` hierarchy so `queryClient.invalidateQueries({ queryKey: ['commissions'] })` prefix-invalidates both client (`['commissions', 'mine', userId]`) and admin (`['commissions', 'admin']`) queries.
4. **Auth Guard on Admin Query:** `useCommissionsQuery` is strictly guarded by `enabled: Boolean(user)`, ensuring unauthenticated local dev preview (`?admin=1`) does not fire unauthorized queries against Supabase RLS.
5. **Payment Audit Reconciliation:** `toggleCommissionPaymentInDb()` now atomically updates `commissions.deposit_paid` / `commissions.final_paid` AND updates the matching row in `public.payments` to `status = 'verified'`, triggering Phase 6A's `enforce_payment_update_integrity` trigger to stamp `verified_by` and `verified_at`.

---

## 1. Full Implementation: OAuth Resumption (`src/context/StudioContext.tsx`)

```ts
  const isResumingOAuthRef = useRef(false);

  // Resume OAuth Submission when returning from Google redirect
  useEffect(() => {
    if (!supabase || !user || isResumingOAuthRef.current) return;
    const cameFromOAuth = sessionStorage.getItem('meru-oauth-return');
    const pendingDraftRaw = sessionStorage.getItem('meru_pending_draft');

    if (cameFromOAuth && pendingDraftRaw) {
      isResumingOAuthRef.current = true;
      sessionStorage.removeItem('meru-oauth-return'); // Consume redirect trigger flag immediately

      try {
        const parsedDraft = JSON.parse(pendingDraftRaw) as OrderDraft;
        const pricing = calculateOrderPricing(parsedDraft, studioSettings);

        insertCommissionInSupabase(user, parsedDraft, pricing)
          .then((res) => {
            if (res.order) {
              sessionStorage.removeItem('meru_pending_draft'); // Only clear draft on confirmed success
              queryClient.invalidateQueries({ queryKey: ['commissions'] });
              queryClient.invalidateQueries({ queryKey: ['publicStudioData'] });
              setActiveOrderId(res.order.id);
              resetDraft();
              window.history.replaceState(null, '', '#track');
              setActiveTabState('track');
              showToast(
                `Brief #${res.order.orderCode || res.order.id} submitted to Meru! Welcome to your order room.`,
              );
            } else if (res.error) {
              isResumingOAuthRef.current = false;
              // Restore draft into active form state so brief data is never lost
              setDraft(parsedDraft);
              showToast(res.error);
            }
          })
          .catch((err) => {
            isResumingOAuthRef.current = false;
            setDraft(parsedDraft);
            showToast('Network error while submitting your brief. Please try again.');
            console.error('Failed to insert OAuth commission:', err);
          });
      } catch (err) {
        sessionStorage.removeItem('meru_pending_draft');
        isResumingOAuthRef.current = false;
        console.error('Failed to parse pending OAuth brief:', err);
      }
    }
  }, [user, studioSettings, resetDraft, queryClient, showToast]);
```

### Pre-Redirect Cleanup in `submitOrder`
```ts
      if (supabase && authMethod !== 'demo') {
        if (!user) {
          sessionStorage.setItem('meru_pending_draft', JSON.stringify(draft));
          sessionStorage.setItem('meru-oauth-return', '1');
          const { error } = await signInWithOAuthProvider(authMethod === 'discord' ? 'discord' : 'google');
          if (error) {
            // Clean up immediately if OAuth failed pre-redirect
            sessionStorage.removeItem('meru_pending_draft');
            sessionStorage.removeItem('meru-oauth-return');
          }
          return { order: null, error: error ?? 'Redirecting to sign in...' };
        }

        const res = await insertCommissionInSupabase(user, draft, pricing);
        if (res.order) {
          queryClient.invalidateQueries({ queryKey: ['commissions'] });
          queryClient.invalidateQueries({ queryKey: ['publicStudioData'] });
          setActiveOrderId(res.order.id);
          resetDraft();
        }
        return res;
      }
```

---

## 2. Full Implementation: `src/lib/queries.ts`

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { User } from '@supabase/supabase-js';
import type { CommissionStage, OrderDraft, SubmittedOrder } from '@/types';
import {
  fetchAllCommissionsAdmin,
  fetchMyCommissions,
  fetchPublicStudioData,
  insertCommissionInSupabase,
  updateCommissionStageInDb,
  declineCommissionInDb,
  toggleCommissionPaymentInDb,
  updateCommissionScheduleInDb,
  sendCommissionMessageInDb,
  updateStudioSettingsInDb,
  submitPaymentReceiptInDb,
  type StudioSettingsRow,
} from '@/lib/supabase';

export const QUERY_KEYS = {
  publicStudioData: ['publicStudioData'] as const,
  commissions: ['commissions'] as const,
  myCommissions: (userId?: string) => ['commissions', 'mine', userId] as const,
  adminCommissions: ['commissions', 'admin'] as const,
  payments: (commissionId?: string) => ['payments', commissionId] as const,
};

export function usePublicStudioDataQuery() {
  return useQuery({
    queryKey: QUERY_KEYS.publicStudioData,
    queryFn: fetchPublicStudioData,
    staleTime: 1000 * 60, // 1 minute
  });
}

export function useCommissionsQuery(user: User | null, isArtistAdmin: boolean) {
  return useQuery({
    queryKey: isArtistAdmin ? QUERY_KEYS.adminCommissions : QUERY_KEYS.myCommissions(user?.id),
    queryFn: async (): Promise<SubmittedOrder[]> => {
      if (isArtistAdmin && user) {
        return fetchAllCommissionsAdmin();
      }
      if (user) {
        return fetchMyCommissions(user.id);
      }
      return [];
    },
    // Only query live Supabase when user is authenticated with a JWT
    enabled: Boolean(user),
    staleTime: 1000 * 15, // 15 seconds
  });
}

export function useSubmitCommissionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      user,
      draft,
      pricing,
    }: {
      user: User;
      draft: OrderDraft;
      pricing?: { totalUsd: number; depositUsd: number };
    }) => {
      return insertCommissionInSupabase(user, draft, pricing);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.commissions });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.publicStudioData });
    },
  });
}

export function useUpdateCommissionStageMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      commissionId,
      stage,
      progress,
    }: {
      commissionId: string;
      stage: CommissionStage;
      progress?: number;
    }) => {
      return updateCommissionStageInDb(commissionId, stage, progress);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.commissions });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.publicStudioData });
    },
  });
}

export function useDeclineCommissionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ commissionId }: { commissionId: string }) => {
      return declineCommissionInDb(commissionId);
    },
    onSuccess: () => {
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
```

---

## 3. Payment Verification & Audit Reconciliation (`src/lib/supabase.ts`)

```ts
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
    const paymentKind = field === 'deposit_paid' ? 'deposit' : 'final';
    await supabase
      .from('payments')
      .update({ status: 'verified', updated_at: new Date().toISOString() })
      .eq('commission_id', commissionId)
      .eq('kind', paymentKind)
      .eq('status', 'submitted');
  }

  return { success: true, error: null };
}

/** Record client payment submission in payments table without auto-advancing stage. */
export async function submitPaymentReceiptInDb(
  commissionId: string,
  kind: 'deposit' | 'final' | 'full',
  amount: number,
  currency: Currency,
  receiptPath?: string,
): Promise<{ payment: PaymentRecord | null; error: string | null }> {
  if (!supabase) return { payment: null, error: 'Supabase not connected' };

  const { data, error } = await supabase
    .from('payments')
    .insert({
      commission_id: commissionId,
      kind,
      amount,
      currency,
      receipt_path: receiptPath,
      status: 'submitted',
    })
    .select('*')
    .single();

  if (error || !data) return { payment: null, error: error?.message ?? 'Failed to record payment' };
  return { payment: mapPaymentRow(data as PaymentRow), error: null };
}
```

---

## 4. Track Order & Demo Isolation (`src/components/track/OrderTracker.tsx`)

```tsx
  // 1. Loading State
  if (isLoadingOrders && !isDemoMode) {
    return (
      <section className="pt-32 pb-16">
        <div className="mx-auto max-w-md text-center">
          <div className="mx-auto size-9 animate-spin rounded-full border-2 border-ink border-t-transparent" />
          <p className="mt-4 font-display text-sm font-medium text-ink">Loading your commissions...</p>
        </div>
      </section>
    );
  }

  // 2. Logged-out state
  if (!user && !isDemoMode) {
    return <LoggedOutTrackView onSignIn={signInWithGoogle} />;
  }

  // 3. Logged-in but zero orders submitted yet
  if (user && submittedOrders.length === 0) {
    return <EmptyTrackView onOpenDrawer={() => openDrawer({ step: 1 })} />;
  }
```

---

## Prompt for Gemini Argon (Copy & Paste to App)

```text
Act as a Principal Full-Stack Engineer and Software Architect. Review the Phase 6B (Revision 2) updates for Meru Art Studio based on your previous audit feedback.

Verification Focus:
1. OAuth Draft Resilience: Does the isResumingOAuthRef guard prevent StrictMode duplicate submissions? Is the brief retained in sessionStorage (and restored to state) upon insertion failures or transient network drops? Are pre-redirect errors cleaned up?
2. React Query Data Flow: Confirm that QUERY_KEYS hierarchy (['commissions', 'mine', ...], ['commissions', 'admin']) enables seamless prefix invalidation via queryClient.invalidateQueries({ queryKey: ['commissions'] }). Confirm that useCommissionsQuery is disabled when user is null.
3. Payment Verification Reconciliation: Does toggleCommissionPaymentInDb() properly update commissions and reconcile payments.status = 'verified'?
4. Demo Isolation: Does OrderTracker.tsx cleanly isolate DEMO_SHOWCASE_ORDER, the interactive preview bar, and simulated approval buttons behind ?demo=1?

Give your verdict: PASS or NEEDS REVISION (with specific technical explanations).
```
