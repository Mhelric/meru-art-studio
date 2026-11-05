import type { SubmittedOrder } from '@/types';

export interface RevisionAllowance {
  usedCount: number;
  maxAllowed: number;
  remainingCount: number;
  isExhausted: boolean;
  canRequestFree: boolean;
  isSketchPhase: boolean;
  isUnlimitedFree: boolean;
  minorFixesCount: number;
  majorRevisionsCount: number;
}

export interface RevisionHistoryEntry {
  id: string;
  roundNumber: number;
  category: string;
  notes: string;
  scale?: 'minor' | 'major' | 'sketch';
  attachmentUrl?: string;
  createdAt: string;
  isExtraFee: boolean;
  senderRole?: 'client' | 'artist' | 'system';
}

export const DEFAULT_MAX_REVISIONS = 2;

/**
 * Resolves the effective maximum free major revision allowance for an order,
 * checking explicit `order.maxRevisions` first, then the latest artist
 * `[Studio Notice]: Meru Art updated revision allowance to X included rounds.`
 * message in the order's message log, and defaulting to `DEFAULT_MAX_REVISIONS` (2).
 */
export function resolveOrderMaxRevisions(order: SubmittedOrder): number {
  if (typeof order.maxRevisions === 'number' && !Number.isNaN(order.maxRevisions)) {
    return Math.max(0, order.maxRevisions);
  }
  const msgs = order.messages ?? [];
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m.senderRole === 'artist' || m.senderRole === 'system') {
      const match = m.body.match(/updated revision allowance to (\d+) included rounds/i);
      if (match) {
        const parsed = parseInt(match[1], 10);
        if (!Number.isNaN(parsed)) {
          return Math.max(0, parsed);
        }
      }
    }
  }
  return DEFAULT_MAX_REVISIONS;
}

/**
 * Calculates current revision allowance, used rounds, and remaining slots.
 * - Sketch Phase (`sketching` / `sketch_approval`): Revisions are completely FREE with NO LIMIT.
 * - Lineart & Coloring Phase (`lineart_coloring`):
 *   - Minor Fixes (e.g. small color adjustment, minor tweaks): FREE & UNLIMITED.
 *   - Major Revisions (e.g. redraw, pose overhaul): Counted against `maxAllowed` (default 2 rounds).
 */
export function getRevisionAllowance(order: SubmittedOrder): RevisionAllowance {
  const maxAllowed = resolveOrderMaxRevisions(order);
  const isSketchPhase = order.stage === 'sketching' || order.stage === 'sketch_approval';

  // Extract from messages or explicit order.revisionCount
  const revisionMessages = (order.messages ?? []).filter(
    (m) => m.body.startsWith('[Revision Request') || m.attachmentKind === 'redline',
  );

  const minorMessages = revisionMessages.filter((m) =>
    m.body.includes('· Minor Fix') || m.body.toLowerCase().includes('minor fix'),
  );

  const majorMessages = revisionMessages.filter((m) =>
    !m.body.includes('· Minor Fix') &&
    !m.body.toLowerCase().includes('minor fix') &&
    (m.body.includes('· Major') || m.body.includes('Round') || !isSketchPhase),
  );

  const totalUsedCount = typeof order.revisionCount === 'number'
    ? Math.max(order.revisionCount, revisionMessages.length)
    : revisionMessages.length;

  if (isSketchPhase) {
    return {
      usedCount: totalUsedCount,
      maxAllowed,
      remainingCount: Infinity,
      isExhausted: false,
      canRequestFree: true,
      isSketchPhase: true,
      isUnlimitedFree: true,
      minorFixesCount: minorMessages.length,
      majorRevisionsCount: majorMessages.length,
    };
  }

  // In lineart & coloring phase:
  const majorUsedCount = majorMessages.length;
  const remainingCount = Math.max(0, maxAllowed - majorUsedCount);
  const isExhausted = majorUsedCount >= maxAllowed;
  const canRequestFree = majorUsedCount < maxAllowed;

  return {
    usedCount: majorUsedCount,
    maxAllowed,
    remainingCount,
    isExhausted,
    canRequestFree,
    isSketchPhase: false,
    isUnlimitedFree: false,
    minorFixesCount: minorMessages.length,
    majorRevisionsCount: majorUsedCount,
  };
}

