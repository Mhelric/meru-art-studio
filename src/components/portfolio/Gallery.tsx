import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { ArrowUpRight, Sparkles } from 'lucide-react';
import { useMemo } from 'react';
import { PORTFOLIO, TIERS } from '@/data/artist';
import { useStudio } from '@/context/StudioContext';
import { ACCENT_CLASSES, TIER_ACCENT, cn, formatMoney, getTier } from '@/lib/utils';
import type { GalleryFilter } from '@/types';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { EASE } from '@/components/ui/Reveal';
import { ArtImage } from './ArtImage';

const FILTERS: { id: GalleryFilter; label: string }[] = [
  { id: 'all', label: 'All Work' },
  ...TIERS.map((t) => ({ id: t.id, label: t.filterLabel })),
];

export function Gallery() {
  const { commissionTier, openLightbox, galleryFilter, setGalleryFilter, tiers, currency, studioSettings } = useStudio();

  const items = useMemo(
    () => (galleryFilter === 'all' ? PORTFOLIO : PORTFOLIO.filter((p) => p.tier === galleryFilter)),
    [galleryFilter],
  );
  const itemIds = useMemo(() => items.map((p) => p.id), [items]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: PORTFOLIO.length };
    PORTFOLIO.forEach((p) => (c[p.tier] = (c[p.tier] ?? 0) + 1));
    return c;
  }, []);

  return (
    <section id="gallery" className="pt-6 sm:pt-10">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end md:gap-6">
        <SectionHeading
          eyebrow="Selected Works"
          title="Browse my recent illustrations & graphics"
          subtitle="Tap any piece to inspect full resolution, or tap its price pill to commission that style."
        />

        {/* Filter pills — horizontal swipeable strip on mobile, wrap on desktop */}
        <div
          role="tablist"
          aria-label="Filter portfolio"
          className="no-scrollbar -mx-4 mb-6 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:mb-10 sm:flex-wrap sm:overflow-visible sm:px-0"
        >
          {FILTERS.map((f) => {
            const active = galleryFilter === f.id;
            return (
              <button
                key={f.id}
                role="tab"
                aria-selected={active}
                onClick={() => setGalleryFilter(f.id)}
                className={cn(
                  'relative shrink-0 rounded-full px-3.5 py-2 text-xs font-medium whitespace-nowrap transition-colors sm:px-4 sm:text-sm',
                  active ? 'text-white' : 'border border-line bg-paper text-ink-soft hover:border-ink/30 hover:text-ink',
                )}
              >
                {active && (
                  <motion.span
                    layoutId="filter-pill"
                    className="absolute inset-0 rounded-full bg-ink"
                    transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                  />
                )}
                <span className="relative flex items-center gap-1.5">
                  {f.label}
                  <span className={cn('text-[11px]', active ? 'text-white/70' : 'text-ink-mute')}>{counts[f.id] ?? 0}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Responsive masonry grid: 2 columns on phones so artwork is compact & scannable, 3 on lg */}
      <LayoutGroup>
        <motion.div layout className="columns-2 gap-3 sm:gap-5 lg:columns-3">
          <AnimatePresence mode="popLayout">
            {items.map((item, i) => {
              const tier = tiers.find((t) => t.id === item.tier) ?? getTier(item.tier);
              const accent = ACCENT_CLASSES[TIER_ACCENT[item.tier]];
              const priceLabel = formatMoney(tier.basePriceUsd, currency, studioSettings.usdToPhpRate);
              return (
                <motion.article
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.45, ease: EASE }}
                  className="group card mb-3 break-inside-avoid overflow-hidden p-1.5 transition-colors hover:border-ink/25 sm:mb-5 sm:p-2.5"
                >
                  <button
                    type="button"
                    onClick={() => openLightbox(itemIds, i)}
                    aria-label={`Inspect ${item.title}`}
                    className="relative block w-full overflow-hidden rounded-xl text-left sm:rounded-2xl"
                  >
                    <ArtImage slug={item.slug} alt={item.title} size="sm" imgClassName="group-hover:scale-[1.03]" />
                    <span className="absolute top-2 right-2 grid size-7 place-items-center rounded-full border border-line bg-paper/90 text-ink opacity-0 backdrop-blur transition-opacity duration-300 group-hover:opacity-100 sm:top-3 sm:right-3 sm:size-8">
                      <ArrowUpRight className="size-3.5 sm:size-4" />
                    </span>
                  </button>

                  <div className="flex flex-col gap-1.5 px-1.5 pt-2 pb-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-2 sm:pt-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium sm:px-2.5 sm:text-[11px] ${accent.soft} ${accent.text}`}>
                          <span className={`size-1.5 rounded-full ${accent.dot}`} />
                          {tier.label}
                        </span>
                        {item.tags.slice(0, 1).map((t) => (
                          <span key={t} className="hidden text-xs text-ink-mute sm:inline">
                            · {t}
                          </span>
                        ))}
                      </div>
                      <h3 className="mt-0.5 truncate font-display text-base font-semibold text-ink sm:mt-1 sm:text-xl">
                        {item.title}
                      </h3>
                    </div>

                    <button
                      type="button"
                      onClick={() => commissionTier(item.tier)}
                      title={`Commission ${tier.label} (${priceLabel})`}
                      className="inline-flex w-full shrink-0 items-center justify-center gap-1 rounded-full border border-line bg-canvas px-2.5 py-1 text-[11px] font-medium text-ink transition-colors hover:border-ink hover:bg-ink hover:text-white sm:w-auto sm:px-3 sm:py-1.5 sm:text-xs"
                    >
                      <Sparkles className="size-3 text-coral" />
                      <span>Commission · {priceLabel}</span>
                    </button>
                  </div>
                </motion.article>
              );
            })}
          </AnimatePresence>
        </motion.div>
      </LayoutGroup>
    </section>
  );
}
