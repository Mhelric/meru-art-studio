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
 * Left: "Welcome! I'm Meru" badge, Afacad display headline with rotating phrase,
 * identity chips, CTAs.
 * Right: Immediate dual-column vertical marquee of real artwork (plus mobile
 * horizontal showcase) that opens the Lightbox on click.
 */
export function Hero() {
  const { setActiveTab, openLightbox } = useStudio();
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
    <section className="relative pt-28 pb-16 sm:pt-32 lg:pt-28 lg:pb-24">
      <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-12">
        {/* Left editorial column */}
        <div className="lg:col-span-6">
          <Reveal immediate>
            <div className="inline-flex items-center gap-2.5 rounded-full border border-line bg-paper py-1.5 pr-4 pl-2">
              <img src="/brand/mark-192.png" alt="" className="size-7 rounded-full border border-line object-cover" />
              <span className="text-xs font-medium text-ink">Welcome! I’m {ARTIST.nickname}</span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-soft px-2.5 py-0.5 text-[11px] font-medium text-teal">
                <span className="size-1.5 rounded-full bg-teal" />
                Open
              </span>
            </div>
          </Reveal>

          <h1 className="mt-6 font-display text-4xl leading-[1.06] font-semibold tracking-tight text-ink sm:text-5xl lg:text-[56px]">
            <WordReveal text="I bring your characters to life through" delay={0.1} stagger={0.045} />{' '}
            <span className="relative inline-block align-bottom">
              <AnimatePresence mode="wait">
                <motion.span
                  key={phraseIdx}
                  initial={{ y: '80%', opacity: 0, filter: 'blur(6px)' }}
                  animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
                  exit={{ y: '-80%', opacity: 0, filter: 'blur(6px)' }}
                  transition={{ duration: 0.55, ease: EASE }}
                  className="inline-block italic text-coral underline decoration-mustard/70 decoration-wavy decoration-2 underline-offset-8"
                >
                  {ARTIST.rotating[phraseIdx]}.
                </motion.span>
              </AnimatePresence>
            </span>
          </h1>

          <Reveal immediate delay={0.35}>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-ink-soft sm:text-[17px]">
              {ARTIST.tagline} Browse real commissions & fanart right here, pick a tier, and lock in your slot with clear upfront or 50/50 pricing.
            </p>
          </Reveal>

          {/* Identity & policy chips (Nicole Roberts style metadata pills) */}
          <Reveal immediate delay={0.45}>
            <div className="mt-6 flex flex-wrap gap-2">
              {ARTIST.roles.map((r) => (
                <span key={r} className="chip">
                  <Sparkles className="size-3.5 text-coral" />
                  {r}
                </span>
              ))}
              <span className="chip">Turnaround · {ARTIST.turnaround}</span>
              <span className="chip">PayPal (USD) · GCash (PHP)</span>
              <span className="chip border-coral/30 bg-coral-soft text-coral">Strictly No NFTs</span>
            </div>
          </Reveal>

          {/* CTAs */}
          <Reveal immediate delay={0.55}>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button
                onClick={() => scrollToTarget('#gallery')}
                className="group inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3.5 text-sm font-medium text-white transition-all duration-300 hover:bg-coral"
              >
                Explore Portfolio ({PORTFOLIO.length})
                <ArrowDownRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:translate-y-0.5" />
              </button>
              <button
                onClick={() => scrollToTarget('#pricing')}
                className="rounded-full border border-line bg-paper px-6 py-3.5 text-sm font-medium text-ink transition-colors hover:border-ink/30 hover:bg-cream"
              >
                View Commission Rates
              </button>
              <button
                onClick={() => setActiveTab('rules')}
                className="px-3 py-2 text-sm font-medium text-ink-soft underline decoration-line underline-offset-4 transition-colors hover:text-ink hover:decoration-ink"
              >
                Rules & TOS →
              </button>
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

      {/* Mobile & tablet immediate horizontal art strip */}
      <Reveal immediate delay={0.3} className="mt-10 lg:hidden">
        <div className="mask-fade-x overflow-hidden">
          <div
            className="flex w-max animate-marquee-x gap-3.5 hover:[animation-play-state:paused]"
            style={{ '--marquee-duration': '48s' } as React.CSSProperties}
          >
            {[...featured, ...featured].map((item, i) => (
              <ShowcaseCard key={`${item.id}-${i}`} item={item} onSelect={openPiece} className="w-52 shrink-0 sm:w-60" />
            ))}
          </div>
        </div>
      </Reveal>
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
  className = '',
}: {
  item: PortfolioItem;
  onSelect: (item: PortfolioItem) => void;
  className?: string;
}) {
  const tier = getTier(item.tier);
  const accent = ACCENT_CLASSES[TIER_ACCENT[item.tier]];

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className={`group card relative block overflow-hidden p-2 text-left transition-colors hover:border-ink/25 ${className}`}
    >
      <div className="overflow-hidden rounded-2xl">
        <ArtImage
          slug={item.slug}
          alt={item.title}
          size="sm"
          eager
          imgClassName="group-hover:scale-[1.04]"
        />
      </div>
      <div className="flex items-center justify-between gap-2 px-2 pt-2.5 pb-1">
        <div className="min-w-0">
          <p className="truncate font-display text-base font-semibold text-ink">{item.title}</p>
          <p className="text-xs text-ink-mute">{tier.label}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${accent.soft} ${accent.text}`}>
          {formatUsd(tier.basePriceUsd)}
        </span>
      </div>
    </button>
  );
}
