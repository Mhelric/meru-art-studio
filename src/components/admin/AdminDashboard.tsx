import { useState, useRef, useEffect } from 'react';
import { Eye, RotateCcw, Sliders } from 'lucide-react';
import { useStudio } from '@/context/StudioContext';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { Reveal } from '@/components/ui/Reveal';
import { useAdminRealtime } from '@/lib/realtime';
import { cn } from '@/lib/utils';
import { AdminNav, type AdminSubTab } from './AdminNav';
import { useSegmentedAdminOrders } from './useSegmentedAdminOrders';
import { PipelineTab } from './tabs/PipelineTab';
import { IncomingBriefsTab } from './tabs/IncomingBriefsTab';
import { PaymentsTab } from './tabs/PaymentsTab';
import { StudioSettingsTab } from './tabs/StudioSettingsTab';
import { ArchiveTab } from './tabs/ArchiveTab';
import { DeclineReasonModal } from './dialogs/DeclineReasonModal';
import { DeleteOrderDialog } from './dialogs/DeleteOrderDialog';
import type { SubmittedOrder } from '@/types';

export function AdminDashboard() {
  const {
    submittedOrders,
    isLoadingOrders,
    activeOrderId,
    setActiveOrderId,
    setOrderStage,
    declineOrder,
    cancelOrder,
    deleteOrder,
    toggleOrderPaymentFlag,
    resetStudioSettings,
    devAdminPreview,
    setDevAdminPreview,
    isArtistAdmin,
    user,
    showToast,
  } = useStudio();

  // Realtime WebSocket Subscription for Artist Admin control surface
  useAdminRealtime(isArtistAdmin, user?.id);

  // Segmented orders taxonomy
  const segmented = useSegmentedAdminOrders(submittedOrders);

  // Default to Incoming Briefs if there are any new briefs to review, otherwise Pipeline
  const [activeSubTab, setActiveSubTab] = useState<AdminSubTab>(() => {
    return segmented.counts.briefs > 0 ? 'briefs' : 'pipeline';
  });

  // Safe initial navigation: waits for async orders to load, then auto-selects briefs if new briefs exist
  // and the artist has not manually clicked a tab.
  // Realtime updates after initial load will NEVER hijack the artist's current workspace.
  const userInteractedRef = useRef(false);
  const initialNavDoneRef = useRef(false);

  const handleSubTabChange = (tab: AdminSubTab) => {
    userInteractedRef.current = true;
    setActiveSubTab(tab);
  };

  useEffect(() => {
    if (isLoadingOrders) return;

    if (!initialNavDoneRef.current) {
      if (!userInteractedRef.current && segmented.counts.briefs > 0) {
        setActiveSubTab('briefs');
      }
      initialNavDoneRef.current = true;
    }
  }, [isLoadingOrders, segmented.counts.briefs]);

  // Modal dialog states
  const [orderToDeclineOrCancel, setOrderToDeclineOrCancel] = useState<SubmittedOrder | null>(null);
  const [reasonModalMode, setReasonModalMode] = useState<'decline' | 'cancel'>('decline');
  const [orderToDelete, setOrderToDelete] = useState<SubmittedOrder | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Keep live order reference for deletion dialog to reflect real-time payment updates
  const liveOrderToDelete =
    (orderToDelete && submittedOrders.find((o) => o.id === orderToDelete.id)) || orderToDelete;

  const handleAcceptBrief = (orderId: string) => {
    setOrderStage(orderId, 'awaiting_deposit');
    const order = submittedOrders.find((o) => o.id === orderId);
    showToast(`Approved #${order?.orderCode || orderId.slice(0, 8)}! Client notified to upload deposit.`);
    // Automatically switch to pipeline tab if desired
    setActiveOrderId(orderId);
    setActiveSubTab('pipeline');
  };

  const handleConfirmDeclineOrCancel = (orderId: string, reason?: string) => {
    if (reasonModalMode === 'cancel') {
      cancelOrder(orderId, reason);
    } else {
      declineOrder(orderId, reason);
    }
  };

  const handleConfirmDelete = async (orderId: string): Promise<boolean> => {
    setIsDeleting(true);
    try {
      const ok = await deleteOrder(orderId);
      return ok;
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <section className="pt-28 pb-14 sm:pt-32">
      {/* Top Dev Mode Showcase Banner */}
      <Reveal className="mb-6 flex flex-col justify-between gap-3 rounded-3xl border border-ink/20 bg-cream/80 p-4 sm:flex-row sm:items-center sm:px-6">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-ink text-mustard">
            <Sliders className="size-5" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold tracking-wider text-coral uppercase">
                Artist Admin & Backoffice
              </span>
              <span className="rounded-full bg-teal-soft px-2 py-0.5 text-[10px] font-semibold text-teal">
                RLS Protected (`is_artist_admin()`)
              </span>
            </div>
            <p className="mt-0.5 text-xs text-ink-soft">
              Changes made here update the public storefront, calculator, availability calendar, and client order tracker in real time.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {import.meta.env.DEV && (
            <button
              type="button"
              onClick={() => setDevAdminPreview(!devAdminPreview)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition-colors',
                devAdminPreview ? 'bg-ink text-white' : 'border border-line bg-paper text-ink-soft',
              )}
            >
              <Eye className="size-3.5 text-mustard" />
              Dev Preview: {devAdminPreview ? 'ON' : 'OFF'}
            </button>
          )}
          <button
            type="button"
            onClick={resetStudioSettings}
            title="Reset all prices, multipliers & blocked dates to defaults"
            className="inline-flex items-center gap-1 rounded-full border border-line bg-paper px-3 py-2 text-xs font-semibold text-ink-soft transition hover:border-ink hover:text-ink"
          >
            <RotateCcw className="size-3.5" /> Reset
          </button>
        </div>
      </Reveal>

      <SectionHeading
        eyebrow="Studio Backoffice"
        title="Artist Admin Dashboard"
        subtitle="Manage commission pipeline, incoming client briefs, payment verification gates, live storefront rates, and order archiving."
      />

      {/* Sub-Navigation Tabs */}
      <AdminNav
        activeSubTab={activeSubTab}
        onChangeSubTab={handleSubTabChange}
        counts={{
          briefs: segmented.counts.briefs,
          active: segmented.counts.active,
          payments: segmented.counts.payments,
          archived: segmented.counts.archived,
        }}
      />

      {/* Active Tab Panel (WCAG tabpanel) */}
      <div
        role="tabpanel"
        id={`admin-panel-${activeSubTab}`}
        aria-labelledby={`admin-tab-${activeSubTab}`}
        tabIndex={0}
        className="focus:outline-none"
      >
        {activeSubTab === 'pipeline' && (
          <PipelineTab
            orders={segmented.activePipeline}
            activeOrderId={activeOrderId}
            setActiveOrderId={setActiveOrderId}
            onOpenCancelModal={(order) => {
              setReasonModalMode('cancel');
              setOrderToDeclineOrCancel(order);
            }}
          />
        )}

        {activeSubTab === 'briefs' && (
          <IncomingBriefsTab
            orders={segmented.incomingBriefs}
            onAcceptBrief={handleAcceptBrief}
            onOpenDeclineModal={(order) => {
              setReasonModalMode('decline');
              setOrderToDeclineOrCancel(order);
            }}
          />
        )}

        {activeSubTab === 'payments' && (
          <PaymentsTab
            orders={segmented.pendingPayments}
            onTogglePaymentFlag={toggleOrderPaymentFlag}
          />
        )}

        {activeSubTab === 'settings' && <StudioSettingsTab />}

        {activeSubTab === 'archive' && (
          <ArchiveTab
            orders={segmented.archivedOrders}
            onOpenDeleteDialog={(order) => setOrderToDelete(order)}
          />
        )}
      </div>

      {/* Decline & Cancel Reason Modal */}
      <DeclineReasonModal
        order={orderToDeclineOrCancel}
        isOpen={Boolean(orderToDeclineOrCancel)}
        mode={reasonModalMode}
        onClose={() => setOrderToDeclineOrCancel(null)}
        onConfirmDecline={handleConfirmDeclineOrCancel}
      />

      {/* Two-Step Destructive Delete Dialog */}
      <DeleteOrderDialog
        order={liveOrderToDelete}
        isOpen={Boolean(orderToDelete)}
        isDeleting={isDeleting}
        onClose={() => setOrderToDelete(null)}
        onConfirmDelete={handleConfirmDelete}
      />
    </section>
  );
}
