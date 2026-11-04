import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import type {
  AttachmentKind,
  BlockedRange,
  CommissionStage,
  Currency,
  OrderDraft,
  OrderMessage,
  PaymentRecord,
  PaymentSplit,
  PublicQueueSlot,
  SubmittedOrder,
  TierId,
  WipUploadItem,
  ClientReview,
  StudioPaymentDetails,
} from '@/types';
import { TIER_ACCENT } from '@/lib/utils';
import {
  resolveCommissionMedia,
  uploadReferenceFile,
  resolveReferenceToUploadable,
  STORAGE_BUCKETS,
} from '@/lib/storage';

const DEFAULT_SUPABASE_URL = 'https://ikeeddqgliobgfglytgr.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlrZWVkZHFnbGlvYmdmZ2x5dGdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM0NTk5MDEsImV4cCI6MjEwOTAzNTkwMX0.AD9GYKW3ga35ZKtYCWeotUaAU3tuumFWQcjZziYdBU8';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || DEFAULT_SUPABASE_URL;
const supabaseAnonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ||
  DEFAULT_SUPABASE_ANON_KEY;
export const artistAdminUid = (import.meta.env.VITE_ARTIST_ADMIN_UID as string | undefined) ?? '';

/** True when real Supabase credentials are configured. */
export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    !supabaseUrl.includes('your-project-ref') &&
    supabaseAnonKey !== 'your-public-anon-key',
);

// In Node.js test runners without native WebSocket, provide a stub to prevent Realtime init crash
if (typeof globalThis.WebSocket === 'undefined' && typeof window === 'undefined') {
  (globalThis as unknown as Record<string, unknown>).WebSocket = class MockWebSocket {};
}

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;

/** Database row shape for `studio_settings`. */
export interface StudioSettingsRow {
  id: number;
  is_open: boolean;
  availability_status: 'open' | 'waitlist' | 'closed';
  max_slots: number;
  base_prices_json: Record<TierId, number>;
  multipliers_json: { nsfw: number; softFurry: number; commercial: number };
  usd_to_php_rate: number;
  blocked_dates: BlockedRange[];
  payment_details_json?: StudioPaymentDetails;
  updated_at: string;
}

/** Database row shape for `public_queue_view`. */
export interface PublicQueueViewRow {
  slot_number: number;
  id: string;
  handle_hint: string;
  tier: TierId;
  stage: CommissionStage;
  stage_label: string;
  progress: number;
  start_date: string;
  est_end_date: string;
}

/** Database row shape for `commissions`. */
export interface CommissionRow {
  id: string;
  order_code: string;
  client_id: string;
  client_handle: string;
  tier: TierId;
  character_count: number;
  addons: { nsfw: boolean; softFurry: boolean; commercial: boolean };
  currency: Currency;
  payment_split: PaymentSplit;
  total_price: number;
  deposit_due: number;
  deposit_paid: boolean;
  final_paid: boolean;
  status_stage: CommissionStage;
  progress: number;
  character_name: string;
  pose_and_vibe: string;
  background_notes: string;
  reference_urls: string[];
  start_date: string | null;
  est_end_date: string | null;
  tos_accepted_at: string;
  tos_version?: string;
  usd_to_php_rate?: number;
  created_at: string;
  wips?: WipUploadRow[];
  messages?: MessageRow[];
  review_json?: any;
}

export interface WipUploadRow {
  id: string;
  commission_id: string;
  stage: CommissionStage;
  title: string;
  watermarked_url: string;
  high_res_url?: string | null;
  is_final: boolean;
  artist_note: string;
  approved_by_client: boolean;
  created_at: string;
  revision_requested?: boolean;
  revision_notes?: string | null;
  revision_category?: string | null;
  revision_scale?: string | null;
  revision_requested_at?: string | null;
}

export interface MessageRow {
  id: string;
  commission_id: string;
  sender_id: string;
  sender_role: 'artist' | 'client';
  body: string;
  attachment_url?: string | null;
  attachment_kind?: 'receipt' | 'redline' | 'reference' | 'other' | null;
  created_at: string;
}

export interface PaymentRow {
  id: string;
  commission_id: string;
  kind: 'deposit' | 'final' | 'full';
  amount: number;
  currency: Currency;
  receipt_path?: string | null;
  status: 'submitted' | 'verified' | 'rejected';
  verified_by?: string | null;
  verified_at?: string | null;
  created_at: string;
  updated_at: string;
}

