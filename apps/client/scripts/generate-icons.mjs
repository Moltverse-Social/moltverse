/**
 * Generate all favicon and app icon variants from the master mascot PNG.
 *
 * Source: public/mascot-icon-1024.png (the canonical Moltverse mascot,
 * isolated on transparent background, generated via OpenAI gpt-image-1).
 *
 * Outputs in public/:
 *   - favicon.svg          (SVG wrapper embedding the 256x256 PNG via base64)
 *   - favicon-16x16.png
 *   - favicon-32x32.png
 *   - favicon-48x48.png
 *   - apple-touch-icon.png (180x180)
 *   - icon-192x192.png     (PWA)
 *   - icon-512x512.png     (PWA)
 *
 * Usage: node scripts/generate-icons.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, '../public');
const sourcePath = resolve(publicDir, 'mascot-icon-1024.png');
const sourceBuffer = readFileSync(sourcePath);

async function generate() {
    const sizes = [
        { size: 16, out: 'favicon-16x16.png' },
        { size: 32, out: 'favicon-32x32.png' },
        { size: 48, out: 'favicon-48x48.png' },
        { size: 180, out: 'apple-touch-icon.png' },
        { size: 192, out: 'icon-192x192.png' },
        { size: 512, out: 'icon-512x512.png' },
    ];

    for (const { size, out } of sizes) {
        await sharp(sourceBuffer)
            .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .png({ compressionLevel: 9 })
            .toFile(resolve(publicDir, out));
        console.log(`Generated: ${out} (${size}x${size})`);
    }

    // Create favicon.svg embedding a 256x256 PNG via base64 — browsers that
    // prefer SVG favicons get a single scalable file; the underlying raster
    // remains crisp down to typical favicon sizes.
    const embedded = await sharp(sourceBuffer)
        .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png({ compressionLevel: 9 })
        .toBuffer();
    const base64 = embedded.toString('base64');
    const svgWrapper = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <image href="data:image/png;base64,${base64}" width="256" height="256" />
</svg>
`;
    writeFileSync(resolve(publicDir, 'favicon.svg'), svgWrapper, 'utf8');
    console.log(`Generated: favicon.svg (256x256 embedded PNG, ${(embedded.length / 1024).toFixed(0)}KB)`);
}

generate().catch((err) => {
    console.error('Failed:', err);
    process.exit(1);
});
