/** Shared domain types. These mirror the Supabase schema planned for Phase 3. */

export type TierId = 'headshot' | 'halfbody' | 'fullbody' | 'chibi' | 'graphics';

export type GalleryFilter = 'all' | TierId;

export type TabId = 'portfolio' | 'rules' | 'schedule' | 'track';

export type Accent = 'coral' | 'mustard' | 'lilac' | 'teal' | 'peach';

export type Currency = 'USD' | 'PHP';

export type PaymentSplit = '50_50' | '100_upfront';

export type CommissionStage =
  | 'pending_review'
  | 'awaiting_deposit'
  | 'sketching'
  | 'sketch_approval'
  | 'lineart_coloring'
  | 'completed';

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

export interface RuleItem {
  label: string;
  note?: string;
}

export interface TosSection {
  id: string;
  title: string;
  points: string[];
}

/** Public anonymised slot shown on the Availability & Queue Calendar (`public_queue_view` in Phase 3). */
export interface PublicQueueSlot {
  slotNumber: number;
  id: string;
  handleHint: string;
  tier: TierId;
  stage: CommissionStage;
  stageLabel: string;
  progress: number;
  /** ISO YYYY-MM-DD */
  startDate: string;
  /** ISO YYYY-MM-DD */
  estEndDate: string;
  accent: Accent;
}

export interface BlockedRange {
  id: string;
  /** ISO YYYY-MM-DD */
  startDate: string;
  /** ISO YYYY-MM-DD */
  endDate: string;
  reason: string;
}

export interface ReferenceFile {
  id: string;
  name: string;
  sizeBytes: number;
  previewUrl: string;
}

export interface OrderDraft {
  tier: TierId;
  characterCount: number;
  addons: {
    nsfw: boolean;
    softFurry: boolean;
    commercial: boolean;
  };
  currency: Currency;
  paymentSplit: PaymentSplit;
  /** Optional preferred start date (YYYY-MM-DD) picked from the calendar. */
  preferredStartDate: string | null;
  characterName: string;
  poseAndVibe: string;
  backgroundNotes: string;
  clientContact: string;
  references: ReferenceFile[];
  tosAccepted: boolean;
  tosAcceptedAt: string | null;
}

export interface SubmittedOrder extends OrderDraft {
  id: string;
  createdAt: string;
  totalUsd: number;
  depositUsd: number;
  stage: CommissionStage;
  authMethod: 'demo' | 'discord' | 'google';
}
