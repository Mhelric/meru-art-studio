import { supabase } from '@/lib/supabase';

export interface OrderNotificationEvent {
  event_type: 'brief_submitted' | 'stage_updated' | 'wip_posted' | 'payment_verified' | 'message_sent';
  commission_id: string;
  order_code?: string;
  client_handle?: string;
  tier?: string;
  total_price?: number;
  currency?: string;
  character_name?: string;
  title?: string;
  is_final?: boolean;
  old_stage?: string;
  new_stage?: string;
  amount?: number;
  kind?: string;
  message_body?: string;
  client_email?: string;
}

/** Check or request browser desktop notification permissions. */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return Notification.permission;
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

/** Show a native desktop notification if user has granted permission and tab is not focused. */
export function showSystemNotification(title: string, options?: NotificationOptions): void {
  if (
    typeof window === 'undefined' ||
    !('Notification' in window) ||
    Notification.permission !== 'granted'
  ) {
    return;
  }

  try {
    const notif = new Notification(title, {
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      ...options,
    });

    notif.onclick = () => {
      window.focus();
      if (!window.location.hash.includes('track')) {
        window.location.hash = '#track';
      }
      notif.close();
    };
  } catch (err) {
    console.debug('Failed to display system notification:', err);
  }
}

/**
 * Dispatch an order notification to the Supabase Edge Function `order-notification`.
 * This notifies external channels (Discord Webhook / Resend Email).
 */
export async function dispatchOrderNotification(
  event: OrderNotificationEvent,
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Supabase not configured' };

  try {
    const { data, error } = await supabase.functions.invoke('order-notification', {
      body: event,
    });

    if (error) {
      console.warn('Edge function notification dispatch warning:', error.message);
      return { success: false, error: error.message };
    }

    return { success: true, ...data };
  } catch (err: any) {
    console.debug('Notification dispatch failed:', err?.message);
    return { success: false, error: err?.message };
  }
}
