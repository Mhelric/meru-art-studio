import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  CheckCircle2,
  FileCheck2,
  FileText,
  ImagePlus,
  Minus,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { PORTFOLIO } from '@/data/artist';
import { calculateOrderPricing, useStudio, type DrawerStep } from '@/context/StudioContext';
import {
  ACCENT_CLASSES,
  TIER_ACCENT,
  cn,
  formatShortDate,
  getLocalFutureDate,
} from '@/lib/utils';
import { lockScroll } from '@/lib/smoothScroll';
import { EASE } from '@/components/ui/Reveal';
import { BrandIcon } from '@/components/ui/BrandIcon';
import { StudioStatusBadge } from '@/components/ui/StudioStatusBadge';
import { useStudioStatus } from '@/hooks/useStudioStatus';
import { MiniAvailabilityPicker } from '@/components/schedule/MiniAvailabilityPicker';
import { ArtImage } from './ArtImage';
import { TosModal } from './TosModal';
import type { ReferenceFile, SubmittedOrder, TierId } from '@/types';

const TIER_PREVIEW: Record<TierId, { slug: string; pos: string }> = {
  headshot: { slug: 'deku-inktober', pos: 'object-[50%_42%]' },
  halfbody: { slug: 'velimer-dnd', pos: 'object-[50%_20%]' },
  fullbody: { slug: 'kitsunegem', pos: 'object-[50%_18%]' },
  chibi: { slug: 'chibi-universe', pos: 'object-center' },
  graphics: { slug: 'thumb-gacha-gems', pos: 'object-center' },
};

const STEPS: { id: DrawerStep; label: string }[] = [
  { id: 1, label: '1. Style & Price' },
  { id: 2, label: '2. Brief & Refs' },
  { id: 3, label: '3. Review & Submit' },
];

/**
 * Guided 3-Step Slide-Over Order Drawer (Phase 2).
 * - Step 1: Style & Pricing Calculator (Tier, character count, add-ons, USD/PHP, 50/50 vs 100%)
 * - Step 2: Brief & References (Reference image uploader, pose/expression notes, mandatory timestamped TOS checkbox)
 * - Step 3: Review & Submit Gate (1-click Discord/Google OAuth prompt + instant Demo Mode preview submission)
 */
