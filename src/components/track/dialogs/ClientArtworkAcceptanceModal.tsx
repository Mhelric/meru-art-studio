import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Heart,
  Sparkles,
  Coffee,
  Gift,
  Check,
  X,
  ShieldCheck,
  ArrowRight,
  ExternalLink,
  QrCode,
  DollarSign,
  Star,
  Globe,
  UserCheck,
  Lock,
} from 'lucide-react';
import type { SubmittedOrder, WipUploadItem, ClientReview } from '@/types';
import { formatMoney } from '@/lib/utils';
import { artSrc } from '@/components/portfolio/ArtImage';
import { lockScroll } from '@/lib/smoothScroll';
import { DEFAULT_PAYMENT_DETAILS } from '@/context/StudioContext';

interface ClientArtworkAcceptanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: SubmittedOrder;
  finalWip?: WipUploadItem;
  onConfirmAcceptance: (
    tipAmountUsd: number,
    thankYouMessage: string,
    review?: ClientReview,
  ) => Promise<void> | void;
}

const TIP_PRESETS = [
  { amount: 0, label: 'No Tip', icon: Check, description: 'Accept artwork only' },
  { amount: 5, label: '$5', sublabel: 'Coffee', icon: Coffee, description: 'Buy Meru a warm matcha coffee' },
  { amount: 10, label: '$10', sublabel: 'Treat', icon: Heart, description: 'Sweet treat for studio energy' },
  { amount: 20, label: '$20', sublabel: 'Super Patron', icon: Gift, description: 'Generous studio patron tip' },
];

