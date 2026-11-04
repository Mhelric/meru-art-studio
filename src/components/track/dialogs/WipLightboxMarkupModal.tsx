import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Brush,
  Hand,
  Trash2,
  Download,
  Check,
  Undo2,
  Sparkles,
} from 'lucide-react';
import type { WipUploadItem } from '@/types';
import { artSrc } from '@/components/portfolio/ArtImage';
import { lockScroll } from '@/lib/smoothScroll';

interface WipLightboxMarkupModalProps {
  isOpen: boolean;
  onClose: () => void;
  wip: WipUploadItem | null;
  orderCode?: string;
  onAttachRedline?: (file: File) => void;
}

const REDLINE_COLORS = [
  { id: 'red', hex: '#ef4444', label: 'Crimson Red' },
  { id: 'coral', hex: '#f97316', label: 'Coral Orange' },
  { id: 'cyan', hex: '#06b6d4', label: 'Electric Cyan' },
  { id: 'yellow', hex: '#eab308', label: 'High-Vis Yellow' },
  { id: 'white', hex: '#ffffff', label: 'Pure White' },
];

const BRUSH_SIZES = [
  { size: 2, label: 'Fine' },
  { size: 5, label: 'Medium' },
  { size: 10, label: 'Bold' },
];

interface StrokePoint {
  x: number;
  y: number;
}

interface Stroke {
  points: StrokePoint[];
  color: string;
  size: number;
}

