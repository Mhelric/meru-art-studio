import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { GalleryFilter, TabId, TierId } from '@/types';
import { scrollToTarget } from '@/lib/smoothScroll';

const TAB_IDS: TabId[] = ['portfolio', 'rules', 'schedule', 'track'];

interface Toast {
  id: number;
  message: string;
}

interface LightboxState {
  ids: string[];
  index: number;
}

interface StudioState {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  galleryFilter: GalleryFilter;
  setGalleryFilter: (filter: GalleryFilter) => void;
  /** Tier pre-selected via "Commission This Style". Consumed by the Phase 2 order drawer. */
  selectedTier: TierId | null;
  commissionTier: (tier: TierId) => void;
  /** Opens the interactive Commission Drawer (or Tier Quick-Quote sheet). */
  drawerOpen: boolean;
  openDrawer: (tier?: TierId) => void;
  closeDrawer: () => void;
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
  const [galleryFilter, setGalleryFilter] = useState<GalleryFilter>('all');
  const [selectedTier, setSelectedTier] = useState<TierId | null>('fullbody');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

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

  const openDrawer = useCallback((tier?: TierId) => {
    if (tier) setSelectedTier(tier);
    setDrawerOpen(true);
  }, []);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const commissionTier = useCallback((tier: TierId) => {
    setSelectedTier(tier);
    setDrawerOpen(true);
  }, []);

  const openLightbox = useCallback((ids: string[], index: number) => setLightbox({ ids, index }), []);
  const setLightboxIndex = useCallback((index: number) => setLightbox((lb) => (lb ? { ...lb, index } : lb)), []);
  const closeLightbox = useCallback(() => setLightbox(null), []);

  const value = useMemo(
    () => ({
      activeTab,
      setActiveTab,
      galleryFilter,
      setGalleryFilter,
      selectedTier,
      commissionTier,
      drawerOpen,
      openDrawer,
      closeDrawer,
      lightbox,
      openLightbox,
      setLightboxIndex,
      closeLightbox,
      toast,
      showToast,
      dismissToast,
    }),
    [
      activeTab,
      setActiveTab,
      galleryFilter,
      selectedTier,
      commissionTier,
      drawerOpen,
      openDrawer,
      closeDrawer,
      lightbox,
      openLightbox,
      setLightboxIndex,
      closeLightbox,
      toast,
      showToast,
      dismissToast,
    ],
  );

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

export function useStudio() {
  const ctx = useContext(StudioContext);
  if (!ctx) throw new Error('useStudio must be used inside <StudioProvider>');
  return ctx;
}
