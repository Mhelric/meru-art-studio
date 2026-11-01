import { type KeyboardEvent } from 'react';
import { motion } from 'framer-motion';
import {
  FileText,
  Layers,
  CreditCard,
  Sliders,
  Archive,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type AdminSubTab = 'pipeline' | 'briefs' | 'payments' | 'settings' | 'archive';

interface NavItem {
  id: AdminSubTab;
  label: string;
  short: string;
  icon: typeof Layers;
  badge?: number;
  badgeColor?: string;
}

interface AdminNavProps {
  activeSubTab: AdminSubTab;
  onChangeSubTab: (tab: AdminSubTab) => void;
  counts: {
    briefs: number;
    active: number;
    payments: number;
    archived: number;
  };
}

export function AdminNav({ activeSubTab, onChangeSubTab, counts }: AdminNavProps) {
  const tabs: NavItem[] = [
    {
      id: 'pipeline',
      label: 'Pipeline & Queue',
      short: 'Pipeline',
      icon: Layers,
      badge: counts.active,
      badgeColor: 'bg-teal text-white',
    },
    {
      id: 'briefs',
      label: 'Incoming Briefs',
      short: 'Briefs',
      icon: FileText,
      badge: counts.briefs,
      badgeColor: 'bg-mustard text-ink font-bold animate-pulse',
    },
    {
      id: 'payments',
      label: 'Payments & Ledger',
      short: 'Payments',
      icon: CreditCard,
      badge: counts.payments,
      badgeColor: 'bg-coral text-white',
    },
    {
      id: 'settings',
      label: 'Studio & Availability',
      short: 'Settings',
      icon: Sliders,
    },
    {
      id: 'archive',
      label: 'Archive & Purge',
      short: 'Archive',
      icon: Archive,
      badge: counts.archived,
      badgeColor: 'bg-line text-ink-soft',
    },
  ];

  const handleKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const currentIndex = tabs.findIndex((t) => t.id === activeSubTab);
    if (currentIndex === -1) return;

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const nextIndex = (currentIndex + 1) % tabs.length;
      onChangeSubTab(tabs[nextIndex].id);
      document.getElementById(`admin-tab-${tabs[nextIndex].id}`)?.focus();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      onChangeSubTab(tabs[prevIndex].id);
      document.getElementById(`admin-tab-${tabs[prevIndex].id}`)?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      onChangeSubTab(tabs[0].id);
      document.getElementById(`admin-tab-${tabs[0].id}`)?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      onChangeSubTab(tabs[tabs.length - 1].id);
      document.getElementById(`admin-tab-${tabs[tabs.length - 1].id}`)?.focus();
    }
  };

  return (
    <nav
      aria-label="Admin Dashboard Tabs"
      role="tablist"
      onKeyDown={handleKeyDown}
      className="mb-8 flex flex-wrap gap-2 rounded-2xl border border-line bg-paper/90 p-1.5 backdrop-blur sm:gap-2.5 sm:p-2"
    >
      {tabs.map((tab) => {
        const active = activeSubTab === tab.id;
        const Icon = tab.icon;

        return (
          <button
            key={tab.id}
            id={`admin-tab-${tab.id}`}
            role="tab"
            type="button"
            aria-selected={active}
            aria-controls={`admin-panel-${tab.id}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChangeSubTab(tab.id)}
            className={cn(
              'relative flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold whitespace-nowrap transition-all duration-200 sm:px-4 sm:py-3 sm:text-sm',
              active
                ? 'text-white'
                : 'text-ink-soft hover:bg-cream hover:text-ink',
            )}
          >
            {active && (
              <motion.span
                layoutId="admin-subtab-pill"
                className="absolute inset-0 rounded-xl bg-ink"
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5 sm:gap-2">
              <Icon className={cn('size-4 shrink-0', active ? 'text-mustard' : 'text-ink-mute')} />
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="inline sm:hidden">{tab.short}</span>
              {typeof tab.badge === 'number' && tab.badge > 0 && (
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.2 text-[10px] font-bold sm:px-2 sm:py-0.5 sm:text-xs',
                    tab.badgeColor ?? 'bg-line text-ink',
                  )}
                >
                  {tab.badge}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
