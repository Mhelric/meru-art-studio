import { useEffect, useRef, useState, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, XCircle, AlertTriangle, Clock } from 'lucide-react';
import type { SubmittedOrder } from '@/types';
import { getTier, formatMoney } from '@/lib/utils';
import { getActiveCancellationRequest, getRefundTierInfo } from '@/lib/orderCancellation';

interface DeclineReasonModalProps {
  order: SubmittedOrder | null;
  isOpen: boolean;
  mode?: 'decline' | 'cancel';
  onClose: () => void;
  onConfirmDecline: (orderId: string, reason?: string) => void;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])';

export function DeclineReasonModal({
  order,
  isOpen,
  mode = 'decline',
  onClose,
  onConfirmDecline,
}: DeclineReasonModalProps) {
  const [reason, setReason] = useState('');
  const onCloseRef = useRef(onClose);

  // Update ref in effect to comply with strict React linting
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 1. Reset input and capture focus strictly on isOpen transitions
  useEffect(() => {
    if (isOpen) {
      previouslyFocusedElementRef.current = document.activeElement as HTMLElement;
      setReason('');
      const timer = window.setTimeout(() => {
        textareaRef.current?.focus();
      }, 50);

      return () => {
        window.clearTimeout(timer);
        previouslyFocusedElementRef.current?.focus();
      };
    } else {
      setReason('');
    }
  }, [isOpen]);

  // 2. Keyboard listener uses onCloseRef to prevent re-render resets
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!order) return;
    onConfirmDecline(order.id, reason.trim());
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && order && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="decline-dialog-title"
          aria-describedby="decline-dialog-desc"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-ink/60 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            ref={modalRef}
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ duration: 0.2 }}
            className="relative w-full max-w-md overflow-hidden rounded-3xl border border-line bg-paper p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-coral-soft text-coral">
                  <XCircle className="size-5" />
                </span>
                <div>
                  <h3 id="decline-dialog-title" className="font-display text-lg font-bold text-ink">
                    {mode === 'cancel' ? 'Cancel Commission Order' : 'Decline Commission Brief'}
                  </h3>
                  <p id="decline-dialog-desc" className="text-xs text-ink-soft">
                    #{order.orderCode || order.id} · {getTier(order.tier).label}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="Close dialog"
                className="rounded-full p-1.5 text-ink-mute transition hover:bg-cream hover:text-ink"
              >
                <X className="size-4" />
              </button>
            </div>

            {(() => {
              const cancelReq = order ? getActiveCancellationRequest(order) : null;
              const refundDetails = order
                ? getRefundTierInfo(
                    order.stage,
                    order.totalUsd,
                    order.depositUsd,
                    order.depositPaid,
                    order.finalPaid,
                  )
                : null;

              return (
                <>
                  {mode === 'cancel' && cancelReq?.hasRequest && refundDetails && (
                    <div className="mt-4 rounded-2xl border border-coral/30 bg-coral-soft/60 p-3.5 text-xs text-ink space-y-2">
                      <div className="flex items-center gap-1.5 font-bold text-coral">
                        <AlertTriangle className="size-4" /> Client Submitted Cancellation Request
                      </div>
                      <p className="italic text-ink-soft">"{cancelReq.reason}"</p>
                      <div className="grid grid-cols-2 gap-2 rounded-xl bg-paper p-2.5 text-[11px] border border-line">
                        <div>
                          <span className="text-ink-mute">Refund Tier:</span>
                          <p className="font-semibold text-ink">{refundDetails.tierName} ({refundDetails.percentage})</p>
                        </div>
                        <div>
                          <span className="text-ink-mute">Eligible Refund:</span>
                          <p className="font-semibold text-coral">{formatMoney(refundDetails.refundAmount, order.currency)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-ink-mute">
                        <Clock className="size-3 text-coral" />
                        <span>Timeline: Process refund via PayPal/GCash within <strong>3–5 business days</strong>.</span>
                      </div>
                    </div>
                  )}

                  <div className="mt-4 rounded-2xl border border-coral/30 bg-coral-soft/40 p-3 text-xs text-ink-soft">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="size-4 shrink-0 text-coral" />
                      <p>
                        {mode === 'cancel'
                          ? 'Cancelling this commission will move the order into the Archive and release any scheduled calendar slot. The client will be notified with your confirmation notice.'
                          : 'Declining this brief will move the order into the Archive and release any temporary slot lock. The client will be able to see the status when tracking.'}
                      </p>
                    </div>
                  </div>
                </>
              );
            })()}

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div>
                <label htmlFor="decline-reason" className="block text-xs font-semibold text-ink">
                  Reason / Note to Client <span className="font-normal text-ink-mute">(optional)</span>:
                </label>
                <textarea
                  id="decline-reason"
                  ref={textareaRef}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={
                    mode === 'cancel'
                      ? 'e.g. Mutual cancellation agreed with client; partial refund issued per TOS.'
                      : 'e.g. Schedule is currently full for complex mecha/armor; suggest booking next month.'
                  }
                  rows={3}
                  className="mt-1.5 w-full rounded-2xl border border-line bg-canvas p-3 text-xs text-ink transition focus:border-coral focus:outline-none focus:ring-1 focus:ring-coral"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full border border-line px-4 py-2 text-xs font-medium text-ink transition hover:bg-cream"
                >
                  Keep Order
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-full bg-coral px-5 py-2 text-xs font-semibold text-white transition hover:opacity-90"
                >
                  <XCircle className="size-3.5" />
                  {mode === 'cancel' ? 'Cancel Commission' : 'Decline Order'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
