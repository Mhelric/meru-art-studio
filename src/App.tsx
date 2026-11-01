import { AnimatePresence, motion } from 'framer-motion';
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useStudio } from '@/context/StudioContext';
import { initSmoothScroll } from '@/lib/smoothScroll';
import { NavBar } from '@/components/layout/NavBar';
import { SocialDock } from '@/components/layout/SocialDock';
import { Hero } from '@/components/layout/Hero';
import { Footer } from '@/components/layout/Footer';
import { IntroSplash } from '@/components/layout/IntroSplash';
import { Gallery } from '@/components/portfolio/Gallery';
import { PricingCards } from '@/components/portfolio/PricingCards';
import { HowItWorks } from '@/components/home/HowItWorks';
import { CanCantCards } from '@/components/rules/CanCantCards';
import { TosAccordion } from '@/components/rules/TosAccordion';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { Toast } from '@/components/ui/Toast';
import { EASE } from '@/components/ui/Reveal';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

// Lazy-loaded heavy modules for code-splitting
const AvailabilityCalendar = lazy(() =>
  import('@/components/schedule/AvailabilityCalendar').then((m) => ({ default: m.AvailabilityCalendar })),
);
const OrderTracker = lazy(() =>
  import('@/components/track/OrderTracker').then((m) => ({ default: m.OrderTracker })),
);
const AdminPanel = lazy(() =>
  import('@/components/admin/AdminPanel').then((m) => ({ default: m.AdminPanel })),
);
const TierModal = lazy(() =>
  import('@/components/portfolio/TierModal').then((m) => ({ default: m.TierModal })),
);
const Lightbox = lazy(() =>
  import('@/components/portfolio/Lightbox').then((m) => ({ default: m.Lightbox })),
);

function TabLoadingFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center pt-28">
      <div className="flex flex-col items-center gap-3">
        <div className="size-8 animate-spin rounded-full border-2 border-ink border-t-transparent" />
        <span className="font-display text-xs font-medium text-ink-mute">Loading view...</span>
      </div>
    </div>
  );
}

const SPLASH_KEY = 'meru-splash-seen';

export default function App() {
  const { activeTab, isArtistAdmin } = useStudio();
  const [showSplash, setShowSplash] = useState(() => !sessionStorage.getItem(SPLASH_KEY));

  useEffect(() => initSmoothScroll(), []);

  const finishSplash = useCallback(() => {
    sessionStorage.setItem(SPLASH_KEY, '1');
    setShowSplash(false);
  }, []);

  return (
    <ErrorBoundary>
      <div className="min-h-screen overflow-x-clip">
        <AnimatePresence>{showSplash && <IntroSplash onDone={finishSplash} />}</AnimatePresence>

        <NavBar />
        <SocialDock />

        <main className="mx-auto max-w-6xl px-4 sm:pl-20 lg:px-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.4, ease: EASE }}
            >
              {activeTab === 'portfolio' && (
                <>
                  <Hero />
                  <Gallery />
                  <HowItWorks />
                  <PricingCards />
                </>
              )}

              {activeTab === 'rules' && (
                <div className="pt-28 sm:pt-32">
                  <SectionHeading
                    eyebrow="Boundaries & Guidelines"
                    title="What I can & won’t draw"
                    subtitle="Please review these guidelines before requesting a slot — submitting a brief means you agree to the Terms of Service below."
                  />
                  <CanCantCards />
                  <div className="mt-20">
                    <SectionHeading
                      eyebrow="Terms of Service"
                      title="Payment, refunds & usage rights"
                      subtitle="Clear, artist- and client-friendly policies so we both know what to expect at every stage."
                    />
                    <div className="max-w-3xl">
                      <TosAccordion />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'schedule' && (
                <Suspense fallback={<TabLoadingFallback />}>
                  <AvailabilityCalendar />
                </Suspense>
              )}

              {activeTab === 'track' && (
                <Suspense fallback={<TabLoadingFallback />}>
                  <OrderTracker />
                </Suspense>
              )}

              {activeTab === 'admin' && (
                <Suspense fallback={<TabLoadingFallback />}>
                  {isArtistAdmin ? <AdminPanel /> : <OrderTracker />}
                </Suspense>
              )}
            </motion.div>
          </AnimatePresence>
        </main>

        <Suspense fallback={null}>
          <Lightbox />
          <TierModal />
        </Suspense>
        <Footer />
        <Toast />
      </div>
    </ErrorBoundary>
  );
}
