import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { TabId, TierId } from '@/types';
import { scrollToTarget } from '@/lib/smoothScroll';

const TAB_IDS: TabId[] = ['portfolio', 'rules', 'schedule', 'track'];

interface Toast {
  id: number;
  message: string;
}

interface LightboxState {
  /** Portfolio item ids that can be browsed with ← → */
  ids: string[];
  index: number;
}

interface StudioState {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  /** Tier pre-selected via "Commission This Style". Consumed by the Phase 2 order drawer. */
  selectedTier: TierId | null;
  commissionTier: (tier: TierId) => void;
  lightbox: LightboxState | null;
  openLightbox: (ids: string[], index: number) => void;
  setLightboxIndex: (index: number) => void;
  closeLightbox: () => void;
  toast: Toast | null;
  showToast: (message: string) => void;
  dismissToast: () => void;
}

const StudioContext = createContext<StudioState | null>(null);

function readHashTab(): TabId {
  const hash = window.location.hash.replace('#', '') as TabId;
  return TAB_IDS.includes(hash) ? hash : 'portfolio';
}

export function StudioProvider({ children }: { children: ReactNode }) {
  const [activeTab, setActiveTabState] = useState<TabId>(readHashTab);
  const [selectedTier, setSelectedTier] = useState<TierId | null>(null);
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  // Keep tab in sync with the URL hash so tabs are linkable & back-button friendly.
  useEffect(() => {
    const onHash = () => setActiveTabState(readHashTab());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const setActiveTab = useCallback((tab: TabId) => {
    if (window.location.hash !== `#${tab}`) window.history.pushState(null, '', `#${tab}`);
    setActiveTabState(tab);
    scrollToTarget(0, 0);
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  const showToast = useCallback((message: string) => {
    window.clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), message });
    toastTimer.current = window.setTimeout(() => setToast(null), 3800);
  }, []);

  const commissionTier = useCallback(
    (tier: TierId) => {
      setSelectedTier(tier);
      // Phase 2: this will open the 3-step order drawer with `tier` pre-selected.
      showToast('Style saved! The order drawer opens here in Phase 2.');
    },
    [showToast],
  );

  const openLightbox = useCallback((ids: string[], index: number) => setLightbox({ ids, index }), []);
  const setLightboxIndex = useCallback((index: number) => setLightbox((lb) => (lb ? { ...lb, index } : lb)), []);
  const closeLightbox = useCallback(() => setLightbox(null), []);

  const value = useMemo(
    () => ({
      activeTab,
      setActiveTab,
      selectedTier,
      commissionTier,
      lightbox,
      openLightbox,
      setLightboxIndex,
      closeLightbox,
      toast,
      showToast,
      dismissToast,
    }),
    [activeTab, setActiveTab, selectedTier, commissionTier, lightbox, openLightbox, setLightboxIndex, closeLightbox, toast, showToast, dismissToast],
  );

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

export function useStudio() {
  const ctx = useContext(StudioContext);
  if (!ctx) throw new Error('useStudio must be used inside <StudioProvider>');
  return ctx;
}
