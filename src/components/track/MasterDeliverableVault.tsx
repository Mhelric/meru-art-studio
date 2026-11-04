import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Download,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  FileText,
  Copy,
  Check,
  Heart,
  ImageIcon,
  Maximize2,
} from 'lucide-react';
import type { SubmittedOrder, WipUploadItem } from '@/types';
import { formatShortDate } from '@/lib/utils';
import { getSignedMediaUrl, STORAGE_BUCKETS } from '@/lib/storage';
import { artSrc } from '@/components/portfolio/ArtImage';

interface MasterDeliverableVaultProps {
  order: SubmittedOrder;
  onOpenReceipt: () => void;
  onOpenTipModal?: () => void;
  showToast: (msg: string) => void;
  onInspectImage?: (url: string, title: string) => void;
}

export function MasterDeliverableVault({
  order,
  onOpenReceipt,
  onOpenTipModal,
  showToast,
  onInspectImage,
}: MasterDeliverableVaultProps) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const displayCode = order.orderCode || order.id;

  // Find final master deliverable, or fallback to latest approved WIP
  const finalWip =
    order.wips.find((w) => w.isFinal) ||
    order.wips.find((w) => w.approvedByClient) ||
    order.wips[order.wips.length - 1];

  const handleDownload = async (wip: WipUploadItem) => {
    if (wip.slug) {
      const fullUrl = artSrc(wip.slug, 'full');
      // Create downloadable link
      const a = document.createElement('a');
      a.href = fullUrl;
      a.download = `MeruArt-${displayCode}-${order.tier}-Master-300DPI.png`;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast('Master deliverable download started!');
      return;
    }

    const masterPath = wip.highResUrl;
    if (!masterPath) {
      // If imageUrl is already a direct data URL or public URL
      if (wip.imageUrl) {
        const a = document.createElement('a');
        a.href = wip.imageUrl;
        a.download = `MeruArt-${displayCode}-${order.tier}-Master-300DPI.png`;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showToast('Download started!');
        return;
      }
      showToast('Master deliverable path not found.');
      return;
    }

    setDownloadingId(wip.id);
    showToast('Authorizing secure master deliverable download (300 DPI)...');

    try {
      const signedUrl = await getSignedMediaUrl(STORAGE_BUCKETS.wips, masterPath, 300);
      if (!signedUrl) {
        showToast('Download unauthorized: full-res master deliverable is only unlocked once completed.');
        return;
      }

      const response = await fetch(signedUrl);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `MeruArt-${displayCode}-${order.tier}-Master-300DPI.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);

      showToast('Master high-res download completed!');
    } catch {
      // Fallback direct open
      const signedUrl = await getSignedMediaUrl(STORAGE_BUCKETS.wips, masterPath, 300);
      if (signedUrl) {
        window.open(signedUrl, '_blank');
      }
    } finally {
      setDownloadingId(null);
    }
  };

  const handleCopyShareLink = () => {
    const shareUrl = window.location.href;
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    showToast('Client room link copied to clipboard!');
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const masterPreviewUrl = finalWip?.imageUrl || (finalWip?.slug ? artSrc(finalWip.slug, 'full') : '');

  return (
    <div className="rounded-3xl border border-teal/40 bg-gradient-to-b from-paper via-canvas to-paper p-4 sm:p-7 shadow-xl space-y-6">
      {/* Showcase Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-line pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-soft px-3 py-1 text-xs font-bold text-teal">
              <ShieldCheck className="size-4 stroke-[2.5]" />
              Master Archival Vault Unlocked
            </span>
            <span className="text-xs font-mono font-semibold text-ink-mute">
              #{displayCode}
            </span>
          </div>
          <h3 className="font-display text-2xl sm:text-3xl font-extrabold text-ink">
            Final High-Res Deliverable
          </h3>
          <p className="text-xs text-ink-soft">
            300 DPI print-ready master artwork with all watermarks permanently removed.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onOpenTipModal && (
            <button
              type="button"
              onClick={onOpenTipModal}
              className="inline-flex items-center gap-1.5 rounded-full border border-coral/30 bg-coral-soft/50 px-3.5 py-1.5 text-xs font-bold text-coral transition hover:bg-coral hover:text-white shadow-2xs"
            >
              <Heart className="size-3.5" />
              <span>Tip Meru</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenReceipt}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-3.5 py-1.5 text-xs font-semibold text-ink transition hover:border-ink hover:bg-cream shadow-2xs"
          >
            <FileText className="size-3.5 text-ink-soft" />
            <span>Digital Receipt</span>
          </button>
        </div>
      </div>

      {/* Featured Master Showcase Card */}
      {finalWip ? (
        <div className="grid gap-6 lg:grid-cols-12 items-center">
          {/* Master Image Preview */}
          <div className="lg:col-span-7">
            <div className="relative group overflow-hidden rounded-2xl border border-line bg-paper shadow-md">
              <div className="aspect-4/3 w-full bg-canvas flex items-center justify-center overflow-hidden">
                {masterPreviewUrl ? (
                  <img
                    src={masterPreviewUrl}
                    alt={finalWip.title}
                    className="size-full object-contain transition-transform duration-300 group-hover:scale-[1.01]"
                  />
                ) : (
                  <div className="grid place-items-center text-ink-mute">
                    <ImageIcon className="size-12" />
                  </div>
                )}
              </div>

              {/* Verified Stamped Badge */}
              <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-ink/80 backdrop-blur-md px-3 py-1 text-[11px] font-bold text-white shadow-xs">
                <Sparkles className="size-3 text-mustard" />
                <span>300 DPI Master · Lossless</span>
              </div>

              {/* Fullscreen Inspector Trigger */}
              {masterPreviewUrl && onInspectImage && (
                <button
                  type="button"
                  onClick={() => onInspectImage(masterPreviewUrl, finalWip.title)}
                  className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-paper/90 backdrop-blur-md border border-line px-3 py-1.5 text-xs font-semibold text-ink shadow-md hover:bg-paper transition"
                >
                  <Maximize2 className="size-3.5" />
                  <span>Inspect Full-Res</span>
                </button>
              )}
            </div>
          </div>

          {/* Master Specifications & Actions */}
          <div className="lg:col-span-5 space-y-4">
            <div>
              <span className="text-xs font-semibold text-coral uppercase tracking-wider">
                Delivered Artwork
              </span>
              <h4 className="font-display text-xl sm:text-2xl font-bold text-ink mt-0.5">
                {finalWip.title}
              </h4>
              <p className="text-xs text-ink-soft mt-1">
                Completed on {formatShortDate(finalWip.createdAt.slice(0, 10))} by Meru Art Studio.
              </p>
            </div>

            {/* Technical Specifications */}
            <div className="rounded-2xl border border-line bg-canvas p-3.5 space-y-2 text-xs">
              <div className="flex items-center justify-between pb-1.5 border-b border-line">
                <span className="text-ink-mute font-medium">Print Resolution</span>
                <span className="font-bold text-ink">300 DPI (sRGB)</span>
              </div>
              <div className="flex items-center justify-between pb-1.5 border-b border-line">
                <span className="text-ink-mute font-medium">Format & Compression</span>
                <span className="font-bold text-ink">Lossless PNG / WebP</span>
              </div>
              <div className="flex items-center justify-between pb-1.5 border-b border-line">
                <span className="text-ink-mute font-medium">Licensing Scope</span>
                <span className="font-bold text-ink">
                  {order.addons?.commercial ? 'Commercial Use Unlocked' : 'Personal Use Archival'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-mute font-medium">Watermark Protection</span>
                <span className="font-bold text-teal flex items-center gap-1">
                  <Check className="size-3 stroke-[3]" /> Clean (No Watermark)
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2 pt-1">
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                type="button"
                disabled={downloadingId === finalWip.id}
                onClick={() => handleDownload(finalWip)}
                className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-teal px-5 py-3 text-sm font-bold text-white shadow-md hover:bg-ink transition disabled:opacity-50"
              >
                <Download className="size-4" />
                <span>
                  {downloadingId === finalWip.id
                    ? 'Preparing Master PNG...'
                    : 'Download High-Res PNG (300 DPI)'}
                </span>
              </motion.button>

              <div className="grid grid-cols-2 gap-2">
                {masterPreviewUrl && (
                  <a
                    href={masterPreviewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-line bg-paper px-3 py-2 text-xs font-semibold text-ink hover:bg-cream transition text-center"
                  >
                    <ExternalLink className="size-3.5 text-ink-soft" />
                    <span>Open in Tab</span>
                  </a>
                )}

                <button
                  type="button"
                  onClick={handleCopyShareLink}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-line bg-paper px-3 py-2 text-xs font-semibold text-ink hover:bg-cream transition text-center"
                >
                  {copiedLink ? (
                    <>
                      <Check className="size-3.5 text-teal" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="size-3.5 text-ink-soft" />
                      <span>Share Room Link</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Complete Deliverable Gallery (If multiple deliverables/sketches exist) */}
      {order.wips.length > 1 && (
        <div className="border-t border-line pt-5 space-y-3">
          <div className="flex items-center justify-between">
            <h5 className="font-display text-sm font-bold text-ink">
              All Milestone Passes & Production Assets ({order.wips.length})
            </h5>
            <span className="text-[11px] text-ink-mute">Archived for client records</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {order.wips.map((wip) => {
              const preview = wip.imageUrl || (wip.slug ? artSrc(wip.slug, 'sm') : '');
              return (
                <div
                  key={wip.id}
                  className="flex items-center gap-3 rounded-2xl border border-line bg-paper p-3 shadow-2xs hover:border-teal/50 transition"
                >
                  <div className="relative size-14 shrink-0 overflow-hidden rounded-xl border border-line bg-canvas">
                    {preview ? (
                      <img src={preview} alt={wip.title} className="size-full object-cover" />
                    ) : (
                      <div className="grid size-full place-items-center text-ink-mute">
                        <ImageIcon className="size-5" />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-xs text-ink truncate">{wip.title}</p>
                    <p className="text-[10px] text-ink-mute">
                      {wip.isFinal ? 'Final Master' : 'Milestone Pass'} ·{' '}
                      {formatShortDate(wip.createdAt.slice(0, 10))}
                    </p>

                    <button
                      type="button"
                      disabled={downloadingId === wip.id}
                      onClick={() => handleDownload(wip)}
                      className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-teal hover:text-ink transition"
                    >
                      <Download className="size-3" />
                      <span>{downloadingId === wip.id ? 'Downloading...' : 'Download'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
