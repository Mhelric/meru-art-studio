import { useState, useRef, type FormEvent, type ChangeEvent, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare,
  Send,
  ImagePlus,
  Volume2,
  VolumeX,
  Bell,
  X,
  CreditCard,
} from 'lucide-react';
import { cn, formatShortDate, getClientDisplayName } from '@/lib/utils';
import { uploadChatAttachment } from '@/lib/storage';
import { useStudio } from '@/context/StudioContext';
import type { AttachmentKind, SubmittedOrder } from '@/types';
import type { User } from '@supabase/supabase-js';

interface OrderChatWidgetProps {
  order: SubmittedOrder;
  user: User | null;
  soundActive?: boolean;
  onToggleSound?: () => void;
  onRequestDesktopNotifications?: () => void;
  sendOrderMessage: (
    orderId: string,
    body: string,
    attachment?: { attachmentUrl?: string; attachmentKind?: AttachmentKind; senderRole?: 'client' | 'artist' },
  ) => void;
  showToast: (msg: string) => void;
  isOpen: boolean;
  onToggleOpen: () => void;
  isArtistAdmin?: boolean;
  className?: string;
}

export function OrderChatWidget({
  order,
  user,
  soundActive = true,
  onToggleSound,
  onRequestDesktopNotifications,
  sendOrderMessage,
  showToast,
  isOpen,
  onToggleOpen,
  isArtistAdmin = false,
  className,
}: OrderChatWidgetProps) {
  const [chatInput, setChatInput] = useState('');
  const [attachmentKind, setAttachmentKind] = useState<AttachmentKind>('receipt');
  const { unreadCounts, markCommissionRead } = useStudio();
  const chatFileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const isAtBottomRef = useRef(true);

  const orderDisplayCode = order.orderCode || order.id.slice(0, 8).toUpperCase();
  const clientDisplayName = getClientDisplayName(order);

  const handleMessageScroll = () => {
    const el = messageListRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    isAtBottomRef.current = atBottom;
  };

  // Scroll to bottom and mark messages as read when opening
  useEffect(() => {
    if (isOpen) {
      markCommissionRead(order.id);
      const timer = setTimeout(() => {
        if (messageListRef.current) {
          messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen, order.id, order.messages.length, markCommissionRead]);

  // Keep at bottom when new messages arrive IF already near bottom
  useEffect(() => {
    if (isAtBottomRef.current && messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [order.messages]);

  // Handle ESC key to dismiss chat
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onToggleOpen();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onToggleOpen]);

  const handleChatFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    showToast('Uploading chat attachment...');
    const { path, error } = await uploadChatAttachment(user.id, order.id, file, attachmentKind);
    if (error || !path) {
      showToast(`Upload failed: ${error ?? 'Unknown error'}`);
    } else {
      sendOrderMessage(
        order.id,
        chatInput.trim() || `Attached ${attachmentKind}: ${file.name}`,
        {
          attachmentUrl: path,
          attachmentKind,
          senderRole: isArtistAdmin ? 'artist' : 'client',
        },
      );
    }
    setChatInput('');
    e.target.value = '';
  };

  const handleChatSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    sendOrderMessage(order.id, chatInput.trim(), {
      senderRole: isArtistAdmin ? 'artist' : 'client',
    });
    setChatInput('');
  };

  const unreadCount = isOpen ? 0 : (unreadCounts[order.id] ?? 0);

  return (
    <>
      {/* Hidden file input */}
      <input
        ref={chatFileInputRef}
        type="file"
        accept="image/*"
        onChange={handleChatFile}
        className="hidden"
      />

      {/* Mobile backdrop to easily tap outside and dismiss */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onToggleOpen}
            className="fixed inset-0 z-40 bg-ink/30 backdrop-blur-[2px] sm:hidden"
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      {/* Floating Chat Container */}
      <div className={cn('z-50', className)}>
        <AnimatePresence>
          {isOpen ? (
            /* Open Chat Window: Scopes till the very bottom with 0 space left on mobile */
            <motion.div
              data-lenis-prevent
              initial={{ opacity: 0, y: 60 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 60 }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              onWheel={(e) => e.stopPropagation()}
              onTouchMove={(e) => e.stopPropagation()}
              className="fixed inset-x-0 bottom-0 z-50 flex h-[84vh] max-h-[92dvh] flex-col overflow-hidden rounded-t-3xl border-t border-line bg-paper shadow-2xl sm:inset-auto sm:right-6 sm:bottom-6 sm:h-[540px] sm:max-h-[82vh] sm:w-[400px] sm:rounded-3xl sm:border"
            >
              {/* Mobile Drag Indicator Handle */}
              <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-ink-mute/30 sm:hidden" />

              {/* Header */}
              <div className="flex items-center justify-between border-b border-line bg-canvas/90 px-4 py-2.5 sm:px-4 sm:py-3">
                <div className="flex items-center gap-2.5 truncate">
                  <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-coral-soft text-coral">
                    <MessageSquare className="size-4" />
                  </span>
                  <div className="truncate">
                    <div className="flex items-center gap-1.5">
                      <h4 className="font-display text-xs font-bold text-ink sm:text-sm">
                        {isArtistAdmin ? `Client Chat · #${orderDisplayCode}` : `Order Chat · #${orderDisplayCode}`}
                      </h4>
                      <span className="inline-flex items-center gap-1 rounded-full bg-teal-soft px-1.5 py-0.5 text-[9px] font-semibold text-teal sm:text-[10px]">
                        <span className="size-1.5 rounded-full bg-teal animate-pulse" /> Live
                      </span>
                    </div>
                    <p className="truncate text-[10px] text-ink-mute sm:text-[11px] max-w-[200px]">
                      {isArtistAdmin
                        ? `Client: ${clientDisplayName}`
                        : 'Direct communication with Meru'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {onToggleSound && (
                    <button
                      type="button"
                      onClick={onToggleSound}
                      title={soundActive ? 'Mute chimes' : 'Unmute chimes'}
                      className={cn(
                        'grid size-7 place-items-center rounded-full border text-xs transition-colors',
                        soundActive ? 'border-line bg-paper text-teal' : 'border-line bg-paper text-ink-mute',
                      )}
                    >
                      {soundActive ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
                    </button>
                  )}

                  {onRequestDesktopNotifications && (
                    <button
                      type="button"
                      onClick={onRequestDesktopNotifications}
                      title="Enable desktop notifications"
                      className="grid size-7 place-items-center rounded-full border border-line bg-paper text-ink-soft hover:text-coral transition-colors"
                    >
                      <Bell className="size-3.5" />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={onToggleOpen}
                    title="Close chat"
                    className="grid size-7 place-items-center rounded-full border border-line bg-canvas text-ink hover:bg-coral hover:text-white transition-colors"
                  >
                    <X className="size-3.5" strokeWidth={2.5} />
                  </button>
                </div>
              </div>

              {/* Message History */}
              <div
                ref={messageListRef}
                data-lenis-prevent
                role="log"
                aria-live="polite"
                aria-label="Order messages live transcript"
                onScroll={handleMessageScroll}
                onWheel={(e) => e.stopPropagation()}
                onTouchMove={(e) => e.stopPropagation()}
                className="smooth-scrollbar flex-1 min-h-0 space-y-3 overflow-y-auto overscroll-contain p-3.5 sm:p-4 touch-pan-y"
              >
                {order.messages.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center text-center text-ink-mute">
                    <MessageSquare className="size-8 opacity-40 mb-2" />
                    <p className="text-xs">
                      {isArtistAdmin
                        ? 'No messages yet with client. Send a quick update or greeting!'
                        : 'No messages yet. Send a note or attach payment proof!'}
                    </p>
                  </div>
                ) : (
                  order.messages.map((m) => {
                    const isSelf = isArtistAdmin ? m.senderRole === 'artist' : m.senderRole !== 'artist';
                    const isArtist = m.senderRole === 'artist';

                    return (
                      <div
                        key={m.id}
                        className={cn('flex flex-col', isSelf ? 'items-end' : 'items-start')}
                      >
                        <div className="mb-1 flex items-center gap-1.5 text-[10px] text-ink-mute">
                          <span
                            className={cn(
                              'font-semibold',
                              isArtist ? 'text-coral' : 'text-teal',
                            )}
                          >
                            {isSelf ? (isArtist ? 'You (Meru Art)' : 'You (Client)') : m.senderName}
                          </span>
                          <span>·</span>
                          <span>{formatShortDate(m.createdAt.slice(0, 10))}</span>
                        </div>

                        <div
                          className={cn(
                            'max-w-[88%] rounded-2xl px-3 py-2 text-xs leading-relaxed',
                            isSelf
                              ? 'bg-ink text-white shadow-xs'
                              : 'border border-line bg-paper text-ink shadow-2xs',
                          )}
                        >
                          {m.attachmentUrl && (
                            <div className="mb-2 overflow-hidden rounded-xl border border-line bg-canvas">
                              <img
                                src={m.attachmentUrl}
                                alt="Attachment"
                                className="max-h-40 w-full object-contain"
                              />
                              {m.attachmentKind && (
                                <span className="block bg-paper px-2 py-0.5 text-[10px] font-semibold text-coral uppercase">
                                  Attached: {m.attachmentKind}
                                </span>
                              )}
                            </div>
                          )}
                          <p className="break-words">{m.body}</p>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Footer Input: Docks to the very bottom with safe-area spacing */}
              <form
                onSubmit={handleChatSubmit}
                className="border-t border-line bg-canvas/80 p-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-3 sm:pb-3"
              >
                <div className="mb-1.5 flex items-center justify-between gap-1 text-[11px]">
                  <div className="flex flex-wrap items-center gap-1">
                    {(['receipt', 'redline', 'reference'] as AttachmentKind[]).map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setAttachmentKind(k)}
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[10px] sm:text-[11px] capitalize transition-colors',
                          attachmentKind === k
                            ? 'bg-ink text-white font-medium'
                            : 'border border-line bg-paper text-ink-soft hover:text-ink',
                        )}
                      >
                        {k}
                      </button>
                    ))}

                    {isArtistAdmin && (
                      <button
                        type="button"
                        onClick={() => {
                          const amountDue = order.depositPaid
                            ? Math.max(0, order.totalUsd - order.depositUsd)
                            : order.depositUsd;
                          const cleanCode = orderDisplayCode.replace(/^MRU-/, '');
                          const invNo = `INV-MRU-${cleanCode}-${order.depositPaid ? 'FIN' : 'DEP'}`;
                          setChatInput(
                            `[Invoice #${invNo}]: $${amountDue} USD due. PayPal: mkun.arts@gmail.com (https://paypal.me/mkunarts/${amountDue}USD) | GCash: 09455121351 (Mhelric Banaag)`,
                          );
                        }}
                        className="inline-flex items-center gap-1 rounded-full border border-line bg-cream px-2 py-0.5 text-[10px] sm:text-[11px] font-semibold text-ink hover:border-ink transition"
                        title="Insert invoice summary & payment credentials into message"
                      >
                        <CreditCard className="size-2.5 text-coral" />
                        <span>+Invoice</span>
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => chatFileInputRef.current?.click()}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-coral hover:underline"
                  >
                    <ImagePlus className="size-3" /> Image
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder={
                      isArtistAdmin
                        ? `Message ${clientDisplayName}...`
                        : 'Write a message or payment ref...'
                    }
                    className="flex-1 rounded-full border border-line bg-paper px-3 py-1.5 text-xs text-ink placeholder:text-ink-mute focus:border-ink focus:outline-none sm:px-3.5 sm:py-2"
                  />
                  <button
                    type="submit"
                    aria-label="Send message"
                    className="grid size-8 shrink-0 place-items-center rounded-full bg-ink text-white transition hover:bg-coral"
                  >
                    <Send className="size-3" />
                  </button>
                </div>
              </form>
            </motion.div>
          ) : (
            /* Floating Collapsed Chat Bubble on the right */
            <motion.button
              type="button"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              onClick={onToggleOpen}
              title={
                isArtistAdmin
                  ? `Chat with ${clientDisplayName} (${orderDisplayCode})`
                  : 'Chat with Meru'
              }
              className="fixed right-4 bottom-20 z-40 group flex size-12 items-center justify-center rounded-full border-2 border-paper bg-ink shadow-2xl transition-all hover:bg-coral hover:scale-105 active:scale-95 sm:right-6 sm:bottom-6 sm:h-12 sm:w-auto sm:px-4"
            >
              <span className="relative flex size-2.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-teal opacity-75" />
                <span className="relative inline-flex size-2.5 rounded-full bg-teal" />
              </span>
              <MessageSquare className="size-5 text-mustard sm:ml-2" />
              <span className="hidden sm:inline sm:ml-2 text-xs font-semibold text-white whitespace-nowrap">
                {isArtistAdmin
                  ? `Chat with ${clientDisplayName}`
                  : 'Chat with Meru'}
              </span>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 grid min-w-5 h-5 place-items-center rounded-full bg-coral px-1 text-[10px] font-bold text-white shadow-xs">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
