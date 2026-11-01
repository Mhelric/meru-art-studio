import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Sparkles, X } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
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

  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (index === null || items.length === 0) return;
    previouslyFocusedElementRef.current = document.activeElement as HTMLElement;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowRight') setLightboxIndex((index + 1) % items.length);
      if (e.key === 'ArrowLeft') setLightboxIndex((index - 1 + items.length) % items.length);

      if (e.key === 'Tab' && containerRef.current) {
        const focusable = containerRef.current.querySelectorAll<HTMLElement>(
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
  }, [index, items.length, closeLightbox, setLightboxIndex]);

  const tier = item ? getTier(item.tier) : null;
  const accent = item ? ACCENT_CLASSES[TIER_ACCENT[item.tier]] : null;

  const prevItem = () => {
    if (index !== null && items.length > 1) setLightboxIndex((index - 1 + items.length) % items.length);
  };
  const nextItem = () => {
    if (index !== null && items.length > 1) setLightboxIndex((index + 1) % items.length);
  };

  return (
    <AnimatePresence>
      {item && tier && accent && index !== null && (
        <motion.div
          key="lightbox"
          ref={containerRef}
          role="dialog"
          aria-modal="true"
          aria-label={item.title}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          onClick={closeLightbox}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/65 p-3 backdrop-blur-md sm:p-5"
        >
          {/* Desktop side arrows */}
          {items.length > 1 && (
            <>
              <DesktopNavArrow side="left" onClick={prevItem} />
              <DesktopNavArrow side="right" onClick={nextItem} />
            </>
          )}

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.32, ease: EASE }}
            onClick={(e) => e.stopPropagation()}
            className="relative flex max-h-[90dvh] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] border border-line bg-paper shadow-xl md:flex-row"
          >
            {/* Close button — anchored inside the card so it is never half-outside */}
            <button
              type="button"
              onClick={closeLightbox}
              aria-label="Close"
              className="absolute top-3 right-3 z-20 grid size-9 place-items-center rounded-full border border-line bg-paper/95 text-ink shadow-xs backdrop-blur transition hover:bg-cream"
            >
              <X className="size-4" />
            </button>

            {/* Artwork stage — strict height cap + overflow-hidden so tall portraits never spill over the title below */}
            <div className="relative flex h-[48dvh] shrink-0 items-center justify-center overflow-hidden bg-cream/60 p-3 sm:h-[54dvh] md:h-auto md:max-h-[84dvh] md:flex-1 md:p-6">
              <AnimatePresence mode="wait">
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.22, ease: EASE }}
                  className="flex size-full items-center justify-center"
                >
                  <ArtImage
                    slug={item.slug}
                    alt={item.title}
                    size="full"
                    keepAspect={false}
                    eager
                    className="flex size-full items-center justify-center bg-transparent"
                    imgClassName="max-h-full max-w-full object-contain rounded-xl"
                  />
                </motion.div>
              </AnimatePresence>

              {/* Mobile prev/next controls right on the image stage */}
              {items.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={prevItem}
                    aria-label="Previous artwork"
                    className="absolute top-1/2 left-2.5 grid size-8 -translate-y-1/2 place-items-center rounded-full border border-line bg-paper/90 text-ink shadow-xs backdrop-blur md:hidden"
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={nextItem}
                    aria-label="Next artwork"
                    className="absolute top-1/2 right-2.5 grid size-8 -translate-y-1/2 place-items-center rounded-full border border-line bg-paper/90 text-ink shadow-xs backdrop-blur md:hidden"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </>
              )}
            </div>

            {/* Info & CTA panel */}
            <div className="flex flex-1 flex-col justify-between gap-3.5 overflow-y-auto border-t border-line bg-paper p-4 sm:p-6 md:w-80 md:flex-none md:border-t-0 md:border-l">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${accent.soft} ${accent.text}`}>
                    <span className={`size-1.5 rounded-full ${accent.dot}`} />
                    {tier.category} · {tier.label}
                  </span>
                  <span className="text-xs font-medium text-ink-mute">
                    {index + 1} / {items.length}
                  </span>
                </div>

                <div>
                  <h3 className="font-display text-2xl leading-tight font-semibold text-ink sm:text-3xl">
                    {item.title}
                  </h3>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {item.tags.map((t) => (
                      <span key={t} className="chip py-0.5 text-[11px]">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-canvas px-3.5 py-2.5">
                  <div>
                    <p className="text-[11px] font-medium text-ink-mute">{tier.label} base rate</p>
                    <p className="text-xs text-ink-soft">{tier.description}</p>
                  </div>
                  <p className="shrink-0 font-display text-2xl font-semibold text-ink">
                    {formatUsd(tier.basePriceUsd)}
                  </p>
                </div>
              </div>

              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    closeLightbox();
                    commissionTier(item.tier);
                  }}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-coral"
                >
                  <Sparkles className="size-4 text-mustard" /> Commission This Style ({formatUsd(tier.basePriceUsd)})
                </button>
                <p className="hidden text-center text-[11px] text-ink-mute md:block">
                  Use ← → arrow keys to browse · Esc to close
                </p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function DesktopNavArrow({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
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
