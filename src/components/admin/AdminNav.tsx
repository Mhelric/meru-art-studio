import { type KeyboardEvent } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  FileText,
  Layers,
  CreditCard,
  Sliders,
  Archive,
  MessageSquare,
  ShieldCheck,
  Palette,
  XCircle,
  ChevronDown,
  ChevronRight,
  DollarSign,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type AdminSubTab = 'inbox' | 'pipeline' | 'briefs' | 'payments' | 'settings' | 'archive';

export type PipelineSection = 'details' | 'payments' | 'milestones' | 'wips' | 'cancel';

export type SettingsSection = 'availability' | 'pricing' | 'gateways';

export interface PipelineSubItem {
  id: PipelineSection;
  label: string;
  icon: typeof Layers;
}

export interface SettingsSubItem {
  id: SettingsSection;
  label: string;
  icon: typeof Sliders;
}

export const PIPELINE_SUB_ITEMS: PipelineSubItem[] = [
  { id: 'details', label: 'Order Details', icon: FileText },
  { id: 'payments', label: 'Payments', icon: CreditCard },
  { id: 'milestones', label: 'Milestones', icon: ShieldCheck },
  { id: 'wips', label: 'WIPs & Revisions', icon: Palette },
  { id: 'cancel', label: 'Cancel Order', icon: XCircle },
];

export const SETTINGS_SUB_ITEMS: SettingsSubItem[] = [
  { id: 'availability', label: 'Availability & Slots', icon: Sliders },
  { id: 'pricing', label: 'Storefront Pricing', icon: DollarSign },
  { id: 'gateways', label: 'Payment Gateways', icon: CreditCard },
];

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
  activePipelineSection?: PipelineSection;
  onChangePipelineSection?: (section: PipelineSection) => void;
  activeSettingsSection?: SettingsSection;
  onChangeSettingsSection?: (section: SettingsSection) => void;
  counts: {
    unreadMessages: number;
    briefs: number;
    active: number;
    payments: number;
    archived: number;
  };
  mode?: 'sidebar' | 'bottom-bar';
  hasActiveOrder?: boolean;
}

export function AdminNav({
  activeSubTab,
  onChangeSubTab,
  activePipelineSection = 'details',
  onChangePipelineSection,
  activeSettingsSection = 'availability',
  onChangeSettingsSection,
  counts,
  mode = 'sidebar',
}: AdminNavProps) {
  const shouldReduceMotion = useReducedMotion();

  // Primary top-level navigation tabs.
  // Note: "Payments" is relocated as a first-class sub-section under Pipeline.
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
        const isPipeline = tab.id === 'pipeline';
        const isSettings = tab.id === 'settings';
        const hasExpandablePipeline = isPipeline && counts.active > 0;
        const hasExpandableSettings = isSettings;
        const hasExpandable = hasExpandablePipeline || hasExpandableSettings;

        return (
          <div key={tab.id} className="w-full">
            <button
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

              <div className="relative z-10 flex items-center gap-1.5">
                {typeof tab.badge === 'number' && tab.badge > 0 && (
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[10px] font-bold',
                      tab.badgeColor ?? 'bg-line text-ink',
                    )}
                  >
                    {tab.badge}
                  </span>
                )}
                {hasExpandable && (
                  <span className="text-ink-mute group-hover:text-ink transition-colors">
                    {active ? (
                      <ChevronDown className="size-3.5 text-mustard" />
                    ) : (
                      <ChevronRight className="size-3.5 opacity-60" />
                    )}
                  </span>
                )}
              </div>
            </button>

            {/* Expandable Pipeline Sections */}
            <AnimatePresence>
              {hasExpandablePipeline && activeSubTab === 'pipeline' && (
                <motion.div
                  initial={shouldReduceMotion ? undefined : { height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={shouldReduceMotion ? undefined : { height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: 'easeInOut' }}
                  className="overflow-hidden pl-3 pr-1 py-1 space-y-1 border-l-2 border-line/70 ml-4 my-1"
                >
                  {PIPELINE_SUB_ITEMS.map((subItem) => {
                    const isSubActive = activePipelineSection === subItem.id;
                    const SubIcon = subItem.icon;
                    const subBadge = subItem.id === 'payments' && counts.payments > 0 ? counts.payments : undefined;

                    return (
                      <button
                        key={subItem.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onChangeSubTab('pipeline');
                          onChangePipelineSection?.(subItem.id);
                        }}
                        className={cn(
                          'group/sub flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-all',
                          isSubActive
                            ? 'bg-ink text-white font-semibold shadow-2xs'
                            : 'text-ink-soft hover:bg-cream hover:text-ink',
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <SubIcon
                            className={cn(
                              'size-3.5 shrink-0 transition-colors',
                              isSubActive ? 'text-mustard' : 'text-ink-mute group-hover/sub:text-ink',
                            )}
                          />
                          <span>{subItem.label}</span>
                        </span>
                        {typeof subBadge === 'number' && subBadge > 0 && (
                          <span className="rounded-full bg-coral px-1.5 py-0.2 text-[9px] font-bold text-white">
                            {subBadge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Expandable Settings Sections */}
            <AnimatePresence>
              {hasExpandableSettings && activeSubTab === 'settings' && (
                <motion.div
                  initial={shouldReduceMotion ? undefined : { height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={shouldReduceMotion ? undefined : { height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: 'easeInOut' }}
                  className="overflow-hidden pl-3 pr-1 py-1 space-y-1 border-l-2 border-line/70 ml-4 my-1"
                >
                  {SETTINGS_SUB_ITEMS.map((subItem) => {
                    const isSubActive = activeSettingsSection === subItem.id;
                    const SubIcon = subItem.icon;

                    return (
                      <button
                        key={subItem.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onChangeSubTab('settings');
                          onChangeSettingsSection?.(subItem.id);
                        }}
                        className={cn(
                          'group/sub flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-all',
                          isSubActive
                            ? 'bg-ink text-white font-semibold shadow-2xs'
                            : 'text-ink-soft hover:bg-cream hover:text-ink',
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <SubIcon
                            className={cn(
                              'size-3.5 shrink-0 transition-colors',
                              isSubActive ? 'text-mustard' : 'text-ink-mute group-hover/sub:text-ink',
                            )}
                          />
                          <span>{subItem.label}</span>
                        </span>
                      </button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </nav>
  );
}
