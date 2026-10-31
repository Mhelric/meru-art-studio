import { TIERS } from '@/data/artist';
import type { Accent, TierId } from '@/types';

export const cn = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ');

export const getTier = (id: TierId) => TIERS.find((t) => t.id === id)!;

export const formatUsd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

/** Each tier gets a colour from the logo palette. */
export const TIER_ACCENT: Record<TierId, Accent> = {
  headshot: 'coral',
  halfbody: 'mustard',
  fullbody: 'lilac',
  chibi: 'peach',
  graphics: 'teal',
};

/** Static class maps (Tailwind needs full class names at build time). */
export const ACCENT_CLASSES: Record<Accent, { soft: string; text: string; dot: string; ring: string }> = {
  coral: { soft: 'bg-coral-soft', text: 'text-coral', dot: 'bg-coral', ring: 'ring-coral/40' },
  mustard: { soft: 'bg-mustard-soft', text: 'text-[#b9800f]', dot: 'bg-mustard', ring: 'ring-mustard/50' },
  lilac: { soft: 'bg-lilac-soft', text: 'text-lilac', dot: 'bg-lilac', ring: 'ring-lilac/40' },
  teal: { soft: 'bg-teal-soft', text: 'text-teal', dot: 'bg-teal', ring: 'ring-teal/40' },
  peach: { soft: 'bg-[#fdeee2]', text: 'text-[#d9824a]', dot: 'bg-peach', ring: 'ring-peach/50' },
};