export function TierModal() {
  const {
    drawerOpen,
    closeDrawer,
    drawerStep,
    setDrawerStep,
    draft,
    updateDraft,
    resetDraft,
    studioSettings,
    tiers,
    openLightbox,
    submitOrder,
    setActiveTab,
    showToast,
    user,
    queueSlots,
  } = useStudio();
  const statusInfo = useStudioStatus();

  const [justSubmitted, setJustSubmitted] = useState<SubmittedOrder | null>(null);
  const [step2Error, setStep2Error] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [isTosModalOpen, setIsTosModalOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const tierId = draft.tier;
  const tier = tiers.find((t) => t.id === tierId) ?? tiers[0];
  const accent = ACCENT_CLASSES[TIER_ACCENT[tierId]];
  const preview = TIER_PREVIEW[tierId];
  const currency = draft.currency;

  const formatRate = (usd: number) =>
    currency === 'USD'
      ? `$${usd}`
      : `₱${Math.round(usd * studioSettings.usdToPhpRate).toLocaleString('en-PH')}`;

  const pricing = useMemo(() => calculateOrderPricing(draft, studioSettings), [draft, studioSettings]);

  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const drawerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!drawerOpen) {
      setJustSubmitted(null);
      setStep2Error(null);
      setSubmitError(null);
      setIsTosModalOpen(false);
      setIsDragging(false);
      return;
    }
    previouslyFocusedElementRef.current = document.activeElement as HTMLElement;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDrawer();

      if (e.key === 'Tab' && drawerRef.current) {
        const focusable = drawerRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            last.focus();
            e.preventDefault();
          }
        } else {
          if (document.activeElement === last) {
            first.focus();
            e.preventDefault();
          }
        }
      }
    };
    lockScroll(true);
    window.addEventListener('keydown', onKey);
    return () => {
      lockScroll(false);
      window.removeEventListener('keydown', onKey);
      previouslyFocusedElementRef.current?.focus();
    };
  }, [drawerOpen, closeDrawer]);

  const samples = useMemo(() => PORTFOLIO.filter((p) => p.tier === tierId), [tierId]);
  const sampleIds = useMemo(() => samples.map((s) => s.id), [samples]);

  const addReferenceFiles = (fileList: File[]) => {
    const imageFiles = fileList.filter((f) => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    const oversized = imageFiles.find((f) => f.size > 20 * 1024 * 1024);
    if (oversized) {
      setStep2Error(`"${oversized.name}" exceeds the 20MB size limit. Please choose a smaller image.`);
      return;
    }

    const remainingSlots = 5 - draft.references.length;
    if (remainingSlots <= 0) {
      setStep2Error('Maximum of 5 reference sheets allowed per commission brief.');
      return;
    }

    const added: ReferenceFile[] = imageFiles
      .slice(0, remainingSlots)
      .map((f) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: f.name,
        sizeBytes: f.size,
        previewUrl: URL.createObjectURL(f),
        file: f,
      }));

    const nextRefs = [...draft.references, ...added];
    updateDraft({ references: nextRefs });
    if (nextRefs.length >= 1 && step2Error?.includes('reference sheet')) {
      setStep2Error(null);
    }
  };

  const handleFilesSelected = (e: ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    addReferenceFiles(Array.from(fileList));
    e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addReferenceFiles(Array.from(e.dataTransfer.files));
    }
  };

  // Clipboard Paste (Ctrl+V) listener when drawer is on Step 2
  useEffect(() => {
    if (!drawerOpen || drawerStep !== 2) return;
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) files.push(file);
        }
      }
      if (files.length > 0) {
        addReferenceFiles(files);
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [drawerOpen, drawerStep, draft.references.length]);

  const removeReference = (id: string) => {
    const target = draft.references.find((r) => r.id === id);
    if (target) URL.revokeObjectURL(target.previewUrl);
    const nextRefs = draft.references.filter((r) => r.id !== id);
    updateDraft({ references: nextRefs });
    if (nextRefs.length < 1) {
      setStep2Error('Please attach at least 1 character reference sheet before proceeding.');
    }
  };

  const toggleTos = () => {
    const next = !draft.tosAccepted;
    updateDraft({
      tosAccepted: next,
      tosAcceptedAt: next ? new Date().toISOString() : null,
    });
    if (next) setStep2Error(null);
  };

  const advanceFromStep2 = () => {
    if (!draft.poseAndVibe.trim()) {
      setStep2Error('Please add a short character / pose description so Meru knows what to draw.');
      return;
    }
    if (draft.references.length < 1) {
      setStep2Error('Please attach at least 1 character reference sheet before proceeding.');
      return;
    }
    if (!draft.tosAccepted) {
      setStep2Error('Please agree to the Terms of Service to continue.');
      return;
    }
    setStep2Error(null);
    setDrawerStep(3);
  };

  const handleFinalSubmit = async (method: SubmittedOrder['authMethod']) => {
    if (statusInfo.isClosed) {
      setSubmitError('Studio is currently closed for new commission requests.');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const { order, error } = await submitOrder(method);
      if (error || !order) {
        setSubmitError(error ?? 'Could not submit request.');
        return;
      }
      setJustSubmitted(order);
      showToast(`Brief #${order.orderCode || order.id} submitted to Pending Review!`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <AnimatePresence>
      {drawerOpen && (
        <motion.div
          key="tier-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Commission Order Drawer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={closeDrawer}
          className="fixed inset-0 z-[85] flex items-end justify-end bg-ink/55 backdrop-blur-sm sm:items-stretch"
        >
          <motion.div
            ref={drawerRef}
            data-lenis-prevent
            tabIndex={-1}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ duration: 0.35, ease: EASE }}
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-[28px] border-t border-line bg-paper sm:h-full sm:max-h-none sm:max-w-lg sm:rounded-none sm:rounded-l-[32px] sm:border-t-0 sm:border-l"
          >
            {/* Mobile grab handle */}
            <div className="flex justify-center pt-2 sm:hidden">
              <span className="h-1 w-9 rounded-full bg-line" />
            </div>

            {/* Header: Title + Currency Switcher + Close */}
            <div className="flex items-center justify-between gap-2 px-4 pt-2.5 pb-2.5 sm:px-5 sm:pt-4">
              <div className="flex items-center gap-2">
                <h2 className="font-display text-xl font-semibold text-ink sm:text-2xl">
                  {justSubmitted ? 'Request Received!' : 'Commission Request'}
                </h2>
                {!justSubmitted && <StudioStatusBadge size="sm" />}
              </div>

              <div className="flex items-center gap-1.5">
                {!justSubmitted && (
                  <div className="inline-flex rounded-full border border-line bg-canvas p-0.5 text-xs font-medium">
                    {(['USD', 'PHP'] as const).map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => updateDraft({ currency: c })}
                        className={cn(
                          'rounded-full px-2.5 py-1 whitespace-nowrap transition-colors',
                          currency === c ? 'bg-ink text-white' : 'text-ink-mute hover:text-ink',
                        )}
                      >
                        {c === 'USD' ? '$ USD' : '₱ PHP'}
                      </button>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  onClick={closeDrawer}
                  aria-label="Close drawer"
                  className="grid size-8 shrink-0 place-items-center rounded-full border border-line bg-canvas text-ink-soft transition hover:text-ink"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            {/* 3-Step Progress Pill Bar */}
            {!justSubmitted && (
              <div className="grid grid-cols-3 gap-1.5 border-y border-line bg-canvas/80 px-4 py-2 sm:px-5">
                {STEPS.map((s) => {
                  const active = drawerStep === s.id;
                  const done = drawerStep > s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        if (s.id < drawerStep || (s.id === 2 && drawerStep === 1)) {
                          setDrawerStep(s.id);
                        } else if (s.id === 3) {
                          advanceFromStep2();
                        }
                      }}
                      className={cn(
                        'flex items-center justify-center gap-1 rounded-full py-1.5 text-[11px] font-medium whitespace-nowrap transition-all sm:text-xs',
                        active
                          ? 'bg-ink text-white shadow-xs'
                          : done
                            ? 'bg-teal-soft text-teal'
                            : 'border border-line bg-paper text-ink-mute',
                      )}
                    >
                      {done && <Check className="size-3 shrink-0" strokeWidth={3} />}
                      <span>{s.label}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Step Body */}
            <div data-lenis-prevent className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-3.5 sm:px-5 sm:py-4">
              {statusInfo.isClosed && !justSubmitted && (
                <div className="mb-4 rounded-2xl border border-coral/30 bg-coral-soft p-3.5 text-xs text-coral">
                  <div className="flex items-center gap-2 font-semibold">
                    <span className="size-2 rounded-full bg-coral" />
                    <span>Studio Closed for New Commissions</span>
                  </div>
                  <p className="mt-1 text-ink-soft">
                    Meru Art Studio is currently closed for new commission requests. Submissions are temporarily paused, but your brief details will remain safely saved in this form.
                  </p>
                </div>
              )}
              {justSubmitted ? (
                <SubmissionSuccess
                  order={justSubmitted}
                  onTrack={() => {
                    closeDrawer();
                    resetDraft();
                    setActiveTab('track');
                  }}
                  onNew={() => {
                    resetDraft();
                    setJustSubmitted(null);
                  }}
                />
              ) : drawerStep === 1 ? (
                /* ================= STEP 1: STYLE & PRICING CALCULATOR ================= */
                <div className="space-y-3.5 sm:space-y-4">
                  {/* 5-Tab Tier Grid */}
                  <div>
                    <span className="mb-1.5 block text-xs font-medium text-ink">Select Style Tier</span>
                    <div className="grid grid-cols-5 gap-1">
                      {tiers.map((t) => {
                        const active = t.id === tierId;
                        const shortName = t.id === 'chibi' ? 'Chibi' : t.label;
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => updateDraft({ tier: t.id })}
                            className={cn(
                              'flex flex-col items-center justify-center rounded-xl py-1.5 text-center transition-all',
                              active
                                ? 'bg-ink text-white shadow-xs'
                                : 'border border-line bg-canvas text-ink-soft hover:border-ink/30 hover:text-ink',
                            )}
                          >
                            <span className="text-[11px] leading-tight font-medium">{shortName}</span>
                            <span className={cn('mt-0.5 text-[10px] font-semibold', active ? 'text-mustard' : 'text-ink-mute')}>
                              {formatRate(t.basePriceUsd)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Selected Tier Summary + Character Counter */}
                  <div className="flex items-center gap-3 rounded-2xl border border-line bg-canvas/70 p-2.5 sm:p-3">
                    <button
                      type="button"
                      onClick={() => {
                        if (sampleIds.length > 0) {
                          closeDrawer();
                          openLightbox(sampleIds, 0);
                        }
                      }}
                      title="Tap to view examples"
                      className="group relative size-14 shrink-0 overflow-hidden rounded-xl border border-line bg-cream sm:size-16"
                    >
                      <ArtImage
                        slug={preview.slug}
                        alt={tier.label}
                        size="sm"
                        keepAspect={false}
                        className="size-full"
                        imgClassName={cn('size-full object-cover transition-transform group-hover:scale-105', preview.pos)}
                      />
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <h3 className="font-display text-lg leading-none font-semibold text-ink sm:text-xl">{tier.label}</h3>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${accent.soft} ${accent.text}`}>
                            {tier.category}
                          </span>
                        </div>

                        {/* Character count stepper */}
                        <div className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-2 py-0.5 text-xs">
                          <button
                            type="button"
                            onClick={() => updateDraft({ characterCount: Math.max(1, draft.characterCount - 1) })}
                            aria-label="Fewer characters"
                            className="text-ink-mute hover:text-ink"
                          >
                            <Minus className="size-3" />
                          </button>
                          <span className="font-medium text-ink">{draft.characterCount} char</span>
                          <button
                            type="button"
                            onClick={() => updateDraft({ characterCount: Math.min(4, draft.characterCount + 1) })}
                            aria-label="More characters"
                            className="text-ink-mute hover:text-ink"
                          >
                            <Plus className="size-3" />
                          </button>
                        </div>
                      </div>

                      <p className="mt-1 line-clamp-1 text-xs text-ink-soft">{tier.description}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {tier.includes.map((inc) => (
                          <span
                            key={inc}
                            className="inline-flex items-center gap-1 rounded-md bg-paper px-1.5 py-0.5 text-[10px] font-medium text-ink-soft ring-1 ring-line"
                          >
                            <Check className="size-2.5 text-teal" strokeWidth={3} />
                            {inc}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Optional Add-ons */}
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-xs font-medium text-ink">Optional Add-ons</span>
                      <span className="text-[11px] text-ink-mute">Tap to toggle</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {(
                        [
                          { key: 'nsfw', label: 'NSFW', sub: 'Soft / tasteful', rate: `+${Math.round(studioSettings.multipliers.nsfw * 100)}%` },
                          { key: 'softFurry', label: 'Soft Furry', sub: 'Kemonomimi', rate: `+${Math.round(studioSettings.multipliers.softFurry * 100)}%` },
                          { key: 'commercial', label: 'Commercial', sub: 'Merch / streams', rate: `+${Math.round(studioSettings.multipliers.commercial * 100)}%` },
                        ] as const
                      ).map((item) => {
                        const active = draft.addons[item.key];
                        return (
                          <button
                            key={item.key}
                            type="button"
                            onClick={() =>
                              updateDraft({
                                addons: { ...draft.addons, [item.key]: !draft.addons[item.key] },
                              })
                            }
                            className={cn(
                              'flex flex-col items-start justify-between rounded-2xl border p-2.5 text-left transition-all',
                              active ? 'border-ink bg-ink text-white' : 'border-line bg-paper text-ink hover:border-ink/30',
                            )}
                          >
                            <div className="flex w-full items-center justify-between">
                              <span
                                className={cn(
                                  'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                                  active ? 'bg-mustard text-ink' : 'bg-mustard-soft text-[#b9800f]',
                                )}
                              >
                                {item.rate}
                              </span>
                              {active && <Check className="size-3 text-mustard" strokeWidth={3} />}
                            </div>
                            <p className="mt-1.5 font-display text-sm leading-tight font-semibold sm:text-base">{item.label}</p>
                            <p className={cn('text-[10px]', active ? 'text-white/70' : 'text-ink-mute')}>{item.sub}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Payment Split Choice */}
                  <div>
                    <span className="mb-1.5 block text-xs font-medium text-ink">Payment Schedule</span>
                    <div className="grid grid-cols-2 gap-2">
                      {(
                        [
                          {
                            id: '50_50',
                            title: '50% / 50% Split',
                            sub: `${formatRate(Math.ceil(pricing.totalUsd / 2))} now · rest after sketch`,
                          },
                          {
                            id: '100_upfront',
                            title: '100% Upfront',
                            sub: `${formatRate(pricing.totalUsd)} single payment`,
                          },
                        ] as const
                      ).map((plan) => {
                        const active = draft.paymentSplit === plan.id;
                        return (
                          <button
                            key={plan.id}
                            type="button"
                            onClick={() => updateDraft({ paymentSplit: plan.id })}
                            className={cn(
                              'rounded-2xl border p-2.5 text-left transition-all',
                              active ? 'border-ink bg-cream/70 ring-1 ring-ink' : 'border-line bg-paper hover:border-ink/30',
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-display text-sm font-semibold text-ink sm:text-base">{plan.title}</span>
                              <span
                                className={cn(
                                  'grid size-4 place-items-center rounded-full border',
                                  active ? 'border-ink bg-ink text-white' : 'border-line',
                                )}
                              >
                                {active && <Check className="size-2.5" strokeWidth={3} />}
                              </span>
                            </div>
                            <p className="mt-0.5 text-[10px] text-ink-soft sm:text-[11px]">{plan.sub}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : drawerStep === 2 ? (
                /* ================= STEP 2: BRIEF & REFERENCES ================= */
                <div className="space-y-3.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-ink">Character / Subject Name</label>
                      <input
                        type="text"
                        value={draft.characterName}
                        onChange={(e) => updateDraft({ characterName: e.target.value })}
                        placeholder="Your Character's Name or Title"
                        className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-xs text-ink placeholder:text-ink-mute focus:border-ink focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-ink">Preferred Start Date</label>
                      <MiniAvailabilityPicker
                        selectedDate={draft.preferredStartDate ?? getLocalFutureDate(3)}
                        onSelectDate={(iso) => updateDraft({ preferredStartDate: iso })}
                        queueSlots={queueSlots}
                        studioSettings={studioSettings}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-ink">
                      Pose, Expression & Vibe Notes <span className="text-coral">*</span>
                    </label>
                    <textarea
                      rows={3}
                      value={draft.poseAndVibe}
                      onChange={(e) => {
                        updateDraft({ poseAndVibe: e.target.value });
                        if (step2Error) setStep2Error(null);
                      }}
                      placeholder="Describe the pose, expression, outfit details, lighting mood, or any specific props..."
                      className="w-full resize-none rounded-2xl border border-line bg-canvas p-3 text-xs leading-relaxed text-ink placeholder:text-ink-mute focus:border-ink focus:outline-none"
                    />
                  </div>

                  {/* Reference Image Uploader with Drag & Drop */}
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-xs font-medium text-ink">
                        Character Reference Sheets <span className="text-coral">* (min 1 required)</span>
                      </span>
                      <span className={cn('text-[11px] font-medium', draft.references.length < 1 ? 'text-coral' : 'text-teal')}>
                        {draft.references.length}/5 attached {draft.references.length < 1 ? '(1 required)' : '✓ Ready'}
                      </span>
                    </div>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleFilesSelected}
                      className="hidden"
                    />

                    {/* Interactive Drag & Drop Area */}
                    <div
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      className={cn(
                        'rounded-2xl border p-2.5 transition-all',
                        isDragging
                          ? 'border-coral bg-coral-soft/30 ring-2 ring-coral/50 scale-[1.01]'
                          : 'border-line/70 bg-canvas/60',
                      )}
                    >
                      <div className="flex flex-wrap gap-2">
                        {draft.references.map((ref) => (
                          <div
                            key={ref.id}
                            className="group relative size-16 overflow-hidden rounded-xl border border-line bg-cream"
                          >
                            <img src={ref.previewUrl} alt={ref.name} className="size-full object-cover" />
                            <button
                              type="button"
                              onClick={() => removeReference(ref.id)}
                              aria-label={`Remove ${ref.name}`}
                              className="absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-ink/80 text-white transition hover:bg-coral"
                            >
                              <Trash2 className="size-3" />
                            </button>
                          </div>
                        ))}

                        {draft.references.length < 5 && (
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className={cn(
                              'flex h-16 flex-1 min-w-[150px] items-center justify-center gap-2 rounded-xl border border-dashed px-3 text-xs font-medium transition',
                              isDragging
                                ? 'border-coral bg-coral-soft text-coral font-bold animate-pulse'
                                : 'border-ink/30 bg-paper text-ink-soft hover:border-ink hover:bg-cream/60 hover:text-ink',
                            )}
                          >
                            {isDragging ? (
                              <>
                                <Upload className="size-4 text-coral animate-bounce" />
                                <span>Drop Images to Add!</span>
                              </>
                            ) : (
                              <>
                                <ImagePlus className="size-4 text-coral" />
                                <span>Add / Drag & Drop Images</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>

                      {isDragging && (
                        <p className="mt-2 text-center text-[11px] font-semibold text-coral animate-pulse">
                          Release to add reference images (PNG, JPG, WebP)
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Mandatory Timestamped TOS Checkbox with Modal View */}
                  <div className="rounded-2xl border border-line bg-canvas p-3 space-y-2.5 shadow-2xs">
                    <div className="flex items-start justify-between gap-2.5">
                      <button
                        type="button"
                        onClick={toggleTos}
                        className="flex flex-1 items-start gap-2.5 text-left group"
                      >
                        <span
                          className={cn(
                            'mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border transition-colors',
                            draft.tosAccepted ? 'border-ink bg-ink text-white' : 'border-ink/40 bg-paper group-hover:border-ink',
                          )}
                        >
                          {draft.tosAccepted && <Check className="size-3.5" strokeWidth={3} />}
                        </span>
                        <div className="text-xs leading-snug text-ink-soft">
                          <span className="font-semibold text-ink group-hover:text-coral transition-colors">
                            I have read and agree to Meru Art’s Terms of Service
                          </span>{' '}
                          (refund tiers, 2–4 week turnaround, and strict anti-NFT/anti-AI policy).
                          {draft.tosAcceptedAt && (
                            <span className="mt-1 block text-[10px] font-medium text-teal">
                              ✓ Logged at {new Date(draft.tosAcceptedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </span>
                          )}
                        </div>
                      </button>
                    </div>

                    <div className="flex items-center justify-between border-t border-line/60 pt-2 text-[11px]">
                      <span className="text-ink-mute">Want to review full terms first?</span>
                      <button
                        type="button"
                        onClick={() => setIsTosModalOpen(true)}
                        className="inline-flex items-center gap-1 font-semibold text-coral hover:text-ink transition-colors"
                      >
                        <FileText className="size-3" />
                        <span>View Studio TOS Screen</span>
                      </button>
                    </div>
                  </div>

                  {step2Error && (
                    <p className="rounded-xl bg-coral-soft px-3 py-2 text-xs font-medium text-coral">{step2Error}</p>
                  )}
                </div>
              ) : (
                /* ================= STEP 3: REVIEW & SUBMIT GATE ================= */
                <div className="space-y-3.5">
                  {/* Order Review Card */}
                  <div className="rounded-2xl border border-line bg-canvas p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between border-b border-line pb-2.5">
                      <div>
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${accent.soft} ${accent.text}`}>
                          {tier.category}
                        </span>
                        <h3 className="mt-0.5 font-display text-xl font-semibold text-ink">
                          {tier.label} × {draft.characterCount}
                        </h3>
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] text-ink-mute">Total Quote</p>
                        <p className="font-display text-2xl font-semibold text-ink">
                          {formatRate(pricing.totalUsd)}
                        </p>
                      </div>
                    </div>

                    <dl className="grid grid-cols-2 gap-y-1.5 text-xs">
                      <dt className="text-ink-mute">Payment Split</dt>
                      <dd className="text-right font-medium text-ink">
                        {draft.paymentSplit === '50_50' ? '50% Upfront / 50% After Sketch' : '100% Upfront'}
                      </dd>

                      <dt className="text-ink-mute">Add-ons</dt>
                      <dd className="text-right font-medium text-ink">
                        {[
                          draft.addons.nsfw && 'NSFW (+50%)',
                          draft.addons.softFurry && 'Soft Furry (+50%)',
                          draft.addons.commercial && 'Commercial (+200%)',
                        ]
                          .filter(Boolean)
                          .join(', ') || 'None'}
                      </dd>

                      <dt className="text-ink-mute">Preferred Window</dt>
                      <dd className="text-right font-medium text-ink">
                        {draft.preferredStartDate ? formatShortDate(draft.preferredStartDate) : 'Flexible / Next Open'}
                      </dd>

                      <dt className="text-ink-mute">References</dt>
                      <dd className="text-right font-medium text-ink">{draft.references.length} file(s)</dd>
                    </dl>

                    <div className="rounded-xl bg-paper p-2.5 text-xs text-ink-soft ring-1 ring-line">
                      <p className="font-medium text-ink">
                        {draft.characterName ? `${draft.characterName}: ` : 'Brief: '}
                      </p>
                      <p className="mt-0.5 line-clamp-2">{draft.poseAndVibe}</p>
                    </div>
                  </div>

                  {/* Contact Handle */}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-ink">
                      Your Discord or Email (for order notifications)
                    </label>
                    <input
                      type="text"
                      value={draft.clientContact}
                      onChange={(e) => updateDraft({ clientContact: e.target.value })}
                      placeholder="e.g. yourhandle#0000 or you@example.com"
                      className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-xs text-ink placeholder:text-ink-mute focus:border-ink focus:outline-none"
                    />
                  </div>

                  {/* Auth Gate / Submit */}
                  <div className="space-y-2 rounded-2xl border border-line bg-cream/50 p-3.5">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                      <ShieldCheck className="size-4 text-teal" /> {user ? 'Confirm & Submit Brief' : 'Sign in & Submit Request'}
                    </p>
                    <p className="text-xs text-ink-soft">
                      No payment is charged now. Your brief enters <strong>{studioSettings.status === 'waitlist' ? 'Studio Waitlist' : 'Pending Review'}</strong> first until Meru accepts your slot.
                    </p>

                    {statusInfo.isClosed ? (
                      <div className="mt-2 rounded-xl border border-coral/30 bg-coral-soft p-3 text-center">
                        <p className="text-xs font-semibold text-coral">Submissions Currently Paused</p>
                        <p className="mt-1 text-[11px] text-ink-soft">
                          Meru Art Studio is closed for new requests. Your brief has been saved in your browser draft and can be submitted when slots reopen!
                        </p>
                        <button
                          type="button"
                          disabled
                          className="mt-3 flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-full bg-ink/30 py-3 text-xs font-semibold text-white/70"
                        >
                          Studio Closed · Submissions Disabled
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2 pt-2">
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => handleFinalSubmit('google')}
                          className="flex w-full items-center justify-center gap-2.5 rounded-full bg-ink py-3 text-xs font-semibold text-white shadow-xs transition hover:bg-coral disabled:opacity-50"
                        >
                          {!user && <BrandIcon id="google" className="size-4 fill-white" />}
                          <span>
                            {user
                              ? studioSettings.status === 'waitlist'
                                ? 'Join Studio Waitlist'
                                : 'Submit Commission Brief'
                              : studioSettings.status === 'waitlist'
                                ? 'Join Studio Waitlist with Google'
                                : 'Submit Commission Brief with Google'}
                          </span>
                        </button>
                      </div>
                    )}

                    {submitError && (
                      <div className="mt-2 flex flex-col gap-2 rounded-xl bg-coral-soft p-3 text-xs font-medium text-coral">
                        <div className="flex items-start justify-between gap-2">
                          <span className="leading-relaxed">{submitError}</span>
                          {submitError.includes('Pending Review') && (
                            <button
                              type="button"
                              onClick={() => {
                                closeDrawer();
                                setActiveTab('track');
                              }}
                              className="shrink-0 rounded-full bg-ink px-2.5 py-1 text-[11px] text-white"
                            >
                              View Active →
                            </button>
                          )}
                        </div>
                        {(submitError.includes('session expired') ||
                          submitError.includes('sign in again') ||
                          submitError.includes('foreign key') ||
                          submitError.includes('reset in the database')) && (
                          <button
                            type="button"
                            onClick={() => handleFinalSubmit('google')}
                            className="mt-1 inline-flex items-center justify-center gap-2 rounded-full bg-ink py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-coral"
                          >
                            <BrandIcon id="google" className="size-3.5 fill-white" />
                            <span>Sign In Fresh with Google</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Sticky Footer */}
            {!justSubmitted && (
              <div className="border-t border-line bg-canvas px-4 py-3 sm:px-5 sm:py-3.5">
                <div className="mb-2.5 flex items-center justify-between">
                  <div>
                    <span className="text-[11px] text-ink-mute">
                      {draft.paymentSplit === '50_50' ? 'Upfront deposit after approval (50%)' : 'Total upfront after approval'}
                    </span>
                    <div className="flex items-baseline gap-1.5">
                      <span className="font-display text-2xl font-semibold text-ink sm:text-3xl">
                        {formatRate(pricing.depositUsd)}
                      </span>
                      {draft.paymentSplit === '50_50' && (
                        <span className="text-xs text-ink-mute">
                          of {formatRate(pricing.totalUsd)} total
                        </span>
                      )}
                    </div>
                  </div>

                  <span className="rounded-full border border-line bg-paper px-2.5 py-1 text-[11px] font-medium text-ink-soft">
                    {currency === 'USD' ? 'PayPal' : 'GCash'}
                  </span>
                </div>

                <div className="flex gap-2">
                  {drawerStep > 1 && (
                    <button
                      type="button"
                      onClick={() => setDrawerStep((drawerStep - 1) as DrawerStep)}
                      className="inline-flex items-center justify-center gap-1 rounded-full border border-line bg-paper px-4 py-3 text-xs font-medium text-ink transition hover:bg-cream"
                    >
                      <ArrowLeft className="size-3.5" /> Back
                    </button>
                  )}

                  {drawerStep === 1 && (
                    <button
                      type="button"
                      onClick={() => setDrawerStep(2)}
                      className="flex flex-1 items-center justify-center gap-2 rounded-full bg-ink py-3 text-sm font-medium text-white transition-colors hover:bg-coral"
                    >
                      <Sparkles className="size-4 text-mustard" />
                      Next: Brief & References
                      <ArrowRight className="size-4" />
                    </button>
                  )}

                  {drawerStep === 2 && (
                    <button
                      type="button"
                      onClick={advanceFromStep2}
                      className="flex flex-1 items-center justify-center gap-2 rounded-full bg-ink py-3 text-sm font-medium text-white transition-colors hover:bg-coral"
                    >
                      <FileCheck2 className="size-4 text-mustard" />
                      Review Order Summary
                      <ArrowRight className="size-4" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>

    <TosModal
      isOpen={isTosModalOpen}
      onClose={() => setIsTosModalOpen(false)}
      isAccepted={draft.tosAccepted}
      acceptedAt={draft.tosAcceptedAt}
      onAcceptAndClose={() => {
        updateDraft({
          tosAccepted: true,
          tosAcceptedAt: new Date().toISOString(),
        });
        if (step2Error?.includes('Terms of Service')) setStep2Error(null);
        setIsTosModalOpen(false);
      }}
    />
    </>
  );
}

function SubmissionSuccess({
  order,
  onTrack,
  onNew,
}: {
  order: SubmittedOrder;
  onTrack: () => void;
  onNew: () => void;
}) {
  const { tiers, studioSettings } = useStudio();
  const tier = tiers.find((t) => t.id === order.tier) ?? tiers[0];
  const fmt = (usd: number) =>
    order.currency === 'USD'
      ? `$${usd}`
      : `₱${Math.round(usd * studioSettings.usdToPhpRate).toLocaleString('en-PH')}`;
  return (
    <div className="flex flex-col items-center py-6 text-center">
      <div className="grid size-14 place-items-center rounded-2xl bg-teal-soft text-teal">
        <CheckCircle2 className="size-7" />
      </div>
      <span className="mt-3 rounded-full bg-mustard-soft px-3 py-0.5 text-xs font-semibold text-[#b9800f]">
        Order #{order.id} · Pending Artist Review
      </span>
      <h3 className="mt-2 font-display text-3xl font-semibold text-ink">Brief Sent to Meru!</h3>
      <p className="mt-1 max-w-sm text-xs leading-relaxed text-ink-soft">
        Your <strong>{tier.label}</strong> request ({fmt(order.totalUsd)}) is now in{' '}
        <strong>Pending Review</strong>. Once Meru approves your brief, your{' '}
        <strong>{fmt(order.depositUsd)}</strong> deposit gate unlocks in the Track Order room.
      </p>

      <div className="mt-5 w-full rounded-2xl border border-line bg-canvas p-3.5 text-left text-xs space-y-1.5">
        <div className="flex justify-between">
          <span className="text-ink-mute">Auth Mode</span>
          <span className="font-medium text-ink uppercase">{order.authMethod}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-ink-mute">TOS Accepted</span>
          <span className="font-medium text-teal">
            {order.tosAcceptedAt ? new Date(order.tosAcceptedAt).toLocaleString() : 'Verified'}
          </span>
        </div>
        {order.preferredStartDate && (
          <div className="flex justify-between">
            <span className="text-ink-mute">Preferred Window</span>
            <span className="inline-flex items-center gap-1 font-medium text-ink">
              <Calendar className="size-3 text-coral" />
              {formatShortDate(order.preferredStartDate)}
            </span>
          </div>
        )}
      </div>

      <div className="mt-6 flex w-full flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onTrack}
          className="flex-1 rounded-full bg-ink py-3 text-xs font-medium text-white transition hover:bg-coral sm:text-sm"
        >
          Open Order Tracker →
        </button>
        <button
          type="button"
          onClick={onNew}
          className="rounded-full border border-line bg-canvas px-4 py-3 text-xs font-medium text-ink transition hover:bg-cream"
        >
          Start Another Quote
        </button>
      </div>
    </div>
  );
}
