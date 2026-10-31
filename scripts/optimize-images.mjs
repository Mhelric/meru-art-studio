/**
 * Image pipeline: optimises the raw artwork in /assets-src into web-ready WebP
 * files under /public/art + /public/brand, and writes a manifest with
 * dimensions + tiny blur placeholders to src/data/art-manifest.json.
 *
 * Usage: npm run images
 */
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';

const SRC = 'assets-src';
const OUT_ART = 'public/art';
const OUT_BRAND = 'public/brand';
const MANIFEST = 'src/data/art-manifest.json';

/** source filename → clean slug */
const ART = {
  '8c186973_original.jpg': 'thumb-gacha-gems',
  'aa57c060_original.jpg': 'thumb-first-pc',
  'afc6bb99_original.jpg': 'logo-meru-inc',
  'b0712546_original.jpg': 'thumb-fix-your-life',
  'f0cb7c8f_original.jpg': 'chibi-universe',
  'f488d7d8_original.jpg': 'thumb-teen-regrets',
  'meru-art-bam-commission-2.webp': 'idoltav-poster',
  'meru-art-commission-art-1-2.webp': 'masked-gentleman',
  'meru-art-commission-art.webp': 'uniform-commission',
  'meru-art-deku-fanart-inktober-25.webp': 'deku-inktober',
  'meru-art-frieren-bg-fanart.webp': 'frieren-party',
  'meru-art-kitsunegem-full-body.webp': 'kitsunegem',
  'meru-art-loona-helluva-commission.webp': 'loona-helluva',
  'meru-art-meru.webp': 'meru-ref-sheet',
  'meru-art-momo-ayase.webp': 'momo-ayase',
  'meru-art-robin-egghex-1.webp': 'robin-egghead',
  'meru-art-velimer-dnd.webp': 'velimer-dnd',
};

await fs.mkdir(OUT_ART, { recursive: true });
await fs.mkdir(OUT_BRAND, { recursive: true });

const manifest = {};
for (const [file, slug] of Object.entries(ART)) {
  const input = path.join(SRC, file);
  const img = sharp(input).rotate();

  const full = await img.clone().resize(1800, 1800, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 84 }).toFile(path.join(OUT_ART, `${slug}.webp`));
  await img.clone().resize(720, null, { withoutEnlargement: true }).webp({ quality: 78 }).toFile(path.join(OUT_ART, `${slug}-sm.webp`));
  const blur = await img.clone().resize(16, null).webp({ quality: 40 }).toBuffer();

  manifest[slug] = { w: full.width, h: full.height, blur: `data:image/webp;base64,${blur.toString('base64')}` };
  console.log(`✓ ${slug} ${full.width}x${full.height}`);
}
await fs.writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');

// Brand: trimmed wordmark + cat-mark favicon.
const LOGO = path.join(SRC, 'meru-art-logo.jpg');
const trimmed = await sharp(LOGO).trim({ threshold: 18 }).toBuffer();
await sharp(trimmed).resize(900, null).webp({ quality: 88 }).toFile(path.join(OUT_BRAND, 'logo.webp'));
await sharp(trimmed).resize(320, null).webp({ quality: 88 }).toFile(path.join(OUT_BRAND, 'logo-sm.webp'));

// The cat illustration sits above the wordmark: crop the top band, trim whitespace, pad to square.
const meta = await sharp(LOGO).metadata();
const catBand = await sharp(LOGO)
  .extract({ left: Math.round(meta.width * 0.33), top: 0, width: Math.round(meta.width * 0.34), height: Math.round(meta.height * 0.47) })
  .toBuffer();
const markBuf = await sharp(catBand)
  .trim({ threshold: 30 })
  .resize(600, 600, { fit: 'contain', background: '#ffffff' })
  .extend({ top: 40, bottom: 40, left: 40, right: 40, background: '#ffffff' })
  .toBuffer();
const mark = sharp(markBuf);
await mark.clone().resize(192, 192).png().toFile(path.join(OUT_BRAND, 'mark-192.png'));
await mark.clone().resize(64, 64).png().toFile(path.join(OUT_BRAND, 'favicon-64.png'));
await mark.clone().resize(180, 180).png().toFile(path.join(OUT_BRAND, 'apple-touch-icon.png'));
console.log('✓ brand assets');