export function mapPublicQueueRow(row: PublicQueueViewRow): PublicQueueSlot {
  return {
    slotNumber: row.slot_number,
    id: row.id,
    handleHint: row.handle_hint,
    tier: row.tier,
    stage: row.stage,
    stageLabel: row.stage_label,
    progress: row.progress,
    startDate: row.start_date,
    estEndDate: row.est_end_date,
    accent: TIER_ACCENT[row.tier] ?? 'lilac',
  };
}

export function mapWipRow(row: WipUploadRow): WipUploadItem {
  return {
    id: row.id,
    commissionId: row.commission_id,
    stage: row.stage,
    title: row.title,
    imageUrl: row.watermarked_url,
    highResUrl: row.high_res_url,
    isFinal: row.is_final,
    artistNote: row.artist_note,
    approvedByClient: row.approved_by_client,
    createdAt: row.created_at,
    revisionRequested: Boolean(row.revision_requested),
    revisionNotes: row.revision_notes ?? undefined,
    revisionCategory: row.revision_category ?? undefined,
    revisionScale: (row.revision_scale as 'minor' | 'major') ?? undefined,
    revisionRequestedAt: row.revision_requested_at ?? undefined,
  };
}

export function mapMessageRow(row: MessageRow): OrderMessage {
  return {
    id: row.id,
    commissionId: row.commission_id,
    senderRole: row.sender_role,
    senderName: row.sender_role === 'artist' ? 'Meru Art' : 'You',
    body: row.body,
    attachmentUrl: row.attachment_url ?? undefined,
    attachmentKind: (row.attachment_kind as AttachmentKind) ?? undefined,
    createdAt: row.created_at,
  };
}

export function mapPaymentRow(row: PaymentRow): PaymentRecord {
  return {
    id: row.id,
    commissionId: row.commission_id,
    kind: row.kind,
    amount: Number(row.amount),
    currency: row.currency,
    receiptPath: row.receipt_path ?? undefined,
    status: row.status,
    verifiedBy: row.verified_by ?? undefined,
    verifiedAt: row.verified_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapCommissionRowToSubmitted(
  row: CommissionRow,
  wips: WipUploadItem[] = [],
  messages: OrderMessage[] = [],
): SubmittedOrder {
  return {
    id: row.id,
    orderCode: row.order_code || row.id.slice(0, 8).toUpperCase(),
    createdAt: row.created_at,
    tier: row.tier,
    characterCount: row.character_count,
    addons: row.addons,
    currency: row.currency,
    paymentSplit: row.payment_split,
    preferredStartDate: row.start_date,
    characterName: row.character_name,
    poseAndVibe: row.pose_and_vibe,
    backgroundNotes: row.background_notes,
    clientContact: row.client_handle,
    references: (row.reference_urls || []).map((url, i) => {
      let cleanName = `Reference #${i + 1}`;
      if (!url.startsWith('data:')) {
        const filename = url.includes('/') ? url.split('/').pop()! : url;
        cleanName = filename.includes('-') ? filename.replace(/^\d+-/, '') : filename;
      }
      return {
        id: `ref-${i}`,
        name: cleanName || `Reference #${i + 1}`,
        sizeBytes: 0,
        previewUrl: url,
      };
    }),
    tosAccepted: Boolean(row.tos_accepted_at),
    tosAcceptedAt: row.tos_accepted_at,
    totalUsd: Number(row.total_price),
    depositUsd: Number(row.deposit_due),
    depositPaid: Boolean(row.deposit_paid),
    finalPaid: Boolean(row.final_paid),
    sketchApproved: row.status_stage === 'lineart_coloring' || row.status_stage === 'completed',
    stage: row.status_stage,
    progress: row.progress ?? 10,
    startDate: row.start_date ?? undefined,
    estEndDate: row.est_end_date ?? undefined,
    authMethod: 'google',
    wips: (() => {
      const mappedMsgs = row.messages ? row.messages.map(mapMessageRow) : messages;
      const rawWips = row.wips ? row.wips.map(mapWipRow) : wips;
      return rawWips.map((w, idx, arr) => {
        if (w.approvedByClient) return w;
        if (w.revisionRequested) return w;
        // Check if revision request exists for this WIP
        const hasRevMsg = mappedMsgs.some(
          (m) => m.body.startsWith('[Revision Request') && (m.body.includes(w.title) || (idx === 0 && arr.length > 1)),
        );
        if (hasRevMsg) {
          return { ...w, revisionRequested: true };
        }
        return w;
      });
    })(),
    messages: row.messages ? row.messages.map(mapMessageRow) : messages,
    review: (() => {
      if (row.review_json) return row.review_json;
      const mappedMsgs = row.messages ? row.messages.map(mapMessageRow) : messages;
      const reviewMsg = mappedMsgs.find((m) => m.body.startsWith('[Client Review · '));
      if (reviewMsg) {
        const match = reviewMsg.body.match(/^\[Client Review · (\d+) Stars(?:\s*\(([^\)]+)\))?\]:\s*"(.*)"$/s);
        if (match) {
          return {
            rating: parseInt(match[1], 10) || 5,
            visibility: (match[2] as any) || 'public',
            comment: match[3] || '',
            clientName: row.client_handle,
            createdAt: reviewMsg.createdAt,
          };
        }
      }
      return undefined;
    })(),
  };
}

/** Fetch live studio settings + anonymised public queue from Supabase. */
export async function fetchPublicStudioData(): Promise<{
  settings: StudioSettingsRow | null;
  queue: PublicQueueSlot[] | null;
}> {
  if (!supabase) return { settings: null, queue: null };

  const [settingsRes, queueRes] = await Promise.all([
    supabase.from('studio_settings').select('*').eq('id', 1).maybeSingle(),
    supabase.from('public_queue_view').select('*').order('slot_number', { ascending: true }),
  ]);

  return {
    settings: (settingsRes.data as StudioSettingsRow | null) ?? null,
    queue: queueRes.data ? (queueRes.data as PublicQueueViewRow[]).map(mapPublicQueueRow) : null,
  };
}

/** Trigger OAuth login via Google or Discord. */
export async function signInWithOAuthProvider(provider: 'google' | 'discord') {
  if (!supabase) {
    return { redirected: false, error: null };
  }
  try {
    sessionStorage.setItem('meru-oauth-return', '1');
  } catch {
    // ignore
  }
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: window.location.origin,
    },
  });
  return { redirected: !error, error: error?.message ?? null };
}

