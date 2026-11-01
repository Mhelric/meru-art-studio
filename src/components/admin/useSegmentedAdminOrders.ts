import { useMemo } from 'react';
import type { SubmittedOrder } from '@/types';

export interface SegmentedAdminOrders {
  incomingBriefs: SubmittedOrder[];
  activePipeline: SubmittedOrder[];
  pendingPayments: SubmittedOrder[];
  archivedOrders: SubmittedOrder[];
  counts: {
    briefs: number;
    active: number;
    payments: number;
    archived: number;
    total: number;
  };
}

/**
 * Pure segmentation function categorizing commissions into administrative lifecycles:
 * - incomingBriefs: status_stage === 'pending_review'
 * - activePipeline: in progress ('awaiting_deposit', 'sketching', 'sketch_approval', 'lineart_coloring')
 * - pendingPayments: awaiting deposit or final payment verification
 * - archivedOrders: terminal states ('declined', 'cancelled', 'completed')
 */
export function segmentAdminOrders(orders: SubmittedOrder[]): SegmentedAdminOrders {
  const incomingBriefs = orders.filter((o) => o.stage === 'pending_review');

  const activePipeline = orders.filter((o) =>
    ['awaiting_deposit', 'sketching', 'sketch_approval', 'lineart_coloring'].includes(o.stage),
  );

  const pendingPayments = orders.filter((o) => {
    if (o.stage === 'awaiting_deposit' && !o.depositPaid) return true;
    if (
      ['sketch_approval', 'lineart_coloring', 'completed'].includes(o.stage) &&
      o.paymentSplit === '50_50' &&
      !o.finalPaid
    ) {
      return true;
    }
    return false;
  });

  const archivedOrders = orders.filter((o) =>
    ['declined', 'cancelled', 'completed'].includes(o.stage),
  );

  return {
    incomingBriefs,
    activePipeline,
    pendingPayments,
    archivedOrders,
    counts: {
      briefs: incomingBriefs.length,
      active: activePipeline.length,
      payments: pendingPayments.length,
      archived: archivedOrders.length,
      total: orders.length,
    },
  };
}

/**
 * React hook wrapper around segmentAdminOrders.
 */
export function useSegmentedAdminOrders(orders: SubmittedOrder[]): SegmentedAdminOrders {
  return useMemo(() => segmentAdminOrders(orders), [orders]);
}
