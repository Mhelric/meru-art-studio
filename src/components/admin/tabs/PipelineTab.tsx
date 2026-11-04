import { useMemo, useRef, useState, useEffect, type ChangeEvent, type FormEvent } from 'react';
import {
  ArrowRight,
  Calendar,
  Check,
  ExternalLink,
  Eye,
  ImagePlus,
  Layers,
  Send,
  XCircle,
  AlertTriangle,
  AlertCircle,
  X,
  Pencil,
  PenTool,
  Palette,
  SunMedium,
  Brush,
  Crown,
  MessageSquare,
  Receipt,
  ShieldCheck,
  RotateCcw,
  Plus,
  Clock,
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
import type { SubmittedOrder, CommissionStage } from '@/types';
import { getActiveCancellationRequest, getRefundTierInfo } from '@/lib/orderCancellation';
import { getRevisionAllowance, getOrderSignoffStatus } from '@/lib/revisionWorkflow';
import { WipUploadConfirmModal } from '@/components/admin/dialogs/WipUploadConfirmModal';
import { OrderChatWidget } from '@/components/track/OrderChatWidget';
import { artSrc } from '@/components/portfolio/ArtImage';
import { PaymentDetailsModal } from '@/components/track/dialogs/PaymentDetailsModal';

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
    user,
    studioSettings,
    adjustMaxRevisions,
  } = useStudio();

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

  // Active Order Fallback Guard (prevents null reference renders)
  const selectedOrder = useMemo(() => {
    return orders.find((o) => o.id === activeOrderId) ?? orders[0] ?? null;
  }, [orders, activeOrderId]);

  const revisionAllowance = useMemo(() => {
    if (!selectedOrder) return { usedCount: 0, maxAllowed: 2, remainingCount: 2, isExhausted: false, canRequestFree: true };
    return getRevisionAllowance(selectedOrder);
  }, [selectedOrder]);

  const signoffStatus = useMemo(() => {
    if (!selectedOrder) return { isSignedOff: false, signedOffAt: null };
    return getOrderSignoffStatus(selectedOrder);
  }, [selectedOrder]);

  const currentStepIdx = useMemo(() => {
    if (!selectedOrder) return -1;
    return STAGE_STEPS.findIndex((s) => s.id === selectedOrder.stage);
  }, [selectedOrder]);

  const nextStep = useMemo(() => {
    if (currentStepIdx < 0 || currentStepIdx >= STAGE_STEPS.length - 1) return null;
    return STAGE_STEPS[currentStepIdx + 1];
  }, [currentStepIdx]);

  const readiness = useMemo(() => {
    if (!selectedOrder || !nextStep) return { ready: true, missing: [] };
    const missing: string[] = [];

    if (nextStep.id === 'sketching' && !selectedOrder.depositPaid) {
      missing.push('Upfront deposit receipt must be verified');
    }
    if (nextStep.id === 'sketch_approval' && selectedOrder.wips.length === 0) {
      missing.push('At least 1 sketch WIP must be uploaded');
    }
    if (nextStep.id === 'lineart_coloring') {
      const signoff = getOrderSignoffStatus(selectedOrder);
      if (!signoff.isSignedOff) {
        missing.push('Client must formally sign off on Sketch milestone');
      }
      const isPaid = selectedOrder.finalPaid || selectedOrder.paymentSplit === '100_upfront';
      if (!isPaid) missing.push('Remaining balance receipt must be verified');
    }
    if (nextStep.id === 'completed') {
      const isPaid = selectedOrder.finalPaid || selectedOrder.paymentSplit === '100_upfront';
      if (!isPaid) missing.push('Order must be fully paid');
      const hasFinalWip = selectedOrder.wips.some((w) => w.isFinal);
      if (!hasFinalWip) missing.push('A final deliverable artwork must be uploaded');
    }

    return { ready: missing.length === 0, missing };
  }, [nextStep, selectedOrder]);

  // WIP uploader state
  const [wipTitle, setWipTitle] = useState('');
  const [wipNote, setWipNote] = useState('');
  const [wipIsFinal, setWipIsFinal] = useState(false);
  const [wipStage, setWipStage] = useState<CommissionStage>('lineart_coloring');
  const [wipProgress, setWipProgress] = useState<number>(85);
  const [pendingWipFile, setPendingWipFile] = useState<File | null>(null);
  const [pendingWipPreviewUrl, setPendingWipPreviewUrl] = useState<string | null>(null);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isUploadingWip, setIsUploadingWip] = useState(false);
  const [artistReply, setArtistReply] = useState('');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const wipFileRef = useRef<HTMLInputElement | null>(null);

  // Keep wipStage in sync with selected order unless user chose a specific preset
  useEffect(() => {
    if (selectedOrder) {
      if (selectedOrder.stage === 'sketching') {
        setWipStage('sketch_approval');
        setWipProgress(62);
      } else if (selectedOrder.stage === 'sketch_approval') {
        setWipStage('sketch_approval');
        setWipProgress(62);
      } else if (selectedOrder.stage === 'lineart_coloring') {
        setWipStage('lineart_coloring');
        setWipProgress(Math.max(selectedOrder.progress, 85));
      }
    }
  }, [selectedOrder?.id, selectedOrder?.stage]);

  const handleApplyPreset = (preset: {
    defaultTitle: string;
    stage: CommissionStage;
    progress: number;
    isFinal: boolean;
  }) => {
    setWipTitle(preset.defaultTitle);
    setWipStage(preset.stage);
    setWipProgress(preset.progress);
    setWipIsFinal(preset.isFinal);
  };

  const handleWipFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedOrder) return;

    if (pendingWipPreviewUrl) {
      URL.revokeObjectURL(pendingWipPreviewUrl);
    }
    const url = URL.createObjectURL(file);
    setPendingWipFile(file);
    setPendingWipPreviewUrl(url);

    if (!wipTitle.trim()) {
      setWipTitle(`${wipIsFinal ? 'Final Master' : 'WIP'} · ${file.name.replace(/\.[^/.]+$/, '')}`);
    }

    setIsConfirmModalOpen(true);
    e.target.value = '';
  };

  const handleConfirmUpload = async () => {
    if (!pendingWipFile || !selectedOrder) return;

    const title = wipTitle.trim() || `${wipIsFinal ? 'Final' : 'WIP'} · ${pendingWipFile.name}`;
    const artistNote = wipNote.trim() || 'Uploaded new progress image from Admin Panel.';

    setIsUploadingWip(true);
    try {
      showToast('Processing artwork, applying watermark shield & uploading...');
      const { previewPath, masterPath, error } = await uploadWipArtwork(
        selectedOrder.id,
        selectedOrder.orderCode || selectedOrder.id,
        pendingWipFile,
        wipIsFinal,
      );
      if (error || !previewPath) {
        showToast(`Upload failed: ${error ?? 'Unknown error'}`);
        return;
      }

      uploadArtistWip(selectedOrder.id, {
        title,
        artistNote,
        isFinal: wipIsFinal,
        stage: wipIsFinal ? 'completed' : wipStage,
        progress: wipProgress,
        imageUrl: previewPath,
        highResUrl: masterPath || undefined,
      });

      if (pendingWipPreviewUrl) {
        URL.revokeObjectURL(pendingWipPreviewUrl);
      }
      setPendingWipFile(null);
      setPendingWipPreviewUrl(null);
      setIsConfirmModalOpen(false);
      setWipTitle('');
      setWipNote('');
    } finally {
      setIsUploadingWip(false);
    }
  };

  const handleCloseConfirmModal = () => {
    if (isUploadingWip) return;
    if (pendingWipPreviewUrl) {
      URL.revokeObjectURL(pendingWipPreviewUrl);
    }
    setPendingWipFile(null);
    setPendingWipPreviewUrl(null);
    setIsConfirmModalOpen(false);
  };

  const handleChooseDifferentFile = () => {
    wipFileRef.current?.click();
  };

  const handleSendArtistMessage = (e: FormEvent) => {
    e.preventDefault();
    if (!selectedOrder || !artistReply.trim()) return;
    sendOrderMessage(selectedOrder.id, artistReply.trim(), { senderRole: 'artist' });
    setArtistReply('');
    showToast('Sent message as Meru Art!');
  };

  const cancellationStatus = useMemo(() => {
    if (!selectedOrder) return { hasRequest: false, reason: '', status: 'none' as const };
    return getActiveCancellationRequest(selectedOrder);
  }, [selectedOrder]);

  const refundDetails = useMemo(() => {
    if (!selectedOrder) return null;
    return getRefundTierInfo(
      selectedOrder.stage,
      selectedOrder.totalUsd,
      selectedOrder.depositUsd,
      selectedOrder.depositPaid,
      selectedOrder.finalPaid,
    );
  }, [selectedOrder]);

  const handleDeclineCancellation = async (order: SubmittedOrder) => {
    const reason = window.prompt(
      'Enter reason for declining cancellation request (will be sent to client):',
      'Artwork production is already underway and committed per studio TOS schedule.',
    );
    if (!reason || !reason.trim()) return;

    await sendOrderMessage(
      order.id,
      `[Cancellation Declined]: ${reason.trim()}`,
      { senderRole: 'artist' },
    );
    showToast('Cancellation request declined. Client notified in order room.');
  };

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-3xl border border-line bg-paper/60 p-12 text-center">
        <div className="grid size-14 place-items-center rounded-full bg-cream text-ink-mute">
          <Layers className="size-7" />
        </div>
        <h3 className="mt-4 font-display text-xl font-bold text-ink">No Active Commissions in Pipeline</h3>
        <p className="mt-1 max-w-md text-xs text-ink-soft">
          There are currently no commissions in progress. Review incoming briefs in the "Briefs" tab to accept new projects into the active pipeline.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-6 sm:pb-8 w-full min-w-0">
      {/* Active Order Horizontal Switcher */}
      <div className="w-full min-w-0">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold text-ink">
            Active Commissions In Production ({orders.length}):
          </p>
          <span className="text-[11px] text-ink-mute hidden sm:inline">Select an order to manage</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {orders.map((o) => {
            const active = selectedOrder?.id === o.id;
            const code = o.orderCode || o.id;
            const tier = getTier(o.tier);
            const req = getActiveCancellationRequest(o);

            return (
              <button
                key={o.id}
                type="button"
                onClick={() => setActiveOrderId(o.id)}
                className={cn(
                  'flex items-center gap-2 rounded-2xl px-3 py-1.5 sm:px-3.5 sm:py-2 text-xs font-semibold transition-all relative',
                  active
                    ? 'bg-ink text-white shadow-xs'
                    : 'border border-line bg-paper text-ink-soft hover:border-ink/30 hover:text-ink',
                )}
              >
                {req.hasRequest && (
                  <span
                    className="size-2 rounded-full bg-coral animate-pulse"
                    title="Client requested cancellation"
                  />
                )}
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
        <div className="grid gap-6 lg:grid-cols-12 items-start w-full min-w-0">
          {/* Left Column (7 cols): Brief Details, Reference Sheets & Financial Gates */}
          <div className="space-y-4 lg:col-span-7 w-full min-w-0">
            {/* Header info */}
            <div className="rounded-3xl border border-line bg-paper p-4 sm:p-5 shadow-xs w-full min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="space-y-1.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${ACCENT_CLASSES[TIER_ACCENT[selectedOrder.tier]].soft} ${ACCENT_CLASSES[TIER_ACCENT[selectedOrder.tier]].text}`}
                    >
                      {getTier(selectedOrder.tier).label} × {selectedOrder.characterCount}
                    </span>
                    <span className="font-display text-lg sm:text-xl font-bold text-ink truncate">
                      #{selectedOrder.orderCode || selectedOrder.id} · {selectedOrder.characterName || 'Client Request'}
                    </span>
                  </div>
                  <p className="text-xs text-ink-soft truncate">
                    Client: <span className="font-semibold text-ink">{selectedOrder.clientContact || 'Anonymous'}</span>
                    {selectedOrder.poseAndVibe ? ` — "${selectedOrder.poseAndVibe}"` : ''}
                  </p>
                </div>

                <div className="flex flex-col sm:items-end gap-2.5 border-t border-line/60 pt-3 sm:border-0 sm:pt-0 shrink-0">
                  <div className="text-left sm:text-right">
                    <p className="font-display text-2xl font-bold text-ink leading-tight">
                      {formatUsd(selectedOrder.totalUsd)}
                    </p>
                    <p className="text-[11px] text-ink-mute">
                      Deposit: {formatUsd(selectedOrder.depositUsd)} ({selectedOrder.paymentSplit === '50_50' ? '50/50' : '100% upfront'})
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('track')}
                    className="inline-flex items-center justify-center gap-1.5 rounded-full border border-line bg-canvas px-3.5 py-1.5 text-xs font-semibold text-ink shadow-2xs transition hover:border-ink hover:bg-cream"
                    title="Preview commission in Client Tracker Room"
                  >
                    <Eye className="size-3.5 text-coral" />
                    <span>Preview Client Room</span>
                    <ArrowRight className="size-3 opacity-60" />
                  </button>
                </div>
              </div>
            </div>

            {/* Client Cancellation Request Banner */}
            {cancellationStatus.hasRequest && refundDetails && (
              <div className="rounded-3xl border border-coral/40 bg-coral-soft/90 p-5 shadow-xs">
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-paper text-coral shadow-2xs">
                    <AlertTriangle className="size-5" />
                  </span>
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-coral">
                        Client Cancellation Request Received
                      </span>
                      <span className="rounded-full bg-coral px-2.5 py-0.5 text-[10px] font-bold text-white">
                        Requires Artist Confirmation
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs text-ink">
                      Client reason provided: <strong className="italic">"{cancellationStatus.reason}"</strong>
                    </p>
                    <div className="mt-3 grid grid-cols-1 gap-2 rounded-2xl border border-line bg-paper/90 p-3 text-xs sm:grid-cols-2">
                      <div>
                        <span className="text-ink-mute">TOS Refund Tier:</span>
                        <p className="font-semibold text-ink">{refundDetails.tierName} ({refundDetails.percentage})</p>
                      </div>
                      <div>
                        <span className="text-ink-mute">Eligible Refund:</span>
                        <p className="font-semibold text-coral">
                          {formatUsd(refundDetails.refundAmount)} (Process within 3–5 business days)
                        </p>
                      </div>
                    </div>
                    <div className="mt-3.5 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => onOpenCancelModal?.(selectedOrder)}
                        className="inline-flex items-center gap-1.5 rounded-full bg-coral px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-ink"
                      >
                        <XCircle className="size-3.5" /> Confirm Cancellation & Approve Refund
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeclineCancellation(selectedOrder)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-4 py-2 text-xs font-semibold text-ink transition hover:bg-cream"
                      >
                        <X className="size-3.5" /> Decline Request (Keep Active)
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Client Reference Sheets & Visual Guide Card */}
            <div className="space-y-3 rounded-3xl border border-line bg-paper p-4 sm:p-5 shadow-xs w-full min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <h4 className="font-display text-base font-semibold text-ink">
                    Client Reference Sheets
                  </h4>
                  <span className="rounded-full bg-cream px-2.5 py-0.5 text-[11px] font-semibold text-ink-soft shrink-0">
                    {selectedOrder.references?.length ?? 0} attached
                  </span>
                </div>
                <span className="text-[11px] text-ink-mute hidden sm:inline">Click image to inspect full-res</span>
              </div>

              {!selectedOrder.references || selectedOrder.references.length === 0 ? (
                <p className="py-2 text-xs italic text-ink-mute">
                  No reference sheets attached to this commission.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {selectedOrder.references.map((ref, idx) => (
                    <a
                      key={ref.id || idx}
                      href={ref.previewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-canvas transition hover:border-ink hover:shadow-xs"
                      title={ref.name || `Reference #${idx + 1}`}
                    >
                      <div className="relative aspect-4/3 w-full overflow-hidden bg-cream">
                        <img
                          src={ref.previewUrl}
                          alt={ref.name || `Reference #${idx + 1}`}
                          className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition group-hover:opacity-100">
                          <span className="inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-ink shadow-xs">
                            <ExternalLink className="size-3" /> View Full
                          </span>
                        </div>
                      </div>
                      <div className="p-2.5">
                        <p className="truncate text-xs font-semibold text-ink" title={ref.name}>
                          {ref.name || `Reference #${idx + 1}`}
                        </p>
                        <p className="text-[10px] text-ink-mute">
                          {ref.sizeBytes ? `${Math.round(ref.sizeBytes / 1024)} KB` : 'Attached reference'}
                        </p>
                      </div>
                    </a>
                  ))}
                </div>
              )}

              {/* Character Details & Vibe Notes */}
              <div className="space-y-1.5 rounded-2xl border border-line/70 bg-canvas/70 p-3.5 text-xs text-ink w-full min-w-0">
                <div>
                  <span className="font-semibold text-ink-mute">Character / Subject: </span>
                  <span className="font-semibold text-ink">{selectedOrder.characterName || 'Not specified'}</span>
                </div>
                <div>
                  <span className="font-semibold text-ink-mute">Pose, Expression & Vibe: </span>
                  <span className="text-ink-soft">{selectedOrder.poseAndVibe || 'Artist free reign'}</span>
                </div>
                {selectedOrder.backgroundNotes && (
                  <div>
                    <span className="font-semibold text-ink-mute">Background & Details: </span>
                    <span className="text-ink-soft">{selectedOrder.backgroundNotes}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Payment Verification Toggles: Stack on mobile to avoid horizontal clipping */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full min-w-0">
              <button
                type="button"
                onClick={() => {
                  toggleOrderPaymentFlag(selectedOrder.id, 'depositPaid');
                  showToast('Updated upfront deposit verification!');
                }}
                className={cn(
                  'flex items-center justify-between rounded-2xl border p-3.5 text-left transition-all w-full min-w-0',
                  selectedOrder.depositPaid
                    ? 'border-teal bg-teal-soft/50 text-ink'
                    : 'border-line bg-canvas text-ink-soft',
                )}
              >
                <div className="min-w-0 pr-2">
                  <p className="text-xs font-semibold text-ink">Upfront Deposit ({formatUsd(selectedOrder.depositUsd)})</p>
                  <p className="text-[11px] text-ink-mute">
                    {selectedOrder.depositPaid ? 'Verified · Sketch Unlocked' : 'Click to mark receipt verified'}
                  </p>
                </div>
                <span
                  className={cn(
                    'grid size-6 shrink-0 place-items-center rounded-full',
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
                  'flex items-center justify-between rounded-2xl border p-3.5 text-left transition-all w-full min-w-0',
                  selectedOrder.finalPaid
                    ? 'border-teal bg-teal-soft/50 text-ink'
                    : 'border-line bg-canvas text-ink-soft',
                )}
              >
                <div className="min-w-0 pr-2">
                  <p className="text-xs font-semibold text-ink">
                    Remaining ({formatUsd(Math.max(0, selectedOrder.totalUsd - selectedOrder.depositUsd))})
                  </p>
                  <p className="text-[11px] text-ink-mute">
                    {selectedOrder.finalPaid ? 'Verified · Deliverable Unlocked' : 'Click to mark receipt verified'}
                  </p>
                </div>
                <span
                  className={cn(
                    'grid size-6 shrink-0 place-items-center rounded-full',
                    selectedOrder.finalPaid ? 'bg-teal text-white' : 'border border-line bg-paper',
                  )}
                >
                  {selectedOrder.finalPaid && <Check className="size-3.5" strokeWidth={3} />}
                </span>
              </button>
            </div>

            {/* Studio Invoice Preview & Link Sharing */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-line bg-canvas/80 p-3.5 text-xs shadow-2xs w-full min-w-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-paper border border-line text-coral shadow-2xs">
                  <Receipt className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-ink leading-tight">
                    Studio Invoice & QR Preview
                  </p>
                  <p className="text-[11px] text-ink-mute truncate">
                    Preview client invoice, copy 1-click payment links, or print PDF
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsPaymentModalOpen(true)}
                className="inline-flex items-center justify-center gap-1.5 rounded-full border border-line bg-paper px-3.5 py-1.5 text-xs font-semibold text-ink shadow-2xs transition hover:border-ink hover:bg-cream shrink-0"
              >
                <Eye className="size-3.5 text-coral" />
                <span>Preview Invoice & Links</span>
                <ArrowRight className="size-3 opacity-60" />
              </button>
            </div>

            {/* Formal Revision Rounds Management Card */}
            <div className="rounded-2xl border border-line bg-canvas p-3.5 space-y-2.5 text-xs shadow-2xs w-full min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="grid size-7 shrink-0 place-items-center rounded-xl bg-paper border border-line text-coral shadow-2xs">
                    <RotateCcw className="size-3.5" />
                  </span>
                  <div>
                    <span className="font-semibold text-ink">
                      Client Revision Rounds: {revisionAllowance.usedCount} of {revisionAllowance.maxAllowed} Used
                    </span>
                    <p className="text-[10px] text-ink-mute">
                      {revisionAllowance.canRequestFree
                        ? `${revisionAllowance.remainingCount} included round(s) remaining for client`
                        : 'Included rounds exhausted · Client informed extra fees may apply'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => adjustMaxRevisions(selectedOrder.id, revisionAllowance.maxAllowed + 1)}
                    className="inline-flex items-center gap-1 rounded-full border border-line bg-paper px-2.5 py-1 text-[11px] font-semibold text-ink hover:border-ink hover:bg-cream transition shadow-2xs"
                    title="Grant client +1 complimentary revision round"
                  >
                    <Plus className="size-3 text-teal" />
                    <span>+1 Bonus Round</span>
                  </button>
                  {revisionAllowance.maxAllowed !== 2 && (
                    <button
                      type="button"
                      onClick={() => adjustMaxRevisions(selectedOrder.id, 2)}
                      className="rounded-full border border-line bg-paper px-2 py-1 text-[10px] text-ink-mute hover:text-ink transition"
                      title="Reset revision allowance back to default 2 rounds"
                    >
                      Reset (2)
                    </button>
                  )}
                </div>
              </div>

              {/* Revision rounds pill indicators */}
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                {Array.from({ length: revisionAllowance.maxAllowed }).map((_, i) => (
                  <span
                    key={i}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold',
                      i < revisionAllowance.usedCount
                        ? 'bg-ink text-white'
                        : 'border border-line bg-paper text-ink-soft',
                    )}
                  >
                    {i < revisionAllowance.usedCount ? (
                      <Check className="size-2.5 text-mustard" strokeWidth={3} />
                    ) : (
                      <span className="size-1.5 rounded-full bg-ink-mute/40" />
                    )}
                    Round {i + 1}
                  </span>
                ))}
              </div>
            </div>

            {/* Stage Controller: Guided Step Panel & Manual Overrides */}
            <div className="rounded-3xl border border-line bg-paper p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-line/60 pb-3">
                <div>
                  <span className="text-[11px] font-semibold text-coral uppercase tracking-wide">
                    Authoritative Workflow Engine
                  </span>
                  <h4 className="font-display text-base font-semibold text-ink">
                    Active Milestone: {selectedOrder.stage.replace('_', ' ')} ({selectedOrder.progress}%)
                  </h4>
                </div>
                {nextStep && (
                  <span className="rounded-full bg-cream px-2.5 py-1 text-[11px] font-medium text-ink-soft">
                    Next: {nextStep.shortLabel}
                  </span>
                )}
              </div>

              {/* Formal Milestone Sign-off Gate Status Banner */}
              <div className="rounded-2xl border border-line bg-canvas p-3.5 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="grid size-7 shrink-0 place-items-center rounded-xl bg-paper border border-line shadow-2xs">
                      {signoffStatus.isSignedOff ? (
                        <ShieldCheck className="size-4 text-teal" />
                      ) : (
                        <Clock className="size-4 text-mustard" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-ink">
                        Client Milestone Sign-off Gate
                      </p>
                      <p className="text-[10px] text-ink-mute truncate">
                        {signoffStatus.isSignedOff
                          ? `Formally approved & locked: ${signoffStatus.signedOffWipTitle || 'Sketch'}`
                          : 'Awaiting client checklist acceptance & signature before Lineart'}
                      </p>
                    </div>
                  </div>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase',
                      signoffStatus.isSignedOff
                        ? 'bg-teal text-white'
                        : 'bg-mustard-soft text-ink font-semibold',
                    )}
                  >
                    {signoffStatus.isSignedOff ? 'Signed & Locked' : 'Pending Client Gate'}
                  </span>
                </div>
              </div>

              {nextStep ? (
                <div className="rounded-2xl border border-line bg-canvas p-3.5 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <span className="text-xs font-semibold text-ink">Next Milestone Action</span>
                    <span className={cn('inline-flex items-center gap-1 text-[11px] font-medium shrink-0', readiness.ready ? 'text-teal font-semibold' : 'text-coral')}>
                      {readiness.ready ? (
                        <>
                          <Check className="size-3" strokeWidth={3} />
                          <span>Ready to advance</span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="size-3" />
                          <span className="hidden sm:inline">Action required before advance</span>
                          <span className="sm:hidden">Action required</span>
                        </>
                      )}
                    </span>
                  </div>

                  {readiness.missing.length > 0 && (
                    <ul className="space-y-1 text-xs text-coral">
                      {readiness.missing.map((msg, i) => (
                        <li key={i} className="flex items-center gap-1.5">
                          <span className="size-1.5 rounded-full bg-coral shrink-0" />
                          <span>{msg}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setOrderStage(selectedOrder.id, nextStep.id);
                    }}
                    className={cn(
                      'flex w-full items-center justify-center gap-2 rounded-2xl sm:rounded-full px-3 py-2.5 text-xs font-semibold shadow-xs transition-colors text-center',
                      readiness.ready
                        ? 'bg-ink text-white hover:bg-coral'
                        : 'border border-dashed border-ink/40 bg-paper text-ink hover:bg-cream',
                    )}
                  >
                    <span className="sm:hidden">Advance to: {nextStep.shortLabel}</span>
                    <span className="hidden sm:inline">Advance to: {nextStep.fullLabel}</span>
                    <ArrowRight className="size-3.5 shrink-0" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-1.5 rounded-2xl border border-teal/40 bg-teal-soft/50 p-3 text-center text-xs font-semibold text-teal">
                  <Check className="size-3.5" strokeWidth={3} />
                  <span>This commission has reached the final Completed milestone. High-Res master download unlocked.</span>
                </div>
              )}

              {/* Direct Milestone Stage Overrides */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-ink">Manual Stage Overrides:</span>
                  <span className="text-[11px] text-ink-mute hidden sm:inline">Quick admin jump</span>
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
                        }}
                        className={cn(
                          'truncate rounded-xl border px-2.5 py-2 text-left text-xs font-semibold transition-all',
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
              </div>
            </div>

            {/* Start & Delivery Schedule Date Pickers: Stack on mobile to avoid horizontal clipping */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-3xl border border-line bg-paper p-4 w-full min-w-0">
              <div className="w-full min-w-0">
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
                  className="w-full min-w-0 rounded-xl border border-line bg-canvas px-3 py-1.5 text-xs text-ink"
                />
              </div>
              <div className="w-full min-w-0">
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
                  className="w-full min-w-0 rounded-xl border border-line bg-canvas px-3 py-1.5 text-xs text-ink"
                />
              </div>
            </div>
          </div>

          {/* Right Column (5 cols): WIP Uploader, Artwork Vault & Live Chat */}
          <div className="space-y-4 lg:col-span-5 w-full min-w-0">
            {/* Upload WIP Card */}
            <div className="space-y-3 rounded-3xl border border-line bg-paper p-4 sm:p-5 shadow-xs w-full min-w-0">
              <div className="flex items-start justify-between gap-2 border-b border-line/60 pb-3">
                <div className="min-w-0">
                  <h4 className="font-display text-base font-bold text-ink">Upload WIP or Final Master</h4>
                  <p className="text-[11px] text-ink-mute">Auto-stamped with watermark shield</p>
                </div>
                <span className="text-[11px] font-medium text-ink-mute shrink-0">{selectedOrder.wips.length} in vault</span>
              </div>

              {/* Quick Pipeline Milestone Presets */}
              <div>
                <span className="text-[10px] font-semibold text-ink-mute uppercase tracking-wide">
                  Milestone Presets:
                </span>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {[
                    { label: 'Sketch', icon: <Pencil className="size-3 text-coral" />, defaultTitle: 'WIP #1 · Rough Composition Sketch', stage: 'sketch_approval' as const, progress: 62, isFinal: false },
                    { label: 'Lineart', icon: <PenTool className="size-3 text-indigo-500" />, defaultTitle: 'WIP #2 · Clean Lineart Pass', stage: 'lineart_coloring' as const, progress: 75, isFinal: false },
                    { label: 'Flat Colors', icon: <Palette className="size-3 text-teal" />, defaultTitle: 'WIP #3 · Flat Base Colors', stage: 'lineart_coloring' as const, progress: 85, isFinal: false },
                    { label: 'Shading', icon: <SunMedium className="size-3 text-mustard" />, defaultTitle: 'WIP #4 · Shading & Lighting', stage: 'lineart_coloring' as const, progress: 92, isFinal: false },
                    { label: 'Retouches', icon: <Brush className="size-3 text-peach" />, defaultTitle: 'WIP #5 · Final Polish & Retouches', stage: 'lineart_coloring' as const, progress: 96, isFinal: false },
                    { label: 'Final Master', icon: <Crown className="size-3 text-mustard" />, defaultTitle: 'Final Master · High Resolution 300 DPI', stage: 'completed' as const, progress: 100, isFinal: true },
                  ].map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => handleApplyPreset(p)}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors',
                        wipTitle === p.defaultTitle
                          ? 'border-ink bg-ink text-white'
                          : 'border-line bg-canvas text-ink-soft hover:bg-cream hover:text-ink',
                      )}
                    >
                      {p.icon}
                      <span>{p.label}</span>
                    </button>
                  ))}
                </div>
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

              {pendingWipFile && (
                <div className="flex items-center justify-between rounded-xl border border-line bg-canvas p-2.5 text-xs">
                  <div className="flex items-center gap-2 truncate">
                    {pendingWipPreviewUrl && (
                      <img
                        src={pendingWipPreviewUrl}
                        alt=""
                        className="size-8 rounded-lg object-cover border border-line"
                      />
                    )}
                    <div className="truncate">
                      <p className="truncate font-semibold text-ink">{pendingWipFile.name}</p>
                      <p className="text-[10px] text-ink-mute">
                        {(pendingWipFile.size / (1024 * 1024)).toFixed(2)} MB · Pending confirmation
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsConfirmModalOpen(true)}
                    className="font-semibold text-teal hover:underline text-xs shrink-0 ml-2"
                  >
                    Review & Confirm →
                  </button>
                </div>
              )}

              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => wipFileRef.current?.click()}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-ink py-3 text-xs font-semibold text-white transition hover:bg-coral shadow-xs"
                >
                  <ImagePlus className="size-4 text-mustard" />
                  {pendingWipFile ? 'Choose Different File...' : 'Choose Artwork File to Upload...'}
                </button>
              </div>

              {/* Uploaded WIP Artwork History Reel */}
              {selectedOrder.wips.length > 0 && (
                <div className="pt-2 border-t border-line/60">
                  <div className="mb-2 flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-ink">
                      Artwork Vault Passes ({selectedOrder.wips.length}):
                    </span>
                    <span className="text-ink-mute">Live in client room</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {selectedOrder.wips.map((w, idx) => {
                      const preview = w.imageUrl || (w.slug ? artSrc(w.slug, 'sm') : '');
                      return (
                        <div
                          key={w.id || idx}
                          className={cn(
                            'group relative flex flex-col overflow-hidden rounded-xl border text-left transition',
                            w.revisionRequested
                              ? 'border-coral/60 bg-coral-soft/20 ring-1 ring-coral/40'
                              : 'border-line bg-canvas',
                          )}
                        >
                          <div className="relative aspect-video w-full overflow-hidden bg-cream">
                            {preview ? (
                              <img
                                src={preview}
                                alt={w.title}
                                className="h-full w-full object-cover transition-transform group-hover:scale-105"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-xs text-ink-mute">
                                No Preview
                              </div>
                            )}
                            {w.isFinal && (
                              <span className="absolute top-1 right-1 rounded-md bg-mustard px-1.5 py-0.5 text-[9px] font-bold text-ink shadow-2xs">
                                FINAL
                              </span>
                            )}
                            {w.revisionRequested && (
                              <span className="absolute top-1 left-1 rounded-md bg-coral px-1.5 py-0.5 text-[9px] font-bold text-white shadow-2xs flex items-center gap-1">
                                <RotateCcw className="size-2.5 stroke-[2.5]" />
                                REVISION
                              </span>
                            )}
                          </div>
                          <div className="p-1.5">
                            <p className="truncate text-[10px] font-semibold text-ink" title={w.title}>
                              {w.title}
                            </p>
                            <span
                              className={cn(
                                'mt-0.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-semibold',
                                w.revisionRequested
                                  ? 'bg-coral-soft text-coral border border-coral/30'
                                  : w.approvedByClient
                                    ? 'bg-teal-soft text-teal'
                                    : 'bg-cream text-ink-mute',
                              )}
                              title={w.revisionNotes ? `${w.revisionCategory || 'Revision'}: ${w.revisionNotes}` : undefined}
                            >
                              {w.revisionRequested ? (
                                <>
                                  <RotateCcw className="size-2.5 stroke-[2.5]" />
                                  <span>Revision Requested{w.revisionScale ? ` (${w.revisionScale})` : ''}</span>
                                </>
                              ) : w.approvedByClient ? (
                                <>
                                  <Check className="size-2.5" strokeWidth={3} />
                                  <span>Client Confirmed</span>
                                </>
                              ) : (
                                <span>Pending Review</span>
                              )}
                            </span>
                            {w.revisionRequested && w.revisionNotes && (
                              <p
                                className="mt-1 line-clamp-2 rounded bg-coral-soft/50 px-1 py-0.5 text-[9px] text-coral leading-tight"
                                title={w.revisionNotes}
                              >
                                <strong>{w.revisionCategory || 'Feedback'}:</strong> {w.revisionNotes}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Quick Client Message / Live Chat Box */}
            <div className="space-y-3 rounded-3xl border border-line bg-paper p-4 sm:p-5 shadow-xs w-full min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h4 className="font-display text-base font-bold text-ink">Live Client Chat</h4>
                  <p className="text-[11px] text-ink-mute truncate">
                    Conversation with {selectedOrder.clientContact || 'Client'} ({selectedOrder.messages.length} messages)
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsChatOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-cream px-3 py-1 text-xs font-semibold text-ink transition hover:bg-ink hover:text-white shrink-0"
                >
                  <MessageSquare className="size-3.5 text-coral" />
                  <span>Open Drawer</span>
                </button>
              </div>

              <form onSubmit={handleSendArtistMessage} className="flex items-center gap-2 w-full min-w-0">
                <input
                  type="text"
                  value={artistReply}
                  onChange={(e) => setArtistReply(e.target.value)}
                  placeholder="Send a live update to client..."
                  className="min-w-0 flex-1 rounded-full border border-line bg-canvas px-3.5 py-2 text-xs text-ink focus:border-ink focus:outline-none"
                />
                <button
                  type="submit"
                  aria-label="Send artist message"
                  className="grid size-9 shrink-0 place-items-center rounded-full bg-ink text-white transition hover:bg-coral"
                >
                  <Send className="size-3.5" />
                </button>
              </form>
            </div>

            {/* Primary Order Navigation & Cancel Action */}
            <div className="space-y-2.5 w-full min-w-0">
              <button
                type="button"
                onClick={() => setActiveTab('track')}
                className="group flex w-full items-center justify-between rounded-2xl border border-line bg-paper px-3.5 py-3 sm:px-4 sm:py-3.5 text-xs font-semibold text-ink shadow-xs transition hover:border-ink hover:bg-cream"
              >
                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                  <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-cream text-ink group-hover:bg-ink group-hover:text-white transition">
                    <Eye className="size-4 text-coral" />
                  </span>
                  <div className="min-w-0 flex-1 text-left">
                    <p className="truncate font-semibold text-ink">
                      View #{selectedOrder.orderCode || selectedOrder.id} in Client Tracker Room
                    </p>
                    <p className="truncate text-[10px] text-ink-mute">
                      Inspect client portal, live chat, and downloads
                    </p>
                  </div>
                </div>
                <ArrowRight className="size-4 shrink-0 ml-1.5 text-ink-mute group-hover:text-ink group-hover:translate-x-0.5 transition" />
              </button>

              <button
                type="button"
                onClick={() => onOpenCancelModal?.(selectedOrder)}
                className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-coral/30 bg-coral-soft/40 py-2.5 px-3 text-xs font-semibold text-coral transition hover:bg-coral hover:text-white"
                title="Cancel commission and process refund per studio TOS"
              >
                <XCircle className="size-3.5 shrink-0" />
                <span className="truncate">Cancel Commission (#{selectedOrder.orderCode || selectedOrder.id})</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Bottom-Right Chat Widget for Currently Selected Client */}
      {selectedOrder && (
        <OrderChatWidget
          order={selectedOrder}
          user={user}
          isArtistAdmin={true}
          sendOrderMessage={sendOrderMessage}
          showToast={showToast}
          isOpen={isChatOpen}
          onToggleOpen={() => setIsChatOpen((prev) => !prev)}
        />
      )}

      {/* Admin WIP Upload Confirmation Modal */}
      <WipUploadConfirmModal
        order={selectedOrder}
        isOpen={isConfirmModalOpen}
        file={pendingWipFile}
        previewUrl={pendingWipPreviewUrl}
        isUploading={isUploadingWip}
        title={wipTitle}
        note={wipNote}
        isFinal={wipIsFinal}
        stage={wipStage}
        progress={wipProgress}
        onTitleChange={setWipTitle}
        onNoteChange={setWipNote}
        onIsFinalChange={setWipIsFinal}
        onPresetSelect={handleApplyPreset}
        onClose={handleCloseConfirmModal}
        onChooseDifferentFile={handleChooseDifferentFile}
        onConfirmUpload={handleConfirmUpload}
      />

      {/* Interactive Payment Details Modal */}
      {selectedOrder && (
        <PaymentDetailsModal
          isOpen={isPaymentModalOpen}
          onClose={() => setIsPaymentModalOpen(false)}
          order={selectedOrder}
          usdToPhpRate={studioSettings.usdToPhpRate}
          paymentDetails={studioSettings.paymentDetails}
        />
      )}
    </div>
  );
}
