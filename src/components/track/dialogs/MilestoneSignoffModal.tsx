import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldCheck,
  Check,
  X,
  FileCheck2,
  Lock,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { lockScroll } from '@/lib/smoothScroll';
import type { SubmittedOrder, WipUploadItem } from '@/types';
import { artSrc } from '@/components/portfolio/ArtImage';
import {
  type SignoffChecklist,
  isSignoffComplete,
} from '@/lib/revisionWorkflow';

export interface MilestoneSignoffModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: SubmittedOrder;
  wip: WipUploadItem | null;
  onConfirmSignoff: (checklist: SignoffChecklist, signerName: string) => Promise<void>;
}

export function MilestoneSignoffModal({
  isOpen,
  onClose,
  order,
  wip,
  onConfirmSignoff,
}: MilestoneSignoffModalProps) {
  const [checklist, setChecklist] = useState<SignoffChecklist>({
    poseAndComposition: false,
    characterAndDetails: false,
    termsAcknowledged: false,
  });

  const [signerName, setSignerName] = useState(order.clientContact || 'Client');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSignedSuccessfully, setHasSignedSuccessfully] = useState(false);

  // Reset checklist when opened
  useEffect(() => {
    if (isOpen) {
      setChecklist({
        poseAndComposition: false,
        characterAndDetails: false,
        termsAcknowledged: false,
      });
      setSignerName(order.clientContact || 'Client');
      setIsSubmitting(false);
      setHasSignedSuccessfully(false);
      lockScroll(true);
      return () => lockScroll(false);
    }
  }, [isOpen, order.clientContact]);

  const canSign = isSignoffComplete(checklist) && signerName.trim().length > 0;
  const previewImage = wip?.imageUrl || (wip?.slug ? artSrc(wip.slug, 'sm') : null);
  const displayCode = order.orderCode || order.id;

  const handleToggle = (key: keyof SignoffChecklist) => {
    setChecklist((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSignAll = () => {
    setChecklist({
      poseAndComposition: true,
      characterAndDetails: true,
      termsAcknowledged: true,
    });
  };

  const handleSubmit = async () => {
    if (!canSign || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onConfirmSignoff(checklist, signerName.trim());
      setHasSignedSuccessfully(true);
      setTimeout(() => {
        onClose();
      }, 1200);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="signoff-gate-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-ink/60 backdrop-blur-xs transition-opacity"
            aria-hidden="true"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ type: 'spring', damping: 28, stiffness: 350 }}
            className="relative w-full max-w-xl rounded-3xl border border-line bg-paper p-5 sm:p-6 shadow-2xl z-10 my-auto text-ink max-h-[92vh] flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-start justify-between border-b border-line pb-4 shrink-0">
              <div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-teal-soft text-teal border border-teal/20 shadow-2xs">
                  <ShieldCheck className="size-5" />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="eyebrow text-[10px] text-teal font-bold uppercase tracking-wider">
                      Authoritative Gate
                    </span>
                    <span className="rounded-full bg-cream px-2 py-0.5 text-[10px] font-semibold text-ink-soft">
                      #{displayCode}
                    </span>
                  </div>
                  <h3 id="signoff-gate-title" className="font-display text-lg sm:text-xl font-bold text-ink truncate">
                    Formal Milestone Sign-off Gate
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close sign-off dialog"
                className="grid size-8 shrink-0 place-items-center rounded-full text-ink-mute hover:bg-canvas hover:text-ink transition"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Scrollable Content Body */}
            <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
              {/* Deliverable Snapshot Card */}
              <div className="flex flex-col sm:flex-row items-center gap-3.5 rounded-2xl border border-line bg-canvas p-3 sm:p-3.5">
                {previewImage ? (
                  <div className="relative size-20 sm:size-24 shrink-0 overflow-hidden rounded-xl border border-line bg-cream shadow-2xs">
                    <img
                      src={previewImage}
                      alt={wip?.title || 'Deliverable'}
                      className="size-full object-cover"
                    />
                    <a
                      href={previewImage}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="absolute inset-0 grid place-items-center bg-black/40 opacity-0 hover:opacity-100 transition text-white text-[10px] font-semibold"
                    >
                      <ExternalLink className="size-3.5" />
                    </a>
                  </div>
                ) : (
                  <div className="grid size-20 sm:size-24 shrink-0 place-items-center rounded-xl border border-line bg-cream text-ink-mute">
                    <FileCheck2 className="size-6" />
                  </div>
                )}

                <div className="min-w-0 flex-1 space-y-1 text-center sm:text-left">
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5">
                    <span className="rounded-full bg-teal px-2 py-0.5 text-[10px] font-bold text-white uppercase">
                      Target Milestone
                    </span>
                    <span className="text-xs font-bold text-ink">
                      {wip?.title || 'WIP Milestone'}
                    </span>
                  </div>
                  <p className="text-[11px] text-ink-mute line-clamp-2">
                    {wip?.artistNote || 'Artist pass prepared for formal review and client acceptance.'}
                  </p>
                  <p className="text-[10px] font-medium text-teal flex items-center justify-center sm:justify-start gap-1">
                    <Lock className="size-2.5" /> Approving unlocks next production phase & remaining payment gate
                  </p>
                </div>
              </div>

              {/* Informational Notice */}
              <div className="rounded-2xl border border-teal/20 bg-teal-soft/40 p-3 text-xs text-ink space-y-1">
                <p className="font-semibold text-teal flex items-center gap-1.5 text-[11px] sm:text-xs">
                  <ShieldCheck className="size-3.5 shrink-0" /> Why Formal Sign-off Matters
                </p>
                <p className="text-[11px] text-ink-soft leading-relaxed">
                  Signing off confirms you are satisfied with this milestone. It ensures Meru Art can proceed to full lineart and coloring with full confidence that poses and features are locked.
                </p>
              </div>

              {/* Interactive Sign-off Checklist */}
              <div className="space-y-2.5 rounded-2xl border border-line bg-paper p-4">
                <div className="flex items-center justify-between border-b border-line/60 pb-2">
                  <span className="text-xs font-bold text-ink uppercase tracking-wide">
                    Milestone Acceptance Checklist
                  </span>
                  <button
                    type="button"
                    onClick={handleSignAll}
                    className="text-[11px] font-semibold text-coral hover:underline"
                  >
                    Check All 3
                  </button>
                </div>

                {/* Item 1 */}
                <label className="flex items-start gap-3 cursor-pointer group p-1.5 rounded-xl hover:bg-canvas transition">
                  <input
                    type="checkbox"
                    checked={checklist.poseAndComposition}
                    onChange={() => handleToggle('poseAndComposition')}
                    className="mt-0.5 size-4 accent-teal rounded shrink-0 cursor-pointer"
                  />
                  <div className="text-xs">
                    <p className="font-semibold text-ink group-hover:text-teal transition">
                      1. Pose, Silhouette & Composition
                    </p>
                    <p className="text-[11px] text-ink-mute leading-snug">
                      I have inspected the pose, body proportions, angle, and framing, and confirm they match my vision.
                    </p>
                  </div>
                </label>

                {/* Item 2 */}
                <label className="flex items-start gap-3 cursor-pointer group p-1.5 rounded-xl hover:bg-canvas transition">
                  <input
                    type="checkbox"
                    checked={checklist.characterAndDetails}
                    onChange={() => handleToggle('characterAndDetails')}
                    className="mt-0.5 size-4 accent-teal rounded shrink-0 cursor-pointer"
                  />
                  <div className="text-xs">
                    <p className="font-semibold text-ink group-hover:text-teal transition">
                      2. Character Design & Expressions
                    </p>
                    <p className="text-[11px] text-ink-mute leading-snug">
                      Hairstyle, facial expression, outfit, and key character details match my uploaded reference sheets.
                    </p>
                  </div>
                </label>

                {/* Item 3 */}
                <label className="flex items-start gap-3 cursor-pointer group p-1.5 rounded-xl hover:bg-canvas transition">
                  <input
                    type="checkbox"
                    checked={checklist.termsAcknowledged}
                    onChange={() => handleToggle('termsAcknowledged')}
                    className="mt-0.5 size-4 accent-teal rounded shrink-0 cursor-pointer"
                  />
                  <div className="text-xs">
                    <p className="font-semibold text-ink group-hover:text-teal transition">
                      3. Stage Lock & TOS Acknowledgment
                    </p>
                    <p className="text-[11px] text-ink-mute leading-snug">
                      I understand this sign-off formally locks the sketch. Minor color tweaks remain free in later stages, but major pose redraws after this gate require an additional fee per studio TOS.
                    </p>
                  </div>
                </label>
              </div>

              {/* Signer Confirmation Input */}
              <div className="rounded-2xl border border-line bg-canvas p-3.5 space-y-1.5">
                <label className="block text-[11px] font-semibold text-ink uppercase tracking-wide">
                  Signing Client Identity / Name
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={signerName}
                    onChange={(e) => setSignerName(e.target.value)}
                    placeholder="Enter your name or client handle..."
                    className="flex-1 rounded-xl border border-line bg-paper px-3 py-1.5 text-xs text-ink focus:border-ink focus:outline-none"
                  />
                  <span className="text-[10px] text-ink-mute whitespace-nowrap">
                    {new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>
              </div>

              {/* Warning if incomplete */}
              {!canSign && (
                <p className="text-[11px] text-coral flex items-center gap-1.5 px-1">
                  <AlertTriangle className="size-3.5 shrink-0" />
                  Please complete all 3 checklist items and enter your name to unlock formal sign-off.
                </p>
              )}
            </div>

            {/* Footer Actions */}
            <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-2.5 border-t border-line pt-4 shrink-0">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="w-full sm:w-auto rounded-full border border-line bg-canvas px-4 py-2 text-xs font-semibold text-ink-soft hover:bg-cream hover:text-ink transition"
              >
                Back to Review
              </button>

              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSign || isSubmitting || hasSignedSuccessfully}
                className={cn(
                  'w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-xs font-semibold shadow-xs transition-all',
                  canSign && !hasSignedSuccessfully
                    ? 'bg-teal text-white hover:bg-ink shadow-teal/20 hover:scale-[1.01]'
                    : hasSignedSuccessfully
                      ? 'bg-teal text-white font-bold'
                      : 'bg-line text-ink-mute cursor-not-allowed',
                )}
              >
                {hasSignedSuccessfully ? (
                  <>
                    <Check className="size-4" strokeWidth={3} />
                    <span>Milestone Formally Signed Off!</span>
                  </>
                ) : isSubmitting ? (
                  <span>Recording Formal Sign-off...</span>
                ) : (
                  <>
                    <ShieldCheck className="size-4" />
                    <span>Formally Sign-off & Lock Milestone</span>
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
