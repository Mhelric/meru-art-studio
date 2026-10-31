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
import { TIER_ACCENT } from '@/lib/utils';
import {
  artistAdminUid,
  fetchPublicStudioData,
  insertCommissionInSupabase,
  isSupabaseConfigured,
  signInWithOAuthProvider,
  supabase,
} from '@/lib/supabase';
import { scrollToTarget } from '@/lib/smoothScroll';

const TAB_IDS: TabId[] = ['portfolio', 'rules', 'schedule', 'track', 'admin'];
const DRAFT_KEY = 'meru-order-draft-v1';
const ORDERS_KEY = 'meru-submitted-orders-v2';
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
      addons: { ...DEFAULT_DRAFT.addons, ...(parsed.addons ?? {}) },
      references: [],
    };
  } catch {
    return DEFAULT_DRAFT;
  }
}

function loadSubmittedOrders(): SubmittedOrder[] {
  try {
    const raw = localStorage.getItem(ORDERS_KEY);
    if (!raw) return [DEMO_SHOWCASE_ORDER];
    const parsed = JSON.parse(raw) as SubmittedOrder[];
    return parsed.length > 0 ? parsed : [DEMO_SHOWCASE_ORDER];
  } catch {
    return [DEMO_SHOWCASE_ORDER];
  }
}

