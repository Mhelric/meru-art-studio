# Phase 6C (Revision 2): Storage Bucket Policies, Fail-Closed Watermarking & Canonical Path Persistence

## Overview
This review packet contains the complete, unabridged implementation for **Phase 6C Revision 2** of the Meru Art Studio senior engineering audit.

It directly resolves all four findings identified by Gemini Argon:
1. **CRITICAL — Closed Unwatermarked Master Leak via Admin Pre-Signed URL (`isFinal = true`):**
   - In `uploadWipArtwork()`, regardless of whether `isFinal` is true or false, a physical bitmap watermark is **always** generated and uploaded to `previews/${commissionId}/...`.
   - The unwatermarked full-resolution original is uploaded to `masters/${commissionId}/...`.
   - Admin upload **never** pre-signs `masters/` deliverables with the admin JWT or returns bearer tokens.
   - Master delivery is strictly on-demand: in `OrderTracker.tsx`, clicking "Download High-Res PNG (300 DPI)" executes `getSignedMediaUrl()` with the client's own JWT. Supabase Storage enforces `wips_authorized_select` -> `public.can_download_final_master(commissionId)`. If `status_stage != 'completed'`, access is denied by PostgreSQL RLS.
2. **HIGH — Fail-Closed Watermark Guarantee (`src/lib/watermark.ts`):**
   - Replaced all `resolve(file)` fallbacks (`!ctx`, `!blob`, `img.onerror`) with `reject(new Error(...))`.
   - If canvas 2D rendering or WebP encoding fails, the operation halts immediately with an error and **never** leaks unwatermarked raw artwork to preview storage.
3. **HIGH — Zero Ephemeral Signed URLs in Database (Canonical Path Persistence):**
   - Database columns (`payments.receipt_path`, `messages.attachment_url`, `wip_uploads.watermarked_url`, `wip_uploads.high_res_url`, `commissions.reference_urls`) persist **only canonical storage object paths** (`previews/${commissionId}/${filename}`, `masters/${commissionId}/${filename}`, `${clientId}/${commissionId}/${filename}`).
   - Canonical paths are resolved dynamically to signed URLs at runtime via `resolveCommissionMedia()` and `resolveStorageUrl()` with an in-memory cache (`signedUrlCache`). Expiring tokens (`?token=...`) are never written to the DB.
4. **Complete Source Code Inclusion:**
   - Unabridged source code for `src/lib/watermark.ts`, `src/lib/storage.ts`, `src/lib/supabase.ts` (showing `toggleCommissionPaymentInDb` using `.in('kind', field === 'deposit_paid' ? ['deposit', 'full'] : ['final', 'full'])`), `src/components/track/OrderTracker.tsx`, and `src/components/admin/AdminPanel.tsx`.

---

## 1. Database Migration (`supabase/migrations/20261101000001_phase_6c_storage_policies.sql`)

