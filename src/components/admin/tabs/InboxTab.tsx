import { useState, useMemo, useRef, useEffect, type FormEvent, type ChangeEvent, type KeyboardEvent } from 'react';
import {
  MessageSquare,
  Search,
  Send,
  Paperclip,
  ArrowLeft,
  Lock,
  Layers,
  User,
  Users,
  Eye,
  Archive,
} from 'lucide-react';
import { useStudio } from '@/context/StudioContext';
import { cn, getTier, formatShortDate, formatMoney } from '@/lib/utils';
import { uploadChatAttachment } from '@/lib/storage';
import type { SubmittedOrder, OrderMessage } from '@/types';

export interface ClientGroup {
  clientKey: string;
  clientName: string;
  clientContact: string;
  orders: SubmittedOrder[];
  totalOrders: number;
  activeOrders: SubmittedOrder[];
  pendingOrders: SubmittedOrder[];
  archivedOrders: SubmittedOrder[];
  unreadCount: number;
  latestActivityAt: number;
  latestMessage: OrderMessage | null;
  latestOrder: SubmittedOrder;
}

export interface InboxTabProps {
  orders: SubmittedOrder[];
  activeOrderId: string;
  setActiveOrderId: (id: string) => void;
  onOpenPipeline: (orderId: string) => void;
  onOpenArchive?: (orderId: string) => void;
}

type InboxViewMode = 'clients' | 'orders';
type InboxFilter = 'all' | 'unread' | 'active' | 'archived';

/**
 * Pure helper function to group submitted commissions by client contact/identity.
 * Aggregates lifetime orders, active/archived counts, unread messages, and latest activity.
 */
export function groupOrdersByClient(
  orders: SubmittedOrder[],
  unreadCounts: Record<string, number> = {},
): ClientGroup[] {
  const map = new Map<
    string,
    {
      clientKey: string;
      clientName: string;
      clientContact: string;
      orders: SubmittedOrder[];
    }
  >();

  for (const order of orders) {
    const contact = (order.clientContact || '').trim();
    const key = contact
      ? contact.toLowerCase()
      : `order:${order.id}`;

    const displayName = contact || 'Anonymous Client';

    let group = map.get(key);
    if (!group) {
      group = {
        clientKey: key,
        clientName: displayName,
        clientContact: contact || displayName,
        orders: [],
      };
      map.set(key, group);
    }
    group.orders.push(order);
  }

  const result: ClientGroup[] = [];

  for (const group of map.values()) {
    // Sort orders for this client: newest message or creation date first
    const sortedClientOrders = [...group.orders].sort((a, b) => {
      const aLast = a.messages[a.messages.length - 1];
      const bLast = b.messages[b.messages.length - 1];
      const aTime = aLast
        ? new Date(aLast.createdAt).getTime()
        : new Date(a.createdAt).getTime();
      const bTime = bLast
        ? new Date(bLast.createdAt).getTime()
        : new Date(b.createdAt).getTime();
      return bTime - aTime;
    });

    const activeOrders = sortedClientOrders.filter(
      (o) =>
        !['declined', 'cancelled', 'completed', 'pending_review'].includes(o.stage),
    );
    const pendingOrders = sortedClientOrders.filter(
      (o) => o.stage === 'pending_review',
    );
    const archivedOrders = sortedClientOrders.filter((o) =>
      ['declined', 'cancelled', 'completed'].includes(o.stage),
    );

    let unreadCount = 0;
    let latestActivityAt = 0;
    let latestMessage: OrderMessage | null = null;
    let latestOrder = sortedClientOrders[0];

    for (const order of sortedClientOrders) {
      unreadCount += unreadCounts[order.id] ?? 0;
      const lastMsg = order.messages[order.messages.length - 1];
      const msgTime = lastMsg ? new Date(lastMsg.createdAt).getTime() : 0;
      const orderTime = new Date(order.createdAt).getTime();
      const effTime = Math.max(msgTime, orderTime);

      if (effTime > latestActivityAt) {
        latestActivityAt = effTime;
        latestMessage = lastMsg || null;
        latestOrder = order;
      }
    }

    result.push({
      clientKey: group.clientKey,
      clientName: group.clientName,
      clientContact: group.clientContact,
      orders: sortedClientOrders,
      totalOrders: sortedClientOrders.length,
      activeOrders,
      pendingOrders,
      archivedOrders,
      unreadCount,
      latestActivityAt,
      latestMessage,
      latestOrder,
    });
  }

  return result.sort((a, b) => b.latestActivityAt - a.latestActivityAt);
}