/** Fetch commissions for the authenticated client. */
export async function fetchMyCommissions(userId: string): Promise<SubmittedOrder[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('commissions')
    .select(`
      *,
      wips:wip_uploads(*),
      messages:messages(*)
    `)
    .eq('client_id', userId)
    .order('created_at', { ascending: false });

  if (error || !data) return [];

  const mapped = (data as CommissionRow[]).map((row) =>
    mapCommissionRowToSubmitted(
      row,
      (row.wips ?? []).map(mapWipRow),
      (row.messages ?? []).map(mapMessageRow),
    ),
  );

  return Promise.all(mapped.map(resolveCommissionMedia));
}

/** Fetch all commissions for the artist admin. */
export async function fetchAllCommissionsAdmin(): Promise<SubmittedOrder[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('commissions')
    .select(`
      *,
      wips:wip_uploads(*),
      messages:messages(*)
    `)
    .order('created_at', { ascending: false });

  if (error || !data) return [];

  const mapped = (data as CommissionRow[]).map((row) =>
    mapCommissionRowToSubmitted(
      row,
      (row.wips ?? []).map(mapWipRow),
      (row.messages ?? []).map(mapMessageRow),
    ),
  );

  return Promise.all(mapped.map(resolveCommissionMedia));
}

/** Insert a new commission into Supabase (enforces RLS + 1-pending-request-per-user rule + storage references upload). */
export async function insertCommissionInSupabase(
  user: User,
  draft: OrderDraft,
  pricing?: { totalUsd: number; depositUsd: number },
): Promise<{ order: SubmittedOrder | null; error: string | null }> {
  if (!supabase) return { order: null, error: 'Supabase not configured' };

  const handle =
    draft.clientContact.trim() ||
    (user.user_metadata?.full_name as string | undefined) ||
    user.email?.split('@')[0] ||
    'client';

  // Pre-validate that user session actually exists in auth.users
  const { data: authData, error: authCheckError } = await supabase.auth.getUser();
  if (authCheckError || !authData?.user) {
    await supabase.auth.signOut().catch(() => {});
    return {
      order: null,
      error:
        'Your login session expired or account was reset in the database. Please sign in again with Google to submit your request.',
    };
  }

  // Pre-check for existing pending brief before uploading storage files
  const { data: existingPending } = await supabase
    .from('commissions')
    .select('id')
    .eq('client_id', user.id)
    .eq('status_stage', 'pending_review')
    .maybeSingle();

  if (existingPending) {
    return {
      order: null,
      error:
        'You already have an active request in Pending Review. Please wait until Meru reviews your pending brief before submitting another.',
    };
  }

  // Generate canonical UUID for this commission
  const commissionId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          const v = c === 'x' ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });

  // Upload reference images to commission-references storage bucket: {clientId}/{commissionId}/...
  const uploadedPaths: string[] = [];
  const uploadErrors: string[] = [];

  if (draft.references && draft.references.length > 0) {
    for (let i = 0; i < draft.references.length; i++) {
      const ref = draft.references[i];
      const { file, filename } = await resolveReferenceToUploadable(ref);

      if (file) {
        const uniqueFileName = `${i + 1}-${filename}`;
        const { path, error: uploadErr } = await uploadReferenceFile(
          user.id,
          commissionId,
          file,
          uniqueFileName,
        );
        if (uploadErr) {
          uploadErrors.push(uploadErr);
        } else if (path) {
          uploadedPaths.push(path);
        }
      } else if (
        ref.previewUrl &&
        !ref.previewUrl.startsWith('http') &&
        !ref.previewUrl.startsWith('blob:') &&
        !ref.previewUrl.startsWith('data:') &&
        ref.previewUrl.includes('/')
      ) {
        // Pre-existing relative storage path
        uploadedPaths.push(ref.previewUrl);
      }
    }

    if (uploadErrors.length > 0 && uploadedPaths.length === 0) {
      return {
        order: null,
        error: `Failed to upload reference images (${uploadErrors[0]}). Please check your connection and try again.`,
      };
    }
  }

  const payload = {
    id: commissionId,
    client_id: user.id,
    client_handle: handle,
    tier: draft.tier,
    character_count: draft.characterCount,
    addons: draft.addons,
    currency: draft.currency,
    payment_split: draft.paymentSplit,
    total_price: pricing?.totalUsd ?? 0,
    deposit_due: pricing?.depositUsd ?? 0,
    status_stage: 'pending_review' as const,
    character_name: draft.characterName.trim(),
    pose_and_vibe: draft.poseAndVibe.trim(),
    background_notes: draft.backgroundNotes.trim(),
    reference_urls: uploadedPaths,
    start_date: draft.preferredStartDate,
    tos_accepted_at: draft.tosAcceptedAt ?? new Date().toISOString(),
  };

  const { data, error } = await supabase.from('commissions').insert(payload).select('*').single();

  if (error) {
    // If the database insert failed, clean up any storage paths we just uploaded so we don't leave orphaned files
    if (uploadedPaths.length > 0) {
      await supabase.storage.from(STORAGE_BUCKETS.references).remove(uploadedPaths).catch(() => {});
    }

    if (error.code === '23505') {
      return {
        order: null,
        error:
          'You already have an active request in Pending Review. Please wait until Meru reviews your pending brief before submitting another.',
      };
    }
    // Foreign key violation: user id was purged or deleted from auth.users (e.g. database reset)
    if (
      error.code === '23503' ||
      error.message.includes('commissions_client_id_fkey') ||
      error.message.includes('foreign key constraint')
    ) {
      await supabase.auth.signOut().catch(() => {});
      return {
        order: null,
        error:
          'Your login session expired or account was reset in the database. Please sign in again with Google to submit your request.',
      };
    }
    return { order: null, error: error.message };
  }

  const mapped = mapCommissionRowToSubmitted(data as CommissionRow);
  const resolved = await resolveCommissionMedia(mapped);

  return { order: resolved, error: null };
}

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

