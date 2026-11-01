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
