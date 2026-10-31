import type { PortfolioItem, RuleItem, SocialLink, Tier, TosSection } from '@/types';

/**
 * Single source of truth for Phase 1 static content.
 * In Phase 3 prices/multipliers move to the `studio_settings` table and this file
 * becomes the fallback used in Demo Mode.
 */

export const ARTIST = {
  name: 'Meru Art',
  nickname: 'Meru',
  roles: ['Artist', 'Graphics Designer', 'CS Student'],
  tagline: 'Soft, expressive anime illustrations, chibis & clean graphics — made just for you.',
  /** Rotating lines in the hero headline ("I draw …"). */
  rotating: ['expressive anime OCs', 'fanart you’ll love', 'cute chibis & emotes', 'clean thumbnails & logos'],
  turnaround: '2 weeks – 1 month',
};

export const SOCIALS: SocialLink[] = [
  { id: 'artstation', label: 'ArtStation', handle: 'meru_art', href: 'https://meru_art.artstation.com', color: '#13AFF0' },
  { id: 'tiktok', label: 'TikTok', handle: '@meru_art27', href: 'https://www.tiktok.com/@meru_art27', color: '#FE2C55' },
  { id: 'x', label: 'X', handle: '@Meru102703', href: 'https://x.com/Meru102703', color: '#0b0b0b' },
  { id: 'youtube', label: 'YouTube', handle: '@meru_art', href: 'https://www.youtube.com/@meru_art', color: '#FF0033' },
  { id: 'instagram', label: 'Instagram', handle: '@_meruart', href: 'https://www.instagram.com/_meruart', color: '#E1306C' },
  { id: 'facebook', label: 'Facebook', handle: 'meru.art27', href: 'https://www.facebook.com/meru.art27', color: '#1877F2' },
  { id: 'discord', label: 'Discord', handle: 'meruart', href: 'https://discord.com/users/meruart', color: '#5865F2' },
];

/** NOTE: Illustration base prices are placeholders — adjust to your real rates. */
export const TIERS: Tier[] = [
  {
    id: 'headshot',
    label: 'Headshot',
    filterLabel: 'Headshots',
    category: 'Illustration',
    basePriceUsd: 15,
    description: 'Shoulders-up portrait focused on expression.',
    includes: ['Full colour & shading', 'Simple background', '1 character'],
  },
  {
    id: 'halfbody',
    label: 'Halfbody',
    filterLabel: 'Halfbody',
    category: 'Illustration',
    basePriceUsd: 25,
    description: 'Waist-up illustration with room for pose & props.',
    includes: ['Full colour & shading', 'Simple background', '1 character'],
  },
  {
    id: 'fullbody',
    label: 'Fullbody',
    filterLabel: 'Fullbody',
    category: 'Illustration',
    basePriceUsd: 40,
    description: 'Head-to-toe character art — great for ref sheets.',
    includes: ['Full colour & shading', 'Simple background', '1 character'],
  },
  {
    id: 'chibi',
    label: 'Chibi / Emote',
    filterLabel: 'Chibis',
    category: 'Chibi / Emote',
    basePriceUsd: 10,
    priceNote: 'per character',
    description: 'Cute, squishy chibis — perfect for Twitch/Discord emotes.',
    includes: ['Transparent PNG', 'Emote-ready sizes', 'Per character'],
  },
  {
    id: 'graphics',
    label: 'Graphics',
    filterLabel: 'Graphics',
    category: 'Graphics',
    basePriceUsd: 5,
    priceNote: 'negotiable',
    description: 'Thumbnails, logos, banners & stream overlays.',
    includes: ['Thumbnails & logos', 'Banners & overlays', 'Price based on scope'],
  },
];

export const ADDON_RATES = {
  nsfw: 0.5,
  softFurry: 0.5,
  commercial: 2.0,
} as const;

export const CAN_DRAW: RuleItem[] = [
  { label: 'Anime / Fanart' },
  { label: 'Original Characters (OCs)' },
  { label: 'NSFW', note: '+50%' },
  { label: 'Soft Furry', note: '+50%' },
];

export const CANT_DRAW: RuleItem[] = [
  { label: 'Mechas' },
  { label: 'Realistic styles' },
  { label: 'Hardcore NSFW' },
  { label: 'Gore' },
];

