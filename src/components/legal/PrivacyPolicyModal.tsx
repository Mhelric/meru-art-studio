import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, X, Lock, Eye, FileText, Database } from 'lucide-react';
import { useEffect, useRef } from 'react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Privacy Policy Modal complying with the Philippine Data Privacy Act of 2012 (RA 10173),
 * GDPR principles, and Google OAuth Application Verification Guidelines.
 * Features keyboard accessibility (Escape to close) and focus trapping.
 */
export function PrivacyPolicyModal({ isOpen, onClose }: Props) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      previouslyFocusedElementRef.current = document.activeElement as HTMLElement;
      // Focus modal container
      modalRef.current?.focus();

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onClose();
          return;
        }

        // Trap focus inside modal
        if (e.key === 'Tab' && modalRef.current) {
          const focusable = modalRef.current.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
          );
          if (focusable.length === 0) return;

          const first = focusable[0];
          const last = focusable[focusable.length - 1];

          if (e.shiftKey) {
            if (document.activeElement === first) {
              last.focus();
              e.preventDefault();
            }
          } else {
            if (document.activeElement === last) {
              first.focus();
              e.preventDefault();
            }
          }
        }
      };

      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        previouslyFocusedElementRef.current?.focus();
      };
    }
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="privacy-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs select-none"
        >
          <motion.div
            ref={modalRef}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-3xl border border-line bg-paper shadow-2xl focus:outline-none"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <div className="flex items-center gap-2.5">
                <span className="grid size-9 place-items-center rounded-2xl bg-teal-soft text-teal">
                  <ShieldCheck className="size-5" />
                </span>
                <div>
                  <h3 id="privacy-title" className="font-display text-xl font-semibold text-ink">
                    Privacy Policy
                  </h3>
                  <p className="text-xs text-ink-soft">
                    Philippine Data Privacy Act (RA 10173) & Google OAuth Compliance
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="Close privacy policy"
                className="grid size-8 place-items-center rounded-full text-ink-soft transition hover:bg-cream hover:text-ink"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="no-scrollbar flex-1 space-y-5 overflow-y-auto px-6 py-5 text-xs leading-relaxed text-ink-soft">
              <p>
                <strong>Effective Date:</strong> {new Date().getFullYear()} · Meru Art Studio ("we", "us", or "the Studio") operates this commission booking platform and character illustration studio. We are committed to protecting the privacy, identity, and creative property of our clients.
              </p>

              <div className="rounded-2xl border border-line bg-canvas p-4">
                <h4 className="flex items-center gap-2 font-display text-sm font-semibold text-ink">
                  <Database className="size-4 text-coral" /> 1. Information We Collect
                </h4>
                <ul className="mt-2 list-inside list-disc space-y-1 text-ink-soft">
                  <li>
                    <strong>Authentication Identity:</strong> When you sign in with Google OAuth, we receive your email address, display name, and unique user ID. We never request access to your Google Drive, contacts, or passwords.
                  </li>
                  <li>
                    <strong>Commission Specifications:</strong> Character names, visual descriptions, reference image uploads, preferred start dates, and communication notes.
                  </li>
                  <li>
                    <strong>Payment Verification Records:</strong> Digital screenshots of PayPal or GCash transfer receipts and transaction reference IDs uploaded to our private storage vault for audit reconciliation.
                  </li>
                </ul>
              </div>

              <div className="rounded-2xl border border-line bg-canvas p-4">
                <h4 className="flex items-center gap-2 font-display text-sm font-semibold text-ink">
                  <Eye className="size-4 text-coral" /> 2. Purpose of Data Processing
                </h4>
                <p className="mt-2 text-ink-soft">
                  Your information is processed exclusively for:
                </p>
                <ul className="mt-1 list-inside list-disc space-y-1 text-ink-soft">
                  <li>Verifying and managing your queue position in our public schedule.</li>
                  <li>Executing the commission workflow (sketch drafting, color checks, and final 300 DPI delivery).</li>
                  <li>Sending realtime milestone notifications regarding your order.</li>
                  <li>Generating itemized financial receipts and enforcing Terms of Service refund schedules.</li>
                </ul>
              </div>

              <div className="rounded-2xl border border-line bg-canvas p-4">
                <h4 className="flex items-center gap-2 font-display text-sm font-semibold text-ink">
                  <Lock className="size-4 text-teal" /> 3. Data Protection & Security Controls
                </h4>
                <ul className="mt-2 list-inside list-disc space-y-1 text-ink-soft">
                  <li>
                    <strong>Row-Level Security (RLS):</strong> All database records are strictly isolated using PostgreSQL RLS policies; clients can only query their own commissions, messages, and uploaded files.
                  </li>
                  <li>
                    <strong>Private Storage Buckets:</strong> Reference sheets and payment receipts are stored in private Supabase buckets accessible only via short-lived signed URLs.
                  </li>
                  <li>
                    <strong>Zero AI Training:</strong> Client character references and commission artwork are strictly forbidden from being used in AI dataset training or scraping.
                  </li>
                  <li>
                    <strong>No Third-Party Sale:</strong> We never sell, monetize, or license your personal information to advertising platforms.
                  </li>
                </ul>
              </div>

              <div className="rounded-2xl border border-line bg-canvas p-4">
                <h4 className="flex items-center gap-2 font-display text-sm font-semibold text-ink">
                  <FileText className="size-4 text-coral" /> 4. Client Rights & Erasure (RA 10173)
                </h4>
                <p className="mt-2 text-ink-soft">
                  Under the Philippine Data Privacy Act of 2012 (RA 10173) and international privacy laws, you retain the right to:
                </p>
                <ul className="mt-1 list-inside list-disc space-y-1 text-ink-soft">
                  <li>Access and inspect all personal data stored in your client workspace.</li>
                  <li>Request correction or rectification of your brief information.</li>
                  <li>Request account closure and permanent deletion of your uploaded reference files and chat transcripts upon commission completion.</li>
                </ul>
              </div>

              <div className="rounded-xl border border-line/60 bg-paper p-3 text-center text-ink-mute">
                For privacy inquiries or data deletion requests, contact Meru via your realtime order room or at{' '}
                <strong className="text-ink">meruartstudio@gmail.com</strong>.
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end border-t border-line px-6 py-3.5">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full bg-ink px-5 py-2 text-xs font-medium text-white transition hover:bg-coral"
              >
                Close Privacy Policy
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
