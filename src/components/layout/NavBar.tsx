import { motion, useMotionValueEvent, useScroll } from 'framer-motion';
import { ArrowUpRight, Sliders } from 'lucide-react';
import { useState } from 'react';
import { useStudio } from '@/context/StudioContext';
import { cn } from '@/lib/utils';
import { EASE } from '@/components/ui/Reveal';
import type { TabId } from '@/types';

const NAV: { id: TabId; label: string; short: string }[] = [
  { id: 'portfolio', label: 'Portfolio & Pricing', short: 'Portfolio' },
  { id: 'rules', label: 'Rules & TOS', short: 'Rules' },
  { id: 'schedule', label: 'Schedule & Calendar', short: 'Schedule' },
  { id: 'track', label: 'Track Order', short: 'Track' },
  { id: 'admin', label: 'Artist Admin', short: 'Admin' },
];

export function NavBar() {
  const { activeTab, setActiveTab, openDrawer } = useStudio();
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);

  // Framer-style header: hide on scroll down, reveal on scroll up.
  useMotionValueEvent(scrollY, 'change', (y) => {
    const prev = scrollY.getPrevious() ?? 0;
    setScrolled(y > 12);
    setHidden(y > 260 && y > prev + 6 ? true : y < prev - 6 ? false : hidden);
  });

  return (
    <motion.header
      animate={{ y: hidden ? '-110%' : 0 }}
      transition={{ duration: 0.45, ease: EASE }}
      className={cn(
        'fixed inset-x-0 top-0 z-50 border-b transition-[background-color,border-color,backdrop-filter] duration-300',
        scrolled ? 'border-line bg-canvas/90 backdrop-blur-xl' : 'border-transparent bg-canvas/80 backdrop-blur-md md:bg-transparent',
      )}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3.5 py-2.5 sm:px-8 sm:py-3">
        <button onClick={() => setActiveTab('portfolio')} aria-label="Meru Art home" className="shrink-0">
          <img
            src="/brand/logo-sm.webp"
            alt="Meru Art"
            className="h-9 w-auto mix-blend-multiply transition-transform duration-500 hover:scale-105 sm:h-11"
          />
        </button>

        {/* Desktop pill nav */}
        <nav aria-label="Primary" className="hidden rounded-full border border-line bg-paper/90 p-1 backdrop-blur md:flex">
          <NavItems activeTab={activeTab} onSelect={setActiveTab} />
        </nav>

        <button
          onClick={() => openDrawer()}
          className="group inline-flex shrink-0 items-center gap-1 rounded-full bg-ink px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-coral sm:gap-1.5 sm:px-5 sm:py-2.5 sm:text-sm"
        >
          Commission
          <ArrowUpRight className="size-3.5 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 sm:size-4" />
        </button>
      </div>

      {/* Mobile pill nav */}
      <nav
        aria-label="Primary mobile"
        className="mx-3.5 mb-2 flex justify-center rounded-full border border-line bg-paper/95 p-1 backdrop-blur md:hidden"
      >
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
        const isAdmin = id === 'admin';
        return (
          <button
            key={id}
            onClick={() => onSelect(id)}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative flex-1 rounded-full px-2 py-1.5 text-xs font-medium whitespace-nowrap transition-colors duration-300 sm:px-3 sm:py-2 lg:px-4 lg:text-sm',
              active ? 'text-white' : isAdmin ? 'text-coral hover:text-ink' : 'text-ink-soft hover:text-ink',
            )}
          >
            {active && (
              <motion.span
                layoutId={compact ? 'nav-pill-m' : 'nav-pill'}
                className="absolute inset-0 rounded-full bg-ink"
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              />
            )}
            <span className="relative inline-flex items-center gap-1">
              {isAdmin && <Sliders className="size-3 shrink-0" />}
              {compact ? (
                short
              ) : (
                <>
                  <span className="lg:hidden">{short}</span>
                  <span className="hidden lg:inline">{label}</span>
                </>
              )}
            </span>
          </button>
        );
      })}
    </>
  );
}
