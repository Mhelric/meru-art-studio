# Phase 6D: Realtime Channels, Edge Function Notifications & Audio Chime Alerts

## Overview
This review packet contains the complete implementation for **Phase 6D** of the Meru Art Studio senior engineering audit.

It directly resolves the **P0 / P1** gaps identified in the system audit:
1. **P0: Realtime Advertising vs. Reality:**
   - Previously, orders, messages, WIPs, and stage changes required manual browser refresh or periodic polling.
   - Realtime broadcasting is now enabled across `commissions`, `messages`, `wip_uploads`, and `payments` via `supabase_realtime` publication in PostgreSQL.
   - Added `replica identity full` across all tables so update/delete payloads contain complete record snapshots.
   - Built custom React hook [`src/lib/realtime.ts`](file:///c:/Users/mhelric/OneDrive/Desktop/meru-art-studio/src/lib/realtime.ts) (`useCommissionRealtime` and `useAdminRealtime`) with strict WebSocket channel lifecycle management (`supabase.removeChannel()` on unmount or order change).
   - Removed fake auto-reply bot from real Supabase commissions; automated mock responses are strictly quarantined to `?demo=1` / offline showcase orders.
2. **P1: Notification Engine (Discord Webhooks & Resend Emails):**
   - Created PostgreSQL audit table `public.notification_logs` with strict Row-Level Security (`public.is_artist_admin()` and `public.can_access_commission()`).
   - Added database trigger `enqueue_commission_notification()` listening for:
     - `brief_submitted`: Artist alert on new brief submission.
     - `stage_updated`: Client alert on stage change.
     - `wip_posted`: Client alert on new WIP preview or final master.
     - `payment_verified`: Client alert on deposit/balance verification.
   - Created Supabase Edge Function [`supabase/functions/order-notification/index.ts`](file:///c:/Users/mhelric/OneDrive/Desktop/meru-art-studio/supabase/functions/order-notification/index.ts) that formats color-coded Discord webhook embeds and dispatches emails via Resend.
3. **P1: In-App Acoustic Feedback & Native OS Notifications:**
   - Built Web Audio API synthesizer [`src/lib/audio.ts`](file:///c:/Users/mhelric/OneDrive/Desktop/meru-art-studio/src/lib/audio.ts) providing gentle acoustic chimes (`message`, `stage`, `success`) without loading external audio assets, respecting browser autoplay policies and local mute toggles.
   - Added native browser desktop notifications [`src/lib/notifications.ts`](file:///c:/Users/mhelric/OneDrive/Desktop/meru-art-studio/src/lib/notifications.ts) with one-click permission requests, alerting clients when their browser tab is minimized or in the background.

---

## 1. Database Migration (`supabase/migrations/20261101000002_phase_6d_realtime_and_notifications.sql`)

```sql
-- ============================================================================
-- Meru Art Studio — Phase 6D Realtime Publication & Notification Pipeline
-- Addresses:
--   1. Realtime replication setup for core workflow tables
--   2. Replica identity configuration for full event payloads
--   3. Notification audit logs table (public.notification_logs) with strict RLS
--   4. Server-side notification enqueue triggers for briefs, stages, WIPs, & payments
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Idempotently Enable Realtime for Workflow Tables
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'commissions'
  ) then
    alter publication supabase_realtime add table public.commissions;
  end if;

  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;

  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'wip_uploads'
  ) then
    alter publication supabase_realtime add table public.wip_uploads;
  end if;

  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'payments'
  ) then
    alter publication supabase_realtime add table public.payments;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 2. Ensure Full Replica Identity for Complete Old/New Row Change Payloads
-- ----------------------------------------------------------------------------
alter table public.commissions replica identity full;
alter table public.messages replica identity full;
alter table public.wip_uploads replica identity full;
alter table public.payments replica identity full;

-- ----------------------------------------------------------------------------
-- 3. Create Notification Logs Table
-- ----------------------------------------------------------------------------
create table if not exists public.notification_logs (
  id uuid primary key default gen_random_uuid(),
  commission_id uuid references public.commissions(id) on delete cascade,
  event_type text not null, -- 'brief_submitted', 'stage_updated', 'wip_posted', 'payment_verified', 'message_sent'
  recipient_role text not null, -- 'client', 'artist'
  channel text not null default 'discord_webhook', -- 'discord_webhook', 'email', 'in_app'
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending', -- 'pending', 'delivered', 'failed'
  error_message text,
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);

alter table public.notification_logs enable row level security;

-- Only Artist Admin can manage or inspect all notification logs
drop policy if exists "notification_logs_artist_admin" on public.notification_logs;
create policy "notification_logs_artist_admin"
  on public.notification_logs for all
  to authenticated
  using (public.is_artist_admin())
  with check (public.is_artist_admin());

-- Clients can only inspect notifications generated for their own commissions
drop policy if exists "notification_logs_client_select" on public.notification_logs;
create policy "notification_logs_client_select"
  on public.notification_logs for select
  to authenticated
  using (
    commission_id is not null
    and public.can_access_commission(commission_id)
  );

-- ----------------------------------------------------------------------------
-- 4. Server-Side Trigger: Enqueue Notifications on Workflow Milestones
-- ----------------------------------------------------------------------------
create or replace function public.enqueue_commission_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Case A: New Brief Submitted (Notify Artist)
  if tg_op = 'INSERT' and tg_table_name = 'commissions' then
    insert into public.notification_logs (
      commission_id,
      event_type,
      recipient_role,
      channel,
      payload
    ) values (
      new.id,
      'brief_submitted',
      'artist',
      'discord_webhook',
      jsonb_build_object(
        'commission_id', new.id,
        'order_code', new.order_code,
        'client_handle', new.client_handle,
        'tier', new.tier,
        'total_price', new.total_price,
        'currency', new.currency,
        'character_name', new.character_name
      )
    );
    return new;
  end if;

  -- Case B: Stage Updated (Notify Client)
  if tg_op = 'UPDATE' and tg_table_name = 'commissions' then
    if old.status_stage is distinct from new.status_stage then
      insert into public.notification_logs (
        commission_id,
        event_type,
        recipient_role,
        channel,
        payload
      ) values (
        new.id,
        'stage_updated',
        'client',
        'in_app',
        jsonb_build_object(
          'commission_id', new.id,
          'order_code', new.order_code,
          'old_stage', old.status_stage,
          'new_stage', new.status_stage,
          'progress', new.progress
        )
      );
    end if;
    return new;
  end if;

  -- Case C: New WIP Uploaded (Notify Client)
  if tg_op = 'INSERT' and tg_table_name = 'wip_uploads' then
    insert into public.notification_logs (
      commission_id,
      event_type,
      recipient_role,
      channel,
      payload
    ) values (
      new.commission_id,
      'wip_posted',
      'client',
      'in_app',
      jsonb_build_object(
        'commission_id', new.commission_id,
        'wip_id', new.id,
        'title', new.title,
        'is_final', new.is_final,
        'stage', new.stage
      )
    );
    return new;
  end if;

  -- Case D: Payment Verified (Notify Client)
  if tg_op = 'UPDATE' and tg_table_name = 'payments' then
    if new.status = 'verified' and (old.status is distinct from 'verified') then
      insert into public.notification_logs (
        commission_id,
        event_type,
        recipient_role,
        channel,
        payload
      ) values (
        new.commission_id,
        'payment_verified',
        'client',
        'in_app',
        jsonb_build_object(
          'commission_id', new.commission_id,
          'payment_id', new.id,
          'kind', new.kind,
          'amount', new.amount,
          'currency', new.currency
        )
      );
    end if;
    return new;
  end if;

  return null;
end;
$$;

-- Drop and recreate triggers
drop trigger if exists trg_notify_new_commission on public.commissions;
create trigger trg_notify_new_commission
  after insert on public.commissions
  for each row
  execute function public.enqueue_commission_notification();

drop trigger if exists trg_notify_stage_update on public.commissions;
create trigger trg_notify_stage_update
  after update of status_stage on public.commissions
  for each row
  execute function public.enqueue_commission_notification();

drop trigger if exists trg_notify_wip_upload on public.wip_uploads;
create trigger trg_notify_wip_upload
  after insert on public.wip_uploads
  for each row
  execute function public.enqueue_commission_notification();

drop trigger if exists trg_notify_payment_verified on public.payments;
create trigger trg_notify_payment_verified
  after update of status on public.payments
  for each row
  execute function public.enqueue_commission_notification();
```

---

## 2. Supabase Edge Function (`supabase/functions/order-notification/index.ts`)

```ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

interface NotificationPayload {
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

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function formatDiscordEmbed(payload: NotificationPayload) {
  const code = payload.order_code || payload.commission_id.slice(0, 8).toUpperCase();
  const timestamp = new Date().toISOString();

  switch (payload.event_type) {
    case 'brief_submitted':
      return {
        title: `🎨 New Commission Brief Received: #${code}`,
        description: `**Client:** @${payload.client_handle || 'Client'}\n**Tier:** ${payload.tier}\n**Character:** ${payload.character_name || 'N/A'}\n**Total:** $${payload.total_price} ${payload.currency || 'USD'}`,
        color: 0xf59e0b, // Mustard
        url: 'https://meruart.studio/#admin',
        fields: [
          { name: 'Status', value: 'Pending Review', inline: true },
          { name: 'Order Code', value: `#${code}`, inline: true },
        ],
        footer: { text: 'Meru Art Studio Notification Engine' },
        timestamp,
      };

    case 'stage_updated':
      return {
        title: `🚀 Order #${code} Advanced to ${payload.new_stage?.toUpperCase()}`,
        description: `Commission stage changed from **${payload.old_stage}** to **${payload.new_stage}**.`,
        color: 0xa78bfa, // Lavender
        url: `https://meruart.studio/#track`,
        fields: [
          { name: 'New Stage', value: payload.new_stage || 'Updated', inline: true },
          { name: 'Order Code', value: `#${code}`, inline: true },
        ],
        footer: { text: 'Meru Art Studio Notification Engine' },
        timestamp,
      };

    case 'wip_posted':
      return {
        title: `✨ New ${payload.is_final ? 'Final Master' : 'WIP'} Posted: #${code}`,
        description: `**Title:** ${payload.title || 'Work in progress'}\nCheck the Pizza-Tracker gallery to inspect the updated progress.`,
        color: 0xf05d5e, // Coral
        url: `https://meruart.studio/#track`,
        fields: [
          { name: 'Type', value: payload.is_final ? 'Final Deliverable (Completed)' : 'WIP Preview', inline: true },
          { name: 'Order Code', value: `#${code}`, inline: true },
        ],
        footer: { text: 'Meru Art Studio Notification Engine' },
        timestamp,
      };

    case 'payment_verified':
      return {
        title: `💰 Payment Verified for #${code}`,
        description: `**${payload.kind === 'deposit' ? '50% Upfront Deposit' : 'Remaining Balance'}** payment of **$${payload.amount} ${payload.currency || 'USD'}** has been confirmed by Meru.`,
        color: 0x10b981, // Teal
        url: `https://meruart.studio/#track`,
        fields: [
          { name: 'Payment Kind', value: payload.kind || 'Payment', inline: true },
          { name: 'Verified Status', value: 'Confirmed ✅', inline: true },
        ],
        footer: { text: 'Meru Art Studio Notification Engine' },
        timestamp,
      };

    case 'message_sent':
      return {
        title: `💬 New Message on #${code}`,
        description: `"${payload.message_body?.slice(0, 200) || 'New message'}"`,
        color: 0x60a5fa, // Blue
        url: `https://meruart.studio/#track`,
        footer: { text: 'Meru Art Studio Notification Engine' },
        timestamp,
      };

    default:
      return {
        title: `Meru Art Studio Notification: #${code}`,
        description: `Event: ${payload.event_type}`,
        color: 0x71717a,
        timestamp,
      };
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const payload = (await req.json()) as NotificationPayload;
    const discordWebhookUrl = Deno.env.get('DISCORD_WEBHOOK_URL');
    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    let discordDelivered = false;
    let emailDelivered = false;

    // 1. Dispatch Discord Webhook if configured
    if (discordWebhookUrl) {
      const embed = formatDiscordEmbed(payload);
      const discordRes = await fetch(discordWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'Meru Art Studio',
          avatar_url: 'https://meruart.studio/favicon.ico',
          embeds: [embed],
        }),
      });

      discordDelivered = discordRes.ok;
      if (!discordRes.ok) {
        console.error('Discord webhook dispatch failed:', await discordRes.text());
      }
    } else {
      console.log('DISCORD_WEBHOOK_URL not configured. Formatted embed:', formatDiscordEmbed(payload));
    }

    // 2. Dispatch Email via Resend if configured and recipient email provided
    if (resendApiKey && payload.client_email) {
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Meru Art Studio <notifications@meruart.studio>',
          to: payload.client_email,
          subject: `Update on your commission #${payload.order_code || ''}: ${payload.event_type.replace('_', ' ')}`,
          html: `<p>Hello!</p><p>There is a new update on your Meru Art Studio commission (#${payload.order_code}):</p><p><strong>Event:</strong> ${payload.event_type}</p><p><a href="https://meruart.studio/#track">View your order tracker here</a></p>`,
        }),
      });

      emailDelivered = emailRes.ok;
      if (!emailRes.ok) {
        console.error('Resend email dispatch failed:', await emailRes.text());
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        delivered: {
          discord: discordDelivered,
          email: emailDelivered,
        },
      }),
      {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        status: 200,
      },
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message ?? 'Internal server error' }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
```

---

## 3. Realtime Channels Hook (`src/lib/realtime.ts`)

```ts
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
            showToast(`🎨 Meru Art: "${newMsg.body.slice(0, 60)}${newMsg.body.length > 60 ? '...' : ''}"`);
            showSystemNotification('New Message from Meru Art', {
              body: newMsg.body,
              tag: `msg-${newMsg.id}`,
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
            showToast(`🚀 Order status updated: ${stageLabel}`);
            showSystemNotification('Commission Stage Updated', {
              body: `Your commission is now in ${stageLabel}. Check your order tracker!`,
              tag: `stage-${newRow.id}`,
            });
          }

          if (newRow.deposit_paid && (!oldRow || !oldRow.deposit_paid)) {
            playNotificationSound('success');
            showToast('💰 Upfront deposit verified! Sketching is underway.');
          }

          if (newRow.final_paid && (!oldRow || !oldRow.final_paid)) {
            playNotificationSound('success');
            showToast('✨ Final payment verified! High-res master deliverable unlocked.');
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
          showToast(`🎨 Meru uploaded new artwork: "${newWip.title}"`);
          showSystemNotification('New Artwork WIP Posted!', {
            body: `Meru posted "${newWip.title}". Check your tracker!`,
            tag: `wip-${newWip.id}`,
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
            showToast('Receipt verified by Meru Art Studio.');
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
  }, [commissionId, currentUserId, queryClient, showToast]);
}

/**
 * Realtime subscription hook for the Artist Admin control surface.
 * Subscribes to all incoming commission submissions, payment receipt uploads, and client chat messages.
 */
export function useAdminRealtime(isArtistAdmin: boolean, currentUserId: string | null | undefined) {
  const queryClient = useQueryClient();
  const { showToast } = useStudio();
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
          showToast(`🔔 New Commission Brief submitted by @${newOrder.client_handle || 'client'}!`);
          showSystemNotification('New Commission Brief Received!', {
            body: `@${newOrder.client_handle} requested a ${newOrder.tier} commission.`,
            tag: `new-brief-${newOrder.id}`,
          });
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
            playNotificationSound('message');
            showToast(`💬 Client Message: "${newMsg.body.slice(0, 50)}${newMsg.body.length > 50 ? '...' : ''}"`);
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
          showToast(`🧾 New ${newPayment.kind} payment receipt uploaded for verification!`);
          showSystemNotification('New Payment Receipt Uploaded', {
            body: `Client submitted a ${newPayment.kind} payment receipt.`,
            tag: `receipt-${newPayment.id}`,
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
  }, [isArtistAdmin, currentUserId, queryClient, showToast]);
}
```

---

## 4. Web Audio Chime Synthesizer (`src/lib/audio.ts`)

```ts
let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function isAudioNotificationEnabled(): boolean {
  try {
    return localStorage.getItem('meru_sound_enabled') !== 'false';
  } catch {
    return true;
  }
}

export function setAudioNotificationEnabled(enabled: boolean): void {
  try {
    localStorage.setItem('meru_sound_enabled', enabled ? 'true' : 'false');
  } catch {}
}

export function playNotificationSound(type: 'message' | 'stage' | 'success' = 'message'): void {
  if (!isAudioNotificationEnabled()) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;

    if (type === 'message') {
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'sine';

      osc1.frequency.setValueAtTime(880, now);
      osc2.frequency.setValueAtTime(1320, now + 0.06);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.12, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc1.stop(now + 0.22);
      osc2.start(now + 0.06);
      osc2.stop(now + 0.22);
    } else if (type === 'stage') {
      const notes = [523.25, 659.25, 783.99];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = now + i * 0.08;

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, start);

        gain.gain.setValueAtTime(0.001, start);
        gain.gain.linearRampToValueAtTime(0.14, start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.28);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(start);
        osc.stop(start + 0.28);
      });
    } else if (type === 'success') {
      const osc = ctx.createOscillator();
      const oscHarmonic = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      oscHarmonic.type = 'sine';

      osc.frequency.setValueAtTime(1046.5, now);
      oscHarmonic.frequency.setValueAtTime(1318.5, now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.15, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(gain);
      oscHarmonic.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.35);
      oscHarmonic.start(now);
      oscHarmonic.stop(now + 0.35);
    }
  } catch (err) {
    console.debug('Failed to play synthetic chime:', err);
  }
}
```

---

## 5. Desktop Notifications & Webhook Dispatcher (`src/lib/notifications.ts`)

```ts
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
```

---

## 6. Verification
- `npm run build` (`tsc && vite build`) executes cleanly with zero TypeScript errors and zero warnings.
- Realtime channels automatically attach and detach cleanly on mount/unmount and order switching without memory leaks.
- Database triggers and publication setup are fully idempotent.
- Synthetic Web Audio chimes provide acoustic feedback without external asset dependencies.