export function WipLightboxMarkupModal({
  isOpen,
  onClose,
  wip,
  orderCode = 'MRU',
  onAttachRedline,
}: WipLightboxMarkupModalProps) {
  const [mode, setMode] = useState<'inspect' | 'draw'>('inspect');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0 });

  const [activeColor, setActiveColor] = useState(REDLINE_COLORS[0].hex);
  const [activeSize, setActiveSize] = useState(BRUSH_SIZES[1].size);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<StrokePoint[]>([]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Initialize and reset
  useEffect(() => {
    if (isOpen) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setStrokes([]);
      setCurrentStroke([]);
      setMode('inspect');
      lockScroll(true);
      return () => lockScroll(false);
    }
  }, [isOpen]);

  const imageUrl = wip?.imageUrl || (wip?.slug ? artSrc(wip.slug, 'full') : '');

  // Redraw canvas whenever strokes or currentStroke changes
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const allStrokes = [...strokes];
    if (currentStroke.length > 0) {
      allStrokes.push({
        points: currentStroke,
        color: activeColor,
        size: activeSize,
      });
    }

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const stroke of allStrokes) {
      if (stroke.points.length < 2) continue;
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.size;
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
    }
  }, [strokes, currentStroke, activeColor, activeSize]);

  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

  // Adjust canvas size when image loads
  const handleImageLoad = () => {
    const img = imageRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    redrawCanvas();
  };

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        setStrokes((prev) => prev.slice(0, -1));
      }
      if (e.key === '+' || e.key === '=') {
        setZoom((z) => Math.min(z + 0.25, 4));
      }
      if (e.key === '-') {
        setZoom((z) => Math.max(z - 0.25, 0.5));
      }
      if (e.key === '0') {
        setZoom(1);
        setPan({ x: 0, y: 0 });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Get canvas coordinates from mouse/touch event
  const getCanvasCoords = (e: React.PointerEvent<HTMLCanvasElement>): StrokePoint | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (mode === 'inspect') {
      setIsPanning(true);
      panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
      return;
    }

    if (mode === 'draw') {
      const pt = getCanvasCoords(e);
      if (!pt) return;
      setIsDrawing(true);
      setCurrentStroke([pt]);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (mode === 'inspect' && isPanning) {
      setPan({
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y,
      });
      return;
    }

    if (mode === 'draw' && isDrawing) {
      const pt = getCanvasCoords(e);
      if (!pt) return;
      setCurrentStroke((prev) => [...prev, pt]);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (mode === 'inspect') {
      setIsPanning(false);
      return;
    }

    if (mode === 'draw' && isDrawing) {
      setIsDrawing(false);
      if (currentStroke.length > 0) {
        setStrokes((prev) => [
          ...prev,
          {
            points: currentStroke,
            color: activeColor,
            size: activeSize,
          },
        ]);
        setCurrentStroke([]);
      }
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
  };

  const handleUndo = () => {
    setStrokes((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    setStrokes([]);
    setCurrentStroke([]);
  };

  // Export merged or markup-only image file
  const generateExportFile = async (): Promise<File> => {
    return new Promise((resolve, reject) => {
      const canvas = canvasRef.current;
      const img = imageRef.current;
      if (!canvas) {
        reject(new Error('Canvas not found'));
        return;
      }

      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = canvas.width;
      exportCanvas.height = canvas.height;
      const ctx = exportCanvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get export canvas context'));
        return;
      }

      const finishExport = () => {
        // Draw the redline strokes
        ctx.drawImage(canvas, 0, 0);

        exportCanvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to create redline image blob'));
              return;
            }
            const cleanTitle = (wip?.title || 'wip').replace(/[^a-zA-Z0-9_-]/g, '_');
            const file = new File(
              [blob],
              `Redline-${orderCode}-${cleanTitle}-${Date.now()}.png`,
              { type: 'image/png' },
            );
            resolve(file);
          },
          'image/png',
          0.95,
        );
      };

      if (img && img.complete) {
        try {
          ctx.drawImage(img, 0, 0, exportCanvas.width, exportCanvas.height);
          finishExport();
        } catch {
          // Fallback if cross-origin taint: export markup alone
          finishExport();
        }
      } else {
        finishExport();
      }
    });
  };

  const handleAttachToRevision = async () => {
    if (!onAttachRedline) return;
    try {
      const file = await generateExportFile();
      onAttachRedline(file);
      onClose();
    } catch {
      // ignore
    }
  };

  const handleDownloadMarkup = async () => {
    try {
      const file = await generateExportFile();
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  };

  if (!isOpen || !wip) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex flex-col bg-ink/90 backdrop-blur-md select-none overflow-hidden">
        {/* Top Floating Control Bar */}
        <motion.div
          initial={{ y: -24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-black/40 px-4 py-3 text-white backdrop-blur-md"
        >
          {/* Deliverable Info */}
          <div className="flex items-center gap-3">
            <span className="grid size-8 place-items-center rounded-xl bg-white/10 text-coral">
              <Sparkles className="size-4" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-coral uppercase tracking-wider">
                  {wip.isFinal ? 'Final Master' : 'WIP Pass'}
                </span>
                <span className="text-xs font-mono text-white/50">#{orderCode}</span>
              </div>
              <h3 className="font-display text-sm sm:text-base font-bold text-white truncate max-w-[200px] sm:max-w-md">
                {wip.title}
              </h3>
            </div>
          </div>

          {/* Mode Switcher */}
          <div className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 p-1 text-xs">
            <button
              type="button"
              onClick={() => setMode('inspect')}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold transition ${
                mode === 'inspect'
                  ? 'bg-white text-ink shadow-2xs'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              <Hand className="size-3.5" />
              <span>Pan & Inspect</span>
            </button>

            <button
              type="button"
              onClick={() => setMode('draw')}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold transition ${
                mode === 'draw'
                  ? 'bg-coral text-white shadow-2xs'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              <Brush className="size-3.5" />
              <span>Draw Redline</span>
            </button>
          </div>

          {/* Redline Toolset (Only when in Draw Mode) */}
          {mode === 'draw' && (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/15 bg-black/60 px-3 py-1.5">
              {/* Color chips */}
              <div className="flex items-center gap-1.5 border-r border-white/15 pr-2">
                {REDLINE_COLORS.map((col) => (
                  <button
                    key={col.id}
                    type="button"
                    onClick={() => setActiveColor(col.hex)}
                    style={{ backgroundColor: col.hex }}
                    title={col.label}
                    className={`size-5 rounded-full border border-white/30 transition-transform ${
                      activeColor === col.hex ? 'scale-125 ring-2 ring-white ring-offset-1 ring-offset-black' : 'hover:scale-110'
                    }`}
                  />
                ))}
              </div>

              {/* Stroke sizes */}
              <div className="flex items-center gap-1 border-r border-white/15 pr-2">
                {BRUSH_SIZES.map((bs) => (
                  <button
                    key={bs.size}
                    type="button"
                    onClick={() => setActiveSize(bs.size)}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition ${
                      activeSize === bs.size ? 'bg-white text-ink' : 'text-white/60 hover:text-white'
                    }`}
                  >
                    {bs.label}
                  </button>
                ))}
              </div>

              {/* Undo & Clear */}
              <button
                type="button"
                disabled={strokes.length === 0}
                onClick={handleUndo}
                title="Undo last stroke (Ctrl+Z)"
                className="grid size-7 place-items-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-30 transition"
              >
                <Undo2 className="size-3.5" />
              </button>

              <button
                type="button"
                disabled={strokes.length === 0}
                onClick={handleClear}
                title="Clear all redlines"
                className="grid size-7 place-items-center rounded-lg text-white/70 hover:bg-white/10 hover:text-coral disabled:opacity-30 transition"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          )}

          {/* Zoom controls & Close */}
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-1 rounded-full border border-white/15 bg-white/10 p-0.5 text-xs text-white">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(z - 0.25, 0.5))}
                title="Zoom Out (-)"
                className="grid size-7 place-items-center rounded-full hover:bg-white/10"
              >
                <ZoomOut className="size-3.5" />
              </button>

              <span className="w-11 text-center font-mono text-[11px] font-bold">
                {Math.round(zoom * 100)}%
              </span>

              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(z + 0.25, 4))}
                title="Zoom In (+)"
                className="grid size-7 place-items-center rounded-full hover:bg-white/10"
              >
                <ZoomIn className="size-3.5" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setZoom(1);
                  setPan({ x: 0, y: 0 });
                }}
                title="Reset Zoom (0)"
                className="grid size-7 place-items-center rounded-full hover:bg-white/10"
              >
                <RotateCcw className="size-3" />
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="grid size-8 place-items-center rounded-full bg-white/10 text-white/80 hover:bg-white/20 transition"
              aria-label="Close Lightbox"
            >
              <X className="size-4" />
            </button>
          </div>
        </motion.div>

        {/* Interactive Viewport Area */}
        <div
          ref={containerRef}
          className="relative flex-1 overflow-hidden flex items-center justify-center p-4 cursor-crosshair"
          style={{
            cursor: mode === 'inspect' ? (isPanning ? 'grabbing' : 'grab') : 'crosshair',
          }}
        >
          <div
            className="relative transition-transform duration-75 select-none touch-none"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: 'center center',
            }}
          >
            {/* Background WIP image */}
            <img
              ref={imageRef}
              src={imageUrl}
              alt={wip.title}
              onLoad={handleImageLoad}
              crossOrigin="anonymous"
              draggable={false}
              className="max-h-[75vh] max-w-[90vw] object-contain rounded-xl shadow-2xl pointer-events-none select-none"
            />

            {/* Redline Canvas Overlay */}
            <canvas
              ref={canvasRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              className="absolute inset-0 size-full touch-none"
            />
          </div>
        </div>

        {/* Bottom Action Footer */}
        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-black/60 px-5 py-3 text-white backdrop-blur-md"
        >
          <div className="flex items-center gap-2 text-xs text-white/70">
            {strokes.length > 0 ? (
              <span className="flex items-center gap-1.5 rounded-full bg-coral/20 border border-coral/40 px-3 py-1 font-semibold text-coral">
                <Check className="size-3" strokeWidth={3} />
                {strokes.length} Redline {strokes.length === 1 ? 'stroke' : 'strokes'} drawn
              </span>
            ) : (
              <span>
                Tip: Switch to <strong>Draw Redline</strong> to sketch anatomical or pose adjustments directly onto the artwork.
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            {strokes.length > 0 && (
              <button
                type="button"
                onClick={handleDownloadMarkup}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/20 transition"
              >
                <Download className="size-3.5" />
                <span>Save Redline PNG</span>
              </button>
            )}

            {onAttachRedline && strokes.length > 0 && (
              <button
                type="button"
                onClick={handleAttachToRevision}
                className="inline-flex items-center gap-1.5 rounded-full bg-coral px-5 py-2 text-xs font-bold text-white shadow-lg hover:bg-white hover:text-ink transition"
              >
                <Check className="size-3.5" strokeWidth={3} />
                <span>Attach to Revision Request</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-white/80 hover:bg-white/10 transition"
            >
              Done
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
