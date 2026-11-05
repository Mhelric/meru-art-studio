import { useState, useMemo, type KeyboardEvent, type MouseEvent } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Lock,
  Minus,
  Plus,
  RotateCcw,
  Trash2,
  AlertTriangle,
  Check,
  CreditCard,
  QrCode,
  Building2,
  Upload,
} from 'lucide-react';
import { useStudio, DEFAULT_PAYMENT_DETAILS } from '@/context/StudioContext';
import { optimizeQrImage } from '@/lib/storage';
import { cn, formatMoney, formatShortDate } from '@/lib/utils';
import { type AvailabilityStatus, type TierId, type StudioPaymentDetails } from '@/types';
import { type SettingsSection, SETTINGS_SUB_ITEMS } from '../AdminNav';
import {
  expandDateRange,
  isDateInPast,
  findConflictingCommissions,
  calculateMultiDateSelection,
  getWeekDaysRemaining,
  getMonthDaysRemaining,
  getLocalIsoDateString,
} from '@/lib/calendarUtils';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function toIsoDate(year: number, monthIndex: number, day: number) {
  const m = String(monthIndex + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

interface StudioSettingsTabProps {
  settingsSection?: SettingsSection;
  onChangeSettingsSection?: (section: SettingsSection) => void;
}

export function StudioSettingsTab({
  settingsSection,
  onChangeSettingsSection,
}: StudioSettingsTabProps = {}) {
  const [internalSection, setInternalSection] = useState<SettingsSection>('availability');
  const currentSection = settingsSection ?? internalSection;
  const setSection = (s: SettingsSection) => {
    if (onChangeSettingsSection) onChangeSettingsSection(s);
    else setInternalSection(s);
  };
  const {
    studioSettings,
    tiers,
    updateStudioSettings,
    resetStudioSettings,
    removeBlockedRange,
    batchUpdateBlockedDates,
    submittedOrders,
    queueSlots,
    showToast,
  } = useStudio();

  const todayIso = useMemo(() => getLocalIsoDateString(), []);

  // Studio payment gateway details draft state
  const [paymentDraft, setPaymentDraft] = useState<StudioPaymentDetails>(() => {
    return studioSettings.paymentDetails ?? DEFAULT_PAYMENT_DETAILS;
  });

  const handleSavePaymentDetails = () => {
    updateStudioSettings({ paymentDetails: paymentDraft });
    showToast('Studio payment credentials saved!');
  };

  // Multi-date selection state
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [anchorDate, setAnchorDate] = useState<string | null>(null);
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');

  // Mini-calendar state for date blocking
  const [cursor, setCursor] = useState<{ year: number; month: number }>(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [blockReason, setBlockReason] = useState('Studio Busy / Vacation');

  const monthLabel = useMemo(
    () => new Date(cursor.year, cursor.month, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
    [cursor],
  );

  const calendarDays = useMemo(() => {
    const firstDow = new Date(cursor.year, cursor.month, 1).getDay();
    const totalDays = new Date(cursor.year, cursor.month + 1, 0).getDate();
    const cells: Array<{ iso: string; day: number; blocked: boolean } | null> = [];
    for (let i = 0; i < firstDow; i++) cells.push(null);
    for (let day = 1; day <= totalDays; day++) {
      const iso = toIsoDate(cursor.year, cursor.month, day);
      const blocked = studioSettings.blockedRanges.some((b) => iso >= b.startDate && iso <= b.endDate);
      cells.push({ iso, day, blocked });
    }
    return cells;
  }, [cursor, studioSettings.blockedRanges]);

  // Conflict detection across selected dates
  const selectedDatesList = useMemo(() => Array.from(selectedDates), [selectedDates]);
  const scheduleConflicts = useMemo(
    () => findConflictingCommissions(selectedDatesList, submittedOrders),
    [selectedDatesList, submittedOrders],
  );

  const handleDateClick = (iso: string, e: MouseEvent<HTMLButtonElement>) => {
    if (isDateInPast(iso, todayIso)) {
      showToast('Cannot block or select past dates.');
      return;
    }
    const { nextSelected, newAnchor } = calculateMultiDateSelection(
      selectedDates,
      iso,
      anchorDate,
      e.shiftKey,
      todayIso,
    );
    setSelectedDates(nextSelected);
    setAnchorDate(newAnchor);
  };

  const handleDateKeyDown = (iso: string, e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (isDateInPast(iso, todayIso)) {
        showToast('Cannot block or select past dates.');
        return;
      }
      const { nextSelected, newAnchor } = calculateMultiDateSelection(
        selectedDates,
        iso,
        anchorDate,
        e.shiftKey,
        todayIso,
      );
      setSelectedDates(nextSelected);
      setAnchorDate(newAnchor);
    }
  };

  const handleAddRange = () => {
    if (!rangeStart || !rangeEnd) {
      showToast('Please select both start and end dates.');
      return;
    }
    const dates = expandDateRange(rangeStart, rangeEnd).filter((d) => !isDateInPast(d, todayIso));
    if (dates.length === 0) {
      showToast('No valid future dates in the selected range.');
      return;
    }
    setSelectedDates((prev) => {
      const next = new Set(prev);
      dates.forEach((d) => next.add(d));
      return next;
    });
    setAnchorDate(dates[dates.length - 1]);
    showToast(`Added ${dates.length} date(s) to selection.`);
  };

  const handleSelectThisWeek = () => {
    const weekDates = getWeekDaysRemaining(todayIso);
    setSelectedDates((prev) => {
      const next = new Set(prev);
      weekDates.forEach((d) => next.add(d));
      return next;
    });
    showToast(`Selected ${weekDates.length} remaining day(s) this week.`);
  };

  const handleSelectThisMonth = () => {
    const monthDates = getMonthDaysRemaining(todayIso);
    setSelectedDates((prev) => {
      const next = new Set(prev);
      monthDates.forEach((d) => next.add(d));
      return next;
    });
    showToast(`Selected ${monthDates.length} remaining day(s) this month.`);
  };

  const handleBatchBlock = async () => {
    if (selectedDatesList.length === 0) return;
    await batchUpdateBlockedDates(selectedDatesList, 'block', blockReason);
    setSelectedDates(new Set());
    setAnchorDate(null);
  };

  const handleBatchUnblock = async () => {
    if (selectedDatesList.length === 0) return;
    await batchUpdateBlockedDates(selectedDatesList, 'unblock');
    setSelectedDates(new Set());
    setAnchorDate(null);
  };

  const handleClearSelection = () => {
    setSelectedDates(new Set());
    setAnchorDate(null);
  };

  const handlePriceChange = (tierId: TierId, raw: string) => {
    const val = Math.max(1, Number(raw) || 0);
    updateStudioSettings({
      basePrices: { ...studioSettings.basePrices, [tierId]: val },
    });
  };

  const handleMultiplierChange = (key: 'nsfw' | 'softFurry' | 'commercial', pctString: string) => {
    const pct = Math.max(0, Number(pctString) || 0);
    updateStudioSettings({
      multipliers: { ...studioSettings.multipliers, [key]: pct / 100 },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 border-b border-line pb-4 sm:flex-row sm:items-center">
        <div>
          <h3 className="font-display text-lg font-bold text-ink">
            Studio Availability & Storefront Settings
          </h3>
          <p className="text-xs text-ink-soft">
            Control commission intake status, slot capacity, blocked vacation days, live USD tier prices, and GCash conversion rate.
          </p>
        </div>

        <button
          type="button"
          onClick={resetStudioSettings}
          title="Reset all prices, multipliers & blocked dates to defaults"
          className="inline-flex items-center gap-1.5 self-start rounded-full border border-line bg-paper px-3.5 py-1.5 text-xs font-semibold text-ink-soft transition hover:border-ink hover:text-ink sm:self-auto"
        >
          <RotateCcw className="size-3.5" /> Reset to Defaults
        </button>
      </div>

      {/* Top Sub-section Pills */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line pb-3">
        {SETTINGS_SUB_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = currentSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setSection(item.id)}
              className={cn(
                'inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-xs font-semibold transition-all',
                active
                  ? 'bg-ink text-white shadow-xs'
                  : 'border border-line bg-canvas text-ink-soft hover:border-ink/30 hover:text-ink',
              )}
            >
              <Icon className="size-3.5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Availability & Slots Section */}
      {currentSection === 'availability' && (
        <div className="card space-y-5 p-5 sm:p-6 w-full">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <div>
              <p className="text-[11px] font-semibold text-coral uppercase">Availability & Slots</p>
              <h4 className="font-display text-xl font-bold text-ink">Quick Studio Toggles</h4>
            </div>
            <span className="rounded-full bg-canvas px-3 py-1 text-xs font-semibold text-ink ring-1 ring-line">
              {queueSlots.length}/{studioSettings.maxSlots} Active Slots
            </span>
          </div>

          {/* Status Flipper */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-ink">Commission Status Badge</label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'open', label: 'OPEN', tone: 'bg-teal text-white' },
                  { id: 'waitlist', label: 'WAITLIST', tone: 'bg-mustard text-ink' },
                  { id: 'closed', label: 'CLOSED', tone: 'bg-coral text-white' },
                ] as { id: AvailabilityStatus; label: string; tone: string }[]
              ).map((st) => {
                const active = studioSettings.status === st.id;
                return (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => {
                      updateStudioSettings({ status: st.id });
                      showToast(`Studio status flipped to ${st.label}!`);
                    }}
                    className={cn(
                      'rounded-2xl border py-2.5 text-xs font-semibold tracking-wider transition-all',
                      active
                        ? `${st.tone} border-transparent shadow-xs`
                        : 'border-line bg-canvas text-ink-soft hover:border-ink/30',
                    )}
                  >
                    {st.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Max Slots Stepper */}
          <div className="flex items-center justify-between rounded-2xl border border-line bg-canvas px-4 py-3">
            <div>
              <p className="text-xs font-semibold text-ink">Maximum Active Commission Slots</p>
              <p className="text-[11px] text-ink-mute">
                Currently {Math.max(0, studioSettings.maxSlots - queueSlots.length)} open slot(s) on public calendar
              </p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-line bg-paper px-3 py-1">
              <button
                type="button"
                onClick={() => updateStudioSettings({ maxSlots: Math.max(1, studioSettings.maxSlots - 1) })}
                aria-label="Decrease max slots"
                className="text-ink-soft hover:text-ink"
              >
                <Minus className="size-3.5" />
              </button>
              <span className="font-display text-lg font-semibold text-ink">{studioSettings.maxSlots}</span>
              <button
                type="button"
                onClick={() => updateStudioSettings({ maxSlots: Math.min(10, studioSettings.maxSlots + 1) })}
                aria-label="Increase max slots"
                className="text-ink-soft hover:text-ink"
              >
                <Plus className="size-3.5" />
              </button>
            </div>
          </div>

          {/* Interactive Multi-Date Blocker */}
          <div className="rounded-2xl border border-line bg-canvas p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-ink">Multi-Date & Range Availability Blocker</p>
                <p className="text-[11px] text-ink-mute">{monthLabel} · Syncs with Public Calendar in Realtime</p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    setCursor((c) => {
                      const d = new Date(c.year, c.month - 1, 1);
                      return { year: d.getFullYear(), month: d.getMonth() };
                    })
                  }
                  aria-label="Previous month"
                  className="grid size-7 place-items-center rounded-full border border-line bg-paper text-ink transition hover:bg-cream"
                >
                  <ChevronLeft className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setCursor((c) => {
                      const d = new Date(c.year, c.month + 1, 1);
                      return { year: d.getFullYear(), month: d.getMonth() };
                    })
                  }
                  aria-label="Next month"
                  className="grid size-7 place-items-center rounded-full border border-line bg-paper text-ink transition hover:bg-cream"
                >
                  <ChevronRight className="size-3.5" />
                </button>
              </div>
            </div>

            {/* Reason input */}
            <input
              type="text"
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
              placeholder="Reason for blocking (e.g. Studio Vacation / Exam Week)"
              className="w-full rounded-xl border border-line bg-paper px-3 py-1.5 text-xs text-ink focus:border-ink focus:outline-none"
            />

            {/* Quick Actions & Date Range Picker */}
            <div className="space-y-2 rounded-xl border border-line/80 bg-paper/60 p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-1.5 text-xs">
                <span className="font-semibold text-ink-soft text-[11px]">Quick Presets:</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleSelectThisWeek}
                    className="rounded-lg border border-line bg-paper px-2.5 py-1 text-[11px] font-semibold text-ink transition hover:border-ink hover:bg-cream"
                  >
                    Select This Week
                  </button>
                  <button
                    type="button"
                    onClick={handleSelectThisMonth}
                    className="rounded-lg border border-line bg-paper px-2.5 py-1 text-[11px] font-semibold text-ink transition hover:border-ink hover:bg-cream"
                  >
                    Select This Month
                  </button>
                </div>
              </div>

              {/* Start & End inputs */}
              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-line/50">
                <div className="flex flex-1 items-center gap-1 min-w-[130px]">
                  <span className="text-[10px] text-ink-mute font-medium">From:</span>
                  <input
                    type="date"
                    min={todayIso}
                    value={rangeStart}
                    onChange={(e) => setRangeStart(e.target.value)}
                    className="w-full rounded-lg border border-line bg-canvas px-2 py-1 text-xs text-ink"
                  />
                </div>
                <div className="flex flex-1 items-center gap-1 min-w-[130px]">
                  <span className="text-[10px] text-ink-mute font-medium">To:</span>
                  <input
                    type="date"
                    min={rangeStart || todayIso}
                    value={rangeEnd}
                    onChange={(e) => setRangeEnd(e.target.value)}
                    className="w-full rounded-lg border border-line bg-canvas px-2 py-1 text-xs text-ink"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAddRange}
                  className="rounded-lg bg-ink px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-coral shrink-0"
                >
                  Add Range
                </button>
              </div>
            </div>

            {/* Conflict Warning Alert */}
            {scheduleConflicts.length > 0 && (
              <div className="rounded-xl border border-coral/40 bg-coral-soft/30 p-2.5 text-xs text-coral space-y-1">
                <p className="font-bold flex items-center gap-1">
                  <AlertTriangle className="size-3.5" /> Schedule Conflict Warning ({scheduleConflicts.length}):
                </p>
                <div className="max-h-24 overflow-y-auto space-y-0.5 text-[11px] text-ink">
                  {scheduleConflicts.map((c, i) => (
                    <div key={`${c.orderId}-${i}`}>
                      • <strong>{c.date}</strong>: #{c.orderCode} (@{c.clientContact}) · OC: {c.characterName}
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-ink-mute">
                  Blocking these dates may conflict with promised delivery dates.
                </p>
              </div>
            )}

            {/* Batch Action Bar */}
            {selectedDates.size > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-mustard/50 bg-mustard-soft/40 p-2.5">
                <span className="text-xs font-bold text-ink">
                  {selectedDates.size} Date{selectedDates.size > 1 ? 's' : ''} Selected
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleBatchBlock}
                    className="rounded-lg bg-coral px-3 py-1 text-xs font-bold text-white transition hover:bg-coral/90"
                  >
                    Block Selected ({selectedDates.size})
                  </button>
                  <button
                    type="button"
                    onClick={handleBatchUnblock}
                    className="rounded-lg border border-line bg-paper px-2.5 py-1 text-xs font-semibold text-ink transition hover:border-ink hover:bg-cream"
                  >
                    Unblock ({selectedDates.size})
                  </button>
                  <button
                    type="button"
                    onClick={handleClearSelection}
                    className="rounded-lg px-2 py-1 text-xs text-ink-soft hover:text-ink"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium text-ink-mute">
              {WEEKDAYS.map((w) => (
                <div key={w}>{w}</div>
              ))}
            </div>

            <div className="mt-1 grid grid-cols-7 gap-1">
              {calendarDays.map((cell, i) => {
                if (!cell) return <div key={`e-${i}`} className="h-8" />;
                const isPast = isDateInPast(cell.iso, todayIso);
                const isSelected = selectedDates.has(cell.iso);

                return (
                  <button
                    key={cell.iso}
                    type="button"
                    disabled={isPast}
                    onClick={(e) => handleDateClick(cell.iso, e)}
                    onKeyDown={(e) => handleDateKeyDown(cell.iso, e)}
                    aria-label={`${cell.iso} ${cell.blocked ? 'Blocked' : 'Available'} ${isSelected ? 'Selected' : ''}`}
                    aria-pressed={isSelected}
                    className={cn(
                      'flex h-8 items-center justify-center gap-0.5 rounded-lg border text-xs font-medium transition-all relative',
                      isPast && 'opacity-30 cursor-not-allowed bg-cream/40 border-line text-ink-mute',
                      !isPast && cell.blocked && 'border-coral bg-coral text-white',
                      !isPast && !cell.blocked && 'border-line bg-paper text-ink hover:border-ink/50',
                      isSelected && 'ring-2 ring-mustard ring-offset-1 font-bold z-10',
                    )}
                  >
                    <span>{cell.day}</span>
                    {cell.blocked && <Lock className="size-2.5" />}
                  </button>
                );
              })}
            </div>

            <p className="text-[10px] text-ink-mute italic">
              Tip: Click to toggle dates. Hold Shift + Click to select date ranges. Keyboard: Space/Enter.
            </p>

            {/* Active Blocked Ranges List */}
            {studioSettings.blockedRanges.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-2.5">
                {studioSettings.blockedRanges.map((b) => (
                  <span
                    key={b.id}
                    className="inline-flex items-center gap-1.5 rounded-full bg-coral-soft px-2.5 py-1 text-[11px] font-medium text-coral"
                  >
                    {formatShortDate(b.startDate)}
                    {b.endDate !== b.startDate ? `–${formatShortDate(b.endDate)}` : ''} · {b.reason}
                    <button
                      type="button"
                      onClick={() => removeBlockedRange(b.id)}
                      aria-label="Remove block"
                      className="hover:text-ink"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Dynamic Pricing & Multiplier Editor */}
      {currentSection === 'pricing' && (
        <div className="card space-y-5 p-5 sm:p-6 w-full">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <div>
              <p className="text-[11px] font-semibold text-coral uppercase">Storefront Pricing</p>
              <h4 className="font-display text-xl font-bold text-ink">Dynamic Price & Rate Editor</h4>
            </div>
            <DollarSign className="size-5 text-teal" />
          </div>

          {/* Base Tier Prices */}
          <div>
            <p className="mb-2 text-xs font-semibold text-ink">Base Tier Rates (USD $) — Updates Storefront Live</p>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {tiers.map((t) => (
                <label
                  key={t.id}
                  className="flex flex-col justify-between rounded-2xl border border-line bg-canvas p-3"
                >
                  <span className="text-xs font-medium text-ink-soft">{t.label}</span>
                  <div className="mt-1.5 flex items-center gap-1">
                    <span className="font-display text-lg font-semibold text-ink-mute">$</span>
                    <input
                      type="number"
                      min={1}
                      max={999}
                      value={studioSettings.basePrices[t.id]}
                      onChange={(e) => handlePriceChange(t.id, e.target.value)}
                      className="w-full rounded-lg border border-line bg-paper px-2 py-1 font-display text-lg font-semibold text-ink focus:border-ink focus:outline-none"
                    />
                  </div>
                  <span className="mt-1 text-[10px] text-ink-mute">
                    ≈ {formatMoney(studioSettings.basePrices[t.id], 'PHP')}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Add-on Multipliers */}
          <div>
            <p className="mb-2 text-xs font-semibold text-ink">Add-On Multipliers (% of Base Price)</p>
            <div className="grid grid-cols-3 gap-2.5">
              {(
                [
                  { key: 'nsfw', label: 'NSFW (+%)' },
                  { key: 'softFurry', label: 'Soft Furry (+%)' },
                  { key: 'commercial', label: 'Commercial (+%)' },
                ] as const
              ).map((m) => (
                <label key={m.key} className="rounded-2xl border border-line bg-canvas p-3">
                  <span className="block text-[11px] font-medium text-ink-soft">{m.label}</span>
                  <div className="mt-1.5 flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      max={500}
                      step={10}
                      value={Math.round(studioSettings.multipliers[m.key] * 100)}
                      onChange={(e) => handleMultiplierChange(m.key, e.target.value)}
                      className="w-full rounded-lg border border-line bg-paper px-2 py-1 font-display text-lg font-semibold text-ink focus:border-ink focus:outline-none"
                    />
                    <span className="text-xs font-semibold text-ink-mute">%</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* USD to PHP Exchange Rate */}
          <div className="flex flex-col justify-between gap-3 rounded-2xl border border-line bg-canvas p-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-xs font-semibold text-ink">GCash Exchange Rate (₱ PHP per $1 USD)</p>
              <p className="text-[11px] text-ink-mute">
                Used automatically when clients switch the calculator to ₱ PHP
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-display text-lg font-semibold text-ink">₱</span>
              <input
                type="number"
                min={1}
                max={200}
                step={0.5}
                value={studioSettings.usdToPhpRate}
                onChange={(e) =>
                  updateStudioSettings({ usdToPhpRate: Math.max(1, Number(e.target.value) || 58) })
                }
                className="w-24 rounded-xl border border-line bg-paper px-3 py-1.5 font-display text-lg font-semibold text-ink focus:border-ink focus:outline-none"
              />
            </div>
          </div>
        </div>
      )}

      {/* Studio Payment Credentials & Gateways (PayPal, GCash QR & Bank Accounts) */}
      {currentSection === 'gateways' && (
        <div className="card space-y-5 p-5 sm:p-6 w-full">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <div>
              <p className="text-[11px] font-semibold text-coral uppercase">Studio Payment Gateways</p>
              <h4 className="font-display text-xl font-bold text-ink">
                PayPal, GCash QR & Bank Credentials
              </h4>
              <p className="text-xs text-ink-soft">
                These details are presented to clients in the interactive payment modal, QR scanner, and invoices.
              </p>
            </div>
            <CreditCard className="size-5 text-coral" />
          </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* PayPal Card */}
          <div className="space-y-3 rounded-2xl border border-line bg-canvas p-4">
            <div className="flex items-center gap-2 text-xs font-bold text-[#003087]">
              <span className="grid size-6 place-items-center rounded-lg bg-[#003087]/10">
                <CreditCard className="size-3.5" />
              </span>
              <span>PayPal Credentials</span>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-ink-soft mb-1">
                PayPal Account Email
              </label>
              <input
                type="email"
                value={paymentDraft.paypalEmail}
                onChange={(e) => setPaymentDraft((p) => ({ ...p, paypalEmail: e.target.value }))}
                placeholder="meru.art@gmail.com"
                className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-xs text-ink focus:border-ink focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-ink-soft mb-1">
                PayPal.Me Username (optional)
              </label>
              <div className="flex items-center rounded-xl border border-line bg-paper px-3 py-2 text-xs text-ink">
                <span className="text-ink-mute mr-1 text-[11px]">paypal.me/</span>
                <input
                  type="text"
                  value={paymentDraft.paypalMeUsername}
                  onChange={(e) =>
                    setPaymentDraft((p) => ({
                      ...p,
                      paypalMeUsername: e.target.value.replace(/^https?:\/\/(www\.)?paypal\.me\//, ''),
                    }))
                  }
                  placeholder="meruartstudio"
                  className="w-full bg-transparent focus:outline-none text-xs"
                />
              </div>
            </div>
          </div>

          {/* GCash Card */}
          <div className="space-y-3 rounded-2xl border border-line bg-canvas p-4">
            <div className="flex items-center gap-2 text-xs font-bold text-[#005CE6]">
              <span className="grid size-6 place-items-center rounded-lg bg-[#005CE6]/10">
                <QrCode className="size-3.5" />
              </span>
              <span>GCash QR & Express Send</span>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-ink-soft mb-1">
                GCash Mobile Number
              </label>
              <input
                type="text"
                value={paymentDraft.gcashNumber}
                onChange={(e) => setPaymentDraft((p) => ({ ...p, gcashNumber: e.target.value }))}
                placeholder="09455121351"
                className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-xs text-ink focus:border-ink focus:outline-none font-mono"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-ink-soft mb-1">
                GCash Account Name
              </label>
              <input
                type="text"
                value={paymentDraft.gcashName}
                onChange={(e) => setPaymentDraft((p) => ({ ...p, gcashName: e.target.value }))}
                placeholder="Mhelric Banaag"
                className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-xs text-ink focus:border-ink focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-ink-soft mb-1">
                Official GCash QR Code Image
              </label>
              {paymentDraft.gcashQrImageUrl ? (
                <div className="relative flex items-center gap-3 rounded-xl border border-line bg-paper p-2">
                  <img
                    src={paymentDraft.gcashQrImageUrl}
                    alt="Custom GCash QR"
                    className="size-14 rounded-lg object-contain border border-line bg-white shrink-0 p-1"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold text-teal truncate">Custom QR Loaded</p>
                    <p className="text-[10px] text-ink-mute">Active on all client invoices & receipts</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const updated = { ...paymentDraft, gcashQrImageUrl: '' };
                      setPaymentDraft(updated);
                      updateStudioSettings({ paymentDetails: updated });
                      showToast('GCash QR code removed.');
                    }}
                    className="rounded-lg border border-line px-2 py-1 text-[10px] font-semibold text-coral hover:bg-cream"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-paper px-3 py-2.5 text-xs font-semibold text-ink-soft hover:border-ink hover:bg-cream transition">
                  <Upload className="size-3.5 text-coral" />
                  <span>Upload GCash QR Photo</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      showToast('Optimizing & saving official GCash QR...');
                      const optimized = await optimizeQrImage(file);
                      const updated = { ...paymentDraft, gcashQrImageUrl: optimized };
                      setPaymentDraft(updated);
                      updateStudioSettings({ paymentDetails: updated });
                      showToast('Official GCash QR loaded & saved!');
                    }}
                    className="hidden"
                  />
                </label>
              )}
            </div>
          </div>

          {/* Bank / Maya Card */}
          <div className="space-y-3 rounded-2xl border border-line bg-canvas p-4 sm:col-span-2 lg:col-span-1">
            <div className="flex items-center gap-2 text-xs font-bold text-ink">
              <span className="grid size-6 place-items-center rounded-lg bg-cream">
                <Building2 className="size-3.5 text-ink" />
              </span>
              <span>Bank Transfer / Maya</span>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-ink-soft mb-1">
                Bank / Platform Name
              </label>
              <input
                type="text"
                value={paymentDraft.bankName}
                onChange={(e) => setPaymentDraft((p) => ({ ...p, bankName: e.target.value }))}
                placeholder="Bank of the Philippine Islands (BPI)"
                className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-xs text-ink focus:border-ink focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-ink-soft mb-1">
                Account Number
              </label>
              <input
                type="text"
                value={paymentDraft.bankAccountNumber}
                onChange={(e) => setPaymentDraft((p) => ({ ...p, bankAccountNumber: e.target.value }))}
                placeholder="9425-0182-44"
                className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-xs text-ink focus:border-ink focus:outline-none font-mono"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-ink-soft mb-1">
                Account Holder Name
              </label>
              <input
                type="text"
                value={paymentDraft.bankAccountName}
                onChange={(e) => setPaymentDraft((p) => ({ ...p, bankAccountName: e.target.value }))}
                placeholder="Mhelric Banaag"
                className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-xs text-ink focus:border-ink focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-line">
          <p className="text-[11px] text-ink-mute">
            Live changes will reflect in all client payment dialogs instantly.
          </p>
          <button
            type="button"
            onClick={handleSavePaymentDetails}
            className="inline-flex items-center gap-1.5 rounded-full bg-ink px-5 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-coral"
          >
            <Check className="size-3.5 text-mustard" />
            <span>Save Payment Credentials</span>
          </button>
        </div>
      </div>
      )}
    </div>
  );
}
