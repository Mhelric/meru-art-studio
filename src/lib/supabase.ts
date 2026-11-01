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
} from '@/types';
import { TIER_ACCENT } from '@/lib/utils';
import { resolveCommissionMedia } from '@/lib/storage';

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
    references: (row.reference_urls || []).map((url, i) => ({
      id: `ref-${i}`,
      name: `Reference #${i + 1}`,
      sizeBytes: 0,
      previewUrl: url,
    })),
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
    wips: row.wips ? row.wips.map(mapWipRow) : wips,
    messages: row.messages ? row.messages.map(mapMessageRow) : messages,
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

/** Insert a new commission into Supabase (enforces RLS + 1-pending-request-per-user rule). */
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

  const payload = {
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
    start_date: draft.preferredStartDate,
    tos_accepted_at: draft.tosAcceptedAt ?? new Date().toISOString(),
  };

  const { data, error } = await supabase.from('commissions').insert(payload).select('*').single();

  if (error) {
    if (error.code === '23505') {
      return {
        order: null,
        error:
          'You already have an active request in Pending Review. Please wait until Meru reviews your pending brief before submitting another.',
      };
    }
    return { order: null, error: error.message };
  }

  return { order: mapCommissionRowToSubmitted(data as CommissionRow), error: null };
}

/** Update commission status stage in Supabase (Admin action). */
export async function updateCommissionStageInDb(
  commissionId: string,
  stage: CommissionStage,
  progress?: number,
): Promise<{ success: boolean; error: string | null }> {
  if (!supabase) return { success: false, error: 'Supabase not connected' };

  const updates: Record<string, unknown> = { status_stage: stage };
  if (progress !== undefined) updates.progress = progress;
  if (stage === 'lineart_coloring' || stage === 'completed') {
    updates.final_paid = true;
    updates.deposit_paid = true;
  } else if (stage !== 'pending_review' && stage !== 'awaiting_deposit') {
    updates.deposit_paid = true;
  }

  const { error } = await supabase.from('commissions').update(updates).eq('id', commissionId);
  return { success: !error, error: error?.message ?? null };
}

/** Decline a commission in Supabase (Admin action). */
export async function declineCommissionInDb(
  commissionId: string,
): Promise<{ success: boolean; error: string | null }> {
  if (!supabase) return { success: false, error: 'Supabase not connected' };

  const { error } = await supabase
    .from('commissions')
    .update({ status_stage: 'declined' })
    .eq('id', commissionId);

  return { success: !error, error: error?.message ?? null };
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
    `Cancellation & Refund Request: ${reason.trim() || 'Client submitted formal cancellation request based on TOS tier.'}`,
    { attachmentKind: 'other' },
  );

  return { success: Boolean(msgRes.message), error: msgRes.error };
}
