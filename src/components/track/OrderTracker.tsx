import { motion } from 'framer-motion';
import {
  AlertCircle,
  AlertTriangle,
  Brush,
  Check,
  CheckCircle2,
  Clock,
  Download,
  Edit3,
  Eye,
  FileText,
  ImagePlus,
  Lock,
  MessageSquare,
  Printer,
  Receipt,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Unlock,
  X,
  XCircle,
  CreditCard,
} from 'lucide-react';
import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { STAGE_STEPS } from '@/data/orders';
import { useStudio } from '@/context/StudioContext';
import { ACCENT_CLASSES, TIER_ACCENT, cn, formatMoney, formatShortDate, getTier } from '@/lib/utils';
import { artSrc, ArtImage } from '@/components/portfolio/ArtImage';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { BrandIcon } from '@/components/ui/BrandIcon';
import { EASE, Reveal } from '@/components/ui/Reveal';
import { uploadReceiptFile, uploadChatAttachment, getSignedMediaUrl, STORAGE_BUCKETS } from '@/lib/storage';
import { useCommissionRealtime } from '@/lib/realtime';
import { isAudioNotificationEnabled, setAudioNotificationEnabled, playNotificationSound } from '@/lib/audio';
import { requestNotificationPermission } from '@/lib/notifications';
import { useUpdateCommissionBriefMutation, useRequestCancellationMutation } from '@/lib/queries';
import { printOrderInvoice } from '@/lib/invoice';
import { OrderChatWidget } from './OrderChatWidget';
import { PaymentDetailsModal } from './dialogs/PaymentDetailsModal';
import { MilestoneSignoffModal } from './dialogs/MilestoneSignoffModal';
import { ClientArtworkAcceptanceModal } from './dialogs/ClientArtworkAcceptanceModal';
import { WipLightboxMarkupModal } from './dialogs/WipLightboxMarkupModal';
import { MasterDeliverableVault } from './MasterDeliverableVault';
import { getRevisionAllowance, type SignoffChecklist } from '@/lib/revisionWorkflow';
import type { SubmittedOrder, WipUploadItem, ClientReview } from '@/types';

/**
 * Phase 4, 6B & 6E: Authenticated Client "Pizza-Tracker" Order Room, Payment Gates & Realtime Chat.
 * Includes:
 * 1. Logged-out state requiring Google sign-in (or ?demo=1 link).
 * 2. Empty state when a logged-in user has 0 orders.
 * 3. Real Supabase commission data with demo isolation.
 * 4. 6-Stage Visual "Pizza-Tracker" Progress Stepper.
 * 5. Watermarked WIP Gallery that unlocks the unwatermarked high-res download ONLY when `stage === 'completed'`.
 * 6. Realtime Order Chat with image attachment support for payment receipts & sketch redlines.
 * 7. Commission Specifications Card with Reference Gallery.
 * 8. Client Actions: Editable brief during pending_review, Revision/Redline requester, Tiered Cancellation, and Printable Invoice.
 */
