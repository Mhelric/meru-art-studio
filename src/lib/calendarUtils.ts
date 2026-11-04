import type { SubmittedOrder } from '@/types';

/**
 * Get local ISO date string (YYYY-MM-DD) for a given date.
 */
export function getLocalIsoDateString(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Expand a date range between startDate and endDate (inclusive) into an array of ISO date strings (YYYY-MM-DD).
 * Handles both startDate <= endDate and startDate > endDate.
 */
export function expandDateRange(startDate: string, endDate: string): string[] {
  if (!startDate || !endDate) return [];

  const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
  const [endYear, endMonth, endDay] = endDate.split('-').map(Number);

  if (
    Number.isNaN(startYear) ||
    Number.isNaN(startMonth) ||
    Number.isNaN(startDay) ||
    Number.isNaN(endYear) ||
    Number.isNaN(endMonth) ||
    Number.isNaN(endDay)
  ) {
    return [];
  }

  const startUtc = Date.UTC(startYear, startMonth - 1, startDay);
  const endUtc = Date.UTC(endYear, endMonth - 1, endDay);

  const minUtc = Math.min(startUtc, endUtc);
  const maxUtc = Math.max(startUtc, endUtc);

  const dates: string[] = [];
  const DAY_MS = 86400000;

  for (let current = minUtc; current <= maxUtc; current += DAY_MS) {
    const d = new Date(current);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${day}`);
  }

  return dates;
}

/**
 * Check if an ISO date string (YYYY-MM-DD) is in the past relative to local today.
 */
export function isDateInPast(isoDate: string, todayIso?: string): boolean {
  const today = todayIso || getLocalIsoDateString(new Date());
  return isoDate < today;
}

/**
 * Detect commissions that have a conflicting schedule on any of the provided dates.
 */
export interface ScheduleConflict {
  date: string;
  orderId: string;
  orderCode: string;
  characterName: string;
  clientContact: string;
}

export function findConflictingCommissions(
  dates: string[],
  orders: SubmittedOrder[],
): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];
  const dateSet = new Set(dates);

  for (const order of orders) {
    // Only check active (non-terminal) orders
    if (order.stage === 'declined' || order.stage === 'cancelled' || order.stage === 'completed') {
      continue;
    }

    // Dedup dates for this specific order
    const orderDates = Array.from(
      new Set([order.startDate, order.preferredStartDate].filter(Boolean) as string[]),
    );

    for (const d of orderDates) {
      if (dateSet.has(d)) {
        conflicts.push({
          date: d,
          orderId: order.id,
          orderCode: order.orderCode || order.id.slice(0, 8),
          characterName: order.characterName || 'Untitled',
          clientContact: order.clientContact || 'Client',
        });
      }
    }
  }

  return conflicts;
}

/**
 * Calculate multi-date selection handling single-click toggles and Shift-click range selections.
 */
export function calculateMultiDateSelection(
  currentSelected: Set<string>,
  clickedIso: string,
  anchorIso: string | null,
  isShiftKey: boolean,
  todayIso?: string,
): { nextSelected: Set<string>; newAnchor: string } {
  const today = todayIso || getLocalIsoDateString();
  const next = new Set(currentSelected);

  // Past dates cannot be selected
  if (clickedIso < today) {
    return { nextSelected: next, newAnchor: anchorIso || clickedIso };
  }

  if (isShiftKey && anchorIso) {
    // Range expansion from anchor to clicked
    const range = expandDateRange(anchorIso, clickedIso);
    for (const d of range) {
      if (d >= today) {
        next.add(d);
      }
    }
    return { nextSelected: next, newAnchor: clickedIso };
  }

  // Normal single click toggle
  if (next.has(clickedIso)) {
    next.delete(clickedIso);
  } else {
    next.add(clickedIso);
  }

  return { nextSelected: next, newAnchor: clickedIso };
}

/**
 * Get remaining dates of the current week (from today to Saturday).
 */
export function getWeekDaysRemaining(todayIso?: string): string[] {
  const today = new Date();
  const todayStr = todayIso || getLocalIsoDateString(today);
  const dow = today.getDay(); // 0 is Sunday, 6 is Saturday
  const daysUntilWeekend = 6 - dow;

  const dates: string[] = [todayStr];
  for (let i = 1; i <= daysUntilWeekend; i++) {
    const future = new Date(today);
    future.setDate(today.getDate() + i);
    dates.push(getLocalIsoDateString(future));
  }
  return dates;
}

/**
 * Get remaining dates of the current month (from today to month end).
 */
export function getMonthDaysRemaining(todayIso?: string): string[] {
  const today = new Date();
  const todayStr = todayIso || getLocalIsoDateString(today);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const currentDay = today.getDate();

  const dates: string[] = [];
  for (let d = currentDay; d <= lastDay; d++) {
    const dateObj = new Date(today.getFullYear(), today.getMonth(), d);
    const iso = getLocalIsoDateString(dateObj);
    if (iso >= todayStr) {
      dates.push(iso);
    }
  }
  return dates;
}
