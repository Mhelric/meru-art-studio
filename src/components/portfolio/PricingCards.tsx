import { ArrowUpRight, Check } from 'lucide-react';
import { ADDON_RATES, PORTFOLIO, TIERS } from '@/data/artist';
import { useStudio } from '@/context/StudioContext';
import { ACCENT_CLASSES, TIER_ACCENT, cn, formatUsd } from '@/lib/utils';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { Reveal } from '@/components/ui/Reveal';
import { ArtImage } from './ArtImage';

/** Pick a representative sample image from the portfolio for each tier. */
const TIER_SAMPLE: Record<string, string> = {
  headshot: 'deku-inktober',
  halfbody: 'velimer-dnd',
  fullbody: 'kitsunegem',
  chibi: 'chibi-universe',
  graphics: 'thumb-gacha-gems',
};

const ADDONS = [
  { label: 'NSFW', value: `+${ADDON_RATES.nsfw * 100}%`, note: 'Soft / tasteful' },
  { label: 'Soft Furry', value: `+${ADDON_RATES.softFurry * 100}%`, note: 'Kemonomimi & anthros' },
  { label: 'Commercial Rights', value: `+${ADDON_RATES.commercial * 100}%`, note: 'Streams, merch & monetised use' },
];

export function PricingCards() {
  const { commissionTier, selectedTier } = useStudio();

  return (
    <section id="pricing" className="mt-28 scroll-mt-24">
      <SectionHeading
        eyebrow="Commission Tiers"
        title="Simple, transparent pricing"
        subtitle="Base rates in USD (PayPal) — GCash (PHP) is converted automatically in the order calculator. Choose 100% upfront or 50% upfront / 50% after sketch."
      />

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
        {TIERS.map((tier, i) => {
          const selected = selectedTier === tier.id;
          const accent = ACCENT_CLASSES[TIER_ACCENT[tier.id]];
          const sampleSlug = TIER_SAMPLE[tier.id] ?? PORTFOLIO[0].slug;

          return (
            <Reveal
              key={tier.id}
              delay={i * 0.06}
              className={cn(
                'card flex flex-col overflow-hidden p-3 transition-colors',
                selected ? `ring-2 ${accent.ring} border-ink` : 'hover:border-ink/25',
              )}
            >
              <div className="relative h-40 overflow-hidden rounded-2xl">
                <ArtImage
                  slug={sampleSlug}
                  alt={tier.label}
                  size="sm"
                  keepAspect={false}
                  className="size-full"
                  imgClassName="size-full object-cover object-top"
                />
                <span className={`absolute top-2.5 left-2.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${accent.soft} ${accent.text}`}>
                  {tier.category}
                </span>
              </div>

              <div className="flex flex-1 flex-col px-2 pt-4 pb-2">
                <h3 className="font-display text-2xl font-semibold text-ink">{tier.label}</h3>
                <p className="mt-1 font-display text-3xl font-semibold text-ink">
                  {formatUsd(tier.basePriceUsd)}
                  <span className="ml-1 font-sans text-xs font-normal text-ink-mute">
                    {tier.priceNote ? `/ ${tier.priceNote}` : 'base'}
                  </span>
                </p>
                <p className="mt-2 text-sm text-ink-soft">{tier.description}</p>

                <ul className="mt-4 space-y-1.5 border-t border-line pt-3 text-xs text-ink-soft">
                  {tier.includes.map((inc) => (
                    <li key={inc} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-teal" /> {inc}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => commissionTier(tier.id)}
                  className={cn(
                    'group mt-5 inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-xs font-medium transition-colors sm:text-sm',
                    selected ? 'bg-coral text-white' : 'bg-ink text-white hover:bg-coral',
                  )}
                >
                  {selected ? 'Selected Style' : 'Commission This Style'}
                  <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </button>
              </div>
            </Reveal>
          );
        })}
      </div>

      {/* Add-on multiplier strip */}
      <Reveal delay={0.15} className="card mt-6 grid gap-4 p-5 sm:grid-cols-3">
        {ADDONS.map((a) => (
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
