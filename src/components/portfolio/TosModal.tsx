import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Check,
  CreditCard,
  RotateCcw,
  Timer,
  FileText,
  ShieldBan,
  ChevronDown,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import { TOS } from '@/data/artist';
import { cn } from '@/lib/utils';
import { EASE } from '@/components/ui/Reveal';
import { lockScroll } from '@/lib/smoothScroll';

const ICONS: Record<string, LucideIcon> = {
  payment: CreditCard,
  refunds: RotateCcw,
  process: Timer,
  usage: FileText,
  nft: ShieldBan,
};

const REFUND_STEPS = [
  { stage: 'Before sketch starts', refund: '100%', tone: 'bg-teal-soft text-teal' },
  { stage: 'After sketch begins', refund: '50%', tone: 'bg-mustard-soft text-[#b9800f]' },
  { stage: 'Lineart / colouring', refund: '0%', tone: 'bg-coral-soft text-coral' },
];

interface TosModalProps {
  isOpen: boolean;
  onClose: () => void;
  isAccepted: boolean;
  acceptedAt?: string | null;
  onAcceptAndClose: () => void;
}

export function TosModal({
  isOpen,
  onClose,
  isAccepted,
  acceptedAt,
  onAcceptAndClose,
}: TosModalProps) {
  const [openSection, setOpenSection] = useState<string | null>(TOS[0]?.id ?? 'payment');

  useEffect(() => {
    if (isOpen) {
      lockScroll(true);
      return () => lockScroll(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/65 p-3 sm:p-5 backdrop-blur-sm overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 12 }}
          transition={{ duration: 0.25, ease: EASE }}
          onClick={(e) => e.stopPropagation()}
          className="relative flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-line bg-paper shadow-2xl my-auto"
        >
          {/* Header */}
          <div className="relative border-b border-line bg-gradient-to-r from-cream via-paper to-cream px-5 py-4 sm:px-6 sm:py-5">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Terms of Service modal"
              className="absolute right-4 top-4 grid size-8 place-items-center rounded-full border border-line bg-paper text-ink-soft transition hover:border-ink hover:text-ink"
            >
              <X className="size-4" />
            </button>

            <span className="text-[11px] font-bold uppercase tracking-wider text-coral">
              Studio Policy & Guidelines
            </span>
            <h3 className="font-display text-xl sm:text-2xl font-bold text-ink mt-0.5">
              Payment, Refunds & Usage Rights
            </h3>
            <p className="text-xs text-ink-soft mt-1">
              Clear, artist- and client-friendly policies so we both know what to expect at every stage.
            </p>
          </div>

          {/* Scrollable TOS Accordion Body */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3">
            {TOS.map((section) => {
              const isOpen = openSection === section.id;
              const Icon = ICONS[section.id] ?? FileText;

              return (
                <div
                  key={section.id}
                  className={cn(
                    'rounded-2xl border border-line bg-canvas transition-colors overflow-hidden',
                    isOpen && 'border-ink/25 bg-paper shadow-2xs',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setOpenSection(isOpen ? null : section.id)}
                    className="flex w-full items-center gap-3 p-3.5 sm:p-4 text-left"
                  >
                    <span
                      className={cn(
                        'grid size-8 sm:size-9 place-items-center rounded-xl transition-colors',
                        isOpen ? 'bg-ink text-white' : 'bg-cream text-ink-soft',
                      )}
                    >
                      <Icon className="size-4" />
                    </span>
                    <span className="flex-1 font-display text-base font-semibold text-ink">
                      {section.title}
                    </span>
                    <ChevronDown
                      className={cn(
                        'size-4 text-ink-mute transition-transform duration-200',
                        isOpen && 'rotate-180',
                      )}
                    />
                  </button>

                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: EASE }}
                      >
                        <div className="border-t border-line/70 px-4 pt-3 pb-4 sm:px-5">
                          {section.id === 'refunds' && (
                            <div className="mb-3 grid grid-cols-3 gap-2">
                              {REFUND_STEPS.map((s) => (
                                <div
                                  key={s.stage}
                                  className="rounded-xl border border-line bg-canvas p-2.5 text-center"
                                >
                                  <span
                                    className={cn(
                                      'inline-block rounded-full px-2 py-0.5 font-display text-sm font-bold',
                                      s.tone,
                                    )}
                                  >
                                    {s.refund}
                                  </span>
                                  <p className="mt-1 text-[10px] leading-tight text-ink-soft">
                                    {s.stage}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}

                          <ul className="space-y-1.5 text-xs text-ink-soft">
                            {section.points.map((p) => (
                              <li key={p} className="flex gap-2">
                                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-coral" />
                                <span>{p}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>

          {/* Sticky Footer */}
          <div className="border-t border-line bg-canvas p-4 sm:px-6 sm:py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-left w-full sm:w-auto">
              {isAccepted && acceptedAt ? (
                <div className="flex items-center gap-1.5 text-xs font-semibold text-teal">
                  <ShieldCheck className="size-4" />
                  <span>
                    Agreed & Logged at{' '}
                    {new Date(acceptedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              ) : (
                <p className="text-[11px] text-ink-mute">
                  Acceptance is required to confirm scope and begin production.
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-line bg-paper px-4 py-2 text-xs font-medium text-ink-soft transition hover:text-ink"
              >
                Close
              </button>

              <button
                type="button"
                onClick={onAcceptAndClose}
                className="flex items-center justify-center gap-1.5 rounded-full bg-ink px-5 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-coral"
              >
                <Check className="size-3.5 text-mustard" strokeWidth={3} />
                <span>
                  {isAccepted ? 'Keep Agreed & Return' : 'I Have Read & Agree to TOS'}
                </span>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
