import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDownRight, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ARTIST, PORTFOLIO } from '@/data/artist';
import { useStudio } from '@/context/StudioContext';
import { ArtImage } from '@/components/portfolio/ArtImage';
import { EASE, Reveal, WordReveal } from '@/components/ui/Reveal';
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
    <section className="relative pt-32 pb-12 sm:pt-36 lg:pt-28 lg:pb-24">
      <div className="grid items-center gap-8 lg:grid-cols-12 lg:gap-12">
        {/* Left editorial column — min-w-0 prevents the wide marquee track from stretching the CSS grid track on mobile */}
        <div className="min-w-0 lg:col-span-6">
          <Reveal immediate>
            <div className="inline-flex items-center gap-2 rounded-full border border-line bg-paper py-1 pr-3.5 pl-1.5 sm:gap-2.5 sm:py-1.5 sm:pr-4 sm:pl-2">
              <img src="/brand/mark-192.png" alt="" className="size-6 rounded-full border border-line object-cover sm:size-7" />
              <span className="text-xs font-medium text-ink">Welcome! I’m {ARTIST.nickname}</span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-soft px-2 py-0.5 text-[11px] font-medium text-teal">
                <span className="size-1.5 rounded-full bg-teal" />
                Open
              </span>
            </div>
          </Reveal>

          <h1 className="mt-4 font-display text-[34px] leading-[1.08] font-semibold tracking-tight text-ink sm:mt-6 sm:text-5xl lg:text-[56px]">
            <WordReveal text="I bring your characters to life through" delay={0.1} stagger={0.045} />{' '}
            <span className="relative inline-block align-bottom">
              <AnimatePresence mode="wait">
                <motion.span
                  key={phraseIdx}
                  initial={{ y: '80%', opacity: 0, filter: 'blur(6px)' }}
                  animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
                  exit={{ y: '-80%', opacity: 0, filter: 'blur(6px)' }}
                  transition={{ duration: 0.55, ease: EASE }}
                  className="inline-block italic text-coral underline decoration-mustard/70 decoration-wavy decoration-2 underline-offset-4 sm:underline-offset-8"
                >
                  {ARTIST.rotating[phraseIdx]}.
                </motion.span>
              </AnimatePresence>
            </span>
          </h1>

          {/* Mobile & tablet immediate art showcase — placed RIGHT under the headline so art is visible on open */}
          <Reveal immediate delay={0.22} className="mt-6 w-full overflow-hidden lg:hidden">
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
                    className="w-40 shrink-0 sm:w-52"
                  />
                ))}
              </div>
            </div>
          </Reveal>

          <Reveal immediate delay={0.3}>
            <p className="mt-5 max-w-xl text-sm leading-relaxed text-ink-soft sm:mt-6 sm:text-[17px]">
              {ARTIST.tagline} Tap any artwork to inspect it closely, or pick a commission tier with live USD & PHP pricing.
            </p>
          </Reveal>

          {/* Primary CTAs */}
          <Reveal immediate delay={0.4}>
            <div className="mt-6 flex flex-wrap items-center gap-2.5 sm:mt-8 sm:gap-3">
              <button
                onClick={() => openDrawer()}
                className="group inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-ink px-5 py-3 text-xs font-medium text-white transition-all duration-300 hover:bg-coral sm:flex-none sm:px-6 sm:py-3.5 sm:text-sm"
              >
                <Sparkles className="size-4 text-mustard" />
                Commission Calculator
              </button>
              <button
                onClick={() => scrollToTarget('#gallery')}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-line bg-paper px-5 py-3 text-xs font-medium text-ink transition-colors hover:border-ink/30 hover:bg-cream sm:flex-none sm:px-6 sm:py-3.5 sm:text-sm"
              >
                Portfolio ({PORTFOLIO.length})
                <ArrowDownRight className="size-4" />
              </button>
              <button
                onClick={() => setActiveTab('rules')}
                className="w-full py-1 text-center text-xs font-medium text-ink-soft underline decoration-line underline-offset-4 transition-colors hover:text-ink sm:w-auto sm:px-3 sm:py-2 sm:text-sm"
              >
                Rules & TOS →
              </button>
            </div>
          </Reveal>

          {/* Identity & policy chips */}
          <Reveal immediate delay={0.5}>
            <div className="mt-5 flex flex-wrap gap-1.5 sm:mt-6 sm:gap-2">
              {ARTIST.roles.map((r) => (
                <span key={r} className="chip text-[11px] sm:text-xs">
                  <Sparkles className="size-3 text-coral" />
                  {r}
                </span>
              ))}
              <span className="chip text-[11px] sm:text-xs">Turnaround · {ARTIST.turnaround}</span>
              <span className="chip text-[11px] sm:text-xs">PayPal · GCash</span>
              <span className="chip border-coral/30 bg-coral-soft text-[11px] text-coral sm:text-xs">No NFTs</span>
            </div>
          </Reveal>
        </div>

        {/* Right live art showcase — desktop dual vertical marquee */}
        <Reveal immediate delay={0.2} className="hidden lg:col-span-6 lg:block">
          <div className="mask-fade-y relative grid h-[600px] grid-cols-2 gap-4 overflow-hidden pr-1">
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
        <ShowcaseCard key={`${item.id}-${i}`} item={item} onSelect={onSelect} />
      ))}
    </div>
  );
}

function ShowcaseCard({
  item,
  onSelect,
  compact = false,
  className = '',
}: {
  item: PortfolioItem;
  onSelect: (item: PortfolioItem) => void;
  compact?: boolean;
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
          eager
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
