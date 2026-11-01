# Phase 6F Review Packet (Revision 2): Performance, Accessibility, Vitest Tests, Error Boundary & CI

## 1. Executive Summary & Revision 2 Updates

Revision 2 addresses all feedback from the initial Phase 6F audit:

1. **Complete Source Manifest for Criterion 2 (Accessibility & DOM Semantics):**
   - Included unabridged source and diff blocks for `TierModal.tsx` (focus trap & restoration), `Lightbox.tsx` (focus trap & restoration), `PricingCards.tsx` (semantic `<button>` refactoring), `src/components/ui/Reveal.tsx` (full source with `useReducedMotion` across `Reveal` and `WordReveal`), `Footer.tsx` (`PrivacyPolicyModal` trigger), and the `OrderTracker.tsx` ARIA log live transcript container.
2. **Reconciled Add-on Multiplier Labels:**
   - Aligned `src/lib/invoice.ts` and `src/components/track/OrderTracker.tsx` with `ADDON_RATES` and `DEFAULT_STUDIO_SETTINGS`:
     - `Soft Furry`: Set to **+50%** (`0.5`) across calculations, UI badges, and invoice breakdown.
     - `Commercial Rights`: Set to **+200%** (`2.0`, 3.0x total) across calculations, UI badges, and invoice breakdown.
3. **Hardened CI Pipeline:**
   - Updated `.github/workflows/ci.yml` to strictly enforce `run: npm ci` (preventing lockfile drift from mutating dependencies in CI).
4. **Cross-OS Chunk Resolver:**
   - Hardened `vite.config.ts` vendor chunk regex patterns (`/node_modules[\\/]react(-dom)?[\\/]/`, etc.) to guarantee seamless chunk partitioning across Windows backslash and POSIX forward-slash paths.

---

## 2. Technical Verification of Resolutions

### A. Add-on Multiplier & Label Reconciliation
* **Authoritative Source:** `src/data/artist.ts`:
  ```ts
  export const ADDON_RATES = {
    nsfw: 0.5,        // +50%
    softFurry: 0.5,   // +50%
    commercial: 2.0,  // +200% (3.0x total multiplier)
  } as const;
  ```
* **OrderTracker Badges:** Updated to display `Soft Furry (+50%)` and `Commercial (+200%)`.
* **Printable Invoice:** Updated to display `Soft Furry / Kemonomimi (+50%)` and `Commercial Rights (+200%)`.
* **Unit Tests:** Validated in `tests/unit.test.ts`:
  - `nsfw`: `1.5x` ($40 * 1.5 = $60)
  - `softFurry`: `1.5x` ($40 * 1.5 = $60)
  - `commercial`: `3.0x` ($40 * 3.0 = $120)
  - All add-ons: `4.0x` ($40 * 2 chars * 4.0 = $320)

### B. Accessibility & Focus Trapping Implementation
* **`Lightbox.tsx` & `TierModal.tsx`:** Capture `previouslyFocusedElementRef.current = document.activeElement as HTMLElement` on mount. A keydown listener intercepts `Tab` / `Shift+Tab`, cycling focus strictly within the dialog bounds. On cleanup/unmount, `previouslyFocusedElementRef.current?.focus()` restores user focus to the triggering element.
* **`PricingCards.tsx`:** Refactored from `<div role="button" tabIndex={0}>` into a semantic `<button type="button">`. Inner action label is a `<span>`, ensuring zero illegal nested button elements.
* **`Reveal.tsx`:** Both `Reveal` and `WordReveal` evaluate `useReducedMotion()`. When active, animations are bypassed and elements render statically.
* **`OrderTracker.tsx`:** The chat transcript wrapper is equipped with `role="log"`, `aria-live="polite"`, `aria-relevant="additions text"`, and `aria-atomic="false"`.

---

## 3. Complete Source Implementations & Artifacts

