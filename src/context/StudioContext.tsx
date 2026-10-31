import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { GalleryFilter, OrderDraft, PublicQueueSlot, SubmittedOrder, TabId, TierId } from '@/types';
import { INITIAL_PUBLIC_QUEUE, STUDIO_AVAILABILITY } from '@/data/schedule';
import { ADDON_RATES } from '@/data/artist';
import { getTier } from '@/lib/utils';
import { scrollToTarget } from '@/lib/smoothScroll';

const TAB_IDS: TabId[] = ['portfolio', 'rules', 'schedule', 'track'];
const DRAFT_KEY = 'meru-order-draft-v1';
const ORDERS_KEY = 'meru-submitted-orders-v1';

interface Toast {
  id: number;
  message: string;
}

interface LightboxState {
  ids: string[];
  index: number;
}

export type DrawerStep = 1 | 2 | 3;

const DEFAULT_DRAFT: OrderDraft = {
  tier: 'fullbody',
  characterCount: 1,
  addons: { nsfw: false, softFurry: false, commercial: false },
  currency: 'USD',
  paymentSplit: '50_50',
  preferredStartDate: null,
  characterName: '',
  poseAndVibe: '',
  backgroundNotes: '',
  clientContact: '',
  references: [],
  tosAccepted: false,
  tosAcceptedAt: null,
};

function loadSavedDraft(): OrderDraft {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return DEFAULT_DRAFT;
    const parsed = JSON.parse(raw) as Partial<OrderDraft>;
    return {
      ...DEFAULT_DRAFT,
      ...parsed,
      addons: { ...DEFAULT_DRAFT.addons, ...(parsed.addons ?? {}) },
      // Object URLs do not survive reloads, so start fresh for file blobs
      references: [],
    };
  } catch {
    return DEFAULT_DRAFT;
  }
}

function loadSubmittedOrders(): SubmittedOrder[] {
  try {
    const raw = localStorage.getItem(ORDERS_KEY);
    return raw ? (JSON.parse(raw) as SubmittedOrder[]) : [];
  } catch {
    return [];
  }
}

export function calculateOrderPricing(draft: OrderDraft) {
  const tier = getTier(draft.tier);
  let mult = 1;
  if (draft.addons.nsfw) mult += ADDON_RATES.nsfw;
  if (draft.addons.softFurry) mult += ADDON_RATES.softFurry;
  if (draft.addons.commercial) mult += ADDON_RATES.commercial;

  const subtotal = tier.basePriceUsd * draft.characterCount;
  const totalUsd = Math.round(subtotal * mult);
  const depositUsd = draft.paymentSplit === '100_upfront' ? totalUsd : Math.ceil(totalUsd / 2);
  const remainingUsd = totalUsd - depositUsd;

  return {
    baseUsd: tier.basePriceUsd,
    multiplier: mult,
    totalUsd,
    depositUsd,
    remainingUsd,
    usdToPhpRate: STUDIO_AVAILABILITY.usdToPhpRate,
  };
}

interface StudioState {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  galleryFilter: GalleryFilter;
  setGalleryFilter: (filter: GalleryFilter) => void;
  selectedTier: TierId;
  commissionTier: (tier: TierId) => void;
  drawerOpen: boolean;
  drawerStep: DrawerStep;
  setDrawerStep: (step: DrawerStep) => void;
  openDrawer: (opts?: { tier?: TierId; step?: DrawerStep; preferredDate?: string }) => void;
  closeDrawer: () => void;
  draft: OrderDraft;
  updateDraft: (patch: Partial<OrderDraft>) => void;
  resetDraft: () => void;
  queueSlots: PublicQueueSlot[];
  maxSlots: number;
  submittedOrders: SubmittedOrder[];
  submitOrder: (authMethod: SubmittedOrder['authMethod']) => SubmittedOrder;
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
  const [draft, setDraft] = useState<OrderDraft>(loadSavedDraft);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerStep, setDrawerStep] = useState<DrawerStep>(1);
  const [submittedOrders, setSubmittedOrders] = useState<SubmittedOrder[]>(loadSubmittedOrders);
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const onHash = () => setActiveTabState(readHashTab());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Persist draft (excluding ephemeral blob URLs)
  useEffect(() => {
    try {
      const { references: _refs, ...serializable } = draft;
      localStorage.setItem(DRAFT_KEY, JSON.stringify(serializable));
    } catch {
      // ignore storage quota errors
    }
  }, [draft]);

  const setActiveTab = useCallback((tab: TabId) => {
    if (window.location.hash !== `#${tab}`) window.history.pushState(null, '', `#${tab}`);
    setActiveTabState(tab);
    scrollToTarget(0, 0);
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  const showToast = useCallback((message: string) => {
    window.clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), message });
    toastTimer.current = window.setTimeout(() => setToast(null), 4000);
  }, []);

  const updateDraft = useCallback((patch: Partial<OrderDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  }, []);

  const resetDraft = useCallback(() => {
    setDraft(DEFAULT_DRAFT);
    setDrawerStep(1);
  }, []);

  const openDrawer = useCallback((opts?: { tier?: TierId; step?: DrawerStep; preferredDate?: string }) => {
    if (opts?.tier || opts?.preferredDate !== undefined) {
      setDraft((prev) => ({
        ...prev,
        ...(opts.tier ? { tier: opts.tier } : {}),
        ...(opts.preferredDate !== undefined ? { preferredStartDate: opts.preferredDate } : {}),
      }));
    }
    setDrawerStep(opts?.step ?? 1);
    setDrawerOpen(true);
  }, []);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const commissionTier = useCallback((tier: TierId) => {
    setDraft((prev) => ({ ...prev, tier }));
    setDrawerStep(1);
    setDrawerOpen(true);
  }, []);

  const submitOrder = useCallback(
    (authMethod: SubmittedOrder['authMethod']): SubmittedOrder => {
      const { totalUsd, depositUsd } = calculateOrderPricing(draft);
      const order: SubmittedOrder = {
        ...draft,
        id: `MRU-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        createdAt: new Date().toISOString(),
        totalUsd,
        depositUsd,
        // Per scam-protection rule: new requests enter `pending_review` and do NOT deduct a slot until artist accepts.
        stage: 'pending_review',
        authMethod,
      };
      setSubmittedOrders((prev) => {
        const next = [order, ...prev];
        try {
          const clean = next.map(({ references: _r, ...rest }) => ({ ...rest, references: [] }));
          localStorage.setItem(ORDERS_KEY, JSON.stringify(clean));
        } catch {
          // ignore
        }
        return next;
      });
      return order;
    },
    [draft],
  );

  const openLightbox = useCallback((ids: string[], index: number) => setLightbox({ ids, index }), []);
  const setLightboxIndex = useCallback((index: number) => setLightbox((lb) => (lb ? { ...lb, index } : lb)), []);
  const closeLightbox = useCallback(() => setLightbox(null), []);

  const value = useMemo(
    () => ({
      activeTab,
      setActiveTab,
      galleryFilter,
      setGalleryFilter,
      selectedTier: draft.tier,
      commissionTier,
      drawerOpen,
      drawerStep,
      setDrawerStep,
      openDrawer,
      closeDrawer,
      draft,
      updateDraft,
      resetDraft,
      queueSlots: INITIAL_PUBLIC_QUEUE,
      maxSlots: STUDIO_AVAILABILITY.maxSlots,
      submittedOrders,
      submitOrder,
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
      draft,
      commissionTier,
      drawerOpen,
      drawerStep,
      openDrawer,
      closeDrawer,
      updateDraft,
      resetDraft,
      submittedOrders,
      submitOrder,
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
