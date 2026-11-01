import { motion, useMotionValueEvent, useScroll } from 'framer-motion';
import { ArrowUpRight, LogOut, Sliders } from 'lucide-react';
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
  const { activeTab, setActiveTab, openDrawer, user, signOut, showToast, isArtistAdmin, signInWithGoogle } = useStudio();
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);

  const navItems = NAV.filter((item) => item.id !== 'admin' || isArtistAdmin);

  // Framer-style header: hide on scroll down, reveal on scroll up (throttled threshold)
  useMotionValueEvent(scrollY, 'change', (y) => {
    const prev = scrollY.getPrevious() ?? 0;
    const isScrolled = y > 12;
    setScrolled((s) => (s !== isScrolled ? isScrolled : s));

    if (y > 260 && y > prev + 10) {
      setHidden(true);
    } else if (y < prev - 10) {
      setHidden(false);
    }
  });

  const userName =
    (user?.user_metadata?.full_name as string | undefined) ||
    (user?.user_metadata?.name as string | undefined) ||
    user?.email?.split('@')[0] ||
    null;
  const userAvatar = (user?.user_metadata?.avatar_url as string | undefined) || null;

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
          <NavItems items={navItems} activeTab={activeTab} onSelect={setActiveTab} />
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          {/* Logged-in Google/Discord User Pill */}
          {user && userName && (
            <div className="flex items-center gap-1.5 rounded-full border border-line bg-paper py-1 pr-2 pl-1.5 text-xs">
              {userAvatar ? (
                <img src={userAvatar} alt="" className="size-6 rounded-full object-cover" />
              ) : (
                <span className="grid size-6 place-items-center rounded-full bg-teal text-[11px] font-bold text-white uppercase">
                  {userName[0]}
                </span>
              )}
              <button
                type="button"
                onClick={() => setActiveTab('track')}
                className="hidden max-w-[110px] truncate font-medium text-ink hover:underline sm:inline"
              >
                {userName}
              </button>
              <button
                type="button"
                onClick={async () => {
                  await signOut();
                  showToast('Signed out.');
                }}
                title="Sign out"
                aria-label="Sign out"
                className="rounded-full p-1 text-ink-mute transition hover:bg-cream hover:text-coral"
              >
                <LogOut className="size-3.5" />
              </button>
            </div>
          )}

          {/* Sign in button when logged out */}
          {!user && (
            <button
              type="button"
              onClick={() => signInWithGoogle()}
              className="rounded-full border border-line bg-paper px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-ink/40 hover:bg-cream sm:px-3.5 sm:py-2 sm:text-sm"
            >
              Sign in
            </button>
          )}

          <button
            onClick={() => openDrawer()}
            className="group inline-flex shrink-0 items-center gap-1 rounded-full bg-ink px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-coral sm:gap-1.5 sm:px-5 sm:py-2.5 sm:text-sm"
          >
            Commission
            <ArrowUpRight className="size-3.5 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 sm:size-4" />
          </button>
        </div>
      </div>

      {/* Mobile pill nav */}
      <nav
        aria-label="Primary mobile"
        className="mx-3.5 mb-2 flex justify-center rounded-full border border-line bg-paper/95 p-1 backdrop-blur md:hidden"
      >
        <NavItems items={navItems} activeTab={activeTab} onSelect={setActiveTab} compact />
      </nav>
    </motion.header>
  );
}

function NavItems({
  items,
  activeTab,
  onSelect,
  compact = false,
}: {
  items: typeof NAV;
  activeTab: TabId;
  onSelect: (t: TabId) => void;
  compact?: boolean;
}) {
  return (
    <>
      {items.map(({ id, label, short }) => {
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
