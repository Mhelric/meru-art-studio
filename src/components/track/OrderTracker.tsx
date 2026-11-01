import { motion } from 'framer-motion';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  ImagePlus,
  Lock,
  MessageSquare,
  Receipt,
  Send,
  ShieldAlert,
  Sparkles,
  Unlock,
  Volume2,
  VolumeX,
  Bell,
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
import type { AttachmentKind, SubmittedOrder, WipUploadItem } from '@/types';

/**
 * Phase 4 & 6B: Authenticated Client "Pizza-Tracker" Order Room, Payment Gates & Realtime Chat.
 * Includes:
 * 1. Logged-out state requiring Google sign-in (or ?demo=1 link).
 * 2. Empty state when a logged-in user has 0 orders.
 * 3. Real Supabase commission data with demo isolation.
 * 4. 6-Stage Visual "Pizza-Tracker" Progress Stepper.
 * 5. Watermarked WIP Gallery that unlocks the unwatermarked high-res download ONLY when `stage === 'completed'`.
 * 6. Realtime Order Chat with image attachment support for payment receipts & sketch redlines.
 */
export function OrderTracker() {
  const {
    submittedOrders,
    activeOrderId,
    setActiveOrderId,
    setOrderStage,
    uploadPaymentReceipt,
    approveOrderSketch,
    sendOrderMessage,
    openDrawer,
    showToast,
    user,
    isDemoMode,
    isLoadingOrders,
    signInWithGoogle,
  } = useStudio();

  const [chatInput, setChatInput] = useState('');
  const [attachmentKind, setAttachmentKind] = useState<AttachmentKind>('receipt');
  const receiptInputRef = useRef<HTMLInputElement | null>(null);
  const chatFileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingReceiptType, setPendingReceiptType] = useState<'deposit' | 'final'>('deposit');
  const [downloadingWipId, setDownloadingWipId] = useState<string | null>(null);
  const [soundActive, setSoundActive] = useState(() => isAudioNotificationEnabled());

  const order = useMemo(
    () => submittedOrders.find((o) => o.id === activeOrderId) ?? submittedOrders[0],
    [submittedOrders, activeOrderId],
  );

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

  if (!order) return null;

  const isDemo = isDemoMode || order.authMethod === 'demo';
  const tier = getTier(order.tier);
  const accent = ACCENT_CLASSES[TIER_ACCENT[order.tier]];
  const currentStepIdx = STAGE_STEPS.findIndex((s) => s.id === order.stage);
  const currentStep = STAGE_STEPS[currentStepIdx] ?? STAGE_STEPS[0];
  const remainingUsd = Math.max(0, order.totalUsd - order.depositUsd);
  const isCompleted = order.stage === 'completed';
  const orderDisplayCode = order.orderCode || order.id;

  const triggerReceiptUpload = (kind: 'deposit' | 'final') => {
    setPendingReceiptType(kind);
    receiptInputRef.current?.click();
  };

  const handleReceiptFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (user && !isDemo) {
      showToast('Uploading payment receipt to secure vault...');
      const { path, error } = await uploadReceiptFile(user.id, order.id, file);
      if (error || !path) {
        showToast(`Upload failed: ${error ?? 'Unknown error'}`);
      } else {
        uploadPaymentReceipt(order.id, pendingReceiptType, path);
      }
    } else {
      const url = URL.createObjectURL(file);
      uploadPaymentReceipt(order.id, pendingReceiptType, url);
    }
    e.target.value = '';
  };

  const handleChatFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (user && !isDemo) {
      showToast('Uploading chat attachment...');
      const { path, error } = await uploadChatAttachment(user.id, order.id, file);
      if (error || !path) {
        showToast(`Upload failed: ${error ?? 'Unknown error'}`);
      } else {
        sendOrderMessage(
          order.id,
          chatInput.trim() || `Attached ${attachmentKind}: ${file.name}`,
          { attachmentUrl: path, attachmentKind },
        );
      }
    } else {
      const url = URL.createObjectURL(file);
      sendOrderMessage(
        order.id,
        chatInput.trim() || `Attached ${attachmentKind}: ${file.name}`,
        { attachmentUrl: url, attachmentKind },
      );
    }
    setChatInput('');
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

  const handleChatSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    sendOrderMessage(order.id, chatInput.trim());
    setChatInput('');
  };

  return (
    <section className="pt-28 pb-12 sm:pt-32">
      {/* Hidden file inputs for Receipt Gate & Chat Attachment */}
      <input
        ref={receiptInputRef}
        type="file"
        accept="image/*"
        onChange={handleReceiptFile}
        className="hidden"
      />
      <input
        ref={chatFileInputRef}
        type="file"
        accept="image/*"
        onChange={handleChatFile}
        className="hidden"
      />

      {/* Header + Order Switcher + Recruiter Stage Simulator */}
      <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <SectionHeading
            eyebrow={isDemo ? 'Demo Showcase Mode' : 'Client Workspace · Supabase Connected'}
            title="Live commission tracker & order room"
            subtitle="Follow your artwork from initial brief to high-resolution download, upload payment receipts, and chat with Meru in real time."
          />
        </div>

        {/* Order Selector + New Request CTA */}
        <div className="mb-10 flex flex-wrap items-center gap-2">
          {submittedOrders.map((o) => {
            const active = o.id === order.id;
            const code = o.orderCode || o.id;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => setActiveOrderId(o.id)}
                className={cn(
                  'rounded-full px-3.5 py-2 text-xs font-medium transition-all',
                  active
                    ? 'bg-ink text-white shadow-xs'
                    : 'border border-line bg-paper text-ink-soft hover:border-ink/30 hover:text-ink',
                )}
              >
                #{code} · {getTier(o.tier).label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => openDrawer({ step: 1 })}
            className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-ink/35 bg-canvas px-3.5 py-2 text-xs font-medium text-ink transition hover:border-ink hover:bg-cream"
          >
            <Sparkles className="size-3.5 text-coral" /> + New Quote
          </button>
        </div>
      </div>

      {/* Interactive Demo Stage Switcher Bar (strictly for demo showcase orders) */}
      {isDemo && (
        <Reveal className="mb-5 rounded-2xl border border-dashed border-ink/25 bg-cream/60 p-3 sm:px-4">
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2 text-xs text-ink">
              <Eye className="size-4 shrink-0 text-coral" />
              <span>
                <strong>Portfolio Interactive Preview:</strong> Click any stage below to test how the payment gates, watermark shield, and high-res download behave:
              </span>
            </div>
            <div className="no-scrollbar flex gap-1 overflow-x-auto pb-0.5 sm:pb-0">
              {STAGE_STEPS.map((s, idx) => {
                const active = s.id === order.stage;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setOrderStage(order.id, s.id)}
                    className={cn(
                      'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
                      active ? 'bg-coral text-white' : 'bg-paper text-ink-soft hover:text-ink',
                    )}
                  >
                    {idx + 1}. {s.shortLabel}
                  </button>
                );
              })}
            </div>
          </div>
        </Reveal>
      )}

      {/* 1. TOP ACTION BANNER */}
      <Reveal delay={0.05}>
        <TopActionBanner
          order={order}
          isDemo={isDemo}
          remainingUsd={remainingUsd}
          onSimulateArtistApprove={() => {
            setOrderStage(order.id, 'awaiting_deposit');
            showToast('Brief approved! Upfront deposit gate unlocked.');
          }}
          onUploadDeposit={() => triggerReceiptUpload('deposit')}
          onApproveSketchAndPay={() => triggerReceiptUpload('final')}
          onApproveSketchOnly={() => approveOrderSketch(order.id)}
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
              {currentStep.fullLabel}
            </h3>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <span className="text-ink-mute">
              Total: <strong className="text-ink">{formatMoney(order.totalUsd, order.currency)}</strong>
            </span>
            <span className="text-ink-mute">
              Deposit: <strong className="text-ink">{formatMoney(order.depositUsd, order.currency)}</strong>
            </span>
            <span className="text-ink-mute">
              Target: <strong className="text-ink">{order.estEndDate ? formatShortDate(order.estEndDate) : 'TBD'}</strong>
            </span>
          </div>
        </div>

        {/* Progress bar line */}
        <div className="relative mb-6 h-2 w-full overflow-hidden rounded-full bg-cream">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${order.progress}%` }}
            transition={{ duration: 0.6, ease: EASE }}
            className={`h-full rounded-full ${accent.bar}`}
          />
        </div>

        {/* 6 Step Cards */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {STAGE_STEPS.map((step, idx) => {
            const isPassed = idx < currentStepIdx;
            const isCurrent = idx === currentStepIdx;
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => {
                  if (isDemo) setOrderStage(order.id, step.id);
                }}
                disabled={!isDemo}
                className={cn(
                  'flex flex-col justify-between rounded-2xl border p-3 text-left transition-all',
                  isCurrent
                    ? 'border-ink bg-paper shadow-xs ring-1 ring-ink/20'
                    : isPassed
                      ? 'border-line bg-paper/60 text-ink'
                      : 'border-transparent bg-cream/50 text-ink-mute',
                  isDemo && 'cursor-pointer hover:border-coral',
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      'grid size-5 place-items-center rounded-full text-[10px] font-bold',
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
                    <span className="rounded-full bg-coral-soft px-2 py-0.5 text-[10px] font-semibold text-coral">
                      Current
                    </span>
                  )}
                </div>
                <p className="mt-2 font-display text-sm leading-tight font-semibold text-ink">
                  {step.shortLabel}
                </p>
              </button>
            );
          })}
        </div>
      </Reveal>

      {/* 3. SPLIT WORKSPACE: WIP GALLERY (LEFT 7 COLS) + REALTIME CHAT (RIGHT 5 COLS) */}
      <div className="mt-6 grid gap-6 lg:grid-cols-12">
        {/* Left: Watermarked WIP Gallery & High-Res Master Unlock */}
        <Reveal delay={0.15} className="space-y-4 lg:col-span-7">
          <div className="card p-4 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-medium tracking-wider text-coral uppercase">
                  {isCompleted ? 'Unwatermarked Master Unlocked' : 'Scam-Protected WIP Vault'}
                </p>
                <h3 className="font-display text-2xl font-semibold text-ink">
                  WIP Progress & Final Delivery
                </h3>
              </div>

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
            </div>

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
              <div className="space-y-4">
                {order.wips.map((wip) => {
                  const lockedFinal = wip.isFinal && !isCompleted;
                  const showWatermark = !isCompleted;

                  return (
                    <div
                      key={wip.id}
                      className="overflow-hidden rounded-2xl border border-line bg-canvas p-3 sm:p-4"
                    >
                      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="text-[11px] font-semibold text-coral uppercase">
                            {wip.isFinal ? 'Final Master File' : 'Work In Progress'}
                          </span>
                          <h4 className="font-display text-lg font-semibold text-ink">{wip.title}</h4>
                        </div>
                        <span className="text-[11px] text-ink-mute">
                          {formatShortDate(wip.createdAt.slice(0, 10))}
                        </span>
                      </div>

                      <div className="relative aspect-4/3 w-full overflow-hidden rounded-xl border border-line bg-paper select-none">
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

                        {/* Protective Watermark Overlay */}
                        {showWatermark && !lockedFinal && (
                          <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/10 backdrop-blur-[0.5px]">
                            <div className="rotate-[-22deg] text-center select-none">
                              <p className="font-display text-2xl font-extrabold tracking-widest text-white/50 uppercase drop-shadow-md sm:text-4xl">
                                MERU ART · WIP PREVIEW
                              </p>
                              <p className="text-[11px] font-bold tracking-widest text-white/60 uppercase drop-shadow-sm">
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
                          <span className="text-[11px] text-ink-mute">
                            Protected by Meru Art Studio watermark shield.
                          </span>
                        )}

                        {wip.stage === 'sketch_approval' && !wip.approvedByClient && (
                          <button
                            type="button"
                            onClick={() => approveOrderSketch(order.id)}
                            className="inline-flex items-center gap-1 rounded-full border border-ink/30 bg-paper px-3 py-1.5 text-xs font-medium text-ink transition hover:border-ink hover:bg-cream"
                          >
                            <Check className="size-3 text-coral" /> Approve this WIP
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Reveal>

        {/* Right: Realtime Order Chat & Receipt Dropper */}
        <Reveal delay={0.2} className="lg:col-span-5">
          <div className="card flex h-full min-h-[520px] flex-col p-4 sm:p-6">
            <div className="mb-3 flex items-center justify-between border-b border-line pb-3">
              <div className="flex items-center gap-2">
                <span className="grid size-8 place-items-center rounded-xl bg-coral-soft text-coral">
                  <MessageSquare className="size-4" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-display text-base font-semibold text-ink">
                      Order Chat · #{orderDisplayCode}
                    </h4>
                    {!isDemo && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-teal-soft px-2 py-0.5 text-[10px] font-semibold text-teal">
                        <span className="size-1.5 rounded-full bg-teal animate-pulse" /> Live
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-ink-mute">Direct communication with Meru</p>
                </div>
              </div>

              {/* Realtime Audio Chime & Browser Notification Toggles */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleToggleSound}
                  title={soundActive ? 'Mute notification sound chimes' : 'Unmute notification sound chimes'}
                  aria-label={soundActive ? 'Mute audio' : 'Unmute audio'}
                  className={cn(
                    'grid size-7 place-items-center rounded-full border text-xs transition-colors',
                    soundActive
                      ? 'border-line bg-paper text-ink hover:border-ink/30'
                      : 'border-dashed border-ink/20 bg-cream text-ink-mute hover:text-ink',
                  )}
                >
                  {soundActive ? <Volume2 className="size-3.5 text-teal" /> : <VolumeX className="size-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={handleRequestDesktopNotifications}
                  title="Enable desktop notifications"
                  aria-label="Enable desktop notifications"
                  className="grid size-7 place-items-center rounded-full border border-line bg-paper text-ink-soft hover:border-ink/30 hover:text-coral transition-colors"
                >
                  <Bell className="size-3.5" />
                </button>
              </div>
            </div>

            {/* Chat Message List */}
            <div className="no-scrollbar flex-1 space-y-3 overflow-y-auto py-2 pr-1">
              {order.messages.map((m) => {
                const isArtist = m.senderRole === 'artist';
                return (
                  <div
                    key={m.id}
                    className={cn('flex flex-col', isArtist ? 'items-start' : 'items-end')}
                  >
                    <div className="mb-1 flex items-center gap-1.5 text-[10px] text-ink-mute">
                      <span className={cn('font-semibold', isArtist ? 'text-coral' : 'text-teal')}>
                        {m.senderName}
                      </span>
                      <span>·</span>
                      <span>{formatShortDate(m.createdAt.slice(0, 10))}</span>
                    </div>

                    <div
                      className={cn(
                        'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed',
                        isArtist
                          ? 'border border-line bg-paper text-ink'
                          : 'bg-ink text-white shadow-xs',
                      )}
                    >
                      {m.attachmentUrl && (
                        <div className="mb-2 overflow-hidden rounded-xl border border-line bg-canvas">
                          <img
                            src={m.attachmentUrl}
                            alt="Attachment"
                            className="max-h-48 w-full object-contain"
                          />
                          {m.attachmentKind && (
                            <span className="block bg-paper px-2 py-1 text-[10px] font-semibold text-coral uppercase">
                              Attached: {m.attachmentKind}
                            </span>
                          )}
                        </div>
                      )}
                      <p>{m.body}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Message input */}
            <form onSubmit={handleChatSubmit} className="mt-3 border-t border-line pt-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  {(['receipt', 'redline', 'reference'] as AttachmentKind[]).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setAttachmentKind(k)}
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-medium capitalize transition-colors',
                        attachmentKind === k
                          ? 'bg-ink text-white'
                          : 'border border-line bg-paper text-ink-soft hover:text-ink',
                      )}
                    >
                      {k}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => chatFileInputRef.current?.click()}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-coral hover:underline"
                >
                  <ImagePlus className="size-3.5" /> Upload Image
                </button>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Write a message, redline note, or payment ref..."
                  className="flex-1 rounded-full border border-line bg-paper px-3.5 py-2 text-xs text-ink placeholder:text-ink-mute focus:border-ink focus:outline-none"
                />
                <button
                  type="submit"
                  aria-label="Send message"
                  className="grid size-9 shrink-0 place-items-center rounded-full bg-ink text-white transition hover:bg-coral"
                >
                  <Send className="size-3.5" />
                </button>
              </div>
            </form>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function LoggedOutTrackView({ onSignIn }: { onSignIn: () => void }) {
  return (
    <section className="pt-28 pb-16 sm:pt-36">
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
          <a
            href="?demo=1#track"
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-5 py-3 text-sm font-medium text-ink transition hover:bg-cream"
          >
            <Eye className="size-4 text-ink-mute" />
            Preview Demo Room
          </a>
        </div>
      </div>
    </section>
  );
}

function EmptyTrackView({ onOpenDrawer }: { onOpenDrawer: () => void }) {
  return (
    <section className="pt-28 pb-16 sm:pt-36">
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
          <a
            href="?demo=1#track"
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-5 py-3 text-sm font-medium text-ink transition hover:bg-cream"
          >
            <Eye className="size-4 text-ink-mute" />
            Preview Demo Showcase
          </a>
        </div>
      </div>
    </section>
  );
}

function TopActionBanner({
  order,
  isDemo,
  remainingUsd,
  onSimulateArtistApprove,
  onUploadDeposit,
  onApproveSketchAndPay,
  onApproveSketchOnly,
}: {
  order: SubmittedOrder;
  isDemo: boolean;
  remainingUsd: number;
  onSimulateArtistApprove: () => void;
  onUploadDeposit: () => void;
  onApproveSketchAndPay: () => void;
  onApproveSketchOnly: () => void;
}) {
  if (order.stage === 'pending_review') {
    return (
      <div className="flex flex-col justify-between gap-3 rounded-3xl border border-mustard/40 bg-mustard-soft/65 p-4 sm:flex-row sm:items-center sm:p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-paper text-[#b9800f]">
            <Clock className="size-5" />
          </span>
          <div>
            <p className="text-[11px] font-semibold tracking-wider text-[#b9800f] uppercase">
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
        {isDemo ? (
          <button
            type="button"
            onClick={onSimulateArtistApprove}
            className="shrink-0 rounded-full bg-ink px-4 py-2.5 text-xs font-medium text-white transition hover:bg-coral"
          >
            Simulate Artist Approval →
          </button>
        ) : (
          <span className="shrink-0 rounded-full border border-mustard/40 bg-paper px-3.5 py-2 text-xs font-medium text-[#b9800f]">
            Waiting for Meru's Review
          </span>
        )}
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
            <p className="text-[11px] font-semibold tracking-wider text-coral uppercase">
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
        <button
          type="button"
          onClick={onUploadDeposit}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-ink px-5 py-3 text-xs font-medium text-white transition hover:bg-coral"
        >
          <Receipt className="size-4 text-mustard" />
          Upload {formatMoney(order.depositUsd, order.currency)} Receipt
        </button>
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
            <p className="text-[11px] font-semibold tracking-wider text-coral uppercase">
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

        <div className="flex flex-wrap gap-2">
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
            <p className="text-[11px] font-semibold tracking-wider text-teal uppercase">
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
      </div>
    );
  }

  // sketching or lineart_coloring
  return (
    <div className="flex flex-col justify-between gap-3 rounded-3xl border border-lilac/35 bg-lilac-soft/65 p-4 sm:flex-row sm:items-center sm:p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-paper text-lilac">
          <ShieldAlert className="size-5" />
        </span>
        <div>
          <p className="text-[11px] font-semibold tracking-wider text-lilac uppercase">
            Artist Working · No Client Action Needed Right Now
          </p>
          <h3 className="font-display text-xl font-semibold text-ink">
            {order.stage === 'sketching'
              ? 'Deposit verified! Meru is currently sketching your pose and composition.'
              : 'Sketch & payment verified! Meru is working on clean lineart, coloring, and lighting.'}
          </h3>
          <p className="text-xs text-ink-soft">
            You’ll receive an update here as soon as the next WIP is uploaded to your vault.
          </p>
        </div>
      </div>
    </div>
  );
}
