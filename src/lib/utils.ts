import { TIERS } from '@/data/artist';
import { STUDIO_AVAILABILITY } from '@/data/schedule';
import type { Accent, Currency, TierId } from '@/types';

export const cn = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ');

export const getTier = (id: TierId) => TIERS.find((t) => t.id === id)!;

export const formatUsd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

export const formatMoney = (usd: number, currency: Currency) =>
  currency === 'USD'
    ? formatUsd(usd)
    : new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(
        Math.round(usd * STUDIO_AVAILABILITY.usdToPhpRate),
      );

export const formatShortDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

/**
 * Returns today's date in local calendar time (YYYY-MM-DD), avoiding UTC offset bugs for Manila (UTC+8)
 * where 00:00-08:00 UTC would otherwise return yesterday's date.
 */
export function getLocalTodayDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns a future date formatted as YYYY-MM-DD in local calendar time.
 */
export function getLocalFutureDate(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Each tier gets a colour from the logo palette. */
export const TIER_ACCENT: Record<TierId, Accent> = {
  headshot: 'coral',
  halfbody: 'mustard',
  fullbody: 'lilac',
  chibi: 'peach',
  graphics: 'teal',
};

/** Static class maps (Tailwind needs full class names at build time). */
export const ACCENT_CLASSES: Record<Accent, { soft: string; text: string; dot: string; ring: string; bar: string }> = {
  coral: { soft: 'bg-coral-soft', text: 'text-coral', dot: 'bg-coral', ring: 'ring-coral/40', bar: 'bg-coral' },
  mustard: { soft: 'bg-mustard-soft', text: 'text-[#b9800f]', dot: 'bg-mustard', ring: 'ring-mustard/50', bar: 'bg-mustard' },
  lilac: { soft: 'bg-lilac-soft', text: 'text-lilac', dot: 'bg-lilac', ring: 'ring-lilac/40', bar: 'bg-lilac' },
  teal: { soft: 'bg-teal-soft', text: 'text-teal', dot: 'bg-teal', ring: 'ring-teal/40', bar: 'bg-teal' },
  peach: { soft: 'bg-[#fdeee2]', text: 'text-[#d9824a]', dot: 'bg-peach', ring: 'ring-peach/50', bar: 'bg-peach' },
};
