import { Ban, Check, CircleCheck, CircleX, X } from 'lucide-react';
import { CAN_DRAW, CANT_DRAW } from '@/data/artist';
import type { RuleItem } from '@/types';
import { cn } from '@/lib/utils';
import { Reveal } from '@/components/ui/Reveal';

export function CanCantCards() {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:gap-5">
      <RuleCard variant="can" title="What I Can Draw" items={CAN_DRAW} />
      <RuleCard variant="cant" title="What I Won’t Draw" items={CANT_DRAW} />

      <Reveal delay={0.15} className="card col-span-2 flex flex-col items-start gap-3.5 border-coral/30 bg-coral-soft/60 p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-6">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-paper text-coral sm:size-12 sm:rounded-2xl">
          <Ban className="size-5 sm:size-6" />
        </div>
        <div>
          <p className="font-display text-lg font-semibold text-ink sm:text-2xl">Strict Anti-NFT & Anti-AI Policy</p>
          <p className="mt-0.5 text-xs text-ink-soft sm:text-sm">
            Zero NFT usage is allowed — commissioned work may never be minted, tokenised, or sold on any blockchain, nor used to train AI models. Violations revoke your license immediately.
          </p>
        </div>
      </Reveal>
    </div>
  );
}

function RuleCard({ variant, title, items }: { variant: 'can' | 'cant'; title: string; items: RuleItem[] }) {
  const can = variant === 'can';
  const HeaderIcon = can ? CircleCheck : CircleX;
  const ItemIcon = can ? Check : X;

  return (
    <Reveal delay={can ? 0 : 0.08} className="card flex flex-col p-3 sm:p-6">
      <div className="mb-3.5 sm:mb-5 flex items-center gap-2 sm:gap-3">
        <span className={cn('grid size-7 sm:size-10 shrink-0 place-items-center rounded-xl sm:rounded-2xl', can ? 'bg-teal-soft text-teal' : 'bg-coral-soft text-coral')}>
          <HeaderIcon className="size-3.5 sm:size-5" />
        </span>
        <h3 className="font-display text-base font-semibold text-ink sm:text-2xl truncate">{title}</h3>
      </div>

      <ul className="space-y-1.5 sm:space-y-2.5">
        {items.map((item) => (
          <li
            key={item.label}
            className="flex flex-col gap-1 rounded-xl sm:rounded-2xl border border-line bg-canvas p-2 sm:px-4 sm:py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
          >
            <span className="flex items-center gap-1.5 text-xs font-medium text-ink sm:gap-3 sm:text-sm">
              <span
                className={cn(
                  'grid size-4 sm:size-6 shrink-0 place-items-center rounded-full',
                  can ? 'bg-teal-soft text-teal' : 'bg-coral-soft text-coral',
                )}
              >
                <ItemIcon className="size-2.5 sm:size-3.5" strokeWidth={2.75} />
              </span>
              <span className="leading-tight truncate">{item.label}</span>
            </span>
            {item.note && (
              <span className="self-start sm:self-auto rounded-full bg-mustard-soft px-1.5 py-0.2 sm:px-2.5 sm:py-0.5 text-[9px] sm:text-xs font-semibold text-[#b9800f] whitespace-nowrap">
                {item.note}
              </span>
            )}
          </li>
        ))}
      </ul>
    </Reveal>
  );
}
