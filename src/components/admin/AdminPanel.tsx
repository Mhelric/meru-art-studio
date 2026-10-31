import {
  Calendar,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Eye,
  ImagePlus,
  Lock,
  Minus,
  Plus,
  RotateCcw,
  Send,
  Sliders,
  Sparkles,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { STAGE_STEPS } from '@/data/orders';
import { useStudio } from '@/context/StudioContext';
import { ACCENT_CLASSES, TIER_ACCENT, cn, formatMoney, formatShortDate, formatUsd, getTier } from '@/lib/utils';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { Reveal } from '@/components/ui/Reveal';
import type { AvailabilityStatus, TierId } from '@/types';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function toIsoDate(year: number, monthIndex: number, day: number) {
  const m = String(monthIndex + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

/**
 * Phase 5: Artist "Dev Mode" / Admin Control Panel.
 * Protected by artist UID + toggleable via the "Dev Preview" switch for portfolio showcase.
 * 1. Quick Toggles: Flip OPEN / WAITLIST / CLOSED, adjust active max slots, click dates on the calendar to mark them Blocked/Busy.
 * 2. Dynamic Price Editor: Edit USD base prices, add-on multipliers (+50% / +200%), and PHP exchange rate live without redeploying.
 * 3. Order & Payment Controller: Approve/decline incoming briefs, verify 50%/100% payment receipts, upload WIPs, and set start/completion dates.
 */
export function AdminPanel() {
  const {
    studioSettings,
    tiers,
    updateStudioSettings,
    resetStudioSettings,
    toggleBlockedDate,
    removeBlockedRange,
    queueSlots,
    submittedOrders,
    activeOrderId,
    setActiveOrderId,
    setOrderStage,
    declineOrder,
    toggleOrderPaymentFlag,
    updateOrderSchedule,
    uploadArtistWip,
    sendOrderMessage,
    devAdminPreview,
    setDevAdminPreview,
    setActiveTab,
    showToast,
  } = useStudio();

  // Mini-calendar state for 1-click date blocking
  const [cursor, setCursor] = useState<{ year: number; month: number }>({ year: 2026, month: 10 }); // Nov 2026
  const [blockReason, setBlockReason] = useState('Studio Busy / Exam Day');

  // WIP uploader state
  const [wipTitle, setWipTitle] = useState('');
  const [wipNote, setWipNote] = useState('');
  const [wipIsFinal, setWipIsFinal] = useState(false);
  const [artistReply, setArtistReply] = useState('');
  const wipFileRef = useRef<HTMLInputElement | null>(null);

  const selectedOrder = useMemo(
    () => submittedOrders.find((o) => o.id === activeOrderId) ?? submittedOrders[0],
    [submittedOrders, activeOrderId],
  );

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

  const handleWipUpload = (e: FormEvent, customUrl?: string) => {
    e.preventDefault();
    if (!selectedOrder) return;
    const defaultTitle = wipIsFinal
      ? `Final · High-Res ${getTier(selectedOrder.tier).label} Illustration`
      : `WIP #${selectedOrder.wips.length + 1} · Updated Sketch & Shading Check`;
    uploadArtistWip(selectedOrder.id, {
      title: wipTitle.trim() || defaultTitle,
      artistNote: wipNote.trim() || 'Uploaded from Artist Admin Controller! Let me know your thoughts.',
      isFinal: wipIsFinal,
      imageUrl: customUrl,
    });
    setWipTitle('');
    setWipNote('');
  };

  const handleWipFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedOrder) return;
    const url = URL.createObjectURL(file);
    uploadArtistWip(selectedOrder.id, {
      title: wipTitle.trim() || `${wipIsFinal ? 'Final' : 'WIP'} · ${file.name}`,
      artistNote: wipNote.trim() || 'Uploaded new progress image from Admin Panel.',
      isFinal: wipIsFinal,
      imageUrl: url,
    });
    setWipTitle('');
    setWipNote('');
    e.target.value = '';
  };

  const handleSendArtistMessage = (e: FormEvent) => {
    e.preventDefault();
    if (!selectedOrder || !artistReply.trim()) return;
    sendOrderMessage(selectedOrder.id, artistReply.trim(), { senderRole: 'artist' });
    setArtistReply('');
    showToast('Sent message as Meru Art!');
  };

  return (
    <section className="pt-28 pb-14 sm:pt-32">
      {/* Top Dev Mode Showcase Banner */}
      <Reveal className="mb-6 flex flex-col justify-between gap-3 rounded-3xl border border-ink/20 bg-cream/80 p-4 sm:flex-row sm:items-center sm:px-6">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-ink text-mustard">
            <Sliders className="size-5" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold tracking-wider text-coral uppercase">
                Artist Admin & Dev Preview
              </span>
              <span className="rounded-full bg-teal-soft px-2 py-0.5 text-[10px] font-semibold text-teal">
                RLS Protected (`is_artist_admin()`)
              </span>
            </div>
            <p className="mt-0.5 text-xs text-ink-soft">
              Changes made here update the public storefront, calculator, availability calendar, and client order tracker in real time.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setDevAdminPreview(!devAdminPreview)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium transition-colors',
              devAdminPreview ? 'bg-ink text-white' : 'border border-line bg-paper text-ink-soft',
            )}
          >
            <Eye className="size-3.5 text-mustard" />
            Dev Preview: {devAdminPreview ? 'ON' : 'OFF'}
          </button>
          <button
            type="button"
            onClick={resetStudioSettings}
            title="Reset all prices, multipliers & blocked dates to defaults"
            className="inline-flex items-center gap-1 rounded-full border border-line bg-paper px-3 py-2 text-xs font-medium text-ink-soft transition hover:border-ink hover:text-ink"
          >
            <RotateCcw className="size-3.5" /> Reset
          </button>
        </div>
      </Reveal>

      <SectionHeading
        eyebrow="Studio Backoffice"
        title="Artist admin control panel"
        subtitle="Manage commission availability, live USD/PHP pricing, blocked calendar dates, incoming briefs, payment gates, and WIP drops."
      />

      {/* TOP ROW: 1. QUICK STUDIO TOGGLES + CALENDAR BLOCKER & 2. DYNAMIC PRICE EDITOR */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Column 1 (6 cols): Quick Toggles + Interactive Calendar Date Blocker */}
        <Reveal delay={0.05} className="card space-y-5 p-5 lg:col-span-6">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <div>
              <p className="text-[11px] font-semibold text-coral uppercase">1. Availability & Slots</p>
              <h3 className="font-display text-2xl font-semibold text-ink">Quick Studio Toggles</h3>
            </div>
            <span className="rounded-full bg-canvas px-3 py-1 text-xs font-semibold text-ink ring-1 ring-line">
              {queueSlots.length}/{studioSettings.maxSlots} Active
            </span>
          </div>

          {/* Commission Status Flipper (OPEN / WAITLIST / CLOSED) */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink">Commission Status Badge</label>
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
              <p className="text-xs font-medium text-ink">Maximum Active Commission Slots</p>
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

          {/* Click-to-Block Mini Calendar */}
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
                  className="grid size-7 place-items-center rounded-full border border-line bg-paper text-ink"
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
                  className="grid size-7 place-items-center rounded-full border border-line bg-paper text-ink"
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
        </Reveal>

        {/* Column 2 (6 cols): Dynamic Price & Multiplier Editor */}
        <Reveal delay={0.1} className="card space-y-5 p-5 lg:col-span-6">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <div>
              <p className="text-[11px] font-semibold text-coral uppercase">2. Live Storefront Pricing</p>
              <h3 className="font-display text-2xl font-semibold text-ink">Dynamic Price & Rate Editor</h3>
            </div>
            <DollarSign className="size-5 text-teal" />
          </div>

          {/* Base Tier Prices */}
          <div>
            <p className="mb-2 text-xs font-medium text-ink">Base Tier Rates (USD $) — Updates Storefront & Calculator Live</p>
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
            <p className="mb-2 text-xs font-medium text-ink">Add-On Multipliers (% of Base Price)</p>
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
        </Reveal>
      </div>

      {/* BOTTOM ROW: 3. ORDER, PAYMENT GATE & WIP CONTROLLER */}
      <Reveal delay={0.15} className="card mt-6 p-5 sm:p-6">
        <div className="mb-5 flex flex-col justify-between gap-3 border-b border-line pb-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-[11px] font-semibold text-coral uppercase">3. Order & Payment Controller</p>
            <h3 className="font-display text-2xl font-semibold text-ink">
              Approve briefs, verify 50%/100% receipts & upload WIPs
            </h3>
          </div>

          {/* Order Switcher */}
          <div className="flex flex-wrap gap-1.5">
            {submittedOrders.map((o) => {
              const active = selectedOrder?.id === o.id;
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setActiveOrderId(o.id)}
                  className={cn(
                    'rounded-full px-3.5 py-1.5 text-xs font-medium transition-all',
                    active
                      ? 'bg-ink text-white'
                      : 'border border-line bg-canvas text-ink-soft hover:border-ink/30 hover:text-ink',
                  )}
                >
                  #{o.id} · {getTier(o.tier).label}
                  {o.stage === 'pending_review' && !o.declined && (
                    <span className="ml-1.5 rounded-full bg-mustard px-1.5 py-0.2 text-[10px] font-bold text-ink">
                      NEW
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {selectedOrder && (
          <div className="grid gap-6 lg:grid-cols-12">
            {/* Left (7 cols): Brief Inspection, Stage Pipeline, Payment Verification & Schedule Dates */}
            <div className="space-y-4 lg:col-span-7">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-canvas p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${ACCENT_CLASSES[TIER_ACCENT[selectedOrder.tier]].soft} ${ACCENT_CLASSES[TIER_ACCENT[selectedOrder.tier]].text}`}
                    >
                      {getTier(selectedOrder.tier).label} × {selectedOrder.characterCount}
                    </span>
                    <span className="font-display text-xl font-semibold text-ink">
                      #{selectedOrder.id} · {selectedOrder.characterName || 'Client Request'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-ink-soft">{selectedOrder.poseAndVibe}</p>
                </div>

                <div className="text-right">
                  <p className="font-display text-2xl font-semibold text-ink">
                    {formatUsd(selectedOrder.totalUsd)}
                  </p>
                  <p className="text-[11px] text-ink-mute">
                    Deposit: {formatUsd(selectedOrder.depositUsd)} ({selectedOrder.paymentSplit === '50_50' ? '50/50' : '100%'})
                  </p>
                </div>
              </div>

              {/* Quick Approve / Decline Incoming Brief Bar */}
              {selectedOrder.stage === 'pending_review' && !selectedOrder.declined && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-mustard/50 bg-mustard-soft/60 p-3.5">
                  <div className="text-xs">
                    <p className="font-semibold text-ink">Incoming Brief in Pending Review</p>
                    <p className="text-ink-soft">
                      Approving unlocks the client’s upfront deposit gate and reserves a public slot.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setOrderStage(selectedOrder.id, 'awaiting_deposit');
                        showToast(`Approved #${selectedOrder.id}! Client notified to upload deposit.`);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-full bg-teal px-4 py-2 text-xs font-medium text-white transition hover:opacity-95"
                    >
                      <CheckCircle2 className="size-3.5" /> Approve Brief
                    </button>
                    <button
                      type="button"
                      onClick={() => declineOrder(selectedOrder.id)}
                      className="inline-flex items-center gap-1 rounded-full border border-coral/40 bg-paper px-3.5 py-2 text-xs font-medium text-coral transition hover:bg-coral-soft"
                    >
                      <XCircle className="size-3.5" /> Decline
                    </button>
                  </div>
                </div>
              )}

              {/* Payment Verification Toggles */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    toggleOrderPaymentFlag(selectedOrder.id, 'depositPaid');
                    showToast('Updated upfront deposit verification!');
                  }}
                  className={cn(
                    'flex items-center justify-between rounded-2xl border p-3.5 text-left transition-all',
                    selectedOrder.depositPaid
                      ? 'border-teal bg-teal-soft/50 text-ink'
                      : 'border-line bg-canvas text-ink-soft',
                  )}
                >
                  <div>
                    <p className="text-xs font-semibold text-ink">Upfront Deposit ({formatUsd(selectedOrder.depositUsd)})</p>
                    <p className="text-[11px] text-ink-mute">
                      {selectedOrder.depositPaid ? 'Verified · Sketch Unlocked' : 'Click to mark receipt verified'}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'grid size-6 place-items-center rounded-full',
                      selectedOrder.depositPaid ? 'bg-teal text-white' : 'border border-line bg-paper',
                    )}
                  >
                    {selectedOrder.depositPaid && <Check className="size-3.5" strokeWidth={3} />}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    toggleOrderPaymentFlag(selectedOrder.id, 'finalPaid');
                    showToast('Updated final payment verification!');
                  }}
                  className={cn(
                    'flex items-center justify-between rounded-2xl border p-3.5 text-left transition-all',
                    selectedOrder.finalPaid
                      ? 'border-teal bg-teal-soft/50 text-ink'
                      : 'border-line bg-canvas text-ink-soft',
                  )}
                >
                  <div>
                    <p className="text-xs font-semibold text-ink">
                      Remaining 50% ({formatUsd(Math.max(0, selectedOrder.totalUsd - selectedOrder.depositUsd))})
                    </p>
                    <p className="text-[11px] text-ink-mute">
                      {selectedOrder.finalPaid ? 'Verified · Lineart Unlocked' : 'Click to mark receipt verified'}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'grid size-6 place-items-center rounded-full',
                      selectedOrder.finalPaid ? 'bg-teal text-white' : 'border border-line bg-paper',
                    )}
                  >
                    {selectedOrder.finalPaid && <Check className="size-3.5" strokeWidth={3} />}
                  </span>
                </button>
              </div>

              {/* Stage Controller Pills */}
              <div>
                <p className="mb-1.5 text-xs font-medium text-ink">Set Commission Stage (Unlocks High-Res at Completed)</p>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {STAGE_STEPS.map((st, idx) => {
                    const active = selectedOrder.stage === st.id;
                    return (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => {
                          setOrderStage(selectedOrder.id, st.id);
                          showToast(`#${selectedOrder.id} moved to ${st.shortLabel}`);
                        }}
                        className={cn(
                          'rounded-xl border px-3 py-2 text-left text-xs font-medium transition-all',
                          active
                            ? 'border-ink bg-ink text-white'
                            : 'border-line bg-canvas text-ink-soft hover:border-ink/30 hover:text-ink',
                        )}
                      >
                        {idx + 1}. {st.shortLabel}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Start & Estimated Completion Date Pickers for Public Calendar */}
              <div className="grid grid-cols-2 gap-3 rounded-2xl border border-line bg-canvas p-3.5">
                <div>
                  <label className="mb-1 flex items-center gap-1 text-[11px] font-medium text-ink-soft">
                    <Calendar className="size-3 text-coral" /> Est. Start Date
                  </label>
                  <input
                    type="date"
                    value={selectedOrder.startDate ?? selectedOrder.preferredStartDate ?? '2026-11-02'}
                    onChange={(e) =>
                      updateOrderSchedule(
                        selectedOrder.id,
                        e.target.value,
                        selectedOrder.estEndDate ?? '2026-11-16',
                      )
                    }
                    className="w-full rounded-xl border border-line bg-paper px-2.5 py-1.5 text-xs text-ink"
                  />
                </div>
                <div>
                  <label className="mb-1 flex items-center gap-1 text-[11px] font-medium text-ink-soft">
                    <Calendar className="size-3 text-teal" /> Est. Completion Date
                  </label>
                  <input
                    type="date"
                    value={selectedOrder.estEndDate ?? '2026-11-16'}
                    onChange={(e) =>
                      updateOrderSchedule(
                        selectedOrder.id,
                        selectedOrder.startDate ?? selectedOrder.preferredStartDate ?? '2026-11-02',
                        e.target.value,
                      )
                    }
                    className="w-full rounded-xl border border-line bg-paper px-2.5 py-1.5 text-xs text-ink"
                  />
                </div>
              </div>
            </div>

            {/* Right (5 cols): Upload New WIP / Final Artwork + Send Artist Message */}
            <div className="space-y-4 lg:col-span-5">
              <form onSubmit={handleWipUpload} className="rounded-2xl border border-line bg-canvas p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="font-display text-lg font-semibold text-ink">Upload WIP or Final Master</p>
                  <span className="text-[11px] text-ink-mute">{selectedOrder.wips.length} in vault</span>
                </div>

                <input
                  type="text"
                  value={wipTitle}
                  onChange={(e) => setWipTitle(e.target.value)}
                  placeholder="Title (e.g. WIP #3 · Lineart & Base Colors)"
                  className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-xs text-ink focus:border-ink focus:outline-none"
                />

                <textarea
                  rows={2}
                  value={wipNote}
                  onChange={(e) => setWipNote(e.target.value)}
                  placeholder="Artist note shown to the client..."
                  className="w-full resize-none rounded-xl border border-line bg-paper p-2.5 text-xs text-ink focus:border-ink focus:outline-none"
                />

                <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-ink">
                  <input
                    type="checkbox"
                    checked={wipIsFinal}
                    onChange={(e) => setWipIsFinal(e.target.checked)}
                    className="size-4 accent-ink"
                  />
                  Mark as Final Master (Completes order & unlocks High-Res)
                </label>

                <input
                  ref={wipFileRef}
                  type="file"
                  accept="image/*"
                  onChange={handleWipFileSelect}
                  className="hidden"
                />

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => wipFileRef.current?.click()}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-line bg-paper py-2.5 text-xs font-medium text-ink transition hover:border-ink"
                  >
                    <ImagePlus className="size-3.5 text-coral" /> Choose Image File
                  </button>
                  <button
                    type="submit"
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-ink py-2.5 text-xs font-medium text-white transition hover:bg-coral"
                  >
                    <Sparkles className="size-3.5 text-mustard" /> Post Sample WIP
                  </button>
                </div>
              </form>

              {/* Quick Artist Chat Message Box */}
              <form onSubmit={handleSendArtistMessage} className="rounded-2xl border border-line bg-canvas p-4 space-y-2.5">
                <p className="font-display text-lg font-semibold text-ink">Post Message as Meru Art</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={artistReply}
                    onChange={(e) => setArtistReply(e.target.value)}
                    placeholder="Send a live update to the client room..."
                    className="flex-1 rounded-full border border-line bg-paper px-3.5 py-2 text-xs text-ink focus:border-ink focus:outline-none"
                  />
                  <button
                    type="submit"
                    aria-label="Send artist message"
                    className="grid size-9 shrink-0 place-items-center rounded-full bg-ink text-white transition hover:bg-coral"
                  >
                    <Send className="size-3.5" />
                  </button>
                </div>
              </form>

              <button
                type="button"
                onClick={() => setActiveTab('track')}
                className="flex w-full items-center justify-center gap-1.5 rounded-full border border-ink/25 bg-cream/70 py-2.5 text-xs font-medium text-ink transition hover:bg-ink hover:text-white"
              >
                <Eye className="size-3.5" /> View #{selectedOrder.id} in Client Tracker Room →
              </button>
            </div>
          </div>
        )}
      </Reveal>
    </section>
  );
}
