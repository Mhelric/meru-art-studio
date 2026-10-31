import { motion } from 'framer-motion';
import {
  CalendarCheck2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Lock,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { BLOCKED_RANGES, STUDIO_AVAILABILITY } from '@/data/schedule';
import { useStudio } from '@/context/StudioContext';
import { ACCENT_CLASSES, cn, formatShortDate, getTier } from '@/lib/utils';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { EASE, Reveal } from '@/components/ui/Reveal';
import type { BlockedRange, PublicQueueSlot } from '@/types';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function toIsoDate(year: number, monthIndex: number, day: number) {
  const m = String(monthIndex + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

export function AvailabilityCalendar() {
  const { queueSlots, maxSlots, openDrawer, draft } = useStudio();

  // Default to November 2026 so active slots, blocked exam dates, and open green windows are visible right away.
  const [cursor, setCursor] = useState<{ year: number; month: number }>(() => {
    const now = new Date();
    // If opened in late Oct 2026, show Nov 2026 where the bulk of the queue & open windows live
    if (now.getFullYear() === 2026 && now.getMonth() === 9 && now.getDate() >= 25) {
      return { year: 2026, month: 10 };
    }
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  const [selectedDay, setSelectedDay] = useState<string | null>(draft.preferredStartDate ?? STUDIO_AVAILABILITY.nextOpenWindow);

  const openSlotsCount = Math.max(0, maxSlots - queueSlots.length);

  const monthLabel = useMemo(
    () => new Date(cursor.year, cursor.month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    [cursor],
  );

  const daysGrid = useMemo(() => {
    const firstDow = new Date(cursor.year, cursor.month, 1).getDay();
    const totalDays = new Date(cursor.year, cursor.month + 1, 0).getDate();
    const cells: Array<{
      iso: string;
      day: number;
      slots: PublicQueueSlot[];
      blocked: BlockedRange | null;
      isOpenWindow: boolean;
    } | null> = [];

    for (let i = 0; i < firstDow; i++) cells.push(null);

    const todayIso = new Date().toISOString().slice(0, 10);

    for (let day = 1; day <= totalDays; day++) {
      const iso = toIsoDate(cursor.year, cursor.month, day);
      const blocked = BLOCKED_RANGES.find((b) => iso >= b.startDate && iso <= b.endDate) ?? null;
      const slots = queueSlots.filter((s) => iso >= s.startDate && iso <= s.estEndDate);
      // A day is an open green booking window if it's not in the past, not blocked, and fewer than 2 active commissions overlap that day
      const isOpenWindow = !blocked && iso >= todayIso && slots.length < 2;

      cells.push({ iso, day, slots, blocked, isOpenWindow });
    }
    return cells;
  }, [cursor, queueSlots]);

  const selectedCell = useMemo(
    () => daysGrid.find((c) => c && c.iso === selectedDay) ?? null,
    [daysGrid, selectedDay],
  );

  const shiftMonth = (delta: number) => {
    setCursor((c) => {
      const next = new Date(c.year, c.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  };

  return (
    <section className="pt-28 pb-10 sm:pt-32">
      {/* Live Status Banner + Quick CTA */}
      <Reveal className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-3 inline-flex flex-wrap items-center gap-2 rounded-full border border-teal/30 bg-teal-soft px-3.5 py-1.5 text-xs font-medium text-teal">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-teal opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-teal" />
            </span>
            <span>
              Commissions: <strong className="font-semibold uppercase">{STUDIO_AVAILABILITY.status}</strong> ·{' '}
              <strong>
                {openSlotsCount}/{maxSlots} Slots Available
              </strong>
            </span>
          </div>

          <SectionHeading
            eyebrow="Public Queue & Schedule"
            title="Availability & live commission queue"
            subtitle="Tap any green open date on the calendar to reserve your preferred start window. Client names are anonymised for privacy."
          />
        </div>

        <button
          type="button"
          onClick={() => openDrawer({ step: 1, preferredDate: selectedDay ?? undefined })}
          className="mb-10 inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-ink px-5 py-3 text-xs font-medium text-white transition-colors hover:bg-coral sm:text-sm"
        >
          <Sparkles className="size-4 text-mustard" />
          Request Open Slot ({openSlotsCount} left)
        </button>
      </Reveal>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left: Anonymised Active Queue Cards (5 cols on lg) */}
        <div className="space-y-3.5 lg:col-span-5">
          <div className="flex items-center justify-between px-1">
            <h3 className="font-display text-xl font-semibold text-ink">
              Active Client Queue ({queueSlots.length}/{maxSlots})
            </h3>
            <span className="text-xs text-ink-mute">Updated live</span>
          </div>

          {queueSlots.map((slot, i) => {
            const tier = getTier(slot.tier);
            const accent = ACCENT_CLASSES[slot.accent];
            return (
              <Reveal key={slot.id} delay={i * 0.05} className="card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="grid size-7 place-items-center rounded-full bg-ink font-display text-xs font-semibold text-white">
                      #{slot.slotNumber}
                    </span>
                    <div>
                      <p className="font-display text-lg leading-tight font-semibold text-ink">
                        Slot #{slot.slotNumber}: {tier.label} —{' '}
                        <span className={accent.text}>{slot.stageLabel}</span>
                      </p>
                      <p className="text-xs text-ink-mute">
                        Client <span className="font-medium text-ink-soft">{slot.handleHint}</span> ·{' '}
                        {formatShortDate(slot.startDate)} – {formatShortDate(slot.estEndDate)}
                      </p>
                    </div>
                  </div>

                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${accent.soft} ${accent.text}`}>
                    {slot.progress}%
                  </span>
                </div>

                {/* Progress bar */}
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-cream">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${slot.progress}%` }}
                    transition={{ duration: 0.8, delay: 0.15 + i * 0.08, ease: EASE }}
                    className={cn('h-full rounded-full', accent.bar)}
                  />
                </div>
              </Reveal>
            );
          })}

          {/* Open / Reserve Slot Cards */}
          {Array.from({ length: openSlotsCount }).map((_, idx) => {
            const slotNum = queueSlots.length + idx + 1;
            return (
              <Reveal key={`open-${slotNum}`} delay={0.18 + idx * 0.05}>
                <button
                  type="button"
                  onClick={() => openDrawer({ step: 1, preferredDate: selectedDay ?? STUDIO_AVAILABILITY.nextOpenWindow })}
                  className="group flex w-full items-center justify-between gap-3 rounded-3xl border border-dashed border-teal/50 bg-teal-soft/40 p-4 text-left transition-all hover:border-teal hover:bg-teal-soft/80"
                >
                  <div className="flex items-center gap-3">
                    <span className="grid size-8 place-items-center rounded-full bg-teal text-xs font-semibold text-white">
                      #{slotNum}
                    </span>
                    <div>
                      <p className="font-display text-lg font-semibold text-ink">
                        Slot #{slotNum} · Open for Booking
                      </p>
                      <p className="text-xs text-ink-soft">
                        Est. start window: {formatShortDate(selectedDay ?? STUDIO_AVAILABILITY.nextOpenWindow)} · Tap to claim
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-white transition-colors group-hover:bg-coral">
                    Claim Slot →
                  </span>
                </button>
              </Reveal>
            );
          })}

          <div className="rounded-2xl border border-line bg-cream/60 p-3.5 text-xs text-ink-soft">
            <p className="flex items-center gap-1.5 font-medium text-ink">
              <UserCheck className="size-4 text-teal" /> Fair Queue Protection
            </p>
            <p className="mt-1">
              Submitting a brief enters <strong>Pending Review</strong> first — slots are only deducted once Meru reviews and approves your brief.
            </p>
          </div>
        </div>

        {/* Right: Color-Coded Monthly Calendar Grid (7 cols on lg) */}
        <Reveal delay={0.1} className="card flex flex-col justify-between p-4 sm:p-6 lg:col-span-7">
          <div>
            {/* Calendar Header */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-medium tracking-wider text-coral uppercase">Interactive Schedule</p>
                <h3 className="font-display text-2xl font-semibold text-ink">{monthLabel}</h3>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => shiftMonth(-1)}
                  aria-label="Previous month"
                  className="grid size-9 place-items-center rounded-full border border-line bg-canvas text-ink transition hover:bg-cream"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => shiftMonth(1)}
                  aria-label="Next month"
                  className="grid size-9 place-items-center rounded-full border border-line bg-canvas text-ink transition hover:bg-cream"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
            </div>

            {/* Color Legend */}
            <div className="mb-4 flex flex-wrap gap-2 text-[11px] font-medium">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-soft px-2.5 py-1 text-teal">
                <span className="size-2 rounded-full bg-teal" /> Open Booking Window
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-lilac-soft px-2.5 py-1 text-lilac">
                <span className="size-2 rounded-full bg-lilac" /> Active Client Slot
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-coral-soft px-2.5 py-1 text-coral">
                <span className="size-2 rounded-full bg-coral" /> Artist Blocked / Busy
              </span>
            </div>

            {/* Weekday Header */}
            <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-medium text-ink-mute">
              {WEEKDAYS.map((d) => (
                <div key={d} className="py-1">
                  {d}
                </div>
              ))}
            </div>

            {/* Days Grid */}
            <div className="mt-1 grid grid-cols-7 gap-1.5">
              {daysGrid.map((cell, idx) => {
                if (!cell) {
                  return <div key={`empty-${idx}`} className="aspect-square rounded-xl bg-transparent" />;
                }

                const isSelected = selectedDay === cell.iso;
                const hasBlocked = Boolean(cell.blocked);
                const hasSlots = cell.slots.length > 0;

                return (
                  <button
                    key={cell.iso}
                    type="button"
                    onClick={() => setSelectedDay(cell.iso)}
                    className={cn(
                      'relative flex aspect-square flex-col items-center justify-between rounded-xl border p-1.5 text-xs transition-all sm:rounded-2xl sm:p-2',
                      hasBlocked
                        ? 'border-coral/30 bg-coral-soft/60 text-coral'
                        : cell.isOpenWindow
                          ? 'border-teal/35 bg-teal-soft/45 text-ink hover:border-teal hover:bg-teal-soft'
                          : 'border-line bg-canvas text-ink-soft',
                      isSelected && 'ring-2 ring-ink border-ink',
                    )}
                  >
                    <span className={cn('font-display text-sm font-semibold sm:text-base', isSelected && 'text-ink')}>
                      {cell.day}
                    </span>

                    {/* Status dots at the bottom of each date cell */}
                    <div className="flex items-center gap-1">
                      {hasBlocked ? (
                        <Lock className="size-3 text-coral" />
                      ) : (
                        <>
                          {cell.slots.map((s) => (
                            <span
                              key={s.id}
                              title={`Slot #${s.slotNumber}: ${getTier(s.tier).label}`}
                              className={cn('size-1.5 rounded-full sm:size-2', ACCENT_CLASSES[s.accent].dot)}
                            />
                          ))}
                          {cell.isOpenWindow && !hasSlots && <span className="size-1.5 rounded-full bg-teal sm:size-2" />}
                        </>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected Date Inspector Bar */}
          <div className="mt-5 flex flex-col justify-between gap-3 rounded-2xl border border-line bg-canvas p-3.5 sm:flex-row sm:items-center">
            {selectedCell ? (
              <>
                <div className="space-y-0.5">
                  <p className="font-display text-lg font-semibold text-ink">
                    {formatShortDate(selectedCell.iso)}
                    {selectedCell.blocked && (
                      <span className="ml-2 rounded-full bg-coral-soft px-2 py-0.5 font-sans text-[11px] font-medium text-coral">
                        Blocked
                      </span>
                    )}
                    {selectedCell.isOpenWindow && (
                      <span className="ml-2 rounded-full bg-teal-soft px-2 py-0.5 font-sans text-[11px] font-medium text-teal">
                        Available Window
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-ink-soft">
                    {selectedCell.blocked
                      ? selectedCell.blocked.reason
                      : selectedCell.slots.length > 0
                        ? `Working on: ${selectedCell.slots.map((s) => `Slot #${s.slotNumber} (${getTier(s.tier).label})`).join(', ')}`
                        : 'Open studio day — ready for new commission kickoff.'}
                  </p>
                </div>

                {selectedCell.isOpenWindow ? (
                  <button
                    type="button"
                    onClick={() => openDrawer({ step: 1, preferredDate: selectedCell.iso })}
                    className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-ink px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-coral"
                  >
                    <CalendarCheck2 className="size-3.5 text-mustard" />
                    Book around {formatShortDate(selectedCell.iso)}
                  </button>
                ) : (
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-ink-mute">
                    <Clock className="size-3.5" /> Pick a green date to book
                  </span>
                )}
              </>
            ) : (
              <p className="text-xs text-ink-soft">Tap any date on the calendar to inspect active slots or book an open window.</p>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
