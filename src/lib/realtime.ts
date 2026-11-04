import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { QUERY_KEYS } from '@/lib/queries';
import { playNotificationSound } from '@/lib/audio';
import { showSystemNotification } from '@/lib/notifications';
import { useStudio } from '@/context/StudioContext';
import type { CommissionStage } from '@/types';

/**
 * Realtime subscription hook for an active commission order room.
 * Subscribes to messages, stage/pricing updates, WIP uploads, and payment verifications.
 * Automatically cleans up on unmount or active order switch.
 */
export function useCommissionRealtime(
  commissionId: string | null | undefined,
  currentUserId: string | null | undefined,
) {
  const queryClient = useQueryClient();
  const { showToast } = useStudio();
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;
  const channelRef = useRef<any>(null);

  useEffect(() => {
    // Only subscribe if real Supabase connection exists and order is not a demo ID
    if (!supabase || !commissionId || (commissionId.startsWith('MRU-') && commissionId.length < 12)) {
      return;
    }

    const channelName = `commission-realtime-${commissionId}`;
    const channel = supabase.channel(channelName);

    channel
      // 1. Realtime Messages
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `commission_id=eq.${commissionId}`,
        },
        (payload: any) => {
          const newMsg = payload.new;
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.commissions });

          // Notify client if message was sent by the artist
          if (newMsg.sender_role === 'artist' && newMsg.sender_id !== currentUserId) {
            playNotificationSound('message');
            showToastRef.current(`Meru Art: "${newMsg.body.slice(0, 60)}${newMsg.body.length > 60 ? '...' : ''}"`);
            showSystemNotification('New Message from Meru Art', {
              body: newMsg.body,
              tag: `msg-${newMsg.id}`,
              targetHash: '#track',
            });
          }
        },
      )
      // 2. Realtime Commission Updates (Stage / Payment flags / Schedule)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'commissions',
          filter: `id=eq.${commissionId}`,
        },
        (payload: any) => {
          const oldRow = payload.old;
          const newRow = payload.new;

          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.commissions });
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.publicStudioData });

          if (oldRow && oldRow.status_stage !== newRow.status_stage) {
            playNotificationSound('stage');
            const stageLabel = (newRow.status_stage as CommissionStage).replace('_', ' ').toUpperCase();
            showToastRef.current(`Order status updated: ${stageLabel}`);
            showSystemNotification('Commission Stage Updated', {
              body: `Your commission is now in ${stageLabel}. Check your order tracker!`,
              tag: `stage-${newRow.id}`,
              targetHash: '#track',
            });
          }

          if (newRow.deposit_paid && (!oldRow || !oldRow.deposit_paid)) {
            playNotificationSound('success');
            showToastRef.current('Upfront deposit verified! Sketching is underway.');
          }

          if (newRow.final_paid && (!oldRow || !oldRow.final_paid)) {
            playNotificationSound('success');
            showToastRef.current('Final payment verified! High-res master deliverable unlocked.');
          }
        },
      )
      // 3. Realtime WIPs & Deliverables
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'wip_uploads',
          filter: `commission_id=eq.${commissionId}`,
        },
        (payload: any) => {
          const newWip = payload.new;
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.commissions });
          playNotificationSound('stage');
          showToastRef.current(`Meru uploaded new artwork: "${newWip.title}"`);
          showSystemNotification('New Artwork WIP Posted!', {
            body: `Meru posted "${newWip.title}". Check your tracker!`,
            tag: `wip-${newWip.id}`,
            targetHash: '#track',
          });
        },
      )
      // 4. Realtime Payments
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'payments',
          filter: `commission_id=eq.${commissionId}`,
        },
        (payload: any) => {
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.payments(commissionId) });
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.commissions });

          if (payload.new.status === 'verified') {
            playNotificationSound('success');
            showToastRef.current('Receipt verified by Meru Art Studio.');
          }
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current && supabase) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [commissionId, currentUserId, queryClient]);
}

/**
 * Realtime subscription hook for the Artist Admin control surface.
 * Subscribes to all incoming commission submissions, payment receipt uploads, and client chat messages.
 */
export function useAdminRealtime(isArtistAdmin: boolean, currentUserId: string | null | undefined) {
  const queryClient = useQueryClient();
  const { showToast } = useStudio();
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;
  const channelRef = useRef<any>(null);

  useEffect(() => {
    if (!supabase || !isArtistAdmin) return;

    const channelName = 'artist-admin-realtime';
    const channel = supabase.channel(channelName);

    channel
      // 1. Incoming new brief submissions
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'commissions',
        },
        (payload: any) => {
          const newOrder = payload.new;
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.adminCommissions });
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.publicStudioData });
          playNotificationSound('stage');
          showToastRef.current(`New Commission Brief submitted by @${newOrder.client_handle || 'client'}!`);
          showSystemNotification('New Commission Brief Received!', {
            body: `@${newOrder.client_handle} requested a ${newOrder.tier} commission.`,
            tag: `new-brief-${newOrder.id}`,
            targetHash: '#admin',
          });
        },
      )
      // 1B. Commission updates (stage, pricing, or media changes)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'commissions',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.adminCommissions });
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.publicStudioData });
        },
      )
      // 2. Client chat message
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        (payload: any) => {
          const newMsg = payload.new;
          if (newMsg.sender_role === 'client' && newMsg.sender_id !== currentUserId) {
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.adminCommissions });
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.unreadMessageCounts });
            playNotificationSound('message');
            showToastRef.current(`Client Message: "${newMsg.body.slice(0, 50)}${newMsg.body.length > 50 ? '...' : ''}"`);
            showSystemNotification('New Client Message', {
              body: newMsg.body,
              tag: `msg-${newMsg.id}`,
              targetHash: '#admin',
            });
          }
        },
      )
      // 3. Client uploaded payment receipt
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'payments',
        },
        (payload: any) => {
          const newPayment = payload.new;
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.adminCommissions });
          playNotificationSound('stage');
          showToastRef.current(`New ${newPayment.kind} payment receipt uploaded for verification.`);
          showSystemNotification('New Payment Receipt Uploaded', {
            body: `Client submitted a ${newPayment.kind} payment receipt.`,
            tag: `receipt-${newPayment.id}`,
            targetHash: '#admin',
          });
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current && supabase) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [isArtistAdmin, currentUserId, queryClient]);
}

/**
 * Realtime subscription hook for public studio_settings singleton.
 * Synchronizes availability status, max slots, rates, and blocked dates across all connected tabs/clients.
 */
export function useStudioSettingsRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!supabase) return;

    const channel = supabase
      .channel('public-studio-settings')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'studio_settings',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.publicStudioData });
        },
      )
      .subscribe();

    return () => {
      if (supabase) {
        supabase.removeChannel(channel);
      }
    };
  }, [queryClient]);
}