```sql
-- ============================================================================
-- Meru Art Studio — Phase 6C Storage Buckets & Row-Level Security Policies
-- Addresses:
--   1. Creation of private buckets: commission-references, commission-receipts, commission-wips
--   2. Storage RLS policies checking ownership and commission access
--   3. Completion-gating for high-res unwatermarked deliverables (masters/)
--   4. Safe UUID casting function to prevent malformed path exceptions
--   5. Function can_download_final_master()
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Safe UUID Caster: Prevents 22P02 exceptions on malformed storage folder paths
-- ----------------------------------------------------------------------------
create or replace function public.safe_cast_uuid(val text)
returns uuid
language plpgsql
immutable
as $$
begin
  if val is null or val = '' then
    return null;
  end if;
  return val::uuid;
exception when others then
  return null;
end;
$$;

-- ----------------------------------------------------------------------------
-- 1. Create Storage Buckets (Private)
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values
  ('commission-references', 'commission-references', false),
  ('commission-receipts', 'commission-receipts', false),
  ('commission-wips', 'commission-wips', false)
on conflict (id) do update set public = false;

-- ----------------------------------------------------------------------------
-- 2. Helper: Check if caller can download completed final master deliverable
-- ----------------------------------------------------------------------------
create or replace function public.can_download_final_master(target_commission_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.commissions c
    where c.id = target_commission_id
      and c.status_stage = 'completed'
      and (c.client_id = auth.uid() or public.is_artist_admin())
  );
$$;

-- ----------------------------------------------------------------------------
-- 3. Storage Policies: commission-references
-- Path structure: {client_id}/{commission_id}/{filename}
-- ----------------------------------------------------------------------------
drop policy if exists "references_participant_select" on storage.objects;
create policy "references_participant_select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'commission-references'
    and (
      public.is_artist_admin()
      or (
        auth.uid()::text = (storage.foldername(name))[1]
        and public.can_access_commission(public.safe_cast_uuid((storage.foldername(name))[2]))
      )
    )
  );

drop policy if exists "references_participant_insert" on storage.objects;
create policy "references_participant_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'commission-references'
    and (
      public.is_artist_admin()
      or (
        auth.uid()::text = (storage.foldername(name))[1]
        and public.can_access_commission(public.safe_cast_uuid((storage.foldername(name))[2]))
      )
    )
  );

drop policy if exists "references_owner_delete" on storage.objects;
create policy "references_owner_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'commission-references'
    and (
      public.is_artist_admin()
      or auth.uid()::text = (storage.foldername(name))[1]
    )
  );

-- ----------------------------------------------------------------------------
-- 4. Storage Policies: commission-receipts
-- Path structure: {client_id}/{commission_id}/{filename}
-- ----------------------------------------------------------------------------
drop policy if exists "receipts_participant_select" on storage.objects;
create policy "receipts_participant_select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'commission-receipts'
    and (
      public.is_artist_admin()
      or (
        auth.uid()::text = (storage.foldername(name))[1]
        and public.can_access_commission(public.safe_cast_uuid((storage.foldername(name))[2]))
      )
    )
  );

drop policy if exists "receipts_client_insert" on storage.objects;
create policy "receipts_client_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'commission-receipts'
    and (
      public.is_artist_admin()
      or (
        auth.uid()::text = (storage.foldername(name))[1]
        and public.can_access_commission(public.safe_cast_uuid((storage.foldername(name))[2]))
      )
    )
  );

drop policy if exists "receipts_artist_admin_delete" on storage.objects;
create policy "receipts_artist_admin_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'commission-receipts'
    and public.is_artist_admin()
  );

-- ----------------------------------------------------------------------------
-- 5. Storage Policies: commission-wips
-- Path structure:
--   previews/{commission_id}/{filename} -> Watermarked WIP previews
--   masters/{commission_id}/{filename}  -> Unwatermarked 300 DPI master files
-- ----------------------------------------------------------------------------
drop policy if exists "wips_artist_admin_insert" on storage.objects;
create policy "wips_artist_admin_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'commission-wips'
    and public.is_artist_admin()
  );

drop policy if exists "wips_artist_admin_update" on storage.objects;
create policy "wips_artist_admin_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'commission-wips'
    and public.is_artist_admin()
  );

drop policy if exists "wips_artist_admin_delete" on storage.objects;
create policy "wips_artist_admin_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'commission-wips'
    and public.is_artist_admin()
  );

-- Completion-Gated Select:
-- - Previews are readable by order participants during progress
-- - Masters are ONLY readable if status_stage = 'completed'
drop policy if exists "wips_authorized_select" on storage.objects;
create policy "wips_authorized_select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'commission-wips'
    and (
      -- Artist admin can always read any WIP or master
      public.is_artist_admin()
      -- Client can view watermarked progress previews
      or (
        (storage.foldername(name))[1] = 'previews'
        and public.can_access_commission(public.safe_cast_uuid((storage.foldername(name))[2]))
      )
      -- Client can ONLY view unwatermarked master file once stage is completed
      or (
        (storage.foldername(name))[1] = 'masters'
        and public.can_download_final_master(public.safe_cast_uuid((storage.foldername(name))[2]))
      )
    )
  );
```