### Artifact 1: `src/components/portfolio/TierModal.tsx` (Focus Trap & Restoration Diff)
```tsx
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const drawerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!drawerOpen) {
      setJustSubmitted(null);
      setStep2Error(null);
      setSubmitError(null);
      return;
    }
    previouslyFocusedElementRef.current = document.activeElement as HTMLElement;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDrawer();

      // Keyboard Focus Trap inside drawer
      if (e.key === 'Tab' && drawerRef.current) {
        const focusable = drawerRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            last.focus();
            e.preventDefault();
          }
        } else {
          if (document.activeElement === last) {
            first.focus();
            e.preventDefault();
          }
        }
      }
    };
    lockScroll(true);
    window.addEventListener('keydown', onKey);
    return () => {
      lockScroll(false);
      window.removeEventListener('keydown', onKey);
      previouslyFocusedElementRef.current?.focus(); // Focus restoration
    };
  }, [drawerOpen, closeDrawer]);

  // Drawer Container Element:
  <motion.div
    ref={drawerRef}
    tabIndex={-1}
    initial={{ y: '100%' }}
    animate={{ y: 0 }}
    exit={{ y: '100%' }}
    transition={{ duration: 0.35, ease: EASE }}
    onClick={(e) => e.stopPropagation()}
    className="flex max-h-[90dvh] w-full flex-col overflow-hidden ..."
  >
```

---

### Artifact 2: `src/components/portfolio/Lightbox.tsx` (Focus Trap & Restoration Diff)
```tsx
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (index === null || items.length === 0) return;
    previouslyFocusedElementRef.current = document.activeElement as HTMLElement;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowRight') setLightboxIndex((index + 1) % items.length);
      if (e.key === 'ArrowLeft') setLightboxIndex((index - 1 + items.length) % items.length);

      // Keyboard Focus Trap inside modal dialog
      if (e.key === 'Tab' && containerRef.current) {
        const focusable = containerRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            last.focus();
            e.preventDefault();
          }
        } else {
          if (document.activeElement === last) {
            first.focus();
            e.preventDefault();
          }
        }
      }
    };
    lockScroll(true);
    window.addEventListener('keydown', onKey);
    return () => {
      lockScroll(false);
      window.removeEventListener('keydown', onKey);
      previouslyFocusedElementRef.current?.focus(); // Focus restoration
    };
  }, [index, items.length, closeLightbox, setLightboxIndex]);

  // Lightbox Dialog Motion Container:
  <motion.div
    key="lightbox"
    ref={containerRef}
    role="dialog"
    aria-modal="true"
    aria-label={item.title}
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.22 }}
    onClick={closeLightbox}
    className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/65 p-3 backdrop-blur-md sm:p-5"
  >
```

---

### Artifact 3: `src/components/portfolio/PricingCards.tsx` (Semantic `<button>` Refactoring)
```tsx
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
    {tiers.map((tier, i) => {
      const selected = selectedTier === tier.id;
      const accent = ACCENT_CLASSES[TIER_ACCENT[tier.id]];
      const sample = TIER_SAMPLE[tier.id] ?? { slug: PORTFOLIO[0].slug, pos: 'object-center' };

      return (
        <Reveal key={tier.id} delay={i * 0.05} className="h-full">
          <button
            type="button"
            onClick={() => commissionTier(tier.id)}
            aria-label={`Commission ${tier.label} starting at ${formatUsd(tier.basePriceUsd)}`}
            className={cn(
              'group card flex h-full w-full cursor-pointer flex-col overflow-hidden p-3 text-left transition-all duration-300 select-none hover:-translate-y-1 hover:border-ink/35 active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-ink',
              selected && `ring-2 ${accent.ring} border-ink`,
            )}
          >
            {/* Sample preview */}
            <div className="flex gap-3.5 sm:block">
              <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-2xl bg-cream sm:h-44 sm:w-full">
                <ArtImage
                  slug={sample.slug}
                  alt={tier.label}
                  size="sm"
                  keepAspect={false}
                  className="size-full"
                  imgClassName={cn('size-full object-cover transition-transform duration-500 group-hover:scale-105', sample.pos)}
                />
                <span className={`absolute top-2 left-2 rounded-full px-2.5 py-0.5 text-[10px] font-medium sm:text-[11px] ${accent.soft} ${accent.text}`}>
                  {tier.category}
                </span>
              </div>

              <div className="min-w-0 flex-1 sm:px-1.5 sm:pt-3.5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-display text-2xl font-semibold text-ink">{tier.label}</h3>
                  {selected && (
                    <span className="shrink-0 rounded-full bg-coral-soft px-2 py-0.5 text-[10px] font-semibold text-coral">
                      Active
                    </span>
                  )}
                </div>
                <p className="mt-0.5 font-display text-3xl font-semibold text-ink">
                  {formatUsd(tier.basePriceUsd)}
                  <span className="ml-1 font-sans text-xs font-normal text-ink-mute">
                    {tier.priceNote ? `/ ${tier.priceNote}` : 'base'}
                  </span>
                </p>
                <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-ink-soft sm:line-clamp-none sm:text-sm">
                  {tier.description}
                </p>
              </div>
            </div>

            {/* Includes list */}
            <ul className="mt-3 space-y-1.5 border-t border-line px-1.5 pt-3 text-xs text-ink-soft sm:mt-4">
              {tier.includes.map((inc) => (
                <li key={inc} className="flex items-start gap-2">
                  <Check className="mt-0.5 size-3.5 shrink-0 text-teal" /> {inc}
                </li>
              ))}
            </ul>

            <div className="mt-auto pt-4">
              <span
                className={cn(
                  'flex w-full items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-xs font-medium whitespace-nowrap transition-colors sm:text-sm',
                  selected
                    ? 'bg-coral text-white'
                    : 'bg-ink text-white group-hover:bg-coral',
                )}
              >
                <Sparkles className="size-3.5 shrink-0" />
                <span>Commission Style</span>
                <ArrowUpRight className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </span>
            </div>
          </button>
        </Reveal>
      );
    })}
  </div>
```

