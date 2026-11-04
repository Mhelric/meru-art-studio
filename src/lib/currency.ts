import type { Currency } from '@/types';
import { STUDIO_AVAILABILITY } from '@/data/schedule';

export const CURRENCY_PREF_KEY = 'meru_currency_pref';

/**
 * Detects client currency based on saved preference or geographic locale / timezone heuristics.
 * Defaults to 'PHP' if the user is in the Philippines (e.g., Asia/Manila timezone, fil/tl language).
 * Otherwise defaults to 'USD'.
 */
export function detectClientCurrency(): Currency {
  if (typeof window === 'undefined') return 'USD';

  try {
    // 1. Saved user preference takes absolute priority
    const saved = localStorage.getItem(CURRENCY_PREF_KEY);
    if (saved === 'USD' || saved === 'PHP') {
      return saved;
    }

    // 2. Detect via browser timezone (Asia/Manila)
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (timeZone.toLowerCase().includes('manila') || timeZone === 'Asia/Manila') {
      return 'PHP';
    }

    // 3. Detect via browser language preferences
    const languages = navigator.languages || [navigator.language || ''];
    for (const lang of languages) {
      const lower = lang.toLowerCase();
      if (
        lower === 'fil' ||
        lower.startsWith('fil-') ||
        lower === 'tl' ||
        lower.startsWith('tl-') ||
        lower === 'en-ph'
      ) {
        return 'PHP';
      }
    }
  } catch {
    // Fall through to USD default
  }

  return 'USD';
}

/**
 * Persists user currency preference to local storage.
 */
export function saveCurrencyPreference(currency: Currency): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CURRENCY_PREF_KEY, currency);
  } catch {
    // Ignore storage quota or access errors
  }
}

/**
 * Converts a USD amount to PHP using the current studio exchange rate.
 */
export function convertUsdToPhp(usd: number, rate: number = STUDIO_AVAILABILITY.usdToPhpRate): number {
  return Math.round(usd * rate);
}

/**
 * Converts a PHP amount to USD using the current studio exchange rate.
 */
export function convertPhpToUsd(php: number, rate: number = STUDIO_AVAILABILITY.usdToPhpRate): number {
  if (rate <= 0) return php;
  return Math.round(php / rate);
}

/**
 * Returns dual-currency formatted strings for storefront display.
 * E.g., for $40 USD at 58 rate:
 * When active is USD: { primary: '$40', secondary: '≈ ₱2,320', full: '$40 (≈ ₱2,320)' }
 * When active is PHP: { primary: '₱2,320', secondary: '≈ $40 USD', full: '₱2,320 (≈ $40 USD)' }
 */
export function formatDualCurrency(
  usd: number,
  activeCurrency: Currency,
  rate: number = STUDIO_AVAILABILITY.usdToPhpRate,
): {
  primary: string;
  secondary: string;
  full: string;
  usdFormatted: string;
  phpFormatted: string;
} {
  const php = convertUsdToPhp(usd, rate);
  const usdFormatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(usd);

  const phpFormatted = new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
  }).format(php);

  if (activeCurrency === 'PHP') {
    return {
      primary: phpFormatted,
      secondary: `≈ ${usdFormatted} USD`,
      full: `${phpFormatted} (≈ ${usdFormatted} USD)`,
      usdFormatted,
      phpFormatted,
    };
  }

  return {
    primary: usdFormatted,
    secondary: `≈ ${phpFormatted}`,
    full: `${usdFormatted} (≈ ${phpFormatted})`,
    usdFormatted,
    phpFormatted,
  };
}
