import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  CreditCard,
  MessageSquare,
  Image as ImageIcon,
  Clock,
  Trash2,
  AlertTriangle,
  Download,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Eye,
  FileText,
} from 'lucide-react';
import type { SubmittedOrder } from '@/types';
import { formatUsd, formatMoney, getTier, cn } from '@/lib/utils';
import { useStudio } from '@/context/StudioContext';
import { getSignedMediaUrl, STORAGE_BUCKETS } from '@/lib/storage';

interface ArchiveDetailDialogProps {
  order: SubmittedOrder | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenDeleteDialog: (order: SubmittedOrder) => void;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])';

type DetailTab = 'brief' | 'payments' | 'chat' | 'wips' | 'timeline';

export function ArchiveDetailDialog({
  order,
  isOpen,
  onClose,
  onOpenDeleteDialog,
}: ArchiveDetailDialogProps) {
  const { openLightbox, showToast } = useStudio();
  const [activeTab, setActiveTab] = useState<DetailTab>('brief');
  const [isDownloading, setIsDownloading] = useState(false);

  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Focus restoration
  useEffect(() => {
    if (isOpen) {
      previouslyFocusedElementRef.current = document.activeElement as HTMLElement;
      setActiveTab('brief');
      return () => {
        previouslyFocusedElementRef.current?.focus();
      };
    }
  }, [isOpen]);

  // Focus placement
  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => {
      closeBtnRef.current?.focus();
    }, 50);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  // Focus trap and ESC
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
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
  }, [isOpen]);

  if (!isOpen || !order) return null;

  const isDeclined = order.stage === 'declined';
  const isCompleted = order.stage === 'completed';
  const isCancelled = order.stage === 'cancelled';

  // Extract decline or cancel notice from messages
  const noticeMessage = order.messages.find(
    (m) =>
      m.body.startsWith('[DECLINED Notice]:') ||
      m.body.startsWith('[CANCELLED Notice]:') ||
      m.body.includes('Cancellation & Refund Request'),
  );

  const hasUnpaidCompletedBalance = Boolean(
    order.stage === 'completed' && order.paymentSplit === '50_50' && !order.finalPaid,
  );

  const handleDownloadMaster = async (highResUrl?: string | null) => {
    if (!highResUrl) {
      showToast('No high-res master file found on this order.');
      return;
    }

    setIsDownloading(true);
    showToast('Generating secure 300 DPI master download URL...');
    try {
      let downloadUrl = highResUrl;
      if (!highResUrl.startsWith('http://') && !highResUrl.startsWith('https://')) {
        const signed = await getSignedMediaUrl(STORAGE_BUCKETS.wips, highResUrl, 300);
        if (signed) downloadUrl = signed;
      }
      window.open(downloadUrl, '_blank', 'noopener,noreferrer');
      showToast('Master illustration download started.');
    } catch (err: any) {
      showToast(`Download failed: ${err?.message ?? 'Error'}`);
    } finally {
      setIsDownloading(false);
    }
  };

  const finalWip = order.wips.find((w) => w.isFinal) || order.wips[order.wips.length - 1];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-ink/70 backdrop-blur-xs"
        />

        {/* Dialog Modal Container */}
        <motion.div
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="archive-detail-title"
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ duration: 0.2 }}
          className="relative z-10 flex max-h-[92vh] w-full max-w-3xl flex-col rounded-3xl border border-line bg-paper shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-start justify-between border-b border-line p-5">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-semibold text-ink-mute">
                  #{order.orderCode || order.id}
                </span>
                {isDeclined && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-coral-soft px-2.5 py-0.5 text-xs font-bold text-coral">
                    <XCircle className="size-3.5" /> Declined
                  </span>
                )}
                {isCompleted && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-teal-soft px-2.5 py-0.5 text-xs font-bold text-teal">
                    <CheckCircle2 className="size-3.5" /> Completed Delivery
                  </span>
                )}
                {isCancelled && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-cream px-2.5 py-0.5 text-xs font-bold text-ink-mute">
                    <AlertCircle className="size-3.5" /> Cancelled
                  </span>
                )}
              </div>

              <h3 id="archive-detail-title" className="mt-1 font-display text-xl font-bold text-ink">
                {order.characterName || 'Untitled'} · {getTier(order.tier).label}
              </h3>
              <p className="text-xs text-ink-soft">
                Client: <strong>{order.clientContact || 'Anonymous'}</strong> · Total: <strong>{formatUsd(order.totalUsd)}</strong>
              </p>
            </div>

            <button
              ref={closeBtnRef}
              type="button"
              onClick={onClose}
              aria-label="Close archive detail view"
              className="grid size-9 place-items-center rounded-full border border-line bg-canvas text-ink transition hover:bg-cream"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Sub-Nav Tabs */}
          <div className="flex border-b border-line bg-canvas px-5 text-xs font-semibold">
            {[
              { id: 'brief', label: 'Brief Details', icon: FileText },
              { id: 'payments', label: 'Payments & Ledger', icon: CreditCard },
              { id: 'chat', label: `Chat (${order.messages.length})`, icon: MessageSquare },
              { id: 'wips', label: `Vault & WIPs (${order.wips.length})`, icon: ImageIcon },
              { id: 'timeline', label: 'Timeline', icon: Clock },
            ].map((t) => {
              const active = activeTab === t.id;
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id as DetailTab)}
                  className={cn(
                    'flex items-center gap-1.5 border-b-2 px-3.5 py-3 transition',
                    active
                      ? 'border-ink text-ink font-bold'
                      : 'border-transparent text-ink-soft hover:text-ink',
                  )}
                >
                  <Icon className="size-3.5" />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>

          {/* Scrollable Body */}
          <div data-lenis-prevent className="flex-1 overflow-y-auto p-5 space-y-4">
            {/* Notice Callout */}
            {noticeMessage && (
              <div className="rounded-2xl border border-coral/30 bg-coral-soft/30 p-4 text-xs">
                <p className="font-bold text-coral flex items-center gap-1.5">
                  <AlertTriangle className="size-4" /> Notice on Record:
                </p>
                <p className="mt-1 text-ink">{noticeMessage.body}</p>
                <p className="mt-1 text-[10px] text-ink-mute">
                  Logged on {new Date(noticeMessage.createdAt).toLocaleString()}
                </p>
              </div>
            )}

            {/* TAB 1: Brief Details */}
            {activeTab === 'brief' && (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-line bg-canvas p-3.5">
                    <p className="text-[11px] font-semibold text-ink-soft">Tier & Scope</p>
                    <p className="text-sm font-bold text-ink mt-0.5">
                      {getTier(order.tier).label} ({order.characterCount} character{order.characterCount > 1 ? 's' : ''})
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
                      {order.addons.nsfw && (
                        <span className="rounded-md bg-coral-soft px-1.5 py-0.5 font-bold text-coral">+50% NSFW</span>
                      )}
                      {order.addons.softFurry && (
                        <span className="rounded-md bg-mustard-soft px-1.5 py-0.5 font-bold text-mustard">+50% Soft Furry</span>
                      )}
                      {order.addons.commercial && (
                        <span className="rounded-md bg-teal-soft px-1.5 py-0.5 font-bold text-teal">+200% Commercial</span>
                      )}
                      {!order.addons.nsfw && !order.addons.softFurry && !order.addons.commercial && (
                        <span className="text-ink-mute">No add-ons</span>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-line bg-canvas p-3.5">
                    <p className="text-[11px] font-semibold text-ink-soft">Pricing & Split</p>
                    <p className="text-sm font-bold text-ink mt-0.5">
                      {formatUsd(order.totalUsd)} ({order.currency})
                    </p>
                    <p className="mt-1 text-xs text-ink-soft">
                      Split: <strong>{order.paymentSplit === '50_50' ? '50% / 50% Milestone' : '100% Upfront'}</strong>
                    </p>
                  </div>
                </div>

                {/* Pose & Vibe Notes */}
                <div className="rounded-2xl border border-line bg-canvas p-3.5 space-y-1">
                  <p className="text-[11px] font-semibold text-ink-soft">Pose, Expression & Vibe</p>
                  <p className="text-xs text-ink leading-relaxed">
                    {order.poseAndVibe ? `"${order.poseAndVibe}"` : <span className="italic text-ink-mute">None specified</span>}
                  </p>
                </div>

                {/* Background Notes */}
                {order.backgroundNotes && (
                  <div className="rounded-2xl border border-line bg-canvas p-3.5 space-y-1">
                    <p className="text-[11px] font-semibold text-ink-soft">Background Notes</p>
                    <p className="text-xs text-ink leading-relaxed">{order.backgroundNotes}</p>
                  </div>
                )}

                {/* Reference Images Gallery */}
                <div className="rounded-2xl border border-line bg-canvas p-3.5 space-y-2">
                  <p className="text-[11px] font-semibold text-ink-soft">
                    Reference Files ({order.references.length})
                  </p>
                  {order.references.length === 0 ? (
                    <p className="text-xs text-ink-mute">No reference images attached.</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {order.references.map((ref, idx) => (
                        <button
                          key={ref.id || idx}
                          type="button"
                          onClick={() =>
                            openLightbox(
                              order.references.map((r) => r.previewUrl),
                              idx,
                            )
                          }
                          className="group relative aspect-square overflow-hidden rounded-xl border border-line bg-paper"
                        >
                          <img
                            src={ref.previewUrl}
                            alt={ref.name || `Reference #${idx + 1}`}
                            className="h-full w-full object-cover transition group-hover:scale-105"
                          />
                          <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition group-hover:opacity-100">
                            <Eye className="size-4 text-white" />
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Terms Acceptance */}
                <div className="flex items-center justify-between text-[11px] text-ink-mute px-1">
                  <span>Terms Accepted: {order.tosAccepted ? 'Yes (Signed)' : 'No'}</span>
                  {order.tosAcceptedAt && (
                    <span>Timestamp: {new Date(order.tosAcceptedAt).toLocaleString()}</span>
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: Payments & Ledger */}
            {activeTab === 'payments' && (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-line bg-canvas p-3.5">
                    <p className="text-[11px] font-semibold text-ink-soft">Upfront Deposit</p>
                    <p className="text-base font-bold text-ink mt-0.5">{formatUsd(order.depositUsd)}</p>
                    <span
                      className={cn(
                        'mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold',
                        order.depositPaid ? 'bg-teal-soft text-teal' : 'bg-coral-soft text-coral',
                      )}
                    >
                      {order.depositPaid ? '✓ Deposit Verified' : '✕ Deposit Unpaid'}
                    </span>
                  </div>

                  <div className="rounded-2xl border border-line bg-canvas p-3.5">
                    <p className="text-[11px] font-semibold text-ink-soft">Final Balance</p>
                    <p className="text-base font-bold text-ink mt-0.5">
                      {formatUsd(order.totalUsd - order.depositUsd)}
                    </p>
                    <span
                      className={cn(
                        'mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold',
                        order.finalPaid ? 'bg-teal-soft text-teal' : 'bg-coral-soft text-coral',
                      )}
                    >
                      {order.finalPaid ? '✓ Final Balance Verified' : '✕ Final Unpaid'}
                    </span>
                  </div>
                </div>

                {/* Payment ledger items */}
                <div className="rounded-2xl border border-line bg-canvas p-3.5 space-y-2">
                  <p className="text-[11px] font-semibold text-ink-soft">Payment History Records</p>
                  {!order.payments || order.payments.length === 0 ? (
                    <p className="text-xs text-ink-mute">No payment rows recorded in database.</p>
                  ) : (
                    <div className="divide-y divide-line/60">
                      {order.payments.map((p) => (
                        <div key={p.id} className="py-2.5 flex items-center justify-between text-xs">
                          <div>
                            <span className="font-semibold text-ink uppercase tracking-wider text-[10px]">
                              {p.kind}
                            </span>
                            <span className="text-ink-soft ml-2">
                              {formatMoney(p.amount, p.currency)}
                            </span>
                            <span className="text-ink-mute text-[10px] ml-2">
                              {new Date(p.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                'rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize',
                                p.status === 'verified'
                                  ? 'bg-teal-soft text-teal'
                                  : p.status === 'rejected'
                                  ? 'bg-coral-soft text-coral'
                                  : 'bg-mustard-soft text-mustard',
                              )}
                            >
                              {p.status}
                            </span>
                            {p.receiptPath && (
                              <button
                                type="button"
                                onClick={() => openLightbox([p.receiptPath!], 0)}
                                className="inline-flex items-center gap-1 rounded-md border border-line bg-paper px-2 py-0.5 text-[10px] font-medium text-ink hover:bg-cream"
                              >
                                <Eye className="size-3" /> Receipt
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 3: Chat Transcript */}
            {activeTab === 'chat' && (
              <div className="space-y-3">
                {order.messages.length === 0 ? (
                  <p className="text-center py-8 text-xs text-ink-mute">No chat messages on record.</p>
                ) : (
                  order.messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        'rounded-2xl p-3 text-xs',
                        msg.senderRole === 'artist'
                          ? 'bg-ink text-white ml-8'
                          : msg.senderRole === 'system'
                          ? 'bg-cream text-ink-soft border border-line text-center mx-4'
                          : 'bg-canvas text-ink border border-line mr-8',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-bold text-[10px]">
                          {msg.senderRole === 'artist' ? 'Meru Art' : order.clientContact || 'Client'}
                        </span>
                        <span className="text-[9px] opacity-70">
                          {new Date(msg.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap">{msg.body}</p>
                      {msg.attachmentUrl && (
                        <div className="mt-2">
                          <button
                            type="button"
                            onClick={() => openLightbox([msg.attachmentUrl!], 0)}
                            className="inline-flex items-center gap-1 rounded-md bg-black/20 px-2 py-1 text-[10px] font-semibold text-white hover:bg-black/40"
                          >
                            <Eye className="size-3" /> View Attachment
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {/* TAB 4: Vault & WIPs */}
            {activeTab === 'wips' && (
              <div className="space-y-4">
                {/* Completed High-Res Master Unlock */}
                {isCompleted && finalWip && (
                  <div className="rounded-2xl border border-teal/30 bg-teal-soft/20 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold text-teal flex items-center gap-1.5">
                          <CheckCircle2 className="size-4" /> 300 DPI Final Master Unlocked
                        </p>
                        <p className="text-[11px] text-ink-soft mt-0.5">
                          Signed delivery asset ready for download or artist backup.
                        </p>
                      </div>

                      <button
                        type="button"
                        disabled={isDownloading}
                        onClick={() => handleDownloadMaster(finalWip.highResUrl || finalWip.imageUrl)}
                        className="inline-flex items-center gap-1.5 rounded-full bg-teal px-4 py-2 text-xs font-bold text-white transition hover:bg-teal/90 disabled:opacity-50"
                      >
                        <Download className="size-3.5" /> Download High-Res
                      </button>
                    </div>
                  </div>
                )}

                {/* WIP Cards */}
                {order.wips.length === 0 ? (
                  <p className="text-center py-8 text-xs text-ink-mute">No WIPs uploaded for this order.</p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {order.wips.map((wip) => (
                      <div
                        key={wip.id}
                        className="rounded-2xl border border-line bg-canvas p-3.5 space-y-2 flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-center justify-between text-[10px] text-ink-soft">
                            <span className="font-bold uppercase tracking-wider">{wip.stage}</span>
                            <span>{new Date(wip.createdAt).toLocaleDateString()}</span>
                          </div>
                          <p className="text-xs font-bold text-ink mt-1">{wip.title}</p>
                          {wip.artistNote && (
                            <p className="text-[11px] text-ink-mute mt-1 italic">"{wip.artistNote}"</p>
                          )}
                        </div>

                        {wip.imageUrl && (
                          <button
                            type="button"
                            onClick={() => openLightbox([wip.imageUrl!], 0)}
                            className="group relative aspect-video w-full overflow-hidden rounded-xl border border-line bg-paper mt-2"
                          >
                            <img
                              src={wip.imageUrl}
                              alt={wip.title}
                              className="h-full w-full object-cover transition group-hover:scale-105"
                            />
                            <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition group-hover:opacity-100">
                              <Eye className="size-4 text-white" />
                            </span>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 5: Timeline */}
            {activeTab === 'timeline' && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-line bg-canvas p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <span className="grid size-6 place-items-center rounded-full bg-ink text-white text-xs font-bold">1</span>
                    <div>
                      <p className="text-xs font-bold text-ink">Commission Brief Submitted</p>
                      <p className="text-[11px] text-ink-mute">{new Date(order.createdAt).toLocaleString()}</p>
                    </div>
                  </div>

                  {order.startDate && (
                    <div className="flex items-start gap-3">
                      <span className="grid size-6 place-items-center rounded-full bg-teal text-white text-xs font-bold">2</span>
                      <div>
                        <p className="text-xs font-bold text-ink">Work Started</p>
                        <p className="text-[11px] text-ink-mute">{order.startDate}</p>
                      </div>
                    </div>
                  )}

                  <div className="flex items-start gap-3">
                    <span className="grid size-6 place-items-center rounded-full bg-coral text-white text-xs font-bold">3</span>
                    <div>
                      <p className="text-xs font-bold text-ink">Terminal Status Reached: {order.stage.toUpperCase()}</p>
                      <p className="text-[11px] text-ink-mute">
                        {order.estEndDate ? `Target: ${order.estEndDate}` : 'Archived in Studio'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between border-t border-line bg-canvas p-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-line bg-paper px-4 py-2 text-xs font-semibold text-ink-soft transition hover:border-ink hover:text-ink"
            >
              Close Details
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={hasUnpaidCompletedBalance}
                onClick={() => {
                  onClose();
                  onOpenDeleteDialog(order);
                }}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-semibold transition',
                  hasUnpaidCompletedBalance
                    ? 'border-line bg-paper text-ink-mute opacity-50 cursor-not-allowed'
                    : 'border-coral/40 bg-coral-soft/50 text-coral hover:bg-coral hover:text-white',
                )}
                title={hasUnpaidCompletedBalance ? 'Cannot delete completed order with unpaid balance' : undefined}
              >
                <Trash2 className="size-3.5" /> Purge Order Forever
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
