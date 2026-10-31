/** Shared domain types. These mirror the Supabase schema planned for Phase 3. */

export type TierId = 'headshot' | 'halfbody' | 'fullbody' | 'chibi' | 'graphics';

export type GalleryFilter = 'all' | TierId;

export type TabId = 'portfolio' | 'rules' | 'schedule' | 'track';

export interface Tier {
  id: TierId;
  label: string;
  /** Plural label used by gallery filter chips. */
  filterLabel: string;
  category: 'Illustration' | 'Chibi / Emote' | 'Graphics';
  /** Base price in USD. Will be sourced from `studio_settings.base_prices_json` in Phase 3. */
  basePriceUsd: number;
  priceNote?: string;
  description: string;
  includes: string[];
}

export interface PortfolioItem {
  id: string;
  title: string;
  tier: TierId;
  /** Slug of the optimised image in /public/art (see scripts/optimize-images.mjs). */
  slug: string;
  tags: string[];
  /** Shown in the hero showcase on page load. */
  featured?: boolean;
}

export interface SocialLink {
  id: string;
  label: string;
  handle: string;
  href: string;
  /** Hex brand colour for hover accents. */
  color: string;
}

export type Accent = 'coral' | 'mustard' | 'lilac' | 'teal' | 'peach';

export interface RuleItem {
  label: string;
  note?: string;
}

export interface TosSection {
  id: string;
  title: string;
  points: string[];
}
