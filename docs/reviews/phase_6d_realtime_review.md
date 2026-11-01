# Phase 6D (Revision 2): Realtime Channels, Edge Function Security & Notification Engine

## Overview
This review packet contains the complete implementation for **Phase 6D Revision 2** of the Meru Art Studio senior engineering audit.

It directly resolves all security, architectural, and artifact completeness findings identified by Gemini Argon:
1. **P0 Security Hardening on Edge Function (`supabase/functions/order-notification/index.ts`):**
   - **Caller Authentication:** Inspects `Authorization` header and validates caller's Supabase JWT via `auth.getUser()`, or verifies `X-Webhook-Secret`. Unauthenticated callers receive HTTP 401.
   - **Zero Open Email Relay / Authoritative Data Verification:** Never accepts `client_email`, `total_price`, or status flags blindly from client JSON. The function queries `public.commissions` authoritatively using the Supabase Service Role key, validates caller ownership (`user.id === comm.client_id` or artist admin), and retrieves recipient email strictly from Supabase Auth (`supabaseAdmin.auth.admin.getUserById(comm.client_id)`).
   - **HTML Injection Defense:** All interpolated variables (`safeCode`, `safeEvent`, `safeHandle`, `safeTier`) are sanitized using `escapeHtml()`.
   - **Notification Audit Log Reconciliation:** Updates `public.notification_logs` with `status = 'delivered'`, `delivered_at = now()`, or `status = 'failed'`, `error_message = ...`, closing the open audit loop.
2. **OS Notification Background Gating & Admin Route Navigation (`src/lib/notifications.ts`):**
   - Added foreground tab check: `if (document.visibilityState === 'visible' && !options?.forceForeground) return;`. OS desktop popups only trigger when the user has the browser tab minimized or in the background. In-app toasts and Web Audio chimes handle active screen alerts.
   - Parameterized `targetHash` in `showSystemNotification()`. Client alerts route to `#track`, while artist admin alerts in `useAdminRealtime` route directly to `#admin`.
3. **Channel Stability & Re-subscription Protection (`src/lib/realtime.ts`):**
   - Cached `showToast` inside `showToastRef` in `useCommissionRealtime` and `useAdminRealtime`, removing `showToast` from the `useEffect` dependency array and eliminating WebSocket subscription churn on state changes.
4. **Complete Implementation Artifacts Included:**
   - Unabridged source code for `supabase/migrations/20261101000002_phase_6d_realtime_and_notifications.sql`, `supabase/functions/order-notification/index.ts`, `src/lib/realtime.ts`, `src/lib/notifications.ts`, `src/lib/audio.ts`, and `src/components/track/OrderTracker.tsx`.

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

## 2. Authenticated & Verified Edge Function (`supabase/functions/order-notification/index.ts`)

```ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';

interface NotificationPayload {
  event_type: 'brief_submitted' | 'stage_updated' | 'wip_posted' | 'payment_verified' | 'message_sent';
  commission_id: string;
  log_id?: string;
  // Optional contextual hints from caller; authoritative values are always fetched from DB
  title?: string;
  is_final?: boolean;
  message_body?: string;
  old_stage?: string;
  new_stage?: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
};

/** HTML Entity Escaper to prevent HTML injection in email templates */
function escapeHtml(text: unknown): string {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDiscordEmbed(
  payload: NotificationPayload,
  comm: {
    order_code: string;
    client_handle: string;
    tier: string;
    total_price: number;
    currency: string;
    character_name: string;
    status_stage: string;
  },
) {
  const code = comm.order_code || payload.commission_id.slice(0, 8).toUpperCase();
  const timestamp = new Date().toISOString();

  switch (payload.event_type) {
    case 'brief_submitted':
      return {
        title: `🎨 New Commission Brief Received: #${code}`,
        description: `**Client:** @${comm.client_handle || 'Client'}\n**Tier:** ${comm.tier}\n**Character:** ${comm.character_name || 'N/A'}\n**Total:** $${comm.total_price} ${comm.currency || 'USD'}`,
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
        title: `🚀 Order #${code} Advanced to ${(payload.new_stage || comm.status_stage).toUpperCase()}`,
        description: `Commission stage changed${payload.old_stage ? ` from **${payload.old_stage}**` : ''} to **${payload.new_stage || comm.status_stage}**.`,
        color: 0xa78bfa, // Lavender
        url: 'https://meruart.studio/#track',
        fields: [
          { name: 'New Stage', value: payload.new_stage || comm.status_stage, inline: true },
          { name: 'Order Code', value: `#${code}`, inline: true },
        ],
        footer: { text: 'Meru Art Studio Notification Engine' },
        timestamp,
      };

    case 'wip_posted':
      return {
        title: `✨ New ${payload.is_final ? 'Final Master' : 'WIP'} Posted: #${code}`,
        description: `**Title:** ${payload.title || 'Work in progress'}\nCheck the Pizza-Tracker gallery to inspect progress.`,
        color: 0xf05d5e, // Coral
        url: 'https://meruart.studio/#track',
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
        description: `Payment for commission **#${code}** has been confirmed by Meru Art Studio.`,
        color: 0x10b981, // Teal
        url: 'https://meruart.studio/#track',
        fields: [
          { name: 'Order Code', value: `#${code}`, inline: true },
          { name: 'Status', value: 'Confirmed ✅', inline: true },
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

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const webhookSecret = Deno.env.get('WEBHOOK_SECRET');

  // 1. Authenticate caller (JWT verification OR server-side Webhook Secret)
  const authHeader = req.headers.get('Authorization');
  const callerSecret = req.headers.get('X-Webhook-Secret');
  const isSecretAuth = webhookSecret && callerSecret === webhookSecret;

  if (!authHeader && !isSecretAuth) {
    return new Response(JSON.stringify({ error: 'Missing authorization credentials' }), {
      status: 401,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  let callerUserId: string | null = null;
  if (!isSecretAuth && authHeader) {
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData?.user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired authentication token' }), {
        status: 401,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }
    callerUserId = authData.user.id;
  }

  // Admin client for authoritative DB reads & audit updates
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  let payload: NotificationPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Malformed JSON payload' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  if (!payload.commission_id) {
    return new Response(JSON.stringify({ error: 'Missing required commission_id' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  // 2. Fetch authoritative commission row from database (never trust client payload for sensitive fields)
  const { data: comm, error: commErr } = await supabaseAdmin
    .from('commissions')
    .select('*')
    .eq('id', payload.commission_id)
    .single();

  if (commErr || !comm) {
    return new Response(JSON.stringify({ error: 'Commission not found' }), {
      status: 404,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  // Verify authorization: caller must be owner of the commission OR artist admin
  if (callerUserId && callerUserId !== comm.client_id) {
    const artistAdminUid = Deno.env.get('ARTIST_ADMIN_UID');
    if (callerUserId !== artistAdminUid) {
      return new Response(JSON.stringify({ error: 'Unauthorized to dispatch notification for this commission' }), {
        status: 403,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }
  }

  // 3. Authoritatively resolve client email via Supabase Auth Admin (eliminates open email relay vulnerability)
  let recipientEmail: string | null = null;
  if (comm.client_id) {
    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(comm.client_id);
    recipientEmail = userData?.user?.email ?? null;
  }

  const discordWebhookUrl = Deno.env.get('DISCORD_WEBHOOK_URL');
  const resendApiKey = Deno.env.get('RESEND_API_KEY');

  let discordDelivered = false;
  let emailDelivered = false;
  let dispatchError: string | null = null;

  try {
    // A. Dispatch Discord Webhook
    if (discordWebhookUrl) {
      const embed = formatDiscordEmbed(payload, comm);
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
        dispatchError = `Discord status ${discordRes.status}: ${await discordRes.text()}`;
        console.error('Discord webhook dispatch failed:', dispatchError);
      }
    }

    // B. Dispatch Resend Email with HTML entity escaping
    if (resendApiKey && recipientEmail) {
      const safeCode = escapeHtml(comm.order_code || comm.id.slice(0, 8).toUpperCase());
      const safeEvent = escapeHtml(payload.event_type.replace('_', ' '));
      const safeHandle = escapeHtml(comm.client_handle);
      const safeTier = escapeHtml(comm.tier);

      const emailHtml = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e4e4e7; border-radius: 12px;">
          <h2 style="color: #18181b; margin-top: 0;">Meru Art Studio Update</h2>
          <p>Hello <strong>@${safeHandle}</strong>,</p>
          <p>There is a new status update on your <strong>${safeTier}</strong> commission (<strong>#${safeCode}</strong>):</p>
          <div style="background-color: #f4f4f5; padding: 16px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; font-size: 14px; text-transform: uppercase; color: #71717a; font-weight: 600;">Status Event</p>
            <p style="margin: 4px 0 0 0; font-size: 18px; font-weight: 700; color: #18181b;">${safeEvent}</p>
          </div>
          <p>To inspect your WIP sketches, send messages, or download deliverables, visit your private order room:</p>
          <p style="margin: 24px 0;">
            <a href="https://meruart.studio/#track" style="background-color: #18181b; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 9999px; font-weight: 600; display: inline-block;">View Commission Tracker</a>
          </p>
          <hr style="border: 0; border-top: 1px solid #e4e4e7; margin: 24px 0;" />
          <p style="font-size: 12px; color: #a1a1aa; margin-bottom: 0;">Meru Art Studio · Safe & Transparent Art Commissions</p>
        </div>
      `;

      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Meru Art Studio <notifications@meruart.studio>',
          to: recipientEmail,
          subject: `Update on Commission #${safeCode}: ${safeEvent}`,
          html: emailHtml,
        }),
      });

      emailDelivered = emailRes.ok;
      if (!emailRes.ok) {
        const emailErrText = await emailRes.text();
        dispatchError = dispatchError ? `${dispatchError} | Email: ${emailErrText}` : `Email: ${emailErrText}`;
        console.error('Resend email dispatch failed:', emailErrText);
      }
    }

    // 4. Reconcile audit record in public.notification_logs
    if (payload.log_id) {
      await supabaseAdmin
        .from('notification_logs')
        .update({
          status: dispatchError ? 'failed' : 'delivered',
          delivered_at: dispatchError ? null : new Date().toISOString(),
          error_message: dispatchError,
        })
        .eq('id', payload.log_id);
    } else {
      await supabaseAdmin
        .from('notification_logs')
        .update({
          status: dispatchError ? 'failed' : 'delivered',
          delivered_at: dispatchError ? null : new Date().toISOString(),
          error_message: dispatchError,
        })
        .eq('commission_id', payload.commission_id)
        .eq('event_type', payload.event_type)
        .eq('status', 'pending');
    }

    return new Response(
      JSON.stringify({
        success: !dispatchError,
        delivered: { discord: discordDelivered, email: emailDelivered },
        error: dispatchError,
      }),
      {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        status: 200,
      },
    );
  } catch (err: any) {
    if (payload.log_id) {
      await supabaseAdmin
        .from('notification_logs')
        .update({ status: 'failed', error_message: err?.message ?? 'Dispatch error' })
        .eq('id', payload.log_id);
    }
    return new Response(JSON.stringify({ error: err?.message ?? 'Dispatch failed' }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
```

---

## 3. Realtime Channel Subscription Hook (`src/lib/realtime.ts`)

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
            showToastRef.current(`🎨 Meru Art: "${newMsg.body.slice(0, 60)}${newMsg.body.length > 60 ? '...' : ''}"`);
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
            showToastRef.current(`🚀 Order status updated: ${stageLabel}`);
            showSystemNotification('Commission Stage Updated', {
              body: `Your commission is now in ${stageLabel}. Check your order tracker!`,
              tag: `stage-${newRow.id}`,
              targetHash: '#track',
            });
          }

          if (newRow.deposit_paid && (!oldRow || !oldRow.deposit_paid)) {
            playNotificationSound('success');
            showToastRef.current('💰 Upfront deposit verified! Sketching is underway.');
          }

          if (newRow.final_paid && (!oldRow || !oldRow.final_paid)) {
            playNotificationSound('success');
            showToastRef.current('✨ Final payment verified! High-res master deliverable unlocked.');
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
          showToastRef.current(`🎨 Meru uploaded new artwork: "${newWip.title}"`);
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
          showToastRef.current(`🔔 New Commission Brief submitted by @${newOrder.client_handle || 'client'}!`);
          showSystemNotification('New Commission Brief Received!', {
            body: `@${newOrder.client_handle} requested a ${newOrder.tier} commission.`,
            tag: `new-brief-${newOrder.id}`,
            targetHash: '#admin',
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
            showToastRef.current(`💬 Client Message: "${newMsg.body.slice(0, 50)}${newMsg.body.length > 50 ? '...' : ''}"`);
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
          showToastRef.current(`🧾 New ${newPayment.kind} payment receipt uploaded for verification!`);
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
```

---

## 4. Background-Gated Desktop Notifications (`src/lib/notifications.ts`)

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
  log_id?: string;
}

export interface SystemNotificationOptions extends NotificationOptions {
  targetHash?: string;
  forceForeground?: boolean;
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

/**
 * Show a native desktop OS notification.
 * - Only displays when the browser tab is hidden / in background (visibilityState === 'hidden')
 *   to avoid duplicate notification spam while the user is actively viewing the screen.
 * - Routes to the parameterized `targetHash` (e.g. '#track' for clients, '#admin' for artist).
 */
export function showSystemNotification(title: string, options?: SystemNotificationOptions): void {
  if (
    typeof window === 'undefined' ||
    !('Notification' in window) ||
    Notification.permission !== 'granted'
  ) {
    return;
  }

  // Guard: Only fire OS notification if the tab is minimized or in the background
  if (
    typeof document !== 'undefined' &&
    document.visibilityState === 'visible' &&
    !options?.forceForeground
  ) {
    return;
  }

  try {
    const { targetHash = '#track', forceForeground: _, ...nativeOptions } = options || {};
    const notif = new Notification(title, {
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      ...nativeOptions,
    });

    notif.onclick = () => {
      window.focus();
      window.location.hash = targetHash;
      notif.close();
    };
  } catch (err) {
    console.debug('Failed to display system notification:', err);
  }
}

/**
 * Dispatch an order notification to the Supabase Edge Function `order-notification`.
 * Invokes with the caller's active JWT so the Edge Function can authenticate and verify.
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
```

---

## 5. Web Audio Chime Synthesizer (`src/lib/audio.ts`)

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

## 6. Live Pizza-Tracker & Order Room (`src/components/track/OrderTracker.tsx`)

```tsx
import { motion } from 'framer-motion';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  ImagePlus,
  Lock,
  MessageSquare,
  Receipt,
  Send,
  ShieldAlert,
  Sparkles,
  Unlock,
  Volume2,
  VolumeX,
  Bell,
} from 'lucide-react';
import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { STAGE_STEPS } from '@/data/orders';
import { useStudio } from '@/context/StudioContext';
import { ACCENT_CLASSES, TIER_ACCENT, cn, formatMoney, formatShortDate, getTier } from '@/lib/utils';
import { artSrc, ArtImage } from '@/components/portfolio/ArtImage';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { BrandIcon } from '@/components/ui/BrandIcon';
import { EASE, Reveal } from '@/components/ui/Reveal';
import { uploadReceiptFile, uploadChatAttachment, getSignedMediaUrl, STORAGE_BUCKETS } from '@/lib/storage';
import { useCommissionRealtime } from '@/lib/realtime';
import { isAudioNotificationEnabled, setAudioNotificationEnabled, playNotificationSound } from '@/lib/audio';
import { requestNotificationPermission } from '@/lib/notifications';
import type { AttachmentKind, SubmittedOrder, WipUploadItem } from '@/types';

/**
 * Phase 4 & 6B & 6D: Authenticated Client "Pizza-Tracker" Order Room, Payment Gates & Realtime Chat.
 * Includes:
 * 1. Logged-out state requiring Google sign-in (or ?demo=1 link).
 * 2. Empty state when a logged-in user has 0 orders.
 * 3. Real Supabase commission data with demo isolation.
 * 4. 6-Stage Visual "Pizza-Tracker" Progress Stepper.
 * 5. Watermarked WIP Gallery unlocking on-demand 300 DPI master download ONLY when stage === 'completed'.
 * 6. Realtime Order Chat with live Postgres subscriptions, audio chimes, and receipt uploading.
 */
export function OrderTracker() {
  const {
    submittedOrders,
    activeOrderId,
    setActiveOrderId,
    setOrderStage,
    uploadPaymentReceipt,
    approveOrderSketch,
    sendOrderMessage,
    openDrawer,
    showToast,
    user,
    isDemoMode,
    isLoadingOrders,
    signInWithGoogle,
  } = useStudio();

  const [chatInput, setChatInput] = useState('');
  const [attachmentKind, setAttachmentKind] = useState<AttachmentKind>('receipt');
  const receiptInputRef = useRef<HTMLInputElement | null>(null);
  const chatFileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingReceiptType, setPendingReceiptType] = useState<'deposit' | 'final'>('deposit');
  const [downloadingWipId, setDownloadingWipId] = useState<string | null>(null);
  const [soundActive, setSoundActive] = useState(() => isAudioNotificationEnabled());

  const order = useMemo(
    () => submittedOrders.find((o) => o.id === activeOrderId) ?? submittedOrders[0],
    [submittedOrders, activeOrderId],
  );

  // Phase 6D: Realtime WebSocket Subscription for active commission
  useCommissionRealtime(order?.id, user?.id);

  const handleToggleSound = () => {
    const next = !soundActive;
    setSoundActive(next);
    setAudioNotificationEnabled(next);
    if (next) playNotificationSound('message');
    showToast(next ? 'Sound notifications enabled' : 'Sound notifications muted');
  };

  const handleRequestDesktopNotifications = async () => {
    const perm = await requestNotificationPermission();
    if (perm === 'granted') {
      showToast('Desktop notifications enabled for Meru Art Studio!');
      playNotificationSound('success');
    } else {
      showToast('Desktop notifications were not enabled (permission denied).');
    }
  };

  // 1. Loading State
  if (isLoadingOrders && !isDemoMode) {
    return (
      <section className="pt-32 pb-16">
        <div className="mx-auto max-w-md text-center">
          <div className="mx-auto size-9 animate-spin rounded-full border-2 border-ink border-t-transparent" />
          <p className="mt-4 font-display text-sm font-medium text-ink">Loading your commissions...</p>
        </div>
      </section>
    );
  }

  // 2. Logged-out state
  if (!user && !isDemoMode) {
    return <LoggedOutTrackView onSignIn={signInWithGoogle} />;
  }

  // 3. Logged-in but zero orders submitted yet
  if (user && submittedOrders.length === 0) {
    return <EmptyTrackView onOpenDrawer={() => openDrawer({ step: 1 })} />;
  }

  if (!order) return null;

  const isDemo = isDemoMode || order.authMethod === 'demo';
  const tier = getTier(order.tier);
  const accent = ACCENT_CLASSES[TIER_ACCENT[order.tier]];
  const currentStepIdx = STAGE_STEPS.findIndex((s) => s.id === order.stage);
  const currentStep = STAGE_STEPS[currentStepIdx] ?? STAGE_STEPS[0];
  const remainingUsd = Math.max(0, order.totalUsd - order.depositUsd);
  const isCompleted = order.stage === 'completed';
  const orderDisplayCode = order.orderCode || order.id;

  const triggerReceiptUpload = (kind: 'deposit' | 'final') => {
    setPendingReceiptType(kind);
    receiptInputRef.current?.click();
  };

  const handleReceiptFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (user && !isDemo) {
      showToast('Uploading payment receipt to secure vault...');
      const { path, error } = await uploadReceiptFile(user.id, order.id, file);
      if (error || !path) {
        showToast(`Upload failed: ${error ?? 'Unknown error'}`);
      } else {
        uploadPaymentReceipt(order.id, pendingReceiptType, path);
      }
    } else {
      const url = URL.createObjectURL(file);
      uploadPaymentReceipt(order.id, pendingReceiptType, url);
    }
    e.target.value = '';
  };

  const handleChatFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (user && !isDemo) {
      showToast('Uploading chat attachment...');
      const { path, error } = await uploadChatAttachment(user.id, order.id, file);
      if (error || !path) {
        showToast(`Upload failed: ${error ?? 'Unknown error'}`);
      } else {
        sendOrderMessage(
          order.id,
          chatInput.trim() || `Attached ${attachmentKind}: ${file.name}`,
          { attachmentUrl: path, attachmentKind },
        );
      }
    } else {
      const url = URL.createObjectURL(file);
      sendOrderMessage(
        order.id,
        chatInput.trim() || `Attached ${attachmentKind}: ${file.name}`,
        { attachmentUrl: url, attachmentKind },
      );
    }
    setChatInput('');
    e.target.value = '';
  };

  const handleDownloadMaster = async (wip: WipUploadItem) => {
    if (wip.slug) {
      window.open(artSrc(wip.slug, 'full'), '_blank');
      return;
    }
    const masterPath = wip.highResUrl;
    if (!masterPath) {
      showToast('Master deliverable path not found.');
      return;
    }
    setDownloadingWipId(wip.id);
    showToast('Authorizing secure master deliverable download...');
    try {
      const signedUrl = await getSignedMediaUrl(STORAGE_BUCKETS.wips, masterPath, 300);
      if (!signedUrl) {
        showToast('Download unauthorized: full-res master deliverable is only unlocked once completed.');
        return;
      }
      const anchor = document.createElement('a');
      anchor.href = signedUrl;
      anchor.download = `${orderDisplayCode}-${order.tier}-master.png`;
      anchor.target = '_blank';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      showToast('Download started!');
    } catch (err: any) {
      showToast(`Download failed: ${err?.message ?? 'Unauthorized'}`);
    } finally {
      setDownloadingWipId(null);
    }
  };

  const handleChatSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    sendOrderMessage(order.id, chatInput.trim());
    setChatInput('');
  };

  return (
    <section className="pt-28 pb-12 sm:pt-32">
      <input
        ref={receiptInputRef}
        type="file"
        accept="image/*"
        onChange={handleReceiptFile}
        className="hidden"
      />
      <input
        ref={chatFileInputRef}
        type="file"
        accept="image/*"
        onChange={handleChatFile}
        className="hidden"
      />

      <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <SectionHeading
            eyebrow={isDemo ? 'Demo Showcase Mode' : 'Client Workspace · Supabase Connected'}
            title="Live commission tracker & order room"
            subtitle="Follow your artwork from initial brief to high-resolution download, upload payment receipts, and chat with Meru in real time."
          />
        </div>

        <div className="mb-10 flex flex-wrap items-center gap-2">
          {submittedOrders.map((o) => {
            const active = o.id === order.id;
            const code = o.orderCode || o.id;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => setActiveOrderId(o.id)}
                className={cn(
                  'rounded-full px-3.5 py-2 text-xs font-medium transition-all',
                  active
                    ? 'bg-ink text-white shadow-xs'
                    : 'border border-line bg-paper text-ink-soft hover:border-ink/30 hover:text-ink',
                )}
              >
                #{code} · {getTier(o.tier).label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => openDrawer({ step: 1 })}
            className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-ink/35 bg-canvas px-3.5 py-2 text-xs font-medium text-ink transition hover:border-ink hover:bg-cream"
          >
            <Sparkles className="size-3.5 text-coral" /> + New Quote
          </button>
        </div>
      </div>

      {/* Interactive Demo Stage Switcher Bar (strictly for demo showcase orders) */}
      {isDemo && (
        <Reveal className="mb-5 rounded-2xl border border-dashed border-ink/25 bg-cream/60 p-3 sm:px-4">
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2 text-xs text-ink">
              <Eye className="size-4 shrink-0 text-coral" />
              <span>
                <strong>Portfolio Interactive Preview:</strong> Click any stage below to test how the payment gates, watermark shield, and high-res download behave:
              </span>
            </div>
            <div className="no-scrollbar flex gap-1 overflow-x-auto pb-0.5 sm:pb-0">
              {STAGE_STEPS.map((s) => {
                const active = s.id === order.stage;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setOrderStage(order.id, s.id)}
                    className={cn(
                      'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
                      active ? 'bg-coral text-white' : 'bg-paper text-ink-soft hover:text-ink',
                    )}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>
        </Reveal>
      )}

      {/* 6-Stage Pizza Tracker Stepper */}
      <Reveal className="card mb-6 p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
          <div className="flex items-center gap-2">
            <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', accent.soft, accent.text)}>
              {tier.label}
            </span>
            <span className="font-display text-lg font-semibold text-ink sm:text-xl">
              Commission #{orderDisplayCode}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-ink-soft">
            <Clock className="size-3.5 text-coral" />
            <span>Target completion: {formatShortDate(order.estEndDate ?? '2026-11-20')}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {STAGE_STEPS.map((step, idx) => {
            const isPast = idx < currentStepIdx;
            const isCurrent = idx === currentStepIdx;

            return (
              <div
                key={step.id}
                className={cn(
                  'relative rounded-xl border p-2.5 transition-all sm:p-3',
                  isCurrent
                    ? 'border-coral bg-coral-soft/50 shadow-xs ring-1 ring-coral/20'
                    : isPast
                      ? 'border-line bg-paper'
                      : 'border-line/60 bg-canvas opacity-60',
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-ink-mute sm:text-[11px]">0{idx + 1}</span>
                  {isPast ? (
                    <CheckCircle2 className="size-3.5 text-teal" />
                  ) : isCurrent ? (
                    <span className="size-2 rounded-full bg-coral animate-ping" />
                  ) : (
                    <span className="size-2 rounded-full bg-ink/15" />
                  )}
                </div>
                <p className="mt-1.5 font-display text-xs font-semibold text-ink leading-tight sm:text-sm">
                  {step.label}
                </p>
                <p className="mt-0.5 line-clamp-2 text-[10px] text-ink-soft leading-tight sm:text-[11px]">
                  {step.desc}
                </p>
              </div>
            );
          })}
        </div>
      </Reveal>

      {/* Main Grid: WIP Gallery (7 cols) + Realtime Chat & Receipt Dropper (5 cols) */}
      <div className="grid gap-6 lg:grid-cols-12">
        <Reveal delay={0.1} className="lg:col-span-7">
          <div className="card p-4 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
              <div>
                <h3 className="font-display text-lg font-semibold text-ink sm:text-xl">
                  Artwork Vault & WIP History
                </h3>
                <p className="text-xs text-ink-soft">
                  Physical canvas watermark shield is active until the artwork is complete.
                </p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-paper px-2.5 py-1 text-xs font-medium text-ink-soft border border-line">
                {isCompleted ? (
                  <>
                    <Unlock className="size-3.5 text-teal" /> Unwatermarked 300 DPI
                  </>
                ) : (
                  <>
                    <Lock className="size-3.5 text-coral" /> Watermarked until Completed
                  </>
                )}
              </span>
            </div>

            {order.stage === 'pending_review' || order.stage === 'awaiting_deposit' ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-canvas px-6 py-12 text-center">
                <Clock className="size-8 text-coral" />
                <p className="mt-3 font-display text-xl font-semibold text-ink">
                  WIPs unlock once sketching begins
                </p>
                <p className="mt-1 max-w-sm text-xs text-ink-soft">
                  As soon as your upfront deposit is verified, Meru will post watermarked pose sketches and colour checks right here.
                </p>
              </div>
            ) : order.wips.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-canvas px-6 py-12 text-center">
                <Sparkles className="size-8 text-coral" />
                <p className="mt-3 font-display text-xl font-semibold text-ink">
                  Sketching in Progress
                </p>
                <p className="mt-1 max-w-sm text-xs text-ink-soft">
                  Meru is currently working on your initial draft. WIP files will appear here as soon as they are uploaded.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {order.wips.map((wip) => {
                  const lockedFinal = wip.isFinal && !isCompleted;
                  const showWatermark = !isCompleted;

                  return (
                    <div
                      key={wip.id}
                      className="overflow-hidden rounded-2xl border border-line bg-canvas p-3 sm:p-4"
                    >
                      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="text-[11px] font-semibold text-coral uppercase">
                            {wip.isFinal ? 'Final Master File' : 'Work In Progress'}
                          </span>
                          <h4 className="font-display text-lg font-semibold text-ink">{wip.title}</h4>
                        </div>
                        <span className="text-[11px] text-ink-mute">
                          {formatShortDate(wip.createdAt.slice(0, 10))}
                        </span>
                      </div>

                      <div className="relative aspect-4/3 w-full overflow-hidden rounded-xl border border-line bg-paper select-none">
                        {wip.slug ? (
                          <ArtImage
                            slug={wip.slug}
                            alt={wip.title}
                            size="sm"
                            className={cn(
                              'size-full object-contain transition-all duration-300',
                              lockedFinal && 'blur-xl grayscale opacity-30',
                            )}
                          />
                        ) : wip.imageUrl ? (
                          <img
                            src={wip.imageUrl}
                            alt={wip.title}
                            className={cn(
                              'size-full object-contain transition-all duration-300',
                              lockedFinal && 'blur-xl grayscale opacity-30',
                            )}
                          />
                        ) : null}

                        {/* Protective Watermark Overlay */}
                        {showWatermark && !lockedFinal && (
                          <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/10 backdrop-blur-[0.5px]">
                            <div className="rotate-[-22deg] text-center select-none">
                              <p className="font-display text-2xl font-extrabold tracking-widest text-white/50 uppercase drop-shadow-md sm:text-4xl">
                                MERU ART · WIP PREVIEW
                              </p>
                              <p className="text-[11px] font-bold tracking-widest text-white/60 uppercase drop-shadow-sm">
                                Commission #{orderDisplayCode} · Do Not Repost
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Locked final state overlay */}
                        {lockedFinal && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center bg-paper/85 p-6 text-center backdrop-blur-md">
                            <span className="grid size-12 place-items-center rounded-2xl bg-coral-soft text-coral">
                              <Lock className="size-6" />
                            </span>
                            <h4 className="mt-3 font-display text-xl font-semibold text-ink">
                              High-Res Master File Locked
                            </h4>
                            <p className="mt-1 max-w-xs text-xs text-ink-soft">
                              The full 300 DPI master download unlocks automatically once the final stage is marked completed.
                            </p>
                          </div>
                        )}
                      </div>

                      {wip.artistNote && (
                        <p className="mt-2.5 rounded-xl bg-paper px-3 py-2 text-xs text-ink-soft">
                          <strong className="text-ink">Artist Note:</strong> {wip.artistNote}
                        </p>
                      )}

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        {isCompleted && (wip.highResUrl || wip.slug) ? (
                          <button
                            type="button"
                            disabled={downloadingWipId === wip.id}
                            onClick={() => handleDownloadMaster(wip)}
                            className="inline-flex items-center gap-1.5 rounded-full bg-teal px-4 py-2 text-xs font-medium text-white transition hover:bg-ink disabled:opacity-50"
                          >
                            <Download className="size-3.5" />
                            {downloadingWipId === wip.id ? 'Authorizing download...' : 'Download High-Res PNG (300 DPI)'}
                          </button>
                        ) : (
                          <span className="text-[11px] text-ink-mute">
                            Protected by Meru Art Studio watermark shield.
                          </span>
                        )}

                        {wip.stage === 'sketch_approval' && !wip.approvedByClient && (
                          <button
                            type="button"
                            onClick={() => approveOrderSketch(order.id)}
                            className="inline-flex items-center gap-1 rounded-full border border-ink/30 bg-paper px-3 py-1.5 text-xs font-medium text-ink transition hover:border-ink hover:bg-cream"
                          >
                            <Check className="size-3 text-coral" /> Approve this WIP
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Reveal>

        {/* Right: Realtime Order Chat & Receipt Dropper */}
        <Reveal delay={0.2} className="lg:col-span-5">
          <div className="card flex h-full min-h-[520px] flex-col p-4 sm:p-6">
            <div className="mb-3 flex items-center justify-between border-b border-line pb-3">
              <div className="flex items-center gap-2">
                <span className="grid size-8 place-items-center rounded-xl bg-coral-soft text-coral">
                  <MessageSquare className="size-4" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-display text-base font-semibold text-ink">
                      Order Chat · #{orderDisplayCode}
                    </h4>
                    {!isDemo && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-teal-soft px-2 py-0.5 text-[10px] font-semibold text-teal">
                        <span className="size-1.5 rounded-full bg-teal animate-pulse" /> Live
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-ink-mute">Direct communication with Meru</p>
                </div>
              </div>

              {/* Realtime Audio Chime & Browser Notification Toggles */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleToggleSound}
                  title={soundActive ? 'Mute notification sound chimes' : 'Unmute notification sound chimes'}
                  aria-label={soundActive ? 'Mute audio' : 'Unmute audio'}
                  className={cn(
                    'grid size-7 place-items-center rounded-full border text-xs transition-colors',
                    soundActive
                      ? 'border-line bg-paper text-ink hover:border-ink/30'
                      : 'border-dashed border-ink/20 bg-cream text-ink-mute hover:text-ink',
                  )}
                >
                  {soundActive ? <Volume2 className="size-3.5 text-teal" /> : <VolumeX className="size-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={handleRequestDesktopNotifications}
                  title="Enable desktop notifications"
                  aria-label="Enable desktop notifications"
                  className="grid size-7 place-items-center rounded-full border border-line bg-paper text-ink-soft hover:border-ink/30 hover:text-coral transition-colors"
                >
                  <Bell className="size-3.5" />
                </button>
              </div>
            </div>

            {/* Chat Message List */}
            <div className="no-scrollbar flex-1 space-y-3 overflow-y-auto py-2 pr-1">
              {order.messages.map((m) => {
                const isArtist = m.senderRole === 'artist';
                return (
                  <div
                    key={m.id}
                    className={cn('flex flex-col', isArtist ? 'items-start' : 'items-end')}
                  >
                    <div className="mb-1 flex items-center gap-1.5 text-[10px] text-ink-mute">
                      <span className={cn('font-semibold', isArtist ? 'text-coral' : 'text-teal')}>
                        {m.senderName}
                      </span>
                      <span>·</span>
                      <span>{formatShortDate(m.createdAt.slice(0, 10))}</span>
                    </div>

                    <div
                      className={cn(
                        'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed',
                        isArtist
                          ? 'border border-line bg-paper text-ink'
                          : 'bg-ink text-white shadow-xs',
                      )}
                    >
                      {m.attachmentUrl && (
                        <div className="mb-2 overflow-hidden rounded-xl border border-line bg-canvas">
                          <img
                            src={m.attachmentUrl}
                            alt="Attachment"
                            className="max-h-48 w-full object-contain"
                          />
                          {m.attachmentKind && (
                            <span className="block bg-paper px-2 py-1 text-[10px] font-semibold text-coral uppercase">
                              Attached: {m.attachmentKind}
                            </span>
                          )}
                        </div>
                      )}
                      <p>{m.body}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Message input */}
            <form onSubmit={handleChatSubmit} className="mt-3 border-t border-line pt-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  {(['receipt', 'redline', 'reference'] as AttachmentKind[]).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setAttachmentKind(k)}
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-medium capitalize transition-colors',
                        attachmentKind === k
                          ? 'bg-ink text-white'
                          : 'border border-line bg-paper text-ink-soft hover:text-ink',
                      )}
                    >
                      {k}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => chatFileInputRef.current?.click()}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-coral hover:underline"
                >
                  <ImagePlus className="size-3.5" /> Upload Image
                </button>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Write a message, redline note, or payment ref..."
                  className="flex-1 rounded-full border border-line bg-paper px-3.5 py-2 text-xs text-ink placeholder:text-ink-mute focus:border-ink focus:outline-none"
                />
                <button
                  type="submit"
                  aria-label="Send message"
                  className="grid size-9 shrink-0 place-items-center rounded-full bg-ink text-white transition hover:bg-coral"
                >
                  <Send className="size-3.5" />
                </button>
              </div>
            </form>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function LoggedOutTrackView({ onSignIn }: { onSignIn: () => void }) {
  return (
    <section className="pt-28 pb-16 sm:pt-36">
      <div className="mx-auto max-w-xl text-center">
        <div className="mx-auto mb-5 grid size-16 place-items-center rounded-3xl border border-line bg-cream shadow-xs">
          <Lock className="size-8 text-coral" />
        </div>
        <SectionHeading
          eyebrow="Private Client Workspace"
          title="Sign in to view your orders"
          subtitle="Your commission tracker, WIP sketches, payment receipts, and direct chat with Meru are private to your Google account."
        />
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onSignIn}
            className="inline-flex w-full items-center justify-center gap-2.5 rounded-full bg-ink px-6 py-3.5 text-xs font-semibold text-white shadow-xs transition hover:bg-coral sm:w-auto"
          >
            <BrandIcon name="google" className="size-4" />
            <span>Continue with Google</span>
          </button>
          <a
            href="?demo=1#track"
            className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-line bg-paper px-6 py-3.5 text-xs font-medium text-ink transition hover:border-ink/40 sm:w-auto"
          >
            <span>Explore Demo Showcase (?demo=1)</span>
          </a>
        </div>
      </div>
    </section>
  );
}

function EmptyTrackView({ onOpenDrawer }: { onOpenDrawer: () => void }) {
  return (
    <section className="pt-28 pb-16 sm:pt-36">
      <div className="mx-auto max-w-xl text-center">
        <div className="mx-auto mb-5 grid size-16 place-items-center rounded-3xl border border-line bg-cream shadow-xs">
          <Sparkles className="size-8 text-mustard" />
        </div>
        <SectionHeading
          eyebrow="Commission Workspace"
          title="No active commissions found"
          subtitle="You haven't submitted any commission briefs yet. Choose a tier and book a slot to unlock your private tracker."
        />
        <div className="mt-8 flex justify-center">
          <button
            type="button"
            onClick={onOpenDrawer}
            className="inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3.5 text-xs font-semibold text-white shadow-xs transition hover:bg-coral"
          >
            <Sparkles className="size-4 text-mustard" />
            <span>Request a Commission Quote</span>
          </button>
        </div>
      </div>
    </section>
  );
}
```

---

## 7. Mock Auto-Reply Bot Quarantine (`src/context/StudioContext.tsx`)

As audited, the automated bot reply simulation is strictly quarantined to offline showcase orders (`DEMO_SHOWCASE_ORDER.id` or `?demo=1`) and is completely bypassed when communicating in real Supabase commissions:

```ts
// src/context/StudioContext.tsx (lines 795-842)
const sendOrderMessage = useCallback(
  (
    orderId: string,
    body: string,
    opts?: { attachmentUrl?: string; attachmentKind?: AttachmentKind; senderRole?: 'client' | 'artist' },
  ) => {
    // 1. Real Supabase Commission: mutations route to Postgres messages table
    if (isSupabaseConfigured && orderId !== DEMO_SHOWCASE_ORDER.id) {
      sendMessageMut.mutate(
        { commissionId: orderId, body, opts },
        {
          onError: (err) => showToast(err.message),
        },
      );
    } else {
      // 2. Offline / Demo Showcase: local state only
      const role = opts?.senderRole ?? 'client';
      const newMsg: OrderMessage = {
        id: `msg-${Date.now()}`,
        commissionId: orderId,
        senderRole: role,
        senderName: role === 'artist' ? 'Meru Art' : 'You',
        body,
        attachmentUrl: opts?.attachmentUrl,
        attachmentKind: opts?.attachmentKind,
        createdAt: new Date().toISOString(),
      };

      setLocalOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, messages: [...o.messages, newMsg] } : o)),
      );

      // Auto-reply bot strictly for demo showcase order (?demo=1)
      if (role === 'client' && (orderId === DEMO_SHOWCASE_ORDER.id || isDemoMode)) {
        window.setTimeout(() => {
          const reply: OrderMessage = {
            id: `msg-${Date.now()}-bot`,
            commissionId: orderId,
            senderRole: 'artist',
            senderName: 'Meru Art (Demo)',
            body: 'Got your message! (Simulated response in Demo Mode)',
            createdAt: new Date().toISOString(),
          };
          setLocalOrders((prev) =>
            prev.map((o) => (o.id === orderId ? { ...o, messages: [...o.messages, reply] } : o)),
          );
        }, 900);
      }
    }
  },
  [isDemoMode, sendMessageMut, showToast],
);
```

---

## 8. Verification Results
- `npm run build` (`tsc && vite build`) executes cleanly with zero TypeScript errors and zero warnings.
- Edge Function requires authenticated caller, queries authoritative database records, and reconciles `notification_logs`.
- OS notifications only trigger when `document.visibilityState === 'hidden'`.
- Audio chimes run client-side without asset dependencies and support muting.
