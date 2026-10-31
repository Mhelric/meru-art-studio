import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles, X } from 'lucide-react';
import { useStudio } from '@/context/StudioContext';

export function Toast() {
  const { toast, dismissToast } = useStudio();

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[70] flex justify-center px-4 sm:bottom-8">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            role="status"
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="pointer-events-auto flex items-center gap-3 rounded-full border border-line bg-ink py-2.5 pr-2.5 pl-4 text-sm text-white"
          >
            <Sparkles className="size-4 shrink-0 text-mustard" />
            <span>{toast.message}</span>
            <button
              onClick={dismissToast}
              aria-label="Dismiss"
              className="rounded-full p-1 text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              <X className="size-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
