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
import type { User } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import type {
  AttachmentKind,
  CommissionStage,
  GalleryFilter,
  OrderDraft,
  OrderMessage,
  PublicQueueSlot,
  StudioSettingsState,
  SubmittedOrder,
  TabId,
  Tier,
  TierId,
  WipUploadItem,
} from '@/types';
import { BLOCKED_RANGES, INITIAL_PUBLIC_QUEUE, STUDIO_AVAILABILITY } from '@/data/schedule';
import { DEMO_SHOWCASE_ORDER, STAGE_STEPS } from '@/data/orders';
import { ADDON_RATES, TIERS } from '@/data/artist';
import {
  artistAdminUid,
  insertCommissionInSupabase,
  insertWipInDb,
  isSupabaseConfigured,
  signInWithOAuthProvider,
  submitPaymentReceiptInDb,
  supabase,
} from '@/lib/supabase';
import {
  QUERY_KEYS,
  useCommissionsQuery,
  usePublicStudioDataQuery,
  useUpdateCommissionStageMutation,
  useDeclineCommissionMutation,
  useDeleteCommissionMutation,
  useTogglePaymentFlagMutation,
  useUpdateScheduleMutation,
  useSendMessageMutation,
  useUpdateStudioSettingsMutation,
} from '@/lib/queries';
import { getLocalFutureDate } from '@/lib/utils';

const TAB_IDS: TabId[] = ['portfolio', 'rules', 'schedule', 'track', 'admin'];
const DRAFT_KEY = 'meru-order-draft-v1';
const SETTINGS_KEY = 'meru-studio-settings-v1';
const LOCAL_ORDERS_KEY = 'meru-local-demo-orders-v1';

interface Toast {
  id: number;
  message: string;
}

interface LightboxState {
  ids: string[];
  index: number;
}

export type DrawerStep = 1 | 2 | 3;

export const DEFAULT_STUDIO_SETTINGS: StudioSettingsState = {
  status: STUDIO_AVAILABILITY.status,
  maxSlots: STUDIO_AVAILABILITY.maxSlots,
  usdToPhpRate: STUDIO_AVAILABILITY.usdToPhpRate,
  basePrices: {
    headshot: 15,
    halfbody: 25,
    fullbody: 40,
    chibi: 10,
    graphics: 5,
  },
  multipliers: {
    nsfw: ADDON_RATES.nsfw,
    softFurry: ADDON_RATES.softFurry,
    commercial: ADDON_RATES.commercial,
  },
  blockedRanges: BLOCKED_RANGES,
};

function loadStudioSettings(): StudioSettingsState {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_STUDIO_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<StudioSettingsState>;
    return {
      ...DEFAULT_STUDIO_SETTINGS,
      ...parsed,
      basePrices: { ...DEFAULT_STUDIO_SETTINGS.basePrices, ...(parsed.basePrices ?? {}) },
      multipliers: { ...DEFAULT_STUDIO_SETTINGS.multipliers, ...(parsed.multipliers ?? {}) },
      blockedRanges: parsed.blockedRanges ?? DEFAULT_STUDIO_SETTINGS.blockedRanges,
    };
  } catch {
    return DEFAULT_STUDIO_SETTINGS;
  }
}

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
      references: [],
    };
  } catch {
    return DEFAULT_DRAFT;
  }
}

