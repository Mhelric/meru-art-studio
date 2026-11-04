import { ArrowLeftRight } from 'lucide-react';
import { useStudio } from '@/context/StudioContext';
import { cn } from '@/lib/utils';
import type { Currency } from '@/types';

interface CurrencySwitcherProps {
  variant?: 'segmented' | 'compact' | 'badge';
  className?: string;
  showRate?: boolean;
}

export function CurrencySwitcher({
  variant = 'segmented',
  className,
  showRate = false,
}: CurrencySwitcherProps) {
  const { currency, setCurrency, toggleCurrency, studioSettings, showToast } = useStudio();

  const handleSelect = (next: Currency) => {
    if (next !== currency) {
      setCurrency(next);
      showToast(
        next === 'PHP'
          ? `Switched currency to Philippine Peso (₱). Exchange rate: 1 USD ≈ ₱${studioSettings.usdToPhpRate}`
          : 'Switched currency to US Dollar ($).',
      );
    }
  };

  const handleToggle = () => {
    toggleCurrency();
    const next = currency === 'USD' ? 'PHP' : 'USD';
    showToast(
      next === 'PHP'
        ? `Switched currency to Philippine Peso (₱). Exchange rate: 1 USD ≈ ₱${studioSettings.usdToPhpRate}`
        : 'Switched currency to US Dollar ($).',
    );
  };

  if (variant === 'compact') {
    return (
      <button
        type="button"
        onClick={handleToggle}
        className={cn(
          'inline-flex shrink-0 items-center gap-1 rounded-full border border-line bg-paper px-2.5 py-1 text-xs font-bold text-ink shadow-2xs transition-all hover:border-coral hover:bg-cream active:scale-95',
          className,
        )}
        aria-label={`Current currency: ${currency}. Click to switch to ${currency === 'USD' ? 'PHP (₱)' : 'USD ($)'}`}
        title={`Click to toggle currency · 1 USD ≈ ₱${studioSettings.usdToPhpRate}`}
      >
        <ArrowLeftRight className="size-3 text-coral stroke-[2.5]" />
        <span>{currency === 'USD' ? '$ USD' : '₱ PHP'}</span>
      </button>
    );
  }

  if (variant === 'badge') {
    return (
      <div className={cn('inline-flex items-center gap-1.5 text-xs text-ink-soft', className)}>
        <span className="font-semibold text-ink">{currency === 'USD' ? '$ USD' : '₱ PHP'}</span>
        <button
          type="button"
          onClick={handleToggle}
          className="text-[11px] font-bold text-coral underline underline-offset-2 hover:text-ink transition"
        >
          Switch to {currency === 'USD' ? 'PHP (₱)' : 'USD ($)'}
        </button>
      </div>
    );
  }

  return (
    <div className={cn('inline-flex items-center gap-2', className)}>
      <div
        role="group"
        aria-label="Currency selection"
        className="inline-flex items-center rounded-full border border-line bg-paper/95 p-0.5 shadow-2xs backdrop-blur-xs"
      >
        <button
          type="button"
          onClick={() => handleSelect('USD')}
          aria-pressed={currency === 'USD'}
          className={cn(
            'relative rounded-full px-2.5 py-1 text-xs font-bold transition-all duration-200',
            currency === 'USD'
              ? 'bg-ink text-white shadow-2xs'
              : 'text-ink-soft hover:bg-cream hover:text-ink',
          )}
        >
          $ USD
        </button>

        <button
          type="button"
          onClick={() => handleSelect('PHP')}
          aria-pressed={currency === 'PHP'}
          className={cn(
            'relative rounded-full px-2.5 py-1 text-xs font-bold transition-all duration-200',
            currency === 'PHP'
              ? 'bg-ink text-white shadow-2xs'
              : 'text-ink-soft hover:bg-cream hover:text-ink',
          )}
        >
          ₱ PHP
        </button>
      </div>

      {showRate && (
        <span className="text-[11px] font-medium text-ink-mute">
          1 USD ≈ ₱{studioSettings.usdToPhpRate}
        </span>
      )}
    </div>
  );
}