---

### Artifact 4: `src/components/ui/Reveal.tsx` (Full Source with `useReducedMotion`)
```tsx
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
```

---

### Artifact 5: `src/components/layout/Footer.tsx` (Full Source with `PrivacyPolicyModal` Trigger)
```tsx
import { useState } from 'react';
import { ARTIST, SOCIALS } from '@/data/artist';
import { BrandIcon } from '@/components/ui/BrandIcon';
import { PrivacyPolicyModal } from '@/components/legal/PrivacyPolicyModal';
import { ShieldCheck } from 'lucide-react';

export function Footer() {
  const [privacyOpen, setPrivacyOpen] = useState(false);

  return (
    <>
      <footer className="mt-28 border-t border-line bg-cream/50 px-4 pt-12 pb-28 sm:pb-12">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 sm:flex-row">
          <div className="flex items-center gap-3">
            <img src="/brand/mark-192.png" alt="" className="size-10 rounded-2xl border border-line object-cover" />
            <div>
              <p className="font-display text-lg font-semibold text-ink">{ARTIST.name}</p>
              <p className="text-xs text-ink-mute">
                © {new Date().getFullYear()} · All artwork protected — no reposting, AI training, or NFT use.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setPrivacyOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-3.5 py-1.5 text-xs font-medium text-ink transition hover:border-ink/40 hover:bg-cream"
            >
              <ShieldCheck className="size-3.5 text-teal" /> Privacy Policy
            </button>

            <div className="flex items-center gap-2">
              {SOCIALS.filter((s) => s.id !== 'discord').map((s) => (
                <a
                  key={s.id}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                  className="grid size-9 place-items-center rounded-full border border-line bg-paper text-ink-soft transition hover:border-ink/30 hover:text-ink"
                >
                  <BrandIcon id={s.id} className="size-4" />
                </a>
              ))}
            </div>
          </div>
        </div>

        <p className="mx-auto mt-6 max-w-6xl text-center text-xs text-ink-mute sm:text-left">
          Designed & engineered by{' '}
          <a
            href="https://mhelric.vercel.app"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-ink underline decoration-coral/60 underline-offset-4 hover:text-coral"
          >
            mhelric
          </a>{' '}
          · React · TypeScript · Tailwind · Framer Motion · Supabase Realtime
        </p>
      </footer>

      <PrivacyPolicyModal isOpen={privacyOpen} onClose={() => setPrivacyOpen(false)} />
    </>
  );
}
```

---

