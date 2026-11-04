import { useEffect, useRef, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  ImagePlus,
  Shield,
  Loader2,
  Sparkles,
  Check,
  Pencil,
  PenTool,
  Palette,
  SunMedium,
  Brush,
  Crown,
  FolderOpen,
} from 'lucide-react';
import type { SubmittedOrder, CommissionStage } from '@/types';
import { cn } from '@/lib/utils';
import { lockScroll } from '@/lib/smoothScroll';

export interface MilestonePresetItem {
  id: string;
  label: string;
  icon: ReactNode;
  defaultTitle: string;
  stage: CommissionStage;
  progress: number;
  isFinal: boolean;
}

export interface WipUploadConfirmModalProps {
  order: SubmittedOrder | null;
  isOpen: boolean;
  file: File | null;
  previewUrl: string | null;
  isUploading: boolean;
  title: string;
  note: string;
  isFinal: boolean;
  stage: CommissionStage;
  progress: number;
  onTitleChange: (val: string) => void;
  onNoteChange: (val: string) => void;
  onIsFinalChange: (val: boolean) => void;
  onPresetSelect: (preset: {
    defaultTitle: string;
    stage: CommissionStage;
    progress: number;
    isFinal: boolean;
  }) => void;
  onClose: () => void;
  onChooseDifferentFile: () => void;
  onConfirmUpload: () => void;
}

const MILESTONE_PRESETS: MilestonePresetItem[] = [
  {
    id: 'sketch',
    label: 'Sketch',
    icon: <Pencil className="size-3.5 text-coral" />,
    defaultTitle: 'WIP #1 · Rough Composition Sketch',
    stage: 'sketch_approval',
    progress: 62,
    isFinal: false,
  },
  {
    id: 'lineart',
    label: 'Lineart',
    icon: <PenTool className="size-3.5 text-indigo-500" />,
    defaultTitle: 'WIP #2 · Clean Lineart Pass',
    stage: 'lineart_coloring',
    progress: 75,
    isFinal: false,
  },
  {
    id: 'flat_colors',
    label: 'Flat Colors',
    icon: <Palette className="size-3.5 text-teal" />,
    defaultTitle: 'WIP #3 · Flat Base Colors',
    stage: 'lineart_coloring',
    progress: 85,
    isFinal: false,
  },
  {
    id: 'shading',
    label: 'Shading',
    icon: <SunMedium className="size-3.5 text-mustard" />,
    defaultTitle: 'WIP #4 · Shading & Lighting',
    stage: 'lineart_coloring',
    progress: 92,
    isFinal: false,
  },
  {
    id: 'retouches',
    label: 'Retouches',
    icon: <Brush className="size-3.5 text-peach" />,
    defaultTitle: 'WIP #5 · Final Polish & Retouches',
    stage: 'lineart_coloring',
    progress: 96,
    isFinal: false,
  },
  {
    id: 'master',
    label: 'Final Master',
    icon: <Crown className="size-3.5 text-mustard" />,
    defaultTitle: 'Final Master · High Resolution 300 DPI',
    stage: 'completed',
    progress: 100,
    isFinal: true,
  },
];

