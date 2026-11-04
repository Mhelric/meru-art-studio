import type { CommissionStage } from '@/types';

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
