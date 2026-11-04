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
  file: File | Blob,
  fileName?: string,
): Promise<{ path: string | null; error: string | null }> {
  if (!supabase) return { path: null, error: 'Supabase not connected' };

  const rawName = fileName || (file instanceof File && file.name ? file.name : 'reference.png');
  const cleanName = sanitizeFileName(rawName);
  const path = `${clientId}/${commissionId}/${Date.now()}-${cleanName}`;

  try {
    const { error } = await supabase.storage.from(STORAGE_BUCKETS.references).upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || 'image/png',
    });

    if (error) return { path: null, error: error.message };
    return { path, error: null };
  } catch (err) {
    return { path: null, error: err instanceof Error ? err.message : 'Storage upload failed' };
  }
}

/**
 * Resolves a ReferenceFile (which may have a raw File, blob URL, or base64 data URL)
 * into an uploadable File or Blob.
 */
export async function resolveReferenceToUploadable(ref: {
  file?: File | Blob;
  previewUrl?: string;
  name?: string;
}): Promise<{ file: File | Blob | null; filename: string }> {
  const filename = ref.name || 'reference.png';

  if (ref.file) {
    const resolvedName =
      'name' in ref.file && typeof (ref.file as any).name === 'string'
        ? (ref.file as any).name
        : filename;
    return {
      file: ref.file,
      filename: resolvedName,
    };
  }

  if (ref.previewUrl) {
    if (ref.previewUrl.startsWith('data:')) {
      try {
        const reconstructed = dataUrlToFile(ref.previewUrl, filename);
        return { file: reconstructed, filename };
      } catch {
        // Fallback
      }
    }
    if (ref.previewUrl.startsWith('blob:')) {
      try {
        if (typeof fetch !== 'undefined') {
          const res = await fetch(ref.previewUrl);
          const blob = await res.blob();
          return { file: blob, filename };
        }
      } catch {
        // Fallback
      }
    }
  }

  return { file: null, filename };
}

/**
 * Converts a File or Blob into a base64 Data URL, automatically optimizing large images.
 */
export async function fileToDataUrl(file: File | Blob): Promise<string> {
  if (typeof FileReader === 'undefined') {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      const mime = file.type || 'image/jpeg';
      return `data:${mime};base64,${base64}`;
    } catch {
      return '';
    }
  }

  return new Promise((resolve) => {
    // If under 600KB, read directly without canvas downscaling
    if (file.size <= 600 * 1024) {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
      return;
    }

    try {
      const img = new Image();
      const blobUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(blobUrl);
        const canvas = document.createElement('canvas');
        const maxDim = 1600;
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => resolve('');
          reader.readAsDataURL(file);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => {
        URL.revokeObjectURL(blobUrl);
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => resolve('');
        reader.readAsDataURL(file);
      };
      img.src = blobUrl;
    } catch {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    }
  });
}

/**
 * Optimizes a QR code image to a lightweight, highly-scannable square format (max 600px, JPEG ~35KB).
 * This ensures it never exceeds localStorage quotas and loads instantaneously.
 */
export async function optimizeQrImage(file: File | Blob): Promise<string> {
  if (typeof Image === 'undefined' || typeof document === 'undefined') {
    return fileToDataUrl(file);
  }

  return new Promise((resolve) => {
    try {
      const img = new Image();
      const blobUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(blobUrl);
        const canvas = document.createElement('canvas');
        const maxDim = 600;
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          fileToDataUrl(file).then(resolve);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.88));
      };
      img.onerror = () => {
        URL.revokeObjectURL(blobUrl);
        fileToDataUrl(file).then(resolve);
      };
      img.src = blobUrl;
    } catch {
      fileToDataUrl(file).then(resolve);
    }
  });
}

/** Reconstructs a File from a base64 Data URL. */
export function dataUrlToFile(dataUrl: string, fileName: string): File {
  const [header, base64Data] = dataUrl.split(',');
  const mimeMatch = header?.match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  if (typeof atob === 'function') {
    const binary = atob(base64Data || '');
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new File([bytes], fileName, { type: mime });
  } else {
    const buf = Buffer.from(base64Data || '', 'base64');
    return new File([buf], fileName, { type: mime });
  }
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
 * - Always bakes a fail-closed watermark into pixels for `previews/{commissionId}/...`.
 * - Always uploads the unwatermarked original to `masters/{commissionId}/...` (gated by RLS until completed).
 * - Never pre-signs master deliverables with admin JWT.
 * - Returns canonical storage object paths to be persisted in `wip_uploads`.
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
 * High-res master paths (`wips.highResUrl`) remain canonical paths for on-demand gated retrieval.
 */
export async function resolveCommissionMedia(order: SubmittedOrder): Promise<SubmittedOrder> {
  const [resolvedRefs, resolvedWips, resolvedMsgs, resolvedPmts] = await Promise.all([
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
    // Payment receipts
    Promise.all(
      (order.payments || []).map(async (p) => {
        if (!p.receiptPath) return p;
        const url = await resolveStorageUrl(p.receiptPath, STORAGE_BUCKETS.receipts);
        return { ...p, receiptPath: url || p.receiptPath };
      }),
    ),
  ]);

  return {
    ...order,
    references: resolvedRefs,
    wips: resolvedWips,
    messages: resolvedMsgs,
    payments: resolvedPmts,
  };
}

/**
 * Request an on-demand signed URL using the caller's JWT.
 * Storage RLS (`wips_authorized_select`) enforces that `masters/` paths are only accessible
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
