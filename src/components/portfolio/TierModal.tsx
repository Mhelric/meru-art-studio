import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  CheckCircle2,
  Eye,
  FileCheck2,
  ImagePlus,
  Minus,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { PORTFOLIO, TIERS } from '@/data/artist';
import { calculateOrderPricing, useStudio, type DrawerStep } from '@/context/StudioContext';
import { ACCENT_CLASSES, TIER_ACCENT, cn, formatMoney, formatShortDate, getTier } from '@/lib/utils';
import { lockScroll } from '@/lib/smoothScroll';
import { EASE } from '@/components/ui/Reveal';
import { BrandIcon } from '@/components/ui/BrandIcon';
import { ArtImage } from './ArtImage';
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
    openLightbox,
    submitOrder,
    setActiveTab,
    showToast,
  } = useStudio();

  const [justSubmitted, setJustSubmitted] = useState<SubmittedOrder | null>(null);
  const [step2Error, setStep2Error] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const tierId = draft.tier;
  const tier = getTier(tierId);
  const accent = ACCENT_CLASSES[TIER_ACCENT[tierId]];
  const preview = TIER_PREVIEW[tierId];
  const currency = draft.currency;

  const pricing = useMemo(() => calculateOrderPricing(draft), [draft]);

  useEffect(() => {
    if (!drawerOpen) {
      setJustSubmitted(null);
      setStep2Error(null);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDrawer();
    };
    lockScroll(true);
    window.addEventListener('keydown', onKey);
    return () => {
      lockScroll(false);
      window.removeEventListener('keydown', onKey);
    };
  }, [drawerOpen, closeDrawer]);

  const samples = useMemo(() => PORTFOLIO.filter((p) => p.tier === tierId), [tierId]);
  const sampleIds = useMemo(() => samples.map((s) => s.id), [samples]);

  const handleFilesSelected = (e: ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const added: ReferenceFile[] = Array.from(fileList)
      .slice(0, 5 - draft.references.length)
      .map((f) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: f.name,
        sizeBytes: f.size,
        previewUrl: URL.createObjectURL(f),
      }));

    updateDraft({ references: [...draft.references, ...added] });
    e.target.value = '';
  };

  const removeReference = (id: string) => {
    const target = draft.references.find((r) => r.id === id);
    if (target) URL.revokeObjectURL(target.previewUrl);
    updateDraft({ references: draft.references.filter((r) => r.id !== id) });
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
    if (!draft.tosAccepted) {
      setStep2Error('Please agree to the Terms of Service to continue.');
      return;
    }
    setStep2Error(null);
    setDrawerStep(3);
  };

  const handleFinalSubmit = (method: SubmittedOrder['authMethod']) => {
    const created = submitOrder(method);
    setJustSubmitted(created);
    showToast(`Brief ${created.id} submitted to Pending Review!`);
  };

  return (
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
              <div>
                <h2 className="font-display text-xl font-semibold text-ink sm:text-2xl">
                  {justSubmitted ? 'Request Received!' : 'Commission Request'}
                </h2>
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
            <div className="flex-1 overflow-y-auto px-4 py-3.5 sm:px-5 sm:py-4">
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
                      {TIERS.map((t) => {
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
                              {formatMoney(t.basePriceUsd, currency)}
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
                          { key: 'nsfw', label: 'NSFW', sub: 'Soft / tasteful', rate: '+50%' },
                          { key: 'softFurry', label: 'Soft Furry', sub: 'Kemonomimi', rate: '+50%' },
                          { key: 'commercial', label: 'Commercial', sub: 'Merch / streams', rate: '+200%' },
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
                            sub: `${formatMoney(Math.ceil(pricing.totalUsd / 2), currency)} now · rest after sketch`,
                          },
                          {
                            id: '100_upfront',
                            title: '100% Upfront',
                            sub: `${formatMoney(pricing.totalUsd, currency)} single payment`,
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
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-ink">Character / Subject Name</label>
                      <input
                        type="text"
                        value={draft.characterName}
                        onChange={(e) => updateDraft({ characterName: e.target.value })}
                        placeholder="e.g. Kitsune OC, Frieren"
                        className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-xs text-ink placeholder:text-ink-mute focus:border-ink focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-ink">Preferred Start Date</label>
                      <div className="relative">
                        <input
                          type="date"
                          value={draft.preferredStartDate ?? '2026-11-05'}
                          onChange={(e) => updateDraft({ preferredStartDate: e.target.value })}
                          className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-xs text-ink focus:border-ink focus:outline-none"
                        />
                      </div>
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

                  {/* Reference Image Uploader */}
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-xs font-medium text-ink">Character Reference Sheets (up to 5)</span>
                      <span className="text-[11px] text-ink-mute">{draft.references.length}/5 attached</span>
                    </div>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleFilesSelected}
                      className="hidden"
                    />

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
                            className="absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-ink/80 text-white"
                          >
                            <Trash2 className="size-3" />
                          </button>
                        </div>
                      ))}

                      {draft.references.length < 5 && (
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="flex h-16 flex-1 min-w-[140px] items-center justify-center gap-2 rounded-2xl border border-dashed border-ink/30 bg-canvas px-3 text-xs font-medium text-ink-soft transition hover:border-ink hover:bg-cream/60 hover:text-ink"
                        >
                          <ImagePlus className="size-4 text-coral" />
                          <span>Add Reference Images</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Mandatory Timestamped TOS Checkbox */}
                  <div className="rounded-2xl border border-line bg-canvas p-3">
                    <button
                      type="button"
                      onClick={toggleTos}
                      className="flex w-full items-start gap-2.5 text-left"
                    >
                      <span
                        className={cn(
                          'mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border transition-colors',
                          draft.tosAccepted ? 'border-ink bg-ink text-white' : 'border-ink/40 bg-paper',
                        )}
                      >
                        {draft.tosAccepted && <Check className="size-3.5" strokeWidth={3} />}
                      </span>
                      <div className="text-xs leading-snug text-ink-soft">
                        <span className="font-medium text-ink">
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
                          {formatMoney(pricing.totalUsd, currency)}
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

                  {/* Auth Gate + Recruiter Demo Mode */}
                  <div className="space-y-2 rounded-2xl border border-line bg-cream/50 p-3.5">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                      <ShieldCheck className="size-4 text-teal" /> Sign in & Submit Request
                    </p>
                    <p className="text-[11px] text-ink-soft">
                      No payment is charged now. Your brief enters <strong>Pending Review</strong> first until Meru accepts your slot.
                    </p>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleFinalSubmit('discord')}
                        className="flex items-center justify-center gap-2 rounded-full bg-[#5865F2] py-2.5 text-xs font-medium text-white transition hover:opacity-95"
                      >
                        <BrandIcon id="discord" className="size-3.5" />
                        Continue with Discord
                      </button>
                      <button
                        type="button"
                        onClick={() => handleFinalSubmit('google')}
                        className="flex items-center justify-center gap-2 rounded-full border border-line bg-paper py-2.5 text-xs font-medium text-ink transition hover:bg-canvas"
                      >
                        <span className="font-bold text-coral">G</span>
                        Continue with Google
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleFinalSubmit('demo')}
                      className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-full border border-dashed border-ink/35 bg-paper py-2 text-xs font-medium text-ink transition hover:border-ink hover:bg-ink hover:text-white"
                    >
                      <Eye className="size-3.5 text-coral" />
                      Recruiter / Visitor Demo Submit (No Login Needed)
                    </button>
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
                        {formatMoney(pricing.depositUsd, currency)}
                      </span>
                      {draft.paymentSplit === '50_50' && (
                        <span className="text-xs text-ink-mute">
                          of {formatMoney(pricing.totalUsd, currency)} total
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
  const tier = getTier(order.tier);
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
        Your <strong>{tier.label}</strong> request ({formatMoney(order.totalUsd, order.currency)}) is now in{' '}
        <strong>Pending Review</strong>. Once Meru approves your brief, your{' '}
        <strong>{formatMoney(order.depositUsd, order.currency)}</strong> deposit gate unlocks in the Track Order room.
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
