import { ArrowUpRight, Check, Sparkles } from 'lucide-react';
import { PORTFOLIO } from '@/data/artist';
import { useStudio } from '@/context/StudioContext';
import { ACCENT_CLASSES, TIER_ACCENT, cn, formatUsd } from '@/lib/utils';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { Reveal } from '@/components/ui/Reveal';
import { ArtImage } from './ArtImage';

/** Representative sample artwork + focal point per tier so faces are never cropped out. */
const TIER_SAMPLE: Record<string, { slug: string; pos: string }> = {
  headshot: { slug: 'deku-inktober', pos: 'object-[50%_42%]' },
  halfbody: { slug: 'velimer-dnd', pos: 'object-[50%_20%]' },
  fullbody: { slug: 'kitsunegem', pos: 'object-[50%_18%]' },
  chibi: { slug: 'chibi-universe', pos: 'object-center' },
  graphics: { slug: 'thumb-gacha-gems', pos: 'object-center' },
};

export function PricingCards() {
  const { commissionTier, selectedTier, tiers, studioSettings } = useStudio();
  const addons = [
    { label: 'NSFW', value: `+${Math.round(studioSettings.multipliers.nsfw * 100)}%`, note: 'Soft / tasteful' },
    { label: 'Soft Furry', value: `+${Math.round(studioSettings.multipliers.softFurry * 100)}%`, note: 'Kemonomimi & anthros' },
    { label: 'Commercial Rights', value: `+${Math.round(studioSettings.multipliers.commercial * 100)}%`, note: 'Streams, merch & monetised use' },
  ];

  return (
    <section id="pricing" className="mt-20 scroll-mt-28 sm:mt-28">
      <SectionHeading
        eyebrow="Commission Tiers"
        title="Simple, transparent pricing"
        subtitle="Tap any tier card to open the live USD/PHP price calculator and preview examples in that style."
      />

      {/* Responsive grid: 1 col on small phones, 2 cols on sm, 3 on md, 5 on xl — equal-height cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
        {tiers.map((tier, i) => {
          const selected = selectedTier === tier.id;
          const accent = ACCENT_CLASSES[TIER_ACCENT[tier.id]];
          const sample = TIER_SAMPLE[tier.id] ?? { slug: PORTFOLIO[0].slug, pos: 'object-center' };

          return (
            <Reveal key={tier.id} delay={i * 0.05} className="h-full">
              <div
                role="button"
                tabIndex={0}
                onClick={() => commissionTier(tier.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    commissionTier(tier.id);
                  }
                }}
                aria-label={`Commission ${tier.label} starting at ${formatUsd(tier.basePriceUsd)}`}
                className={cn(
                  'group card flex h-full cursor-pointer flex-col overflow-hidden p-3 text-left transition-all duration-300 select-none hover:-translate-y-1 hover:border-ink/35 active:scale-[0.99]',
                  selected && `ring-2 ${accent.ring} border-ink`,
                )}
              >
                {/* Sample preview: horizontal split on mobile for compact scanning, vertical stack on sm+ */}
                <div className="flex gap-3.5 sm:block">
                  <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-2xl bg-cream sm:h-44 sm:w-full">
                    <ArtImage
                      slug={sample.slug}
                      alt={tier.label}
                      size="sm"
                      keepAspect={false}
                      className="size-full"
                      imgClassName={cn('size-full object-cover transition-transform duration-500 group-hover:scale-105', sample.pos)}
                    />
                    <span className={`absolute top-2 left-2 rounded-full px-2.5 py-0.5 text-[10px] font-medium sm:text-[11px] ${accent.soft} ${accent.text}`}>
                      {tier.category}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1 sm:px-1.5 sm:pt-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-display text-2xl font-semibold text-ink">{tier.label}</h3>
                      {selected && (
                        <span className="shrink-0 rounded-full bg-coral-soft px-2 py-0.5 text-[10px] font-semibold text-coral">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 font-display text-3xl font-semibold text-ink">
                      {formatUsd(tier.basePriceUsd)}
                      <span className="ml-1 font-sans text-xs font-normal text-ink-mute">
                        {tier.priceNote ? `/ ${tier.priceNote}` : 'base'}
                      </span>
                    </p>
                    <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-ink-soft sm:line-clamp-none sm:text-sm">
                      {tier.description}
                    </p>
                  </div>
                </div>

                {/* Includes list — pushed down so all buttons align at the bottom */}
                <ul className="mt-3 space-y-1.5 border-t border-line px-1.5 pt-3 text-xs text-ink-soft sm:mt-4">
                  {tier.includes.map((inc) => (
                    <li key={inc} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-teal" /> {inc}
                    </li>
                  ))}
                </ul>

                <div className="mt-auto pt-4">
                  <span
                    className={cn(
                      'flex w-full items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-xs font-medium whitespace-nowrap transition-colors sm:text-sm',
                      selected
                        ? 'bg-coral text-white'
                        : 'bg-ink text-white group-hover:bg-coral',
                    )}
                  >
                    <Sparkles className="size-3.5 shrink-0" />
                    <span>Commission Style</span>
                    <ArrowUpRight className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </span>
                </div>
              </div>
            </Reveal>
          );
        })}
      </div>

      {/* Add-on multiplier strip */}
      <Reveal delay={0.15} className="card mt-5 grid gap-3 p-4 sm:mt-6 sm:grid-cols-3 sm:gap-4 sm:p-5">
        {addons.map((a) => (
          <div key={a.label} className="flex items-center justify-between gap-3 rounded-2xl bg-canvas px-4 py-3">
            <div>
              <p className="font-display text-lg font-semibold text-ink">{a.label}</p>
              <p className="text-xs text-ink-mute">{a.note}</p>
            </div>
            <span className="rounded-full bg-mustard-soft px-3 py-1 font-display text-base font-semibold text-[#b9800f]">
              {a.value}
            </span>
          </div>
        ))}
      </Reveal>
    </section>
  );
}
