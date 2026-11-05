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
  siteUrl: string,
) {
  const code = comm.order_code || payload.commission_id.slice(0, 8).toUpperCase();
  const timestamp = new Date().toISOString();

  switch (payload.event_type) {
    case 'brief_submitted':
      return {
        title: `🎨 New Commission Brief Received: #${code}`,
        description: `**Client:** @${comm.client_handle || 'Client'}\n**Tier:** ${comm.tier}\n**Character:** ${comm.character_name || 'N/A'}\n**Total:** $${comm.total_price} ${comm.currency || 'USD'}`,
        color: 0xf59e0b, // Mustard
        url: `${siteUrl}/#admin`,
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
        url: `${siteUrl}/#track`,
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
        url: `${siteUrl}/#track`,
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
        url: `${siteUrl}/#track`,
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
        url: `${siteUrl}/#track`,
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
  const publicSiteUrl = (Deno.env.get('PUBLIC_SITE_URL') || 'https://meru-art-studio.vercel.app').replace(/\/+$/, '');

  // 1. Authenticate caller (JWT verification OR server-side Webhook Secret)
  const authHeader = req.headers.get('Authorization');
  const callerSecret = req.headers.get('X-Webhook-Secret');
  const isSecretAuth = Boolean(webhookSecret && callerSecret === webhookSecret);

  if (!authHeader && !isSecretAuth) {
    return new Response(JSON.stringify({ error: 'Missing authorization credentials' }), {
      status: 401,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  let callerUserId: string | null = null;
  let callerIsArtistRole = false;
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
    callerIsArtistRole = (authData.user.app_metadata as Record<string, unknown> | undefined)?.role === 'artist';
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

  // Verify authorization: caller must be owner of the commission OR artist admin (by role or UID)
  if (callerUserId && callerUserId !== comm.client_id) {
    const artistAdminUid = Deno.env.get('ARTIST_ADMIN_UID');
    if (!callerIsArtistRole && callerUserId !== artistAdminUid) {
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
      const embed = formatDiscordEmbed(payload, comm, publicSiteUrl);
      const discordRes = await fetch(discordWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'Meru Art Studio',
          avatar_url: `${publicSiteUrl}/favicon.ico`,
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
            <a href="${publicSiteUrl}/#track" style="background-color: #18181b; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 9999px; font-weight: 600; display: inline-block;">View Commission Tracker</a>
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
