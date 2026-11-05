import { useState, useRef, useEffect } from 'react';
import { useStudio } from '@/context/StudioContext';
import { useAdminRealtime } from '@/lib/realtime';
import { AdminNav, type AdminSubTab, type PipelineSection, type SettingsSection } from './AdminNav';
import { useSegmentedAdminOrders } from './useSegmentedAdminOrders';
import { InboxTab } from './tabs/InboxTab';
import { PipelineTab } from './tabs/PipelineTab';
import { IncomingBriefsTab } from './tabs/IncomingBriefsTab';
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
    isArtistAdmin,
    totalUnreadCount,
    user,
  } = useStudio();

  // Realtime WebSocket Subscription for Artist Admin control surface
  useAdminRealtime(isArtistAdmin, user?.id);

  // Segmented orders taxonomy
  const segmented = useSegmentedAdminOrders(submittedOrders);

  // Default to Incoming Briefs if there are any new briefs to review, otherwise Pipeline
  const [activeSubTab, setActiveSubTab] = useState<AdminSubTab>(() => {
    try {
      const stored = sessionStorage.getItem('meru_admin_target_subtab') as AdminSubTab | null;
      if (stored && ['pipeline', 'briefs', 'payments', 'archive', 'inbox', 'settings'].includes(stored)) {
        sessionStorage.removeItem('meru_admin_target_subtab');
        if (stored === 'payments') return 'pipeline';
        return stored;
      }
    } catch {
      // ignore
    }
    return segmented.counts.briefs > 0 ? 'briefs' : 'pipeline';
  });

  const [pipelineSection, setPipelineSection] = useState<PipelineSection>('details');
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('availability');

  // Listen for direct subtab switch requests (e.g., from NotificationBell)
  useEffect(() => {
    const handleSwitch = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (detail === 'payments') {
        userInteractedRef.current = true;
        setActiveSubTab('pipeline');
        setPipelineSection('payments');
        return;
      }
      if (detail && ['pipeline', 'briefs', 'archive', 'inbox', 'settings'].includes(detail)) {
        userInteractedRef.current = true;
        setActiveSubTab(detail as AdminSubTab);
      }
    };
    window.addEventListener('meru_switch_admin_subtab', handleSwitch);
    return () => window.removeEventListener('meru_switch_admin_subtab', handleSwitch);
  }, []);

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
    setActiveOrderId(orderId);
    setActiveSubTab('pipeline');
    setPipelineSection('details');
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

  const navCounts = {
    unreadMessages: totalUnreadCount,
    briefs: segmented.counts.briefs,
    active: segmented.counts.active,
    payments: segmented.counts.payments,
    archived: segmented.counts.archived,
  };

  return (
    <section className="pt-24 pb-20 sm:pt-32 lg:pb-14">
      {/* Header Overview */}
      <div className="mb-6">
        <p className="eyebrow text-coral mb-1 text-[11px] sm:text-xs">Studio Backoffice</p>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-[36px] sm:leading-[1.1]">
          Artist Admin Dashboard
        </h1>
        <p className="mt-1 text-xs sm:text-sm text-ink-soft max-w-2xl leading-relaxed">
          Manage commission pipeline, incoming client briefs, payment verification gates, live storefront rates, and order archiving.
        </p>
      </div>

      {/* Main Responsive Grid Layout */}
      <div className="lg:grid lg:grid-cols-[200px_1fr] lg:gap-8 xl:grid-cols-[220px_1fr] items-start w-full min-w-0">
        {/* Desktop Left Sticky Sidebar */}
        <aside className="hidden lg:block lg:sticky lg:top-28">
          <AdminNav
            mode="sidebar"
            activeSubTab={activeSubTab}
            onChangeSubTab={handleSubTabChange}
            activePipelineSection={pipelineSection}
            onChangePipelineSection={(sec) => {
              setActiveSubTab('pipeline');
              setPipelineSection(sec);
            }}
            activeSettingsSection={settingsSection}
            onChangeSettingsSection={(sec) => {
              setActiveSubTab('settings');
              setSettingsSection(sec);
            }}
            counts={navCounts}
            hasActiveOrder={segmented.counts.active > 0}
          />
        </aside>

        {/* Mobile Fixed Bottom Bar */}
        <div className="lg:hidden">
          <AdminNav
            mode="bottom-bar"
            activeSubTab={activeSubTab}
            onChangeSubTab={handleSubTabChange}
            activePipelineSection={pipelineSection}
            onChangePipelineSection={(sec) => {
              setActiveSubTab('pipeline');
              setPipelineSection(sec);
            }}
            activeSettingsSection={settingsSection}
            onChangeSettingsSection={(sec) => {
              setActiveSubTab('settings');
              setSettingsSection(sec);
            }}
            counts={navCounts}
            hasActiveOrder={segmented.counts.active > 0}
          />
        </div>

        {/* Active Tab Panel (WCAG tabpanel) */}
        <main className="min-w-0 flex-1 w-full">
          <div
            role="tabpanel"
            id={`admin-panel-${activeSubTab}`}
            aria-labelledby={`admin-tab-sidebar-${activeSubTab}`}
            tabIndex={0}
            className="focus:outline-none"
          >
            {activeSubTab === 'inbox' && (
              <InboxTab
                orders={submittedOrders}
                activeOrderId={activeOrderId}
                setActiveOrderId={setActiveOrderId}
                onOpenPipeline={(orderId) => {
                  setActiveOrderId(orderId);
                  setActiveSubTab('pipeline');
                  setPipelineSection('details');
                }}
                onOpenArchive={(orderId) => {
                  setActiveOrderId(orderId);
                  setActiveSubTab('archive');
                }}
              />
            )}

            {(activeSubTab === 'pipeline' || activeSubTab === 'payments') && (
              <PipelineTab
                orders={segmented.activePipeline}
                activeOrderId={activeOrderId}
                setActiveOrderId={setActiveOrderId}
                pipelineSection={activeSubTab === 'payments' ? 'payments' : pipelineSection}
                onChangePipelineSection={setPipelineSection}
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

            {activeSubTab === 'settings' && (
              <StudioSettingsTab
                settingsSection={settingsSection}
                onChangeSettingsSection={setSettingsSection}
              />
            )}

            {activeSubTab === 'archive' && (
              <ArchiveTab
                orders={segmented.archivedOrders}
                onOpenDeleteDialog={(order) => setOrderToDelete(order)}
              />
            )}
          </div>
        </main>
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
