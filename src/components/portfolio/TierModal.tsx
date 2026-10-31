import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Check, Sparkles, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ADDON_RATES, PORTFOLIO, TIERS } from '@/data/artist';
import { useStudio } from '@/context/StudioContext';
import { ACCENT_CLASSES, TIER_ACCENT, cn, formatUsd, getTier } from '@/lib/utils';
import { lockScroll } from '@/lib/smoothScroll';
import { EASE } from '@/components/ui/Reveal';
import { ArtImage } from './ArtImage';
import type { TierId } from '@/types';

const USD_TO_PHP = 58;

const formatMoney = (usd: number, currency: 'USD' | 'PHP') =>
  currency === 'USD'
    ? formatUsd(usd)
    : new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(
        Math.round(usd * USD_TO_PHP),
      );

const TIER_PREVIEW: Record<TierId, { slug: string; pos: string }> = {
  headshot: { slug: 'deku-inktober', pos: 'object-[50%_42%]' },
  halfbody: { slug: 'velimer-dnd', pos: 'object-[50%_20%]' },
  fullbody: { slug: 'kitsunegem', pos: 'object-[50%_18%]' },
  chibi: { slug: 'chibi-universe', pos: 'object-center' },
  graphics: { slug: 'thumb-gacha-gems', pos: 'object-center' },
};

/**
 * Clean, clutter-free Commission Price Calculator sheet.
 * Designed so every control (Tier, Add-ons, Currency, Payment Split, and Total)
 * fits comfortably on a single phone screen without nested boxes or repeated titles.
 */
