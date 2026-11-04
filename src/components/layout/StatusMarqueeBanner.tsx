import { useStudio } from '@/context/StudioContext';
import { useStudioStatus } from '@/hooks/useStudioStatus';
import { cn } from '@/lib/utils';
import { STUDIO_AVAILABILITY } from '@/data/schedule';

export function StatusMarqueeBanner() {
  const { studioSettings, openDrawer, setActiveTab } = useStudio();
  const statusInfo = useStudioStatus();

  let messageText = '';
  if (statusInfo.isOpen) {
    messageText = `✦ COMMISSIONS ARE OPEN · ${studioSettings.maxSlots} SLOTS AVAILABLE · LIVE USD & PHP PRICING · ACCEPTING CHARACTER ILLUSTRATIONS, CHIBIS & GRAPHICS ✦`;
  } else if (statusInfo.isWaitlist) {
    messageText = `✦ STUDIO WAITLIST ACTIVE · RESERVE YOUR UPCOMING SPOT IN QUEUE · NEXT OPEN WINDOW: ${STUDIO_AVAILABILITY.nextOpenWindow} ✦`;
  } else {
    messageText = `✦ COMMISSIONS TEMPORARILY CLOSED · STUDIO AT FULL CAPACITY · CHECK SCHEDULE TAB FOR UPCOMING AVAILABILITY ✦`;
  }

  const handleClick = () => {
    if (statusInfo.isOpen) {
      openDrawer();
    } else {
      setActiveTab('schedule');
    }
  };

  // Repeated items for seamless infinite marquee loop
  const repeatedItems = Array(4).fill(messageText);

  return (
    <div
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      aria-label={`Studio status announcement: ${statusInfo.label}. Click to ${statusInfo.isOpen ? 'request commission' : 'view schedule'}.`}
      className={cn(
        'group relative w-full cursor-pointer overflow-hidden py-1.5 transition-colors select-none text-xs font-bold tracking-wide shadow-xs',
        statusInfo.isOpen && 'bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 text-white border-b border-emerald-700/60 hover:brightness-105',
        statusInfo.isWaitlist && 'bg-amber-600 text-white border-b border-amber-700/60 hover:brightness-105',
        statusInfo.isClosed && 'bg-rose-700 text-white border-b border-rose-800/60 hover:brightness-105',
      )}
    >
      <div className="flex w-max animate-marquee-x group-hover:[animation-play-state:paused]">
        {repeatedItems.map((item, idx) => (
          <div key={idx} className="flex shrink-0 items-center gap-6 px-4">
            <span className="flex items-center gap-2 whitespace-nowrap">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-white opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-white" />
              </span>
              {item}
            </span>
            <span className="opacity-50">✦</span>
          </div>
        ))}
      </div>
    </div>
  );
}
