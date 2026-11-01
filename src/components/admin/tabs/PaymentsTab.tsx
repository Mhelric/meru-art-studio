import { CheckCircle2, ExternalLink, ShieldCheck } from 'lucide-react';
import type { SubmittedOrder } from '@/types';
import { getTier, formatUsd } from '@/lib/utils';

interface PaymentsTabProps {
  orders: SubmittedOrder[];
  onTogglePaymentFlag: (orderId: string, field: 'depositPaid' | 'finalPaid') => void;
}

export function PaymentsTab({ orders, onTogglePaymentFlag }: PaymentsTabProps) {
  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-3xl border border-line bg-paper/60 p-12 text-center">
        <div className="grid size-14 place-items-center rounded-full bg-teal-soft text-teal">
          <ShieldCheck className="size-7" />
        </div>
        <h3 className="mt-4 font-display text-xl font-bold text-ink">All Payments Verified</h3>
        <p className="mt-1 max-w-md text-xs text-ink-soft">
          There are currently no active orders with outstanding unverified payment receipts. When clients submit payment slips, they will be surfaced here for 1-click verification.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-display text-lg font-bold text-ink">
          Payment Verification & Ledger ({orders.length})
        </h3>
        <p className="text-xs text-ink-soft">
          Verify client deposits before starting sketches, or verify final payments to unlock unwatermarked master file downloads.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {orders.map((order) => {
          const remainingUsd = Math.max(0, order.totalUsd - order.depositUsd);
          const needsDeposit = order.stage === 'awaiting_deposit' && !order.depositPaid;
          const needsFinal =
            ['sketch_approval', 'lineart_coloring', 'completed'].includes(order.stage) &&
            order.paymentSplit === '50_50' &&
            !order.finalPaid;

          // Find any receipt attachment uploaded in order chat
          const receiptAttachment = order.messages.find((m) => m.attachmentKind === 'receipt')?.attachmentUrl;

          return (
            <div
              key={order.id}
              className="flex flex-col justify-between rounded-3xl border border-line bg-paper p-5 shadow-xs transition hover:border-ink/20"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="rounded-full bg-cream px-2.5 py-0.5 text-[11px] font-semibold text-ink">
                      #{order.orderCode || order.id}
                    </span>
                    <h4 className="mt-1 font-display text-base font-bold text-ink">
                      {order.characterName || 'Commission Order'} · {getTier(order.tier).label}
                    </h4>
                    <p className="text-xs text-ink-soft">Client: {order.clientContact || 'Anonymous'}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-xl font-bold text-ink">
                      {formatUsd(order.totalUsd)}
                    </p>
                    <p className="text-[11px] text-ink-mute">
                      Split: {order.paymentSplit === '50_50' ? '50% / 50%' : '100% Upfront'}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-line/70 bg-canvas p-3">
                    <p className="text-[11px] font-semibold text-ink-mute">Deposit (Upfront)</p>
                    <p className="mt-0.5 font-display text-lg font-bold text-ink">
                      {formatUsd(order.depositUsd)}
                    </p>
                    <div className="mt-2">
                      {order.depositPaid ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-teal-soft px-2 py-0.5 text-[10px] font-bold text-teal">
                          <CheckCircle2 className="size-3" /> Verified
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-mustard px-2 py-0.5 text-[10px] font-bold text-ink">
                          Pending Verification
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-line/70 bg-canvas p-3">
                    <p className="text-[11px] font-semibold text-ink-mute">Final Balance</p>
                    <p className="mt-0.5 font-display text-lg font-bold text-ink">
                      {formatUsd(remainingUsd)}
                    </p>
                    <div className="mt-2">
                      {order.paymentSplit === '100_upfront' ? (
                        <span className="rounded-full bg-line px-2 py-0.5 text-[10px] font-medium text-ink-mute">
                          Paid in Full
                        </span>
                      ) : order.finalPaid ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-teal-soft px-2 py-0.5 text-[10px] font-bold text-teal">
                          <CheckCircle2 className="size-3" /> Verified
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-coral-soft px-2 py-0.5 text-[10px] font-bold text-coral">
                          Unpaid
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Attached receipt link if found */}
                {receiptAttachment && (
                  <div className="mt-3">
                    <a
                      href={receiptAttachment}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full border border-teal/40 bg-teal-soft/40 px-3 py-1 text-xs font-semibold text-teal transition hover:bg-teal-soft"
                    >
                      <ExternalLink className="size-3" /> View Uploaded Receipt Slip
                    </a>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-line/70 pt-3">
                {needsDeposit && (
                  <button
                    type="button"
                    onClick={() => onTogglePaymentFlag(order.id, 'depositPaid')}
                    className="inline-flex items-center gap-1.5 rounded-full bg-teal px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:opacity-90"
                  >
                    <CheckCircle2 className="size-3.5" /> Verify Deposit ({formatUsd(order.depositUsd)})
                  </button>
                )}

                {needsFinal && (
                  <button
                    type="button"
                    onClick={() => onTogglePaymentFlag(order.id, 'finalPaid')}
                    className="inline-flex items-center gap-1.5 rounded-full bg-teal px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:opacity-90"
                  >
                    <CheckCircle2 className="size-3.5" /> Verify Final Balance ({formatUsd(remainingUsd)})
                  </button>
                )}

                {!needsDeposit && !needsFinal && (
                  <button
                    type="button"
                    onClick={() => onTogglePaymentFlag(order.id, 'depositPaid')}
                    className="inline-flex items-center gap-1 rounded-full border border-line px-3 py-1.5 text-xs text-ink-soft hover:bg-cream"
                  >
                    Toggle Deposit Status
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