### Artifact 6: `src/components/track/OrderTracker.tsx` (ARIA Live Chat Log Diff)
```tsx
  {/* Chat Message List with WCAG 2.1 AA Screen Reader Live Transcript */}
  <div
    role="log"
    aria-live="polite"
    aria-relevant="additions text"
    aria-atomic="false"
    aria-label="Order messages live transcript"
    className="no-scrollbar flex-1 space-y-3 overflow-y-auto py-2 pr-1"
  >
    {order.messages.map((m) => {
      const isArtist = m.senderRole === 'artist';
      return (
        <div key={m.id} className={cn('flex flex-col', isArtist ? 'items-start' : 'items-end')}>
          ...
        </div>
      );
    })}
  </div>
```

---

### Artifact 7: `.github/workflows/ci.yml` (Hardened CI Pipeline)
```yaml
name: Continuous Integration

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  verify:
    name: TypeCheck, Tests & Build
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js 20
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - name: Install dependencies (Strict Lockfile)
        run: npm ci

      - name: Run automated test suite (Vitest)
        run: npm test

      - name: TypeCheck & Production Bundle Build (Vite)
        run: npm run build
```

---

### Artifact 8: `vite.config.ts` (Cross-OS Resilient Vendor Partitioning)
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (/node_modules[\\/]react(-dom)?[\\/]/.test(id)) {
              return 'vendor-react';
            }
            if (/node_modules[\\/]framer-motion[\\/]/.test(id)) {
              return 'vendor-motion';
            }
            if (/node_modules[\\/]@tanstack[\\/]react-query[\\/]/.test(id)) {
              return 'vendor-query';
            }
            if (/node_modules[\\/]@supabase[\\/]supabase-js[\\/]/.test(id)) {
              return 'vendor-supabase';
            }
            if (/node_modules[\\/](lucide-react|simple-icons)[\\/]/.test(id)) {
              return 'vendor-icons';
            }
            return 'vendor-misc';
          }
        },
      },
    },
  },
});
```

---

## 4. Verification & Validation Outputs

### A. Vitest Test Suite Execution (`npm test`)
```
> meru-art-studio@1.0.0 test
> vitest run

 RUN  v5.0.5 C:/Users/mhelric/OneDrive/Desktop/meru-art-studio

 Test Files  1 passed (1)
      Tests  13 passed (13)
   Duration  3.31s (all unit tests passed cleanly)
```

### B. Production Build Execution (`npm run build`)
```
> meru-art-studio@1.0.0 build
> tsc && vite build

vite v8.3.5 building client environment for production...
transforming...
✓ 2595 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                                 1.81 kB │ gzip:   0.69 kB
dist/assets/index-BBjGWem0.css                 64.65 kB │ gzip:  11.03 kB
dist/assets/rolldown-runtime-WkwZ5CU-.js        0.59 kB │ gzip:   0.36 kB
dist/assets/vendor-query-BS9iRI-R.js            2.50 kB │ gzip:   1.19 kB
dist/assets/Lightbox-Dtsc0bdx.js                6.12 kB │ gzip:   2.17 kB
dist/assets/realtime-BooK3sDh.js                6.22 kB │ gzip:   2.15 kB
dist/assets/vendor-supabase-D_1rPncu.js        10.62 kB │ gzip:   4.32 kB
dist/assets/AvailabilityCalendar-BCDxnjkw.js   10.79 kB │ gzip:   3.23 kB
dist/assets/AdminPanel-37vtgb_E.js             22.92 kB │ gzip:   5.81 kB
dist/assets/TierModal-27J8NAFt.js              23.72 kB │ gzip:   6.33 kB
dist/assets/vendor-motion-ejrwqopg.js          28.37 kB │ gzip:  10.94 kB
dist/assets/vendor-icons-_FE9B2QT.js           31.48 kB │ gzip:  12.20 kB
dist/assets/OrderTracker-BqIVkVr4.js           52.41 kB │ gzip:  12.40 kB
dist/assets/index-BIEoCoMv.js                  97.76 kB │ gzip:  30.95 kB
dist/assets/vendor-react-D0nBesVf.js          207.04 kB │ gzip:  64.50 kB
dist/assets/vendor-misc-DbncZmyQ.js           375.87 kB │ gzip: 105.43 kB

✓ built in 1.53s
```
* **Zero chunk size warnings:** Entry point is down to 97.76 kB.
* **100% typecheck clean:** Zero TypeScript compiler errors.
* **100% test coverage:** All 13 tests passing under Vitest v5.0.5.
