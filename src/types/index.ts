/** Shared domain types. These mirror the Supabase schema in supabase/migrations. */

export type TierId = 'headshot' | 'halfbody' | 'fullbody' | 'chibi' | 'graphics';

export type GalleryFilter = 'all' | TierId;

export type TabId = 'portfolio' | 'rules' | 'schedule' | 'track' | 'admin';

export type AvailabilityStatus = 'open' | 'waitlist' | 'closed';

export interface StudioPaymentDetails {
  paypalEmail: string;
  paypalMeUsername: string;
  gcashNumber: string;
  gcashName: string;
  gcashQrImageUrl?: string;
  bankName: string;
  bankAccountNumber: string;
  bankAccountName: string;
  instructionsNote?: string;
}

export interface StudioSettingsState {
  status: AvailabilityStatus;
  maxSlots: number;
  usdToPhpRate: number;
  basePrices: Record<TierId, number>;
  multipliers: {
    nsfw: number;
    softFurry: number;
    commercial: number;
  };
  blockedRanges: BlockedRange[];
  paymentDetails?: StudioPaymentDetails;
}

export type Accent = 'coral' | 'mustard' | 'lilac' | 'teal' | 'peach';

export type Currency = 'USD' | 'PHP';

export type PaymentSplit = '50_50' | '100_upfront';

export type CommissionStage =
  | 'pending_review'
  | 'awaiting_deposit'
  | 'sketching'
  | 'sketch_approval'
  | 'lineart_coloring'
  | 'completed'
  | 'declined'
  | 'cancelled';

export interface Tier {
  id: TierId;
  label: string;
  /** Plural label used by gallery filter chips. */
  filterLabel: string;
  category: 'Illustration' | 'Chibi / Emote' | 'Graphics';
  /** Base price in USD. Sourced from `studio_settings.base_prices_json` when connected. */
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

/** Public anonymised slot shown on the Availability & Queue Calendar (`public_queue_view`). */
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
  file?: File;
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

export type AttachmentKind = 'receipt' | 'redline' | 'reference' | 'other';

export interface OrderMessage {
  id: string;
  commissionId: string;
  senderRole: 'client' | 'artist' | 'system';
  senderName: string;
  body: string;
  attachmentUrl?: string;
  attachmentKind?: AttachmentKind;
  createdAt: string;
}

export interface WipUploadItem {
  id: string;
  commissionId: string;
  stage: CommissionStage;
  title: string;
  /** Portfolio slug or image URL for preview. */
  slug?: string;
  imageUrl?: string;
  highResUrl?: string | null;
  isFinal: boolean;
  artistNote: string;
  approvedByClient: boolean;
  createdAt: string;
  revisionRequested?: boolean;
  revisionNotes?: string;
  revisionCategory?: string;
  revisionScale?: 'minor' | 'major';
  revisionRequestedAt?: string;
}

export interface ClientReview {
  rating: number; // 1 to 5
  comment: string;
  visibility: 'public' | 'anonymous' | 'private';
  clientName?: string;
  createdAt: string;
}

export interface SubmittedOrder extends OrderDraft {
  id: string;
  orderCode?: string;
  createdAt: string;
  totalUsd: number;
  depositUsd: number;
  depositPaid: boolean;
  finalPaid: boolean;
  sketchApproved: boolean;
  stage: CommissionStage;
  progress: number;
  startDate?: string;
  estEndDate?: string;
  declined?: boolean;
  authMethod: 'demo' | 'discord' | 'google';
  wips: WipUploadItem[];
  messages: OrderMessage[];
  payments?: PaymentRecord[];
  events?: CommissionEvent[];
  revisionCount?: number;
  maxRevisions?: number;
  sketchSignedOffAt?: string | null;
  sketchSignoffChecklist?: {
    poseAndComposition: boolean;
    characterAndDetails: boolean;
    termsAcknowledged: boolean;
  };
  review?: ClientReview;
}

export interface PaymentRecord {
  id: string;
  commissionId: string;
  kind: 'deposit' | 'final' | 'full';
  amount: number;
  currency: Currency;
  receiptPath?: string;
  status: 'submitted' | 'verified' | 'rejected';
  verifiedBy?: string;
  verifiedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CommissionEvent {
  id: string;
  commissionId: string;
  fromStage?: CommissionStage | null;
  toStage: CommissionStage;
  actorId?: string;
  actorRole: 'artist' | 'client' | 'system';
  note: string;
  createdAt: string;
}

export type NotificationType =
  | 'brief_submitted'
  | 'brief_accepted'
  | 'stage_updated'
  | 'wip_posted'
  | 'payment_verified'
  | 'payment_submitted'
  | 'revision_requested'
  | 'cancellation_requested'
  | 'cancellation_confirmed'
  | 'cancellation_declined'
  | 'message_received';

export interface StudioNotification {
  id: string;
  orderId?: string;
  orderCode?: string;
  type: NotificationType;
  title: string;
  description: string;
  targetTab: TabId;
  targetSubTab?: 'pipeline' | 'briefs' | 'payments' | 'archive' | 'inbox';
  createdAt: string;
  isRead: boolean;
}