function loadLocalOrders(): SubmittedOrder[] {
  try {
    const raw = localStorage.getItem(LOCAL_ORDERS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SubmittedOrder[];
  } catch {
    return [];
  }
}

export function calculateOrderPricing(draft: OrderDraft, settings: StudioSettingsState = DEFAULT_STUDIO_SETTINGS) {
  const baseUsd = settings.basePrices[draft.tier] ?? 15;
  let mult = 1;
  if (draft.addons.nsfw) mult += settings.multipliers.nsfw;
  if (draft.addons.softFurry) mult += settings.multipliers.softFurry;
  if (draft.addons.commercial) mult += settings.multipliers.commercial;

  const subtotal = baseUsd * Math.max(1, Math.min(4, draft.characterCount || 1));
  const totalUsd = Math.round(subtotal * mult);
  const depositUsd = draft.paymentSplit === '100_upfront' ? totalUsd : Math.ceil(totalUsd / 2);
  const remainingUsd = totalUsd - depositUsd;

  return {
    baseUsd,
    multiplier: mult,
    totalUsd,
    depositUsd,
    remainingUsd,
    usdToPhpRate: settings.usdToPhpRate,
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
  studioSettings: StudioSettingsState;
  tiers: Tier[];
  updateStudioSettings: (patch: Partial<StudioSettingsState>) => void;
  resetStudioSettings: () => void;
  toggleBlockedDate: (isoDate: string, reason?: string) => void;
  removeBlockedRange: (id: string) => void;
  queueSlots: PublicQueueSlot[];
  maxSlots: number;
  submittedOrders: SubmittedOrder[];
  activeOrderId: string;
  setActiveOrderId: (id: string) => void;
  hasPendingOrder: boolean;
  isLoadingOrders: boolean;
  isDemoMode: boolean;
  submitOrder: (authMethod: SubmittedOrder['authMethod']) => Promise<{
    order: SubmittedOrder | null;
    error: string | null;
  }>;
  setOrderStage: (orderId: string, stage: CommissionStage) => void;
  declineOrder: (orderId: string, reason?: string) => void;
  cancelOrder: (orderId: string, reason?: string) => void;
  deleteOrder: (orderId: string) => Promise<boolean>;
  toggleOrderPaymentFlag: (orderId: string, field: 'depositPaid' | 'finalPaid') => void;
  updateOrderSchedule: (orderId: string, startDate: string, estEndDate: string) => void;
  uploadArtistWip: (
    orderId: string,
    payload: { title: string; artistNote: string; isFinal: boolean; imageUrl?: string; highResUrl?: string; slug?: string },
  ) => void;
  uploadPaymentReceipt: (orderId: string, kind: 'deposit' | 'final', attachmentUrl?: string) => void;
  approveOrderSketch: (orderId: string) => void;
  sendOrderMessage: (
    orderId: string,
    body: string,
    opts?: { attachmentUrl?: string; attachmentKind?: AttachmentKind; senderRole?: 'client' | 'artist' },
  ) => void;
  user: User | null;
  isArtistAdmin: boolean;
  devAdminPreview: boolean;
  setDevAdminPreview: (enabled: boolean) => void;
  supabaseLive: boolean;
  signOut: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  lightbox: LightboxState | null;
  openLightbox: (ids: string[], index: number) => void;
  setLightboxIndex: (index: number) => void;
  closeLightbox: () => void;
  toast: Toast | null;
  showToast: (message: string) => void;
  dismissToast: () => void;
}

const StudioContext = createContext<StudioState | undefined>(undefined);

function readHashTab(): TabId {
  const hash = (typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '') : '') as TabId;
  return TAB_IDS.includes(hash) ? hash : 'portfolio';
}

const TIER_SAMPLE_SLUG: Record<TierId, string> = {
  headshot: 'kitsunegem',
  halfbody: 'velimer-dnd',
  fullbody: 'kitsunegem',
  chibi: 'chibi-universe',
  graphics: 'thumb-gacha-gems',
};

export function StudioProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const [activeTab, setActiveTabState] = useState<TabId>(readHashTab);
  const [galleryFilter, setGalleryFilter] = useState<GalleryFilter>('all');
  const [studioSettings, setStudioSettings] = useState<StudioSettingsState>(loadStudioSettings);
  const [draft, setDraft] = useState<OrderDraft>(loadSavedDraft);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerStep, setDrawerStep] = useState<DrawerStep>(1);
  const [baseQueueSlots, setBaseQueueSlots] = useState<PublicQueueSlot[]>(INITIAL_PUBLIC_QUEUE);
  const [localOrders, setLocalOrders] = useState<SubmittedOrder[]>(loadLocalOrders);
  const [activeOrderId, setActiveOrderId] = useState<string>('');
  const [user, setUser] = useState<User | null>(null);

  const [devAdminPreview, setDevAdminPreview] = useState<boolean>(() => {
    if (import.meta.env.DEV && typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('admin') === '1' || params.get('demo') === '1';
    }
    return false;
  });

  const [lightbox, setLightbox] = useState<LightboxState | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  // Hash-based tab navigation
  useEffect(() => {
    const onHash = () => setActiveTabState(readHashTab());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Hydrate Supabase Auth session
  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const isDemoMode = useMemo(() => {
    if (typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search).get('demo') === '1';
    }
    return false;
  }, []);

  const isArtistAdmin = useMemo(
    () =>
      Boolean(
        devAdminPreview ||
          (user &&
            ((user.app_metadata as { role?: string } | undefined)?.role === 'artist' ||
              (artistAdminUid && user.id === artistAdminUid))),
      ),
    [devAdminPreview, user],
  );

  // React Query: Commissions & Studio Data
  const { data: dbOrders, isLoading: isLoadingOrders } = useCommissionsQuery(user, isArtistAdmin);
  const { data: studioData } = usePublicStudioDataQuery();

  // Sync public studio settings when query resolves
  useEffect(() => {
    if (studioData?.settings) {
      const s = studioData.settings;
      setStudioSettings((prev) => ({
        ...prev,
        status: s.availability_status ?? prev.status,
        maxSlots: s.max_slots ?? prev.maxSlots,
        usdToPhpRate: Number(s.usd_to_php_rate ?? prev.usdToPhpRate),
        basePrices: { ...prev.basePrices, ...(s.base_prices_json ?? {}) },
        multipliers: { ...prev.multipliers, ...(s.multipliers_json ?? {}) },
        blockedRanges: s.blocked_dates ?? prev.blockedRanges,
      }));
    }
    if (studioData?.queue && studioData.queue.length > 0) {
      setBaseQueueSlots(studioData.queue);
    }
  }, [studioData]);

  // Derived submittedOrders from Supabase + demo mode split
  const submittedOrders = useMemo<SubmittedOrder[]>(() => {
    if (user || isArtistAdmin) {
      const orders = dbOrders ?? [];
      if (orders.length > 0) {
        return isDemoMode ? [...orders, DEMO_SHOWCASE_ORDER] : orders;
      }
      return isDemoMode ? [DEMO_SHOWCASE_ORDER, ...localOrders] : [];
    }
    // Logged out
    return isDemoMode ? [DEMO_SHOWCASE_ORDER, ...localOrders] : [];
  }, [user, isArtistAdmin, dbOrders, isDemoMode, localOrders]);

  // Keep activeOrderId pointed at a valid order
  useEffect(() => {
    if (submittedOrders.length > 0) {
      if (!activeOrderId || !submittedOrders.some((o) => o.id === activeOrderId)) {
        setActiveOrderId(submittedOrders[0].id);
      }
    } else {
      setActiveOrderId('');
    }
  }, [submittedOrders, activeOrderId]);

  // React Query Mutation Hooks
  const updateStageMut = useUpdateCommissionStageMutation();
  const declineMut = useDeclineCommissionMutation();
  const deleteMut = useDeleteCommissionMutation();
  const togglePaymentMut = useTogglePaymentFlagMutation();
  const updateScheduleMut = useUpdateScheduleMutation();
  const sendMessageMut = useSendMessageMutation();
  const updateSettingsMut = useUpdateStudioSettingsMutation();

  const showToast = useCallback((message: string) => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), message });
    toastTimer.current = window.setTimeout(() => setToast(null), 4500);
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  const resetDraft = useCallback(() => {
    setDraft(DEFAULT_DRAFT);
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      // ignore
    }
  }, []);

  const isResumingOAuthRef = useRef(false);

  // Resume OAuth Submission when returning from Google redirect
  useEffect(() => {
    if (!supabase || !user || isResumingOAuthRef.current) return;
    const cameFromOAuth = sessionStorage.getItem('meru-oauth-return');
    const pendingDraftRaw = sessionStorage.getItem('meru_pending_draft');

    if (cameFromOAuth && pendingDraftRaw) {
      isResumingOAuthRef.current = true;
      sessionStorage.removeItem('meru-oauth-return'); // Consume trigger flag

      try {
        const parsedDraft = JSON.parse(pendingDraftRaw) as OrderDraft;
        const pricing = calculateOrderPricing(parsedDraft, studioSettings);

        insertCommissionInSupabase(user, parsedDraft, pricing)
          .then((res) => {
            if (res.order) {
              sessionStorage.removeItem('meru_pending_draft'); // Only clear on confirmed success
              queryClient.invalidateQueries({ queryKey: ['commissions'] });
              queryClient.invalidateQueries({ queryKey: ['publicStudioData'] });
              setActiveOrderId(res.order.id);
              resetDraft();
              window.history.replaceState(null, '', '#track');
              setActiveTabState('track');
              showToast(
                `Brief #${res.order.orderCode || res.order.id} submitted to Meru! Welcome to your order room.`,
              );
            } else if (res.error) {
              isResumingOAuthRef.current = false;
              // Restore draft into active form state so brief data is never lost
              setDraft(parsedDraft);
              showToast(res.error);
            }
          })
          .catch((err) => {
            isResumingOAuthRef.current = false;
            setDraft(parsedDraft);
            showToast('Network error while submitting your brief. Please try again.');
            console.error('Failed to insert OAuth commission:', err);
          });
      } catch (err) {
        sessionStorage.removeItem('meru_pending_draft');
        isResumingOAuthRef.current = false;
        console.error('Failed to parse pending OAuth brief:', err);
      }
    }
  }, [user, studioSettings, resetDraft, queryClient, showToast]);

  // Persist studio settings locally as fallback
  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(studioSettings));
    } catch {
      // ignore
    }
  }, [studioSettings]);

  // Persist draft (debounced by 350ms to prevent synchronous storage I/O on every keystroke)
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const { references: _refs, ...serializable } = draft;
        localStorage.setItem(DRAFT_KEY, JSON.stringify(serializable));
      } catch {
        // ignore
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [draft]);

  const tiers = useMemo<Tier[]>(
    () =>
      TIERS.map((t) => ({
        ...t,
        basePriceUsd: studioSettings.basePrices[t.id] ?? t.basePriceUsd,
      })),
    [studioSettings.basePrices],
  );

  const queueSlots = useMemo<PublicQueueSlot[]>(() => {
    return baseQueueSlots;
  }, [baseQueueSlots]);

  const setActiveTab = useCallback((tab: TabId) => {
    setActiveTabState(tab);
    window.location.hash = tab;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const openDrawer = useCallback(
    (opts?: { tier?: TierId; step?: DrawerStep; preferredDate?: string }) => {
      if (opts?.tier) setDraft((d) => ({ ...d, tier: opts.tier! }));
      if (opts?.preferredDate) setDraft((d) => ({ ...d, preferredStartDate: opts.preferredDate! }));
      setDrawerStep(opts?.step ?? 1);
      setDrawerOpen(true);
    },
    [],
  );

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const updateDraft = useCallback((patch: Partial<OrderDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
  }, []);

  const commissionTier = useCallback(
    (tier: TierId) => {
      openDrawer({ tier, step: 2 });
    },
    [openDrawer],
  );

  const updateStudioSettings = useCallback(
    (patch: Partial<StudioSettingsState>) => {
      setStudioSettings((prev) => {
        const next = { ...prev, ...patch };
        if (isSupabaseConfigured && isArtistAdmin) {
          updateSettingsMut.mutate({
            availability_status: next.status,
            max_slots: next.maxSlots,
            usd_to_php_rate: next.usdToPhpRate,
            base_prices_json: next.basePrices,
            multipliers_json: next.multipliers,
            blocked_dates: next.blockedRanges,
          });
        }
        return next;
      });
      showToast('Studio settings saved.');
    },
    [isArtistAdmin, showToast, updateSettingsMut],
  );

  const resetStudioSettings = useCallback(() => {
    setStudioSettings(DEFAULT_STUDIO_SETTINGS);
    showToast('Studio settings reset to defaults.');
  }, [showToast]);

  const toggleBlockedDate = useCallback(
    (isoDate: string, reason = 'Studio Busy / Unavailable') => {
      setStudioSettings((prev) => {
        const exists = prev.blockedRanges.find((b) => b.startDate === isoDate && b.endDate === isoDate);
        let nextRanges: typeof prev.blockedRanges;
        if (exists) {
          nextRanges = prev.blockedRanges.filter((b) => b.id !== exists.id);
          showToast(`Unblocked ${isoDate}`);
        } else {
          const newBlock = { id: `block-${Date.now()}`, startDate: isoDate, endDate: isoDate, reason };
          nextRanges = [...prev.blockedRanges, newBlock];
          showToast(`Blocked ${isoDate}: ${reason}`);
        }
        if (isSupabaseConfigured && isArtistAdmin) {
          updateSettingsMut.mutate({ blocked_dates: nextRanges });
        }
        return { ...prev, blockedRanges: nextRanges };
      });
    },
    [isArtistAdmin, showToast, updateSettingsMut],
  );

  const removeBlockedRange = useCallback(
    (id: string) => {
      setStudioSettings((prev) => {
        const nextRanges = prev.blockedRanges.filter((b) => b.id !== id);
        if (isSupabaseConfigured && isArtistAdmin) {
          updateSettingsMut.mutate({ blocked_dates: nextRanges });
        }
        return { ...prev, blockedRanges: nextRanges };
      });
      showToast('Removed blocked date range.');
    },
    [isArtistAdmin, showToast, updateSettingsMut],
  );

  const hasPendingOrder = useMemo(
    () => submittedOrders.some((o) => !o.declined && o.stage === 'pending_review'),
    [submittedOrders],
  );

  const submitOrder = useCallback(
    async (
      authMethod: SubmittedOrder['authMethod'],
    ): Promise<{ order: SubmittedOrder | null; error: string | null }> => {
      if (hasPendingOrder) {
        return {
          order: null,
          error:
            'You already have an active brief in Pending Review. Please wait until Meru reviews your request before submitting another.',
        };
      }

      const pricing = calculateOrderPricing(draft, studioSettings);

      if (supabase && authMethod !== 'demo') {
        if (!user) {
          sessionStorage.setItem('meru_pending_draft', JSON.stringify(draft));
          sessionStorage.setItem('meru-oauth-return', '1');
          const { error } = await signInWithOAuthProvider(authMethod === 'discord' ? 'discord' : 'google');
          if (error) {
            sessionStorage.removeItem('meru_pending_draft');
            sessionStorage.removeItem('meru-oauth-return');
          }
          return { order: null, error: error ?? 'Redirecting to sign in...' };
        }

        const res = await insertCommissionInSupabase(user, draft, pricing);
        if (res.order) {
          queryClient.invalidateQueries({ queryKey: ['commissions'] });
          queryClient.invalidateQueries({ queryKey: ['publicStudioData'] });
          setActiveOrderId(res.order.id);
          resetDraft();
        }
        return res;
      }

      // Offline demo submission
      const demoId = `MRU-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const sampleSlug = TIER_SAMPLE_SLUG[draft.tier];
      const nowIso = new Date().toISOString();
      const tierLabel = tiers.find((t) => t.id === draft.tier)?.label ?? draft.tier;

      const order: SubmittedOrder = {
        ...draft,
        id: demoId,
        orderCode: demoId,
        createdAt: nowIso,
        totalUsd: pricing.totalUsd,
        depositUsd: pricing.depositUsd,
        depositPaid: false,
        finalPaid: false,
        sketchApproved: false,
        stage: 'pending_review',
        progress: 10,
        startDate: draft.preferredStartDate ?? getLocalFutureDate(3),
        estEndDate: getLocalFutureDate(17),
        authMethod: 'demo',
        wips: [
          {
            id: `${demoId}-wip-1`,
            commissionId: demoId,
            stage: 'sketch_approval',
            title: `WIP #1 · ${tierLabel} Composition & Pose Sketch`,
            slug: sampleSlug,
            isFinal: false,
            artistNote: 'Initial pose & expression check! Watermarked during progress.',
            approvedByClient: false,
            createdAt: nowIso,
          },
        ],
        messages: [
          {
            id: `${demoId}-m1`,
            commissionId: demoId,
            senderRole: 'artist',
            senderName: 'Meru Art',
            body: `Thanks for submitting your ${tierLabel} brief! Your request is in Pending Review.`,
            createdAt: nowIso,
          },
        ],
      };

      setLocalOrders((prev) => {
        const next = [order, ...prev];
        try {
          localStorage.setItem(LOCAL_ORDERS_KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
      setActiveOrderId(order.id);
      return { order, error: null };
    },
    [draft, hasPendingOrder, queryClient, resetDraft, studioSettings, tiers, user],
  );

  const setOrderStage = useCallback(
    (orderId: string, stage: CommissionStage) => {
      const meta = STAGE_STEPS.find((s) => s.id === stage);
      const progress = meta?.progress;
      const target = submittedOrders.find((o) => o.id === orderId);
      const orderLabel = target?.orderCode || orderId.slice(0, 8);

      if (isSupabaseConfigured && orderId !== DEMO_SHOWCASE_ORDER.id) {
        updateStageMut.mutate(
          { commissionId: orderId, stage, progress },
          {
            onSuccess: () => showToast(`Order #${orderLabel} moved to ${meta?.shortLabel ?? stage}.`),
            onError: (err) => showToast(err.message),
          },
        );
      } else {
        setLocalOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, stage, progress: progress ?? o.progress } : o)),
        );
        showToast(`Order #${orderLabel} moved to ${meta?.shortLabel ?? stage}.`);
      }
    },
    [isSupabaseConfigured, showToast, submittedOrders, updateStageMut],
  );

  const declineOrder = useCallback(
    (orderId: string, reason?: string) => {
      const target = submittedOrders.find((o) => o.id === orderId);
      const orderLabel = target?.orderCode || orderId.slice(0, 8);
      if (isSupabaseConfigured && orderId !== DEMO_SHOWCASE_ORDER.id) {
        declineMut.mutate(
          { commissionId: orderId, reason, targetStage: 'declined' },
          {
            onSuccess: () => showToast(`Order #${orderLabel} declined and moved to Archive.`),
            onError: (err) => showToast(err.message),
          },
        );
      } else {
        setLocalOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, declined: true, stage: 'declined' } : o)),
        );
        showToast(`Order #${orderLabel} moved to Archive.`);
      }
    },
    [declineMut, isSupabaseConfigured, showToast, submittedOrders],
  );

  const cancelOrder = useCallback(
    (orderId: string, reason?: string) => {
      const target = submittedOrders.find((o) => o.id === orderId);
      const orderLabel = target?.orderCode || orderId.slice(0, 8);
      if (isSupabaseConfigured && orderId !== DEMO_SHOWCASE_ORDER.id) {
        declineMut.mutate(
          { commissionId: orderId, reason, targetStage: 'cancelled' },
          {
            onSuccess: () => showToast(`Order #${orderLabel} cancelled and moved to Archive.`),
            onError: (err) => showToast(err.message),
          },
        );
      } else {
        setLocalOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, stage: 'cancelled' } : o)),
        );
        showToast(`Order #${orderLabel} cancelled and moved to Archive.`);
      }
    },
    [declineMut, isSupabaseConfigured, showToast, submittedOrders],
  );

  const deleteOrder = useCallback(
    async (orderId: string): Promise<boolean> => {
      const target = submittedOrders.find((o) => o.id === orderId);
      const orderLabel = target?.orderCode || orderId.slice(0, 8);
      if (isSupabaseConfigured && orderId !== DEMO_SHOWCASE_ORDER.id) {
        try {
          const res = await deleteMut.mutateAsync(orderId);
          if (res.failedStoragePaths && res.failedStoragePaths.length > 0) {
            console.error('Failed storage cleanup paths for order:', orderId, res.failedStoragePaths);
            showToast(
              `Order #${orderLabel} deleted from database, but ${res.failedStoragePaths.length} storage files failed to remove.`,
            );
          } else {
            showToast(`Order #${orderLabel} permanently purged.`);
          }
          return true;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Failed to delete order';
          showToast(msg);
          return false;
        }
      } else {
        setLocalOrders((prev) => prev.filter((o) => o.id !== orderId));
        showToast(`Order #${orderLabel} removed.`);
        return true;
      }
    },
    [deleteMut, isSupabaseConfigured, showToast, submittedOrders],
  );

  const toggleOrderPaymentFlag = useCallback(
    (orderId: string, field: 'depositPaid' | 'finalPaid') => {
      const target = submittedOrders.find((o) => o.id === orderId);
      if (!target) return;
      const nextVal = !target[field];
      const dbField = field === 'depositPaid' ? 'deposit_paid' : 'final_paid';

      if (isSupabaseConfigured && orderId !== DEMO_SHOWCASE_ORDER.id) {
        togglePaymentMut.mutate(
          { commissionId: orderId, field: dbField, value: nextVal, currentStage: target.stage },
          {
            onSuccess: () => showToast(`Updated payment status for #${target.orderCode || target.id}.`),
            onError: (err) => showToast(err.message),
          },
        );
      } else {
        setLocalOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, [field]: nextVal } : o)),
        );
      }
    },
    [showToast, submittedOrders, togglePaymentMut],
  );

  const updateOrderSchedule = useCallback(
    (orderId: string, startDate: string, estEndDate: string) => {
      if (isSupabaseConfigured && orderId !== DEMO_SHOWCASE_ORDER.id) {
        updateScheduleMut.mutate(
          { commissionId: orderId, startDate, estEndDate },
          {
            onSuccess: () => showToast('Updated schedule window.'),
            onError: (err) => showToast(err.message),
          },
        );
      } else {
        setLocalOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, startDate, estEndDate } : o)),
        );
        showToast('Updated schedule window.');
      }
    },
    [showToast, updateScheduleMut],
  );

  const uploadArtistWip = useCallback(
    async (
      orderId: string,
      payload: { title: string; artistNote: string; isFinal: boolean; imageUrl?: string; highResUrl?: string; slug?: string },
    ) => {
      const nowIso = new Date().toISOString();
      const nextStage: CommissionStage = payload.isFinal ? 'completed' : 'sketch_approval';
      const nextProgress = payload.isFinal ? 100 : 62;

      if (isSupabaseConfigured && orderId !== DEMO_SHOWCASE_ORDER.id) {
        await insertWipInDb(orderId, {
          stage: nextStage,
          title: payload.title,
          watermarkedUrl: payload.imageUrl || '',
          highResUrl: payload.highResUrl,
          isFinal: payload.isFinal,
          artistNote: payload.artistNote,
        });
        updateStageMut.mutate({ commissionId: orderId, stage: nextStage, progress: nextProgress });
        showToast(payload.isFinal ? 'Final master file unlocked & stage completed!' : 'Watermarked WIP uploaded to client vault!');
      } else {
        const newWip: WipUploadItem = {
          id: `wip-${Date.now()}`,
          commissionId: orderId,
          stage: nextStage,
          title: payload.title,
          slug: payload.slug ?? (payload.imageUrl ? undefined : 'kitsunegem'),
          imageUrl: payload.imageUrl,
          isFinal: payload.isFinal,
          artistNote: payload.artistNote,
          approvedByClient: false,
          createdAt: nowIso,
        };

        setLocalOrders((prev) =>
          prev.map((o) => {
            if (o.id !== orderId) return o;
            return {
              ...o,
              stage: nextStage,
              progress: nextProgress,
              wips: [newWip, ...o.wips],
            };
          }),
        );
        showToast(payload.isFinal ? 'Final master file unlocked!' : 'Watermarked WIP uploaded!');
      }
    },
    [showToast, updateStageMut],
  );

  const sendOrderMessage = useCallback(
    (
      orderId: string,
      body: string,
      opts?: { attachmentUrl?: string; attachmentKind?: AttachmentKind; senderRole?: 'client' | 'artist' },
    ) => {
      if (isSupabaseConfigured && orderId !== DEMO_SHOWCASE_ORDER.id) {
        sendMessageMut.mutate(
          { commissionId: orderId, body, opts },
          {
            onError: (err) => showToast(err.message),
          },
        );
      } else {
        const role = opts?.senderRole ?? 'client';
        const newMsg: OrderMessage = {
          id: `msg-${Date.now()}`,
          commissionId: orderId,
          senderRole: role,
          senderName: role === 'artist' ? 'Meru Art' : 'You',
          body,
          attachmentUrl: opts?.attachmentUrl,
          attachmentKind: opts?.attachmentKind,
          createdAt: new Date().toISOString(),
        };

        setLocalOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, messages: [...o.messages, newMsg] } : o)),
        );

        // Auto-reply bot strictly for demo showcase order
        if (role === 'client' && (orderId === DEMO_SHOWCASE_ORDER.id || isDemoMode)) {
          window.setTimeout(() => {
            const reply: OrderMessage = {
              id: `msg-${Date.now()}-bot`,
              commissionId: orderId,
              senderRole: 'artist',
              senderName: 'Meru Art (Demo)',
              body: 'Got your message! (Simulated response in Demo Mode)',
              createdAt: new Date().toISOString(),
            };
            setLocalOrders((prev) =>
              prev.map((o) => (o.id === orderId ? { ...o, messages: [...o.messages, reply] } : o)),
            );
          }, 900);
        }
      }
    },
    [isDemoMode, sendMessageMut, showToast],
  );

  const uploadPaymentReceipt = useCallback(
    (orderId: string, kind: 'deposit' | 'final', attachmentUrl?: string) => {
      const target = submittedOrders.find((o) => o.id === orderId);
      if (!target) return;

      const amount = kind === 'deposit' ? target.depositUsd : Math.max(0, target.totalUsd - target.depositUsd);

      if (isSupabaseConfigured && orderId !== DEMO_SHOWCASE_ORDER.id) {
        submitPaymentReceiptInDb(orderId, kind, amount, target.currency, attachmentUrl).then(() => {
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.commissions });
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.payments(orderId) });
        });
        sendOrderMessage(
          orderId,
          `Uploaded ${kind === 'deposit' ? 'upfront deposit' : 'remaining balance'} payment receipt for verification.`,
          { attachmentUrl, attachmentKind: 'receipt', senderRole: 'client' },
        );
        showToast('Payment receipt submitted! Meru will verify it shortly.');
      } else {
        sendOrderMessage(
          orderId,
          `Uploaded ${kind === 'deposit' ? 'deposit' : 'balance'} receipt (Demo Mode).`,
          { attachmentUrl, attachmentKind: 'receipt', senderRole: 'client' },
        );
        showToast('Payment receipt uploaded (Demo Mode)!');
      }
    },
    [queryClient, sendOrderMessage, showToast, submittedOrders],
  );

  const approveOrderSketch = useCallback(
    (orderId: string) => {
      sendOrderMessage(orderId, 'Sketch approved! Ready for clean lineart & coloring.', { senderRole: 'client' });
      showToast('Sketch approved!');
    },
    [sendOrderMessage, showToast],
  );

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  const signInWithGoogle = useCallback(async () => {
    await signInWithOAuthProvider('google');
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
      studioSettings,
      tiers,
      updateStudioSettings,
      resetStudioSettings,
      toggleBlockedDate,
      removeBlockedRange,
      queueSlots,
      maxSlots: studioSettings.maxSlots,
      submittedOrders,
      activeOrderId,
      setActiveOrderId,
      hasPendingOrder,
      isLoadingOrders,
      isDemoMode,
      submitOrder,
      setOrderStage,
      declineOrder,
      cancelOrder,
      deleteOrder,
      toggleOrderPaymentFlag,
      updateOrderSchedule,
      uploadArtistWip,
      uploadPaymentReceipt,
      approveOrderSketch,
      sendOrderMessage,
      user,
      isArtistAdmin,
      devAdminPreview,
      setDevAdminPreview,
      supabaseLive: isSupabaseConfigured,
      signOut,
      signInWithGoogle,
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
      studioSettings,
      tiers,
      updateStudioSettings,
      resetStudioSettings,
      toggleBlockedDate,
      removeBlockedRange,
      queueSlots,
      submittedOrders,
      activeOrderId,
      hasPendingOrder,
      isLoadingOrders,
      isDemoMode,
      submitOrder,
      setOrderStage,
      declineOrder,
      cancelOrder,
      deleteOrder,
      toggleOrderPaymentFlag,
      updateOrderSchedule,
      uploadArtistWip,
      uploadPaymentReceipt,
      approveOrderSketch,
      sendOrderMessage,
      user,
      isArtistAdmin,
      devAdminPreview,
      signOut,
      signInWithGoogle,
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
