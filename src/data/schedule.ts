import type { BlockedRange, PublicQueueSlot } from '@/types';

/**
 * Seed data for the Phase 2 Availability & Queue Calendar.
 * Dates are anchored around November–December 2026 so the current month and
 * next month immediately showcase active anonymised slots, blocked exam dates,
 * and open green booking windows. In Phase 3 this will be hydrated from
 * `studio_settings` and `public_queue_view`.
 */

export const STUDIO_AVAILABILITY = {
  status: 'open' as 'open' | 'waitlist' | 'closed',
  maxSlots: 5,
  usdToPhpRate: 58,
  nextOpenWindow: '2026-11-05',
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
    startDate: '2026-10-24',
    estEndDate: '2026-11-06',
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
    startDate: '2026-11-02',
    estEndDate: '2026-11-13',
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
    startDate: '2026-11-10',
    estEndDate: '2026-11-18',
    accent: 'peach',
  },
];

export const BLOCKED_RANGES: BlockedRange[] = [
  {
    id: 'block-1',
    startDate: '2026-11-20',
    endDate: '2026-11-23',
    reason: 'CS Midterm Exams · Studio Paused',
  },
  {
    id: 'block-2',
    startDate: '2026-12-12',
    endDate: '2026-12-14',
    reason: 'Artist Rest & Finals Prep',
  },
];
