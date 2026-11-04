import { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell,
  CheckCheck,
  Volume2,
  VolumeX,
  Sparkles,
  Inbox,
  CheckCircle2,
  ImagePlus,
  CreditCard,
  ShieldCheck,
  AlertCircle,
  AlertTriangle,
  XCircle,
  MessageSquare,
  ArrowRight,
} from 'lucide-react';
import { useStudio } from '@/context/StudioContext';
import { useStudioNotifications } from '@/hooks/useStudioNotifications';
import {
  isAudioNotificationEnabled,
  setAudioNotificationEnabled,
} from '@/lib/audio';
import { formatRelativeTime, cn } from '@/lib/utils';
import type { StudioNotification, NotificationType } from '@/types';

function getNotificationIcon(type: NotificationType) {
  switch (type) {
    case 'brief_submitted':
      return <Inbox className="size-4 text-purple-600" />;
    case 'brief_accepted':
      return <CheckCircle2 className="size-4 text-teal" />;
    case 'stage_updated':
      return <Sparkles className="size-4 text-indigo-500" />;
    case 'wip_posted':
      return <ImagePlus className="size-4 text-teal" />;
    case 'payment_submitted':
      return <CreditCard className="size-4 text-mustard" />;
    case 'payment_verified':
      return <ShieldCheck className="size-4 text-teal" />;
    case 'revision_requested':
      return <AlertCircle className="size-4 text-mustard" />;
    case 'cancellation_requested':
      return <AlertTriangle className="size-4 text-coral" />;
    case 'cancellation_confirmed':
      return <XCircle className="size-4 text-coral" />;
    case 'cancellation_declined':
      return <AlertCircle className="size-4 text-mustard" />;
    case 'message_received':
    default:
      return <MessageSquare className="size-4 text-ink" />;
  }
}

