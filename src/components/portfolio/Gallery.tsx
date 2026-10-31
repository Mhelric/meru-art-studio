import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { ArrowUpRight, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { PORTFOLIO, TIERS } from '@/data/artist';
import { useStudio } from '@/context/StudioContext';
import { ACCENT_CLASSES, TIER_ACCENT, cn, formatUsd, getTier } from '@/lib/utils';
import type { GalleryFilter } from '@/types';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { EASE } from '@/components/ui/Reveal';
import { ArtImage } from './ArtImage';

const FILTERS: { id: GalleryFilter; label: string }[] = [
  { id: 'all', label: 'All Work' },
  ...TIERS.map((t) => ({ id: t.id, label: t.filterLabel })),
];

export function Gallery() {
  const { commissionTier, openLightbox } = useStudio();
  const [filter, setFilter] = useState<GalleryFilter>('all');

  const items = useMemo(() => (filter === 'all' ? PORTFOLIO : PORTFOLIO.filter((p) => p.tier === filter)), [filter]);
  const itemIds = useMemo(() => items.map((p) => p.id), [items]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: PORTFOLIO.length };
    PORTFOLIO.forEach((p) => (c[p.tier] = (c[p.tier] ?? 0) + 1));
    return c;
  }, []);

  return (
    <section id="gallery" className="scroll-mt-24 pt-6">
      <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <SectionHeading
          eyebrow="Selected Works"
          title="Browse my recent illustrations & graphics"
          subtitle="Click any piece to inspect full resolution, or commission that exact tier in one click."
        />

        {/* Filter pills */}
        <div role="tablist" aria-label="Filter portfolio" className="mb-10 flex flex-wrap gap-1.5">
          {FILTERS.map((f) => {
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(f.id)}
                className={cn(
                  'relative rounded-full px-4 py-2 text-xs font-medium transition-colors sm:text-sm',
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

      {/* Editorial masonry grid */}
      <LayoutGroup>
        <motion.div layout className="columns-1 gap-5 sm:columns-2 lg:columns-3">
          <AnimatePresence mode="popLayout">
            {items.map((item, i) => {
              const tier = getTier(item.tier);
              const accent = ACCENT_CLASSES[TIER_ACCENT[item.tier]];
              return (
                <motion.article
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.45, ease: EASE }}
                  className="group card mb-5 break-inside-avoid overflow-hidden p-2.5 transition-colors hover:border-ink/25"
                >
                  <button
                    type="button"
                    onClick={() => openLightbox(itemIds, i)}
                    aria-label={`Inspect ${item.title}`}
                    className="relative block w-full overflow-hidden rounded-2xl text-left"
                  >
                    <ArtImage slug={item.slug} alt={item.title} size="sm" imgClassName="group-hover:scale-[1.03]" />
                    <span className="absolute top-3 right-3 grid size-8 place-items-center rounded-full border border-line bg-paper/90 text-ink opacity-0 backdrop-blur transition-opacity duration-300 group-hover:opacity-100">
                      <ArrowUpRight className="size-4" />
                    </span>
                  </button>

                  <div className="flex items-center justify-between gap-3 px-2 pt-3 pb-1">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${accent.soft} ${accent.text}`}>
                          <span className={`size-1.5 rounded-full ${accent.dot}`} />
                          {tier.label}
                        </span>
                        {item.tags.slice(0, 2).map((t) => (
                          <span key={t} className="text-xs text-ink-mute">
                            · {t}
                          </span>
                        ))}
                      </div>
                      <h3 className="mt-1 truncate font-display text-xl font-semibold text-ink">{item.title}</h3>
                    </div>

                    <button
                      type="button"
                      onClick={() => commissionTier(item.tier)}
                      title={`Commission ${tier.label} (${formatUsd(tier.basePriceUsd)})`}
                      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line bg-canvas px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-ink hover:bg-ink hover:text-white"
                    >
                      <Sparkles className="size-3 text-coral" />
                      {formatUsd(tier.basePriceUsd)}
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
