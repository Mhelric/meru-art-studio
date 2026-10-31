import type { ReactNode } from 'react';
import { Reveal } from './Reveal';

interface Props {
  eyebrow: string;
  title: ReactNode;
  subtitle?: string;
  align?: 'left' | 'center';
}

export function SectionHeading({ eyebrow, title, subtitle, align = 'left' }: Props) {
  return (
    <Reveal className={align === 'center' ? 'mb-10 text-center' : 'mb-10'}>
      <p className="eyebrow mb-2">{eyebrow}</p>
      <h2 className="font-display text-3xl font-semibold tracking-tight text-ink sm:text-[42px] sm:leading-[1.1]">
        {title}
      </h2>
      {subtitle && (
        <p className={`mt-3 max-w-2xl text-base text-ink-soft ${align === 'center' ? 'mx-auto' : ''}`}>{subtitle}</p>
      )}
    </Reveal>
  );
}