/** Update commission scheduling dates in Supabase (Admin action). */
export async function updateCommissionScheduleInDb(
  commissionId: string,
  startDate: string,
  estEndDate: string,
): Promise<{ success: boolean; error: string | null }> {
  if (!supabase) return { success: false, error: 'Supabase not connected' };

  const { error } = await supabase
    .from('commissions')
    .update({ start_date: startDate, est_end_date: estEndDate })
    .eq('id', commissionId);

  return { success: !error, error: error?.message ?? null };
}

/** Send message in realtime order chat. */
export async function sendCommissionMessageInDb(
  commissionId: string,
  body: string,
  opts?: { attachmentUrl?: string; attachmentKind?: AttachmentKind },
): Promise<{ message: OrderMessage | null; error: string | null }> {
  if (!supabase) return { message: null, error: 'Supabase not connected' };

  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return { message: null, error: 'User must be signed in' };

  const { data, error } = await supabase
    .from('messages')
    .insert({
      commission_id: commissionId,
      sender_id: user.id,
      body,
      attachment_url: opts?.attachmentUrl,
      attachment_kind: opts?.attachmentKind,
    })
    .select('*')
    .single();

  if (error || !data) return { message: null, error: error?.message ?? 'Failed to send message' };
  return { message: mapMessageRow(data as MessageRow), error: null };
}