export function WipUploadConfirmModal({
  order,
  isOpen,
  file,
  previewUrl,
  isUploading,
  title,
  note,
  isFinal,
  stage,
  progress,
  onTitleChange,
  onNoteChange,
  onIsFinalChange,
  onPresetSelect,
  onClose,
  onChooseDifferentFile,
  onConfirmUpload,
}: WipUploadConfirmModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      lockScroll(true);
      previouslyFocusedElementRef.current = document.activeElement as HTMLElement;
      return () => {
        lockScroll(false);
        previouslyFocusedElementRef.current?.focus();
      };
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen || isUploading) return;
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isUploading, onClose]);

  if (!isOpen || !file) return null;

  const fileSizeMb = (file.size / (1024 * 1024)).toFixed(2);
  const orderCode = order?.orderCode || order?.id.slice(0, 8).toUpperCase() || 'ORDER';

  return (
    <AnimatePresence>
      <div
        data-lenis-prevent
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-hidden"
      >
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => {
            if (!isUploading) onClose();
          }}
          className="fixed inset-0 bg-black/65 backdrop-blur-xs"
        />

        {/* Modal Dialog Card */}
        <motion.div
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-wip-title"
          data-lenis-prevent
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="relative z-10 flex flex-col w-full max-w-3xl lg:max-w-4xl max-h-[90vh] rounded-3xl border border-line bg-paper shadow-2xl overflow-hidden"
        >
          {/* 1. Header (Pinned at Top) */}
          <div className="flex items-center justify-between border-b border-line/70 px-5 py-4 sm:px-7 sm:py-4.5 bg-paper/95 backdrop-blur-xs shrink-0">
            <div className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-cream text-ink">
                <ImagePlus className="size-5 text-teal" />
              </span>
              <div>
                <h3 id="confirm-wip-title" className="font-display text-lg font-bold text-ink sm:text-xl">
                  Confirm Artwork Upload
                </h3>
                <p className="text-xs text-ink-mute">
                  Commission #{orderCode} · {order?.clientContact || 'Client'}
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={isUploading}
              onClick={onClose}
              className="grid size-8 place-items-center rounded-full text-ink-soft hover:bg-cream hover:text-ink disabled:opacity-40 transition-colors"
              aria-label="Close dialog"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* 2. Scrollable Body with Smooth Custom Scrollbar */}
          <div
            data-lenis-prevent
            className="flex-1 overflow-y-auto px-5 py-5 sm:pl-7 sm:pr-6 space-y-5 smooth-scrollbar"
          >
            {/* Visual Artwork Preview Card */}
            <div className="space-y-2">
              <div className="relative h-64 sm:h-80 md:h-96 w-full overflow-hidden rounded-2xl border border-line bg-canvas flex items-center justify-center group shadow-inner">
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt={file.name}
                    className="size-full object-contain p-3 transition-transform duration-200"
                  />
                ) : (
                  <div className="grid place-items-center text-ink-mute text-xs">
                    Loading artwork preview...
                  </div>
                )}

                {/* Top-Left Protection Status Tag */}
                <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-paper/95 px-3 py-1 text-xs font-semibold text-ink shadow-xs backdrop-blur-md border border-line">
                  {isFinal ? (
                    <>
                      <Sparkles className="size-3.5 text-mustard" />
                      <span>Final Master Deliverable (300 DPI)</span>
                    </>
                  ) : (
                    <>
                      <Shield className="size-3.5 text-coral" />
                      <span>Will be Watermark-Shielded</span>
                    </>
                  )}
                </div>

                {/* Bottom-Right File Info Chip */}
                <div className="absolute bottom-3 right-3 rounded-lg bg-ink/85 px-3 py-1 text-xs font-medium text-white backdrop-blur-md shadow-xs">
                  {file.name} ({fileSizeMb} MB)
                </div>
              </div>

              <div className="flex items-center justify-between px-1 text-xs text-ink-mute">
                <span>Inspect your preview closely before publishing to the client vault.</span>
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={onChooseDifferentFile}
                  className="inline-flex items-center gap-1 font-semibold text-coral hover:underline"
                >
                  <FolderOpen className="size-3.5" />
                  Choose different file
                </button>
              </div>
            </div>

            {/* Target Milestone Phase (Clean Lucide Icons, No Emojis) */}
            <div className="rounded-2xl border border-line/80 bg-canvas/60 p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-ink uppercase tracking-wider">
                  Target Milestone Phase
                </span>
                <span className="rounded-full bg-cream border border-line px-2.5 py-0.5 text-xs font-bold text-ink">
                  {progress}% Pipeline Progress
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
                {MILESTONE_PRESETS.map((p) => {
                  const isActive = isFinal ? p.isFinal : stage === p.stage && title === p.defaultTitle;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={isUploading}
                      onClick={() => onPresetSelect(p)}
                      className={cn(
                        'flex items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-semibold border transition-all',
                        isActive
                          ? 'border-ink bg-ink text-white shadow-xs'
                          : 'border-line bg-paper text-ink-soft hover:border-ink/40 hover:text-ink',
                      )}
                    >
                      {p.icon}
                      <span>{p.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Form Fields: Title & Note */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-ink uppercase tracking-wider">
                  WIP / Master Title <span className="text-coral">*</span>
                </label>
                <input
                  type="text"
                  required
                  disabled={isUploading}
                  value={title}
                  onChange={(e) => onTitleChange(e.target.value)}
                  placeholder="e.g. WIP #3 · Flat Base Colors"
                  className="mt-1.5 w-full rounded-xl border border-line bg-canvas px-3.5 py-2.5 text-xs text-ink placeholder:text-ink-mute focus:border-ink focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink uppercase tracking-wider">
                  Artist Note for Client (Optional)
                </label>
                <textarea
                  rows={2}
                  disabled={isUploading}
                  value={note}
                  onChange={(e) => onNoteChange(e.target.value)}
                  placeholder="Leave notes, questions, or specific highlights for the client..."
                  className="mt-1.5 w-full resize-none rounded-xl border border-line bg-canvas p-3 text-xs text-ink placeholder:text-ink-mute focus:border-ink focus:outline-none"
                />
              </div>

              {/* Master File Checkbox */}
              <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-line/80 bg-cream/40 p-3.5 text-xs font-semibold text-ink transition hover:bg-cream">
                <input
                  type="checkbox"
                  disabled={isUploading}
                  checked={isFinal}
                  onChange={(e) => onIsFinalChange(e.target.checked)}
                  className="size-4.5 accent-ink rounded cursor-pointer"
                />
                <div className="select-none">
                  <span className="text-xs font-bold text-ink">Mark as Final Master Deliverable</span>
                  <p className="text-[11px] font-normal text-ink-soft">
                    Stores original unwatermarked 300 DPI master file and unlocks client high-resolution download upon order completion.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* 3. Footer (Pinned at Bottom) */}
          <div className="flex items-center justify-between border-t border-line/70 px-5 py-3.5 sm:px-7 sm:py-4 bg-paper/95 backdrop-blur-xs shrink-0">
            <button
              type="button"
              disabled={isUploading}
              onClick={onChooseDifferentFile}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-soft hover:text-ink disabled:opacity-40 transition-colors"
            >
              <FolderOpen className="size-3.5 text-ink-mute" />
              <span>Change File</span>
            </button>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                disabled={isUploading}
                onClick={onClose}
                className="rounded-full px-4 py-2 text-xs font-medium text-ink-soft hover:text-ink disabled:opacity-40 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isUploading || !title.trim()}
                onClick={onConfirmUpload}
                className="inline-flex items-center justify-center gap-1.5 rounded-full bg-ink px-6 py-2.5 text-xs font-semibold text-white transition hover:bg-coral shadow-xs disabled:opacity-50"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin text-mustard" />
                    <span>Applying Shield & Uploading...</span>
                  </>
                ) : (
                  <>
                    <Check className="size-3.5 text-mustard" strokeWidth={3} />
                    <span>Confirm & Publish WIP</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
