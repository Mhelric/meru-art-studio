import { motion } from 'framer-motion';
import { useEffect } from 'react';
import { EASE } from '@/components/ui/Reveal';
import { lockScroll } from '@/lib/smoothScroll';

const DOTS = [
  { c: 'bg-coral', x: -150, y: -40 },
  { c: 'bg-mustard', x: 160, y: -60 },
  { c: 'bg-lilac', x: 140, y: 70 },
  { c: 'bg-teal', x: -130, y: 80 },
  { c: 'bg-peach', x: 0, y: -110 },
];

/** Short branded intro (~1.6s) shown once per session, then slides away. */
export function IntroSplash({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    lockScroll(true);
    const t = window.setTimeout(onDone, 1650);
    return () => {
      window.clearTimeout(t);
      lockScroll(false);
    };
  }, [onDone]);

  return (
    <motion.div
      className="fixed inset-0 z-[100] grid place-items-center bg-canvas"
      initial={{ y: 0 }}
      exit={{ y: '-100%', borderBottomLeftRadius: '50% 12%', borderBottomRightRadius: '50% 12%' }}
      transition={{ duration: 0.9, ease: EASE }}
    >
      <div className="relative">
        {DOTS.map((d, i) => (
          <motion.span
            key={i}
            className={`absolute top-1/2 left-1/2 size-3 rounded-full ${d.c}`}
            initial={{ x: 0, y: 0, scale: 0, opacity: 0 }}
            animate={{ x: d.x, y: d.y, scale: [0, 1.4, 1], opacity: [0, 1, 0.9] }}
            transition={{ duration: 1, delay: 0.25 + i * 0.05, ease: EASE }}
          />
        ))}
        <motion.img
          src="/brand/logo-sm.webp"
          alt="Meru Art"
          className="relative w-52 mix-blend-multiply sm:w-64"
          initial={{ opacity: 0, scale: 0.85, filter: 'blur(12px)' }}
          animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
          transition={{ duration: 0.9, ease: EASE }}
        />
        <motion.div
          className="mx-auto mt-6 h-0.5 w-32 origin-left rounded-full bg-ink/80"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 1.2, delay: 0.2, ease: EASE }}
        />
      </div>
    </motion.div>
  );
}