/** Record client payment submission in payments table. */
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

/** Insert a WIP or final deliverable in Supabase wip_uploads (Admin action). */
export async function insertWipInDb(
  commissionId: string,
  payload: {
    stage: CommissionStage;
    title: string;
    watermarkedUrl: string;
    highResUrl?: string | null;
    isFinal: boolean;
    artistNote?: string;
  },
): Promise<{ wip: WipUploadItem | null; error: string | null }> {
  if (!supabase) return { wip: null, error: 'Supabase not connected' };

  const { data, error } = await supabase
    .from('wip_uploads')
    .insert({
      commission_id: commissionId,
      stage: payload.stage,
      title: payload.title,
      watermarked_url: payload.watermarkedUrl,
      high_res_url: payload.highResUrl ?? null,
      is_final: payload.isFinal,
      artist_note: payload.artistNote ?? '',
    })
    .select('*')
    .single();

  if (error || !data) return { wip: null, error: error?.message ?? 'Failed to upload WIP' };
  return { wip: mapWipRow(data as WipUploadRow), error: null };
}

/** Update studio settings row (Admin action). */
export async function updateStudioSettingsInDb(
  patch: Partial<StudioSettingsRow>,
): Promise<{ success: boolean; error: string | null }> {
  if (!supabase) return { success: false, error: 'Supabase not connected' };

  const { error } = await supabase
    .from('studio_settings')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', 1);

  return { success: !error, error: error?.message ?? null };
}


/** Update client brief details while in pending_review. Enforces row-match verification. */
export async function updateCommissionBriefInDb(
  commissionId: string,
  patch: {
    characterName?: string;
    poseAndVibe?: string;
    backgroundNotes?: string;
  },
): Promise<{ success: boolean; error: string | null }> {
  if (!supabase) return { success: false, error: 'Supabase not connected' };

  const updates: Record<string, unknown> = {};
  if (patch.characterName !== undefined) updates.character_name = patch.characterName.trim();
  if (patch.poseAndVibe !== undefined) updates.pose_and_vibe = patch.poseAndVibe.trim();
  if (patch.backgroundNotes !== undefined) updates.background_notes = patch.backgroundNotes.trim();

  // Enforce row-match verification: .select('id').single() errors out if 0 rows matched (e.g. stage advanced or RLS rejected)
  const { data, error } = await supabase
    .from('commissions')
    .update(updates)
    .eq('id', commissionId)
    .eq('status_stage', 'pending_review')
    .select('id')
    .single();

  if (error || !data) {
    return {
      success: false,
      error: error?.message ?? 'Brief can only be edited while status is pending_review.',
    };
  }

  return { success: true, error: null };
}

/** Request structured cancellation and refund under studio TOS policies. */
export async function requestCommissionCancellationInDb(
  commissionId: string,
  reason: string,
): Promise<{ success: boolean; error: string | null }> {
  if (!supabase) return { success: false, error: 'Supabase not connected' };

  const msgRes = await sendCommissionMessageInDb(
    commissionId,
    `[Cancellation Request]: ${reason.trim() || 'Client submitted formal cancellation request based on TOS tier.'}`,
    { attachmentKind: 'other' },
  );

  return { success: Boolean(msgRes.message), error: msgRes.error };
}

/** Client or artist approves an in-production WIP. */
export async function approveWipInDb(
  wipId: string,
  commissionId: string,
  wipTitle?: string,
): Promise<{ success: boolean; error: string | null }> {
  if (!supabase) return { success: true, error: null };

  // Try RPC first
  try {
    const { data, error } = await supabase.rpc('approve_wip', { target_wip_id: wipId });
    if (!error && (data as any)?.success) {
      return { success: true, error: null };
    }
  } catch {
    // fallback below
  }

  // Fallback: direct table update
  const { error } = await supabase
    .from('wip_uploads')
    .update({ approved_by_client: true })
    .eq('id', wipId);

  if (error) {
    return { success: false, error: error.message };
  }

  // Also log message to chat
  const { data: userRes } = await supabase.auth.getUser();
  if (userRes?.user) {
    await supabase.from('messages').insert({
      commission_id: commissionId,
      sender_id: userRes.user.id,
      sender_role: 'client',
      body: `[WIP Approved]: Client reviewed and approved "${wipTitle || 'WIP'}"! Ready for the next stage.`,
      attachment_kind: 'other',
    });
  }

  return { success: true, error: null };
}