export function OrderTracker() {
  const {
    submittedOrders,
    activeOrderId,
    setActiveOrderId,
    uploadPaymentReceipt,
    signoffMilestone,
    requestWipRevision,
    completeOrderWithReview,
    sendOrderMessage,
    openDrawer,
    showToast,
    user,
    isLoadingOrders,
    signInWithGoogle,
    isArtistAdmin,
    setActiveTab,
    studioSettings,
  } = useStudio();

  const receiptInputRef = useRef<HTMLInputElement | null>(null);
  const revisionFileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingReceiptType, setPendingReceiptType] = useState<'deposit' | 'final'>('deposit');
  const [downloadingWipId, setDownloadingWipId] = useState<string | null>(null);
  const [soundActive, setSoundActive] = useState(() => isAudioNotificationEnabled());
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

  // Formal Milestone Sign-off Gate State
  const [signoffWip, setSignoffWip] = useState<WipUploadItem | null>(null);
  const [isSignoffModalOpen, setIsSignoffModalOpen] = useState(false);
  const [afterSignoffOpenPayment, setAfterSignoffOpenPayment] = useState(false);

  // Phase 6E: Interactive Client Modals
  const [isEditBriefOpen, setIsEditBriefOpen] = useState(false);
  const [editBriefData, setEditBriefData] = useState({
    characterName: '',
    poseAndVibe: '',
    backgroundNotes: '',
  });

  const [revisionWip, setRevisionWip] = useState<WipUploadItem | null>(null);
  const [revisionCategory, setRevisionCategory] = useState('Pose & Gesture');
  const [revisionNotes, setRevisionNotes] = useState('');
  const [revisionScale, setRevisionScale] = useState<'minor' | 'major'>('minor');
  const [revisionRedlineFile, setRevisionRedlineFile] = useState<File | null>(null);
  const [isSendingRevision, setIsSendingRevision] = useState(false);
  const [lightboxWip, setLightboxWip] = useState<WipUploadItem | null>(null);

  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);

  const updateBriefMutation = useUpdateCommissionBriefMutation();
  const requestCancellationMutation = useRequestCancellationMutation();

  const order = useMemo(
    () => submittedOrders.find((o) => o.id === activeOrderId) ?? submittedOrders[0],
    [submittedOrders, activeOrderId],
  );

  const revisionAllowance = useMemo(() => {
    if (!order) {
      return {
        usedCount: 0,
        maxAllowed: 2,
        remainingCount: 2,
        isExhausted: false,
        canRequestFree: true,
        isSketchPhase: false,
        isUnlimitedFree: false,
        minorFixesCount: 0,
        majorRevisionsCount: 0,
      };
    }
    return getRevisionAllowance(order);
  }, [order]);

  const handleConfirmMilestoneSignoff = async (
    checklist: SignoffChecklist,
    signerName: string,
  ) => {
    if (!order) return;
    await signoffMilestone(order.id, signoffWip?.id, checklist, signerName);
    setIsSignoffModalOpen(false);
    setSignoffWip(null);
    if (afterSignoffOpenPayment) {
      setAfterSignoffOpenPayment(false);
      setIsPaymentModalOpen(true);
    }
  };

  // Phase 8: Final Artwork Acceptance & Tipping Gate
  const [isAcceptanceModalOpen, setIsAcceptanceModalOpen] = useState(false);

  const handleConfirmFinalAcceptance = async (
    tipAmountUsd: number,
    thankYouMessage: string,
    review?: ClientReview,
  ) => {
    if (!order) return;
    await completeOrderWithReview(order.id, tipAmountUsd, thankYouMessage, review);
  };

  const [isChatOpen, setIsChatOpen] = useState(false);
  const [orderFilter, setOrderFilter] = useState<'all' | 'active' | 'past'>('all');

  const activeOrders = useMemo(
    () => submittedOrders.filter((o) => o.stage !== 'completed' && o.stage !== 'declined' && o.stage !== 'cancelled'),
    [submittedOrders],
  );
  const pastOrders = useMemo(
    () => submittedOrders.filter((o) => o.stage === 'completed' || o.stage === 'declined' || o.stage === 'cancelled'),
    [submittedOrders],
  );
  const displayedOrders = useMemo(() => {
    if (orderFilter === 'active') return activeOrders;
    if (orderFilter === 'past') return pastOrders;
    return submittedOrders;
  }, [orderFilter, activeOrders, pastOrders, submittedOrders]);

  // Phase 6D: Realtime WebSocket Subscription for active commission
  useCommissionRealtime(order?.id, user?.id);

  const handleToggleSound = () => {
    const next = !soundActive;
    setSoundActive(next);
    setAudioNotificationEnabled(next);
    if (next) playNotificationSound('message');
    showToast(next ? 'Sound notifications enabled' : 'Sound notifications muted');
  };

  const handleRequestDesktopNotifications = async () => {
    const perm = await requestNotificationPermission();
    if (perm === 'granted') {
      showToast('Desktop notifications enabled for Meru Art Studio!');
      playNotificationSound('success');
    } else {
      showToast('Desktop notifications were not enabled (permission denied).');
    }
  };

  // 1. Loading State
  if (isLoadingOrders) {
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
  if (!user) {
    return <LoggedOutTrackView onSignIn={signInWithGoogle} />;
  }

  // 3. Logged-in but zero orders submitted yet
  if (user && submittedOrders.length === 0) {
    return <EmptyTrackView onOpenDrawer={() => openDrawer({ step: 1 })} />;
  }

  if (!order) return null;

  const tier = getTier(order.tier);
  const accent = ACCENT_CLASSES[TIER_ACCENT[order.tier]];
  const currentStepIdx = STAGE_STEPS.findIndex((s) => s.id === order.stage);
  const currentStep = STAGE_STEPS[currentStepIdx] ?? STAGE_STEPS[0];
  const remainingUsd = Math.max(0, order.totalUsd - order.depositUsd);
  const isCompleted = order.stage === 'completed';
  const orderDisplayCode = order.orderCode || order.id.slice(0, 8).toUpperCase();

  const triggerReceiptUpload = (kind: 'deposit' | 'final') => {
    setPendingReceiptType(kind);
    receiptInputRef.current?.click();
  };

  const handleReceiptFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    showToast('Uploading payment receipt to secure vault...');
    const { path, error } = await uploadReceiptFile(user.id, order.id, file);
    if (error || !path) {
      showToast(`Upload failed: ${error ?? 'Unknown error'}`);
    } else {
      uploadPaymentReceipt(order.id, pendingReceiptType, path);
    }
    e.target.value = '';
  };

  const handleDownloadMaster = async (wip: WipUploadItem) => {
    if (wip.slug) {
      window.open(artSrc(wip.slug, 'full'), '_blank');
      return;
    }
    const masterPath = wip.highResUrl;
    if (!masterPath) {
      showToast('Master deliverable path not found.');
      return;
    }
    setDownloadingWipId(wip.id);
    showToast('Authorizing secure master deliverable download...');
    try {
      const signedUrl = await getSignedMediaUrl(STORAGE_BUCKETS.wips, masterPath, 300);
      if (!signedUrl) {
        showToast('Download unauthorized: full-res master deliverable is only unlocked once completed.');
        return;
      }
      const anchor = document.createElement('a');
      anchor.href = signedUrl;
      anchor.download = `${orderDisplayCode}-${order.tier}-master.png`;
      anchor.target = '_blank';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      showToast('Download started!');
    } catch (err: any) {
      showToast(`Download failed: ${err?.message ?? 'Unauthorized'}`);
    } finally {
      setDownloadingWipId(null);
    }
  };

  // Phase 6E: Brief Edit Handler
  const openEditBriefModal = () => {
    setEditBriefData({
      characterName: order.characterName || '',
      poseAndVibe: order.poseAndVibe || '',
      backgroundNotes: order.backgroundNotes || '',
    });
    setIsEditBriefOpen(true);
  };

  const handleSaveBrief = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      const res = await updateBriefMutation.mutateAsync({
        commissionId: order.id,
        patch: editBriefData,
      });
      if (res.error) {
        showToast(`Update failed: ${res.error}`);
      } else {
        showToast('Brief details updated successfully!');
        setIsEditBriefOpen(false);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error updating brief';
      showToast(msg);
    }
  };

  // Phase 6E: Revision Request Handler
  const handleOpenRevisionModal = (wip: WipUploadItem) => {
    setRevisionWip(wip);
    setRevisionCategory('Pose & Gesture');
    setRevisionNotes('');
    setRevisionScale('minor');
    setRevisionRedlineFile(null);
  };

  const handleSubmitRevision = async (e: FormEvent) => {
    e.preventDefault();
    if (!order || !revisionWip || !revisionNotes.trim()) return;

    setIsSendingRevision(true);
    let redlinePath: string | undefined = undefined;

    try {
      if (revisionRedlineFile && user) {
        showToast('Uploading redline sketch...');
        const { path, error } = await uploadChatAttachment(user.id, order.id, revisionRedlineFile);
        if (!error && path) {
          redlinePath = path;
        }
      }

      await requestWipRevision(order.id, revisionWip.id, {
        category: revisionCategory,
        notes: revisionNotes.trim(),
        scale: revisionAllowance.isSketchPhase ? 'minor' : revisionScale,
        attachmentUrl: redlinePath,
      });

      setRevisionWip(null);
    } catch (err: any) {
      showToast(`Failed to send revision: ${err?.message ?? 'Error'}`);
    } finally {
      setIsSendingRevision(false);
    }
  };

  // Phase 6E: Cancellation Handler
  const handleSubmitCancellation = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (cancelReason.trim().length < 15) {
      showToast('Please provide a valid, descriptive reason (at least 15 characters) for cancellation.');
      return;
    }
    setIsCancelling(true);

    try {
      const res = await requestCancellationMutation.mutateAsync({
        commissionId: order.id,
        reason: cancelReason,
      });

      if (res.error) {
        showToast(`Request failed: ${res.error}`);
      } else {
        showToast('Cancellation request submitted to Meru! If approved, eligible refunds are processed within 3–5 business days.');
        setIsCancelModalOpen(false);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error requesting cancellation';
      showToast(msg);
    } finally {
      setIsCancelling(false);
    }
  };

  const refundDetails = getRefundTierInfo(
    order.stage,
    order.totalUsd,
    order.depositUsd,
    order.depositPaid,
    order.finalPaid,
  );

  const cancellationStatus = useMemo(() => getActiveCancellationRequest(order), [order]);

  return (
    <section className="pt-32 pb-8 sm:pt-32 sm:pb-12">
      {/* Hidden file input for Receipt Gate */}
      <input
        ref={receiptInputRef}
        type="file"
        accept="image/*"
        onChange={handleReceiptFile}
        className="hidden"
      />

      {/* Admin Preview Mode Banner */}
      {isArtistAdmin && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-coral/30 bg-coral-soft/90 px-4 py-3 text-xs shadow-xs">
          <div className="flex items-center gap-2 text-ink">
            <span className="rounded-full bg-coral px-2.5 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider">
              Admin Preview
            </span>
            <span className="font-medium">
              You are inspecting the Client Tracker Room for <strong>#{orderDisplayCode}</strong> ({order.clientContact || 'Client'}).
            </span>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('admin')}
            className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-coral"
          >
            <span>← Return to Admin Pipeline</span>
          </button>
        </div>
      )}

      {/* Header + Order Switcher + Recruiter Stage Simulator */}
      <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <SectionHeading
            eyebrow="Client Workspace"
            title="Live commission tracker & order room"
            subtitle="Follow your artwork from initial brief to high-resolution download, upload payment receipts, and chat with Meru in real time."
          />
        </div>

        {/* Order Selector + New Request CTA */}
        <div className="mb-6 flex flex-col gap-2.5 sm:items-end">
          {submittedOrders.length > 1 && (
            <div className="inline-flex rounded-full border border-line bg-canvas p-1 text-xs">
              <button
                type="button"
                onClick={() => setOrderFilter('all')}
                className={cn(
                  'rounded-full px-3 py-1 font-medium transition',
                  orderFilter === 'all' ? 'bg-ink text-white shadow-xs' : 'text-ink-mute hover:text-ink',
                )}
              >
                All ({submittedOrders.length})
              </button>
              <button
                type="button"
                onClick={() => setOrderFilter('active')}
                className={cn(
                  'rounded-full px-3 py-1 font-medium transition',
                  orderFilter === 'active' ? 'bg-ink text-white shadow-xs' : 'text-ink-mute hover:text-ink',
                )}
              >
                Active ({activeOrders.length})
              </button>
              <button
                type="button"
                onClick={() => setOrderFilter('past')}
                className={cn(
                  'rounded-full px-3 py-1 font-medium transition',
                  orderFilter === 'past' ? 'bg-ink text-white shadow-xs' : 'text-ink-mute hover:text-ink',
                )}
              >
                Past & Delivered ({pastOrders.length})
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {displayedOrders.map((o) => {
              const active = o.id === order.id;
              const code = o.orderCode || o.id.slice(0, 8).toUpperCase();
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setActiveOrderId(o.id)}
                  className={cn(
                    'flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all',
                    active
                      ? 'bg-ink text-white shadow-xs'
                      : 'border border-line bg-paper text-ink-soft hover:border-ink/30 hover:text-ink',
                  )}
                >
                  <span
                    className={cn(
                      'size-2 rounded-full',
                      o.stage === 'completed'
                        ? 'bg-teal'
                        : o.stage === 'declined' || o.stage === 'cancelled'
                          ? 'bg-ink-mute'
                          : o.stage === 'awaiting_deposit' || o.stage === 'sketch_approval'
                            ? 'bg-coral'
                            : 'bg-mustard',
                    )}
                  />
                  <span>#{code} · {getTier(o.tier).label}</span>
                  {o.characterName && (
                    <span className="opacity-70 max-w-[85px] truncate">({o.characterName})</span>
                  )}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => openDrawer({ step: 1 })}
              className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-ink/35 bg-canvas px-3.5 py-1.5 text-xs font-medium text-ink transition hover:border-ink hover:bg-cream"
            >
              <Sparkles className="size-3.5 text-coral" /> + New Quote
            </button>
          </div>
        </div>
      </div>

      {/* 1. TOP ACTION BANNER */}
      <Reveal delay={0.05}>
        <TopActionBanner
          order={order}
          remainingUsd={remainingUsd}
          onUploadDeposit={() => triggerReceiptUpload('deposit')}
          onApproveSketchAndPay={() => {
            const sketchWip = order.wips.find((w) => w.stage === 'sketch_approval') ?? order.wips[0] ?? null;
            setSignoffWip(sketchWip);
            setAfterSignoffOpenPayment(true);
            setIsSignoffModalOpen(true);
          }}
          onApproveSketchOnly={() => {
            const sketchWip = order.wips.find((w) => w.stage === 'sketch_approval') ?? order.wips[0] ?? null;
            setSignoffWip(sketchWip);
            setAfterSignoffOpenPayment(false);
            setIsSignoffModalOpen(true);
          }}
          onCompleteOrder={() => {
            setIsAcceptanceModalOpen(true);
          }}
          onOpenDrawer={() => openDrawer({ step: 1 })}
          onOpenPaymentModal={() => setIsPaymentModalOpen(true)}
          refundDetails={refundDetails}
        />
      </Reveal>

      {/* 2. VISUAL "PIZZA-TRACKER" PROGRESS STEPPER */}
      <Reveal delay={0.1} className="card mt-5 p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${accent.soft} ${accent.text}`}>
              <span className={`size-1.5 rounded-full ${accent.dot}`} />
              Order #{orderDisplayCode} · {tier.label}
            </span>
            <h3 className="font-display text-xl font-semibold text-ink sm:text-2xl">
              {order.stage === 'declined'
                ? 'Commission Declined'
                : order.stage === 'cancelled'
                  ? 'Commission Cancelled'
                  : currentStep.fullLabel}
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="text-ink-mute">
              Total: <strong className="text-ink">{formatMoney(order.totalUsd, order.currency)}</strong>
            </span>
            <span className="text-ink-mute">
              Deposit: <strong className="text-ink">{formatMoney(order.depositUsd, order.currency)}</strong>
            </span>
            <span className="text-ink-mute">
              Target: <strong className="text-ink">{order.estEndDate ? formatShortDate(order.estEndDate) : 'TBD'}</strong>
            </span>

            {/* Quick Actions: Invoice, Payment Details & Cancellation */}
            <div className="flex items-center gap-1.5 pl-2">
              <button
                type="button"
                onClick={() => setIsPaymentModalOpen(true)}
                className="inline-flex items-center gap-1 rounded-full border border-line bg-paper px-2.5 py-1 text-xs font-medium text-ink transition hover:border-ink/40 hover:bg-cream"
                title="View PayPal, GCash QR, and Bank transfer details"
              >
                <CreditCard className="size-3 text-coral" /> Payment Details
              </button>

              <button
                type="button"
                onClick={() =>
                  printOrderInvoice(order, {
                    paymentDetails: studioSettings.paymentDetails,
                    usdToPhpRate: studioSettings.usdToPhpRate,
                  })
                }
                className="inline-flex items-center gap-1 rounded-full border border-line bg-paper px-2.5 py-1 text-xs font-medium text-ink transition hover:border-ink/40 hover:bg-cream"
                title="Download or print commission receipt"
              >
                <Printer className="size-3 text-coral" /> Invoice
              </button>

              {order.stage !== 'completed' && order.stage !== 'declined' && order.stage !== 'cancelled' && (
                cancellationStatus.hasRequest ? (
                  <span
                    className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800"
                    title="Cancellation request submitted and awaiting confirmation from Meru"
                  >
                    <Clock className="size-3 text-amber-600" /> Cancellation Under Review
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setCancelReason('');
                      setIsCancelModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1 rounded-full border border-line bg-paper px-2.5 py-1 text-xs font-medium text-ink-mute transition hover:border-coral/40 hover:text-coral"
                    title="Request formal cancellation under studio TOS"
                  >
                    <XCircle className="size-3" /> Cancel
                  </button>
                )
              )}
            </div>
          </div>
        </div>

        {/* Pending Cancellation Review Banner */}
        {cancellationStatus.hasRequest && (
          <div className="mb-6 rounded-3xl border border-amber-300 bg-amber-50/80 p-4 sm:p-5 text-amber-950 shadow-2xs">
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-800">
                <Clock className="size-5" />
              </span>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-bold tracking-wider uppercase text-amber-800">
                    Cancellation & Refund Request Under Review
                  </span>
                  <span className="rounded-full bg-amber-200/80 px-2.5 py-0.5 text-[10px] font-semibold text-amber-900">
                    Awaiting Meru's Confirmation
                  </span>
                </div>
                <p className="mt-1 text-xs text-amber-900">
                  Reason provided: <span className="font-medium italic">"{cancellationStatus.reason}"</span>
                </p>
                <div className="mt-2.5 rounded-2xl border border-amber-200 bg-white/80 p-3 text-xs text-ink-soft space-y-1">
                  <div className="flex items-center justify-between font-medium text-ink">
                    <span>Applicable Refund Tier:</span>
                    <span className="font-bold text-coral">
                      {refundDetails.percentage} ({formatMoney(refundDetails.refundAmount, order.currency)})
                    </span>
                  </div>
                  <p className="text-[11px] text-ink-mute">
                    Meru will review your cancellation reason. If approved, your eligible refund is processed back to your payment account within <strong className="text-ink">3–5 business days</strong>.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Cancellation Declined Notice */}
        {cancellationStatus.status === 'declined' && (
          <div className="mb-6 rounded-3xl border border-line bg-cream/70 p-4 sm:p-5 text-ink shadow-2xs">
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-paper text-ink-soft">
                <AlertTriangle className="size-5" />
              </span>
              <div className="flex-1 text-xs">
                <p className="font-semibold text-ink">
                  Cancellation Request Notice:
                </p>
                <p className="mt-0.5 text-ink-soft">
                  Meru reviewed your cancellation request and was unable to approve cancellation at this stage: <span className="italic font-medium">"{cancellationStatus.declineReason}"</span>. Your order remains active in studio production.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Progress bar line */}
        <div className="relative mb-6 h-2 w-full overflow-hidden rounded-full bg-cream">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${order.stage === 'declined' ? 0 : order.progress}%` }}
            transition={{ duration: 0.6, ease: EASE }}
            className={cn('h-full rounded-full', order.stage === 'declined' || order.stage === 'cancelled' ? 'bg-ink-mute' : accent.bar)}
          />
        </div>

        {/* 6 Step Cards or Terminal State Banner */}
        {order.stage === 'declined' || order.stage === 'cancelled' ? (
          <div
            className={cn(
              'rounded-2xl border p-4 text-xs leading-relaxed',
              order.stage === 'declined'
                ? 'border-coral/30 bg-coral-soft/50 text-coral'
                : 'border-line bg-canvas text-ink-soft',
            )}
          >
            <p className="font-semibold text-ink">
              {order.stage === 'declined'
                ? 'This brief was declined during review. Slots were not deducted and no charges remain.'
                : `This order was formally cancelled under studio TOS. Policy applied: ${refundDetails.tierName} (${refundDetails.percentage}).`}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {STAGE_STEPS.map((step, idx) => {
              const isPassed = idx < currentStepIdx;
              const isCurrent = idx === currentStepIdx;
              return (
                <div
                  key={step.id}
                  className={cn(
                    'flex flex-col justify-between rounded-2xl border p-3 text-left transition-all',
                    isCurrent
                      ? 'border-ink bg-paper shadow-xs ring-1 ring-ink/20'
                      : isPassed
                        ? 'border-line bg-paper/60 text-ink'
                        : 'border-transparent bg-cream/50 text-ink-mute',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        'grid size-5 place-items-center rounded-full text-xs font-bold',
                        isPassed
                          ? 'bg-ink text-white'
                          : isCurrent
                            ? 'bg-coral text-white'
                            : 'bg-paper text-ink-mute',
                      )}
                    >
                      {isPassed ? <Check className="size-3" /> : idx + 1}
                    </span>
                    {isCurrent && (
                      <span className="rounded-full bg-coral-soft px-2 py-0.5 text-xs font-semibold text-coral">
                        Current
                      </span>
                    )}
                  </div>
                  <p className="mt-2 font-display text-sm leading-tight font-semibold text-ink">
                    {step.shortLabel}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </Reveal>

      {/* Phase 6E: COMMISSION BRIEF & SPECIFICATIONS CARD */}
      <Reveal delay={0.12} className="card mt-5 p-4 sm:p-6">
        <div className="flex flex-col justify-between gap-3 border-b border-line pb-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-2xl bg-cream text-coral">
              <FileText className="size-4" />
            </span>
            <div>
              <h4 className="font-display text-lg font-semibold text-ink">
                Commission Brief & Scope Details
              </h4>
              <p className="text-xs text-ink-soft">
                Specifications submitted with this commission
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {order.stage === 'pending_review' ? (
              <button
                type="button"
                onClick={openEditBriefModal}
                className="inline-flex items-center gap-1.5 rounded-full border border-ink/30 bg-paper px-3.5 py-1.5 text-xs font-medium text-ink transition hover:border-ink hover:bg-cream"
              >
                <Edit3 className="size-3.5 text-coral" /> Edit Brief Details
              </button>
            ) : (
              <span className="rounded-full bg-cream px-3 py-1 text-xs font-medium text-ink-mute">
                Brief Locked (Production Active)
              </span>
            )}
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border border-line bg-canvas p-3.5">
            <span className="text-xs font-medium text-ink-mute uppercase tracking-wider">Character Info</span>
            <p className="mt-1 text-sm font-semibold text-ink">
              {order.characterName || 'Not specified'} · {order.characterCount} Character(s)
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              {order.addons.nsfw && (
                <span className="rounded-full bg-coral-soft px-2 py-0.5 text-xs font-medium text-coral">
                  NSFW (+50%)
                </span>
              )}
              {order.addons.softFurry && (
                <span className="rounded-full bg-mustard-soft px-2 py-0.5 text-xs font-medium text-[#b9800f]">
                  Soft Furry (+50%)
                </span>
              )}
              {order.addons.commercial && (
                <span className="rounded-full bg-teal-soft px-2 py-0.5 text-xs font-medium text-teal">
                  Commercial (+200%)
                </span>
              )}
              {!order.addons.nsfw && !order.addons.softFurry && !order.addons.commercial && (
                <span className="text-xs text-ink-mute">Standard scope (no add-ons)</span>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-line bg-canvas p-3.5">
            <span className="text-xs font-medium text-ink-mute uppercase tracking-wider">Pose, Vibe & Mood</span>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft whitespace-pre-line">
              {order.poseAndVibe || 'No specific pose notes provided.'}
            </p>
          </div>

          <div className="rounded-xl border border-line bg-canvas p-3.5 sm:col-span-2 lg:col-span-1">
            <span className="text-xs font-medium text-ink-mute uppercase tracking-wider">Background & Lighting</span>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft whitespace-pre-line">
              {order.backgroundNotes || 'Simple / studio default.'}
            </p>
          </div>
        </div>

        {/* References display if attached */}
        {order.references && order.references.length > 0 && (
          <div className="mt-4 border-t border-line/60 pt-3">
            <span className="text-xs font-medium text-ink-mute uppercase tracking-wider">
              Client Reference Attachments ({order.references.length})
            </span>
            <div className="mt-2 flex flex-wrap gap-2">
              {order.references.map((ref, idx) => (
                <a
                  key={ref.id || idx}
                  href={ref.previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-xl border border-line bg-paper px-3 py-1.5 text-xs text-ink hover:border-ink/40"
                >
                  <Eye className="size-3 text-coral" />
                  <span className="max-w-[150px] truncate">{ref.name}</span>
                </a>
              ))}
            </div>
          </div>
        )}
      </Reveal>

      {/* 3. WORKSPACE: WATERMARKED WIP VAULT & HIGH-RES MASTER UNLOCK */}
      <div id="artwork-vault" className="mt-6">
        <Reveal delay={0.15} className="space-y-4">
          {isCompleted ? (
            <MasterDeliverableVault
              order={order}
              onOpenReceipt={() => printOrderInvoice(order)}
              onOpenTipModal={() => setIsAcceptanceModalOpen(true)}
              showToast={showToast}
              onInspectImage={() => {
                const finalWip = order.wips.find((w) => w.isFinal) || order.wips[order.wips.length - 1];
                if (finalWip) setLightboxWip(finalWip);
              }}
            />
          ) : (
            <div className="card p-4 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold tracking-wider text-coral uppercase">
                  {isCompleted ? 'Unwatermarked Master Unlocked' : 'Scam-Protected WIP Vault'}
                </p>
                <h3 className="font-display text-2xl font-semibold text-ink">
                  WIP Progress & Final Delivery
                </h3>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium',
                    isCompleted ? 'bg-teal-soft text-teal' : 'bg-mustard-soft text-[#b9800f]',
                  )}
                >
                  {isCompleted ? (
                    <>
                      <Unlock className="size-3.5" /> High-Res Unlocked
                    </>
                  ) : (
                    <>
                      <Lock className="size-3.5" /> Watermarked until Completed
                    </>
                  )}
                </span>

                <button
                  type="button"
                  onClick={() => setIsChatOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-3 py-1 text-xs font-semibold text-ink transition hover:border-coral hover:bg-cream"
                >
                  <MessageSquare className="size-3.5 text-coral" />
                  Live Chat ({order.messages.length})
                </button>
              </div>
            </div>

            {/* Formal Revision Rounds Tracker Bar */}
            {order.stage !== 'pending_review' && order.stage !== 'awaiting_deposit' && (
              <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-line bg-canvas p-3.5 text-xs shadow-2xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-paper border border-line text-coral shadow-2xs">
                    <RotateCcw className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink">
                        Revision Allowance: {revisionAllowance.usedCount} of {revisionAllowance.maxAllowed} Rounds Used
                      </span>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[10px] font-bold',
                          revisionAllowance.isExhausted
                            ? 'bg-coral text-white'
                            : 'bg-teal-soft text-teal',
                        )}
                      >
                        {revisionAllowance.isExhausted
                          ? 'Allowance Exhausted'
                          : `${revisionAllowance.remainingCount} Free Left`}
                      </span>
                    </div>
                    <p className="text-[11px] text-ink-mute truncate">
                      {revisionAllowance.canRequestFree
                        ? 'Minor pose, anatomy, and styling tweaks are included during the Sketch stage.'
                        : 'Additional revisions beyond included rounds require artist agreement and extra fees.'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                  {Array.from({ length: revisionAllowance.maxAllowed }).map((_, i) => (
                    <span
                      key={i}
                      className={cn(
                        'flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold transition-colors',
                        i < revisionAllowance.usedCount
                          ? 'bg-ink text-white'
                          : 'border border-line bg-paper text-ink-soft',
                      )}
                    >
                      {i < revisionAllowance.usedCount && <Check className="size-2.5" strokeWidth={3} />}
                      Round {i + 1}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {order.stage === 'pending_review' || order.stage === 'awaiting_deposit' ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-canvas px-6 py-12 text-center">
                <Clock className="size-8 text-coral" />
                <p className="mt-3 font-display text-xl font-semibold text-ink">
                  WIPs unlock once sketching begins
                </p>
                <p className="mt-1 max-w-sm text-xs text-ink-soft">
                  As soon as your upfront deposit is verified, Meru will post watermarked pose sketches and colour checks right here.
                </p>
              </div>
            ) : order.wips.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-canvas px-6 py-12 text-center">
                <Sparkles className="size-8 text-coral" />
                <p className="mt-3 font-display text-xl font-semibold text-ink">
                  Sketching in Progress
                </p>
                <p className="mt-1 max-w-sm text-xs text-ink-soft">
                  Meru is currently working on your initial draft. WIP files will appear here as soon as they are uploaded.
                </p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {order.wips.map((wip, _idx, arr) => {
                  const lockedFinal = wip.isFinal && !isCompleted;
                  const showWatermark = !isCompleted;
                  const latestWip = arr[arr.length - 1];
                  const isLatestWip = wip.id === latestWip?.id;

                  return (
                    <div
                      key={wip.id}
                      className={cn(
                        'overflow-hidden rounded-2xl border p-3 sm:p-4 transition',
                        isLatestWip
                          ? 'border-indigo-300 bg-canvas ring-1 ring-indigo-200/60 shadow-xs'
                          : wip.revisionRequested
                            ? 'border-coral/40 bg-coral-soft/10'
                            : 'border-line bg-canvas/70 opacity-90',
                      )}
                    >
                      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {isLatestWip ? (
                              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 border border-indigo-200">
                                Latest WIP Sent · Current Pass
                              </span>
                            ) : (
                              <span className="rounded-full bg-cream px-2 py-0.5 text-[10px] font-semibold text-ink-mute">
                                Previous Pass
                              </span>
                            )}
                            {wip.revisionRequested && (
                              <span className="rounded-full bg-coral-soft px-2 py-0.5 text-[10px] font-bold text-coral border border-coral/30 flex items-center gap-1">
                                <RotateCcw className="size-2.5 stroke-[2.5]" />
                                Revision Requested
                              </span>
                            )}
                            {wip.approvedByClient && (
                              <span className="rounded-full bg-teal-soft px-2 py-0.5 text-[10px] font-bold text-teal flex items-center gap-1">
                                <Check className="size-2.5 stroke-[2.5]" />
                                Approved
                              </span>
                            )}
                            <span className="text-xs font-semibold text-ink-mute uppercase tracking-wide">
                              {wip.isFinal ? 'Final Master File' : 'Work In Progress'}
                            </span>
                          </div>
                          <h4 className="font-display text-lg font-semibold text-ink mt-0.5">{wip.title}</h4>
                        </div>
                        <span className="text-xs text-ink-mute">
                          {formatShortDate(wip.createdAt.slice(0, 10))}
                        </span>
                      </div>

                      <div
                        onClick={() => !lockedFinal && setLightboxWip(wip)}
                        className={cn(
                          'relative aspect-4/3 w-full overflow-hidden rounded-xl border border-line bg-paper select-none',
                          !lockedFinal && 'cursor-pointer group',
                        )}
                        title={lockedFinal ? 'Master file locked' : 'Click to inspect full-screen or draw redlines'}
                      >
                        {wip.slug ? (
                          <ArtImage
                            slug={wip.slug}
                            alt={wip.title}
                            size="sm"
                            className={cn(
                              'size-full object-contain transition-all duration-300',
                              lockedFinal && 'blur-xl grayscale opacity-30',
                            )}
                          />
                        ) : wip.imageUrl ? (
                          <img
                            src={wip.imageUrl}
                            alt={wip.title}
                            className={cn(
                              'size-full object-contain transition-all duration-300',
                              lockedFinal && 'blur-xl grayscale opacity-30',
                            )}
                          />
                        ) : null}

                        {/* Hover badge to inspect & draw redline */}
                        {!lockedFinal && (
                          <div className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 rounded-full bg-ink/80 backdrop-blur-xs px-2.5 py-1 text-[11px] font-bold text-white shadow-xs">
                            <Brush className="size-3 text-coral" />
                            <span>Zoom & Redline</span>
                          </div>
                        )}

                        {/* Protective Watermark Overlay */}
                        {showWatermark && !lockedFinal && (
                          <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/10 backdrop-blur-[0.5px]">
                            <div className="rotate-[-22deg] text-center select-none">
                              <p className="font-display text-2xl font-extrabold tracking-widest text-white/50 uppercase drop-shadow-md sm:text-4xl">
                                MERU ART · WIP PREVIEW
                              </p>
                              <p className="text-xs font-bold tracking-widest text-white/60 uppercase drop-shadow-sm">
                                Commission #{orderDisplayCode} · Do Not Repost
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Locked final state overlay */}
                        {lockedFinal && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center bg-paper/85 p-6 text-center backdrop-blur-md">
                            <span className="grid size-12 place-items-center rounded-2xl bg-coral-soft text-coral">
                              <Lock className="size-6" />
                            </span>
                            <h4 className="mt-3 font-display text-xl font-semibold text-ink">
                              High-Res Master File Locked
                            </h4>
                            <p className="mt-1 max-w-xs text-xs text-ink-soft">
                              The full 300 DPI master download unlocks automatically once the final stage is marked completed.
                            </p>
                          </div>
                        )}
                      </div>

                      {wip.artistNote && (
                        <p className="mt-2.5 rounded-xl bg-paper px-3 py-2 text-xs text-ink-soft">
                          <strong className="text-ink">Artist Note:</strong> {wip.artistNote}
                        </p>
                      )}

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        {isCompleted && (wip.highResUrl || wip.slug) ? (
                          <button
                            type="button"
                            disabled={downloadingWipId === wip.id}
                            onClick={() => handleDownloadMaster(wip)}
                            className="inline-flex items-center gap-1.5 rounded-full bg-teal px-4 py-2 text-xs font-medium text-white transition hover:bg-ink disabled:opacity-50"
                          >
                            <Download className="size-3.5" />
                            {downloadingWipId === wip.id ? 'Authorizing download...' : 'Download High-Res PNG (300 DPI)'}
                          </button>
                        ) : (
                          <span className="text-xs text-ink-mute">
                            Protected by Meru Art Studio watermark shield.
                          </span>
                        )}

                        {/* Phase 6E & Phase 8: Multi-Stage WIP Confirmations & Revisions */}
                        {wip.approvedByClient ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-teal/30 bg-teal-soft/80 px-3 py-1 text-xs font-semibold text-teal shadow-2xs">
                            <ShieldCheck className="size-3.5 stroke-[2.5]" /> Formally Signed Off · Locked
                          </span>
                        ) : wip.revisionRequested ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-coral/30 bg-coral-soft/80 px-3 py-1 text-xs font-semibold text-coral shadow-2xs">
                              <RotateCcw className="size-3 text-coral" />
                              Revision Requested{wip.revisionScale ? ` (${wip.revisionScale})` : ''} · Awaiting Artist Update
                            </span>
                            <button
                              type="button"
                              onClick={() => setLightboxWip(wip)}
                              className="inline-flex items-center gap-1 rounded-full border border-line bg-paper px-2.5 py-1 text-[11px] font-medium text-ink-soft hover:text-ink"
                            >
                              <Brush className="size-2.5 text-coral" /> Inspect / Notes
                            </button>
                          </div>
                        ) : isLatestWip && !isCompleted && (order.stage === 'sketch_approval' || order.stage === 'lineart_coloring') ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setLightboxWip(wip)}
                              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-coral hover:text-coral shadow-2xs"
                              title="Open Fullscreen Lightbox & Redline Markup Canvas"
                            >
                              <Brush className="size-3 text-coral" />
                              <span>Zoom & Redline</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleOpenRevisionModal(wip)}
                              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-3 py-1.5 text-xs font-medium text-ink-soft transition hover:border-coral hover:text-coral shadow-2xs"
                            >
                              <RotateCcw className="size-3 text-coral" />
                              <span>Request Revision</span>
                              <span
                                className={cn(
                                  'rounded-full px-1.5 py-0.2 text-[10px] font-bold',
                                  revisionAllowance.isSketchPhase
                                    ? 'bg-teal-soft text-teal'
                                    : revisionAllowance.isExhausted
                                      ? 'bg-coral-soft text-coral'
                                      : 'bg-cream text-ink',
                                )}
                              >
                                {revisionAllowance.isSketchPhase
                                  ? 'Free · Unlimited'
                                  : `${revisionAllowance.remainingCount}/${revisionAllowance.maxAllowed} left`}
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSignoffWip(wip);
                                setAfterSignoffOpenPayment(false);
                                setIsSignoffModalOpen(true);
                              }}
                              className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-1.5 text-xs font-medium text-white transition hover:bg-coral shadow-2xs"
                            >
                              <ShieldCheck className="size-3 text-mustard" /> Formally Sign-off & Lock
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-ink-mute italic">
                            {isLatestWip ? 'Awaiting stage progression' : 'Superseded by newer pass'}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Phase 8: Client Final Acceptance & Completion Gate — STRICTLY only in lineart_coloring when Final Master deliverable exists */}
            {!isCompleted && order.stage === 'lineart_coloring' && order.wips.some((w) => w.isFinal) && (
              <div className="mt-5 rounded-2xl border border-teal/40 bg-teal-soft/40 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-teal text-white p-1">
                      <Sparkles className="size-3.5" />
                    </span>
                    <h4 className="font-display text-base font-bold text-ink">
                      Satisfied with your artwork?
                    </h4>
                  </div>
                  <p className="text-xs text-ink-soft mt-1 max-w-xl">
                    Once you love the colors, shading, and details, click below to confirm final acceptance. This completes your order and immediately unlocks your unwatermarked 300 DPI master download!
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAcceptanceModalOpen(true)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-full bg-ink px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-teal shadow-xs shrink-0"
                >
                  <Check className="size-3.5 text-mustard" strokeWidth={3} />
                  Accept Artwork & Complete Order
                </button>
              </div>
            )}
          </div>
          )}
        </Reveal>
      </div>

      {/* MODAL 1: EDIT BRIEF DETAILS (PENDING REVIEW ONLY) */}
      {isEditBriefOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-lg rounded-3xl border border-line bg-paper p-6 shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-line pb-4">
              <div>
                <h3 className="font-display text-xl font-semibold text-ink">Edit Brief Details</h3>
                <p className="text-xs text-ink-soft">Update character notes while pending artist review</p>
              </div>
              <button
                type="button"
                onClick={() => setIsEditBriefOpen(false)}
                className="grid size-8 place-items-center rounded-full text-ink-soft hover:bg-cream hover:text-ink"
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleSaveBrief} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-ink uppercase tracking-wide">
                  Character Name
                </label>
                <input
                  type="text"
                  value={editBriefData.characterName}
                  onChange={(e) => setEditBriefData({ ...editBriefData, characterName: e.target.value })}
                  placeholder="Character name or concept title"
                  className="mt-1 w-full rounded-xl border border-line bg-canvas px-3.5 py-2.5 text-sm text-ink focus:border-ink focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink uppercase tracking-wide">
                  Pose & Vibe / Atmosphere
                </label>
                <textarea
                  rows={3}
                  value={editBriefData.poseAndVibe}
                  onChange={(e) => setEditBriefData({ ...editBriefData, poseAndVibe: e.target.value })}
                  placeholder="Describe desired pose, facial expression, mood, or lighting..."
                  className="mt-1 w-full rounded-xl border border-line bg-canvas px-3.5 py-2.5 text-sm text-ink focus:border-ink focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink uppercase tracking-wide">
                  Background Notes
                </label>
                <textarea
                  rows={2}
                  value={editBriefData.backgroundNotes}
                  onChange={(e) => setEditBriefData({ ...editBriefData, backgroundNotes: e.target.value })}
                  placeholder="Background elements, flat color tone, or simple props..."
                  className="mt-1 w-full rounded-xl border border-line bg-canvas px-3.5 py-2.5 text-sm text-ink focus:border-ink focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditBriefOpen(false)}
                  className="rounded-full px-4 py-2 text-xs font-medium text-ink-soft hover:text-ink"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateBriefMutation.isPending}
                  className="rounded-full bg-ink px-5 py-2.5 text-xs font-medium text-white transition hover:bg-coral disabled:opacity-50"
                >
                  {updateBriefMutation.isPending ? 'Saving...' : 'Save Brief Changes'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* MODAL 2: REQUEST REVISION / REDLINE (SKETCH APPROVAL ONLY) */}
      {revisionWip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-lg rounded-3xl border border-line bg-paper p-6 shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-line pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                      revisionAllowance.isSketchPhase
                        ? 'bg-teal text-white'
                        : revisionAllowance.isExhausted
                          ? 'bg-coral text-white'
                          : 'bg-teal text-white',
                    )}
                  >
                    {revisionAllowance.isSketchPhase
                      ? 'Sketch Stage · Free Revisions'
                      : revisionAllowance.isExhausted
                        ? 'Extra Revision Round'
                        : `Round #${revisionAllowance.usedCount + 1} of ${revisionAllowance.maxAllowed}`}
                  </span>
                  <span className="text-xs font-semibold text-ink-mute">
                    {revisionAllowance.isSketchPhase
                      ? 'Unlimited Free'
                      : `${revisionAllowance.remainingCount} included free left`}
                  </span>
                </div>
                <h3 className="font-display text-xl font-semibold text-ink mt-1">Request Revision / Redline</h3>
                <p className="text-xs text-ink-soft">Send feedback for: {revisionWip.title}</p>
              </div>
              <button
                type="button"
                onClick={() => setRevisionWip(null)}
                className="grid size-8 place-items-center rounded-full text-ink-soft hover:bg-cream hover:text-ink"
              >
                <X className="size-4" />
              </button>
            </div>

            {revisionAllowance.isSketchPhase ? (
              <div className="mt-3 rounded-2xl border border-teal/30 bg-teal-soft/40 p-3 text-xs text-ink flex items-start gap-2">
                <Check className="size-4 text-teal shrink-0 mt-0.5 stroke-[2.5]" />
                <p className="text-[11px] text-ink-soft leading-relaxed">
                  Revisions on rough composition sketches are <strong className="text-teal">100% free with no limit</strong>! Request pose, composition, or detail changes freely until you are completely satisfied with the draft.
                </p>
              </div>
            ) : revisionAllowance.isExhausted && revisionScale === 'major' ? (
              <div className="mt-3 rounded-2xl border border-coral/30 bg-coral-soft/50 p-3 text-xs text-ink space-y-1">
                <p className="font-semibold text-coral flex items-center gap-1.5">
                  <AlertCircle className="size-3.5 shrink-0" />
                  Included Major Revision Allowance Exhausted ({revisionAllowance.maxAllowed} of {revisionAllowance.maxAllowed} rounds used)
                </p>
                <p className="text-[11px] text-ink-soft leading-relaxed">
                  You have used all {revisionAllowance.maxAllowed} free major revision rounds included with your commission. You can still submit these notes—Meru Art will review the request and let you know if an additional revision fee applies per studio TOS before making changes.
                </p>
              </div>
            ) : null}

            <form onSubmit={handleSubmitRevision} className="mt-4 space-y-4">
              {/* If in lineart/coloring stage: Allow picking small revision vs big revision */}
              {!revisionAllowance.isSketchPhase && (
                <div>
                  <label className="block text-xs font-semibold text-ink uppercase tracking-wide">
                    Revision Scope / Scale
                  </label>
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setRevisionScale('minor')}
                      className={cn(
                        'flex flex-col text-left p-3 rounded-xl border transition',
                        revisionScale === 'minor'
                          ? 'border-teal bg-teal-soft/60 text-ink shadow-2xs'
                          : 'border-line bg-canvas text-ink-soft hover:border-ink/40',
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-ink">Small Revision / Fix</span>
                        <span className="rounded-full bg-teal text-white px-1.5 py-0.2 text-[9px] font-bold">
                          Free & Unlimited
                        </span>
                      </div>
                      <p className="text-[11px] text-ink-mute mt-1 leading-tight">
                        Small color tweak, minor rendering adjustment, or tiny detail polish.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setRevisionScale('major')}
                      className={cn(
                        'flex flex-col text-left p-3 rounded-xl border transition',
                        revisionScale === 'major'
                          ? 'border-coral bg-coral-soft/60 text-ink shadow-2xs'
                          : 'border-line bg-canvas text-ink-soft hover:border-ink/40',
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-ink">Major Revision / Overhaul</span>
                        <span
                          className={cn(
                            'rounded-full px-1.5 py-0.2 text-[9px] font-bold',
                            revisionAllowance.isExhausted ? 'bg-coral text-white' : 'bg-cream text-ink',
                          )}
                        >
                          {revisionAllowance.remainingCount}/{revisionAllowance.maxAllowed} left
                        </span>
                      </div>
                      <p className="text-[11px] text-ink-mute mt-1 leading-tight">
                        Significant redraw, pose change, or structural changes to finished lineart.
                      </p>
                    </button>
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-ink uppercase tracking-wide">
                  Revision Category
                </label>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {['Pose & Gesture', 'Anatomy & Proportions', 'Outfit & Hair', 'Palette & Tone', 'Other / General'].map(
                    (cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setRevisionCategory(cat)}
                        className={cn(
                          'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                          revisionCategory === cat
                            ? 'bg-ink text-white'
                            : 'border border-line bg-canvas text-ink-soft hover:text-ink',
                        )}
                      >
                        {cat}
                      </button>
                    ),
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink uppercase tracking-wide">
                  Feedback Notes & Instructions
                </label>
                <textarea
                  rows={4}
                  required
                  value={revisionNotes}
                  onChange={(e) => setRevisionNotes(e.target.value)}
                  placeholder="Detail what adjustments are needed (e.g., 'Please tilt head slightly upward and make hair longer')..."
                  className="mt-1 w-full rounded-xl border border-line bg-canvas px-3.5 py-2.5 text-sm text-ink focus:border-ink focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink uppercase tracking-wide">
                  Redline Markup & Visual Feedback
                </label>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setLightboxWip(revisionWip)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-coral/40 bg-coral-soft/60 px-4 py-2 text-xs font-bold text-coral transition hover:bg-coral hover:text-white shadow-2xs"
                  >
                    <Brush className="size-3.5" />
                    <span>{revisionRedlineFile ? 'Re-edit Drawn Redline' : 'Draw Redline directly on WIP'}</span>
                  </button>

                  <input
                    ref={revisionFileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => setRevisionRedlineFile(e.target.files?.[0] ?? null)}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => revisionFileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-full border border-line bg-canvas px-3.5 py-2 text-xs font-medium text-ink-soft transition hover:border-ink"
                  >
                    <ImagePlus className="size-3.5 text-ink-soft" />
                    <span>Upload image file...</span>
                  </button>
                </div>

                {revisionRedlineFile && (
                  <div className="mt-2.5 flex items-center justify-between rounded-xl border border-teal/40 bg-teal-soft/40 px-3.5 py-2 text-xs text-ink">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-teal text-white">
                        <Check className="size-3 stroke-[3]" />
                      </span>
                      <span className="font-semibold text-teal truncate">
                        {revisionRedlineFile.name}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setRevisionRedlineFile(null)}
                      className="text-[11px] font-bold text-coral hover:underline shrink-0 ml-2"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setRevisionWip(null)}
                  className="rounded-full px-4 py-2 text-xs font-medium text-ink-soft hover:text-ink"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSendingRevision || !revisionNotes.trim()}
                  className="rounded-full bg-ink px-5 py-2.5 text-xs font-medium text-white transition hover:bg-coral disabled:opacity-50"
                >
                  {isSendingRevision ? 'Sending...' : 'Send Revision Request'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* MODAL 3: CANCELLATION & REFUND POLICY MODAL */}
      {isCancelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-lg rounded-3xl border border-line bg-paper p-6 shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-line pb-4">
              <div className="flex items-center gap-2">
                <span className="grid size-8 place-items-center rounded-xl bg-coral-soft text-coral">
                  <AlertTriangle className="size-4" />
                </span>
                <div>
                  <h3 className="font-display text-xl font-semibold text-ink">Request Cancellation</h3>
                  <p className="text-xs text-ink-soft">Meru Art Studio Terms of Service Refund Schedule</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCancelModalOpen(false)}
                className="grid size-8 place-items-center rounded-full text-ink-soft hover:bg-cream hover:text-ink"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="mt-4 rounded-2xl border border-line bg-canvas p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-ink uppercase tracking-wide">
                  Current Stage Refund Tier
                </span>
                <span className="rounded-full bg-paper px-2.5 py-0.5 text-xs font-bold text-coral border border-line">
                  {refundDetails.percentage}
                </span>
              </div>
              <p className="text-sm font-semibold text-ink">{refundDetails.tierName}</p>
              <p className="text-xs text-ink-soft">{refundDetails.notes}</p>
              <div className="border-t border-line/60 pt-2 flex items-center justify-between text-xs">
                <span className="text-ink-mute">Estimated Refund Amount:</span>
                <strong className="text-sm font-bold text-coral">
                  {formatMoney(refundDetails.refundAmount, order.currency)}
                </strong>
              </div>
              <div className="rounded-xl border border-line/70 bg-cream/70 p-3 text-[11px] text-ink-soft space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-ink">
                  <Clock className="size-3.5 text-coral" />
                  Refund Timeline: 3–5 Business Days
                </div>
                <p>
                  Cancellation requests require confirmation by Meru. Once approved, eligible refunds are processed back to your original payment method (PayPal or GCash) within <strong>3–5 business days</strong>.
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmitCancellation} className="mt-4 space-y-4">
              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-ink uppercase tracking-wide">
                    Reason for Cancellation <span className="text-coral">*</span>
                  </label>
                  <span
                    className={cn(
                      'text-[11px] font-medium',
                      cancelReason.trim().length >= 15 ? 'text-teal' : 'text-ink-mute',
                    )}
                  >
                    {cancelReason.trim().length}/15 chars min
                  </span>
                </div>
                <textarea
                  rows={3}
                  required
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Please provide a specific, valid reason for cancellation (e.g. personal emergency, duplicate brief, schedule conflict)..."
                  className="mt-1.5 w-full rounded-xl border border-line bg-canvas px-3.5 py-2.5 text-xs text-ink placeholder:text-ink-mute focus:border-ink focus:outline-none"
                />
                {cancelReason.trim().length > 0 && cancelReason.trim().length < 15 ? (
                  <p className="mt-1 text-[11px] text-coral">
                    Please provide a valid, descriptive reason (at least 15 characters, {15 - cancelReason.trim().length} more needed) so Meru can confirm your cancellation.
                  </p>
                ) : (
                  <p className="mt-1 text-[11px] text-ink-mute">
                    Meru verifies each request manually before confirming cancellation and initiating refund.
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCancelModalOpen(false)}
                  className="rounded-full px-4 py-2 text-xs font-medium text-ink-soft hover:text-ink"
                >
                  Keep Order Active
                </button>
                <button
                  type="submit"
                  disabled={isCancelling || cancelReason.trim().length < 15}
                  className="rounded-full bg-coral px-5 py-2.5 text-xs font-medium text-white transition hover:bg-ink disabled:opacity-50"
                >
                  {isCancelling ? 'Submitting Request...' : 'Submit Cancellation Request'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Floating Bottom-Right Chat Widget (Active on Track Order Tab) */}
      <OrderChatWidget
        order={order}
        user={user}
        soundActive={soundActive}
        onToggleSound={handleToggleSound}
        onRequestDesktopNotifications={handleRequestDesktopNotifications}
        sendOrderMessage={sendOrderMessage}
        showToast={showToast}
        isOpen={isChatOpen}
        onToggleOpen={() => setIsChatOpen((prev) => !prev)}
        isArtistAdmin={isArtistAdmin}
      />

      {/* Interactive Payment Details Modal (PayPal / GCash QR / Bank Transfer) */}
      <PaymentDetailsModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        order={order}
        usdToPhpRate={studioSettings.usdToPhpRate}
        paymentDetails={studioSettings.paymentDetails}
        onUploadReceipt={(kind) => triggerReceiptUpload(kind)}
      />

      {/* Formal Milestone Sign-off Gate Modal */}
      {order && (
        <MilestoneSignoffModal
          isOpen={isSignoffModalOpen}
          onClose={() => {
            setIsSignoffModalOpen(false);
            setSignoffWip(null);
            setAfterSignoffOpenPayment(false);
          }}
          order={order}
          wip={signoffWip}
          onConfirmSignoff={handleConfirmMilestoneSignoff}
        />
      )}

      {/* Client Final Artwork Acceptance & Tipping Gate Modal */}
      {order && (
        <ClientArtworkAcceptanceModal
          isOpen={isAcceptanceModalOpen}
          onClose={() => setIsAcceptanceModalOpen(false)}
          order={order}
          finalWip={order.wips.find((w) => w.isFinal) || order.wips[order.wips.length - 1]}
          onConfirmAcceptance={handleConfirmFinalAcceptance}
        />
      )}

      {/* Full-Screen Client WIP Lightbox & Redline Markup Modal */}
      {lightboxWip && (
        <WipLightboxMarkupModal
          isOpen={Boolean(lightboxWip)}
          onClose={() => setLightboxWip(null)}
          wip={lightboxWip}
          orderCode={orderDisplayCode}
          onAttachRedline={(file) => {
            setRevisionWip(lightboxWip);
            setRevisionRedlineFile(file);
            setLightboxWip(null);
            showToast('Redline markup attached! Add your feedback notes and submit to Meru.');
          }}
        />
      )}
    </section>
  );
}

import {
  getRefundTierInfo,
  getActiveCancellationRequest,
  type CancellationRequestInfo,
} from '@/lib/orderCancellation';

export {
  getRefundTierInfo,
  getActiveCancellationRequest,
  type CancellationRequestInfo,
};

function LoggedOutTrackView({ onSignIn }: { onSignIn: () => void }) {
  return (
    <section className="pt-32 pb-4 sm:pt-36 sm:pb-16">
      <div className="mx-auto max-w-xl text-center">
        <div className="mx-auto mb-5 grid size-16 place-items-center rounded-3xl border border-line bg-cream shadow-xs">
          <Lock className="size-8 text-coral" />
        </div>
        <SectionHeading
          eyebrow="Private Client Workspace"
          title="Sign in to view your orders"
          subtitle="Your commission tracker, WIP sketches, payment receipts, and direct chat with Meru are private to your Google account."
        />
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onSignIn}
            className="inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-coral"
          >
            <BrandIcon id="google" className="size-4 fill-white" />
            Sign in with Google
          </button>
        </div>
      </div>
    </section>
  );
}

function EmptyTrackView({ onOpenDrawer }: { onOpenDrawer: () => void }) {
  return (
    <section className="pt-32 pb-4 sm:pt-36 sm:pb-16">
      <div className="mx-auto max-w-xl text-center">
        <div className="mx-auto mb-5 grid size-16 place-items-center rounded-3xl border border-line bg-cream shadow-xs">
          <Sparkles className="size-8 text-coral" />
        </div>
        <SectionHeading
          eyebrow="No Active Orders"
          title="You don't have any commissions yet"
          subtitle="Ready to bring your character or concept to life? Submit a brief to request a slot in Meru's queue."
        />
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onOpenDrawer}
            className="inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-coral"
          >
            <Sparkles className="size-4 text-mustard" />
            Commission Meru
          </button>
        </div>
      </div>
    </section>
  );
}

function TopActionBanner({
  order,
  remainingUsd,
  onUploadDeposit,
  onApproveSketchAndPay,
  onApproveSketchOnly,
  onCompleteOrder,
  onOpenDrawer,
  onOpenPaymentModal,
  refundDetails,
}: {
  order: SubmittedOrder;
  remainingUsd: number;
  onUploadDeposit: () => void;
  onApproveSketchAndPay: () => void;
  onApproveSketchOnly: () => void;
  onCompleteOrder: () => void;
  onOpenDrawer: () => void;
  onOpenPaymentModal: () => void;
  refundDetails: ReturnType<typeof getRefundTierInfo>;
}) {
  if (order.stage === 'declined') {
    return (
      <div className="flex flex-col justify-between gap-3 rounded-3xl border border-coral/35 bg-coral-soft/75 p-4 sm:flex-row sm:items-center sm:p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-paper text-coral">
            <XCircle className="size-5" />
          </span>
          <div>
            <p className="text-xs font-semibold tracking-wider text-coral uppercase">
              Commission Declined · Request Closed
            </p>
            <h3 className="font-display text-xl font-semibold text-ink">
              Meru was unable to accept this commission brief.
            </h3>
            <p className="text-xs text-ink-soft">
              This is usually due to full studio capacity, tight turnaround deadlines, or character/scope constraints. Any upfront deposit is eligible for 100% full refund.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onOpenDrawer}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-ink px-5 py-3 text-xs font-medium text-white transition hover:bg-coral"
        >
          <Sparkles className="size-4 text-mustard" />
          Submit New Quote
        </button>
      </div>
    );
  }

  if (order.stage === 'cancelled') {
    return (
      <div className="flex flex-col justify-between gap-3 rounded-3xl border border-line bg-canvas p-4 sm:flex-row sm:items-center sm:p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-paper text-ink-mute">
            <AlertTriangle className="size-5" />
          </span>
          <div>
            <p className="text-xs font-semibold tracking-wider text-ink-mute uppercase">
              Commission Cancelled · Studio TOS Policy Applied
            </p>
            <h3 className="font-display text-xl font-semibold text-ink">
              This commission has been cancelled.
            </h3>
            <p className="text-xs text-ink-soft">
              Refund tier: <strong>{refundDetails.tierName}</strong> ({refundDetails.percentage}). {refundDetails.notes}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => printOrderInvoice(order)}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border border-line bg-paper px-4 py-2.5 text-xs font-medium text-ink transition hover:border-ink hover:bg-cream"
        >
          <Printer className="size-3.5 text-coral" />
          Print Order Record
        </button>
      </div>
    );
  }

  if (order.stage === 'pending_review') {
    return (
      <div className="flex flex-col justify-between gap-3 rounded-3xl border border-mustard/40 bg-mustard-soft/65 p-4 sm:flex-row sm:items-center sm:p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-paper text-[#b9800f]">
            <Clock className="size-5" />
          </span>
          <div>
            <p className="text-xs font-semibold tracking-wider text-[#b9800f] uppercase">
              Action Status · Pending Artist Review
            </p>
            <h3 className="font-display text-xl font-semibold text-ink">
              Meru is reviewing your brief — no payment is due yet!
            </h3>
            <p className="text-xs text-ink-soft">
              Slots are not deducted until Meru accepts your request and unlocks the deposit gate.
            </p>
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-mustard/40 bg-paper px-3.5 py-2 text-xs font-medium text-[#b9800f]">
          Waiting for Meru's Review
        </span>
      </div>
    );
  }

  if (order.stage === 'awaiting_deposit') {
    return (
      <div className="flex flex-col justify-between gap-3 rounded-3xl border border-coral/35 bg-coral-soft/75 p-4 sm:flex-row sm:items-center sm:p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-paper text-coral">
            <Receipt className="size-5" />
          </span>
          <div>
            <p className="text-xs font-semibold tracking-wider text-coral uppercase">
              Action Required · Upfront Payment Gate
            </p>
            <h3 className="font-display text-xl font-semibold text-ink">
              Approved! Upload your {order.paymentSplit === '50_50' ? '50%' : '100%'}{' '}
              {order.currency === 'USD' ? 'PayPal' : 'GCash'} deposit receipt ({formatMoney(order.depositUsd, order.currency)}) to unlock the Sketch stage.
            </h3>
            <p className="text-xs text-ink-soft">
              Attach a screenshot of your payment receipt below. Meru will verify it to begin sketching.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenPaymentModal}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border border-line bg-paper px-4 py-2.5 text-xs font-semibold text-ink shadow-xs transition hover:border-ink hover:bg-cream"
          >
            <CreditCard className="size-3.5 text-coral" />
            <span>Payment Details & QR</span>
          </button>
          <button
            type="button"
            onClick={onUploadDeposit}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-ink px-5 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-coral"
          >
            <Receipt className="size-3.5 text-mustard" />
            <span>Upload {formatMoney(order.depositUsd, order.currency)} Receipt</span>
          </button>
        </div>
      </div>
    );
  }

  if (order.stage === 'sketch_approval') {
    const needsRemaining50 = order.paymentSplit === '50_50' && !order.finalPaid && remainingUsd > 0;
    return (
      <div className="flex flex-col justify-between gap-3 rounded-3xl border border-coral/35 bg-coral-soft/70 p-4 sm:flex-row sm:items-center sm:p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-paper text-coral">
            <AlertCircle className="size-5" />
          </span>
          <div>
            <p className="text-xs font-semibold tracking-wider text-coral uppercase">
              Action Required · Sketch Approval & Remaining 50% Gate
            </p>
            <h3 className="font-display text-xl font-semibold text-ink">
              {needsRemaining50
                ? `Your sketch is ready! Approve the WIP & upload your remaining 50% receipt (${formatMoney(remainingUsd, order.currency)}) to unlock Lineart & Coloring.`
                : 'Your sketch is ready! Review WIP #2 below and approve it to unlock Lineart & Coloring.'}
            </h3>
            <p className="text-xs text-ink-soft">
              Minor revisions are free at the sketch stage — send redlines in the chat or approve to proceed.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {needsRemaining50 && (
            <button
              type="button"
              onClick={onOpenPaymentModal}
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border border-line bg-paper px-4 py-2.5 text-xs font-semibold text-ink shadow-xs transition hover:border-ink hover:bg-cream"
            >
              <CreditCard className="size-3.5 text-coral" />
              <span>Payment Details & QR</span>
            </button>
          )}
          {needsRemaining50 ? (
            <button
              type="button"
              onClick={onApproveSketchAndPay}
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-ink px-4 py-2.5 text-xs font-medium text-white transition hover:bg-coral"
            >
              <Receipt className="size-3.5 text-mustard" />
              Approve & Upload {formatMoney(remainingUsd, order.currency)} Receipt
            </button>
          ) : (
            <button
              type="button"
              onClick={onApproveSketchOnly}
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-ink px-4 py-2.5 text-xs font-medium text-white transition hover:bg-coral"
            >
              <Check className="size-3.5 text-mustard" />
              Approve Sketch →
            </button>
          )}
        </div>
      </div>
    );
  }

  if (order.stage === 'completed') {
    return (
      <div className="flex flex-col justify-between gap-3 rounded-3xl border border-teal/35 bg-teal-soft/70 p-4 sm:flex-row sm:items-center sm:p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-paper text-teal">
            <CheckCircle2 className="size-5" />
          </span>
          <div>
            <p className="text-xs font-semibold tracking-wider text-teal uppercase">
              Commission Completed · Full Resolution Unlocked
            </p>
            <h3 className="font-display text-xl font-semibold text-ink">
              Your finished illustration is ready! Watermarks have been removed from the gallery below.
            </h3>
            <p className="text-xs text-ink-soft">
              Thank you for commissioning Meru Art! Click <strong>Download High-Res PNG</strong> on your final card below.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => printOrderInvoice(order)}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-ink px-4 py-2.5 text-xs font-medium text-white transition hover:bg-teal"
        >
          <Printer className="size-3.5 text-mustard" />
          Print Invoice
        </button>
      </div>
    );
  }

  if (order.stage === 'lineart_coloring') {
    const hasFinalMasterDeliverable = order.wips.some((w) => w.isFinal);
    const hasUnapprovedWip = order.wips.some((w) => !w.approvedByClient);
    const latestWip = order.wips[order.wips.length - 1];

    if (hasFinalMasterDeliverable) {
      return (
        <div className="flex flex-col justify-between gap-3 rounded-3xl border border-teal/40 bg-teal-soft/50 p-4 sm:flex-row sm:items-center sm:p-5">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-paper text-teal shadow-2xs">
              <Sparkles className="size-5" />
            </span>
            <div>
              <p className="text-xs font-semibold tracking-wider text-teal uppercase">
                Final Master Deliverable Ready · Final Client Acceptance
              </p>
              <h3 className="font-display text-xl font-semibold text-ink">
                Meru posted your final high-resolution illustration!
              </h3>
              <p className="text-xs text-ink-soft">
                Inspect your finished artwork in the vault below. When you are 100% satisfied, accept below to complete your order and unlock high-res 300 DPI master files!
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const el = document.getElementById('artwork-vault');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border border-line bg-paper px-4 py-2 text-xs font-medium text-ink transition hover:border-ink hover:bg-cream"
            >
              <ImagePlus className="size-3.5 text-teal" />
              View WIP Vault ↓
            </button>
            <button
              type="button"
              onClick={onCompleteOrder}
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-ink px-4 py-2 text-xs font-semibold text-white transition hover:bg-teal shadow-2xs"
            >
              <Check className="size-3.5 text-mustard" strokeWidth={3} />
              Accept Artwork & Complete Order
            </button>
          </div>
        </div>
      );
    }

    if (order.wips.length > 0) {
      return (
        <div className="flex flex-col justify-between gap-3 rounded-3xl border border-indigo-200 bg-indigo-50/70 p-4 sm:flex-row sm:items-center sm:p-5">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-paper text-indigo-600 shadow-2xs">
              <Sparkles className="size-5" />
            </span>
            <div>
              <p className="text-xs font-semibold tracking-wider text-indigo-700 uppercase">
                In Production · {hasUnapprovedWip ? 'New Progress Pass Posted' : 'WIPs Reviewed'}
              </p>
              <h3 className="font-display text-xl font-semibold text-ink">
                {hasUnapprovedWip
                  ? `Meru posted ${latestWip?.title || 'an in-production update'}!`
                  : 'WIP passes reviewed! Meru is preparing the final master artwork.'}
              </h3>
              <p className="text-xs text-ink-soft">
                {hasUnapprovedWip
                  ? 'Inspect the colors, shading, and rendering in the vault below to approve or request small fixes.'
                  : 'Meru is adding final rendering polish. Once the final master deliverable is posted, you can confirm completion.'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const el = document.getElementById('artwork-vault');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border border-line bg-paper px-4 py-2 text-xs font-medium text-ink transition hover:border-ink hover:bg-cream"
            >
              <ImagePlus className="size-3.5 text-teal" />
              View WIP Vault ↓
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col justify-between gap-3 rounded-3xl border border-lilac/35 bg-lilac-soft/65 p-4 sm:flex-row sm:items-center sm:p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-paper text-lilac">
            <ShieldAlert className="size-5" />
          </span>
          <div>
            <p className="text-xs font-semibold tracking-wider text-lilac uppercase">
              Artist Working · Clean Lineart & Coloring
            </p>
            <h3 className="font-display text-xl font-semibold text-ink">
              Sketch & payment verified! Meru is working on clean lineart, coloring, and lighting.
            </h3>
            <p className="text-xs text-ink-soft">
              You’ll receive a notification here as soon as each progress WIP (lineart, base colors, shading) is posted.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // sketching stage
  return (
    <div className="flex flex-col justify-between gap-3 rounded-3xl border border-lilac/35 bg-lilac-soft/65 p-4 sm:flex-row sm:items-center sm:p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-paper text-lilac">
          <ShieldAlert className="size-5" />
        </span>
        <div>
          <p className="text-xs font-semibold tracking-wider text-lilac uppercase">
            Artist Working · No Client Action Needed Right Now
          </p>
          <h3 className="font-display text-xl font-semibold text-ink">
            Deposit verified! Meru is currently sketching your pose and composition.
          </h3>
          <p className="text-xs text-ink-soft">
            You’ll receive an update here as soon as the rough sketch WIP is uploaded to your vault.
          </p>
        </div>
      </div>
    </div>
  );
}