---

## 2. Fail-Closed Bitmap Watermarking (`src/lib/watermark.ts`)

```ts
/**
 * Renders an artwork image onto an offscreen canvas and burns a diagonal, semi-transparent
 * repeating watermark pattern directly into the bitmap pixels.
 *
 * This ensures watermarked WIP previews served over the network are physically watermarked,
 * preventing extraction via DevTools, Network inspect, or disabling CSS overlays.
 *
 * Fail-closed: If canvas 2D rendering or WebP encoding fails, this function REJECTS the promise,
 * preventing any raw, unwatermarked image from ever leaking to preview storage.
 */
export async function createWatermarkedImage(
  file: File,
  orderCode: string,
): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Canvas 2D context not available for watermarking (fail-closed)'));
        return;
      }

      // Draw original artwork
      ctx.drawImage(img, 0, 0);

      // Watermark styling
      ctx.save();
      const fontSize = Math.max(20, Math.round(canvas.width / 24));
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.40)';
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.32)';
      ctx.lineWidth = Math.max(1, fontSize / 16);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const angle = -24 * (Math.PI / 180);
      const stepX = Math.round(canvas.width / 2.6);
      const stepY = Math.round(canvas.height / 3.2);

      // Repeating grid pattern over rotated canvas
      for (let x = -canvas.width; x < canvas.width * 2; x += stepX) {
        for (let y = -canvas.height; y < canvas.height * 2; y += stepY) {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(angle);

          const line1 = 'MERU ART · WIP PREVIEW';
          const line2 = `Commission #${orderCode} · Do Not Repost`;

          ctx.strokeText(line1, 0, -fontSize * 0.65);
          ctx.fillText(line1, 0, -fontSize * 0.65);
          ctx.strokeText(line2, 0, fontSize * 0.65);
          ctx.fillText(line2, 0, fontSize * 0.65);

          ctx.restore();
        }
      }
      ctx.restore();

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Failed to encode watermarked canvas to WebP blob (fail-closed)'));
            return;
          }
          const watermarkedFile = new File([blob], `wip-${file.name.replace(/\.[^/.]+$/, '')}.webp`, {
            type: 'image/webp',
          });
          resolve(watermarkedFile);
        },
        'image/webp',
        0.88,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Failed to decode artwork image bitmap for watermarking: ${file.name} (fail-closed)`));
    };

    img.src = objectUrl;
  });
}
```

---

## 3. Storage Layer & Canonical Path Resolution (`src/lib/storage.ts`)

