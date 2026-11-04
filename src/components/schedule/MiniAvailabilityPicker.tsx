import { useState, useMemo, useRef, useEffect } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Lock } from 'lucide-react';
import { cn, formatShortDate, getLocalTodayDate } from '@/lib/utils';
import type { PublicQueueSlot, StudioSettingsState } from '@/types';

interface MiniAvailabilityPickerProps {
  selectedDate: string | null;
  onSelectDate: (iso: string) => void;
  queueSlots: PublicQueueSlot[];
  studioSettings: StudioSettingsState;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function toIsoDate(year: number, monthIndex: number, day: number) {
  const m = String(monthIndex + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

export function MiniAvailabilityPicker({
  selectedDate,
  onSelectDate,
  queueSlots,
  studioSettings,
}: MiniAvailabilityPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Initialize cursor to the selected date or today
  const initialDate = useMemo(() => {
    if (selectedDate) {
      const [y, m, d] = selectedDate.split('-').map(Number);
      if (!Number.isNaN(y) && !Number.isNaN(m) && !Number.isNaN(d)) {
        return { year: y, month: m - 1 };
      }
    }
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  }, [selectedDate]);

  const [cursor, setCursor] = useState(initialDate);

  // Close popup when clicking outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const shiftMonth = (delta: number) => {
    setCursor((c) => {
      const next = new Date(c.year, c.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  };

  const todayIso = getLocalTodayDate();

  const daysGrid = useMemo(() => {
    const firstDayOfWeek = new Date(cursor.year, cursor.month, 1).getDay();
    const totalDays = new Date(cursor.year, cursor.month + 1, 0).getDate();

    const cells: Array<{
      iso: string;
      day: number;
      isPast: boolean;
      isBlocked: boolean;
      blockedReason?: string;
      hasSlots: boolean;
      isOpenWindow: boolean;
    } | null> = [];

    // Empty offset cells
    for (let i = 0; i < firstDayOfWeek; i++) {
      cells.push(null);
    }

    // Days in current month
    for (let day = 1; day <= totalDays; day++) {
      const iso = toIsoDate(cursor.year, cursor.month, day);
      const isPast = iso < todayIso;
      const blocked = studioSettings.blockedRanges.find((b) => iso >= b.startDate && iso <= b.endDate);
      const slots = queueSlots.filter((s) => iso >= s.startDate && iso <= s.estEndDate);
      const isOpenWindow = !blocked && studioSettings.status !== 'closed' && !isPast && slots.length < 2;

      cells.push({
        iso,
        day,
        isPast,
        isBlocked: Boolean(blocked),
        blockedReason: blocked?.reason,
        hasSlots: slots.length > 0,
        isOpenWindow,
      });
    }

    return cells;
  }, [cursor, todayIso, studioSettings.blockedRanges, studioSettings.status, queueSlots]);

  const selectedStatus = useMemo(() => {
    if (!selectedDate) return null;
    const blocked = studioSettings.blockedRanges.find((b) => selectedDate >= b.startDate && selectedDate <= b.endDate);
    if (blocked) return { label: 'Blocked Range', shortLabel: 'Blocked', class: 'bg-coral-soft text-coral' };
    const slots = queueSlots.filter((s) => selectedDate >= s.startDate && selectedDate <= s.estEndDate);
    if (slots.length > 0) return { label: 'Active Slot', shortLabel: 'Active', class: 'bg-lilac-soft text-lilac' };
    return { label: 'Open Window', shortLabel: 'Open', class: 'bg-teal-soft text-teal' };
  }, [selectedDate, studioSettings.blockedRanges, queueSlots]);

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-1.5 rounded-xl border border-line bg-canvas px-2.5 py-2 text-xs text-ink transition hover:border-ink/40 focus:border-ink focus:outline-none"
      >
        <div className="flex items-center gap-1.5 truncate">
          <CalendarIcon className="size-3.5 text-coral shrink-0" />
          <span className="font-semibold truncate">
            {selectedDate ? formatShortDate(selectedDate) : 'Pick start date'}
          </span>
        </div>
        {selectedStatus && (
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0',
              selectedStatus.class,
            )}
          >
            <span className="size-1.5 rounded-full bg-current" />
            <span className="hidden sm:inline">{selectedStatus.label}</span>
            <span className="sm:hidden">{selectedStatus.shortLabel}</span>
          </span>
        )}
      </button>

      {/* Popover Calendar Grid (anchored right-0 so it stays fully inside the drawer/screen) */}
      {isOpen && (
        <div className="absolute top-full right-0 z-50 mt-1.5 w-[280px] sm:w-[310px] max-w-[calc(100vw-2.5rem)] rounded-2xl border border-line bg-paper p-3 shadow-2xl">
          {/* Header */}
          <div className="mb-2.5 flex items-center justify-between">
            <span className="font-display text-sm font-semibold text-ink">
              {MONTH_NAMES[cursor.month]} {cursor.year}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                className="grid size-7 place-items-center rounded-full border border-line bg-canvas text-ink transition hover:bg-cream"
                aria-label="Previous month"
              >
                <ChevronLeft className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                className="grid size-7 place-items-center rounded-full border border-line bg-canvas text-ink transition hover:bg-cream"
                aria-label="Next month"
              >
                <ChevronRight className="size-3.5" />
              </button>
            </div>
          </div>

          {/* Weekday Labels */}
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-ink-mute">
            {WEEKDAYS.map((wd) => (
              <div key={wd} className="py-0.5">
                {wd}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="mt-1 grid grid-cols-7 gap-1">
            {daysGrid.map((cell, idx) => {
              if (!cell) {
                return <div key={`empty-${idx}`} className="size-8 sm:size-9" />;
              }

              const isSelected = selectedDate === cell.iso;

              return (
                <button
                  key={cell.iso}
                  type="button"
                  disabled={cell.isPast || cell.isBlocked}
                  onClick={() => {
                    onSelectDate(cell.iso);
                    setIsOpen(false);
                  }}
                  title={
                    cell.isBlocked
                      ? `Blocked: ${cell.blockedReason || 'Artist unavailable'}`
                      : cell.isPast
                        ? 'Past date'
                        : cell.hasSlots
                          ? 'Active client slot'
                          : 'Open booking window'
                  }
                  className={cn(
                    'relative mx-auto flex size-8 sm:size-9 flex-col items-center justify-center rounded-xl text-xs font-medium transition-all',
                    cell.isPast && 'cursor-not-allowed opacity-30 text-ink-mute',
                    cell.isBlocked && 'cursor-not-allowed border border-coral/30 bg-coral-soft/50 text-coral',
                    cell.isOpenWindow && 'border border-teal/30 bg-teal-soft/40 text-ink hover:border-teal hover:bg-teal-soft',
                    cell.hasSlots && !cell.isBlocked && !cell.isOpenWindow && 'border border-lilac/30 bg-lilac-soft/40 text-ink',
                    isSelected && 'ring-2 ring-ink border-ink bg-ink text-white font-semibold',
                  )}
                >
                  <span className={cn('text-xs leading-none', isSelected && 'text-white')}>
                    {cell.day}
                  </span>

                  {/* Indicator Dot */}
                  <span className="mt-0.5 flex items-center justify-center">
                    {cell.isBlocked ? (
                      <Lock className="size-2 text-coral" />
                    ) : cell.isOpenWindow ? (
                      <span className={cn('size-1 rounded-full bg-teal', isSelected && 'bg-white')} />
                    ) : cell.hasSlots ? (
                      <span className={cn('size-1 rounded-full bg-lilac', isSelected && 'bg-white')} />
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Legend Footer */}
          <div className="mt-2.5 flex items-center justify-between border-t border-line/70 pt-2 text-[10px] text-ink-mute">
            <span className="inline-flex items-center gap-1 text-teal font-medium">
              <span className="size-1.5 rounded-full bg-teal" /> Open
            </span>
            <span className="inline-flex items-center gap-1 text-lilac font-medium">
              <span className="size-1.5 rounded-full bg-lilac" /> Active
            </span>
            <span className="inline-flex items-center gap-1 text-coral font-medium">
              <span className="size-1.5 rounded-full bg-coral" /> Blocked
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
