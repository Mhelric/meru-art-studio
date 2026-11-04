import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDownRight, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ARTIST, PORTFOLIO } from '@/data/artist';
import { useStudio } from '@/context/StudioContext';
import { ArtImage } from '@/components/portfolio/ArtImage';
import { StudioStatusBadge } from '@/components/ui/StudioStatusBadge';
import { EASE, Reveal } from '@/components/ui/Reveal';
import { ACCENT_CLASSES, TIER_ACCENT, formatUsd, getTier } from '@/lib/utils';
import { scrollToTarget } from '@/lib/smoothScroll';
import type { PortfolioItem } from '@/types';

/**
 * Editorial split hero inspired by nicolearoberts.com —
 * Mobile-first: shows the greeting badge, headline, and an immediate artwork
 * showcase strip right above the fold before the secondary details.
 */
export function Hero() {
  const { setActiveTab, openLightbox, openDrawer } = useStudio();
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [expandedTagline, setExpandedTagline] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => {
      setPhraseIdx((i) => (i + 1) % ARTIST.rotating.length);
    }, 3200);
    return () => window.clearInterval(id);
  }, []);

  const featured = useMemo(() => PORTFOLIO.filter((p) => p.featured), []);
  const colA = useMemo(() => featured.filter((_, i) => i % 2 === 0), [featured]);
  const colB = useMemo(() => featured.filter((_, i) => i % 2 === 1), [featured]);
  const allIds = useMemo(() => PORTFOLIO.map((p) => p.id), []);

  const openPiece = (item: PortfolioItem) => {
    const idx = PORTFOLIO.findIndex((p) => p.id === item.id);
    openLightbox(allIds, idx >= 0 ? idx : 0);
  };

  return (
    <section className="relative min-h-[calc(100vh-4.5rem)] flex flex-col justify-center pt-[140px] pb-6 sm:pt-28 sm:pb-10 lg:pt-16 lg:pb-8">
      <div className="grid items-center gap-8 lg:grid-cols-12 lg:gap-12">
        {/* Left editorial column */}
        <div className="min-w-0 lg:col-span-6">
          <Reveal immediate>
            <div className="inline-flex items-center gap-2 rounded-full border border-line bg-paper py-1.5 pr-3.5 pl-2 shadow-2xs sm:gap-2.5 sm:py-2 sm:pr-4 sm:pl-2.5">
              <img src="/brand/mark-192.png" alt="" className="size-6 rounded-full border border-line object-cover sm:size-7" />
              <span className="text-xs font-semibold text-ink sm:text-sm">Welcome! I’m {ARTIST.nickname}</span>
              <StudioStatusBadge size="sm" />
            </div>
          </Reveal>

          <div className="mt-4 sm:mt-6 h-[115px] sm:h-[155px] lg:h-[175px] overflow-hidden flex flex-col justify-start">
            <h1 className="font-display text-[29px] leading-[1.15] font-semibold tracking-tight text-ink sm:text-[45px] sm:leading-[1.1] lg:text-[53px] lg:leading-[1.08]">
              <span className="block">I bring your characters</span>
              <span className="block">to life through</span>
              <span className="relative block h-[1.25em] overflow-hidden">
                <AnimatePresence mode="wait">
                  <motion.span
                    key={phraseIdx}
                    initial={{ y: '80%', opacity: 0, filter: 'blur(6px)' }}
                    animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
                    exit={{ y: '-80%', opacity: 0, filter: 'blur(6px)' }}
                    transition={{ duration: 0.55, ease: EASE }}
                    className="inline-block italic text-coral underline decoration-mustard/70 decoration-wavy decoration-2 underline-offset-4 sm:underline-offset-6"
                  >
                    {ARTIST.rotating[phraseIdx]}.
                  </motion.span>
                </AnimatePresence>
              </span>
            </h1>
          </div>

          {/* Tagline: Minimal expandable text on mobile, full on desktop */}
          <Reveal immediate delay={0.25}>
            <div className="mt-3.5 sm:mt-5 max-w-xl">
              {/* Mobile tap-to-expand: minimal, pure text without box or white background */}
              <div className="sm:hidden">
                <button
                  type="button"
                  onClick={() => setExpandedTagline((prev) => !prev)}
                  className="block text-left text-xs leading-relaxed text-ink-soft cursor-pointer select-none transition-colors hover:text-ink active:opacity-80"
                  aria-expanded={expandedTagline}
                >
                  <span>Soft, expressive anime illustrations, chibis & clean graphics</span>
                  <AnimatePresence initial={false}>
                    {expandedTagline ? (
                      <motion.span
                        key="extra"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.25, ease: EASE }}
                        className="inline"
                      >
                        {' '}— made just for you. Tap any artwork to inspect it closely, or choose a tier below with live USD & PHP rates.
                      </motion.span>
                    ) : (
                      <motion.span
                        key="ellipsis"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="text-coral/80 font-medium ml-0.5 inline"
                      >
                        ...
                      </motion.span>
                    )}
                  </AnimatePresence>
                </button>
              </div>

              {/* Desktop full view */}
              <p className="hidden sm:block text-sm leading-relaxed text-ink-soft sm:text-[17px]">
                {ARTIST.tagline} Tap any artwork to inspect it closely, or choose a tier below with live USD & PHP rates.
              </p>
            </div>
          </Reveal>

          {/* Primary CTAs: Full-width Commission Now on top, side-by-side Portfolio & Rules underneath (matching mobile & desktop reference) */}
          <Reveal immediate delay={0.35}>
            <div className="mt-5 sm:mt-7 max-w-md w-full flex flex-col gap-2.5 sm:gap-3">
              <button
                type="button"
                onClick={() => openDrawer()}
                className="group relative flex w-full items-center justify-center gap-2 rounded-full bg-coral px-7 py-3.5 sm:py-4 text-sm sm:text-base font-bold text-white shadow-lg shadow-coral/30 ring-4 ring-coral/20 transition-all duration-300 hover:scale-[1.02] hover:bg-ink active:scale-95"
              >
                <Sparkles className="size-4.5 text-white animate-pulse" />
                <span>Commission Now</span>
              </button>

              <div className="grid grid-cols-2 gap-2.5 sm:gap-3 w-full">
                <button
                  type="button"
                  onClick={() => scrollToTarget('#gallery', 0)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-full border border-line bg-paper px-4 py-3 sm:py-3.5 text-xs sm:text-sm font-semibold text-ink shadow-2xs transition-colors hover:border-ink hover:bg-cream"
                >
                  <span>Portfolio ({PORTFOLIO.length})</span>
                  <ArrowDownRight className="size-3.5 sm:size-4 shrink-0" />
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('rules')}
                  className="inline-flex items-center justify-center gap-1.5 rounded-full border border-line bg-paper px-4 py-3 sm:py-3.5 text-xs sm:text-sm font-semibold text-ink shadow-2xs transition-colors hover:border-ink hover:bg-cream"
                >
                  <span>Rules & TOS</span>
                </button>
              </div>
            </div>
          </Reveal>

          {/* Mobile immediate art showcase strip */}
          <Reveal immediate delay={0.45} className="mt-7 w-full overflow-hidden lg:hidden">
            <div className="mask-fade-x overflow-hidden py-1">
              <div
                className="flex w-max animate-marquee-x gap-3 active:[animation-play-state:paused]"
                style={{ '--marquee-duration': '42s' } as React.CSSProperties}
              >
                {[...featured, ...featured].map((item, i) => (
                  <ShowcaseCard
                    key={`${item.id}-${i}`}
                    item={item}
                    onSelect={openPiece}
                    compact
                    eager={i < 2}
                    className="w-40 shrink-0 sm:w-52"
                  />
                ))}
              </div>
            </div>
          </Reveal>
        </div>

        {/* Right live art showcase — desktop dual vertical marquee dynamically filling viewport */}
        <Reveal immediate delay={0.2} className="hidden lg:col-span-6 lg:block">
          <div className="mask-fade-y relative grid h-[calc(100vh-7rem)] min-h-[640px] max-h-[860px] grid-cols-2 gap-4 overflow-hidden pr-1">
            <MarqueeColumn items={colA} direction="up" duration="44s" onSelect={openPiece} />
            <MarqueeColumn items={colB} direction="down" duration="50s" onSelect={openPiece} />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function MarqueeColumn({
  items,
  direction,
  duration,
  onSelect,
}: {
  items: PortfolioItem[];
  direction: 'up' | 'down';
  duration: string;
  onSelect: (item: PortfolioItem) => void;
}) {
  const doubled = [...items, ...items];
  return (
    <div
      className={`flex flex-col gap-4 hover:[animation-play-state:paused] ${
        direction === 'up' ? 'animate-marquee-up' : 'animate-marquee-down'
      }`}
      style={{ '--marquee-duration': duration } as React.CSSProperties}
    >
      {doubled.map((item, i) => (
        <ShowcaseCard key={`${item.id}-${i}`} item={item} onSelect={onSelect} eager={i < 2} />
      ))}
    </div>
  );
}

