import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import type {
  BlockedRange,
  CommissionStage,
  Currency,
  OrderDraft,
  PaymentSplit,
  PublicQueueSlot,
  SubmittedOrder,
  TierId,
} from '@/types';
import { TIER_ACCENT } from '@/lib/utils';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const artistAdminUid = (import.meta.env.VITE_ARTIST_ADMIN_UID as string | undefined) ?? '';

/** True when real Supabase credentials are configured in `.env`. */
export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    !supabaseUrl.includes('your-project-ref') &&
    supabaseAnonKey !== 'your-public-anon-key',
);

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
  created_at: string;
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

export function mapCommissionRowToSubmitted(row: CommissionRow): SubmittedOrder {
  return {
    id: row.order_code || row.id.slice(0, 8).toUpperCase(),
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
    references: [],
    tosAccepted: Boolean(row.tos_accepted_at),
    tosAcceptedAt: row.tos_accepted_at,
    totalUsd: Number(row.total_price),
    depositUsd: Number(row.deposit_due),
    depositPaid: Boolean(row.deposit_paid),
    finalPaid: Boolean(row.final_paid),
    sketchApproved: row.status_stage === 'lineart_coloring' || row.status_stage === 'completed',
    stage: row.status_stage,
    progress: row.progress ?? 10,
    estEndDate: row.est_end_date ?? undefined,
    authMethod: 'discord',
    wips: [],
    messages: [],
  };
}

/** Fetch live studio settings + anonymised public queue from Supabase when configured. */
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

/** Trigger 1-click Discord or Google OAuth login via Supabase Auth. */
export async function signInWithOAuthProvider(provider: 'discord' | 'google') {
  if (!supabase) {
    return { redirected: false, error: null };
  }
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${window.location.origin}/#track`,
    },
  });
  return { redirected: !error, error: error?.message ?? null };
}

/** Insert a new commission into Supabase (enforces RLS + 1-pending-request-per-user rule). */
export async function insertCommissionInSupabase(
  user: User,
  draft: OrderDraft,
  pricing: { totalUsd: number; depositUsd: number },
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
    total_price: pricing.totalUsd,
    deposit_due: pricing.depositUsd,
    status_stage: 'pending_review' as const,
    character_name: draft.characterName.trim(),
    pose_and_vibe: draft.poseAndVibe.trim(),
    background_notes: draft.backgroundNotes.trim(),
    start_date: draft.preferredStartDate,
    tos_accepted_at: draft.tosAcceptedAt ?? new Date().toISOString(),
  };

  const { data, error } = await supabase.from('commissions').insert(payload).select('*').single();

  if (error) {
    // Postgres unique violation code 23505 -> idx_commissions_one_pending_per_client
    if (error.code === '23505') {
      return {
        order: null,
        error:
          'You already have a request in Pending Review. To prevent spam, please wait until Meru reviews your active request before submitting another.',
      };
    }
    return { order: null, error: error.message };
  }

  return { order: mapCommissionRowToSubmitted(data as CommissionRow), error: null };
}
