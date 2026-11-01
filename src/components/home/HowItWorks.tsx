import {
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Paintbrush,
  ShieldCheck,
  Star,
} from 'lucide-react';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { Reveal } from '@/components/ui/Reveal';
import { useStudio } from '@/context/StudioContext';

const STEPS = [
  {
    num: '01',
    title: 'Brief & References',
    desc: 'Pick your commission tier, upload character reference sheets, and describe desired poses, expressions, and vibe.',
    badge: 'No Upfront Charge',
    icon: FileText,
    accent: 'coral',
  },
  {
    num: '02',
    title: 'Review & Scheduling',
    desc: 'Meru reviews your brief, confirms slot availability, and locks in estimated start and completion dates on the calendar.',
    badge: '1-on-1 Studio Slot',
    icon: Clock,
    accent: 'mustard',
  },
  {
    num: '03',
    title: '50% Deposit & Sketching',
    desc: 'Verify upfront deposit to unlock the canvas. Meru posts watermarked composition and expression sketches to your order room.',
    badge: 'Full Refund Window',
    icon: Paintbrush,
    accent: 'peach',
  },
  {
    num: '04',
    title: 'Approval & Lineart',
    desc: 'Approve the draft or request revisions with redlines. Settle the remaining balance as inking and coloring begin.',
    badge: '100% Transparency',
    icon: CheckCircle2,
    accent: 'lilac',
  },
  {
    num: '05',
    title: '300 DPI Master Delivery',
    desc: 'Once completed, the physical watermark shield unlocks. Download full-resolution 300 DPI master PNG files from your vault.',
    badge: 'Instant Vault Download',
    icon: Download,
    accent: 'teal',
  },
];

const TESTIMONIALS = [
  {
    quote:
      'The pizza-tracker room was incredible to watch! Being able to approve sketches directly and inspect WIP updates gave me complete confidence in my VTuber model art.',
    client: 'KitsuneNeko',
    platform: 'VTuber / Content Creator',
    tier: 'Fullbody Illustration',
    rating: 5,
  },
  {
    quote:
      'Meru was super responsive in the order chat. The split payment and clear TOS meant zero anxiety about deadlines. The final 300 DPI print turned out gorgeous.',
    client: 'Aetheris',
    platform: 'D&D Campaign Lead',
    tier: 'Halfbody Character',
    rating: 5,
  },
  {
    quote:
      'Quickest turnaround and cleanest lineart I have commissioned. The watermarked WIP checks allowed me to tweak the eye color before final rendering started.',
    client: 'Rin_Chibi',
    platform: 'Discord Client',
    tier: 'Chibi Duo Bundle',
    rating: 5,
  },
];

export function HowItWorks() {
  const { openDrawer } = useStudio();

  return (
    <section id="how-it-works" className="py-20 sm:py-28">
      <SectionHeading
        eyebrow="Workflow & Client Safeguards"
        title="How art commissions work from brief to delivery"
        subtitle="Transparent milestones, split 50/50 payments, and physical canvas watermarking protect your time, money, and characters at every step."
      />

      {/* 5-Step Roadmap Stepper */}
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {STEPS.map((step, idx) => {
          const Icon = step.icon;
          return (
            <Reveal
              key={step.num}
              delay={idx * 0.08}
              className="group relative flex flex-col justify-between rounded-2xl border border-line bg-paper p-5 transition-all hover:border-ink/30 hover:shadow-sm"
            >
              <div>
                <div className="mb-4 flex items-center justify-between">
                  <span className="font-display text-2xl font-bold text-ink-mute group-hover:text-ink transition-colors">
                    {step.num}
                  </span>
                  <span className="grid size-9 place-items-center rounded-xl bg-canvas text-ink group-hover:scale-105 transition-transform">
                    <Icon className="size-4 text-coral" />
                  </span>
                </div>
                <h4 className="font-display text-base font-semibold text-ink leading-snug">
                  {step.title}
                </h4>
                <p className="mt-2 text-xs leading-relaxed text-ink-soft">
                  {step.desc}
                </p>
              </div>

              <div className="mt-5 pt-3 border-t border-line/60">
                <span className="inline-block rounded-full bg-cream px-2.5 py-0.5 text-[10px] font-semibold text-ink-soft">
                  {step.badge}
                </span>
              </div>
            </Reveal>
          );
        })}
      </div>

      {/* Social Proof & Metrics Strip */}
      <Reveal delay={0.3} className="mt-12 rounded-3xl border border-line bg-cream/70 p-6 sm:p-8">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 text-center sm:text-left">
          <div className="border-b sm:border-b-0 sm:border-r border-line pb-4 sm:pb-0 sm:pr-4">
            <p className="font-display text-3xl font-bold text-ink sm:text-4xl">40+</p>
            <p className="mt-1 text-xs font-medium text-ink-soft">Custom Commissions Delivered</p>
          </div>
          <div className="border-b sm:border-b-0 sm:border-r border-line pb-4 sm:pb-0 sm:pr-4">
            <p className="font-display text-3xl font-bold text-ink sm:text-4xl">100%</p>
            <p className="mt-1 text-xs font-medium text-ink-soft">On-Time Calendar Delivery</p>
          </div>
          <div className="border-b sm:border-b-0 sm:border-r border-line pb-4 sm:pb-0 sm:pr-4">
            <p className="font-display text-3xl font-bold text-ink sm:text-4xl">5.0 ★</p>
            <p className="mt-1 text-xs font-medium text-ink-soft">Client Satisfaction Rating</p>
          </div>
          <div>
            <p className="font-display text-3xl font-bold text-teal sm:text-4xl">Zero</p>
            <p className="mt-1 text-xs font-medium text-ink-soft">Disputes · Full TOS Protections</p>
          </div>
        </div>
      </Reveal>

      {/* Client Testimonials Carousel / Grid */}
      <div className="mt-12">
        <div className="mb-6 flex items-center justify-between">
          <p className="font-display text-lg font-semibold text-ink">Client Experiences & Feedback</p>
          <span className="text-xs text-ink-soft flex items-center gap-1">
            <ShieldCheck className="size-3.5 text-teal" /> Verified Commission Reviews
          </span>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {TESTIMONIALS.map((t, idx) => (
            <Reveal
              key={t.client}
              delay={idx * 0.1}
              className="flex flex-col justify-between rounded-2xl border border-line bg-paper p-5"
            >
              <div>
                <div className="mb-3 flex items-center gap-1 text-[#f59e0b]">
                  {Array.from({ length: t.rating }).map((_, i) => (
                    <Star key={i} className="size-3.5 fill-current" />
                  ))}
                </div>
                <p className="text-xs leading-relaxed text-ink italic">"{t.quote}"</p>
              </div>

              <div className="mt-4 pt-3 border-t border-line/60 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-ink">@{t.client}</p>
                  <p className="text-xs text-ink-mute">{t.platform}</p>
                </div>
                <span className="rounded-full bg-cream px-2 py-0.5 text-xs font-medium text-ink-soft">
                  {t.tier}
                </span>
              </div>
            </Reveal>
          ))}
        </div>

        <div className="mt-8 text-center">
          <button
            type="button"
            onClick={() => openDrawer({ step: 1 })}
            className="inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-coral"
          >
            <Paintbrush className="size-4 text-coral-soft" />
            Commission Meru Today
          </button>
        </div>
      </div>
    </section>
  );
}
