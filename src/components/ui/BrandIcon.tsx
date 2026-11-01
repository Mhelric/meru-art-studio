import { siArtstation, siDiscord, siFacebook, siGoogle, siInstagram, siTiktok, siX, siYoutube, type SimpleIcon } from 'simple-icons';

const ICONS: Record<string, SimpleIcon> = {
  artstation: siArtstation,
  tiktok: siTiktok,
  x: siX,
  youtube: siYoutube,
  instagram: siInstagram,
  facebook: siFacebook,
  discord: siDiscord,
  google: siGoogle,
};

/** Brand logos (lucide-react no longer ships brand icons). */
export function BrandIcon({ id, className = 'size-5' }: { id: string; className?: string }) {
  const icon = ICONS[id];
  if (!icon) return null;
  return (
    <svg role="img" viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d={icon.path} />
    </svg>
  );
}