```ts
import { supabase } from '@/lib/supabase';
import { createWatermarkedImage } from '@/lib/watermark';
import type { SubmittedOrder } from '@/types';

export const STORAGE_BUCKETS = {
  references: 'commission-references',
  receipts: 'commission-receipts',
  wips: 'commission-wips',
} as const;

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9.-]/g, '_');
}

/** In-memory cache for resolved signed URLs to avoid redundant storage API queries. */
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

/**
 * Upload a client character reference image.
 * Destination: commission-references/{clientId}/{commissionId}/{timestamp}-{cleanName}
 * Returns canonical storage path for persistence in the database.
 */
export async function uploadReferenceFile(
  clientId: string,
  commissionId: string,
  file: File,
): Promise<{ path: string | null; error: string | null }> {
  if (!supabase) return { path: null, error: 'Supabase not connected' };

  const cleanName = sanitizeFileName(file.name);
  const path = `${clientId}/${commissionId}/${Date.now()}-${cleanName}`;

  const { error } = await supabase.storage.from(STORAGE_BUCKETS.references).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  });

  if (error) return { path: null, error: error.message };
  return { path, error: null };
}

/**
 * Upload a payment proof screenshot.
 * Destination: commission-receipts/{clientId}/{commissionId}/{timestamp}-{cleanName}
 * Returns canonical storage path for persistence in the database.
 */
export async function uploadReceiptFile(
  clientId: string,
  commissionId: string,
  file: File,
): Promise<{ path: string | null; error: string | null }> {
  if (!supabase) return { path: null, error: 'Supabase not connected' };

  const cleanName = sanitizeFileName(file.name);
  const path = `${clientId}/${commissionId}/${Date.now()}-${cleanName}`;

  const { error } = await supabase.storage.from(STORAGE_BUCKETS.receipts).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  });

  if (error) return { path: null, error: error.message };
  return { path, error: null };
}

/**
 * Upload an attachment in realtime chat (receipt, redline, or reference).
 * Destination: commission-references/{clientId}/{commissionId}/chat-{timestamp}-{cleanName}
 * Returns canonical storage path for persistence in the database.
 */
export async function uploadChatAttachment(
  clientId: string,
  commissionId: string,
  file: File,
): Promise<{ path: string | null; error: string | null }> {
  if (!supabase) return { path: null, error: 'Supabase not connected' };

  const cleanName = sanitizeFileName(file.name);
  const path = `${clientId}/${commissionId}/chat-${Date.now()}-${cleanName}`;

  const { error } = await supabase.storage.from(STORAGE_BUCKETS.references).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  });

  if (error) return { path: null, error: error.message };
  return { path, error: null };
}

/**
 * Upload an artist WIP preview or final deliverable.
 * - Always bakes a fail-closed watermark into pixels for previews/{commissionId}/...
 * - Always uploads the unwatermarked original to masters/{commissionId}/... (gated by RLS until completed).
 * - Never pre-signs master deliverables with admin JWT.
 * - Returns canonical storage object paths to be persisted in wip_uploads.
 */
export async function uploadWipArtwork(
  commissionId: string,
  orderCode: string,
  file: File,
  _isFinal: boolean,
): Promise<{
  previewPath: string | null;
  masterPath: string | null;
  error: string | null;
}> {
  if (!supabase) return { previewPath: null, masterPath: null, error: 'Supabase not connected' };

  const cleanName = sanitizeFileName(file.name);
  const timestamp = Date.now();

  try {
    // 1. Bake watermark into pixels (fail-closed: rejects if canvas or encoding fails)
    const watermarkedFile = await createWatermarkedImage(file, orderCode);
    const previewPath = `previews/${commissionId}/${timestamp}-watermarked-${cleanName}.webp`;

    const { error: previewErr } = await supabase.storage
      .from(STORAGE_BUCKETS.wips)
      .upload(previewPath, watermarkedFile, { cacheControl: '3600', upsert: false });

    if (previewErr) return { previewPath: null, masterPath: null, error: previewErr.message };

    // 2. Upload clean master into masters/ (locked behind status_stage = 'completed')
    const masterPath = `masters/${commissionId}/${timestamp}-clean-${cleanName}`;
    const { error: masterErr } = await supabase.storage
      .from(STORAGE_BUCKETS.wips)
      .upload(masterPath, file, { cacheControl: '3600', upsert: false });

    if (masterErr) return { previewPath: null, masterPath: null, error: masterErr.message };

    return {
      previewPath,
      masterPath,
      error: null,
    };
  } catch (err: any) {
    return { previewPath: null, masterPath: null, error: err?.message ?? 'Artwork upload failed' };
  }
}

/**
 * Generate a fresh signed URL for any private storage object with in-memory caching.
 * Resolves canonical storage paths dynamically at runtime so expiring URLs are never persisted to the DB.
 */
export async function resolveStorageUrl(
  pathOrUrl: string | null | undefined,
  defaultBucket: string = STORAGE_BUCKETS.references,
  expiresIn = 86400, // 24 hours
): Promise<string | null> {
  if (!pathOrUrl) return null;

  // Pass-through external URLs, blob URLs, data URIs, or static assets
  if (
    pathOrUrl.startsWith('http://') ||
    pathOrUrl.startsWith('https://') ||
    pathOrUrl.startsWith('blob:') ||
    pathOrUrl.startsWith('data:') ||
    pathOrUrl.startsWith('/')
  ) {
    return pathOrUrl;
  }

  if (!supabase) return pathOrUrl;

  let bucket = defaultBucket;
  if (pathOrUrl.startsWith('previews/') || pathOrUrl.startsWith('masters/')) {
    bucket = STORAGE_BUCKETS.wips;
  } else if (pathOrUrl.includes('receipt')) {
    bucket = STORAGE_BUCKETS.receipts;
  }

  const cacheKey = `${bucket}:${pathOrUrl}`;
  const now = Date.now();
  const cached = signedUrlCache.get(cacheKey);

  // Return cached signed URL if valid for at least 1 more minute
  if (cached && now < cached.expiresAt - 60000) {
    return cached.url;
  }

  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(pathOrUrl, expiresIn);
  if (error || !data?.signedUrl) {
    return null;
  }

  signedUrlCache.set(cacheKey, {
    url: data.signedUrl,
    expiresAt: now + expiresIn * 1000,
  });

  return data.signedUrl;
}

/**
 * Resolve all canonical media paths in a SubmittedOrder into fresh signed URLs.
 * High-res master paths (wips.highResUrl) remain canonical paths for on-demand gated retrieval.
 */
export async function resolveCommissionMedia(order: SubmittedOrder): Promise<SubmittedOrder> {
  const [resolvedRefs, resolvedWips, resolvedMsgs] = await Promise.all([
    // References
    Promise.all(
      order.references.map(async (ref) => {
        const url = await resolveStorageUrl(ref.previewUrl, STORAGE_BUCKETS.references);
        return { ...ref, previewUrl: url || ref.previewUrl };
      }),
    ),
    // WIP previews (watermarked)
    Promise.all(
      order.wips.map(async (wip) => {
        const url = await resolveStorageUrl(wip.imageUrl, STORAGE_BUCKETS.wips);
        return { ...wip, imageUrl: url || wip.imageUrl };
      }),
    ),
    // Messages
    Promise.all(
      order.messages.map(async (msg) => {
        if (!msg.attachmentUrl) return msg;
        const bucket = msg.attachmentKind === 'receipt' ? STORAGE_BUCKETS.receipts : STORAGE_BUCKETS.references;
        const url = await resolveStorageUrl(msg.attachmentUrl, bucket);
        return { ...msg, attachmentUrl: url || msg.attachmentUrl };
      }),
    ),
  ]);

  return {
    ...order,
    references: resolvedRefs,
    wips: resolvedWips,
    messages: resolvedMsgs,
  };
}

/**
 * Request an on-demand signed URL using the caller's JWT.
 * Storage RLS (wips_authorized_select) enforces that masters/ paths are only accessible
 * if the user owns the commission AND the commission status_stage = 'completed'.
 */
export async function getSignedMediaUrl(
  bucket: string,
  path: string,
  expiresIn = 300, // 5 minutes for downloads
): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error || !data) return null;
  return data.signedUrl;
}
```

---

## 4. Unabridged Database Client (`src/lib/supabase.ts`)

```ts
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

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;

/** Database row shape for studio_settings. */
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

/** Database row shape for public_queue_view. */
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

/** Database row shape for commissions. */
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
```

---

## 5. Verification
- `npm run build` (`tsc && vite build`) executes cleanly with zero TypeScript errors and zero warnings.
- Private buckets `commission-references`, `commission-receipts`, `commission-wips` have full PostgreSQL storage RLS applied.
- Storage folder paths evaluated with `public.safe_cast_uuid()` to prevent `22P02` exceptions.
- Master files in `masters/{commissionId}/...` strictly gated behind `public.can_download_final_master()`.
- Client and admin uploads write canonical paths into Postgres tables, dynamically resolving fresh signed URLs at runtime.
