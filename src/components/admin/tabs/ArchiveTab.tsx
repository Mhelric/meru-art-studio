import { useState, useMemo } from 'react';
import {
  Archive,
  Trash2,
  Calendar,
  XCircle,
  CheckCircle2,
  AlertCircle,
  Eye,
} from 'lucide-react';
import type { SubmittedOrder } from '@/types';
import { getTier, formatUsd, cn } from '@/lib/utils';
import { ArchiveDetailDialog } from '../dialogs/ArchiveDetailDialog';

interface ArchiveTabProps {
  orders: SubmittedOrder[];
  onOpenDeleteDialog: (order: SubmittedOrder) => void;
}

type ArchiveFilter = 'all' | 'declined' | 'completed' | 'cancelled';

export function ArchiveTab({ orders, onOpenDeleteDialog }: ArchiveTabProps) {
  const [filter, setFilter] = useState<ArchiveFilter>('all');
  const [detailOrder, setDetailOrder] = useState<SubmittedOrder | null>(null);

  const filteredOrders = useMemo(() => {
    if (filter === 'all') return orders;
    return orders.filter((o) => o.stage === filter);
  }, [orders, filter]);

  const counts = useMemo(
    () => ({
      all: orders.length,
      declined: orders.filter((o) => o.stage === 'declined').length,
      completed: orders.filter((o) => o.stage === 'completed').length,
      cancelled: orders.filter((o) => o.stage === 'cancelled').length,
    }),
    [orders],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h3 className="font-display text-lg font-bold text-ink">
            Archive & Terminal Orders ({orders.length})
          </h3>
          <p className="text-xs text-ink-soft">
            Historical record of declined inquiries, completed deliveries, and cancellations. Safely purge unwanted briefs to minimize stored data.
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-line bg-paper p-1">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={cn(
              'rounded-xl px-3 py-1.5 text-xs font-semibold transition',
              filter === 'all'
                ? 'bg-ink text-white'
                : 'text-ink-soft hover:bg-cream hover:text-ink',
            )}
          >
            All ({counts.all})
          </button>
          <button
            type="button"
            onClick={() => setFilter('declined')}
            className={cn(
              'rounded-xl px-3 py-1.5 text-xs font-semibold transition',
              filter === 'declined'
                ? 'bg-coral text-white'
                : 'text-ink-soft hover:bg-cream hover:text-ink',
            )}
          >
            Declined ({counts.declined})
          </button>
          <button
            type="button"
            onClick={() => setFilter('completed')}
            className={cn(
              'rounded-xl px-3 py-1.5 text-xs font-semibold transition',
              filter === 'completed'
                ? 'bg-teal text-white'
                : 'text-ink-soft hover:bg-cream hover:text-ink',
            )}
          >
            Completed ({counts.completed})
          </button>
          <button
            type="button"
            onClick={() => setFilter('cancelled')}
            className={cn(
              'rounded-xl px-3 py-1.5 text-xs font-semibold transition',
              filter === 'cancelled'
                ? 'bg-ink-mute text-white'
                : 'text-ink-soft hover:bg-cream hover:text-ink',
            )}
          >
            Cancelled ({counts.cancelled})
          </button>
        </div>
      </div>

      {filteredOrders.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-line bg-paper/60 p-12 text-center">
          <div className="grid size-14 place-items-center rounded-full bg-cream text-ink-mute">
            <Archive className="size-7" />
          </div>
          <h4 className="mt-4 font-display text-lg font-bold text-ink">No Archived Orders Found</h4>
          <p className="mt-1 text-xs text-ink-soft">
            {filter === 'all'
              ? 'No orders have been declined, completed, or cancelled yet.'
              : `No orders matching filter "${filter}".`}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filteredOrders.map((order) => {
            const isDeclined = order.stage === 'declined';
            const isCompleted = order.stage === 'completed';
            const isCancelled = order.stage === 'cancelled';

            return (
              <div
                key={order.id}
                className="flex flex-col justify-between rounded-3xl border border-line bg-paper p-5 shadow-xs transition hover:border-ink/20"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-ink-mute">
                        #{order.orderCode || order.id}
                      </span>
                      {isDeclined && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-coral-soft px-2 py-0.5 text-[10px] font-bold text-coral">
                          <XCircle className="size-3" /> Declined
                        </span>
                      )}
                      {isCompleted && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-teal-soft px-2 py-0.5 text-[10px] font-bold text-teal">
                          <CheckCircle2 className="size-3" /> Completed
                        </span>
                      )}
                      {isCancelled && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-cream px-2 py-0.5 text-[10px] font-bold text-ink-mute">
                          <AlertCircle className="size-3" /> Cancelled
                        </span>
                      )}
                    </div>

                    <p className="font-display text-lg font-bold text-ink">
                      {formatUsd(order.totalUsd)}
                    </p>
                  </div>

                  <div className="mt-3">
                    <h4 className="font-display text-base font-bold text-ink">
                      {order.characterName || 'Untitled'} · {getTier(order.tier).label}
                    </h4>
                    <p className="text-xs text-ink-soft">Client: {order.clientContact || 'Anonymous'}</p>
                    {order.poseAndVibe && (
                      <p className="mt-1 line-clamp-2 text-xs text-ink-mute italic">
                        "{order.poseAndVibe}"
                      </p>
                    )}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-3 text-[11px] text-ink-mute">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="size-3" /> Created: {order.createdAt ? new Date(order.createdAt).toLocaleDateString() : 'N/A'}
                    </span>
                    {order.startDate && (
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="size-3 text-teal" /> Started: {order.startDate}
                      </span>
                    )}
                  </div>
                </div>

                {/* Card action buttons */}
                <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-line/70 pt-3">
                  <span className="text-[11px] text-ink-mute">
                    {order.wips.length} WIPs · {order.messages.length} messages
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setDetailOrder(order)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-line bg-canvas px-3.5 py-1.5 text-xs font-semibold text-ink transition hover:border-ink hover:bg-cream"
                    >
                      <Eye className="size-3.5 text-teal" /> View Details
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenDeleteDialog(order)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-coral/30 bg-coral-soft/40 px-3.5 py-1.5 text-xs font-semibold text-coral transition hover:bg-coral hover:text-white"
                    >
                      <Trash2 className="size-3.5" /> Purge
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Archive Order Full Read-Only Detail Dialog */}
      <ArchiveDetailDialog
        order={detailOrder}
        isOpen={Boolean(detailOrder)}
        onClose={() => setDetailOrder(null)}
        onOpenDeleteDialog={onOpenDeleteDialog}
      />
    </div>
  );
}