/**
 * Parses all revision request entries from an order's message history.
 */
export function parseRevisionHistory(order: SubmittedOrder): RevisionHistoryEntry[] {
  const entries: RevisionHistoryEntry[] = [];
  const maxAllowed = resolveOrderMaxRevisions(order);
  let counter = 0;

  for (const msg of order.messages ?? []) {
    if (msg.body.startsWith('[Revision Request') || (msg.attachmentKind === 'redline' && msg.senderRole === 'client')) {
      counter++;
      let category = 'General Feedback';
      let notes = msg.body;
      let scale: 'minor' | 'major' | 'sketch' | undefined = undefined;

      if (msg.body.includes('Sketch Pass')) {
        scale = 'sketch';
      } else if (msg.body.includes('· Minor Fix') || msg.body.includes('· Minor Scale')) {
        scale = 'minor';
      } else if (msg.body.includes('Major Revision') || msg.body.includes('Round')) {
        scale = 'major';
      }

      // Pattern: [Revision Request · Category]: notes
      // Pattern: [Revision Request - Round 1 · Category]: notes
      // Pattern: [Revision Request · Round 1/2 · Category]: notes
      const match = msg.body.match(/^\[Revision Request(?:\s*[·-]\s*(?:(?:Round\s*\d+(?:\/\d+)?|Minor Fix|Major Revision|Sketch Pass)\s*[·-]\s*)?([^\]]+))?\](?::\s*(.*))?$/s);
      if (match) {
        if (match[1]) category = match[1].trim();
        if (match[2]) notes = match[2].trim();
      }

      const isExtra = scale === 'minor' || scale === 'sketch' ? false : counter > maxAllowed;

      entries.push({
        id: msg.id,
        roundNumber: counter,
        category,
        notes,
        scale,
        attachmentUrl: msg.attachmentUrl,
        createdAt: msg.createdAt,
        isExtraFee: isExtra,
        senderRole: msg.senderRole,
      });
    }
  }

  return entries;
}

/**
 * Validates whether all mandatory milestone sign-off checklist items are met.
 */
export interface SignoffChecklist {
  poseAndComposition: boolean;
  characterAndDetails: boolean;
  termsAcknowledged: boolean;
}

export function isSignoffComplete(checklist: SignoffChecklist): boolean {
  return (
    checklist.poseAndComposition &&
    checklist.characterAndDetails &&
    checklist.termsAcknowledged
  );
}

/**
 * Checks whether an order has received a formal milestone sign-off for its sketch or current WIP pass.
 */
export function getOrderSignoffStatus(order: SubmittedOrder): {
  isSignedOff: boolean;
  signedOffAt: string | null;
  signedOffWipTitle?: string;
} {
  // Check explicit order fields
  if (order.sketchSignedOffAt) {
    return {
      isSignedOff: true,
      signedOffAt: order.sketchSignedOffAt,
      signedOffWipTitle: 'Rough Composition Sketch',
    };
  }

  // Check if any sketch or current stage WIP is marked approved
  const approvedWip = (order.wips ?? []).find(
    (w) => w.approvedByClient && (w.stage === 'sketch_approval' || w.stage === order.stage),
  );

  if (approvedWip) {
    return {
      isSignedOff: true,
      signedOffAt: approvedWip.createdAt,
      signedOffWipTitle: approvedWip.title,
    };
  }

  if (order.sketchApproved) {
    return {
      isSignedOff: true,
      signedOffAt: order.createdAt,
      signedOffWipTitle: 'Sketch Milestone Approved',
    };
  }

  return {
    isSignedOff: false,
    signedOffAt: null,
  };
}
