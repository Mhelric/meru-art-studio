import { useEffect, useRef, useState, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trash2, AlertOctagon, Loader2, AlertTriangle, Ban } from 'lucide-react';
import type { SubmittedOrder } from '@/types';
import { getTier, formatUsd } from '@/lib/utils';

interface DeleteOrderDialogProps {
  order: SubmittedOrder | null;
  isOpen: boolean;
  isDeleting: boolean;
  onClose: () => void;
  onConfirmDelete: (orderId: string) => Promise<boolean>;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])';

export function DeleteOrderDialog({
  order,
  isOpen,
  isDeleting,
  onClose,
  onConfirmDelete,
}: DeleteOrderDialogProps) {
  const [confirmInput, setConfirmInput] = useState('');
  const onCloseRef = useRef(onClose);

  // Update ref in effect to comply with strict React linting
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  const isConfirmed = confirmInput.trim().toUpperCase() === 'DELETE';
  const hasPaidRecords = Boolean(order?.depositPaid || order?.finalPaid);
  const hasUnpaidCompletedBalance = Boolean(
    order?.stage === 'completed' && order?.paymentSplit === '50_50' && !order?.finalPaid,
  );

  // 1. Capture previously focused element on open and restore on close (strictly dependent on isOpen)
  useEffect(() => {
    if (isOpen) {
      previouslyFocusedElementRef.current = document.activeElement as HTMLElement;
      setConfirmInput('');

      return () => {
        previouslyFocusedElementRef.current?.focus();
      };
    } else {
      setConfirmInput('');
    }
  }, [isOpen]);

  // 2. Separate focus placement effect (does NOT clear typed confirmation or restore background focus)
  useEffect(() => {
    if (!isOpen) return;

    const timer = window.setTimeout(() => {
      if (!hasUnpaidCompletedBalance && inputRef.current) {
        inputRef.current.focus();
      } else if (closeBtnRef.current) {
        closeBtnRef.current.focus();
      } else if (modalRef.current) {
        modalRef.current.focus();
      }
    }, 50);

    return () => window.clearTimeout(timer);
  }, [isOpen, hasUnpaidCompletedBalance]);

  // 2. Keyboard focus trap (ignoring disabled elements so Tab wraps properly)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isDeleting) {
        e.preventDefault();
        onCloseRef.current();
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
        if (focusable.length === 0) {
          e.preventDefault();
          modalRef.current?.focus();
          return;
        }
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
  }, [isOpen, isDeleting]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!order || !isConfirmed || isDeleting || hasUnpaidCompletedBalance) return;
    const ok = await onConfirmDelete(order.id);
    if (ok) {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && order && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
          aria-describedby="delete-dialog-desc"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-ink/70 backdrop-blur-sm"
            onClick={() => !isDeleting && onClose()}
          />

          <motion.div
            ref={modalRef}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ duration: 0.2 }}
            className="relative w-full max-w-md overflow-hidden rounded-3xl border border-coral/30 bg-paper p-6 shadow-2xl focus:outline-none"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-coral/10 text-coral">
                  <AlertOctagon className="size-5" />
                </span>
                <div>
                  <h3 id="delete-dialog-title" className="font-display text-lg font-bold text-coral">
                    Permanently Purge Order
                  </h3>
                  <p id="delete-dialog-desc" className="text-xs text-ink-soft">
                    #{order.orderCode || order.id} · {getTier(order.tier).label} ({formatUsd(order.totalUsd)})
                  </p>
                </div>
              </div>

              <button
                type="button"
                ref={closeBtnRef}
                disabled={isDeleting}
                onClick={onClose}
                aria-label="Close dialog"
                className="rounded-full p-1.5 text-ink-mute transition hover:bg-cream hover:text-ink disabled:opacity-50"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Unpaid Completed Order Block */}
            {hasUnpaidCompletedBalance ? (
              <div className="mt-4 rounded-2xl border border-coral/40 bg-coral-soft p-4 text-xs text-ink">
                <div className="flex items-start gap-2.5">
                  <Ban className="size-5 shrink-0 text-coral" />
                  <div>
                    <p className="font-bold text-coral">Purge Blocked: Outstanding Balance Due</p>
                    <p className="mt-1 text-ink-soft">
                      This completed order has an unverified 50% final payment balance ({formatUsd(Math.max(0, order.totalUsd - order.depositUsd))}). To protect your studio records, completed orders with unpaid amounts cannot be purged. Reconcile or verify payment in the Payments tab first.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-coral/30 bg-coral-soft/50 p-4 text-xs text-ink">
                <p className="flex items-center gap-1.5 font-semibold text-coral">
                  <AlertTriangle className="size-4 shrink-0" />
                  <span>Destructive Action (Cannot Be Undone):</span>
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-ink-soft">
                  <li>Permanently deletes this commission and all chat history from the database.</li>
                  <li>Purges uploaded client references, chat attachments, WIP previews, and 300 DPI master files from storage buckets.</li>
                  <li>This action is final and irrecoverable.</li>
                </ul>
              </div>
            )}

            {/* Financial Ledger Warning */}
            {hasPaidRecords && !hasUnpaidCompletedBalance && (
              <div className="mt-3 rounded-2xl border border-mustard/60 bg-mustard-soft/80 p-3 text-xs text-ink">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="size-4 shrink-0 text-mustard" />
                  <div>
                    <p className="font-bold text-ink">Financial Ledger Notice:</p>
                    <p className="mt-0.5 text-ink-soft">
                      This order contains verified payment records ({order.depositPaid ? 'Deposit Verified' : ''}{order.depositPaid && order.finalPaid ? ' + ' : ''}{order.finalPaid ? 'Final Verified' : ''}). Hard-deleting it will permanently purge the associated payment transactions.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              {!hasUnpaidCompletedBalance && (
                <div>
                  <label htmlFor="confirm-delete-input" className="block text-xs font-semibold text-ink">
                    Type <span className="font-mono font-bold text-coral">DELETE</span> to confirm:
                  </label>
                  <input
                    id="confirm-delete-input"
                    ref={inputRef}
                    type="text"
                    disabled={isDeleting}
                    value={confirmInput}
                    onChange={(e) => setConfirmInput(e.target.value)}
                    placeholder="DELETE"
                    autoComplete="off"
                    className="mt-1.5 w-full rounded-2xl border border-line bg-canvas p-3 font-mono text-sm tracking-wider text-ink uppercase transition focus:border-coral focus:outline-none focus:ring-1 focus:ring-coral"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={onClose}
                  className="rounded-full border border-line px-4 py-2 text-xs font-medium text-ink transition hover:bg-cream disabled:opacity-50"
                >
                  {hasUnpaidCompletedBalance ? 'Close' : 'Cancel'}
                </button>
                {!hasUnpaidCompletedBalance && (
                  <button
                    type="submit"
                    disabled={!isConfirmed || isDeleting}
                    className="inline-flex items-center gap-1.5 rounded-full bg-coral px-5 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isDeleting ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin" /> Purging Storage & DB...
                      </>
                    ) : (
                      <>
                        <Trash2 className="size-3.5" /> Purge Order Forever
                      </>
                    )}
                  </button>
                )}
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
