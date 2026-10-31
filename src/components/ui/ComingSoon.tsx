import type { LucideIcon } from 'lucide-react';
import { Reveal } from './Reveal';

interface Props {
  icon: LucideIcon;
  title: string;
  description: string;
  phase: number;
}

/** Placeholder view for tabs that are built in later phases. */
export function ComingSoon({ icon: Icon, title, description, phase }: Props) {
  return (
    <Reveal className="card mx-auto flex max-w-lg flex-col items-center px-8 py-16 text-center">
      <div className="mb-5 grid size-14 place-items-center rounded-2xl bg-coral-soft text-coral">
        <Icon className="size-6" />
      </div>
      <span className="mb-3 rounded-full bg-mustard-soft px-3 py-1 text-xs font-medium text-[#b9800f]">
        Coming in Phase {phase}
      </span>
      <h2 className="font-display text-3xl font-semibold text-ink">{title}</h2>
      <p className="mt-2 max-w-sm text-sm text-ink-soft">{description}</p>
    </Reveal>
  );
}
