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
import { AlertTriangle } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import type {
  AttachmentKind,
  CommissionStage,
  GalleryFilter,
  OrderDraft,
  PublicQueueSlot,
  StudioPaymentDetails,
  StudioSettingsState,
  SubmittedOrder,
  TabId,
  Tier,
  TierId,
  Currency,
  ClientReview,
} from '@/types';
import { detectClientCurrency, saveCurrencyPreference } from '@/lib/currency';
import { BLOCKED_RANGES, INITIAL_PUBLIC_QUEUE, STUDIO_AVAILABILITY } from '@/data/schedule';
import { STAGE_STEPS } from '@/data/orders';
import { ADDON_RATES, TIERS } from '@/data/artist';
import type { SignoffChecklist } from '@/lib/revisionWorkflow';
import {
  artistAdminUid,
  insertCommissionInSupabase,
  insertWipInDb,
  approveWipInDb,
  clientCompleteCommissionInDb,
  requestWipRevisionInDb,
  submitClientReviewInDb,
  isSupabaseConfigured,
  signInWithOAuthProvider,
  submitPaymentReceiptInDb,
  supabase,
} from '@/lib/supabase';
import { fileToDataUrl } from '@/lib/storage';
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
  useUnreadMessageCountsQuery,
  useMarkCommissionReadMutation,
} from '@/lib/queries';
import { useStudioSettingsRealtime } from '@/lib/realtime';

const TAB_IDS: TabId[] = ['portfolio', 'rules', 'schedule', 'track', 'admin'];
const DRAFT_KEY = 'meru-order-draft-v1';
const SETTINGS_KEY = 'meru-studio-settings-v1';

interface Toast {
  id: number;
  message: string;
}

interface LightboxState {
  ids: string[];
  index: number;
}

export type DrawerStep = 1 | 2 | 3;

export const DEFAULT_PAYMENT_DETAILS: StudioPaymentDetails = {
  paypalEmail: 'mkun.arts@gmail.com',
  paypalMeUsername: 'mkunarts',
  gcashNumber: '09455121351',
  gcashName: 'Mhelric Banaag',
  gcashQrImageUrl: '/brand/gcash-qr.png',
  bankName: 'Bank of the Philippine Islands (BPI)',
  bankAccountNumber: '9425-0182-44',
  bankAccountName: 'Mhelric Banaag',
  instructionsNote: 'Please include your Commission Code in the payment note/memo for instant verification.',
};

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
  paymentDetails: DEFAULT_PAYMENT_DETAILS,
};

