/**
 * Generate og-image.png (1200×630) from the OG hero source asset.
 *
 * Source: _internal/marketing/Imagens/og-mascot-hero-1536x1024.png
 * Output: public/og-image.png
 *
 * Crops the 1536×1024 source proportionally to 1200×630 ratio, then resizes.
 *
 * Usage: node scripts/generate-og-image.mjs
 */

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync } from 'fs';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sourcePath = resolve(__dirname, '../../../../_internal/marketing/Imagens/og-mascot-hero-1536x1024.png');
const outputPath = resolve(__dirname, '../public/og-image.png');

if (!existsSync(sourcePath)) {
    console.error(`Source not found: ${sourcePath}`);
    process.exit(1);
}

async function generate() {
    const sourceBuffer = readFileSync(sourcePath);
    const meta = await sharp(sourceBuffer).metadata();
    console.log(`Source: ${meta.width}x${meta.height}`);

    const targetWidth = 1200;
    const targetHeight = 630;
    const sourceWidth = meta.width;
    const sourceHeight = meta.height;

    // Keep full source width, crop height to match target aspect ratio.
    const scale = sourceWidth / targetWidth;
    const cropHeight = Math.round(targetHeight * scale);
    const cropTop = Math.round((sourceHeight - cropHeight) / 2);

    await sharp(sourceBuffer)
        .extract({ left: 0, top: cropTop, width: sourceWidth, height: cropHeight })
        .resize(targetWidth, targetHeight)
        .png({ compressionLevel: 9 })
        .toFile(outputPath);

    console.log(`Generated: og-image.png (${targetWidth}x${targetHeight})`);
}

generate().catch((err) => {
    console.error('Failed:', err);
    process.exit(1);
});
