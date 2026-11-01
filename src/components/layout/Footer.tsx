import { useState } from 'react';
import { ARTIST, SOCIALS } from '@/data/artist';
import { BrandIcon } from '@/components/ui/BrandIcon';
import { PrivacyPolicyModal } from '@/components/legal/PrivacyPolicyModal';
import { ShieldCheck } from 'lucide-react';

export function Footer() {
  const [privacyOpen, setPrivacyOpen] = useState(false);

  return (
    <>
      <footer className="mt-28 border-t border-line bg-cream/50 px-4 pt-12 pb-28 sm:pb-12">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 sm:flex-row">
          <div className="flex items-center gap-3">
            <img src="/brand/mark-192.png" alt="" className="size-10 rounded-2xl border border-line object-cover" />
            <div>
              <p className="font-display text-lg font-semibold text-ink">{ARTIST.name}</p>
              <p className="text-xs text-ink-mute">
                © {new Date().getFullYear()} · All artwork protected — no reposting, AI training, or NFT use.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setPrivacyOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-3.5 py-1.5 text-xs font-medium text-ink transition hover:border-ink/40 hover:bg-cream"
            >
              <ShieldCheck className="size-3.5 text-teal" /> Privacy Policy
            </button>

            <div className="flex items-center gap-2">
              {SOCIALS.filter((s) => s.id !== 'discord').map((s) => (
                <a
                  key={s.id}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                  className="grid size-9 place-items-center rounded-full border border-line bg-paper text-ink-soft transition hover:border-ink/30 hover:text-ink"
                >
                  <BrandIcon id={s.id} className="size-4" />
                </a>
              ))}
            </div>
          </div>
        </div>

        <p className="mx-auto mt-6 max-w-6xl text-center text-xs text-ink-mute sm:text-left">
          Designed & engineered by{' '}
          <a
            href="https://mhelric.vercel.app"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-ink underline decoration-coral/60 underline-offset-4 hover:text-coral"
          >
            mhelric
          </a>{' '}
          · React · TypeScript · Tailwind · Framer Motion · Supabase Realtime
        </p>
      </footer>

      <PrivacyPolicyModal isOpen={privacyOpen} onClose={() => setPrivacyOpen(false)} />
    </>
  );
}