export function TierModal() {
  const { drawerOpen, closeDrawer, selectedTier, commissionTier, openLightbox, showToast } = useStudio();
  const tierId: TierId = selectedTier ?? 'fullbody';
  const tier = getTier(tierId);
  const accent = ACCENT_CLASSES[TIER_ACCENT[tierId]];
  const preview = TIER_PREVIEW[tierId];

  const [currency, setCurrency] = useState<'USD' | 'PHP'>('USD');
  const [split, setSplit] = useState<'50' | '100'>('50');
  const [addons, setAddons] = useState({ nsfw: false, softFurry: false, commercial: false });

  useEffect(() => {
    if (!drawerOpen) return;
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

  const { totalUsd, depositUsd } = useMemo(() => {
    let mult = 1;
    if (addons.nsfw) mult += ADDON_RATES.nsfw;
    if (addons.softFurry) mult += ADDON_RATES.softFurry;
    if (addons.commercial) mult += ADDON_RATES.commercial;
    const total = Math.round(tier.basePriceUsd * mult);
    const deposit = split === '100' ? total : Math.ceil(total / 2);
    return { totalUsd: total, depositUsd: deposit };
  }, [tier.basePriceUsd, addons, split]);

  return (
    <AnimatePresence>
      {drawerOpen && (
        <motion.div
          key="tier-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Commission Calculator"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={closeDrawer}
          className="fixed inset-0 z-[85] flex items-end justify-end bg-ink/50 backdrop-blur-sm sm:items-stretch"
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ duration: 0.38, ease: EASE }}
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-[28px] border-t border-line bg-paper sm:h-full sm:max-h-none sm:max-w-md sm:rounded-none sm:rounded-l-[32px] sm:border-t-0 sm:border-l"
          >
            {/* Mobile grab handle */}
            <div className="flex justify-center pt-2.5 sm:hidden">
              <span className="h-1 w-10 rounded-full bg-line" />
            </div>

            {/* Clean Top Bar: Title + Currency Pill + Close */}
            <div className="flex items-center justify-between gap-2 px-5 pt-3 pb-3.5 sm:pt-5">
              <div>
                <p className="text-[11px] font-medium tracking-wider text-coral uppercase">Instant Quote</p>
                <h2 className="font-display text-2xl font-semibold text-ink">Commission Calculator</h2>
              </div>

              <div className="flex items-center gap-2">
                {/* Inline currency switcher */}
                <div className="inline-flex rounded-full border border-line bg-canvas p-0.5 text-xs font-medium">
                  {(['USD', 'PHP'] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCurrency(c)}
                      className={cn(
                        'rounded-full px-2.5 py-1 transition-colors',
                        currency === c ? 'bg-ink text-white' : 'text-ink-mute hover:text-ink',
                      )}
                    >
                      {c === 'USD' ? '$ USD' : '₱ PHP'}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={closeDrawer}
                  aria-label="Close calculator"
                  className="grid size-8 place-items-center rounded-full border border-line bg-canvas text-ink-soft transition hover:text-ink"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            {/* Horizontal swipeable Style Selector */}
            <div className="no-scrollbar flex gap-1.5 overflow-x-auto border-y border-line bg-canvas/60 px-5 py-2.5">
              {TIERS.map((t) => {
                const active = t.id === tierId;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => commissionTier(t.id)}
                    className={cn(
                      'shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all',
                      active
                        ? 'bg-ink text-white shadow-xs'
                        : 'border border-line bg-paper text-ink-soft hover:border-ink/30 hover:text-ink',
                    )}
                  >
                    {t.label}
                    <span className={cn('ml-1.5', active ? 'text-mustard' : 'text-ink-mute')}>
                      {formatMoney(t.basePriceUsd, currency)}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Main body — airy, zero nested card clutter */}
            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
              {/* Compact Selected Tier Summary Card */}
              <div className="flex items-center gap-3.5 rounded-2xl border border-line bg-canvas/70 p-3">
                <button
                  type="button"
                  onClick={() => {
                    if (sampleIds.length > 0) {
                      closeDrawer();
                      openLightbox(sampleIds, 0);
                    }
                  }}
                  title="Tap to view examples"
                  className="group relative size-16 shrink-0 overflow-hidden rounded-xl border border-line bg-cream sm:size-20"
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
                    <div className="flex items-center gap-2">
                      <h3 className="font-display text-xl font-semibold text-ink">{tier.label}</h3>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${accent.soft} ${accent.text}`}>
                        {tier.category}
                      </span>
                    </div>
                    <span className="font-display text-xl font-semibold text-ink">
                      {formatMoney(tier.basePriceUsd, currency)}
                    </span>
                  </div>

                  <p className="mt-0.5 text-xs text-ink-soft">{tier.description}</p>
                  <p className="mt-1.5 text-[11px] font-medium text-teal">
                    ✓ {tier.includes.join('  ·  ✓ ')}
                  </p>
                </div>
              </div>

              {/* Add-ons as clean tap chips */}
              <div>
                <div className="mb-2 flex items-center justify-between">
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
                    const active = addons[item.key];
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => setAddons((a) => ({ ...a, [item.key]: !a[item.key] }))}
                        className={cn(
                          'flex flex-col items-start justify-between rounded-2xl border p-3 text-left transition-all',
                          active
                            ? 'border-ink bg-ink text-white'
                            : 'border-line bg-paper text-ink hover:border-ink/30',
                        )}
                      >
                        <div className="flex w-full items-center justify-between">
                          <span
                            className={cn(
                              'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                              active ? 'bg-mustard text-ink' : 'bg-mustard-soft text-[#b9800f]',
                            )}
                          >
                            {item.rate}
                          </span>
                          {active && <Check className="size-3.5 text-mustard" strokeWidth={3} />}
                        </div>
                        <p className="mt-2 font-display text-base leading-tight font-semibold">{item.label}</p>
                        <p className={cn('text-[11px]', active ? 'text-white/70' : 'text-ink-mute')}>{item.sub}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Payment Split Choice */}
              <div>
                <span className="mb-2 block text-xs font-medium text-ink">How would you like to pay?</span>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      {
                        id: '50',
                        title: '50% / 50% Split',
                        sub: `${formatMoney(Math.ceil(totalUsd / 2), currency)} now · rest after sketch`,
                      },
                      {
                        id: '100',
                        title: '100% Upfront',
                        sub: `${formatMoney(totalUsd, currency)} single payment`,
                      },
                    ] as const
                  ).map((plan) => {
                    const active = split === plan.id;
                    return (
                      <button
                        key={plan.id}
                        type="button"
                        onClick={() => setSplit(plan.id)}
                        className={cn(
                          'rounded-2xl border p-3 text-left transition-all',
                          active ? 'border-ink bg-cream/70 ring-1 ring-ink' : 'border-line bg-paper hover:border-ink/30',
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-display text-base font-semibold text-ink">{plan.title}</span>
                          <span
                            className={cn(
                              'grid size-4 place-items-center rounded-full border',
                              active ? 'border-ink bg-ink text-white' : 'border-line',
                            )}
                          >
                            {active && <Check className="size-2.5" strokeWidth={3} />}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-ink-soft">{plan.sub}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Clean Sticky Footer */}
            <div className="border-t border-line bg-canvas px-5 py-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <span className="text-xs text-ink-mute">
                    {split === '50' ? 'Due to start (50% deposit)' : 'Total due upfront'}
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="font-display text-3xl font-semibold text-ink">
                      {formatMoney(depositUsd, currency)}
                    </span>
                    {split === '50' && (
                      <span className="text-xs text-ink-mute">
                        of {formatMoney(totalUsd, currency)} total
                      </span>
                    )}
                  </div>
                </div>

                <span className="rounded-full border border-line bg-paper px-3 py-1 text-[11px] font-medium text-ink-soft">
                  {currency === 'USD' ? 'PayPal' : 'GCash'}
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  closeDrawer();
                  showToast(
                    `${tier.label} (${formatMoney(totalUsd, currency)}) saved! Reference upload & submit unlock in Phase 2.`,
                  );
                }}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-ink py-3.5 text-sm font-medium text-white transition-colors hover:bg-coral"
              >
                <Sparkles className="size-4 text-mustard" />
                Select {tier.label} · {formatMoney(depositUsd, currency)}
                <ArrowRight className="size-4" />
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
