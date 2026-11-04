import type { CommissionStage, SubmittedOrder } from '@/types';

export function getRefundTierInfo(
  stage: CommissionStage,
  totalUsd: number,
  depositUsd: number,
  depositPaid: boolean,
  finalPaid: boolean,
) {
  const paidSoFar = finalPaid ? totalUsd : depositPaid ? depositUsd : 0;
  if (stage === 'pending_review' || stage === 'awaiting_deposit') {
    return {
      tierName: 'Pre-Production Stage (Before Sketching)',
      percentage: '100% Full Refund',
      refundAmount: paidSoFar,
      notes: 'Work has not begun. Any upfront deposit paid is eligible for 100% full refund.',
      processingDays: '3–5 business days',
    };
  }
  if (stage === 'sketching' || stage === 'sketch_approval') {
    return {
      tierName: 'Initial Sketch Stage',
      percentage: '50% Refund',
      refundAmount: Math.round(paidSoFar * 0.5),
      notes: 'Upfront deposit covers thumbnail sketching and composition labor.',
      processingDays: '3–5 business days',
    };
  }
  return {
    tierName: 'Final Production Stage (Lineart & Coloring)',
    percentage: '0% Non-Refundable',
    refundAmount: 0,
    notes: 'Artwork is actively rendering or finished; production time and labor are fully committed.',
    processingDays: 'N/A (Non-refundable)',
  };
}

export interface CancellationRequestInfo {
  hasRequest: boolean;
  reason: string;
  requestedAt?: string;
  status: 'pending' | 'confirmed' | 'declined' | 'none';
  declineReason?: string;
}

export function getActiveCancellationRequest(order: SubmittedOrder): CancellationRequestInfo {
  if (order.stage === 'cancelled') {
    return { hasRequest: false, reason: '', status: 'confirmed' };
  }

  const msgs = [...(order.messages || [])].reverse();
  for (const msg of msgs) {
    if (msg.body.startsWith('[Cancellation Declined]:')) {
      const declineReason = msg.body.replace(/^\[Cancellation Declined\]:\s*/, '');
      return {
        hasRequest: false,
        reason: '',
        status: 'declined',
        declineReason,
      };
    }
    if (msg.body.startsWith('[Cancellation Request]:') || msg.body.startsWith('Cancellation & Refund Request:')) {
      const reason = msg.body
        .replace(/^\[Cancellation Request\]:\s*/, '')
        .replace(/^Cancellation & Refund Request:\s*/, '');
      return {
        hasRequest: true,
        reason,
        requestedAt: msg.createdAt,
        status: 'pending',
      };
    }
  }

  return { hasRequest: false, reason: '', status: 'none' };
}