export function ClientArtworkAcceptanceModal({
  isOpen,
  onClose,
  order,
  finalWip,
  onConfirmAcceptance,
}: ClientArtworkAcceptanceModalProps) {
  const [selectedTip, setSelectedTip] = useState<number>(0);
  const [customTip, setCustomTip] = useState<string>('');
  const [isCustom, setIsCustom] = useState<boolean>(false);
  const [thankYouMessage, setThankYouMessage] = useState<string>(
    'Thank you so much Meru! I absolutely love how my commission turned out!',
  );
  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [reviewComment, setReviewComment] = useState<string>(
    'The illustration turned out gorgeous! Communication was super clear and the WIP updates were amazing to follow.',
  );
  const [reviewVisibility, setReviewVisibility] = useState<'public' | 'anonymous' | 'private'>('public');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [step, setStep] = useState<'review' | 'tip_payment'>('review');

  useEffect(() => {
    if (isOpen) {
      setSelectedTip(0);
      setCustomTip('');
      setIsCustom(false);
      setStep('review');
      setRating(5);
      setHoverRating(0);
      setReviewVisibility('public');
      setIsSubmitting(false);
      lockScroll(true);
      return () => lockScroll(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const displayCode = order.orderCode || order.id;
  const effectiveTip = isCustom ? Math.max(0, parseFloat(customTip) || 0) : selectedTip;
  const previewImage = finalWip?.imageUrl || (finalWip?.slug ? artSrc(finalWip.slug, 'sm') : null);

  const handleSelectPreset = (amount: number) => {
    setIsCustom(false);
    setSelectedTip(amount);
  };

  const handleSelectCustom = () => {
    setIsCustom(true);
  };

  const getReviewPayload = (): ClientReview => ({
    rating,
    comment: reviewComment.trim(),
    visibility: reviewVisibility,
    clientName: order.clientContact || 'Verified Client',
    createdAt: new Date().toISOString(),
  });

  const handleProceed = async () => {
    if (effectiveTip > 0 && step === 'review') {
      // If tipping, allow client to view the tip payment option or proceed
      setStep('tip_payment');
      return;
    }

    setIsSubmitting(true);
    try {
      await onConfirmAcceptance(effectiveTip, thankYouMessage.trim(), getReviewPayload());
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFinalizeWithTip = async () => {
    setIsSubmitting(true);
    try {
      await onConfirmAcceptance(effectiveTip, thankYouMessage.trim(), getReviewPayload());
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  // 1-Click PayPal tip link
  const paypalTipUrl = `https://www.paypal.com/cgi-bin/webscr?cmd=_xclick&business=${encodeURIComponent(
    DEFAULT_PAYMENT_DETAILS.paypalEmail,
  )}&item_name=${encodeURIComponent(`Meru Art Studio - Tip for #${displayCode}`)}&amount=${effectiveTip.toFixed(2)}&currency_code=USD&no_shipping=1`;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-ink/70 backdrop-blur-sm overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 12 }}
          transition={{ type: 'spring', damping: 26, stiffness: 320 }}
          className="relative w-full max-w-xl rounded-3xl border border-line bg-paper shadow-2xl overflow-hidden my-auto"
        >
          {/* Header Banner */}
          <div className="relative bg-gradient-to-r from-ink via-[#2a2438] to-ink px-6 py-5 text-white">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="absolute right-4 top-4 grid size-8 place-items-center rounded-full bg-white/10 text-white/80 hover:bg-white/20 transition disabled:opacity-50"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>

            <div className="flex items-center gap-2 text-mustard text-xs font-bold uppercase tracking-wider">
              <Sparkles className="size-4" />
              <span>Final Milestone Acceptance</span>
            </div>
            <h3 className="font-display text-xl sm:text-2xl font-bold mt-1 text-white">
              {step === 'review' ? 'Accept Artwork & Unlock Master Vault' : 'Thank You & Gratuity'}
            </h3>
            <p className="text-xs text-white/70 mt-1 max-w-md">
              {step === 'review'
                ? 'Confirming final acceptance locks in completion and unlocks your unwatermarked 300 DPI master deliverables.'
                : 'Send your tip directly to Meru via PayPal or GCash, and we will deliver your warm note.'}
            </p>
          </div>

          <div className="p-5 sm:p-6 space-y-5 max-h-[75vh] overflow-y-auto">
            {step === 'review' ? (
              <>
                {/* Deliverable Snapshot */}
                <div className="flex items-center gap-4 rounded-2xl border border-line bg-canvas p-3.5 shadow-2xs">
                  {previewImage ? (
                    <div className="relative size-16 shrink-0 overflow-hidden rounded-xl border border-line bg-paper">
                      <img
                        src={previewImage}
                        alt="Final Artwork"
                        className="size-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="grid size-16 shrink-0 place-items-center rounded-xl border border-line bg-paper text-coral">
                      <Sparkles className="size-6" />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-teal-soft px-2 py-0.5 text-[10px] font-bold text-teal">
                        Final Master Ready
                      </span>
                      <span className="text-[11px] font-mono text-ink-mute">#{displayCode}</span>
                    </div>
                    <h4 className="font-display text-sm sm:text-base font-bold text-ink truncate mt-0.5">
                      {order.tier ? `${order.tier.toUpperCase()} Illustration` : 'Finished Artwork'}
                    </h4>
                    <p className="text-xs text-ink-soft">
                      {order.characterName ? `Subject: ${order.characterName}` : 'Final deliverable ready for archival download'}
                    </p>
                  </div>
                </div>

                {/* Assurance Highlights */}
                <div className="grid grid-cols-2 gap-2 sm:gap-3 text-xs">
                  <div className="flex items-start gap-2 rounded-xl border border-line bg-paper p-2.5">
                    <ShieldCheck className="size-4 shrink-0 text-teal mt-0.5" />
                    <div>
                      <p className="font-semibold text-ink">300 DPI Archival PNG</p>
                      <p className="text-[11px] text-ink-mute">Lossless print-ready master file</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 rounded-xl border border-line bg-paper p-2.5">
                    <Check className="size-4 shrink-0 text-teal mt-0.5 stroke-[2.5]" />
                    <div>
                      <p className="font-semibold text-ink">Watermark Cleared</p>
                      <p className="text-[11px] text-ink-mute">Instant permanent download unlock</p>
                    </div>
                  </div>
                </div>

                {/* 5-Star Review & Testimonial Section */}
                <div className="rounded-2xl border border-line bg-canvas p-4 space-y-3.5 shadow-2xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h4 className="font-display text-sm font-bold text-ink flex items-center gap-1.5">
                        <Star className="size-4 text-mustard fill-mustard" />
                        <span>Commission Rating & Experience</span>
                      </h4>
                      <p className="text-[11px] text-ink-soft">
                        How did you like working with Meru and the final illustration?
                      </p>
                    </div>

                    {/* Interactive 5-Star Selector */}
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <button
                          key={s}
                          type="button"
                          onMouseEnter={() => setHoverRating(s)}
                          onMouseLeave={() => setHoverRating(0)}
                          onClick={() => setRating(s)}
                          className="p-1 transition-transform hover:scale-115 focus:outline-hidden"
                          title={`${s} Star${s > 1 ? 's' : ''}`}
                        >
                          <Star
                            className={`size-6 transition-colors ${
                              s <= (hoverRating || rating)
                                ? 'fill-[#f59e0b] text-[#f59e0b]'
                                : 'text-ink-mute hover:text-[#f59e0b]'
                            }`}
                          />
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-ink flex items-center justify-between">
                      <span>Review Comments & Testimonial</span>
                      <span className="text-[11px] font-normal text-ink-mute">
                        {rating === 5
                          ? '5 Stars · Exceptional Masterpiece'
                          : rating === 4
                            ? '4 Stars · Great Experience'
                            : rating === 3
                              ? '3 Stars · Good Illustration'
                              : rating === 2
                                ? '2 Stars · Fair'
                                : '1 Star · Needs Improvement'}
                      </span>
                    </label>
                    <textarea
                      rows={2}
                      value={reviewComment}
                      onChange={(e) => setReviewComment(e.target.value)}
                      placeholder="Share your experience working with Meru Art Studio..."
                      className="w-full rounded-xl border border-line bg-paper p-3 text-xs text-ink placeholder:text-ink-mute focus:border-coral focus:outline-hidden"
                    />
                  </div>

                  {/* Privacy / Visibility Selector */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-ink block">
                      Review Display on Front Page
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setReviewVisibility('public')}
                        className={`flex flex-col text-left p-2.5 rounded-xl border transition ${
                          reviewVisibility === 'public'
                            ? 'border-teal bg-teal-soft/60 text-ink shadow-2xs'
                            : 'border-line bg-paper text-ink-soft hover:border-teal/40'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 text-xs font-bold text-ink">
                          <Globe className="size-3.5 text-teal" />
                          <span>Public Review</span>
                        </div>
                        <span className="text-[10px] text-ink-mute mt-1 leading-tight">
                          Show on homepage with your handle
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setReviewVisibility('anonymous')}
                        className={`flex flex-col text-left p-2.5 rounded-xl border transition ${
                          reviewVisibility === 'anonymous'
                            ? 'border-mustard bg-mustard-soft/60 text-ink shadow-2xs'
                            : 'border-line bg-paper text-ink-soft hover:border-mustard/40'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 text-xs font-bold text-ink">
                          <UserCheck className="size-3.5 text-mustard" />
                          <span>Anonymous</span>
                        </div>
                        <span className="text-[10px] text-ink-mute mt-1 leading-tight">
                          Show on homepage as "Anonymous Collector"
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setReviewVisibility('private')}
                        className={`flex flex-col text-left p-2.5 rounded-xl border transition ${
                          reviewVisibility === 'private'
                            ? 'border-ink bg-cream text-ink shadow-2xs'
                            : 'border-line bg-paper text-ink-soft hover:border-ink/40'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 text-xs font-bold text-ink">
                          <Lock className="size-3.5 text-ink-soft" />
                          <span>Private Note</span>
                        </div>
                        <span className="text-[10px] text-ink-mute mt-1 leading-tight">
                          Visible only to Meru in studio records
                        </span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Optional Gratuity / Tipping Section */}
                <div className="rounded-2xl border border-mustard/30 bg-mustard-soft/30 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Heart className="size-4 text-coral" />
                      <span className="text-xs font-bold text-ink uppercase tracking-wider">
                        Optional Gratuity for Meru
                      </span>
                    </div>
                    <span className="text-[11px] text-ink-mute font-medium">100% goes directly to artist</span>
                  </div>

                  <p className="text-xs text-ink-soft">
                    If you enjoyed the art and collaboration, consider adding a token of gratitude to support future creations.
                  </p>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {TIP_PRESETS.map((preset) => {
                      const isSelected = !isCustom && selectedTip === preset.amount;
                      const Icon = preset.icon;
                      return (
                        <button
                          key={preset.amount}
                          type="button"
                          onClick={() => handleSelectPreset(preset.amount)}
                          className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-center transition ${
                            isSelected
                              ? 'border-ink bg-ink text-white shadow-xs'
                              : 'border-line bg-paper text-ink hover:border-coral/50'
                          }`}
                        >
                          <Icon className={`size-4 ${isSelected ? 'text-mustard' : 'text-coral'}`} />
                          <span className="text-xs font-bold mt-1">{preset.label}</span>
                          {preset.sublabel && (
                            <span className={`text-[10px] ${isSelected ? 'text-white/80' : 'text-ink-mute'}`}>
                              {preset.sublabel}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Custom tip toggle */}
                  <div className="flex items-center justify-between gap-3 pt-1">
                    <button
                      type="button"
                      onClick={handleSelectCustom}
                      className={`text-xs font-medium underline underline-offset-2 ${
                        isCustom ? 'text-coral font-bold' : 'text-ink-soft hover:text-ink'
                      }`}
                    >
                      Or enter a custom amount
                    </button>

                    {isCustom && (
                      <div className="flex items-center gap-1.5 bg-paper rounded-xl border border-line px-2.5 py-1">
                        <DollarSign className="size-3.5 text-ink-soft" />
                        <input
                          type="number"
                          min="1"
                          max="200"
                          step="1"
                          placeholder="Amount"
                          value={customTip}
                          onChange={(e) => setCustomTip(e.target.value)}
                          className="w-20 text-xs font-bold text-ink bg-transparent outline-hidden"
                          autoFocus
                        />
                        <span className="text-[11px] text-ink-mute">USD</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Sweet Thank-You Note */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-ink flex items-center justify-between">
                    <span>Thank-You Note for Meru</span>
                    <span className="text-[11px] text-ink-mute font-normal">Sent to studio chat</span>
                  </label>
                  <textarea
                    rows={2}
                    value={thankYouMessage}
                    onChange={(e) => setThankYouMessage(e.target.value)}
                    placeholder="Write a sweet message to Meru..."
                    className="w-full rounded-xl border border-line bg-canvas p-3 text-xs text-ink placeholder:text-ink-mute focus:border-coral focus:outline-hidden"
                  />
                </div>
              </>
            ) : (
              /* Step 2: Tip Payment Details */
              <div className="space-y-4">
                <div className="rounded-2xl border border-teal/30 bg-teal-soft/40 p-4 text-center">
                  <span className="inline-grid size-10 place-items-center rounded-full bg-teal text-white shadow-2xs mb-2">
                    <Heart className="size-5 text-white fill-white" />
                  </span>
                  <h4 className="font-display text-lg font-bold text-ink">
                    Gratuity: {formatMoney(effectiveTip, 'USD')}
                  </h4>
                  <p className="text-xs text-ink-soft mt-1">
                    Thank you so much for your generosity! You can complete your tip below via 1-click PayPal or GCash QR.
                  </p>
                </div>

                {/* 1-Click PayPal Tip */}
                <a
                  href={paypalTipUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-3.5 rounded-2xl border border-line bg-paper hover:border-coral transition shadow-2xs group"
                >
                  <div className="flex items-center gap-3">
                    <span className="grid size-9 place-items-center rounded-xl bg-ink text-white font-bold text-xs">
                      PP
                    </span>
                    <div>
                      <p className="text-xs font-bold text-ink group-hover:text-coral transition">
                        Pay {formatMoney(effectiveTip, 'USD')} via PayPal 1-Click
                      </p>
                      <p className="text-[11px] text-ink-mute">Direct instant transfer to mkun.arts@gmail.com</p>
                    </div>
                  </div>
                  <ExternalLink className="size-4 text-ink-soft group-hover:text-coral transition" />
                </a>

                {/* GCash Tip Details */}
                <div className="rounded-2xl border border-line bg-canvas p-3.5 space-y-2 text-xs">
                  <div className="flex items-center gap-2 text-ink font-semibold">
                    <QrCode className="size-4 text-teal" />
                    <span>GCash Tip Alternative:</span>
                  </div>
                  <p className="text-ink-soft text-[11px]">
                    Send to <strong>{DEFAULT_PAYMENT_DETAILS.gcashNumber}</strong> ({DEFAULT_PAYMENT_DETAILS.gcashName}) with memo <code>#Tip-{displayCode}</code>.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Modal Footer */}
          <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-3 border-t border-line bg-canvas px-5 py-4">
            {step === 'tip_payment' ? (
              <button
                type="button"
                onClick={() => setStep('review')}
                disabled={isSubmitting}
                className="w-full sm:w-auto rounded-full border border-line bg-paper px-4 py-2 text-xs font-semibold text-ink hover:bg-cream transition disabled:opacity-50"
              >
                Back to Review
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="w-full sm:w-auto rounded-full border border-line bg-paper px-4 py-2 text-xs font-semibold text-ink hover:bg-cream transition disabled:opacity-50"
              >
                Not Yet, Keep Reviewing
              </button>
            )}

            {step === 'review' ? (
              <button
                type="button"
                onClick={handleProceed}
                disabled={isSubmitting}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full bg-ink px-6 py-2.5 text-xs font-bold text-white transition hover:bg-teal shadow-xs disabled:opacity-50"
              >
                {effectiveTip > 0 ? (
                  <>
                    <span>Proceed with {formatMoney(effectiveTip, 'USD')} Tip</span>
                    <ArrowRight className="size-3.5" />
                  </>
                ) : (
                  <>
                    <Check className="size-3.5 text-mustard stroke-[2.5]" />
                    <span>Confirm Acceptance & Unlock Vault</span>
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleFinalizeWithTip}
                disabled={isSubmitting}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full bg-teal px-6 py-2.5 text-xs font-bold text-white transition hover:bg-ink shadow-xs disabled:opacity-50"
              >
                <Check className="size-3.5 stroke-[2.5]" />
                <span>{isSubmitting ? 'Finalizing Commission...' : 'I Sent the Tip · Unlock Vault'}</span>
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
