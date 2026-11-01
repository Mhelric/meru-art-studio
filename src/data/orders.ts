import type { CommissionStage, SubmittedOrder } from '@/types';

export const STAGE_STEPS: {
  id: CommissionStage;
  shortLabel: string;
  fullLabel: string;
  progress: number;
  description: string;
}[] = [
  {
    id: 'pending_review',
    shortLabel: 'Pending Review',
    fullLabel: 'Pending Artist Review',
    progress: 10,
    description: 'Meru is reviewing your character references, scope, and schedule window.',
  },
  {
    id: 'awaiting_deposit',
    shortLabel: 'Upfront Deposit',
    fullLabel: 'Awaiting Upfront Deposit',
    progress: 22,
    description: 'Brief approved! Upload your PayPal or GCash deposit receipt to lock your slot and start sketching.',
  },
  {
    id: 'sketching',
    shortLabel: 'Sketching',
    fullLabel: 'Rough Sketching in Progress',
    progress: 42,
    description: 'Deposit verified! Meru is drafting your composition and pose sketch.',
  },
  {
    id: 'sketch_approval',
    shortLabel: 'Sketch & 50% Gate',
    fullLabel: 'Sketch Approval & Remaining 50% Gate',
    progress: 62,
    description: 'Watermarked sketch uploaded! Request redlines or approve + upload your remaining 50% receipt.',
  },
  {
    id: 'lineart_coloring',
    shortLabel: 'Lineart & Color',
    fullLabel: 'Clean Lineart, Rendering & Lighting',
    progress: 85,
    description: 'Sketch approved & payment complete! Meru is finishing clean lineart, base colors, and shading.',
  },
  {
    id: 'completed',
    shortLabel: 'Completed',
    fullLabel: 'Completed (High-Res Download Unlocked)',
    progress: 100,
    description: 'All done! Your unwatermarked high-resolution artwork is unlocked for download.',
  },
];

const getDynamicDateStr = (daysOffset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Rich showcase order pre-loaded into the Track Order tab so portfolio visitors,
 * recruiters, and clients can immediately experience the Pizza-Tracker, WIP
 * watermark shield, payment gates, and realtime chat room.
 */
export const DEMO_SHOWCASE_ORDER: SubmittedOrder = {
  id: 'MRU-KITSUNE',
  orderCode: 'MRU-KITSUNE',
  createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
  tier: 'fullbody',
  characterCount: 1,
  addons: { nsfw: false, softFurry: true, commercial: false },
  currency: 'USD',
  paymentSplit: '50_50',
  preferredStartDate: getDynamicDateStr(-2),
  estEndDate: getDynamicDateStr(12),
  characterName: 'Kitsune Gem (Nine-Tailed Fox OC)',
  poseAndVibe:
    'Playful mid-step pose with arms outstretched, candy-bow top, polka-dot skirt, and striped pastel boots. Warm cheerful expression!',
  backgroundNotes: 'Simple clean studio background with soft ground shadow.',
  clientContact: 'kitsune_gem#1027',
  references: [],
  tosAccepted: true,
  tosAcceptedAt: '2026-10-29T10:14:42.000Z',
  totalUsd: 60,
  depositUsd: 30,
  depositPaid: true,
  finalPaid: false,
  sketchApproved: false,
  stage: 'sketch_approval',
  progress: 62,
  authMethod: 'demo',
  wips: [
    {
      id: 'wip-1',
      commissionId: 'MRU-KITSUNE',
      stage: 'sketching',
      title: 'WIP #1 · Pose & Silhouette Draft',
      slug: 'kitsunegem',
      isFinal: false,
      artistNote: 'Blocked in the dynamic mid-step pose and tail silhouette! Let me know if the tail volume feels right.',
      approvedByClient: true,
      createdAt: '2026-10-30T14:20:00.000Z',
    },
    {
      id: 'wip-2',
      commissionId: 'MRU-KITSUNE',
      stage: 'sketch_approval',
      title: 'WIP #2 · Detailed Sketch & Flat Color Check',
      slug: 'kitsunegem',
      isFinal: false,
      artistNote:
        'Added the candy bow details, skirt ruffles, and pastel boot stripes. Ready for your Sketch Approval & remaining 50% gate!',
      approvedByClient: false,
      createdAt: '2026-10-31T09:40:00.000Z',
    },
    {
      id: 'wip-3',
      commissionId: 'MRU-KITSUNE',
      stage: 'completed',
      title: 'Final · High-Res Fullbody Illustration (1800×2400 PNG)',
      slug: 'kitsunegem',
      isFinal: true,
      artistNote: 'Final shaded & polished fullbody piece! Unlocks unwatermarked when stage reaches Completed.',
      approvedByClient: false,
      createdAt: '2026-10-31T18:00:00.000Z',
    },
  ],
  messages: [
    {
      id: 'msg-1',
      commissionId: 'MRU-KITSUNE',
      senderRole: 'artist',
      senderName: 'Meru Art',
      body: 'Hi there! I reviewed your Kitsune Gem brief and loved the character design. Your slot is approved — whenever you’re ready, upload your 50% deposit receipt here to kick off the sketch!',
      createdAt: '2026-10-29T11:00:00.000Z',
    },
    {
      id: 'msg-2',
      commissionId: 'MRU-KITSUNE',
      senderRole: 'client',
      senderName: 'kitsune_gem',
      body: 'Yay thank you!! Just sent the 50% upfront deposit ($30 USD via PayPal). Excited to see the pose sketch!',
      attachmentKind: 'receipt',
      createdAt: '2026-10-29T11:18:00.000Z',
    },
    {
      id: 'msg-3',
      commissionId: 'MRU-KITSUNE',
      senderRole: 'artist',
      senderName: 'Meru Art',
      body: 'Deposit verified! Just uploaded WIP #2 to the gallery with the candy bow and tail fan-out. Take a look — you can request any sketch redlines here or approve & unlock Lineart & Coloring!',
      createdAt: '2026-10-31T09:42:00.000Z',
    },
  ],
};
