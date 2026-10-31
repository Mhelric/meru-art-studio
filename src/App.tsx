import { AnimatePresence, motion } from 'framer-motion';
import { CalendarDays, PackageSearch } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useStudio } from '@/context/StudioContext';
import { initSmoothScroll } from '@/lib/smoothScroll';
import { NavBar } from '@/components/layout/NavBar';
import { SocialDock } from '@/components/layout/SocialDock';
import { Hero } from '@/components/layout/Hero';
import { Footer } from '@/components/layout/Footer';
import { IntroSplash } from '@/components/layout/IntroSplash';
import { Gallery } from '@/components/portfolio/Gallery';
import { PricingCards } from '@/components/portfolio/PricingCards';
import { Lightbox } from '@/components/portfolio/Lightbox';
import { CanCantCards } from '@/components/rules/CanCantCards';
import { TosAccordion } from '@/components/rules/TosAccordion';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { ComingSoon } from '@/components/ui/ComingSoon';
import { Toast } from '@/components/ui/Toast';
import { EASE } from '@/components/ui/Reveal';

const SPLASH_KEY = 'meru-splash-seen';

export default function App() {
  const { activeTab } = useStudio();
  const [showSplash, setShowSplash] = useState(() => !sessionStorage.getItem(SPLASH_KEY));

  useEffect(() => initSmoothScroll(), []);

  const finishSplash = useCallback(() => {
    sessionStorage.setItem(SPLASH_KEY, '1');
    setShowSplash(false);
  }, []);

  return (
    <div className="min-h-screen">
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
              <div className="pt-32">
                <ComingSoon
                  icon={CalendarDays}
                  phase={2}
                  title="Availability & Queue Calendar"
                  description="Live slot badge, anonymised client queue progress, and open booking windows."
                />
              </div>
            )}

            {activeTab === 'track' && (
              <div className="pt-32">
                <ComingSoon
                  icon={PackageSearch}
                  phase={4}
                  title="Track Your Order"
                  description="Sign in to follow your commission from sketch to high-res download, with realtime chat."
                />
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <Lightbox />
      <Footer />
      <Toast />
    </div>
  );
}
