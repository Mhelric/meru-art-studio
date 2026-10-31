import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Sparkles, X } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { PORTFOLIO } from '@/data/artist';
import { useStudio } from '@/context/StudioContext';
import { ACCENT_CLASSES, TIER_ACCENT, formatUsd, getTier } from '@/lib/utils';
import { lockScroll } from '@/lib/smoothScroll';
import { EASE } from '@/components/ui/Reveal';
import { ArtImage } from './ArtImage';

export function Lightbox() {
  const { lightbox, setLightboxIndex, closeLightbox, commissionTier } = useStudio();

  const items = useMemo(
    () => (lightbox ? lightbox.ids.map((id) => PORTFOLIO.find((p) => p.id === id)!).filter(Boolean) : []),
    [lightbox],
  );
  const index = lightbox?.index ?? null;
  const item = index !== null ? items[index] : null;

  useEffect(() => {
    if (index === null || items.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowRight') setLightboxIndex((index + 1) % items.length);
      if (e.key === 'ArrowLeft') setLightboxIndex((index - 1 + items.length) % items.length);
    };
    lockScroll(true);
    window.addEventListener('keydown', onKey);
    return () => {
      lockScroll(false);
      window.removeEventListener('keydown', onKey);
    };
  }, [index, items.length, closeLightbox, setLightboxIndex]);

  const tier = item ? getTier(item.tier) : null;
  const accent = item ? ACCENT_CLASSES[TIER_ACCENT[item.tier]] : null;

  return (
    <AnimatePresence>
      {item && tier && accent && index !== null && (
        <motion.div
          key="lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={item.title}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onClick={closeLightbox}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/60 p-4 backdrop-blur-md"
        >
          <button
            onClick={closeLightbox}
            aria-label="Close"
            className="absolute top-4 right-4 z-10 grid size-10 place-items-center rounded-full border border-line bg-paper text-ink transition hover:bg-cream"
          >
            <X className="size-5" />
          </button>

          {items.length > 1 && (
            <>
              <NavArrow side="left" onClick={() => setLightboxIndex((index - 1 + items.length) % items.length)} />
              <NavArrow side="right" onClick={() => setLightboxIndex((index + 1) % items.length)} />
            </>
          )}

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.35, ease: EASE }}
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-[32px] border border-line bg-paper md:flex-row"
          >
            <div className="relative flex min-h-0 flex-1 items-center justify-center bg-cream/60 p-4 sm:p-6">
              <AnimatePresence mode="wait">
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25, ease: EASE }}
                  className="flex max-h-[58vh] w-full items-center justify-center md:max-h-[82vh]"
                >
                  <ArtImage
                    slug={item.slug}
                    alt={item.title}
                    size="full"
                    keepAspect={false}
                    eager
                    className="max-h-[58vh] w-auto rounded-2xl bg-transparent md:max-h-[80vh]"
                    imgClassName="max-h-[58vh] w-auto object-contain md:max-h-[80vh]"
                  />
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="flex w-full shrink-0 flex-col gap-5 border-t border-line p-6 md:w-80 md:border-t-0 md:border-l">
              <div>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${accent.soft} ${accent.text}`}>
                  <span className={`size-1.5 rounded-full ${accent.dot}`} />
                  {tier.category} · {tier.label}
                </span>
                <h3 className="mt-3 font-display text-3xl font-semibold text-ink">{item.title}</h3>
                <p className="mt-1 text-xs text-ink-mute">
                  Piece {index + 1} of {items.length}
                </p>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {item.tags.map((t) => (
                  <span key={t} className="chip">
                    {t}
                  </span>
                ))}
              </div>

              <div className="rounded-2xl border border-line bg-canvas p-4">
                <p className="text-xs font-medium text-ink-mute">{tier.label} tier starts at</p>
                <p className="mt-1 font-display text-3xl font-semibold text-ink">
                  {formatUsd(tier.basePriceUsd)}
                  {tier.priceNote && <span className="ml-1 font-sans text-xs font-normal text-ink-mute">/ {tier.priceNote}</span>}
                </p>
                <p className="mt-1 text-xs text-ink-soft">{tier.description}</p>
              </div>

              <button
                onClick={() => {
                  closeLightbox();
                  commissionTier(item.tier);
                }}
                className="mt-auto inline-flex items-center justify-center gap-2 rounded-full bg-ink px-5 py-3.5 text-sm font-medium text-white transition-colors hover:bg-coral"
              >
                <Sparkles className="size-4" /> Commission This Style
              </button>
              <p className="text-center text-[11px] text-ink-mute">Use ← → arrow keys to browse · Esc to close</p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function NavArrow({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight;
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={side === 'left' ? 'Previous artwork' : 'Next artwork'}
      className={`absolute top-1/2 z-10 hidden size-11 -translate-y-1/2 place-items-center rounded-full border border-line bg-paper text-ink transition hover:bg-cream md:grid ${
        side === 'left' ? 'left-5' : 'right-5'
      }`}
    >
      <Icon className="size-5" />
    </button>
  );
}
