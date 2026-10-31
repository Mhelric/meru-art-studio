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
  Paperclip,
  Receipt,
  Send,
  ShieldAlert,
  Sparkles,
  Unlock,
} from 'lucide-react';
import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { STAGE_STEPS } from '@/data/orders';
import { useStudio } from '@/context/StudioContext';
import { ACCENT_CLASSES, TIER_ACCENT, cn, formatMoney, formatShortDate, getTier } from '@/lib/utils';
import { artSrc, ArtImage } from '@/components/portfolio/ArtImage';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { EASE, Reveal } from '@/components/ui/Reveal';
import type { AttachmentKind, SubmittedOrder } from '@/types';

/**
 * Phase 4: Authenticated Client "Pizza-Tracker" Order Room, Payment Gates & Realtime Chat.
 * Includes:
 * 1. Top Action Banner telling the client exactly what is needed right now.
 * 2. 6-Stage Visual "Pizza-Tracker" Progress Stepper (+ interactive Stage Simulator for portfolio demos).
 * 3. Watermarked WIP Gallery that unlocks the unwatermarked high-res download ONLY when `stage === 'completed'`.
 * 4. Realtime Order Chat with image attachment support for payment receipts & sketch redlines.
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
  } = useStudio();

  const order = useMemo(
    () => submittedOrders.find((o) => o.id === activeOrderId) ?? submittedOrders[0],
    [submittedOrders, activeOrderId],
  );

  const [chatInput, setChatInput] = useState('');
  const [attachmentKind, setAttachmentKind] = useState<AttachmentKind>('receipt');
  const receiptInputRef = useRef<HTMLInputElement | null>(null);
  const chatFileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingReceiptType, setPendingReceiptType] = useState<'deposit' | 'final'>('deposit');

  if (!order) return null;

  const tier = getTier(order.tier);
  const accent = ACCENT_CLASSES[TIER_ACCENT[order.tier]];
  const currentStepIdx = STAGE_STEPS.findIndex((s) => s.id === order.stage);
  const currentStep = STAGE_STEPS[currentStepIdx] ?? STAGE_STEPS[0];
  const remainingUsd = Math.max(0, order.totalUsd - order.depositUsd);
  const isCompleted = order.stage === 'completed';

  const triggerReceiptUpload = (kind: 'deposit' | 'final') => {
    setPendingReceiptType(kind);
    receiptInputRef.current?.click();
  };

  const handleReceiptFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const url = file ? URL.createObjectURL(file) : undefined;
    uploadPaymentReceipt(order.id, pendingReceiptType, url);
    e.target.value = '';
  };

  const handleChatFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    sendOrderMessage(
      order.id,
      chatInput.trim() || `Attached ${attachmentKind}: ${file.name}`,
      { attachmentUrl: url, attachmentKind },
    );
    setChatInput('');
    e.target.value = '';
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
            eyebrow="Client Workspace · RLS Protected"
            title="Live commission tracker & order room"
            subtitle="Follow your artwork from initial brief to high-resolution download, upload payment receipts, and chat with Meru in real time."
          />
        </div>

        {/* Order Selector + New Request CTA */}
        <div className="mb-10 flex flex-wrap items-center gap-2">
          {submittedOrders.map((o) => {
            const active = o.id === order.id;
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
                #{o.id} · {getTier(o.tier).label}
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

      {/* Interactive Demo Stage Switcher Bar (for portfolio visitors/recruiters) */}
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

      {/* 1. TOP ACTION BANNER */}
      <Reveal delay={0.05}>
        <TopActionBanner
          order={order}
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
              Order #{order.id} · {tier.label}
            </span>
            <h3 className="font-display text-xl font-semibold text-ink sm:text-2xl">
              {currentStep.fullLabel}
            </h3>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <span className="text-ink-mute">
              Total: <strong className="text-ink">{formatMoney(order.totalUsd, order.currency)}</strong>
            </span>
            <span className="rounded-full bg-teal-soft px-2.5 py-0.5 font-semibold text-teal">
              {currentStep.progress}% Complete
            </span>
          </div>
        </div>

        {/* Animated progress bar */}
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-cream">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${currentStep.progress}%` }}
            transition={{ duration: 0.6, ease: EASE }}
            className="h-full rounded-full bg-gradient-to-r from-coral via-mustard to-teal"
          />
        </div>

        {/* 6-Step Grid */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {STAGE_STEPS.map((step, idx) => {
            const done = idx < currentStepIdx || isCompleted;
            const current = idx === currentStepIdx;
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => setOrderStage(order.id, step.id)}
                className={cn(
                  'flex flex-col justify-between rounded-2xl border p-3 text-left transition-all',
                  current
                    ? 'border-ink bg-cream/70 ring-1 ring-ink'
                    : done
                      ? 'border-teal/35 bg-teal-soft/35 text-ink'
                      : 'border-line bg-canvas/60 text-ink-mute hover:border-ink/25',
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      'grid size-6 place-items-center rounded-full text-[11px] font-semibold',
                      current
                        ? 'bg-ink text-white'
                        : done
                          ? 'bg-teal text-white'
                          : 'bg-paper text-ink-mute ring-1 ring-line',
                    )}
                  >
                    {done ? <Check className="size-3.5" strokeWidth={3} /> : idx + 1}
                  </span>
                  {current && (
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
            ) : (
              <div className="space-y-4">
                {order.wips.map((wip) => {
                  const lockedFinal = wip.isFinal && !isCompleted;
                  const showWatermark = !isCompleted;
                  const downloadHref = wip.slug ? artSrc(wip.slug, 'full') : wip.imageUrl;

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

                      {/* Image Container with Diagonal Watermark Shield */}
                      <div
                        onContextMenu={(e) => e.preventDefault()}
                        className="relative flex h-64 items-center justify-center overflow-hidden rounded-xl border border-line bg-cream/70 select-none sm:h-80"
                      >
                        {wip.slug ? (
                          <ArtImage
                            slug={wip.slug}
                            alt={wip.title}
                            size={isCompleted && wip.isFinal ? 'full' : 'sm'}
                            keepAspect={false}
                            className={cn(
                              'flex size-full items-center justify-center bg-transparent',
                              lockedFinal && 'blur-md brightness-90',
                            )}
                            imgClassName="max-h-full max-w-full object-contain"
                          />
                        ) : (
                          wip.imageUrl && (
                            <img
                              src={wip.imageUrl}
                              alt={wip.title}
                              className="max-h-full max-w-full object-contain"
                            />
                          )
                        )}

                        {/* Diagonal Repeating Watermark Overlay during progress */}
                        {showWatermark && (
                          <div
                            aria-hidden
                            className="pointer-events-none absolute inset-0 flex flex-wrap items-center justify-center gap-6 overflow-hidden opacity-35"
                          >
                            {Array.from({ length: 12 }).map((_, i) => (
                              <span
                                key={i}
                                className="-rotate-24 font-display text-base font-bold tracking-widest whitespace-nowrap text-ink uppercase select-none sm:text-lg"
                              >
                                MERU ART · WIP PREVIEW · DO NOT REPOST
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Locked Final Overlay */}
                        {lockedFinal && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center bg-ink/45 p-4 text-center text-white backdrop-blur-[2px]">
                            <Lock className="size-7 text-mustard" />
                            <p className="mt-2 font-display text-xl font-semibold">
                              Final High-Res Locked
                            </p>
                            <p className="mt-0.5 max-w-xs text-xs text-white/85">
                              Unlocks automatically once final payment is verified and the commission reaches <strong>Completed</strong>.
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Artist Note & Action Bar */}
                      <div className="mt-3 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                        <p className="text-xs text-ink-soft">
                          <strong className="text-ink">Meru’s Note:</strong> {wip.artistNote}
                        </p>

                        {wip.isFinal ? (
                          isCompleted && downloadHref ? (
                            <a
                              href={downloadHref}
                              download={`${order.id}-${order.tier}-highres.webp`}
                              onClick={() => showToast('Downloading unwatermarked High-Res artwork!')}
                              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-teal px-4 py-2 text-xs font-medium text-white transition hover:opacity-95"
                            >
                              <Download className="size-3.5" />
                              Download High-Res PNG
                            </a>
                          ) : (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line bg-paper px-3 py-1.5 text-[11px] font-medium text-ink-mute">
                              <Lock className="size-3" /> Unlocks at Completed stage
                            </span>
                          )
                        ) : wip.approvedByClient ? (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-teal-soft px-3 py-1 text-[11px] font-semibold text-teal">
                            <CheckCircle2 className="size-3.5" /> Approved by Client
                          </span>
                        ) : (
                          order.stage === 'sketch_approval' && (
                            <button
                              type="button"
                              onClick={() => approveOrderSketch(order.id)}
                              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-ink px-3.5 py-1.5 text-xs font-medium text-white transition hover:bg-coral"
                            >
                              <Check className="size-3.5" /> Approve Sketch
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Order Brief Summary Card */}
          <div className="card p-4 sm:p-5">
            <h4 className="font-display text-lg font-semibold text-ink">Submitted Character Brief</h4>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft">
              <strong className="text-ink">{order.characterName || 'Character'}:</strong> {order.poseAndVibe}
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
              <span className="chip">
                Split: {order.paymentSplit === '50_50' ? '50% Upfront / 50% Sketch' : '100% Upfront'}
              </span>
              <span className="chip">
                Deposit: {order.depositPaid ? '✓ Verified' : 'Pending'} ({formatMoney(order.depositUsd, order.currency)})
              </span>
              <span className="chip">
                TOS Logged: {order.tosAcceptedAt ? new Date(order.tosAcceptedAt).toLocaleDateString() : 'Yes'}
              </span>
            </div>
          </div>
        </Reveal>

        {/* Right: Realtime Order Chat & Receipt/Redline Uploader */}
        <Reveal delay={0.2} className="lg:col-span-5">
          <div className="card flex h-[560px] flex-col overflow-hidden">
            {/* Chat Header */}
            <div className="flex items-center justify-between border-b border-line bg-canvas px-4 py-3.5 sm:px-5">
              <div className="flex items-center gap-2.5">
                <img
                  src="/brand/mark-192.png"
                  alt="Meru Art"
                  className="size-9 rounded-full border border-line object-cover"
                />
                <div>
                  <div className="flex items-center gap-1.5">
                    <h3 className="font-display text-lg leading-none font-semibold text-ink">
                      Order Chat · #{order.id}
                    </h3>
                    <span className="size-2 rounded-full bg-teal" title="Realtime connected" />
                  </div>
                  <p className="mt-0.5 text-[11px] text-ink-mute">
                    Direct line with Meru · Attach receipts or sketch redlines
                  </p>
                </div>
              </div>
              <MessageSquare className="size-4 text-ink-mute" />
            </div>

            {/* Messages Scroll Area */}
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {order.messages.map((msg) => {
                const isArtist = msg.senderRole === 'artist';
                return (
                  <div
                    key={msg.id}
                    className={cn('flex flex-col', isArtist ? 'items-start' : 'items-end')}
                  >
                    <div className="mb-1 flex items-center gap-1.5 px-1 text-[10px] text-ink-mute">
                      <span className="font-medium text-ink-soft">{msg.senderName}</span>
                      <span>·</span>
                      <span>
                        {new Date(msg.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    <div
                      className={cn(
                        'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed',
                        isArtist
                          ? ' rounded-tl-sm border border-line bg-canvas text-ink'
                          : 'rounded-tr-sm bg-ink text-white',
                      )}
                    >
                      {msg.attachmentKind && (
                        <span
                          className={cn(
                            'mb-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase',
                            msg.attachmentKind === 'receipt'
                              ? 'bg-teal-soft text-teal'
                              : 'bg-mustard-soft text-[#b9800f]',
                          )}
                        >
                          <Paperclip className="size-2.5" /> {msg.attachmentKind} attached
                        </span>
                      )}
                      <p>{msg.body}</p>
                      {msg.attachmentUrl && (
                        <img
                          src={msg.attachmentUrl}
                          alt="Chat attachment"
                          className="mt-2 max-h-40 rounded-xl border border-white/15 object-cover"
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Quick Attachment Tag Selector + Input Form */}
            <form onSubmit={handleChatSubmit} className="border-t border-line bg-canvas p-3">
              <div className="mb-2 flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-medium text-ink-mute">Attach as:</span>
                  {(['receipt', 'redline', 'reference'] as const).map((k) => (
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

function TopActionBanner({
  order,
  remainingUsd,
  onSimulateArtistApprove,
  onUploadDeposit,
  onApproveSketchAndPay,
  onApproveSketchOnly,
}: {
  order: SubmittedOrder;
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
        <button
          type="button"
          onClick={onSimulateArtistApprove}
          className="shrink-0 rounded-full bg-ink px-4 py-2.5 text-xs font-medium text-white transition hover:bg-coral"
        >
          Simulate Artist Approval →
        </button>
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
              Attach a screenshot of your payment receipt below or click the button to upload & advance immediately.
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
            You’ll receive a notification here as soon as the next WIP is uploaded to your vault.
          </p>
        </div>
      </div>
    </div>
  );
}
