import type { SubmittedOrder } from '@/types';
import { formatMoney, formatShortDate, getTier } from '@/lib/utils';

/**
 * Escapes HTML characters to prevent DOM-based XSS when injecting dynamic strings into print templates.
 */
export function escapeHtml(str: unknown): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Generates and triggers a printable invoice / commission receipt in a new browser window.
 * Uses high-contrast, professional typography, full financial breakdown, print styles,
 * and comprehensive HTML entity escaping to prevent DOM XSS vulnerabilities.
 */
export function printOrderInvoice(order: SubmittedOrder): void {
  const printWindow = window.open('', '_blank', 'width=800,height=900');
  if (!printWindow) {
    alert('Please allow popups for Meru Art Studio to download or print your invoice.');
    return;
  }

  const tier = getTier(order.tier);
  const rawOrderCode = order.orderCode || order.id.slice(0, 8).toUpperCase();
  const orderCode = escapeHtml(rawOrderCode);
  const remainingUsd = Math.max(0, order.totalUsd - order.depositUsd);
  const activeAddons: string[] = [];
  if (order.addons.nsfw) activeAddons.push('NSFW Content (+50%)');
  if (order.addons.softFurry) activeAddons.push('Soft Furry / Kemonomimi (+50%)');
  if (order.addons.commercial) activeAddons.push('Commercial Rights (+200%)');

  const safeClientContact = escapeHtml(order.clientContact || 'Private Client');
  const safeCharacterName = escapeHtml(order.characterName || 'Original Character');
  const safeAuthMethod = escapeHtml(order.authMethod.toUpperCase());
  const safeStageLabel = escapeHtml(order.stage.replace(/_/g, ' '));
  const safeTargetDelivery = escapeHtml(
    order.estEndDate ? formatShortDate(order.estEndDate) : 'Scheduled upon deposit',
  );
  const safeTierLabel = escapeHtml(tier.label);
  const safeTierDesc = escapeHtml(tier.description);
  const safeAddonsText = escapeHtml(activeAddons.join(', '));
  const safeDate = escapeHtml(formatShortDate(order.createdAt.slice(0, 10)));

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Invoice #${orderCode} · Meru Art Studio</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #1a1614;
      background: #ffffff;
      padding: 40px;
      line-height: 1.5;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #1a1614;
      padding-bottom: 24px;
      margin-bottom: 30px;
    }
    .brand-title {
      font-size: 26px;
      font-weight: 800;
      letter-spacing: -0.5px;
      color: #1a1614;
    }
    .brand-sub {
      font-size: 13px;
      color: #6a6460;
      margin-top: 4px;
    }
    .invoice-badge {
      text-align: right;
    }
    .invoice-badge h1 {
      font-size: 28px;
      font-weight: 800;
      color: #e0604b;
      margin-bottom: 4px;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 24px;
      margin-bottom: 30px;
      background: #faf8f5;
      padding: 20px;
      border-radius: 12px;
      border: 1px solid #e8e3dc;
    }
    .meta-col h3 {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #8c827a;
      margin-bottom: 8px;
    }
    .meta-col p {
      font-size: 14px;
      font-weight: 500;
      margin-bottom: 4px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 30px;
    }
    th {
      text-align: left;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #6a6460;
      border-bottom: 2px solid #e8e3dc;
      padding: 12px 10px;
    }
    td {
      padding: 14px 10px;
      font-size: 14px;
      border-bottom: 1px solid #f0eae1;
    }
    .text-right { text-align: right; }
    .totals-area {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 36px;
    }
    .totals-table {
      width: 320px;
    }
    .totals-table tr td {
      padding: 8px 10px;
    }
    .totals-table tr.grand-total td {
      border-top: 2px solid #1a1614;
      font-size: 18px;
      font-weight: 800;
      color: #1a1614;
      padding-top: 14px;
    }
    .status-stamp {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .status-paid { background: #e6f6f2; color: #1e7e68; }
    .status-pending { background: #fdf3e5; color: #b9800f; }
    .terms-box {
      font-size: 11px;
      color: #8c827a;
      border-top: 1px solid #e8e3dc;
      padding-top: 20px;
      margin-top: 20px;
      line-height: 1.6;
    }
    .print-btn-bar {
      margin-bottom: 20px;
      display: flex;
      justify-content: flex-end;
    }
    .print-btn {
      background: #1a1614;
      color: #ffffff;
      border: none;
      padding: 10px 22px;
      font-size: 14px;
      font-weight: 600;
      border-radius: 8px;
      cursor: pointer;
    }
    @media print {
      body { padding: 0; }
      .print-btn-bar { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="print-btn-bar">
    <button class="print-btn" onclick="window.print()">Print or Save PDF</button>
  </div>

  <div class="header">
    <div>
      <div class="brand-title">MERU ART STUDIO</div>
      <div class="brand-sub">Independent Character Illustrator & Digital Artist</div>
      <div class="brand-sub">Manila, Philippines (UTC+8) · Commissions & Visual Production</div>
    </div>
    <div class="invoice-badge">
      <h1>COMMISSION RECEIPT</h1>
      <p style="font-size: 13px; font-weight: 600; color: #6a6460;">Ref: #${orderCode}</p>
      <p style="font-size: 12px; color: #8c827a;">Date: ${safeDate}</p>
    </div>
  </div>

  <div class="meta-grid">
    <div class="meta-col">
      <h3>Billed To (Client)</h3>
      <p><strong>Contact:</strong> ${safeClientContact}</p>
      <p><strong>Character:</strong> ${safeCharacterName}</p>
      <p><strong>Auth Method:</strong> ${safeAuthMethod}</p>
    </div>
    <div class="meta-col">
      <h3>Order Specifications</h3>
      <p><strong>Stage:</strong> <span class="status-stamp ${order.stage === 'completed' ? 'status-paid' : 'status-pending'}">${safeStageLabel}</span></p>
      <p><strong>Target Delivery:</strong> ${safeTargetDelivery}</p>
      <p><strong>Payment Structure:</strong> ${order.paymentSplit === '100_upfront' ? '100% Upfront' : '50% Deposit / 50% Post-Sketch'}</p>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th>Qty / Details</th>
        <th class="text-right">Rate</th>
        <th class="text-right">Subtotal</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>
          <strong>${safeTierLabel} Tier</strong><br />
          <span style="font-size: 12px; color: #6a6460;">${safeTierDesc}</span>
        </td>
        <td>${order.characterCount} character(s)</td>
        <td class="text-right">${formatMoney(tier.basePriceUsd, order.currency)}</td>
        <td class="text-right">${formatMoney(tier.basePriceUsd * order.characterCount, order.currency)}</td>
      </tr>
      ${
        activeAddons.length > 0
          ? `<tr>
              <td>
                <strong>Add-ons & Scope Multipliers</strong><br />
                <span style="font-size: 12px; color: #6a6460;">${safeAddonsText}</span>
              </td>
              <td>Scope Multipliers</td>
              <td class="text-right">—</td>
              <td class="text-right">Included in Total</td>
            </tr>`
          : ''
      }
    </tbody>
  </table>

  <div class="totals-area">
    <table class="totals-table">
      <tr>
        <td><strong>Grand Total:</strong></td>
        <td class="text-right"><strong>${formatMoney(order.totalUsd, order.currency)}</strong></td>
      </tr>
      <tr>
        <td>Deposit (${order.paymentSplit === '100_upfront' ? '100%' : '50%'}):</td>
        <td class="text-right">
          ${formatMoney(order.depositUsd, order.currency)}
          <span class="status-stamp ${order.depositPaid ? 'status-paid' : 'status-pending'}">
            ${order.depositPaid ? 'PAID' : 'UNPAID'}
          </span>
        </td>
      </tr>
      ${
        order.paymentSplit === '50_50'
          ? `<tr>
              <td>Remaining Balance:</td>
              <td class="text-right">
                ${formatMoney(remainingUsd, order.currency)}
                <span class="status-stamp ${order.finalPaid ? 'status-paid' : 'status-pending'}">
                  ${order.finalPaid ? 'PAID' : 'DUE AT SKETCH'}
                </span>
              </td>
            </tr>`
          : ''
      }
      <tr class="grand-total">
        <td>Total Paid:</td>
        <td class="text-right">
          ${
            order.finalPaid
              ? formatMoney(order.totalUsd, order.currency)
              : order.depositPaid
                ? formatMoney(order.depositUsd, order.currency)
                : formatMoney(0, order.currency)
          }
        </td>
      </tr>
    </table>
  </div>

  <div class="terms-box">
    <strong>Terms of Service & Usage Rights:</strong><br />
    • <strong>Personal vs Commercial:</strong> Artwork is delivered for personal non-commercial display unless commercial licensing is purchased.<br />
    • <strong>Deliverables:</strong> Final deliveries are supplied at 300 DPI high-resolution PNG format upon completion.<br />
    • <strong>Refund Policy:</strong> 100% full refund before sketching begins. 50% deposit retained during sketch stage to cover production time. No refunds once lineart and rendering begin.<br />
    • <strong>Artist Rights:</strong> Meru Art Studio retains intellectual copyright to the artwork and reserves the right to showcase watermarked versions in portfolio galleries.
  </div>

  <script>
    // Automatically open the print dialog when opened
    window.addEventListener('load', () => {
      setTimeout(() => { window.print(); }, 400);
    });
  </script>
</body>
</html>`;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}
