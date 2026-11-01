import { motion, useReducedMotion, type HTMLMotionProps } from 'framer-motion';

/** Shared easing — slow, confident "expo out" used across the site. */
export const EASE = [0.22, 1, 0.36, 1] as const;

interface RevealProps extends HTMLMotionProps<'div'> {
  delay?: number;
  y?: number;
  /** Animate on mount instead of when scrolled into view. */
  immediate?: boolean;
}

/** Fade + rise + un-blur. The core motion primitive of the site, respecting user reduced motion preferences. */
export function Reveal({ delay = 0, y = 24, immediate = false, children, ...rest }: RevealProps) {
  const shouldReduceMotion = useReducedMotion();

  if (shouldReduceMotion) {
    return (
      <div {...(rest as any)}>
        {children}
      </div>
    );
  }

  const target = { opacity: 1, y: 0, filter: 'blur(0px)' };
  return (
    <motion.div
      initial={{ opacity: 0, y, filter: 'blur(8px)' }}
      {...(immediate ? { animate: target } : { whileInView: target, viewport: { once: true, margin: '-80px' } })}
      transition={{ duration: 0.9, delay, ease: EASE }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/** Splits a string into words that rise in one after another, respecting reduced motion. */
export function WordReveal({ text, className, delay = 0, stagger = 0.06 }: { text: string; className?: string; delay?: number; stagger?: number }) {
  const shouldReduceMotion = useReducedMotion();

  if (shouldReduceMotion) {
    return <span className={className}>{text}</span>;
  }

  return (
    <span className={className} aria-label={text}>
      {text.split(' ').map((word, i) => (
        <span key={i} aria-hidden className="inline-block overflow-hidden pb-[0.1em] align-bottom">
          <motion.span
            className="inline-block"
            initial={{ y: '110%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.9, delay: delay + i * stagger, ease: EASE }}
          >
            {word}
            {'\u00A0'}
          </motion.span>
        </span>
      ))}
    </span>
  );
}