export const TOS: TosSection[] = [
  {
    id: 'payment',
    title: 'Payment',
    points: [
      'Accepted: PayPal (USD) or GCash (PHP).',
      'Choose 100% upfront, or 50% upfront and the remaining 50% after the sketch is approved.',
      'Work only begins once the upfront payment is received and verified.',
      'Prices are final once the brief is accepted. Scope changes may be quoted separately.',
    ],
  },
  {
    id: 'refunds',
    title: 'Refund Policy',
    points: [
      '100% refund if cancelled before the sketch is started.',
      '50% refund once the sketch has begun.',
      'No refunds once lineart or colouring has started.',
    ],
  },
  {
    id: 'process',
    title: 'Process & Turnaround',
    points: [
      'Estimated turnaround is 2 weeks to 1 month depending on queue and complexity.',
      'You will receive a sketch for approval. Minor revisions are free at the sketch stage.',
      'Major changes after lineart may incur an additional fee.',
      'Progress (WIPs) is shared in your private order room.',
    ],
  },
  {
    id: 'usage',
    title: 'Usage Rights',
    points: [
      'Commissions are for personal use (avatars, banners, prints for yourself) by default.',
      'Commercial use requires the Commercial Rights add-on (+200% of the original price).',
      'The artist retains the copyright and may post the artwork in portfolio and socials unless agreed otherwise.',
      'Please credit the artist when posting the artwork.',
    ],
  },
  {
    id: 'nft',
    title: 'Strict Anti-NFT / AI Policy',
    points: [
      'Zero NFT usage allowed — artwork may never be minted, tokenised or sold as an NFT.',
      'Artwork may not be used to train AI models or as AI input.',
      'Violation voids your usage license immediately.',
    ],
  },
];

/**
 * Real portfolio. Images live in /public/art (generated by `npm run images`
 * from /assets-src). `featured` pieces appear in the hero showcase on load.
 * Gallery order = array order, so lead with the strongest pieces.
 */
export const PORTFOLIO: PortfolioItem[] = [
  { id: 'kitsunegem', slug: 'kitsunegem', title: 'Kitsune Gem', tier: 'fullbody', tags: ['OC', 'Soft Furry'], featured: true },
  { id: 'deku', slug: 'deku-inktober', title: 'Deku — Inktober', tier: 'headshot', tags: ['Fanart', 'My Hero Academia'], featured: true },
  { id: 'frieren', slug: 'frieren-party', title: 'Frieren’s Party', tier: 'fullbody', tags: ['Fanart', 'Background'], featured: true },
  { id: 'loona', slug: 'loona-helluva', title: 'Loona', tier: 'headshot', tags: ['Commission', 'Helluva Boss'], featured: true },
  { id: 'robin', slug: 'robin-egghead', title: 'Robin — Egghead', tier: 'fullbody', tags: ['Fanart', 'One Piece'], featured: true },
  { id: 'masked', slug: 'masked-gentleman', title: 'Masked Gentleman', tier: 'halfbody', tags: ['Commission', 'OC'], featured: true },
  { id: 'momo', slug: 'momo-ayase', title: 'Momo Ayase', tier: 'fullbody', tags: ['Fanart', 'Dandadan'], featured: true },
  { id: 'velimer', slug: 'velimer-dnd', title: 'Velimer', tier: 'halfbody', tags: ['Commission', 'D&D'], featured: true },
  { id: 'uniform', slug: 'uniform-commission', title: 'Officer in Uniform', tier: 'fullbody', tags: ['Commission', 'OC'], featured: true },
  { id: 'meru-ref', slug: 'meru-ref-sheet', title: 'Meru — Reference Sheet', tier: 'fullbody', tags: ['OC', 'Ref sheet', 'Expressions'], featured: true },
  { id: 'idoltav', slug: 'idoltav-poster', title: 'Church of IdolTav', tier: 'fullbody', tags: ['Commission', 'Poster'] },
  { id: 'universe', slug: 'chibi-universe', title: 'Universe', tier: 'chibi', tags: ['Chibi', 'Logo'], featured: true },
  { id: 'meru-inc', slug: 'logo-meru-inc', title: 'Meru Inc. Logo', tier: 'graphics', tags: ['Logo'] },
  { id: 'gems', slug: 'thumb-gacha-gems', title: '100,000 Gems Thumbnail', tier: 'graphics', tags: ['YouTube', 'Thumbnail'] },
  { id: 'first-pc', slug: 'thumb-first-pc', title: 'First PC Build Thumbnail', tier: 'graphics', tags: ['YouTube', 'Thumbnail'] },
  { id: 'fix-life', slug: 'thumb-fix-your-life', title: 'Fix Your Life Thumbnail', tier: 'graphics', tags: ['YouTube', 'Thumbnail'] },
  { id: 'regrets', slug: 'thumb-teen-regrets', title: 'Teen Regrets Thumbnail', tier: 'graphics', tags: ['YouTube', 'Thumbnail'] },
];
