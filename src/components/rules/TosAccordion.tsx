import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, CreditCard, FileText, RotateCcw, ShieldBan, Timer, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { TOS } from '@/data/artist';
import { cn } from '@/lib/utils';
import { EASE } from '@/components/ui/Reveal';

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

export function TosAccordion() {
  const [open, setOpen] = useState<string | null>(TOS[0].id);

  return (
    <div className="space-y-3">
      {TOS.map((section) => {
        const isOpen = open === section.id;
        const Icon = ICONS[section.id] ?? FileText;
        const panelId = `tos-panel-${section.id}`;

        return (
          <div
            key={section.id}
            className={cn('card overflow-hidden transition-colors', isOpen && 'border-ink/25')}
          >
            <button
              onClick={() => setOpen(isOpen ? null : section.id)}
              aria-expanded={isOpen}
              aria-controls={panelId}
              className="flex w-full items-center gap-3.5 px-5 py-4 text-left"
            >
              <span
                className={cn(
                  'grid size-10 place-items-center rounded-2xl transition-colors',
                  isOpen ? 'bg-ink text-white' : 'bg-cream text-ink-soft',
                )}
              >
                <Icon className="size-4.5" />
              </span>
              <span className="flex-1 font-display text-xl font-semibold text-ink">{section.title}</span>
              <motion.span animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.3, ease: EASE }}>
                <ChevronDown className="size-5 text-ink-mute" />
              </motion.span>
            </button>

            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  id={panelId}
                  role="region"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.35, ease: EASE }}
                >
                  <div className="border-t border-line px-5 pt-4 pb-5 sm:pl-[4.5rem]">
                    {section.id === 'refunds' && <RefundTimeline />}
                    <ul className="space-y-2 text-sm text-ink-soft">
                      {section.points.map((p) => (
                        <li key={p} className="flex gap-2.5">
                          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-coral" />
                          {p}
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
  );
}

function RefundTimeline() {
  return (
    <div className="mb-4 grid grid-cols-3 gap-2.5">
      {REFUND_STEPS.map((s) => (
        <div key={s.stage} className="rounded-2xl border border-line bg-canvas p-3 text-center">
          <span className={cn(' inline-block rounded-full px-2.5 py-0.5 font-display text-lg font-semibold', s.tone)}>
            {s.refund}
          </span>
          <p className="mt-1 text-xs text-ink-soft">{s.stage}</p>
        </div>
      ))}
    </div>
  );
}
