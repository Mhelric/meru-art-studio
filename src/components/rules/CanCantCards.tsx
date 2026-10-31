import { Ban, Check, CircleCheck, CircleX, X } from 'lucide-react';
import { CAN_DRAW, CANT_DRAW } from '@/data/artist';
import type { RuleItem } from '@/types';
import { cn } from '@/lib/utils';
import { Reveal } from '@/components/ui/Reveal';

export function CanCantCards() {
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <RuleCard variant="can" title="What I Can Draw" items={CAN_DRAW} />
      <RuleCard variant="cant" title="What I Won’t Draw" items={CANT_DRAW} />

      <Reveal delay={0.15} className="card flex flex-col items-start gap-4 border-coral/30 bg-coral-soft/60 p-6 sm:flex-row sm:items-center md:col-span-2">
        <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-paper text-coral">
          <Ban className="size-6" />
        </div>
        <div>
          <p className="font-display text-2xl font-semibold text-ink">Strict Anti-NFT & Anti-AI Policy</p>
          <p className="mt-0.5 text-sm text-ink-soft">
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
    <Reveal delay={can ? 0 : 0.08} className="card p-6">
      <div className="mb-5 flex items-center gap-3">
        <span className={cn('grid size-10 place-items-center rounded-2xl', can ? 'bg-teal-soft text-teal' : 'bg-coral-soft text-coral')}>
          <HeaderIcon className="size-5" />
        </span>
        <h3 className="font-display text-2xl font-semibold text-ink">{title}</h3>
      </div>

      <ul className="space-y-2.5">
        {items.map((item) => (
          <li
            key={item.label}
            className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-canvas px-4 py-3"
          >
            <span className="flex items-center gap-3 text-sm font-medium text-ink">
              <span
                className={cn(
                  'grid size-6 place-items-center rounded-full',
                  can ? 'bg-teal-soft text-teal' : 'bg-coral-soft text-coral',
                )}
              >
                <ItemIcon className="size-3.5" strokeWidth={2.75} />
              </span>
              {item.label}
            </span>
            {item.note && (
              <span className="rounded-full bg-mustard-soft px-2.5 py-0.5 text-xs font-semibold text-[#b9800f]">{item.note}</span>
            )}
          </li>
        ))}
      </ul>
    </Reveal>
  );
}
