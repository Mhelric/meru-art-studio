import { useStudio } from '@/context/StudioContext';
import type { AvailabilityStatus } from '@/types';

export interface StudioStatusInfo {
  status: AvailabilityStatus;
  isOpen: boolean;
  isWaitlist: boolean;
  isClosed: boolean;
  label: string;
  badgeText: string;
  dotColor: string;
  pingColor: string;
  badgeBg: string;
  badgeTextClass: string;
  badgeBorderClass: string;
}

export function mapStudioStatus(status: AvailabilityStatus = 'open'): StudioStatusInfo {
  switch (status) {
    case 'open':
      return {
        status: 'open',
        isOpen: true,
        isWaitlist: false,
        isClosed: false,
        label: 'Open for Commissions',
        badgeText: 'Open',
        dotColor: 'bg-emerald-500',
        pingColor: 'bg-emerald-400',
        badgeBg: 'bg-emerald-500/15 border border-emerald-500/40',
        badgeTextClass: 'text-emerald-700 font-bold',
        badgeBorderClass: 'border-emerald-500/40',
      };
    case 'waitlist':
      return {
        status: 'waitlist',
        isOpen: false,
        isWaitlist: true,
        isClosed: false,
        label: 'Waitlist Only',
        badgeText: 'Waitlist',
        dotColor: 'bg-mustard',
        pingColor: 'bg-mustard',
        badgeBg: 'bg-mustard-soft',
        badgeTextClass: 'text-mustard',
        badgeBorderClass: 'border-mustard/30',
      };
    case 'closed':
    default:
      return {
        status: 'closed',
        isOpen: false,
        isWaitlist: false,
        isClosed: true,
        label: 'Commissions Closed',
        badgeText: 'Closed',
        dotColor: 'bg-coral',
        pingColor: 'bg-coral',
        badgeBg: 'bg-coral-soft',
        badgeTextClass: 'text-coral',
        badgeBorderClass: 'border-coral/30',
      };
  }
}

export function useStudioStatus(): StudioStatusInfo {
  const { studioSettings } = useStudio();
  return mapStudioStatus(studioSettings?.status);
}