function ShowcaseCard({
  item,
  onSelect,
  compact = false,
  eager = false,
  className = '',
}: {
  item: PortfolioItem;
  onSelect: (item: PortfolioItem) => void;
  compact?: boolean;
  eager?: boolean;
  className?: string;
}) {
  const tier = getTier(item.tier);
  const accent = ACCENT_CLASSES[TIER_ACCENT[item.tier]];

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className={`group card relative block overflow-hidden p-1.5 text-left transition-colors hover:border-ink/25 sm:p-2 ${className}`}
    >
      <div className={compact ? 'aspect-[4/5] overflow-hidden rounded-xl sm:rounded-2xl' : 'overflow-hidden rounded-2xl'}>
        <ArtImage
          slug={item.slug}
          alt={item.title}
          size="sm"
          eager={eager}
          keepAspect={!compact}
          className={compact ? 'size-full' : undefined}
          imgClassName={compact ? 'size-full object-cover object-top group-hover:scale-[1.04]' : 'group-hover:scale-[1.04]'}
        />
      </div>
      <div className="flex items-center justify-between gap-1.5 px-1.5 pt-2 pb-0.5 sm:px-2 sm:pt-2.5 sm:pb-1">
        <div className="min-w-0">
          <p className="truncate font-display text-sm font-semibold text-ink sm:text-base">{item.title}</p>
          <p className="truncate text-[11px] text-ink-mute sm:text-xs">{tier.label}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium sm:px-2.5 sm:text-xs ${accent.soft} ${accent.text}`}>
          {formatUsd(tier.basePriceUsd)}
        </span>
      </div>
    </button>
  );
}
