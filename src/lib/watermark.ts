/**
 * Renders an artwork image onto an offscreen canvas and burns a diagonal, semi-transparent
 * repeating watermark pattern directly into the bitmap pixels.
 *
 * This ensures watermarked WIP previews served over the network are physically watermarked,
 * preventing extraction via DevTools, Network inspect, or disabling CSS overlays.
 *
 * Fail-closed: If canvas 2D rendering or WebP encoding fails, this function REJECTS the promise,
 * preventing any raw, unwatermarked image from ever leaking to preview storage.
 */
export async function createWatermarkedImage(
  file: File,
  orderCode: string,
): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Canvas 2D context not available for watermarking (fail-closed)'));
        return;
      }

      // Draw original artwork
      ctx.drawImage(img, 0, 0);

      // Watermark styling
      ctx.save();
      const fontSize = Math.max(20, Math.round(canvas.width / 24));
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.40)';
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.32)';
      ctx.lineWidth = Math.max(1, fontSize / 16);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const angle = -24 * (Math.PI / 180);
      const stepX = Math.round(canvas.width / 2.6);
      const stepY = Math.round(canvas.height / 3.2);

      // Repeating grid pattern over rotated canvas
      for (let x = -canvas.width; x < canvas.width * 2; x += stepX) {
        for (let y = -canvas.height; y < canvas.height * 2; y += stepY) {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(angle);

          const line1 = 'MERU ART · WIP PREVIEW';
          const line2 = `Commission #${orderCode} · Do Not Repost`;

          ctx.strokeText(line1, 0, -fontSize * 0.65);
          ctx.fillText(line1, 0, -fontSize * 0.65);
          ctx.strokeText(line2, 0, fontSize * 0.65);
          ctx.fillText(line2, 0, fontSize * 0.65);

          ctx.restore();
        }
      }
      ctx.restore();

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Failed to encode watermarked canvas to WebP blob (fail-closed)'));
            return;
          }
          const watermarkedFile = new File([blob], `wip-${file.name.replace(/\.[^/.]+$/, '')}.webp`, {
            type: 'image/webp',
          });
          resolve(watermarkedFile);
        },
        'image/webp',
        0.88,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Failed to decode artwork image bitmap for watermarking: ${file.name} (fail-closed)`));
    };

    img.src = objectUrl;
  });
}
