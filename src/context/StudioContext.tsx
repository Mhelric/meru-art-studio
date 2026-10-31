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
  SubmittedOrder,
  TabId,
  TierId,
} from '@/types';
import { INITIAL_PUBLIC_QUEUE, STUDIO_AVAILABILITY } from '@/data/schedule';
import { DEMO_SHOWCASE_ORDER, STAGE_STEPS } from '@/data/orders';
import { ADDON_RATES } from '@/data/artist';
import { getTier } from '@/lib/utils';
import {
  artistAdminUid,
  fetchPublicStudioData,
  insertCommissionInSupabase,
  isSupabaseConfigured,
  signInWithOAuthProvider,
  supabase,
} from '@/lib/supabase';
import { scrollToTarget } from '@/lib/smoothScroll';

const TAB_IDS: TabId[] = ['portfolio', 'rules', 'schedule', 'track'];
const DRAFT_KEY = 'meru-order-draft-v1';
const ORDERS_KEY = 'meru-submitted-orders-v2';

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
  activeOrderId: string;
  setActiveOrderId: (id: string) => void;
  /** True if the user already has a `pending_review` request (enforces the 1-pending-request-per-user scam-protection rule). */
  hasPendingOrder: boolean;
  submitOrder: (authMethod: SubmittedOrder['authMethod']) => Promise<{
    order: SubmittedOrder | null;
    error: string | null;
  }>;
  /** Phase 4 Order Room actions */
  setOrderStage: (orderId: string, stage: CommissionStage) => void;
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
  const [draft, setDraft] = useState<OrderDraft>(loadSavedDraft);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerStep, setDrawerStep] = useState<DrawerStep>(1);
  const [queueSlots, setQueueSlots] = useState<PublicQueueSlot[]>(INITIAL_PUBLIC_QUEUE);
  const [maxSlots, setMaxSlots] = useState<number>(STUDIO_AVAILABILITY.maxSlots);
  const [submittedOrders, setSubmittedOrders] = useState<SubmittedOrder[]>(loadSubmittedOrders);
  const [activeOrderId, setActiveOrderId] = useState<string>(() => loadSubmittedOrders()[0]?.id ?? DEMO_SHOWCASE_ORDER.id);
  const [user, setUser] = useState<User | null>(null);
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

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    fetchPublicStudioData().then(({ settings, queue }) => {
      if (settings?.max_slots) setMaxSlots(settings.max_slots);
      if (queue && queue.length > 0) setQueueSlots(queue);
    });

    return () => sub.subscription.unsubscribe();
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

  // Persist orders
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

  // Scam-protection rule: only 1 `pending_review` request allowed per client at a time
  const hasPendingOrder = useMemo(
    () => submittedOrders.some((o) => o.stage === 'pending_review'),
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
            'Scam & Spam Protection: You already have 1 request in Pending Review. Please wait for Meru to review your active request (or inspect it in the Track Order tab).',
        };
      }

      const { totalUsd, depositUsd } = calculateOrderPricing(draft);

      // If Supabase is configured and the user chose Discord/Google OAuth
      if (supabase && authMethod !== 'demo') {
        if (!user) {
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
        authMethod,
        wips: [
          {
            id: `${id}-wip-1`,
            commissionId: id,
            stage: 'sketch_approval',
            title: `WIP #1 · ${getTier(draft.tier).label} Composition & Pose Sketch`,
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
            title: `Final · High-Res ${getTier(draft.tier).label} PNG`,
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
            body: `Thanks for submitting your ${getTier(draft.tier).label} brief! Your request is in Pending Review. Once approved, you’ll be prompted here to upload your ${draft.paymentSplit === '50_50' ? '50%' : '100%'} deposit receipt.`,
            createdAt: nowIso,
          },
        ],
      };

      persistOrders((prev) => [order, ...prev]);
      setActiveOrderId(order.id);
      return { order, error: null };
    },
    [draft, hasPendingOrder, persistOrders, user],
  );

  const setOrderStage = useCallback(
    (orderId: string, stage: CommissionStage) => {
      const meta = STAGE_STEPS.find((s) => s.id === stage);
      persistOrders((prev) =>
        prev.map((o) => {
          if (o.id !== orderId) return o;
          return {
            ...o,
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

      // Simulated realtime artist reply in Demo Mode when client posts a message
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
        user &&
          ((user.app_metadata as { role?: string } | undefined)?.role === 'artist' ||
            (artistAdminUid && user.id === artistAdminUid)),
      ),
    [user],
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
      queueSlots,
      maxSlots,
      submittedOrders,
      activeOrderId,
      setActiveOrderId,
      hasPendingOrder,
      submitOrder,
      setOrderStage,
      uploadPaymentReceipt,
      approveOrderSketch,
      sendOrderMessage,
      user,
      isArtistAdmin,
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
      queueSlots,
      maxSlots,
      submittedOrders,
      activeOrderId,
      hasPendingOrder,
      submitOrder,
      setOrderStage,
      uploadPaymentReceipt,
      approveOrderSketch,
      sendOrderMessage,
      user,
      isArtistAdmin,
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
