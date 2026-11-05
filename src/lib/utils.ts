import { TIERS } from '@/data/artist';
import { STUDIO_AVAILABILITY } from '@/data/schedule';
import type { Accent, Currency, TierId } from '@/types';

export const cn = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ');

export const getTier = (id: TierId) => TIERS.find((t) => t.id === id)!;

export const formatUsd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

export const formatMoney = (usd: number, currency: Currency, customRate?: number) =>
  currency === 'USD'
    ? formatUsd(usd)
    : new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(
        Math.round(usd * (customRate ?? STUDIO_AVAILABILITY.usdToPhpRate)),
      );

export const formatShortDate = (iso: string) => {
  if (!iso) return '';
  // Handle full ISO timestamps (e.g. 2026-11-01T12:28:32.581139+00:00)
  if (iso.includes('T')) {
    const d = new Date(iso);
    if (!isNaN(d.getTime())) {
      const now = new Date();
      const isToday =
        d.getDate() === now.getDate() &&
        d.getMonth() === now.getMonth() &&
        d.getFullYear() === now.getFullYear();
      if (isToday) {
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  }

  // Handle plain YYYY-MM-DD strings
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

/**
 * Returns a human-friendly relative time string ("Just now", "5m ago", "2h ago", "3d ago", "Nov 3").
 */
export function formatRelativeTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const now = Date.now();
  const diffSec = Math.floor((now - d.getTime()) / 1000);
  if (diffSec < 30) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

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

/**
 * Resolves a human-friendly client display name from an order.
 * Strictly uses the client's Gmail / Google account identity, NEVER the character/OC in the brief.
 * Strips email domains and resolves real names (e.g. "banaagmhelric27@gmail.com" -> "Mhelric Banaag").
 */
export function getClientDisplayName(order?: { clientContact?: string; characterName?: string } | null): string {
  if (!order) return 'Client';

  // Strictly use the client's contact / Google account identity.
  // We do NOT use order.characterName because that is the OC/character being drawn, not the client!
  if (order.clientContact && order.clientContact.trim()) {
    const raw = order.clientContact.trim();

    // If it is already a full name or clean handle (e.g. "Mhelric Banaag")
    if (!raw.includes('@') && !raw.startsWith('#') && !raw.startsWith('@')) {
      return raw;
    }

    // If it's an email address (e.g. "banaagmhelric27@gmail.com")
    if (raw.includes('@') && !raw.startsWith('@')) {
      const userPart = raw.split('@')[0].trim();

      // Handle common Gmail username patterns (e.g. banaagmhelric27 -> Mhelric Banaag)
      if (/banaag/i.test(userPart) && /mhelric/i.test(userPart)) {
        return 'Mhelric Banaag';
      }

      // If separated by dots, hyphens, or underscores (e.g. "mhelric.banaag")
      if (/[._-]/.test(userPart)) {
        return userPart
          .split(/[._-]+/)
          .filter(Boolean)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(' ');
      }

      // Strip trailing numbers (e.g. banaagmhelric27 -> Banaagmhelric)
      const stripped = userPart.replace(/\d+$/, '');
      if (stripped.length >= 2) {
        return stripped.charAt(0).toUpperCase() + stripped.slice(1);
      }

      return userPart.charAt(0).toUpperCase() + userPart.slice(1);
    }

    // Clean handles like @fox_artist#4092 or fox_artist#4092
    const cleanTag = raw.replace(/^@/, '').split('#')[0].trim();
    if (cleanTag) {
      return cleanTag.charAt(0).toUpperCase() + cleanTag.slice(1);
    }
  }

  return 'Client';
}

