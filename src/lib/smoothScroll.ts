import Lenis from 'lenis';

/**
 * Buttery smooth scrolling (Lenis) — the signature "Framer site" feel.
 * Exposed as a singleton so modals can pause it and nav can scroll with it.
 */
let lenis: Lenis | null = null;

export function initSmoothScroll() {
  if (lenis || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {};
  lenis = new Lenis({
    duration: 1.15,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
    prevent: (node: HTMLElement) =>
      node?.hasAttribute?.('data-lenis-prevent') ||
      Boolean(node?.closest?.('[data-lenis-prevent]')),
  });

  let raf = 0;
  const loop = (time: number) => {
    lenis?.raf(time);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  return () => {
    cancelAnimationFrame(raf);
    lenis?.destroy();
    lenis = null;
  };
}

export function scrollToTarget(target: string | HTMLElement | number, offset = -88) {
  if (lenis) {
    lenis.scrollTo(target, { offset, duration: 1.2 });
    return;
  }
  if (typeof target === 'number') return window.scrollTo({ top: target, behavior: 'smooth' });
  const el = typeof target === 'string' ? document.querySelector<HTMLElement>(target) : target;
  if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY + offset, behavior: 'smooth' });
}

export function lockScroll(locked: boolean) {
  if (lenis) {
    if (locked) lenis.stop();
    else lenis.start();
  }
  document.documentElement.style.overflow = locked ? 'hidden' : '';
}
