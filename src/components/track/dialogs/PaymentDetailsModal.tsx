import { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CreditCard,
  QrCode,
  Building2,
  Copy,
  Check,
  ExternalLink,
  Download,
  X,
  Receipt,
  ShieldCheck,
  Printer,
  Smartphone,
  RefreshCw,
} from 'lucide-react';
import { cn, formatMoney, formatUsd, getTier } from '@/lib/utils';
import type { SubmittedOrder, StudioPaymentDetails, Currency } from '@/types';
import { useStudio, DEFAULT_PAYMENT_DETAILS } from '@/context/StudioContext';
import { printOrderInvoice } from '@/lib/invoice';
import { optimizeQrImage } from '@/lib/storage';

export interface PaymentDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: SubmittedOrder;
  usdToPhpRate: number;
  paymentDetails?: StudioPaymentDetails;
  onUploadReceipt?: (kind: 'deposit' | 'final') => void;
  initialChannel?: 'paypal' | 'gcash' | 'bank';
}

export function PaymentDetailsModal({
  isOpen,
  onClose,
  order,
  usdToPhpRate,
  paymentDetails: propPaymentDetails,
  onUploadReceipt,
  initialChannel = 'paypal',
}: PaymentDetailsModalProps) {
  const { studioSettings, updateStudioSettings, showToast, isArtistAdmin, toggleOrderPaymentFlag } = useStudio();

  // Combine live studio payment details with fallbacks, cropped default, and local storage override
  const activePaymentDetails: StudioPaymentDetails = useMemo(() => {
    const live = studioSettings?.paymentDetails ?? propPaymentDetails ?? DEFAULT_PAYMENT_DETAILS;
    const localQrOverride =
      typeof window !== 'undefined' ? localStorage.getItem('meru_gcash_qr_override') : null;
    return {
      ...live,
      gcashQrImageUrl: live.gcashQrImageUrl || localQrOverride || '/brand/gcash-qr.png',
    };
  }, [studioSettings?.paymentDetails, propPaymentDetails]);

  const [activeChannel, setActiveChannel] = useState<'paypal' | 'gcash' | 'bank'>(initialChannel);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [currencyMode, setCurrencyMode] = useState<Currency>(order.currency ?? 'USD');
  const [isProcessingQr, setIsProcessingQr] = useState(false);
  const qrFileInputRef = useRef<HTMLInputElement | null>(null);

  // Sync initial channel when modal opens
  useEffect(() => {
    if (isOpen) {
      if (order.currency === 'PHP') {
        setActiveChannel('gcash');
        setCurrencyMode('PHP');
      } else {
        setActiveChannel(initialChannel);
        setCurrencyMode('USD');
      }
    }
  }, [isOpen, initialChannel, order.currency]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Clean order code to eliminate double 'MRU-MRU-' prefixes
  const rawOrderCode = order.orderCode || order.id.slice(0, 8).toUpperCase();
  const cleanCode = rawOrderCode.replace(/^MRU-/, '');
  const displayOrderCode = `MRU-${cleanCode}`;
  const tier = getTier(order.tier);

  // Determine which milestone payment is due
  const { paymentKind, stageLabel, amountUsd } = useMemo(() => {
    if (order.stage === 'awaiting_deposit' || !order.depositPaid) {
      return {
        paymentKind: 'deposit' as const,
        stageLabel: order.paymentSplit === '50_50' ? 'Upfront Deposit (50%)' : 'Full Upfront Payment (100%)',
        amountUsd: order.depositUsd,
      };
    }
    if (order.stage === 'sketch_approval' && !order.finalPaid) {
      const remaining = Math.max(0, order.totalUsd - order.depositUsd);
      return {
        paymentKind: 'final' as const,
        stageLabel: 'Remaining Balance (50%)',
        amountUsd: remaining,
      };
    }
    return {
      paymentKind: 'deposit' as const,
      stageLabel: 'Total Commission Amount',
      amountUsd: order.totalUsd,
    };
  }, [order]);

  const amountPhp = Math.round(amountUsd * usdToPhpRate);
  const invoiceNumber = `INV-MRU-${cleanCode}-${paymentKind === 'final' ? 'FIN' : 'DEP'}`;

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2200);
    } catch {
      // ignore
    }
  };

  // 1-Click Generated PayPal Checkout URL
  const paypalCheckoutUrl = useMemo(() => {
    const email = activePaymentDetails.paypalEmail || 'mkun.arts@gmail.com';
    const itemName = `Meru Art Studio - Invoice #${invoiceNumber} (${tier.label} ${stageLabel})`;
    return `https://www.paypal.com/cgi-bin/webscr?cmd=_xclick&business=${encodeURIComponent(
      email,
    )}&item_name=${encodeURIComponent(itemName)}&amount=${amountUsd.toFixed(2)}&currency_code=USD&no_shipping=1&invoice=${encodeURIComponent(
      invoiceNumber,
    )}`;
  }, [activePaymentDetails.paypalEmail, invoiceNumber, tier.label, stageLabel, amountUsd]);

  // PayPal.Me Quick Link
  const paypalMeUrl = useMemo(() => {
    const handle = activePaymentDetails.paypalMeUsername || 'mkunarts';
    return `https://paypal.me/${handle}/${amountUsd.toFixed(2)}USD`;
  }, [activePaymentDetails.paypalMeUsername, amountUsd]);

  const handleDownloadQr = () => {
    const src = activePaymentDetails.gcashQrImageUrl || '/brand/gcash-qr.png';
    const link = document.createElement('a');
    link.href = src;
    link.download = `MeruArt-GCash-QR-${invoiceNumber}.png`;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Direct In-Modal GCash QR Upload Handler
  const handleDirectQrUpload = async (file: File) => {
    setIsProcessingQr(true);
    showToast('Optimizing & saving official GCash QR...');
    try {
      const optimized = await optimizeQrImage(file);
      const updatedDetails: StudioPaymentDetails = {
        ...activePaymentDetails,
        gcashQrImageUrl: optimized,
      };
      updateStudioSettings({ paymentDetails: updatedDetails });
      localStorage.setItem('meru_gcash_qr_override', optimized);
      showToast('Official GCash QR loaded & saved.');
    } catch {
      showToast('Failed to process image. Please try another file.');
    } finally {
      setIsProcessingQr(false);
    }
  };

  const handlePrintInvoice = () => {
    printOrderInvoice(order, {
      paymentDetails: activePaymentDetails,
      usdToPhpRate,
      paymentKind,
      targetChannel: activeChannel,
    });
  };

  // Copy full GCash invoice text for 1-click convenience
  const handleCopyFullGcashInvoice = () => {
    const summary = `Meru Art Studio · Commission Invoice\nInvoice: ${invoiceNumber}\nMilestone: ${stageLabel}\nGCash Number: ${activePaymentDetails.gcashNumber}\nAccount Name: ${activePaymentDetails.gcashName}\nExact Amount: ₱${amountPhp.toLocaleString()} PHP\nMemo / Note: #${displayOrderCode}\n\nPlease take a screenshot of your transfer confirmation!`;
    copyToClipboard(summary, 'gcash-full-summary');
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          className="fixed inset-0 bg-ink/60 backdrop-blur-xs"
          aria-hidden="true"
        />

        {/* Modal Card: Modern, Clean Studio Invoice */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ type: 'spring', stiffness: 440, damping: 32 }}
          data-lenis-prevent
          className="relative z-10 flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-line bg-paper shadow-2xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="payment-modal-title"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-line bg-canvas/80 px-4 py-3 sm:px-5">
            <div className="flex items-center gap-2.5">
              <span className="grid size-9 place-items-center rounded-2xl bg-coral-soft text-coral shadow-2xs">
                <Receipt className="size-4.5" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h3 id="payment-modal-title" className="font-display text-base font-bold text-ink">
                    Commission Invoice
                  </h3>
                  <span className="rounded-full bg-cream border border-line px-2 py-0.5 font-mono text-[10px] font-bold text-ink-soft">
                    #{invoiceNumber}
                  </span>
                  {isArtistAdmin && (
                    <span className="rounded-full bg-coral-soft px-1.5 py-0.2 text-[9px] font-bold text-coral uppercase tracking-wide">
                      Admin Preview
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-ink-mute">
                  Order #{displayOrderCode} · {tier.label} ({order.characterCount} char)
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handlePrintInvoice}
                title="Print or Download PDF Invoice"
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-3 py-1 text-xs font-semibold text-ink-soft hover:bg-cream hover:text-ink transition"
              >
                <Printer className="size-3.5 text-ink-mute" />
                <span className="hidden sm:inline">Print / PDF</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                aria-label="Close invoice window"
                className="grid size-8 place-items-center rounded-full border border-line bg-paper text-ink-soft hover:bg-cream hover:text-ink transition"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>

          {/* Scrollable Body */}
          <div className="no-scrollbar flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
            {/* Clean Invoice Summary Card */}
            <div className="rounded-2xl border border-line bg-canvas/60 p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-line/60 pb-3">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-cream px-2.5 py-0.5 text-xs font-semibold text-ink-soft">
                    {stageLabel}
                  </span>
                  <span className="rounded-full bg-mustard-soft px-2 py-0.5 text-[10px] font-bold text-mustard uppercase tracking-wide">
                    Due Now
                  </span>
                </div>

                {/* Currency Switcher */}
                <div className="inline-flex rounded-full border border-line bg-paper p-0.5 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setCurrencyMode('USD')}
                    className={cn(
                      'rounded-full px-2.5 py-0.5 font-semibold transition',
                      currencyMode === 'USD' ? 'bg-ink text-white' : 'text-ink-mute hover:text-ink',
                    )}
                  >
                    USD ($)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrencyMode('PHP')}
                    className={cn(
                      'rounded-full px-2.5 py-0.5 font-semibold transition',
                      currencyMode === 'PHP' ? 'bg-ink text-white' : 'text-ink-mute hover:text-ink',
                    )}
                  >
                    PHP (₱)
                  </button>
                </div>
              </div>

              {/* Line Items */}
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between text-ink-soft">
                  <span>1× {tier.label} Illustration ({order.characterCount} char)</span>
                  <span className="font-semibold text-ink">{formatUsd(tier.basePriceUsd * order.characterCount)}</span>
                </div>
                {order.addons.nsfw && (
                  <div className="flex justify-between text-ink-mute text-[11px]">
                    <span>+ NSFW Content (+50%)</span>
                    <span>Included</span>
                  </div>
                )}
                {order.addons.softFurry && (
                  <div className="flex justify-between text-ink-mute text-[11px]">
                    <span>+ Kemonomimi / Furry (+50%)</span>
                    <span>Included</span>
                  </div>
                )}
                {order.addons.commercial && (
                  <div className="flex justify-between text-ink-mute text-[11px]">
                    <span>+ Commercial Rights (+200%)</span>
                    <span>Included</span>
                  </div>
                )}
                <div className="flex justify-between text-ink-mute text-[11px]">
                  <span>Payment Terms</span>
                  <span>{order.paymentSplit === '50_50' ? '50% Deposit / 50% Post-Sketch' : '100% Upfront'}</span>
                </div>
              </div>

              {/* Amount Due & Copy Memo */}
              <div className="flex items-baseline justify-between border-t border-line/60 pt-3">
                <div>
                  <span className="text-[11px] font-medium text-ink-mute uppercase tracking-wide">Amount Due Now</span>
                  <p className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-ink">
                    {currencyMode === 'USD' ? formatUsd(amountUsd) : `₱${amountPhp.toLocaleString()} PHP`}
                  </p>
                  <p className="text-[11px] text-ink-mute">
                    {currencyMode === 'USD'
                      ? `≈ ₱${amountPhp.toLocaleString()} PHP (Exchange rate: ₱${usdToPhpRate}/$1)`
                      : `≈ ${formatUsd(amountUsd)} USD`}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => copyToClipboard(displayOrderCode, 'memo')}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                    copiedKey === 'memo'
                      ? 'border-teal bg-teal text-white'
                      : 'border-line bg-paper text-ink hover:border-ink',
                  )}
                  title="Copy Order Reference Code"
                >
                  {copiedKey === 'memo' ? (
                    <>
                      <Check className="size-3.5" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="size-3.5 text-coral" />
                      <span>#{displayOrderCode}</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Payment Channel Selector Tabs */}
            <div className="grid grid-cols-3 gap-1.5 rounded-2xl border border-line bg-canvas p-1 text-xs">
              <button
                type="button"
                onClick={() => setActiveChannel('paypal')}
                className={cn(
                  'flex items-center justify-center gap-1.5 rounded-xl py-2 font-semibold transition',
                  activeChannel === 'paypal'
                    ? 'bg-[#003087] text-white shadow-xs'
                    : 'text-ink-soft hover:bg-cream hover:text-ink',
                )}
              >
                <CreditCard className="size-3.5" />
                <span className="font-display font-bold">PayPal</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveChannel('gcash')}
                className={cn(
                  'flex items-center justify-center gap-1.5 rounded-xl py-2 font-semibold transition',
                  activeChannel === 'gcash'
                    ? 'bg-[#005CE6] text-white shadow-xs'
                    : 'text-ink-soft hover:bg-cream hover:text-ink',
                )}
              >
                <QrCode className="size-3.5" />
                <span>GCash QR</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveChannel('bank')}
                className={cn(
                  'flex items-center justify-center gap-1.5 rounded-xl py-2 font-semibold transition',
                  activeChannel === 'bank'
                    ? 'bg-ink text-white shadow-xs'
                    : 'text-ink-soft hover:bg-cream hover:text-ink',
                )}
              >
                <Building2 className="size-3.5" />
                <span>Bank / Maya</span>
              </button>
            </div>

            {/* CHANNEL 1: PAYPAL */}
            {activeChannel === 'paypal' && (
              <div className="space-y-3.5 rounded-2xl border border-[#003087]/20 bg-[#003087]/5 p-4 text-xs text-ink">
                <div className="flex items-center justify-between border-b border-[#003087]/15 pb-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-full bg-[#003087] px-2 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider">
                      1-Click Direct Invoice
                    </span>
                    <span className="text-[11px] font-semibold text-[#003087]">
                      Pre-filled checkout
                    </span>
                  </div>
                  <span className="text-[11px] font-bold text-ink">
                    {formatUsd(amountUsd)} USD
                  </span>
                </div>

                {/* Digital Invoice Itemized Summary Card */}
                <div className="rounded-xl border border-line bg-paper p-3 text-[11px] space-y-1.5 shadow-2xs">
                  <div className="flex justify-between text-ink-mute">
                    <span>Generated Invoice ID:</span>
                    <span className="font-mono font-bold text-ink">{invoiceNumber}</span>
                  </div>
                  <div className="flex justify-between text-ink-mute">
                    <span>Payee:</span>
                    <span className="font-semibold text-ink">Mhelric Banaag (Meru Art)</span>
                  </div>
                  <div className="flex justify-between text-ink-mute">
                    <span>PayPal Account:</span>
                    <span className="font-mono font-semibold text-ink">{activePaymentDetails.paypalEmail}</span>
                  </div>
                  <div className="flex justify-between text-ink-mute">
                    <span>Milestone:</span>
                    <span className="font-semibold text-ink">{tier.label} · {stageLabel}</span>
                  </div>
                  <div className="flex justify-between border-t border-line/60 pt-1.5 text-xs font-bold text-ink">
                    <span>Total Invoice Amount:</span>
                    <span className="text-[#003087]">{formatUsd(amountUsd)} USD</span>
                  </div>
                </div>

                {/* PRIMARY CTA: 1-Click Pay Invoice Button (NO EMOJIS) */}
                <a
                  href={paypalCheckoutUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex w-full items-center justify-center gap-2 rounded-2xl bg-[#003087] px-5 py-3.5 text-xs font-bold text-white shadow-md shadow-[#003087]/20 transition hover:bg-[#002266] active:scale-[0.98]"
                >
                  <CreditCard className="size-4" />
                  <span className="text-sm">
                    {isArtistAdmin
                      ? `Open Client PayPal Checkout (${formatUsd(amountUsd)} USD)`
                      : `Pay Invoice via PayPal (${formatUsd(amountUsd)} USD)`}
                  </span>
                  <ExternalLink className="size-3.5 transition group-hover:translate-x-0.5" />
                </a>

                {/* Secondary Quick Action Buttons */}
                <div className="grid grid-cols-2 gap-2">
                  <a
                    href={paypalMeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-[#003087]/30 bg-paper py-2 text-[11px] font-semibold text-[#003087] hover:bg-cream transition"
                  >
                    <span>Pay via PayPal.Me</span>
                    <ExternalLink className="size-3" />
                  </a>

                  <button
                    type="button"
                    onClick={() => copyToClipboard(paypalCheckoutUrl, 'paypal-link')}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-line bg-paper py-2 text-[11px] font-semibold text-ink hover:border-ink transition"
                  >
                    {copiedKey === 'paypal-link' ? (
                      <>
                        <Check className="size-3 text-teal" />
                        <span>Link Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="size-3 text-coral" />
                        <span>Copy Invoice Link</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Account Email Copy Row */}
                <div className="flex items-center justify-between rounded-xl border border-line bg-paper px-3 py-2">
                  <div className="truncate pr-2">
                    <span className="block text-[10px] text-ink-mute">PayPal Email:</span>
                    <span className="font-mono text-xs font-semibold text-ink select-all">
                      {activePaymentDetails.paypalEmail}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(activePaymentDetails.paypalEmail, 'paypal-email')}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-coral hover:underline shrink-0"
                  >
                    {copiedKey === 'paypal-email' ? (
                      <Check className="size-3 text-teal" />
                    ) : (
                      <Copy className="size-3" />
                    )}
                    <span>{copiedKey === 'paypal-email' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>

                {/* Verification Guidance */}
                <div className="rounded-xl border border-line bg-paper/80 p-3 text-[11px] space-y-1 text-ink-soft">
                  <p className="font-semibold text-ink flex items-center gap-1">
                    <ShieldCheck className="size-3.5 text-teal" /> Verification Guidelines:
                  </p>
                  <ul className="list-disc list-inside space-y-0.5 pl-1">
                    <li>The button opens PayPal with the invoice ID and amount pre-filled.</li>
                    <li>Pay with PayPal balance or any debit / credit card.</li>
                    <li>Screenshot the payment confirmation or save the transaction ID.</li>
                  </ul>
                </div>
              </div>
            )}

            {/* CHANNEL 2: GCASH OFFICIAL QR & EXPRESS SEND */}
            {activeChannel === 'gcash' && (
              <div className="space-y-3.5 rounded-2xl border border-[#005CE6]/20 bg-[#005CE6]/5 p-4 text-xs text-ink">
                <div className="flex items-center justify-between border-b border-[#005CE6]/15 pb-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-full bg-[#005CE6] px-2 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider">
                      GCash QR Invoice
                    </span>
                    <span className="text-[11px] font-semibold text-[#005CE6]">
                      Express Send & QR Ph
                    </span>
                  </div>
                  <span className="text-[11px] font-bold text-ink">
                    ₱{amountPhp.toLocaleString()} PHP
                  </span>
                </div>

                {/* Digital Invoice Summary for GCash */}
                <div className="rounded-xl border border-line bg-paper p-3 text-[11px] space-y-1.5 shadow-2xs">
                  <div className="flex justify-between text-ink-mute">
                    <span>Generated Invoice ID:</span>
                    <span className="font-mono font-bold text-ink">{invoiceNumber}</span>
                  </div>
                  <div className="flex justify-between text-ink-mute">
                    <span>Payee (Verified):</span>
                    <span className="font-semibold text-ink">{activePaymentDetails.gcashName}</span>
                  </div>
                  <div className="flex justify-between text-ink-mute">
                    <span>GCash Number:</span>
                    <span className="font-mono font-bold text-ink">{activePaymentDetails.gcashNumber}</span>
                  </div>
                  <div className="flex justify-between border-t border-line/60 pt-1.5 text-xs font-bold text-ink">
                    <span>Exact Amount Due:</span>
                    <span className="text-[#005CE6]">₱{amountPhp.toLocaleString()} PHP</span>
                  </div>
                </div>

                {/* Hidden QR File Input for direct in-modal upload */}
                <input
                  ref={qrFileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleDirectQrUpload(file);
                    e.target.value = '';
                  }}
                  className="hidden"
                />

                {/* OFFICIAL GCASH QR CODE CARD */}
                <div className="flex flex-col items-center justify-center rounded-2xl border border-line bg-paper p-4 text-center shadow-xs">
                  <div className="relative overflow-hidden rounded-2xl border-2 border-[#005CE6] bg-white p-3 shadow-md">
                    <img
                      src={activePaymentDetails.gcashQrImageUrl || '/brand/gcash-qr.png'}
                      alt="Official GCash QR Code"
                      className="size-52 sm:size-56 object-contain rounded-lg"
                    />
                    <div className="mt-2 flex items-center justify-center gap-1.5 text-xs font-bold text-[#005CE6]">
                      <QrCode className="size-3.5" />
                      <span>Official GCash QR Code</span>
                    </div>
                  </div>

                  <div className="mt-3 space-y-0.5">
                    <p className="text-xs sm:text-sm font-bold text-ink">
                      {activePaymentDetails.gcashName} · {activePaymentDetails.gcashNumber}
                    </p>
                    <p className="text-[11px] text-ink-mute">
                      Exact Amount: <strong className="text-ink">₱{amountPhp.toLocaleString()} PHP</strong> · Memo: <strong className="text-ink">#{displayOrderCode}</strong>
                    </p>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                    {/* Download QR to Photos (for scanning via GCash gallery upload) */}
                    <button
                      type="button"
                      onClick={handleDownloadQr}
                      className="inline-flex items-center gap-1.5 rounded-full border border-line bg-canvas px-4 py-2 text-xs font-semibold text-ink hover:border-ink hover:bg-cream transition shadow-2xs"
                      title="Save QR Code image to scan inside GCash app"
                    >
                      <Download className="size-3.5 text-coral" />
                      <span>Save QR to Photos</span>
                    </button>

                    {/* Replace QR button for admin */}
                    {isArtistAdmin && (
                      <button
                        type="button"
                        onClick={() => qrFileInputRef.current?.click()}
                        disabled={isProcessingQr}
                        className="inline-flex items-center gap-1.5 rounded-full border border-line bg-canvas px-3.5 py-2 text-xs font-semibold text-ink-soft hover:text-ink transition"
                      >
                        <RefreshCw className={cn('size-3', isProcessingQr && 'animate-spin')} />
                        <span>Replace QR</span>
                      </button>
                    )}

                    {/* Copy All Details Button */}
                    <button
                      type="button"
                      onClick={handleCopyFullGcashInvoice}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[#005CE6]/30 bg-[#005CE6]/10 px-4 py-2 text-xs font-semibold text-[#005CE6] hover:bg-[#005CE6] hover:text-white transition"
                    >
                      {copiedKey === 'gcash-full-summary' ? (
                        <>
                          <Check className="size-3.5 text-teal" />
                          <span>Copied All Invoice Info!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="size-3.5" />
                          <span>Copy Details & Pay</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Individual GCash Field Rows */}
                <div className="space-y-2">
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-ink-mute">
                      GCash Mobile Number:
                    </label>
                    <div className="flex items-center justify-between rounded-xl border border-line bg-paper px-3 py-2">
                      <span className="font-mono text-xs font-bold text-ink">
                        {activePaymentDetails.gcashNumber}
                      </span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(activePaymentDetails.gcashNumber, 'gcash-num')}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-coral hover:underline"
                      >
                        {copiedKey === 'gcash-num' ? (
                          <Check className="size-3 text-teal" />
                        ) : (
                          <Copy className="size-3" />
                        )}
                        <span>{copiedKey === 'gcash-num' ? 'Copied' : 'Copy Number'}</span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-ink-mute">
                      GCash Account Name:
                    </label>
                    <div className="flex items-center justify-between rounded-xl border border-line bg-paper px-3 py-2">
                      <span className="text-xs font-semibold text-ink">
                        {activePaymentDetails.gcashName}
                      </span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(activePaymentDetails.gcashName, 'gcash-name')}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-coral hover:underline"
                      >
                        {copiedKey === 'gcash-name' ? (
                          <Check className="size-3 text-teal" />
                        ) : (
                          <Copy className="size-3" />
                        )}
                        <span>{copiedKey === 'gcash-name' ? 'Copied' : 'Copy Name'}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Instructions */}
                <div className="rounded-xl border border-line bg-paper/80 p-3 text-[11px] space-y-1 text-ink-soft">
                  <p className="font-semibold text-ink flex items-center gap-1">
                    <Smartphone className="size-3.5 text-[#005CE6]" /> How to Pay via GCash:
                  </p>
                  <ol className="list-decimal list-inside space-y-0.5 pl-1">
                    <li><strong>Scan QR:</strong> Click "Save QR to Photos", open GCash, tap <strong>Pay QR</strong>, and tap <strong>Upload from Gallery</strong>.</li>
                    <li><strong>Express Send:</strong> Open GCash, tap Express Send, send to <strong>{activePaymentDetails.gcashNumber}</strong> ({activePaymentDetails.gcashName}).</li>
                    <li>Include order memo: <strong className="text-ink">#{displayOrderCode}</strong></li>
                    <li>Screenshot your transfer confirmation and upload below.</li>
                  </ol>
                </div>
              </div>
            )}

            {/* CHANNEL 3: BANK / MAYA */}
            {activeChannel === 'bank' && (
              <div className="space-y-3.5 rounded-2xl border border-line bg-canvas/60 p-4 text-xs text-ink">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-ink uppercase tracking-wide text-[10px]">
                    Direct Bank Transfer & Maya (InstaPay)
                  </span>
                  <span className="text-[11px] font-bold text-ink">
                    ₱{amountPhp.toLocaleString()} PHP
                  </span>
                </div>

                <div className="rounded-xl border border-line bg-paper p-3 text-[11px] space-y-1.5 shadow-2xs">
                  <div className="flex justify-between text-ink-mute">
                    <span>Generated Invoice ID:</span>
                    <span className="font-mono font-bold text-ink">{invoiceNumber}</span>
                  </div>
                  <div className="flex justify-between text-ink-mute">
                    <span>Payee:</span>
                    <span className="font-semibold text-ink">{activePaymentDetails.bankAccountName}</span>
                  </div>
                  <div className="flex justify-between border-t border-line/60 pt-1.5 text-xs font-bold text-ink">
                    <span>Exact Amount:</span>
                    <span>₱{amountPhp.toLocaleString()} PHP</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-ink-mute">
                      Bank / Platform:
                    </label>
                    <div className="rounded-xl border border-line bg-paper px-3 py-2 font-semibold text-ink">
                      {activePaymentDetails.bankName}
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-ink-mute">
                      Account Number:
                    </label>
                    <div className="flex items-center justify-between rounded-xl border border-line bg-paper px-3 py-2">
                      <span className="font-mono text-xs font-bold text-ink select-all">
                        {activePaymentDetails.bankAccountNumber}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          copyToClipboard(activePaymentDetails.bankAccountNumber, 'bank-num')
                        }
                        className="inline-flex items-center gap-1 text-xs font-semibold text-coral hover:underline"
                      >
                        {copiedKey === 'bank-num' ? (
                          <Check className="size-3 text-teal" />
                        ) : (
                          <Copy className="size-3" />
                        )}
                        <span>{copiedKey === 'bank-num' ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-ink-mute">
                      Account Name:
                    </label>
                    <div className="flex items-center justify-between rounded-xl border border-line bg-paper px-3 py-2">
                      <span className="text-xs font-semibold text-ink">
                        {activePaymentDetails.bankAccountName}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          copyToClipboard(activePaymentDetails.bankAccountName, 'bank-name')
                        }
                        className="inline-flex items-center gap-1 text-xs font-semibold text-coral hover:underline"
                      >
                        {copiedKey === 'bank-name' ? (
                          <Check className="size-3 text-teal" />
                        ) : (
                          <Copy className="size-3" />
                        )}
                        <span>{copiedKey === 'bank-name' ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Instructions */}
                <div className="rounded-xl border border-line bg-paper p-3 text-[11px] space-y-1 text-ink-soft">
                  <p className="font-semibold text-ink flex items-center gap-1">
                    <Building2 className="size-3.5 text-mustard" /> Transfer Instructions:
                  </p>
                  <ul className="list-disc list-inside space-y-0.5 pl-1">
                    <li>Use <strong>InstaPay</strong> for real-time instant crediting.</li>
                    <li>
                      Include remarks / purpose: <strong className="text-ink">#{displayOrderCode}</strong>
                    </li>
                    <li>Save or screenshot the transfer confirmation receipt.</li>
                  </ul>
                </div>
              </div>
            )}
          </div>

          {/* Clean Modal Footer: Receipt Upload Action or Admin Verification */}
          <div className="border-t border-line bg-canvas/90 p-4 sm:px-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold text-ink">
                  {isArtistAdmin ? 'Admin Commission Ledger' : 'Already sent your payment?'}
                </p>
                <p className="text-[11px] text-ink-mute">
                  {isArtistAdmin
                    ? 'Verify payment when funds arrive in your PayPal / GCash account.'
                    : 'Upload your screenshot to unlock the next milestone.'}
                </p>
              </div>

              {isArtistAdmin ? (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      toggleOrderPaymentFlag(order.id, paymentKind === 'final' ? 'finalPaid' : 'depositPaid');
                      showToast(
                        `Updated ${paymentKind === 'final' ? 'final balance' : 'upfront deposit'} payment status.`,
                      );
                      onClose();
                    }}
                    className={cn(
                      'inline-flex items-center justify-center gap-1.5 rounded-full px-5 py-2.5 text-xs font-semibold shadow-xs transition',
                      (paymentKind === 'final' ? order.finalPaid : order.depositPaid)
                        ? 'border border-line bg-paper text-ink hover:bg-cream'
                        : 'bg-teal text-white hover:bg-teal/90',
                    )}
                  >
                    <Check className="size-3.5" strokeWidth={3} />
                    <span>
                      {(paymentKind === 'final' ? order.finalPaid : order.depositPaid)
                        ? 'Mark as Unpaid'
                        : `Mark ${paymentKind === 'final' ? 'Final Balance' : 'Deposit'} Verified`}
                    </span>
                  </button>
                </div>
              ) : onUploadReceipt ? (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onUploadReceipt(paymentKind);
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-ink px-5 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-coral shrink-0"
                >
                  <Receipt className="size-4 text-mustard" />
                  <span>
                    Upload {formatMoney(currencyMode === 'USD' ? amountUsd : amountPhp, currencyMode)} Receipt →
                  </span>
                </button>
              ) : null}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
