import { useStudioStatus } from '@/hooks/useStudioStatus';
import { cn } from '@/lib/utils';

interface StudioStatusBadgeProps {
  className?: string;
  pulse?: boolean;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export function StudioStatusBadge({
  className,
  pulse = true,
  size = 'md',
  showLabel = false,
}: StudioStatusBadgeProps) {
  const statusInfo = useStudioStatus();

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-medium transition-colors',
        statusInfo.badgeBg,
        statusInfo.badgeTextClass,
        size === 'sm' && 'px-2 py-0.5 text-[11px]',
        size === 'md' && 'px-2.5 py-0.5 text-xs',
        size === 'lg' && 'px-3.5 py-1 text-xs sm:text-sm',
        className,
      )}
    >
      <span className="relative flex size-1.5 sm:size-2">
        {pulse && (
          <span
            className={cn(
              'absolute inline-flex size-full rounded-full opacity-75 motion-safe:animate-ping motion-reduce:hidden',
              statusInfo.pingColor,
            )}
          />
        )}
        <span className={cn('relative inline-flex size-1.5 sm:size-2 rounded-full', statusInfo.dotColor)} />
      </span>
      <span>{showLabel ? statusInfo.label : statusInfo.badgeText}</span>
    </span>
  );
}
