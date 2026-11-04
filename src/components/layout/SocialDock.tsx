import { Check, Copy } from 'lucide-react';
import { useEffect, useState, type CSSProperties } from 'react';
import { SOCIALS } from '@/data/artist';
import { BrandIcon } from '@/components/ui/BrandIcon';
import { useStudio } from '@/context/StudioContext';
import { cn } from '@/lib/utils';

/**
 * Static quick-contact dock.
 * Desktop: fixed vertical pill rail on the left edge (never moves or drifts on scroll).
 * Mobile: fixed horizontal pill bar at the bottom.
 * Hidden on admin dashboard, client order tracker, and schedule tab.
 * Smoothly fades out on mobile when scrolled down to the footer to prevent duplication.
 */
export function SocialDock() {
  const { showToast, drawerOpen, lightbox, activeTab } = useStudio();
  const [copied, setCopied] = useState(false);
  const [atBottom, setAtBottom] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const scrollHeight = document.documentElement.scrollHeight;
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const clientHeight = window.innerHeight;
      // Fade out when within 120px of the footer bottom on mobile
      setAtBottom(scrollTop + clientHeight >= scrollHeight - 120);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll, { passive: true });
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, [activeTab]);

  // Unmount on Admin panel, Order Tracker, and Schedule tab
  if (activeTab === 'admin' || activeTab === 'track' || activeTab === 'schedule') {
    return null;
  }

  // Hide when modal or lightbox is active
  if (drawerOpen || Boolean(lightbox)) {
    return null;
  }

  const copyDiscord = async (handle: string) => {
    try {
      await navigator.clipboard.writeText(handle);
      setCopied(true);
      showToast(`Discord username "${handle}" copied!`);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast(`Discord: ${handle}`);
    }
  };

  return (
    <aside
      aria-label="Social links"
      className={cn(
        'fixed inset-x-6 bottom-2.5 z-40 mx-auto flex max-w-xs justify-around rounded-full border border-line bg-paper/95 px-2 py-1 shadow-sm backdrop-blur-xl transition-all duration-300 sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-4 sm:mx-0 sm:max-w-none sm:-translate-y-1/2 sm:flex-col sm:gap-1 sm:p-1.5',
        atBottom
          ? 'opacity-0 pointer-events-none translate-y-4 sm:opacity-100 sm:pointer-events-auto sm:translate-y-[-50%]'
          : 'opacity-100 translate-y-0',
      )}
    >
      {SOCIALS.map((s) => {
        const isDiscord = s.id === 'discord';
        const content = (
          <>
            {isDiscord && copied ? (
              <Check className="size-4 text-teal" />
            ) : (
              <BrandIcon id={s.id} className="size-3.5 sm:size-4" />
            )}
            {/* Desktop tooltip */}
            <span className="pointer-events-none absolute left-full ml-3 hidden translate-x-1 items-center gap-1.5 rounded-full border border-line bg-paper px-3 py-1.5 text-xs whitespace-nowrap text-ink opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100 sm:flex">
              <span className="font-medium">{s.label}</span>
              <span className="text-ink-mute">{s.handle}</span>
              {isDiscord && <Copy className="size-3 text-ink-mute" />}
            </span>
          </>
        );
        const className =
          'group relative grid size-8 place-items-center rounded-full text-ink-soft transition hover:scale-110 hover:bg-cream hover:text-[var(--brand)] sm:size-9';
        const style = { '--brand': s.color } as CSSProperties;

        return isDiscord ? (
          <button
            key={s.id}
            onClick={() => copyDiscord(s.handle)}
            aria-label={`Copy Discord username ${s.handle}`}
            className={className}
            style={style}
          >
            {content}
          </button>
        ) : (
          <a
            key={s.id}
            href={s.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${s.label} ${s.handle}`}
            className={className}
            style={style}
          >
            {content}
          </a>
        );
      })}
    </aside>
  );
}
