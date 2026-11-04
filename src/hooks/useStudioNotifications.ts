import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SubmittedOrder, StudioNotification } from '@/types';
import { getActiveCancellationRequest } from '@/lib/orderCancellation';
import { getTier } from '@/lib/utils';
import { playNotificationSound, isAudioNotificationEnabled } from '@/lib/audio';

const STORAGE_PREFIX = 'meru_read_notifications_';

// Pure notification generator function (testable independently)
export function deriveStudioNotifications(
  submittedOrders: SubmittedOrder[],
  isArtistAdmin: boolean,
  readIds: Set<string> = new Set(),
): StudioNotification[] {
  const list: StudioNotification[] = [];

  if (isArtistAdmin) {
    // ------------------------------------------------------------------------
    // ARTIST ADMIN NOTIFICATIONS
    // ------------------------------------------------------------------------
    for (const order of submittedOrders) {
      const orderCode = order.orderCode || order.id.slice(0, 8).toUpperCase();
      const clientName = order.clientContact || 'Client';

      // 1. Incoming Briefs awaiting review
      if (order.stage === 'pending_review') {
        list.push({
          id: `brief-${order.id}`,
          orderId: order.id,
          orderCode,
          type: 'brief_submitted',
          title: `New Brief: #${orderCode}`,
          description: `${clientName} submitted a ${getTier(order.tier).label} brief (${order.characterName || 'Character'}).`,
          targetTab: 'admin',
          targetSubTab: 'briefs',
          createdAt: order.createdAt,
          isRead: readIds.has(`brief-${order.id}`),
        });
      }

      // 2. Cancellation Requests
      const cancelReq = getActiveCancellationRequest(order);
      if (cancelReq.hasRequest) {
        list.push({
          id: `cancel-${order.id}`,
          orderId: order.id,
          orderCode,
          type: 'cancellation_requested',
          title: `Cancellation Request: #${orderCode}`,
          description: `${clientName} requested cancellation: "${cancelReq.reason.slice(0, 60)}${cancelReq.reason.length > 60 ? '...' : ''}"`,
          targetTab: 'admin',
          targetSubTab: 'pipeline',
          createdAt: cancelReq.requestedAt || order.createdAt,
          isRead: readIds.has(`cancel-${order.id}`),
        });
      }

      // 3. Pending Payments awaiting verification
      const needsDepositVerification = order.stage === 'awaiting_deposit' && !order.depositPaid;
      const hasReceipt = order.messages.some((m) => m.attachmentKind === 'receipt');
      if (needsDepositVerification && hasReceipt) {
        list.push({
          id: `pmt-${order.id}`,
          orderId: order.id,
          orderCode,
          type: 'payment_submitted',
          title: `Payment Receipt: #${orderCode}`,
          description: `${clientName} uploaded a deposit payment receipt for review.`,
          targetTab: 'admin',
          targetSubTab: 'payments',
          createdAt: order.createdAt,
          isRead: readIds.has(`pmt-${order.id}`),
        });
      }

      // 4. Client messages and revisions
      for (const msg of order.messages) {
        if (msg.senderRole === 'client') {
          if (msg.body.startsWith('[Revision Request')) {
            list.push({
              id: `rev-${msg.id}`,
              orderId: order.id,
              orderCode,
              type: 'revision_requested',
              title: `Revision Request: #${orderCode}`,
              description: msg.body.slice(0, 90),
              targetTab: 'admin',
              targetSubTab: 'pipeline',
              createdAt: msg.createdAt,
              isRead: readIds.has(`rev-${msg.id}`),
            });
          } else if (!msg.body.startsWith('[Cancellation Request]')) {
            list.push({
              id: `msg-${msg.id}`,
              orderId: order.id,
              orderCode,
              type: 'message_received',
              title: `Message from ${clientName}`,
              description: `#${orderCode}: "${msg.body.slice(0, 80)}"`,
              targetTab: 'admin',
              targetSubTab: 'inbox',
              createdAt: msg.createdAt,
              isRead: readIds.has(`msg-${msg.id}`),
            });
          }
        }
      }
    }
  } else {
    // ------------------------------------------------------------------------
    // CLIENT NOTIFICATIONS
    // ------------------------------------------------------------------------
    for (const order of submittedOrders) {
      const orderCode = order.orderCode || order.id.slice(0, 8).toUpperCase();

      // 1. Brief accepted into production
      if (order.stage === 'awaiting_deposit') {
        list.push({
          id: `accept-${order.id}`,
          orderId: order.id,
          orderCode,
          type: 'brief_accepted',
          title: `Brief #${orderCode} Accepted!`,
          description: 'Meru accepted your brief! Your slot is reserved. Upload upfront deposit to unlock sketching.',
          targetTab: 'track',
          createdAt: order.createdAt,
          isRead: readIds.has(`accept-${order.id}`),
        });
      }

      // 2. Deposit verified
      if (order.depositPaid) {
        list.push({
          id: `dep-ok-${order.id}`,
          orderId: order.id,
          orderCode,
          type: 'payment_verified',
          title: `Deposit Verified: #${orderCode}`,
          description: 'Your upfront deposit was verified. Canvas sketching is now unlocked!',
          targetTab: 'track',
          createdAt: order.createdAt,
          isRead: readIds.has(`dep-ok-${order.id}`),
        });
      }

      // 3. WIP Previews uploaded by Meru
      for (const wip of order.wips) {
        list.push({
          id: `wip-${wip.id}`,
          orderId: order.id,
          orderCode,
          type: 'wip_posted',
          title: `New WIP Posted: ${wip.title}`,
          description: wip.artistNote ? `Meru: "${wip.artistNote.slice(0, 70)}"` : `WIP uploaded for #${orderCode}. Tap to inspect.`,
          targetTab: 'track',
          createdAt: wip.createdAt,
          isRead: readIds.has(`wip-${wip.id}`),
        });
      }

      // 4. Milestone stage advancement
      if (order.stage === 'sketch_approval' || order.stage === 'lineart_coloring' || order.stage === 'completed') {
        list.push({
          id: `stage-${order.id}-${order.stage}`,
          orderId: order.id,
          orderCode,
          type: 'stage_updated',
          title: `Stage Update: #${orderCode}`,
          description: `Commission has progressed to ${order.stage.replace('_', ' ').toUpperCase()} (${order.progress}% completed).`,
          targetTab: 'track',
          createdAt: order.createdAt,
          isRead: readIds.has(`stage-${order.id}-${order.stage}`),
        });
      }

      // 5. Cancellation updates
      if (order.stage === 'cancelled') {
        list.push({
          id: `cancel-done-${order.id}`,
          orderId: order.id,
          orderCode,
          type: 'cancellation_confirmed',
          title: `Cancellation Confirmed: #${orderCode}`,
          description: 'Meru confirmed cancellation. Any eligible refund is scheduled within 3–5 business days.',
          targetTab: 'track',
          createdAt: order.createdAt,
          isRead: readIds.has(`cancel-done-${order.id}`),
        });
      }

      // 6. Direct messages from Meru
      for (const msg of order.messages) {
        if (msg.senderRole === 'artist') {
          list.push({
            id: `msg-${msg.id}`,
            orderId: order.id,
            orderCode,
            type: 'message_received',
            title: 'Message from Meru Art',
            description: `#${orderCode}: "${msg.body.slice(0, 80)}"`,
            targetTab: 'track',
            createdAt: msg.createdAt,
            isRead: readIds.has(`msg-${msg.id}`),
          });
        }
      }
    }
  }

  // Sort newest first
  return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function useStudioNotifications(
  submittedOrders: SubmittedOrder[],
  isArtistAdmin: boolean,
  currentUserId: string | null | undefined,
) {
  const storageKey = `${STORAGE_PREFIX}${currentUserId || 'guest'}`;

  // Read state stored in localStorage
  const [readIds, setReadIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) return new Set(JSON.parse(raw));
    } catch {
      // ignore
    }
    return new Set<string>();
  });

  // Keep storage key in sync when user switches accounts
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setReadIds(new Set(JSON.parse(raw)));
      else setReadIds(new Set());
    } catch {
      setReadIds(new Set());
    }
  }, [storageKey]);

  // Track previous unread count to trigger gentle sound when new events arrive
  const prevUnreadCountRef = useRef<number | null>(null);

  // Derive notifications list based on actor role
  const notifications = useMemo<StudioNotification[]>(() => {
    return deriveStudioNotifications(submittedOrders, isArtistAdmin, readIds);
  }, [submittedOrders, isArtistAdmin, readIds]);

  // Unread count
  const unreadCount = useMemo(() => {
    return notifications.filter((n) => !n.isRead).length;
  }, [notifications]);

  // Sound chime when new unread notifications arrive
  useEffect(() => {
    if (prevUnreadCountRef.current !== null && unreadCount > prevUnreadCountRef.current) {
      if (isAudioNotificationEnabled()) {
        playNotificationSound('stage');
      }
    }
    prevUnreadCountRef.current = unreadCount;
  }, [unreadCount]);

  // Action: Mark single notification as read
  const markAsRead = useCallback(
    (id: string) => {
      setReadIds((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev);
        next.add(id);
        try {
          localStorage.setItem(storageKey, JSON.stringify(Array.from(next)));
        } catch {
          // ignore
        }
        return next;
      });
    },
    [storageKey],
  );

  // Action: Mark all notifications as read
  const markAllAsRead = useCallback(() => {
    const allIds = notifications.map((n) => n.id);
    const next = new Set(allIds);
    setReadIds(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(Array.from(next)));
    } catch {
      // ignore
    }
  }, [notifications, storageKey]);

  return {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
  };
}
