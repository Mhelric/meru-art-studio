import { useState, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Lock,
  Minus,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { useStudio } from '@/context/StudioContext';
import { cn, formatMoney, formatShortDate } from '@/lib/utils';
import type { AvailabilityStatus, TierId } from '@/types';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function toIsoDate(year: number, monthIndex: number, day: number) {
  const m = String(monthIndex + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

export function StudioSettingsTab() {
  const {
    studioSettings,
    tiers,
    updateStudioSettings,
    resetStudioSettings,
    toggleBlockedDate,
    removeBlockedRange,
    queueSlots,
    showToast,
  } = useStudio();

  // Mini-calendar state for 1-click date blocking
  const [cursor, setCursor] = useState<{ year: number; month: number }>(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [blockReason, setBlockReason] = useState('Studio Busy / Exam Day');

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

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Availability & Slots (6 cols) */}
        <div className="card space-y-5 p-5 lg:col-span-6">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <div>
              <p className="text-[11px] font-semibold text-coral uppercase">1. Availability & Slots</p>
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

          {/* Interactive Date Blocker */}
          <div className="rounded-2xl border border-line bg-canvas p-3.5">
            <div className="mb-2.5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-ink">Click Dates to Block / Unblock</p>
                <p className="text-[11px] text-ink-mute">{monthLabel} · Syncs with Schedule tab</p>
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

            <input
              type="text"
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
              placeholder="Reason for blocking (e.g. CS Finals Week)"
              className="mb-2.5 w-full rounded-xl border border-line bg-paper px-3 py-1.5 text-xs text-ink focus:border-ink focus:outline-none"
            />

            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium text-ink-mute">
              {WEEKDAYS.map((w) => (
                <div key={w}>{w}</div>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {calendarDays.map((cell, i) =>
                !cell ? (
                  <div key={`e-${i}`} className="h-8" />
                ) : (
                  <button
                    key={cell.iso}
                    type="button"
                    onClick={() => {
                      toggleBlockedDate(cell.iso, blockReason);
                      showToast(
                        cell.blocked
                          ? `Unblocked ${formatShortDate(cell.iso)}`
                          : `Blocked ${formatShortDate(cell.iso)} (${blockReason})`,
                      );
                    }}
                    className={cn(
                      'flex h-8 items-center justify-center gap-0.5 rounded-lg border text-xs font-medium transition-colors',
                      cell.blocked
                        ? 'border-coral bg-coral text-white'
                        : 'border-line bg-paper text-ink hover:border-ink/40',
                    )}
                  >
                    <span>{cell.day}</span>
                    {cell.blocked && <Lock className="size-2.5" />}
                  </button>
                ),
              )}
            </div>

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

        {/* Dynamic Pricing & Multiplier Editor (6 cols) */}
        <div className="card space-y-5 p-5 lg:col-span-6">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <div>
              <p className="text-[11px] font-semibold text-coral uppercase">2. Live Storefront Pricing</p>
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
      </div>
    </div>
  );
}
