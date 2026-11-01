import { CheckCircle2, XCircle, Clock, ExternalLink } from 'lucide-react';
import type { SubmittedOrder } from '@/types';
import { getTier, formatUsd, ACCENT_CLASSES, TIER_ACCENT } from '@/lib/utils';

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
                {order.references && order.references.length > 0 && (
                  <div className="mt-3">
                    <p className="text-[11px] font-semibold text-ink-mute">
                      Attached References ({order.references.length}):
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {order.references.map((ref, idx) => (
                        <a
                          key={idx}
                          href={ref.previewUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-full border border-line bg-canvas px-2.5 py-1 text-[11px] font-medium text-ink transition hover:border-ink"
                        >
                          Ref #{idx + 1} <ExternalLink className="size-2.5 text-ink-mute" />
                        </a>
                      ))}
                    </div>
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
