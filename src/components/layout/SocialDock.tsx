import { motion, useMotionValueEvent, useScroll } from 'framer-motion';
import { Check, Copy } from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import { SOCIALS } from '@/data/artist';
import { BrandIcon } from '@/components/ui/BrandIcon';
import { useStudio } from '@/context/StudioContext';
import { EASE } from '@/components/ui/Reveal';
import { cn } from '@/lib/utils';

/**
 * Persistent quick-contact dock.
 * Desktop: floating pill rail on the left edge.
 * Mobile: compact floating pill bar at the bottom that auto-tucks while scrolling down
 * so it never covers filter buttons or artwork.
 */
export function SocialDock() {
  const { showToast, drawerOpen, lightbox } = useStudio();
  const { scrollY } = useScroll();
  const [copied, setCopied] = useState(false);
  const [mobileHidden, setMobileHidden] = useState(false);

  useMotionValueEvent(scrollY, 'change', (y) => {
    const prev = scrollY.getPrevious() ?? 0;
    if (y > 180 && y > prev + 8) setMobileHidden(true);
    else if (y < prev - 8 || y < 80) setMobileHidden(false);
  });

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

  const hideOnMobile = mobileHidden || drawerOpen || Boolean(lightbox);

  return (
    <motion.aside
      aria-label="Social links"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4, duration: 0.6, ease: EASE }}
      className={cn(
        'fixed inset-x-6 bottom-2.5 z-40 mx-auto flex max-w-xs justify-around rounded-full border border-line bg-paper/90 px-2 py-1 shadow-sm backdrop-blur-xl transition-transform duration-300 sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-4 sm:mx-0 sm:max-w-none sm:-translate-y-1/2 sm:flex-col sm:gap-1 sm:p-1.5',
        hideOnMobile && 'translate-y-20 sm:translate-y-0',
      )}
    >
      {SOCIALS.map((s) => {
        const isDiscord = s.id === 'discord';
        const content = (
          <>
            {isDiscord && copied ? <Check className="size-4 text-teal" /> : <BrandIcon id={s.id} className="size-3.5 sm:size-4" />}
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
    </motion.aside>
  );
}
