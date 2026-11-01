import { useState } from 'react';
import manifest from '@/data/art-manifest.json';
import { cn } from '@/lib/utils';

type ManifestEntry = { w: number; h: number; blur: string };
const MANIFEST = manifest as Record<string, ManifestEntry>;

interface Props {
  slug: string;
  alt: string;
  /** `sm` = 720px-wide thumbnail, `full` = up to 1800px. */
  size?: 'sm' | 'full';
  className?: string;
  imgClassName?: string;
  /** Reserve space using the image's real aspect ratio (prevents layout shift). */
  keepAspect?: boolean;
  eager?: boolean;
}

export const artSrc = (slug: string, size: 'sm' | 'full' = 'sm') => `/art/${slug}${size === 'sm' ? '-sm' : ''}.webp`;
export const artMeta = (slug: string) => MANIFEST[slug];

/** Optimised artwork with a blurred placeholder that cross-fades into the real image. */
export function ArtImage({ slug, alt, size = 'sm', className, imgClassName, keepAspect = true, eager = false }: Props) {
  const meta = MANIFEST[slug];
  const [loaded, setLoaded] = useState(false);

  return (
    <div
      className={cn('relative overflow-hidden bg-cream', className)}
      style={keepAspect && meta ? { aspectRatio: `${meta.w} / ${meta.h}` } : undefined}
    >
      {meta && (
        <img
          src={meta.blur}
          alt=""
          aria-hidden
          className={cn(
            'absolute inset-0 size-full scale-110 object-cover blur-xl transition-opacity duration-700',
            loaded && 'opacity-0',
          )}
        />
      )}
      <img
        src={artSrc(slug, size)}
        alt={alt}
        width={meta?.w}
        height={meta?.h}
        loading={eager ? 'eager' : 'lazy'}
        fetchPriority={eager ? 'high' : 'auto'}
        decoding="async"
        draggable={false}
        onLoad={() => setLoaded(true)}
        onContextMenu={(e) => e.preventDefault()}
        className={cn(
          'relative size-full object-cover transition-[opacity,transform] duration-700 ease-out-expo',
          loaded ? 'opacity-100' : 'opacity-0',
          imgClassName,
        )}
      />
    </div>
  );
}