function loadStudioSettings(): StudioSettingsState {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_STUDIO_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<StudioSettingsState>;
    const paymentDetails: StudioPaymentDetails = {
      ...DEFAULT_PAYMENT_DETAILS,
      ...(parsed.paymentDetails ?? {}),
    };
    // Migrate mock defaults to artist's real credentials if previously stored in localStorage
    if (paymentDetails.paypalEmail === 'meruart.commissions@gmail.com') {
      paymentDetails.paypalEmail = 'mkun.arts@gmail.com';
    }
    if (paymentDetails.gcashNumber === '0917-882-9104') {
      paymentDetails.gcashNumber = '09455121351';
      paymentDetails.gcashName = 'Mhelric Banaag';
    }
    const qrOverride = localStorage.getItem('meru_gcash_qr_override');
    if (qrOverride) {
      paymentDetails.gcashQrImageUrl = qrOverride;
    } else if (!paymentDetails.gcashQrImageUrl) {
      paymentDetails.gcashQrImageUrl = '/brand/gcash-qr.png';
    }
    return {
      ...DEFAULT_STUDIO_SETTINGS,
      ...parsed,
      basePrices: { ...DEFAULT_STUDIO_SETTINGS.basePrices, ...(parsed.basePrices ?? {}) },
      multipliers: { ...DEFAULT_STUDIO_SETTINGS.multipliers, ...(parsed.multipliers ?? {}) },
      blockedRanges: parsed.blockedRanges ?? DEFAULT_STUDIO_SETTINGS.blockedRanges,
      paymentDetails,
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
  const detectedCurrency = detectClientCurrency();
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return { ...DEFAULT_DRAFT, currency: detectedCurrency };
    const parsed = JSON.parse(raw) as Partial<OrderDraft>;
    return {
      ...DEFAULT_DRAFT,
      ...parsed,
      currency: parsed.currency || detectedCurrency,
      references: [],
    };
  } catch {
    return { ...DEFAULT_DRAFT, currency: detectedCurrency };
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
  currency: Currency;
  setCurrency: (c: Currency) => void;
  toggleCurrency: () => void;
  updateDraft: (patch: Partial<OrderDraft>) => void;
  resetDraft: () => void;
  studioSettings: StudioSettingsState;
  tiers: Tier[];
  updateStudioSettings: (patch: Partial<StudioSettingsState>) => void;
  resetStudioSettings: () => void;
  toggleBlockedDate: (isoDate: string, reason?: string) => void;
  removeBlockedRange: (id: string) => void;
  batchUpdateBlockedDates: (dates: string[], action: 'block' | 'unblock', reason?: string) => Promise<void>;
  unreadCounts: Record<string, number>;
  totalUnreadCount: number;
  markCommissionRead: (commissionId: string) => void;
  queueSlots: PublicQueueSlot[];
  maxSlots: number;
  submittedOrders: SubmittedOrder[];
  activeOrderId: string;
  setActiveOrderId: (id: string) => void;
  hasPendingOrder: boolean;
  isLoadingOrders: boolean;
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
    payload: {
      title: string;
      artistNote: string;
      isFinal: boolean;
      imageUrl?: string;
      highResUrl?: string;
      slug?: string;
      stage?: CommissionStage;
      progress?: number;
    },
  ) => void;
  approveWip: (orderId: string, wipId: string, wipTitle?: string) => Promise<void>;
  requestWipRevision: (
    orderId: string,
    wipId: string,
    payload: {
      category: string;
      notes: string;
      scale?: 'minor' | 'major';
      attachmentUrl?: string;
    },
  ) => Promise<void>;
  signoffMilestone: (
    orderId: string,
    wipId?: string,
    checklist?: SignoffChecklist,
    clientSignerName?: string,
  ) => Promise<void>;
  adjustMaxRevisions: (orderId: string, newMax: number) => void;
  completeOrderAsClient: (orderId: string) => Promise<void>;
  completeOrderWithReview: (
    orderId: string,
    tipAmountUsd: number,
    thankYouMessage: string,
    review?: ClientReview,
  ) => Promise<void>;
  uploadPaymentReceipt: (orderId: string, kind: 'deposit' | 'final', attachmentUrl?: string) => void;
  approveOrderSketch: (orderId: string) => void;
  sendOrderMessage: (
    orderId: string,
    body: string,
    opts?: { attachmentUrl?: string; attachmentKind?: AttachmentKind; senderRole?: 'client' | 'artist' },
  ) => void;
  user: User | null;
  isArtistAdmin: boolean;
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

export function calculateNextWipStageAndProgress(
  currentStage: CommissionStage,
  currentProgress: number,
  payload: {
    isFinal: boolean;
    stage?: CommissionStage;
    progress?: number;
  },
): { stage: CommissionStage; progress: number } {
  if (payload.isFinal) {
    return { stage: 'completed', progress: 100 };
  }
  if (payload.stage) {
    return {
      stage: payload.stage,
      progress: payload.progress ?? (payload.stage === 'lineart_coloring' ? 85 : 62),
    };
  }
  if (currentStage === 'sketching') {
    return { stage: 'sketch_approval', progress: 62 };
  }
  if (currentStage === 'sketch_approval') {
    return { stage: 'sketch_approval', progress: Math.max(currentProgress, 62) };
  }
  if (currentStage === 'lineart_coloring') {
    return {
      stage: 'lineart_coloring',
      progress: Math.max(currentProgress, payload.progress ?? 88),
    };
  }
  return { stage: currentStage, progress: currentProgress };
}

export function StudioProvider({ children }: { children: ReactNode }) {
  if (!isSupabaseConfigured) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas p-6 text-center">
        <div className="max-w-md rounded-3xl border border-coral/30 bg-paper p-8 shadow-sm">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-coral-soft text-coral">
            <AlertTriangle className="size-6 text-coral" />
          </div>
          <h1 className="font-display text-2xl font-semibold text-ink">Supabase Not Configured</h1>
          <p className="mt-2 text-sm text-ink-soft">
            Meru Art Studio requires a live Supabase backend. Please configure{' '}
            <code className="rounded bg-cream px-1.5 py-0.5 font-mono text-xs text-ink">VITE_SUPABASE_URL</code> and{' '}
            <code className="rounded bg-cream px-1.5 py-0.5 font-mono text-xs text-ink">VITE_SUPABASE_ANON_KEY</code> in
            your environment.
          </p>
        </div>
      </div>
    );
  }

  return <InnerStudioProvider>{children}</InnerStudioProvider>;
}

function InnerStudioProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  // Listen to realtime studio_settings singleton changes across all sessions
  useStudioSettingsRealtime();

  const [activeTab, setActiveTabState] = useState<TabId>(readHashTab);
  const [galleryFilter, setGalleryFilter] = useState<GalleryFilter>('all');
  const [studioSettings, setStudioSettings] = useState<StudioSettingsState>(loadStudioSettings);
  const [draft, setDraft] = useState<OrderDraft>(loadSavedDraft);
  const [currency, setCurrencyState] = useState<Currency>(() => draft.currency || detectClientCurrency());

  const setCurrency = useCallback((c: Currency) => {
    setCurrencyState(c);
    saveCurrencyPreference(c);
    setDraft((prev) => (prev.currency !== c ? { ...prev, currency: c } : prev));
  }, []);

  const toggleCurrency = useCallback(() => {
    setCurrency(currency === 'USD' ? 'PHP' : 'USD');
  }, [currency, setCurrency]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerStep, setDrawerStep] = useState<DrawerStep>(1);
  const [baseQueueSlots, setBaseQueueSlots] = useState<PublicQueueSlot[]>(
    isSupabaseConfigured ? [] : INITIAL_PUBLIC_QUEUE,
  );
  const [activeOrderId, setActiveOrderId] = useState<string>('');
  const [user, setUser] = useState<User | null>(null);

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

  const isArtistAdmin = useMemo(
    () =>
      Boolean(
        user &&
          ((user.app_metadata as { role?: string } | undefined)?.role === 'artist' ||
            (artistAdminUid && user.id === artistAdminUid)),
      ),
    [user],
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
        paymentDetails: s.payment_details_json ?? prev.paymentDetails ?? DEFAULT_PAYMENT_DETAILS,
      }));
    }
    if (studioData && Array.isArray(studioData.queue)) {
      setBaseQueueSlots(studioData.queue);
    }
  }, [studioData]);

  // Derived submittedOrders strictly from Supabase
  const submittedOrders = useMemo<SubmittedOrder[]>(() => {
    if (user || isArtistAdmin) {
      return dbOrders ?? [];
    }
    return [];
  }, [user, isArtistAdmin, dbOrders]);

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
              queryClient.invalidateQueries({ queryKey: QUERY_KEYS.commissions });
              queryClient.invalidateQueries({ queryKey: QUERY_KEYS.publicStudioData });
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

  const updateDraft = useCallback(
    (patch: Partial<OrderDraft>) => {
      setDraft((d) => {
        const next = { ...d, ...patch };
        if (patch.currency && patch.currency !== currency) {
          setCurrencyState(patch.currency);
          saveCurrencyPreference(patch.currency);
        }
        return next;
      });
    },
    [currency],
  );

  const commissionTier = useCallback(
    (tier: TierId) => {
      openDrawer({ tier, step: 2 });
    },
    [openDrawer],
  );

  const updateStudioSettings = useCallback(
    (patch: Partial<StudioSettingsState>) => {
      if (patch.paymentDetails?.gcashQrImageUrl !== undefined) {
        try {
          if (patch.paymentDetails.gcashQrImageUrl) {
            localStorage.setItem('meru_gcash_qr_override', patch.paymentDetails.gcashQrImageUrl);
          } else {
            localStorage.removeItem('meru_gcash_qr_override');
          }
        } catch {
          // ignore
        }
      }
      setStudioSettings((prev) => {
        const next = { ...prev, ...patch };
        if (isArtistAdmin) {
          updateSettingsMut.mutate({
            availability_status: next.status,
            max_slots: next.maxSlots,
            usd_to_php_rate: next.usdToPhpRate,
            base_prices_json: next.basePrices,
            multipliers_json: next.multipliers,
            blocked_dates: next.blockedRanges,
            payment_details_json: next.paymentDetails,
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
        if (isArtistAdmin) {
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
        if (isArtistAdmin) {
          updateSettingsMut.mutate({ blocked_dates: nextRanges });
        }
        return { ...prev, blockedRanges: nextRanges };
      });
      showToast('Removed blocked date range.');
    },
    [isArtistAdmin, showToast, updateSettingsMut],
  );

  const batchUpdateBlockedDates = useCallback(
    async (dates: string[], action: 'block' | 'unblock', reason = 'Studio Busy / Unavailable') => {
      if (dates.length === 0) return;

      setStudioSettings((prev) => {
        let nextRanges: typeof prev.blockedRanges;
        const targetDatesSet = new Set(dates);

        if (action === 'block') {
          const newBlocks = dates
            .filter((d) => !prev.blockedRanges.some((b) => d >= b.startDate && d <= b.endDate))
            .map((iso) => ({
              id: `block-${iso}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              startDate: iso,
              endDate: iso,
              reason,
            }));
          nextRanges = [...prev.blockedRanges, ...newBlocks];
          showToast(`Blocked ${newBlocks.length} date(s).`);
        } else {
          nextRanges = prev.blockedRanges.filter(
            (b) => !targetDatesSet.has(b.startDate) && !targetDatesSet.has(b.endDate),
          );
          showToast(`Unblocked ${dates.length} date(s).`);
        }

        if (isArtistAdmin) {
          updateSettingsMut.mutate({ blocked_dates: nextRanges });
        }
        return { ...prev, blockedRanges: nextRanges };
      });
    },
    [isArtistAdmin, showToast, updateSettingsMut],
  );

  const { data: unreadCounts = {} } = useUnreadMessageCountsQuery(user);
  const markReadMut = useMarkCommissionReadMutation();

  const totalUnreadCount = useMemo(() => {
    return Object.values(unreadCounts).reduce((acc, curr) => acc + curr, 0);
  }, [unreadCounts]);

  const markCommissionRead = useCallback(
    (commissionId: string) => {
      markReadMut.mutate(commissionId);
    },
    [markReadMut],
  );

  const hasPendingOrder = useMemo(
    () => submittedOrders.some((o) => !o.declined && o.stage === 'pending_review'),
    [submittedOrders],
  );

  const submitOrder = useCallback(
    async (
      authMethod: SubmittedOrder['authMethod'],
    ): Promise<{ order: SubmittedOrder | null; error: string | null }> => {
      if (studioSettings.status === 'closed') {
        return {
          order: null,
          error: 'Studio is currently closed for new commission requests. Submissions are temporarily paused.',
        };
      }

      if (hasPendingOrder) {
        return {
          order: null,
          error:
            'You already have an active brief in Pending Review. Please wait until Meru reviews your request before submitting another.',
        };
      }

      const pricing = calculateOrderPricing(draft, studioSettings);

      if (!user) {
        // Pre-convert any File objects or blob URLs to base64 Data URLs so they survive JSON serialization and OAuth redirect across page unloads
        const preservedReferences = await Promise.all(
          draft.references.map(async (ref) => {
            if (ref.previewUrl.startsWith('data:')) return ref;
            if (ref.file && typeof ref.file === 'object' && 'size' in ref.file) {
              const dataUrl = await fileToDataUrl(ref.file as File);
              return { ...ref, previewUrl: dataUrl || ref.previewUrl, file: undefined };
            }
            if (ref.previewUrl.startsWith('blob:')) {
              try {
                const res = await fetch(ref.previewUrl);
                const blob = await res.blob();
                const dataUrl = await fileToDataUrl(blob);
                return { ...ref, previewUrl: dataUrl || ref.previewUrl, file: undefined };
              } catch {
                return ref;
              }
            }
            return ref;
          }),
        );

        const draftToSave = { ...draft, references: preservedReferences };
        try {
          sessionStorage.setItem('meru_pending_draft', JSON.stringify(draftToSave));
          sessionStorage.setItem('meru-oauth-return', '1');
        } catch (storageErr) {
          console.warn('SessionStorage quota exceeded, continuing without full reference pre-cache:', storageErr);
        }
        const { error } = await signInWithOAuthProvider(authMethod === 'discord' ? 'discord' : 'google');
        if (error) {
          try {
            sessionStorage.removeItem('meru_pending_draft');
            sessionStorage.removeItem('meru-oauth-return');
          } catch {
            // ignore
          }
        }
        return { order: null, error: error ?? 'Redirecting to sign in...' };
      }

      const res = await insertCommissionInSupabase(user, draft, pricing);
      if (res.order) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.commissions });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.publicStudioData });
        setActiveOrderId(res.order.id);
        resetDraft();
      }
      return res;
    },
    [draft, hasPendingOrder, queryClient, resetDraft, studioSettings, user],
  );

  const setOrderStage = useCallback(
    (orderId: string, stage: CommissionStage) => {
      const meta = STAGE_STEPS.find((s) => s.id === stage);
      const progress = meta?.progress;
      const target = submittedOrders.find((o) => o.id === orderId);
      const orderLabel = target?.orderCode || orderId.slice(0, 8);

      updateStageMut.mutate(
        { commissionId: orderId, stage, progress },
        {
          onSuccess: () => showToast(`Order #${orderLabel} moved to ${meta?.shortLabel ?? stage}.`),
          onError: (err) => showToast(err.message),
        },
      );
    },
    [showToast, submittedOrders, updateStageMut],
  );

  const declineOrder = useCallback(
    (orderId: string, reason?: string) => {
      const target = submittedOrders.find((o) => o.id === orderId);
      const orderLabel = target?.orderCode || orderId.slice(0, 8);
      declineMut.mutate(
        { commissionId: orderId, reason, targetStage: 'declined' },
        {
          onSuccess: () => showToast(`Order #${orderLabel} declined and moved to Archive.`),
          onError: (err) => showToast(err.message),
        },
      );
    },
    [declineMut, showToast, submittedOrders],
  );

  const cancelOrder = useCallback(
    (orderId: string, reason?: string) => {
      const target = submittedOrders.find((o) => o.id === orderId);
      const orderLabel = target?.orderCode || orderId.slice(0, 8);
      declineMut.mutate(
        { commissionId: orderId, reason, targetStage: 'cancelled' },
        {
          onSuccess: () => showToast(`Order #${orderLabel} cancelled and moved to Archive.`),
          onError: (err) => showToast(err.message),
        },
      );
    },
    [declineMut, showToast, submittedOrders],
  );

  const deleteOrder = useCallback(
    async (orderId: string): Promise<boolean> => {
      const target = submittedOrders.find((o) => o.id === orderId);
      const orderLabel = target?.orderCode || orderId.slice(0, 8);
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
    },
    [deleteMut, showToast, submittedOrders],
  );

  const toggleOrderPaymentFlag = useCallback(
    (orderId: string, field: 'depositPaid' | 'finalPaid') => {
      const target = submittedOrders.find((o) => o.id === orderId);
      if (!target) return;
      const nextVal = !target[field];
      const dbField = field === 'depositPaid' ? 'deposit_paid' : 'final_paid';

      togglePaymentMut.mutate(
        { commissionId: orderId, field: dbField, value: nextVal, currentStage: target.stage },
        {
          onSuccess: () => showToast(`Updated payment status for #${target.orderCode || target.id}.`),
          onError: (err) => showToast(err.message),
        },
      );
    },
    [showToast, submittedOrders, togglePaymentMut],
  );

  const updateOrderSchedule = useCallback(
    (orderId: string, startDate: string, estEndDate: string) => {
      updateScheduleMut.mutate(
        { commissionId: orderId, startDate, estEndDate },
        {
          onSuccess: () => showToast('Updated schedule window.'),
          onError: (err) => showToast(err.message),
        },
      );
    },
    [showToast, updateScheduleMut],
  );

  const uploadArtistWip = useCallback(
    async (
      orderId: string,
      payload: {
        title: string;
        artistNote: string;
        isFinal: boolean;
        imageUrl?: string;
        highResUrl?: string;
        slug?: string;
        stage?: CommissionStage;
        progress?: number;
      },
    ) => {
      const order = submittedOrders.find((o) => o.id === orderId);
      const currentStage = order?.stage ?? 'sketching';
      const currentProgress = order?.progress ?? 42;

      const { stage: nextStage, progress: nextProgress } = calculateNextWipStageAndProgress(
        currentStage,
        currentProgress,
        payload,
      );

      const { error } = await insertWipInDb(orderId, {
        stage: nextStage,
        title: payload.title,
        watermarkedUrl: payload.imageUrl || '',
        highResUrl: payload.highResUrl,
        isFinal: payload.isFinal,
        artistNote: payload.artistNote,
      });

      if (error) {
        showToast(`WIP upload failed: ${error}`);
        return;
      }

      if (nextStage !== currentStage || nextProgress !== currentProgress) {
        updateStageMut.mutate({ commissionId: orderId, stage: nextStage, progress: nextProgress });
      } else {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.commissions });
      }

      showToast(payload.isFinal ? 'Final master file unlocked & stage completed!' : 'Watermarked WIP uploaded to client vault!');
    },
    [showToast, updateStageMut, submittedOrders, queryClient],
  );

  const approveWip = useCallback(
    async (orderId: string, wipId: string, wipTitle?: string) => {
      const { success, error } = await approveWipInDb(wipId, orderId, wipTitle);
      if (!success && error) {
        showToast(`Approval failed: ${error}`);
        return;
      }
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.commissions });
      showToast(`Confirmed approval for "${wipTitle || 'WIP'}"!`);
    },
    [queryClient, showToast],
  );

  const completeOrderAsClient = useCallback(
    async (orderId: string) => {
      const { success, error } = await clientCompleteCommissionInDb(orderId);
      if (!success && error) {
        showToast(`Could not complete order: ${error}`);
        return;
      }
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.commissions });
      showToast('Artwork accepted and commission completed. 300 DPI master file is ready.');
    },
    [queryClient, showToast],
  );

  const sendOrderMessage = useCallback(
    (
      orderId: string,
      body: string,
      opts?: { attachmentUrl?: string; attachmentKind?: AttachmentKind; senderRole?: 'client' | 'artist' },
    ) => {
      sendMessageMut.mutate(
        { commissionId: orderId, body, opts },
        {
          onError: (err) => showToast(err.message),
        },
      );
    },
    [sendMessageMut, showToast],
  );

  const signoffMilestone = useCallback(
    async (
      orderId: string,
      wipId?: string,
      checklist?: SignoffChecklist,
      clientSignerName?: string,
    ) => {
      const target = submittedOrders.find((o) => o.id === orderId);
      const wip = (target?.wips ?? []).find((w) => w.id === wipId) ?? target?.wips[0];
      const wipLabel = wip?.title ?? 'Milestone Deliverable';
      const signer = clientSignerName?.trim() || target?.clientContact || 'Client';

      if (wipId) {
        await approveWip(orderId, wipId, wipLabel);
      }

      const checklistSummary = checklist
        ? ' [Checklist verified: Pose & Composition locked, Details approved, Terms acknowledged]'
        : '';
      const signoffMessage = `[Milestone Sign-off · Approved]: ${signer} formally signed off on "${wipLabel}"${checklistSummary}. Milestone locked & verified.`;

      sendOrderMessage(orderId, signoffMessage, {
        senderRole: isArtistAdmin ? 'artist' : 'client',
      });

      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.commissions });
      showToast(`Milestone formally signed off for "${wipLabel}"!`);
    },
    [approveWip, isArtistAdmin, queryClient, sendOrderMessage, showToast, submittedOrders],
  );

  const requestWipRevision = useCallback(
    async (
      orderId: string,
      wipId: string,
      payload: {
        category: string;
        notes: string;
        scale?: 'minor' | 'major';
        attachmentUrl?: string;
      },
    ) => {
      const target = submittedOrders.find((o) => o.id === orderId);
      const wip = (target?.wips ?? []).find((w) => w.id === wipId);
      const wipTitle = wip?.title || 'WIP Pass';

      // 1. Persist to DB
      await requestWipRevisionInDb(wipId, orderId, payload);

      // 2. Structured message
      const isSketch = target?.stage === 'sketching' || target?.stage === 'sketch_approval';
      const scaleLabel = isSketch
        ? 'Sketch Pass (Free & Unlimited)'
        : payload.scale === 'minor'
          ? 'Minor Fix (Free & Unlimited)'
          : 'Major Revision';

      const revisionMsg = `[Revision Request · ${scaleLabel} · ${payload.category}]: ${payload.notes.trim()}`;
      sendOrderMessage(orderId, revisionMsg, {
        attachmentUrl: payload.attachmentUrl,
        attachmentKind: 'redline',
        senderRole: isArtistAdmin ? 'artist' : 'client',
      });

      // 3. Immediately reflect in query cache
      queryClient.setQueriesData<SubmittedOrder[]>({ queryKey: QUERY_KEYS.commissions }, (old) => {
        if (!old) return old;
        return old.map((o) => {
          if (o.id === orderId) {
            const nextWips = (o.wips ?? []).map((w) => {
              if (w.id === wipId) {
                return {
                  ...w,
                  revisionRequested: true,
                  revisionCategory: payload.category,
                  revisionNotes: payload.notes,
                  revisionScale: payload.scale,
                  revisionRequestedAt: new Date().toISOString(),
                };
              }
              return w;
            });
            return { ...o, wips: nextWips };
          }
          return o;
        });
      });

      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.commissions });
      showToast(`Revision request sent for "${wipTitle}"!`);
    },
    [isArtistAdmin, queryClient, sendOrderMessage, showToast, submittedOrders],
  );

  const completeOrderWithReview = useCallback(
    async (
      orderId: string,
      tipAmountUsd: number,
      thankYouMessage: string,
      review?: ClientReview,
    ) => {
      const res = review
        ? await submitClientReviewInDb(orderId, review)
        : await clientCompleteCommissionInDb(orderId);

      if (!res.success && res.error) {
        showToast(`Could not complete order: ${res.error}`);
        return;
      }

      if (review) {
        const visLabel =
          review.visibility === 'anonymous' ? 'Anonymous' : review.visibility === 'public' ? 'Public' : 'Private';
        const reviewMsg = `[Client Review · ${review.rating} Stars (${visLabel})]: "${review.comment}"`;
        sendOrderMessage(orderId, reviewMsg, { attachmentKind: 'other' });
      }

      if (thankYouMessage && thankYouMessage.trim()) {
        sendOrderMessage(orderId, `[Client Note]: ${thankYouMessage.trim()}`, { attachmentKind: 'other' });
      }

      if (tipAmountUsd > 0) {
        sendOrderMessage(orderId, `[Client Gratuity]: Added $${tipAmountUsd} gratuity for Meru Art Studio!`, {
          attachmentKind: 'other',
        });
      }

      queryClient.setQueriesData<SubmittedOrder[]>({ queryKey: QUERY_KEYS.commissions }, (old) => {
        if (!old) return old;
        return old.map((o) => {
          if (o.id === orderId) {
            return {
              ...o,
              stage: 'completed',
              progress: 100,
              review: review || o.review,
            };
          }
          return o;
        });
      });

      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.commissions });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.publicStudioData });
      showToast('Artwork accepted and commission completed. 300 DPI master download unlocked!');
    },
    [queryClient, sendOrderMessage, showToast],
  );

  const adjustMaxRevisions = useCallback(
    (orderId: string, newMax: number) => {
      const target = submittedOrders.find((o) => o.id === orderId);
      if (!target) return;
      const clampedMax = Math.max(0, newMax);
      const noticeBody = `[Studio Notice]: Meru Art updated revision allowance to ${clampedMax} included rounds.`;

      queryClient.setQueriesData<SubmittedOrder[]>({ queryKey: QUERY_KEYS.commissions }, (old) => {
        if (!old) return old;
        return old.map((o) =>
          o.id === orderId
            ? {
                ...o,
                maxRevisions: clampedMax,
              }
            : o,
        );
      });

      sendOrderMessage(orderId, noticeBody, { senderRole: 'artist' });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.commissions });
      showToast(`Updated revision allowance to ${clampedMax} rounds!`);
    },
    [queryClient, sendOrderMessage, showToast, submittedOrders],
  );

  const uploadPaymentReceipt = useCallback(
    (orderId: string, kind: 'deposit' | 'final', attachmentUrl?: string) => {
      const target = submittedOrders.find((o) => o.id === orderId);
      if (!target) return;

      const amount = kind === 'deposit' ? target.depositUsd : Math.max(0, target.totalUsd - target.depositUsd);

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
      currency,
      setCurrency,
      toggleCurrency,
      updateDraft,
      resetDraft,
      studioSettings,
      tiers,
      updateStudioSettings,
      resetStudioSettings,
      toggleBlockedDate,
      removeBlockedRange,
      batchUpdateBlockedDates,
      unreadCounts,
      totalUnreadCount,
      markCommissionRead,
      queueSlots,
      maxSlots: studioSettings.maxSlots,
      submittedOrders,
      activeOrderId,
      setActiveOrderId,
      hasPendingOrder,
      isLoadingOrders,
      submitOrder,
      setOrderStage,
      declineOrder,
      cancelOrder,
      deleteOrder,
      toggleOrderPaymentFlag,
      updateOrderSchedule,
      uploadArtistWip,
      approveWip,
      requestWipRevision,
      signoffMilestone,
      adjustMaxRevisions,
      completeOrderAsClient,
      completeOrderWithReview,
      uploadPaymentReceipt,
      approveOrderSketch,
      sendOrderMessage,
      user,
      isArtistAdmin,
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
      currency,
      setCurrency,
      toggleCurrency,
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
      batchUpdateBlockedDates,
      unreadCounts,
      totalUnreadCount,
      markCommissionRead,
      queueSlots,
      submittedOrders,
      activeOrderId,
      hasPendingOrder,
      isLoadingOrders,
      submitOrder,
      setOrderStage,
      declineOrder,
      cancelOrder,
      deleteOrder,
      toggleOrderPaymentFlag,
      updateOrderSchedule,
      uploadArtistWip,
      approveWip,
      requestWipRevision,
      signoffMilestone,
      adjustMaxRevisions,
      completeOrderAsClient,
      completeOrderWithReview,
      uploadPaymentReceipt,
      approveOrderSketch,
      sendOrderMessage,
      user,
      isArtistAdmin,
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
