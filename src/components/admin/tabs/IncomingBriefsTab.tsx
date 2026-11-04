import { CheckCircle2, XCircle, Clock, ExternalLink, AlertTriangle } from 'lucide-react';
import type { SubmittedOrder } from '@/types';
import { getTier, formatUsd, ACCENT_CLASSES, TIER_ACCENT } from '@/lib/utils';
import { getActiveCancellationRequest } from '@/lib/orderCancellation';

interface IncomingBriefsTabProps {
  orders: SubmittedOrder[];
  onAcceptBrief: (orderId: string) => void;
  onOpenDeclineModal: (order: SubmittedOrder) => void;
}

export function IncomingBriefsTab({
  orders,
  onAcceptBrief,
  onOpenDeclineModal,
}: IncomingBriefsTabProps) {
  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-3xl border border-line bg-paper/60 p-12 text-center">
        <div className="grid size-14 place-items-center rounded-full bg-teal-soft text-teal">
          <CheckCircle2 className="size-7" />
        </div>
        <h3 className="mt-4 font-display text-xl font-bold text-ink">No Incoming Briefs</h3>
        <p className="mt-1 max-w-md text-xs text-ink-soft">
          All submitted commission briefs have been reviewed and accepted or archived. New inquiries submitted from the storefront will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-lg font-bold text-ink">
            Pending Client Briefs ({orders.length})
          </h3>
          <p className="text-xs text-ink-soft">
            Review incoming briefs, agree on scope, and accept to lock in the client’s deposit gate.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {orders.map((order) => {
          const tier = getTier(order.tier);
          const accent = ACCENT_CLASSES[TIER_ACCENT[order.tier]];
          const cancelReq = getActiveCancellationRequest(order);

          return (
            <div
              key={order.id}
              className="flex flex-col justify-between rounded-3xl border border-line bg-paper p-5 shadow-xs transition hover:border-ink/20"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${accent.soft} ${accent.text}`}
                    >
                      {tier.label} × {order.characterCount}
                    </span>
                    <span className="rounded-full bg-mustard px-2 py-0.5 text-[10px] font-bold text-ink uppercase">
                      Pending Review
                    </span>
                    {cancelReq.hasRequest && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-coral px-2.5 py-0.5 text-[10px] font-bold text-white uppercase">
                        <AlertTriangle className="size-3" /> Cancellation Requested
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="font-display text-xl font-bold text-ink">
                      {formatUsd(order.totalUsd)}
                    </p>
                    <p className="text-[11px] text-ink-mute">
                      Deposit: {formatUsd(order.depositUsd)} ({order.paymentSplit === '50_50' ? '50/50' : '100% upfront'})
                    </p>
                  </div>
                </div>

                <div className="mt-3">
                  <h4 className="font-display text-base font-bold text-ink">
                    #{order.orderCode || order.id} · {order.characterName || 'Untitled Character'}
                  </h4>
                  <p className="text-xs font-medium text-ink-soft">
                    Client: <span className="font-semibold text-ink">{order.clientContact || 'Anonymous'}</span>
                  </p>
                </div>

                {cancelReq.hasRequest && (
                  <div className="mt-3 rounded-2xl border border-coral/30 bg-coral-soft/80 p-3 text-xs text-coral">
                    <p className="font-bold">Client Cancellation Request:</p>
                    <p className="mt-0.5 text-ink italic">"{cancelReq.reason}"</p>
                    <p className="mt-1 text-[11px] text-ink-mute">
                      Declining this brief will acknowledge cancellation without deduction of slot or fees.
                    </p>
                  </div>
                )}

                <div className="mt-3 space-y-2 rounded-2xl border border-line/60 bg-canvas/70 p-3 text-xs text-ink">
                  <div>
                    <span className="font-semibold text-ink-mute">Pose & Vibe: </span>
                    <span>{order.poseAndVibe || 'Artist free reign'}</span>
                  </div>
                  {order.backgroundNotes && (
                    <div>
                      <span className="font-semibold text-ink-mute">Background / Details: </span>
                      <span>{order.backgroundNotes}</span>
                    </div>
                  )}
                  {/* Add-ons badges */}
                  <div className="flex flex-wrap gap-1 pt-1">
                    {order.addons.nsfw && (
                      <span className="rounded-md bg-coral/10 px-1.5 py-0.5 text-[10px] font-semibold text-coral">
                        +50% NSFW
                      </span>
                    )}
                    {order.addons.softFurry && (
                      <span className="rounded-md bg-teal/10 px-1.5 py-0.5 text-[10px] font-semibold text-teal">
                        +50% Soft Furry
                      </span>
                    )}
                    {order.addons.commercial && (
                      <span className="rounded-md bg-mustard/20 px-1.5 py-0.5 text-[10px] font-semibold text-ink">
                        +200% Commercial Use
                      </span>
                    )}
                  </div>
                </div>

                {/* References */}
                {order.references && order.references.length > 0 ? (
                  <div className="mt-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-semibold text-ink-mute">
                        Attached Character References ({order.references.length}):
                      </p>
                      <span className="text-[10px] text-ink-mute">Click to preview full</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {order.references.map((ref, idx) => (
                        <a
                          key={ref.id || idx}
                          href={ref.previewUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={ref.name || `Reference #${idx + 1}`}
                          className="group relative aspect-square overflow-hidden rounded-xl border border-line bg-paper shadow-2xs transition hover:border-ink"
                        >
                          <img
                            src={ref.previewUrl}
                            alt={ref.name || `Reference #${idx + 1}`}
                            className="size-full object-cover transition group-hover:scale-105"
                          />
                          <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition group-hover:opacity-100">
                            <ExternalLink className="size-4 text-white" />
                          </span>
                          <span className="absolute bottom-1 left-1 max-w-[calc(100%-8px)] truncate rounded bg-ink/80 px-1 py-0.5 text-[9px] font-medium text-white">
                            {ref.name || `Ref #${idx + 1}`}
                          </span>
                        </a>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex items-center justify-between rounded-xl border border-line/60 bg-canvas/60 px-3 py-2 text-[11px] text-ink-mute">
                    <span>No reference images attached to this brief.</span>
                  </div>
                )}
              </div>

              {/* Actions: Accept or Decline */}
              <div className="mt-5 flex items-center justify-between gap-2 border-t border-line/70 pt-3">
                <span className="inline-flex items-center gap-1 text-[11px] text-ink-mute">
                  <Clock className="size-3" /> Submitted {order.createdAt ? new Date(order.createdAt).toLocaleDateString() : 'recently'}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenDeclineModal(order)}
                    className="inline-flex items-center gap-1 rounded-full border border-coral/30 px-3.5 py-1.5 text-xs font-semibold text-coral transition hover:bg-coral-soft"
                  >
                    <XCircle className="size-3.5" /> Decline
                  </button>
                  <button
                    type="button"
                    onClick={() => onAcceptBrief(order.id)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-teal px-4 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:opacity-90"
                  >
                    <CheckCircle2 className="size-3.5" /> Accept Brief
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
