import { motion, useMotionValueEvent, useScroll } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import { useState } from 'react';
import { useStudio } from '@/context/StudioContext';
import { cn } from '@/lib/utils';
import { scrollToTarget } from '@/lib/smoothScroll';
import { EASE } from '@/components/ui/Reveal';
import type { TabId } from '@/types';

const NAV: { id: TabId; label: string; short: string }[] = [
  { id: 'portfolio', label: 'Portfolio & Pricing', short: 'Portfolio' },
  { id: 'rules', label: 'Rules & TOS', short: 'Rules' },
  { id: 'schedule', label: 'Schedule & Calendar', short: 'Schedule' },
  { id: 'track', label: 'Track Order', short: 'Track' },
];

export function NavBar() {
  const { activeTab, setActiveTab } = useStudio();
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);

  // Framer-style header: hide on scroll down, reveal on scroll up.
  useMotionValueEvent(scrollY, 'change', (y) => {
    const prev = scrollY.getPrevious() ?? 0;
    setScrolled(y > 12);
    setHidden(y > 240 && y > prev + 4 ? true : y < prev - 4 ? false : hidden);
  });

  const goPricing = () => {
    if (activeTab !== 'portfolio') setActiveTab('portfolio');
    setTimeout(() => scrollToTarget('#pricing'), activeTab === 'portfolio' ? 0 : 450);
  };

  return (
    <motion.header
      animate={{ y: hidden ? '-110%' : 0 }}
      transition={{ duration: 0.5, ease: EASE }}
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-500',
        scrolled ? 'border-b border-line bg-canvas/80 backdrop-blur-xl' : 'border-b border-transparent',
      )}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-8">
        <button onClick={() => setActiveTab('portfolio')} aria-label="Meru Art home" className="shrink-0">
          <img src="/brand/logo-sm.webp" alt="Meru Art" className="h-11 w-auto mix-blend-multiply transition-transform duration-500 hover:scale-105 sm:h-12" />
        </button>

        {/* Desktop pill nav */}
        <nav aria-label="Primary" className="hidden rounded-full border border-line bg-paper/80 p-1 backdrop-blur md:flex">
          <NavItems activeTab={activeTab} onSelect={setActiveTab} />
        </nav>

        <button
          onClick={goPricing}
          className="group inline-flex shrink-0 items-center gap-1.5 rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-coral sm:px-5"
        >
          Commission
          <ArrowUpRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </button>
      </div>

      {/* Mobile pill nav */}
      <nav aria-label="Primary mobile" className="mx-4 mb-3 flex justify-center rounded-full border border-line bg-paper/90 p-1 backdrop-blur md:hidden">
        <NavItems activeTab={activeTab} onSelect={setActiveTab} compact />
      </nav>
    </motion.header>
  );
}

function NavItems({ activeTab, onSelect, compact = false }: { activeTab: TabId; onSelect: (t: TabId) => void; compact?: boolean }) {
  return (
    <>
      {NAV.map(({ id, label, short }) => {
        const active = activeTab === id;
        return (
          <button
            key={id}
            onClick={() => onSelect(id)}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative flex-1 rounded-full px-3 py-2 text-[13px] font-medium whitespace-nowrap transition-colors duration-300 lg:px-4 lg:text-sm',
              active ? 'text-white' : 'text-ink-soft hover:text-ink',
            )}
          >
            {active && (
              <motion.span
                layoutId={compact ? 'nav-pill-m' : 'nav-pill'}
                className="absolute inset-0 rounded-full bg-ink"
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              />
            )}
            <span className="relative">{compact ? short : <><span className="lg:hidden">{short}</span><span className="hidden lg:inline">{label}</span></>}</span>
          </button>
        );
      })}
    </>
  );
}