function getStageBadgeStyle(stage: string): string {
  switch (stage) {
    case 'completed':
      return 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20';
    case 'declined':
    case 'cancelled':
      return 'bg-rose-500/10 text-rose-700 border-rose-500/20';
    case 'pending_review':
      return 'bg-amber-500/10 text-amber-700 border-amber-500/20';
    case 'awaiting_deposit':
      return 'bg-orange-500/10 text-orange-700 border-orange-500/20';
    case 'sketching':
    case 'sketch_approval':
    case 'lineart_coloring':
    default:
      return 'bg-teal-500/10 text-teal-700 border-teal-500/20';
  }
}

function getStageLabel(stage: string): string {
  switch (stage) {
    case 'pending_review':
      return 'Brief Pending';
    case 'awaiting_deposit':
      return 'Deposit Due';
    case 'sketching':
      return 'Sketching';
    case 'sketch_approval':
      return 'Sketch Review';
    case 'lineart_coloring':
      return 'Inking & Color';
    case 'completed':
      return 'Completed';
    case 'declined':
      return 'Declined';
    case 'cancelled':
      return 'Cancelled';
    default:
      return stage.replace('_', ' ');
  }
}

export function InboxTab({
  orders,
  activeOrderId,
  setActiveOrderId,
  onOpenPipeline,
  onOpenArchive,
}: InboxTabProps) {
  const {
    unreadCounts,
    markCommissionRead,
    sendOrderMessage,
    user,
    showToast,
    openLightbox,
  } = useStudio();

  const [viewMode, setViewMode] = useState<InboxViewMode>('clients');
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileShowThread, setMobileShowThread] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [selectedClientKey, setSelectedClientKey] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messageFeedRef = useRef<HTMLDivElement | null>(null);

  // Group all orders by client
  const groupedClients = useMemo(() => {
    return groupOrdersByClient(orders, unreadCounts);
  }, [orders, unreadCounts]);

  // If activeOrderId belongs to a client, keep that client selected
  useEffect(() => {
    if (activeOrderId) {
      const owner = groupedClients.find((c) =>
        c.orders.some((o) => o.id === activeOrderId),
      );
      if (owner && owner.clientKey !== selectedClientKey) {
        setSelectedClientKey(owner.clientKey);
      }
    }
  }, [activeOrderId, groupedClients, selectedClientKey]);

  // Active client selection
  const selectedClient = useMemo(() => {
    if (selectedClientKey) {
      const found = groupedClients.find((c) => c.clientKey === selectedClientKey);
      if (found) return found;
    }
    if (activeOrderId) {
      const owner = groupedClients.find((c) =>
        c.orders.some((o) => o.id === activeOrderId),
      );
      if (owner) return owner;
    }
    return groupedClients[0] ?? null;
  }, [selectedClientKey, activeOrderId, groupedClients]);

  // Active commission selection
  const selectedOrder = useMemo<SubmittedOrder | null>(() => {
    if (selectedClient) {
      const matchInClient = selectedClient.orders.find((o) => o.id === activeOrderId);
      if (matchInClient) return matchInClient;
      // Default to client's latest order
      return selectedClient.latestOrder ?? selectedClient.orders[0] ?? null;
    }
    return orders.find((o) => o.id === activeOrderId) ?? orders[0] ?? null;
  }, [selectedClient, activeOrderId, orders]);

  // Filter clients
  const filteredClients = useMemo(() => {
    return groupedClients.filter((client) => {
      if (filter === 'unread' && client.unreadCount === 0) return false;
      if (filter === 'active' && client.activeOrders.length === 0) return false;
      if (filter === 'archived' && client.archivedOrders.length === 0) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();

      const matchesClient = client.clientName.toLowerCase().includes(q);
      const matchesOrderCode = client.orders.some((o) =>
        (o.orderCode || '').toLowerCase().includes(q),
      );
      const matchesChar = client.orders.some((o) =>
        (o.characterName || '').toLowerCase().includes(q),
      );
      const matchesMsg = client.orders.some((o) =>
        o.messages.some((m) => (m.body || '').toLowerCase().includes(q)),
      );

      return matchesClient || matchesOrderCode || matchesChar || matchesMsg;
    });
  }, [groupedClients, filter, searchQuery]);

  // Flat sorted orders for "All Orders" view mode
  const sortedOrders = useMemo(() => {
    return [...orders].sort((a, b) => {
      const aLast = a.messages[a.messages.length - 1];
      const bLast = b.messages[b.messages.length - 1];
      const aTime = aLast ? new Date(aLast.createdAt).getTime() : new Date(a.createdAt).getTime();
      const bTime = bLast ? new Date(bLast.createdAt).getTime() : new Date(b.createdAt).getTime();
      return bTime - aTime;
    });
  }, [orders]);

  // Filtered flat orders for "All Orders" view mode
  const filteredOrders = useMemo(() => {
    return sortedOrders.filter((order) => {
      const isUnread = (unreadCounts[order.id] ?? 0) > 0;
      const isArchived = ['declined', 'cancelled', 'completed'].includes(order.stage);
      const isActive = !isArchived && order.stage !== 'pending_review';

      if (filter === 'unread' && !isUnread) return false;
      if (filter === 'active' && !isActive) return false;
      if (filter === 'archived' && !isArchived) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();

      const matchesContact = (order.clientContact || '').toLowerCase().includes(q);
      const matchesCode = (order.orderCode || '').toLowerCase().includes(q);
      const matchesChar = (order.characterName || '').toLowerCase().includes(q);
      const matchesMsg = order.messages.some((m) => (m.body || '').toLowerCase().includes(q));

      return matchesContact || matchesCode || matchesChar || matchesMsg;
    });
  }, [sortedOrders, filter, searchQuery, unreadCounts]);

  // Mark selected commission as read
  useEffect(() => {
    if (selectedOrder && (unreadCounts[selectedOrder.id] ?? 0) > 0) {
      markCommissionRead(selectedOrder.id);
    }
  }, [selectedOrder, unreadCounts, markCommissionRead]);

  // Auto-scroll message feed container strictly inside its own overflow boundary
  useEffect(() => {
    if (messageFeedRef.current) {
      messageFeedRef.current.scrollTop = messageFeedRef.current.scrollHeight;
    }
  }, [selectedOrder?.id, selectedOrder?.messages.length, mobileShowThread]);

  const handleSelectClient = (client: ClientGroup) => {
    setSelectedClientKey(client.clientKey);
    const primaryOrder =
      client.activeOrders[0] ?? client.pendingOrders[0] ?? client.orders[0];
    if (primaryOrder) {
      setActiveOrderId(primaryOrder.id);
      markCommissionRead(primaryOrder.id);
    }
    setMobileShowThread(true);
  };

  const handleSelectOrder = (orderId: string) => {
    setActiveOrderId(orderId);
    markCommissionRead(orderId);
    const owner = groupedClients.find((c) =>
      c.orders.some((o) => o.id === orderId),
    );
    if (owner) {
      setSelectedClientKey(owner.clientKey);
    }
    setMobileShowThread(true);
  };

  const handleSendMessage = (e: FormEvent) => {
    e.preventDefault();
    if (!selectedOrder || !messageText.trim()) return;

    sendOrderMessage(selectedOrder.id, messageText.trim(), { senderRole: 'artist' });
    setMessageText('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(e);
    }
  };

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedOrder || !user) return;

    setIsUploading(true);
    showToast('Uploading attachment to secure studio vault...');
    try {
      const { path, error } = await uploadChatAttachment(user.id, selectedOrder.id, file);
      if (error || !path) {
        showToast(`Upload failed: ${error ?? 'Unknown error'}`);
      } else {
        sendOrderMessage(
          selectedOrder.id,
          messageText.trim() || `[Attachment: ${file.name}]`,
          {
            attachmentUrl: path,
            attachmentKind: 'reference',
            senderRole: 'artist',
          },
        );
        setMessageText('');
        showToast('Attachment posted to conversation.');
      }
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const isTerminalOrder =
    selectedOrder &&
    (selectedOrder.stage === 'completed' ||
      selectedOrder.stage === 'declined' ||
      selectedOrder.stage === 'cancelled');

  return (
    <div className="space-y-4">
      {/* Tab Header */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="font-display text-lg font-bold text-ink">
            Admin Inbox & Client Conversations
          </h3>
          <p className="text-xs text-ink-soft">
            Direct communication hub organized by client. Click any client to inspect all their current and historical commissions.
          </p>
        </div>
      </div>

      {/* Main Two-Pane Box */}
      <div className="overflow-hidden rounded-3xl border border-line bg-paper shadow-xs">
        <div className="grid h-[680px] grid-cols-1 md:grid-cols-12 min-h-0 overflow-hidden">
          {/* Left Pane: Client & Conversation Directory (5 cols) */}
          <div
            className={cn(
              'flex flex-col h-full min-h-0 overflow-hidden border-r border-line bg-canvas md:col-span-5',
              mobileShowThread ? 'hidden md:flex' : 'flex',
            )}
          >
            {/* Search, View Modes & Filters */}
            <div className="shrink-0 border-b border-line p-3.5 space-y-2.5 bg-paper">
              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute top-2.5 left-3 size-3.5 text-ink-mute" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={
                    viewMode === 'clients'
                      ? 'Search clients, orders, messages...'
                      : 'Search order code, character, client...'
                  }
                  className="w-full rounded-xl border border-line bg-canvas py-2 pr-3 pl-8 text-xs text-ink placeholder:text-ink-mute focus:border-ink focus:outline-none"
                />
              </div>

              {/* View Mode Switcher: Clients vs All Orders */}
              <div className="flex items-center rounded-xl bg-canvas p-0.5 border border-line text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setViewMode('clients')}
                  className={cn(
                    'flex-1 rounded-lg py-1 px-2 text-center transition flex items-center justify-center gap-1.5 text-xs',
                    viewMode === 'clients'
                      ? 'bg-paper text-ink shadow-2xs font-bold'
                      : 'text-ink-soft hover:text-ink',
                  )}
                >
                  <Users className="size-3.5" />
                  <span>By Client ({groupedClients.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('orders')}
                  className={cn(
                    'flex-1 rounded-lg py-1 px-2 text-center transition flex items-center justify-center gap-1.5 text-xs',
                    viewMode === 'orders'
                      ? 'bg-paper text-ink shadow-2xs font-bold'
                      : 'text-ink-soft hover:text-ink',
                  )}
                >
                  <Layers className="size-3.5" />
                  <span>All Orders ({orders.length})</span>
                </button>
              </div>

              {/* Filter Pills */}
              <div className="flex items-center gap-1 overflow-x-auto pb-0.5 text-xs">
                {(
                  [
                    { id: 'all', label: 'All' },
                    { id: 'unread', label: 'Unread' },
                    { id: 'active', label: 'Active' },
                    { id: 'archived', label: 'Archived' },
                  ] as { id: InboxFilter; label: string }[]
                ).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFilter(f.id)}
                    className={cn(
                      'rounded-lg px-2.5 py-1 font-semibold whitespace-nowrap transition text-xs',
                      filter === f.id
                        ? 'bg-ink text-white'
                        : 'text-ink-soft hover:bg-cream hover:text-ink',
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* List Items Container */}
            <div
              data-lenis-prevent
              className="flex-1 min-h-0 overflow-y-auto divide-y divide-line/60"
            >
              {viewMode === 'clients' ? (
                /* Grouped by Client View */
                filteredClients.length === 0 ? (
                  <div className="p-8 text-center text-xs text-ink-mute">
                    No clients match your filter.
                  </div>
                ) : (
                  filteredClients.map((client) => {
                    const isSelected = selectedClient?.clientKey === client.clientKey;
                    const previewText = client.latestMessage
                      ? client.latestMessage.body ||
                        (client.latestMessage.attachmentUrl ? '[Attachment]' : '')
                      : 'No messages yet';

                    return (
                      <button
                        key={client.clientKey}
                        type="button"
                        onClick={() => handleSelectClient(client)}
                        className={cn(
                          'w-full text-left p-3.5 transition flex items-start gap-3 relative',
                          isSelected
                            ? 'bg-cream/90 border-l-4 border-l-ink'
                            : 'hover:bg-paper/70',
                        )}
                      >
                        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-ink/10 text-ink">
                          <User className="size-4" />
                        </span>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="truncate font-semibold text-xs text-ink">
                              {client.clientName}
                            </span>
                            <span className="shrink-0 text-[10px] text-ink-mute">
                              {client.latestActivityAt > 0
                                ? formatShortDate(new Date(client.latestActivityAt).toISOString())
                                : ''}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-ink-soft">
                            <span className="font-medium">
                              {client.totalOrders} {client.totalOrders === 1 ? 'order' : 'orders'}
                            </span>
                            {client.activeOrders.length > 0 && (
                              <>
                                <span className="text-ink-mute">·</span>
                                <span className="font-semibold text-teal">
                                  {client.activeOrders.length} active
                                </span>
                              </>
                            )}
                            {client.archivedOrders.length > 0 && (
                              <>
                                <span className="text-ink-mute">·</span>
                                <span className="text-ink-mute">
                                  {client.archivedOrders.length} past
                                </span>
                              </>
                            )}
                          </div>

                          <p className="mt-1 truncate text-xs text-ink-mute">
                            {client.latestMessage &&
                              client.latestMessage.senderRole === 'artist' && (
                                <span className="font-semibold text-coral">You: </span>
                              )}
                            {previewText}
                          </p>
                        </div>

                        {client.unreadCount > 0 && (
                          <span className="shrink-0 rounded-full bg-coral px-1.5 py-0.5 text-[10px] font-bold text-white animate-pulse motion-reduce:animate-none">
                            {client.unreadCount}
                          </span>
                        )}
                      </button>
                    );
                  })
                )
              ) : (
                /* Flat All Orders View */
                filteredOrders.length === 0 ? (
                  <div className="p-8 text-center text-xs text-ink-mute">
                    No orders match your filter.
                  </div>
                ) : (
                  filteredOrders.map((order) => {
                    const isSelected = selectedOrder?.id === order.id;
                    const unread = unreadCounts[order.id] ?? 0;
                    const lastMsg = order.messages[order.messages.length - 1];
                    const previewText = lastMsg
                      ? lastMsg.body || (lastMsg.attachmentUrl ? '[Attachment]' : '')
                      : 'No messages yet';

                    return (
                      <button
                        key={order.id}
                        type="button"
                        onClick={() => handleSelectOrder(order.id)}
                        className={cn(
                          'w-full text-left p-3.5 transition flex items-start gap-3 relative',
                          isSelected
                            ? 'bg-cream/90 border-l-4 border-l-ink'
                            : 'hover:bg-paper/70',
                        )}
                      >
                        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-ink/10 text-ink">
                          <User className="size-4" />
                        </span>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="truncate font-semibold text-xs text-ink">
                              {order.clientContact || 'Anonymous Client'}
                            </span>
                            <span className="shrink-0 text-[10px] text-ink-mute">
                              {lastMsg
                                ? formatShortDate(lastMsg.createdAt)
                                : formatShortDate(order.createdAt)}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="font-mono text-[10px] font-semibold text-ink-soft">
                              #{order.orderCode || order.id.slice(0, 8)}
                            </span>
                            <span className="text-[10px] text-ink-mute">·</span>
                            <span className="text-[10px] text-ink-soft truncate font-medium">
                              {getTier(order.tier).label}
                            </span>
                          </div>

                          <p className="mt-1 truncate text-xs text-ink-mute">
                            {lastMsg && lastMsg.senderRole === 'artist' && (
                              <span className="font-semibold text-coral">You: </span>
                            )}
                            {previewText}
                          </p>
                        </div>

                        {unread > 0 && (
                          <span className="shrink-0 rounded-full bg-coral px-1.5 py-0.5 text-[10px] font-bold text-white animate-pulse motion-reduce:animate-none">
                            {unread}
                          </span>
                        )}
                      </button>
                    );
                  })
                )
              )}
            </div>
          </div>

          {/* Right Pane: Active Client & Commission Thread (7 cols) */}
          <div
            className={cn(
              'flex flex-col h-full min-h-0 overflow-hidden bg-paper md:col-span-7',
              !mobileShowThread ? 'hidden md:flex' : 'flex',
            )}
          >
            {selectedClient && selectedOrder ? (
              <>
                {/* 1. Client Header Bar */}
                <div className="shrink-0 border-b border-line bg-paper/95 p-3.5 backdrop-blur flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <button
                      type="button"
                      onClick={() => setMobileShowThread(false)}
                      className="grid size-8 shrink-0 place-items-center rounded-full border border-line text-ink hover:bg-cream md:hidden"
                      aria-label="Back to conversation list"
                    >
                      <ArrowLeft className="size-4" />
                    </button>

                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-ink text-white text-xs font-bold">
                      {selectedClient.clientName.charAt(0).toUpperCase()}
                    </span>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-display font-bold text-sm text-ink truncate">
                          {selectedClient.clientName}
                        </h4>
                        {selectedClient.unreadCount > 0 && (
                          <span className="rounded-full bg-coral px-2 py-0.2 text-[10px] font-bold text-white">
                            {selectedClient.unreadCount} unread
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-ink-soft truncate">
                        {selectedClient.totalOrders} {selectedClient.totalOrders === 1 ? 'order' : 'orders'} total
                        {selectedClient.activeOrders.length > 0 && ` · ${selectedClient.activeOrders.length} active`}
                        {selectedClient.archivedOrders.length > 0 && ` · ${selectedClient.archivedOrders.length} past`}
                      </p>
                    </div>
                  </div>
                </div>

                {/* 2. Client Orders Strip (Current & Past Commissions Switcher) */}
                <div className="shrink-0 border-b border-line bg-canvas/70 px-3.5 py-2">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-soft">
                      <Layers className="size-3 text-ink-mute" />
                      <span>Commissions from this client ({selectedClient.orders.length})</span>
                    </div>
                    <span className="text-[10px] text-ink-mute">
                      Click a tab to view that order's chat
                    </span>
                  </div>

                  <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                    {selectedClient.orders.map((order) => {
                      const isCurrent = order.id === selectedOrder.id;
                      const orderUnread = unreadCounts[order.id] ?? 0;

                      return (
                        <button
                          key={order.id}
                          type="button"
                          onClick={() => handleSelectOrder(order.id)}
                          className={cn(
                            'group relative flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs transition shrink-0 border text-left',
                            isCurrent
                              ? 'bg-paper border-ink text-ink shadow-xs ring-1 ring-ink/20 font-bold'
                              : 'bg-paper/70 border-line text-ink-soft hover:bg-paper hover:text-ink',
                          )}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-[10px] font-semibold text-ink">
                                #{order.orderCode || order.id.slice(0, 8)}
                              </span>
                              <span className="text-[10px] text-ink-mute">·</span>
                              <span className="text-[11px] font-medium text-ink truncate max-w-[110px]">
                                {order.characterName || getTier(order.tier).label}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span
                                className={cn(
                                  'rounded-md px-1.5 py-0.2 text-[9px] font-semibold capitalize border',
                                  getStageBadgeStyle(order.stage),
                                )}
                              >
                                {getStageLabel(order.stage)}
                              </span>
                              <span className="text-[9px] text-ink-mute font-mono">
                                {formatMoney(order.totalUsd, order.currency)}
                              </span>
                            </div>
                          </div>

                          {orderUnread > 0 && (
                            <span className="grid size-4 shrink-0 place-items-center rounded-full bg-coral text-[9px] font-bold text-white animate-pulse">
                              {orderUnread}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 3. Active Order Sub-Bar */}
                <div className="shrink-0 flex items-center justify-between border-b border-line/70 bg-paper px-4 py-2 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-bold text-ink truncate">
                      {selectedOrder.characterName || 'Untitled Commission'}
                    </span>
                    <span className="text-ink-mute">·</span>
                    <span className="text-ink-soft text-[11px]">
                      {getTier(selectedOrder.tier).label} ({formatMoney(selectedOrder.totalUsd, selectedOrder.currency)})
                    </span>
                    <span className="text-[10px] text-ink-mute bg-cream px-1.5 py-0.5 rounded">
                      {selectedOrder.paymentSplit === '50_50' ? '50/50 Split' : '100% Upfront'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {isTerminalOrder ? (
                      <button
                        type="button"
                        onClick={() =>
                          onOpenArchive
                            ? onOpenArchive(selectedOrder.id)
                            : onOpenPipeline(selectedOrder.id)
                        }
                        className="inline-flex items-center gap-1 rounded-full border border-line bg-canvas px-2.5 py-1 text-[11px] font-semibold text-ink transition hover:border-ink hover:bg-paper"
                        title="View complete dossier in Archive tab"
                      >
                        <Archive className="size-3 text-ink-soft" />
                        <span>View in Archive</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onOpenPipeline(selectedOrder.id)}
                        className="inline-flex items-center gap-1 rounded-full border border-line bg-canvas px-2.5 py-1 text-[11px] font-semibold text-ink transition hover:border-ink hover:bg-paper"
                        title="Open full controls in Pipeline tab"
                      >
                        <Layers className="size-3 text-teal" />
                        <span>Open in Pipeline</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* 4. Message Log (Strict Flex Child with Isolated Scroll) */}
                <div
                  ref={messageFeedRef}
                  data-lenis-prevent
                  aria-live="polite"
                  className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3.5 bg-cream/30"
                >
                  {selectedOrder.messages.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center text-center p-8 text-ink-mute">
                      <MessageSquare className="size-8 text-ink-soft/40 mb-2" />
                      <p className="text-xs">No messages yet in this commission thread.</p>
                      <p className="text-[11px] text-ink-soft">
                        Send a message below to reach out to {selectedClient.clientName}.
                      </p>
                    </div>
                  ) : (
                    selectedOrder.messages.map((msg: OrderMessage) => {
                      const isArtist = msg.senderRole === 'artist';
                      const isSystem =
                        msg.senderRole === 'system' || msg.body.startsWith('[');

                      if (isSystem) {
                        return (
                          <div key={msg.id} className="flex justify-center my-2">
                            <span className="rounded-xl border border-line bg-paper/90 px-3 py-1 text-[11px] font-medium text-ink-mute shadow-2xs">
                              {msg.body} ·{' '}
                              {formatShortDate(msg.createdAt)}
                            </span>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={msg.id}
                          className={cn(
                            'flex flex-col',
                            isArtist ? 'items-end' : 'items-start',
                          )}
                        >
                          <div className="flex items-center gap-1.5 mb-1 px-1">
                            <span className="text-[10px] font-semibold text-ink-mute">
                              {isArtist
                                ? 'Meru Art (You)'
                                : selectedOrder.clientContact || 'Client'}
                            </span>
                            <span className="text-[9px] text-ink-soft">
                              {formatShortDate(msg.createdAt)}
                            </span>
                          </div>

                          <div
                            className={cn(
                              'max-w-[85%] rounded-2xl p-3 text-xs shadow-2xs',
                              isArtist
                                ? 'bg-ink text-white rounded-tr-xs'
                                : 'bg-paper text-ink border border-line rounded-tl-xs',
                            )}
                          >
                            <p className="whitespace-pre-wrap leading-relaxed">
                              {msg.body}
                            </p>

                            {/* Attachment rendering */}
                            {msg.attachmentUrl && (
                              <div className="mt-2.5 overflow-hidden rounded-xl border border-line/40 bg-black/5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    openLightbox([msg.attachmentUrl!], 0)
                                  }
                                  className="group relative block w-full text-left"
                                >
                                  <img
                                    src={msg.attachmentUrl}
                                    alt="Chat attachment"
                                    className="max-h-52 w-full object-cover transition group-hover:opacity-90"
                                  />
                                  <span className="absolute bottom-1.5 right-1.5 rounded-md bg-ink/80 px-1.5 py-0.5 text-[9px] text-white">
                                    <Eye className="size-2.5 inline mr-1" /> View Enlarge
                                  </span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* 5. Composer or Archived Banner */}
                {isTerminalOrder ? (
                  <div className="shrink-0 flex flex-col items-center justify-center gap-1 border-t border-line bg-canvas p-3.5 text-center text-xs text-ink-mute">
                    <div className="flex items-center gap-1.5 font-medium text-ink-soft">
                      <Lock className="size-3.5 text-ink-soft" />
                      <span>
                        Commission <strong>#{selectedOrder.orderCode || selectedOrder.id.slice(0, 8)}</strong> is marked as{' '}
                        <strong className="capitalize">{getStageLabel(selectedOrder.stage)}</strong>. Chat history is archived and read-only.
                      </span>
                    </div>
                    {selectedClient.activeOrders.length > 0 && (
                      <button
                        type="button"
                        onClick={() => handleSelectOrder(selectedClient.activeOrders[0].id)}
                        className="mt-1 text-[11px] font-semibold text-coral underline hover:text-ink transition"
                      >
                        Switch to active commission (#{selectedClient.activeOrders[0].orderCode})
                      </button>
                    )}
                  </div>
                ) : (
                  <form
                    onSubmit={handleSendMessage}
                    className="shrink-0 border-t border-line p-3 bg-paper"
                  >
                    <div className="flex items-end gap-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                      <button
                        type="button"
                        disabled={isUploading}
                        onClick={() => fileInputRef.current?.click()}
                        title="Attach image reference or receipt"
                        className="grid size-9 shrink-0 place-items-center rounded-xl border border-line bg-canvas text-ink transition hover:border-ink hover:bg-cream disabled:opacity-50"
                      >
                        <Paperclip className="size-4 text-ink-soft" />
                      </button>

                      <textarea
                        rows={1}
                        value={messageText}
                        onChange={(e) => setMessageText(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={`Message ${selectedClient.clientName} as Meru Art (Enter to send)...`}
                        className="max-h-28 flex-1 resize-none rounded-xl border border-line bg-canvas p-2.5 text-xs text-ink focus:border-ink focus:outline-none"
                      />

                      <button
                        type="submit"
                        disabled={!messageText.trim() || isUploading}
                        className="grid size-9 shrink-0 place-items-center rounded-xl bg-ink text-white transition hover:bg-coral disabled:opacity-40"
                      >
                        <Send className="size-4" />
                      </button>
                    </div>
                  </form>
                )}
              </>
            ) : (
              <div className="flex h-full items-center justify-center p-8 text-center text-xs text-ink-mute">
                Select a client or conversation from the directory to read or reply.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}