import { type KeyboardEvent } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  FileText,
  Layers,
  CreditCard,
  Sliders,
  Archive,
  MessageSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type AdminSubTab = 'inbox' | 'pipeline' | 'briefs' | 'payments' | 'settings' | 'archive';

interface NavItem {
  id: AdminSubTab;
  label: string;
  icon: typeof Layers;
  badge?: number;
  badgeColor?: string;
}

interface AdminNavProps {
  activeSubTab: AdminSubTab;
  onChangeSubTab: (tab: AdminSubTab) => void;
  counts: {
    unreadMessages: number;
    briefs: number;
    active: number;
    payments: number;
    archived: number;
  };
  mode?: 'sidebar' | 'bottom-bar';
}

export function AdminNav({ activeSubTab, onChangeSubTab, counts, mode = 'sidebar' }: AdminNavProps) {
  const shouldReduceMotion = useReducedMotion();

  const tabs: NavItem[] = [
    {
      id: 'inbox',
      label: 'Inbox',
      icon: MessageSquare,
      badge: counts.unreadMessages,
      badgeColor: 'bg-coral text-white font-bold animate-pulse motion-reduce:animate-none',
    },
    {
      id: 'pipeline',
      label: 'Pipeline',
      icon: Layers,
      badge: counts.active,
      badgeColor: 'bg-teal text-white',
    },
    {
      id: 'briefs',
      label: 'Briefs',
      icon: FileText,
      badge: counts.briefs,
      badgeColor: 'bg-mustard text-ink font-bold animate-pulse motion-reduce:animate-none',
    },
    {
      id: 'payments',
      label: 'Payments',
      icon: CreditCard,
      badge: counts.payments,
      badgeColor: 'bg-coral text-white',
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: Sliders,
    },
    {
      id: 'archive',
      label: 'Archive',
      icon: Archive,
      badge: counts.archived,
      badgeColor: 'bg-line text-ink-soft',
    },
  ];

  const handleKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const target = e.target as HTMLElement;
    const tabButton = target.closest<HTMLButtonElement>('button[role="tab"]');
    const tabId = tabButton?.id.replace(/admin-tab-(sidebar|bottom)-/, '');
    let currentIndex = tabs.findIndex((t) => t.id === tabId);
    if (currentIndex === -1) {
      currentIndex = tabs.findIndex((t) => t.id === activeSubTab);
    }
    if (currentIndex === -1) return;

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = (currentIndex + 1) % tabs.length;
      onChangeSubTab(tabs[nextIndex].id);
      document.getElementById(`admin-tab-${mode}-${tabs[nextIndex].id}`)?.focus();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      onChangeSubTab(tabs[prevIndex].id);
      document.getElementById(`admin-tab-${mode}-${tabs[prevIndex].id}`)?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      onChangeSubTab(tabs[0].id);
      document.getElementById(`admin-tab-${mode}-${tabs[0].id}`)?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      onChangeSubTab(tabs[tabs.length - 1].id);
      document.getElementById(`admin-tab-${mode}-${tabs[tabs.length - 1].id}`)?.focus();
    }
  };

  // Mobile fixed bottom bar
  if (mode === 'bottom-bar') {
    return (
      <nav
        aria-label="Admin Mobile Navigation"
        role="tablist"
        aria-orientation="horizontal"
        onKeyDown={handleKeyDown}
        className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-line bg-paper/95 px-1 py-1.5 shadow-lg backdrop-blur pb-[max(0.375rem,env(safe-area-inset-bottom))]"
      >
        {tabs.map((tab) => {
          const active = activeSubTab === tab.id;
          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              id={`admin-tab-bottom-${tab.id}`}
              role="tab"
              type="button"
              aria-selected={active}
              aria-controls={`admin-panel-${tab.id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => onChangeSubTab(tab.id)}
              className={cn(
                'relative flex min-w-[50px] flex-col items-center justify-center gap-1 rounded-xl px-2 py-1.5 text-[10px] font-medium transition-all duration-150',
                active ? 'font-bold text-ink' : 'text-ink-mute hover:text-ink',
              )}
            >
              {active && (
                <motion.span
                  layoutId={shouldReduceMotion ? undefined : 'admin-bottom-active-pill'}
                  className="absolute -top-1.5 h-1 w-6 rounded-full bg-coral"
                  transition={shouldReduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
              <span className="relative">
                <Icon className={cn('size-4 shrink-0', active ? 'text-coral' : 'text-ink-soft')} />
                {typeof tab.badge === 'number' && tab.badge > 0 && (
                  <span
                    className={cn(
                      'absolute -top-1.5 -right-2 grid h-3.5 min-w-3.5 place-items-center rounded-full px-1 text-[9px] font-bold leading-none',
                      tab.badgeColor ?? 'bg-coral text-white',
                    )}
                  >
                    {tab.badge > 9 ? '9+' : tab.badge}
                  </span>
                )}
              </span>
              <span className="leading-tight">{tab.label}</span>
            </button>
          );
        })}
      </nav>
    );
  }

  // Desktop fixed/sticky left sidebar navigation
  return (
    <nav
      aria-label="Admin Navigation Sidebar"
      role="tablist"
      aria-orientation="vertical"
      onKeyDown={handleKeyDown}
      className="flex w-full flex-col gap-1.5 rounded-2xl border border-line bg-paper/90 p-2 shadow-xs backdrop-blur"
    >
      <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-mute">
        Admin Console
      </div>

      {tabs.map((tab) => {
        const active = activeSubTab === tab.id;
        const Icon = tab.icon;

        return (
          <button
            key={tab.id}
            id={`admin-tab-sidebar-${tab.id}`}
            role="tab"
            type="button"
            aria-selected={active}
            aria-controls={`admin-panel-${tab.id}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChangeSubTab(tab.id)}
            className={cn(
              'group relative flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-semibold transition-all duration-200',
              active
                ? 'text-white'
                : 'text-ink-soft hover:bg-cream hover:text-ink',
            )}
          >
            {active && (
              <motion.span
                layoutId={shouldReduceMotion ? undefined : 'admin-sidebar-active-pill'}
                className="absolute inset-0 rounded-xl bg-ink"
                transition={shouldReduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-2.5">
              <Icon
                className={cn(
                  'size-4 shrink-0 transition-colors',
                  active ? 'text-mustard' : 'text-ink-mute group-hover:text-ink',
                )}
              />
              <span>{tab.label}</span>
            </span>

            {typeof tab.badge === 'number' && tab.badge > 0 && (
              <span
                className={cn(
                  'relative z-10 rounded-full px-2 py-0.5 text-[10px] font-bold',
                  tab.badgeColor ?? 'bg-line text-ink',
                )}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
