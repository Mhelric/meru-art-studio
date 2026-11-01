import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  Calendar,
  Check,
  Eye,
  ImagePlus,
  Layers,
  Send,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { STAGE_STEPS } from '@/data/orders';
import { useStudio } from '@/context/StudioContext';
import {
  ACCENT_CLASSES,
  TIER_ACCENT,
  cn,
  formatUsd,
  getTier,
  getLocalTodayDate,
  getLocalFutureDate,
} from '@/lib/utils';
import { uploadWipArtwork } from '@/lib/storage';
import type { SubmittedOrder } from '@/types';

interface PipelineTabProps {
  orders: SubmittedOrder[];
  activeOrderId: string;
  setActiveOrderId: (id: string) => void;
  onOpenCancelModal?: (order: SubmittedOrder) => void;
}

export function PipelineTab({
  orders,
  activeOrderId,
  setActiveOrderId,
  onOpenCancelModal,
}: PipelineTabProps) {
  const {
    setOrderStage,
    toggleOrderPaymentFlag,
    updateOrderSchedule,
    uploadArtistWip,
    sendOrderMessage,
    setActiveTab,
    showToast,
  } = useStudio();

  // Active Order Fallback Guard (prevents null reference renders)
  const selectedOrder = useMemo(() => {
    return orders.find((o) => o.id === activeOrderId) ?? orders[0] ?? null;
  }, [orders, activeOrderId]);

  // WIP uploader state
  const [wipTitle, setWipTitle] = useState('');
  const [wipNote, setWipNote] = useState('');
  const [wipIsFinal, setWipIsFinal] = useState(false);
  const [artistReply, setArtistReply] = useState('');
  const wipFileRef = useRef<HTMLInputElement | null>(null);

  const handleWipUpload = (e: FormEvent, customUrl?: string) => {
    e.preventDefault();
    if (!selectedOrder) return;
    const defaultTitle = wipIsFinal
      ? `Final · High-Res ${getTier(selectedOrder.tier).label} Illustration`
      : `WIP #${selectedOrder.wips.length + 1} · Updated Progress`;
    uploadArtistWip(selectedOrder.id, {
      title: wipTitle.trim() || defaultTitle,
      artistNote: wipNote.trim() || 'Uploaded from Artist Admin Controller! Let me know your thoughts.',
      isFinal: wipIsFinal,
      imageUrl: customUrl,
    });
    setWipTitle('');
    setWipNote('');
  };

  const handleWipFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedOrder) return;

    const title = wipTitle.trim() || `${wipIsFinal ? 'Final' : 'WIP'} · ${file.name}`;
    const artistNote = wipNote.trim() || 'Uploaded new progress image from Admin Panel.';

    if (selectedOrder.id !== 'MRU-KITSUNE') {
      showToast('Processing artwork, applying watermark shield & uploading...');
      const { previewPath, masterPath, error } = await uploadWipArtwork(
        selectedOrder.id,
        selectedOrder.orderCode || selectedOrder.id,
        file,
        wipIsFinal,
      );
      if (error || !previewPath) {
        showToast(`Upload failed: ${error ?? 'Unknown error'}`);
      } else {
        uploadArtistWip(selectedOrder.id, {
          title,
          artistNote,
          isFinal: wipIsFinal,
          imageUrl: previewPath,
          highResUrl: masterPath || undefined,
        });
      }
    } else {
      const url = URL.createObjectURL(file);
      uploadArtistWip(selectedOrder.id, {
        title,
        artistNote,
        isFinal: wipIsFinal,
        imageUrl: url,
      });
    }

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

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-3xl border border-line bg-paper/60 p-12 text-center">
        <div className="grid size-14 place-items-center rounded-full bg-cream text-ink-mute">
          <Layers className="size-7" />
        </div>
        <h3 className="mt-4 font-display text-xl font-bold text-ink">No Active Commissions in Pipeline</h3>
        <p className="mt-1 max-w-md text-xs text-ink-soft">
          There are currently no commissions in progress. Review incoming briefs in the "Incoming Briefs" tab to accept new projects into the active pipeline.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Active Order Horizontal Switcher */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold text-ink">
            Active Commissions In Production ({orders.length}):
          </p>
          <span className="text-[11px] text-ink-mute">Select an order to manage</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {orders.map((o) => {
            const active = selectedOrder?.id === o.id;
            const code = o.orderCode || o.id;
            const tier = getTier(o.tier);

            return (
              <button
                key={o.id}
                type="button"
                onClick={() => setActiveOrderId(o.id)}
                className={cn(
                  'flex items-center gap-2 rounded-2xl px-3.5 py-2 text-xs font-semibold transition-all',
                  active
                    ? 'bg-ink text-white shadow-xs'
                    : 'border border-line bg-paper text-ink-soft hover:border-ink/30 hover:text-ink',
                )}
              >
                <span>#{code}</span>
                <span className="opacity-70">· {tier.label}</span>
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.2 text-[10px] font-bold uppercase',
                    active ? 'bg-mustard text-ink' : 'bg-cream text-ink-mute',
                  )}
                >
                  {o.stage.replace('_', ' ')}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {selectedOrder && (
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Left Column (7 cols): Brief Details, Stage Controller & Schedule */}
          <div className="space-y-4 lg:col-span-7">
            {/* Header info */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-line bg-paper p-5 shadow-xs">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${ACCENT_CLASSES[TIER_ACCENT[selectedOrder.tier]].soft} ${ACCENT_CLASSES[TIER_ACCENT[selectedOrder.tier]].text}`}
                  >
                    {getTier(selectedOrder.tier).label} × {selectedOrder.characterCount}
                  </span>
                  <span className="font-display text-xl font-bold text-ink">
                    #{selectedOrder.orderCode || selectedOrder.id} · {selectedOrder.characterName || 'Client Request'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-ink-soft">
                  Client: <span className="font-semibold text-ink">{selectedOrder.clientContact || 'Anonymous'}</span>
                  {selectedOrder.poseAndVibe ? ` — "${selectedOrder.poseAndVibe}"` : ''}
                </p>
              </div>

              <div className="text-right">
                <p className="font-display text-2xl font-bold text-ink">
                  {formatUsd(selectedOrder.totalUsd)}
                </p>
                <p className="text-[11px] text-ink-mute">
                  Deposit: {formatUsd(selectedOrder.depositUsd)} ({selectedOrder.paymentSplit === '50_50' ? '50/50' : '100% upfront'})
                </p>
              </div>
            </div>

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
                    Remaining ({formatUsd(Math.max(0, selectedOrder.totalUsd - selectedOrder.depositUsd))})
                  </p>
                  <p className="text-[11px] text-ink-mute">
                    {selectedOrder.finalPaid ? 'Verified · Deliverable Unlocked' : 'Click to mark receipt verified'}
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
            <div className="rounded-3xl border border-line bg-paper p-5">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold text-ink">Set Milestone Stage:</p>
                <span className="text-[11px] text-ink-mute">High-Res unlocked at Completed</span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
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
                        'rounded-xl border px-3 py-2 text-left text-xs font-semibold transition-all',
                        active
                          ? 'border-ink bg-ink text-white shadow-xs'
                          : 'border-line bg-canvas text-ink-soft hover:border-ink/30 hover:text-ink',
                      )}
                    >
                      {idx + 1}. {st.shortLabel}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-3">
                <span className="text-[11px] text-ink-mute">Client requested cancellation or unable to fulfill?</span>
                <button
                  type="button"
                  onClick={() => onOpenCancelModal?.(selectedOrder)}
                  className="inline-flex items-center gap-1 rounded-xl border border-coral/30 bg-coral/5 px-2.5 py-1.5 text-xs font-semibold text-coral transition hover:bg-coral hover:text-white"
                >
                  <XCircle className="size-3.5" /> Cancel Commission
                </button>
              </div>
            </div>

            {/* Start & Delivery Schedule Date Pickers */}
            <div className="grid grid-cols-2 gap-3 rounded-3xl border border-line bg-paper p-4">
              <div>
                <label className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-ink-soft">
                  <Calendar className="size-3 text-coral" /> Est. Start Date
                </label>
                <input
                  type="date"
                  value={selectedOrder.startDate ?? selectedOrder.preferredStartDate ?? getLocalTodayDate()}
                  onChange={(e) =>
                    updateOrderSchedule(
                      selectedOrder.id,
                      e.target.value,
                      selectedOrder.estEndDate ?? getLocalFutureDate(14),
                    )
                  }
                  className="w-full rounded-xl border border-line bg-canvas px-3 py-1.5 text-xs text-ink"
                />
              </div>
              <div>
                <label className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-ink-soft">
                  <Calendar className="size-3 text-teal" /> Est. Delivery Date
                </label>
                <input
                  type="date"
                  value={selectedOrder.estEndDate ?? getLocalFutureDate(14)}
                  onChange={(e) =>
                    updateOrderSchedule(
                      selectedOrder.id,
                      selectedOrder.startDate ?? selectedOrder.preferredStartDate ?? getLocalTodayDate(),
                      e.target.value,
                    )
                  }
                  className="w-full rounded-xl border border-line bg-canvas px-3 py-1.5 text-xs text-ink"
                />
              </div>
            </div>
          </div>

          {/* Right Column (5 cols): WIP Uploader & Chat */}
          <div className="space-y-4 lg:col-span-5">
            {/* Upload WIP */}
            <form onSubmit={handleWipUpload} className="space-y-3 rounded-3xl border border-line bg-paper p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <h4 className="font-display text-base font-bold text-ink">Upload WIP or Final Master</h4>
                <span className="text-[11px] text-ink-mute">{selectedOrder.wips.length} in vault</span>
              </div>

              <input
                type="text"
                value={wipTitle}
                onChange={(e) => setWipTitle(e.target.value)}
                placeholder="Title (e.g. WIP #2 · Lineart & Shading)"
                className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-xs text-ink focus:border-ink focus:outline-none"
              />

              <textarea
                rows={2}
                value={wipNote}
                onChange={(e) => setWipNote(e.target.value)}
                placeholder="Artist note shown to the client..."
                className="w-full resize-none rounded-xl border border-line bg-canvas p-2.5 text-xs text-ink focus:border-ink focus:outline-none"
              />

              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-ink">
                <input
                  type="checkbox"
                  checked={wipIsFinal}
                  onChange={(e) => setWipIsFinal(e.target.checked)}
                  className="size-4 accent-ink"
                />
                Mark as Final Master (Unlocks 300 DPI high-res)
              </label>

              <input
                ref={wipFileRef}
                type="file"
                accept="image/*"
                onChange={handleWipFileSelect}
                className="hidden"
              />

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => wipFileRef.current?.click()}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-line bg-canvas py-2.5 text-xs font-semibold text-ink transition hover:border-ink"
                >
                  <ImagePlus className="size-3.5 text-coral" /> Choose File
                </button>
                <button
                  type="submit"
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-ink py-2.5 text-xs font-semibold text-white transition hover:bg-coral"
                >
                  <Sparkles className="size-3.5 text-mustard" /> Post Sample WIP
                </button>
              </div>
            </form>

            {/* Quick Artist Chat */}
            <form onSubmit={handleSendArtistMessage} className="space-y-2.5 rounded-3xl border border-line bg-paper p-5 shadow-xs">
              <h4 className="font-display text-base font-bold text-ink">Send Message as Meru Art</h4>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={artistReply}
                  onChange={(e) => setArtistReply(e.target.value)}
                  placeholder="Send a live update to the client room..."
                  className="flex-1 rounded-full border border-line bg-canvas px-3.5 py-2 text-xs text-ink focus:border-ink focus:outline-none"
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
              className="flex w-full items-center justify-center gap-1.5 rounded-full border border-ink/20 bg-cream/80 py-2.5 text-xs font-semibold text-ink transition hover:bg-ink hover:text-white"
            >
              <Eye className="size-3.5" /> View #{selectedOrder.orderCode || selectedOrder.id} in Client Tracker Room →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