export function calculateOrderPricing(draft: OrderDraft, settings: StudioSettingsState = DEFAULT_STUDIO_SETTINGS) {
  const baseUsd = settings.basePrices[draft.tier] ?? 15;
  let mult = 1;
  if (draft.addons.nsfw) mult += settings.multipliers.nsfw;
  if (draft.addons.softFurry) mult += settings.multipliers.softFurry;
  if (draft.addons.commercial) mult += settings.multipliers.commercial;

  const subtotal = baseUsd * draft.characterCount;
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
  /** Dynamic studio settings (editable live in Phase 5 Admin Dev Mode). */
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
  submitOrder: (authMethod: SubmittedOrder['authMethod']) => Promise<{
    order: SubmittedOrder | null;
    error: string | null;
  }>;
  /** Phase 4 & 5 Order / Payment / WIP Controller actions */
  setOrderStage: (orderId: string, stage: CommissionStage) => void;
  declineOrder: (orderId: string) => void;
  toggleOrderPaymentFlag: (orderId: string, field: 'depositPaid' | 'finalPaid') => void;
  updateOrderSchedule: (orderId: string, startDate: string, estEndDate: string) => void;
  uploadArtistWip: (
    orderId: string,
    payload: { title: string; artistNote: string; isFinal: boolean; imageUrl?: string; slug?: string },
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

const TIER_SAMPLE_SLUG: Record<TierId, string> = {
  headshot: 'deku-inktober',
  halfbody: 'velimer-dnd',
  fullbody: 'kitsunegem',
  chibi: 'chibi-universe',
  graphics: 'thumb-gacha-gems',
};

export function StudioProvider({ children }: { children: ReactNode }) {
  const [activeTab, setActiveTabState] = useState<TabId>(readHashTab);
  const [galleryFilter, setGalleryFilter] = useState<GalleryFilter>('all');
  const [studioSettings, setStudioSettings] = useState<StudioSettingsState>(loadStudioSettings);
  const [draft, setDraft] = useState<OrderDraft>(loadSavedDraft);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerStep, setDrawerStep] = useState<DrawerStep>(1);
  const [baseQueueSlots, setBaseQueueSlots] = useState<PublicQueueSlot[]>(INITIAL_PUBLIC_QUEUE);
  const [submittedOrders, setSubmittedOrders] = useState<SubmittedOrder[]>(loadSubmittedOrders);
  const [activeOrderId, setActiveOrderId] = useState<string>(() => loadSubmittedOrders()[0]?.id ?? DEMO_SHOWCASE_ORDER.id);
  const [user, setUser] = useState<User | null>(null);
  const [devAdminPreview, setDevAdminPreview] = useState<boolean>(true);
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const onHash = () => setActiveTabState(readHashTab());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Hydrate Supabase Auth session + public studio data when configured
  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      const nextUser = session?.user ?? null;
      setUser(nextUser);

      // If the user just returned from Google/Discord OAuth login, auto-complete their pending submission & open Track Order
      if (nextUser && (event === 'SIGNED_IN' || sessionStorage.getItem('meru-oauth-return'))) {
        const cameFromOAuth = Boolean(sessionStorage.getItem('meru-oauth-return'));
        if (cameFromOAuth) {
          sessionStorage.removeItem('meru-oauth-return');
          const displayName =
            (nextUser.user_metadata?.full_name as string | undefined) ||
            nextUser.email?.split('@')[0] ||
            'Account';
          window.history.replaceState(null, '', '#track');
          setActiveTabState('track');
          setToast({
            id: Date.now(),
            message: `Signed in as ${displayName}! Welcome to your commission workspace.`,
          });
        }
      }
    });

    fetchPublicStudioData().then(({ settings, queue }) => {
      if (settings) {
        setStudioSettings((prev) => ({
          ...prev,
          status: settings.availability_status ?? prev.status,
          maxSlots: settings.max_slots ?? prev.maxSlots,
          usdToPhpRate: Number(settings.usd_to_php_rate ?? prev.usdToPhpRate),
          basePrices: { ...prev.basePrices, ...(settings.base_prices_json ?? {}) },
          multipliers: { ...prev.multipliers, ...(settings.multipliers_json ?? {}) },
          blockedRanges: settings.blocked_dates ?? prev.blockedRanges,
        }));
      }
      if (queue && queue.length > 0) setBaseQueueSlots(queue);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  // Persist studio settings
  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(studioSettings));
    } catch {
      // ignore
    }
  }, [studioSettings]);

  // Persist draft
  useEffect(() => {
    try {
      const { references: _refs, ...serializable } = draft;
      localStorage.setItem(DRAFT_KEY, JSON.stringify(serializable));
    } catch {
      // ignore
    }
  }, [draft]);

  const tiers = useMemo<Tier[]>(
    () =>
      TIERS.map((t) => ({
        ...t,
        basePriceUsd: studioSettings.basePrices[t.id] ?? t.basePriceUsd,
      })),
    [studioSettings.basePrices],
  );

  // Merge active approved orders into the public queue view so approving a brief in Admin Mode updates the public calendar!
  const queueSlots = useMemo<PublicQueueSlot[]>(() => {
    const activeStages: CommissionStage[] = [
      'awaiting_deposit',
      'sketching',
      'sketch_approval',
      'lineart_coloring',
    ];
    const promotedFromOrders: PublicQueueSlot[] = submittedOrders
      .filter((o) => o.id !== DEMO_SHOWCASE_ORDER.id && !o.declined && activeStages.includes(o.stage))
      .map((o, i) => {
        const rawHandle = (o.clientContact || o.characterName || 'client').trim();
        const hint =
          rawHandle.length <= 2
            ? `${rawHandle[0] ?? 'c'}***`
            : `${rawHandle[0]}***${rawHandle[rawHandle.length - 1]}`;
        const stageInfo = STAGE_STEPS.find((s) => s.id === o.stage);
        return {
          slotNumber: baseQueueSlots.length + i + 1,
          id: o.id,
          handleHint: hint,
          tier: o.tier,
          stage: o.stage,
          stageLabel: stageInfo?.shortLabel ?? 'In Progress',
          progress: o.progress,
          startDate: o.startDate ?? o.preferredStartDate ?? '2026-11-05',
          estEndDate: o.estEndDate ?? '2026-11-19',
          accent: TIER_ACCENT[o.tier],
        };
      });

    return [...baseQueueSlots, ...promotedFromOrders].slice(0, studioSettings.maxSlots);
  }, [baseQueueSlots, submittedOrders, studioSettings.maxSlots]);

  const persistOrders = useCallback((updater: (prev: SubmittedOrder[]) => SubmittedOrder[]) => {
    setSubmittedOrders((prev) => {
      const next = updater(prev);
      try {
        const clean = next.map(({ references: _r, ...rest }) => ({ ...rest, references: [] }));
        localStorage.setItem(ORDERS_KEY, JSON.stringify(clean));
      } catch {
        // ignore
      }
      return next;
    });
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
    toastTimer.current = window.setTimeout(() => setToast(null), 4000);
  }, []);

  const updateStudioSettings = useCallback((patch: Partial<StudioSettingsState>) => {
    setStudioSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const resetStudioSettings = useCallback(() => {
    setStudioSettings(DEFAULT_STUDIO_SETTINGS);
    showToast('Studio prices, multipliers, and slots reset to defaults.');
  }, [showToast]);

  const toggleBlockedDate = useCallback((isoDate: string, reason = 'Artist Busy / Blocked Day') => {
    setStudioSettings((prev) => {
      const existing = prev.blockedRanges.find((b) => isoDate >= b.startDate && isoDate <= b.endDate);
      if (existing) {
        return {
          ...prev,
          blockedRanges: prev.blockedRanges.filter((b) => b.id !== existing.id),
        };
      }
      return {
        ...prev,
        blockedRanges: [
          ...prev.blockedRanges,
          { id: `block-${Date.now()}`, startDate: isoDate, endDate: isoDate, reason },
        ],
      };
    });
  }, []);

  const removeBlockedRange = useCallback((id: string) => {
    setStudioSettings((prev) => ({
      ...prev,
      blockedRanges: prev.blockedRanges.filter((b) => b.id !== id),
    }));
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
            'Scam & Spam Protection: You already have 1 request in Pending Review. Please wait for Meru to review your active request (or approve it in Admin Dev Mode).',
        };
      }

      const { totalUsd, depositUsd } = calculateOrderPricing(draft, studioSettings);

      if (supabase && authMethod !== 'demo') {
        if (!user) {
          // Save a local copy of their brief right before redirecting to Google/Discord so it is ready in Track Order on return!
          const oauthId = `MRU-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
          const sampleSlug = TIER_SAMPLE_SLUG[draft.tier];
          const nowIso = new Date().toISOString();
          const tierLabel = tiers.find((t) => t.id === draft.tier)?.label ?? draft.tier;
          const pendingOrder: SubmittedOrder = {
            ...draft,
            id: oauthId,
            createdAt: nowIso,
            totalUsd,
            depositUsd,
            depositPaid: false,
            finalPaid: false,
            sketchApproved: false,
            stage: 'pending_review',
            progress: 10,
            startDate: draft.preferredStartDate ?? '2026-11-05',
            estEndDate: '2026-11-19',
            authMethod,
            wips: [
              {
                id: `${oauthId}-wip-1`,
                commissionId: oauthId,
                stage: 'sketch_approval',
                title: `WIP #1 · ${tierLabel} Composition & Pose Sketch`,
                slug: sampleSlug,
                isFinal: false,
                artistNote: 'Initial pose & expression check! Watermarked during progress.',
                approvedByClient: false,
                createdAt: nowIso,
              },
              {
                id: `${oauthId}-wip-final`,
                commissionId: oauthId,
                stage: 'completed',
                title: `Final · High-Res ${tierLabel} PNG`,
                slug: sampleSlug,
                isFinal: true,
                artistNote: 'Full-resolution unwatermarked master file.',
                approvedByClient: false,
                createdAt: nowIso,
              },
            ],
            messages: [
              {
                id: `${oauthId}-m1`,
                commissionId: oauthId,
                senderRole: 'artist',
                senderName: 'Meru Art (Auto-Bot)',
                body: `Thanks for signing in with ${authMethod.toUpperCase()} and submitting your ${tierLabel} brief! Your request is in Pending Review.`,
                createdAt: nowIso,
              },
            ],
          };
          persistOrders((prev) => [pendingOrder, ...prev]);
          setActiveOrderId(pendingOrder.id);

          const { error } = await signInWithOAuthProvider(authMethod);
          return { order: null, error: error ?? 'Redirecting to sign in...' };
        }
        const res = await insertCommissionInSupabase(user, draft, { totalUsd, depositUsd });
        if (res.order) {
          persistOrders((prev) => [res.order!, ...prev]);
          setActiveOrderId(res.order.id);
        }
        return res;
      }

      const id = `MRU-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const sampleSlug = TIER_SAMPLE_SLUG[draft.tier];
      const nowIso = new Date().toISOString();
      const tierLabel = tiers.find((t) => t.id === draft.tier)?.label ?? draft.tier;

      const order: SubmittedOrder = {
        ...draft,
        id,
        createdAt: nowIso,
        totalUsd,
        depositUsd,
        depositPaid: false,
        finalPaid: false,
        sketchApproved: false,
        stage: 'pending_review',
        progress: 10,
        startDate: draft.preferredStartDate ?? '2026-11-05',
        estEndDate: '2026-11-19',
        authMethod,
        wips: [
          {
            id: `${id}-wip-1`,
            commissionId: id,
            stage: 'sketch_approval',
            title: `WIP #1 · ${tierLabel} Composition & Pose Sketch`,
            slug: sampleSlug,
            isFinal: false,
            artistNote: 'Initial pose & expression check! Watermarked during progress.',
            approvedByClient: false,
            createdAt: nowIso,
          },
          {
            id: `${id}-wip-final`,
            commissionId: id,
            stage: 'completed',
            title: `Final · High-Res ${tierLabel} PNG`,
            slug: sampleSlug,
            isFinal: true,
            artistNote: 'Full-resolution unwatermarked master file.',
            approvedByClient: false,
            createdAt: nowIso,
          },
        ],
        messages: [
          {
            id: `${id}-m1`,
            commissionId: id,
            senderRole: 'artist',
            senderName: 'Meru Art (Auto-Bot)',
            body: `Thanks for submitting your ${tierLabel} brief! Your request is in Pending Review. Once approved, you’ll be prompted here to upload your ${draft.paymentSplit === '50_50' ? '50%' : '100%'} deposit receipt.`,
            createdAt: nowIso,
          },
        ],
      };

      persistOrders((prev) => [order, ...prev]);
      setActiveOrderId(order.id);
      return { order, error: null };
    },
    [draft, hasPendingOrder, persistOrders, studioSettings, tiers, user],
  );

  const setOrderStage = useCallback(
    (orderId: string, stage: CommissionStage) => {
      const meta = STAGE_STEPS.find((s) => s.id === stage);
      persistOrders((prev) =>
        prev.map((o) => {
          if (o.id !== orderId) return o;
          return {
            ...o,
            declined: false,
            stage,
            progress: meta?.progress ?? o.progress,
            depositPaid: stage !== 'pending_review' && stage !== 'awaiting_deposit' ? true : o.depositPaid,
            finalPaid: stage === 'lineart_coloring' || stage === 'completed' ? true : o.finalPaid,
            sketchApproved: stage === 'lineart_coloring' || stage === 'completed' ? true : o.sketchApproved,
          };
        }),
      );
    },
    [persistOrders],
  );

  const declineOrder = useCallback(
    (orderId: string) => {
      persistOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, declined: true } : o)),
      );
      showToast(`Order #${orderId} declined. Slot was not deducted.`);
    },
    [persistOrders, showToast],
  );

  const toggleOrderPaymentFlag = useCallback(
    (orderId: string, field: 'depositPaid' | 'finalPaid') => {
      persistOrders((prev) =>
        prev.map((o) => {
          if (o.id !== orderId) return o;
          const nextVal = !o[field];
          let nextStage = o.stage;
          let nextProgress = o.progress;
          if (field === 'depositPaid' && nextVal && o.stage === 'awaiting_deposit') {
            nextStage = 'sketching';
            nextProgress = 42;
          }
          if (field === 'finalPaid' && nextVal && o.stage === 'sketch_approval') {
            nextStage = 'lineart_coloring';
            nextProgress = 85;
          }
          return { ...o, [field]: nextVal, stage: nextStage, progress: nextProgress };
        }),
      );
    },
    [persistOrders],
  );

  const updateOrderSchedule = useCallback(
    (orderId: string, startDate: string, estEndDate: string) => {
      persistOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, startDate, preferredStartDate: startDate, estEndDate } : o)),
      );
      showToast(`Updated schedule window for #${orderId}.`);
    },
    [persistOrders, showToast],
  );

  const uploadArtistWip = useCallback(
    (
      orderId: string,
      payload: { title: string; artistNote: string; isFinal: boolean; imageUrl?: string; slug?: string },
    ) => {
      const nowIso = new Date().toISOString();
      persistOrders((prev) =>
        prev.map((o) => {
          if (o.id !== orderId) return o;
          const newWip: WipUploadItem = {
            id: `wip-${Date.now()}`,
            commissionId: orderId,
            stage: payload.isFinal ? 'completed' : 'sketch_approval',
            title: payload.title,
            slug: payload.slug ?? (payload.imageUrl ? undefined : TIER_SAMPLE_SLUG[o.tier]),
            imageUrl: payload.imageUrl,
            isFinal: payload.isFinal,
            artistNote: payload.artistNote,
            approvedByClient: false,
            createdAt: nowIso,
          };
          const nextStage: CommissionStage = payload.isFinal ? 'completed' : 'sketch_approval';
          const nextProgress = payload.isFinal ? 100 : 62;
          return {
            ...o,
            stage: nextStage,
            progress: nextProgress,
            wips: [newWip, ...o.wips],
          };
        }),
      );
      showToast(payload.isFinal ? 'Final master file uploaded & unlocked!' : 'Watermarked WIP uploaded to client room!');
    },
    [persistOrders, showToast],
  );

  const sendOrderMessage = useCallback(
    (
      orderId: string,
      body: string,
      opts?: { attachmentUrl?: string; attachmentKind?: AttachmentKind; senderRole?: 'client' | 'artist' },
    ) => {
      const role = opts?.senderRole ?? 'client';
      const newMsg: OrderMessage = {
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        commissionId: orderId,
        senderRole: role,
        senderName: role === 'artist' ? 'Meru Art' : 'You',
        body,
        attachmentUrl: opts?.attachmentUrl,
        attachmentKind: opts?.attachmentKind,
        createdAt: new Date().toISOString(),
      };

      persistOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, messages: [...o.messages, newMsg] } : o)),
      );

      if (role === 'client') {
        window.setTimeout(() => {
          const replyText =
            opts?.attachmentKind === 'receipt'
              ? 'Receipt received & verified! I’ve unlocked the next stage of your commission on the tracker above.'
              : opts?.attachmentKind === 'redline'
                ? 'Got your redline notes! I’ll adjust the sketch proportions and post an updated WIP shortly.'
                : 'Got your message! I’ll keep you posted here as I work on your piece.';
          const reply: OrderMessage = {
            id: `msg-${Date.now()}-bot`,
            commissionId: orderId,
            senderRole: 'artist',
            senderName: 'Meru Art',
            body: replyText,
            createdAt: new Date().toISOString(),
          };
          persistOrders((prev) =>
            prev.map((o) => (o.id === orderId ? { ...o, messages: [...o.messages, reply] } : o)),
          );
        }, 900);
      }
    },
    [persistOrders],
  );

  const uploadPaymentReceipt = useCallback(
    (orderId: string, kind: 'deposit' | 'final', attachmentUrl?: string) => {
      persistOrders((prev) =>
        prev.map((o) => {
          if (o.id !== orderId) return o;
          if (kind === 'deposit') {
            const nextStage: CommissionStage = 'sketching';
            return { ...o, depositPaid: true, stage: nextStage, progress: 42 };
          }
          const nextStage: CommissionStage = 'lineart_coloring';
          return { ...o, finalPaid: true, sketchApproved: true, stage: nextStage, progress: 85 };
        }),
      );

      sendOrderMessage(
        orderId,
        kind === 'deposit'
          ? 'Uploaded upfront deposit receipt via GCash/PayPal.'
          : 'Approved the sketch & uploaded the remaining 50% balance receipt!',
        { attachmentUrl, attachmentKind: 'receipt', senderRole: 'client' },
      );
      showToast(
        kind === 'deposit'
          ? 'Deposit receipt uploaded! Stage advanced to Sketching.'
          : 'Remaining 50% receipt uploaded! Stage advanced to Lineart & Coloring.',
      );
    },
    [persistOrders, sendOrderMessage, showToast],
  );

  const approveOrderSketch = useCallback(
    (orderId: string) => {
      persistOrders((prev) =>
        prev.map((o) => {
          if (o.id !== orderId) return o;
          const isFullUpfront = o.paymentSplit === '100_upfront' || o.finalPaid;
          const nextStage: CommissionStage = isFullUpfront ? 'lineart_coloring' : 'sketch_approval';
          return {
            ...o,
            sketchApproved: true,
            stage: nextStage,
            progress: isFullUpfront ? 85 : o.progress,
            wips: o.wips.map((w) => (w.stage === 'sketch_approval' ? { ...w, approvedByClient: true } : w)),
          };
        }),
      );
      sendOrderMessage(orderId, 'Sketch approved! Ready for clean lineart & coloring.', { senderRole: 'client' });
      showToast('Sketch marked as approved!');
    },
    [persistOrders, sendOrderMessage, showToast],
  );

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
    setUser(null);
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
      submitOrder,
      setOrderStage,
      declineOrder,
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
      submitOrder,
      setOrderStage,
      declineOrder,
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
