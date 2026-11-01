import type { BlockedRange, PublicQueueSlot } from '@/types';

const toIso = (daysOffset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Seed data for the Availability & Queue Calendar when offline or before Supabase hydration.
 * Dynamically relative to the current local date so queue slots and booking windows
 * always remain relevant and functional.
 */
export const STUDIO_AVAILABILITY = {
  status: 'open' as 'open' | 'waitlist' | 'closed',
  maxSlots: 5,
  usdToPhpRate: 58,
  nextOpenWindow: toIso(3),
};

export const INITIAL_PUBLIC_QUEUE: PublicQueueSlot[] = [
  {
    slotNumber: 1,
    id: 'slot-1',
    handleHint: 'k***o',
    tier: 'fullbody',
    stage: 'lineart_coloring',
    stageLabel: 'Lineart & Coloring',
    progress: 78,
    startDate: toIso(-8),
    estEndDate: toIso(4),
    accent: 'lilac',
  },
  {
    slotNumber: 2,
    id: 'slot-2',
    handleHint: 's***a',
    tier: 'halfbody',
    stage: 'sketch_approval',
    stageLabel: 'Sketch Approval Gate',
    progress: 48,
    startDate: toIso(-3),
    estEndDate: toIso(8),
    accent: 'mustard',
  },
  {
    slotNumber: 3,
    id: 'slot-3',
    handleHint: 'v***x',
    tier: 'chibi',
    stage: 'sketching',
    stageLabel: 'Sketching (3 Emotes)',
    progress: 25,
    startDate: toIso(2),
    estEndDate: toIso(12),
    accent: 'peach',
  },
];

export const BLOCKED_RANGES: BlockedRange[] = [
  {
    id: 'block-1',
    startDate: toIso(18),
    endDate: toIso(21),
    reason: 'CS Midterm Exams · Studio Paused',
  },
  {
    id: 'block-2',
    startDate: toIso(35),
    endDate: toIso(38),
    reason: 'Artist Rest & Finals Prep',
  },
];