export function NotificationBell() {
  const {
    submittedOrders,
    isArtistAdmin,
    user,
    setActiveTab,
    setActiveOrderId,
  } = useStudio();

  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [soundEnabled, setSoundEnabled] = useState(() =>
    isAudioNotificationEnabled(),
  );

  const containerRef = useRef<HTMLDivElement | null>(null);

  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
  } = useStudioNotifications(submittedOrders, isArtistAdmin, user?.id);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    setAudioNotificationEnabled(next);
  };

  const displayedNotifications = useMemo(() => {
    if (filter === 'unread') {
      return notifications.filter((n) => !n.isRead);
    }
    return notifications;
  }, [notifications, filter]);

  const handleNotificationClick = (item: StudioNotification) => {
    markAsRead(item.id);

    if (item.orderId) {
      setActiveOrderId(item.orderId);
    }

    if (item.targetTab === 'admin') {
      if (item.targetSubTab) {
        try {
          sessionStorage.setItem('meru_admin_target_subtab', item.targetSubTab);
        } catch {
          // ignore
        }
        window.dispatchEvent(
          new CustomEvent('meru_switch_admin_subtab', {
            detail: item.targetSubTab,
          }),
        );
      }
      setActiveTab('admin');
    } else if (item.targetTab === 'track') {
      setActiveTab('track');
    }

    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative inline-block">
      {/* Bell Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={`Studio activity notifications (${unreadCount} unread)`}
        aria-expanded={isOpen}
        title="Activity Notifications"
        className={cn(
          'relative grid size-9 place-items-center rounded-full border border-line bg-paper text-ink transition-all hover:border-ink/40 hover:bg-cream active:scale-95 sm:size-10',
          isOpen && 'border-ink/50 bg-cream ring-2 ring-ink/10',
        )}
      >
        <Bell className="size-4 sm:size-4.5" />

        {/* Unread Badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-coral text-[10px] font-bold text-white shadow-sm ring-2 ring-paper">
            {unreadCount > 9 ? '9+' : unreadCount}
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-coral opacity-60" />
          </span>
        )}
      </button>

      {/* Popover Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="fixed inset-x-3 top-16 z-50 overflow-hidden rounded-2xl border border-line bg-paper/98 shadow-2xl backdrop-blur-xl sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-2.5 sm:w-96 sm:max-w-[calc(100vw-2rem)]"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-line/80 px-4 py-3 bg-canvas/40">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold tracking-tight text-ink">
                  Activity Feed
                </span>
                {unreadCount > 0 && (
                  <span className="rounded-full bg-coral/10 px-2 py-0.5 text-[10px] font-semibold text-coral">
                    {unreadCount} unread
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                {/* Audio toggle button */}
                <button
                  type="button"
                  onClick={toggleSound}
                  title={
                    soundEnabled
                      ? 'Audio notifications ON (click to mute)'
                      : 'Audio notifications MUTED (click to enable)'
                  }
                  className="rounded-lg p-1 text-ink-mute transition hover:bg-cream hover:text-ink"
                  aria-label={soundEnabled ? 'Mute audio' : 'Unmute audio'}
                >
                  {soundEnabled ? (
                    <Volume2 className="size-4 text-teal" />
                  ) : (
                    <VolumeX className="size-4 text-ink-mute" />
                  )}
                </button>

                {/* Mark all as read */}
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={markAllAsRead}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-ink-soft transition hover:bg-cream hover:text-ink"
                    title="Mark all as read"
                  >
                    <CheckCheck className="size-3.5 text-teal" />
                    <span>Read all</span>
                  </button>
                )}
              </div>
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 border-b border-line/60 bg-paper px-3 py-2 text-xs">
              <button
                type="button"
                onClick={() => setFilter('all')}
                className={cn(
                  'rounded-full px-2.5 py-1 font-medium transition-colors',
                  filter === 'all'
                    ? 'bg-ink text-white'
                    : 'text-ink-soft hover:bg-cream hover:text-ink',
                )}
              >
                All ({notifications.length})
              </button>
              <button
                type="button"
                onClick={() => setFilter('unread')}
                className={cn(
                  'rounded-full px-2.5 py-1 font-medium transition-colors',
                  filter === 'unread'
                    ? 'bg-ink text-white'
                    : 'text-ink-soft hover:bg-cream hover:text-ink',
                )}
              >
                Unread ({unreadCount})
              </button>
            </div>

            {/* Notifications Scroll List */}
            <div className="max-h-[380px] overflow-y-auto divide-y divide-line/40 p-1.5">
              {displayedNotifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
                  <div className="grid size-10 place-items-center rounded-full bg-cream text-ink-mute">
                    <Sparkles className="size-5 text-teal" />
                  </div>
                  <p className="mt-3 text-xs font-semibold text-ink">
                    All caught up!
                  </p>
                  <p className="mt-1 max-w-[220px] text-[11px] text-ink-mute">
                    {filter === 'unread'
                      ? 'No unread notifications at the moment.'
                      : 'Live updates for commissions, WIPs, and messages will appear here.'}
                  </p>
                </div>
              ) : (
                displayedNotifications.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNotificationClick(item)}
                    className={cn(
                      'group flex w-full items-start gap-3 rounded-xl p-2.5 text-left transition-all hover:bg-canvas/80 active:scale-[0.99]',
                      !item.isRead ? 'bg-cream/45' : 'bg-transparent',
                    )}
                  >
                    {/* Icon Bubble */}
                    <div className="relative mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border border-line bg-paper shadow-2xs">
                      {getNotificationIcon(item.type)}
                      {!item.isRead && (
                        <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-coral ring-2 ring-paper" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1.5">
                        <span
                          className={cn(
                            'truncate text-xs font-medium text-ink',
                            !item.isRead && 'font-semibold',
                          )}
                        >
                          {item.title}
                        </span>
                        <span className="shrink-0 text-[10px] text-ink-mute whitespace-nowrap">
                          {formatRelativeTime(item.createdAt)}
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-[11px] text-ink-soft leading-relaxed">
                        {item.description}
                      </p>
                    </div>

                    <ArrowRight className="size-3.5 shrink-0 text-ink-mute opacity-0 transition-opacity group-hover:opacity-100 group-hover:text-ink self-center" />
                  </button>
                ))
              )}
            </div>

            {/* Footer with Role / Target Hint */}
            <div className="flex items-center justify-between border-t border-line/70 bg-canvas/60 px-3 py-2 text-[11px] text-ink-mute">
              <span>
                {isArtistAdmin ? 'Viewing as Artist Admin' : 'Viewing as Client'}
              </span>
              <span className="text-[10px] opacity-75">Click to view</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