/** Client confirms satisfaction with final product and marks commission completed. */
export async function clientCompleteCommissionInDb(
  commissionId: string,
): Promise<{ success: boolean; error: string | null }> {
  if (!supabase) return { success: true, error: null };

  // Try RPC first
  try {
    const { data, error } = await supabase.rpc('client_complete_commission', {
      target_commission_id: commissionId,
    });
    if (!error && (data as any)?.success) {
      return { success: true, error: null };
    }
  } catch {
    // fallback below
  }

  // Fallback
  const { error } = await supabase
    .from('commissions')
    .update({
      status_stage: 'completed',
      progress: 100,
      updated_at: new Date().toISOString(),
    })
    .eq('id', commissionId);

  if (error) return { success: false, error: error.message };

  const { data: userRes } = await supabase.auth.getUser();
  if (userRes?.user) {
    await supabase.from('messages').insert({
      commission_id: commissionId,
      sender_id: userRes.user.id,
      sender_role: 'client',
      body: '[Order Completed]: Client reviewed and accepted the final artwork. High-resolution 300 DPI master download unlocked.',
      attachment_kind: 'other',
    });
  }

  return { success: true, error: null };
}

/** Client requests revision on a WIP pass. */
export async function requestWipRevisionInDb(
  wipId: string,
  _commissionId: string,
  details: {
    category: string;
    notes: string;
    scale?: 'minor' | 'major';
  },
): Promise<{ success: boolean; error: string | null }> {
  if (!supabase) return { success: true, error: null };

  // Try RPC first
  try {
    const { data, error } = await supabase.rpc('request_wip_revision', {
      target_wip_id: wipId,
      p_category: details.category,
      p_notes: details.notes,
      p_scale: details.scale || 'minor',
    });
    if (!error && (data as any)?.success) {
      return { success: true, error: null };
    }
  } catch {
    // fallback below
  }

  // Fallback: direct table update
  try {
    await supabase
      .from('wip_uploads')
      .update({
        revision_requested: true,
        revision_category: details.category,
        revision_notes: details.notes,
        revision_scale: details.scale || 'minor',
        revision_requested_at: new Date().toISOString(),
      })
      .eq('id', wipId);
  } catch (err: any) {
    console.warn('Wip direct update warning:', err);
  }

  return { success: true, error: null };
}

/** Client confirms completion with star rating review & visibility. */
export async function submitClientReviewInDb(
  commissionId: string,
  review: ClientReview,
): Promise<{ success: boolean; error: string | null }> {
  if (!supabase) return { success: true, error: null };

  // Try RPC first
  try {
    const { data, error } = await supabase.rpc('submit_client_review', {
      target_commission_id: commissionId,
      review_payload: review,
    });
    if (!error && (data as any)?.success) {
      return { success: true, error: null };
    }
  } catch {
    // fallback below
  }

  // Fallback direct update
  try {
    await supabase
      .from('commissions')
      .update({
        status_stage: 'completed',
        progress: 100,
        review_json: review,
        updated_at: new Date().toISOString(),
      })
      .eq('id', commissionId);
  } catch (err: any) {
    console.warn('Review fallback direct update warning:', err);
  }

  return { success: true, error: null };
}

/** Fetch unread message counts per commission for the current user via RPC. */
export async function fetchUnreadMessageCounts(): Promise<Record<string, number>> {
  if (!supabase) return {};

  const { data, error } = await supabase.rpc('get_unread_message_counts');
  if (error || !data) {
    return {};
  }

  const counts: Record<string, number> = {};
  for (const row of data as Array<{ commission_id: string; unread_count: number | string }>) {
    counts[row.commission_id] = Number(row.unread_count) || 0;
  }
  return counts;
}

/** Mark a commission's messages as read for the current user. */
export async function markCommissionReadInDb(commissionId: string): Promise<void> {
  if (!supabase) return;
  await supabase.rpc('mark_commission_read', { p_commission_id: commissionId });
}
