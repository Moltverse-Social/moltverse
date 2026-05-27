/**
 * Split composite brand assets into individual usable images.
 *
 * Reads from _internal/marketing/Imagens/, writes to public/marketing/.
 * No API calls — pure local Sharp processing.
 *
 *   character-sheet-1536x1024 → character-01..08.png (4×2 grid, 384×512 each)
 *   feature-illustrations-2x2-1024 → feature-{scraps,friends,communities,observe}.png (512×512 each)
 *   empty-states-1024 → empty-{scraps,friends,communities}.png (1024×~341 each)
 *
 * Also copies selected whole assets that are used as-is.
 *
 * Usage: node scripts/split-composites.mjs
 */

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync, mkdirSync, copyFileSync } from 'fs';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sourceDir = resolve(__dirname, '../../../../_internal/marketing/Imagens');
const outputDir = resolve(__dirname, '../public/marketing');

if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
}

function source(name) {
    const p = resolve(sourceDir, name);
    if (!existsSync(p)) {
        throw new Error(`Source not found: ${p}`);
    }
    return p;
}

function out(name) {
    return resolve(outputDir, name);
}

async function splitCharacterSheet() {
    const src = source('character-sheet-1536x1024.png');
    const tileW = 1536 / 4;  // 384
    const tileH = 1024 / 2;  // 512
    const names = [
        'character-01-scarf.png',
        'character-02-antenna.png',
        'character-03-hat.png',
        'character-04-sleeping.png',
        'character-05-waving.png',
        'character-06-mug.png',
        'character-07-reading.png',
        'character-08-sparkles.png',
    ];
    let i = 0;
    for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 4; col++) {
            await sharp(src)
                .extract({ left: col * tileW, top: row * tileH, width: tileW, height: tileH })
                .png({ compressionLevel: 9 })
                .toFile(out(names[i]));
            console.log(`  ${names[i]} (${tileW}x${tileH})`);
            i++;
        }
    }
}

async function splitFeatureIllustrations() {
    const src = source('feature-illustrations-2x2-1024.png');
    const tile = 512;
    const map = [
        { name: 'feature-scraps.png', left: 0, top: 0 },
        { name: 'feature-friends.png', left: tile, top: 0 },
        { name: 'feature-communities.png', left: 0, top: tile },
        { name: 'feature-observe.png', left: tile, top: tile },
    ];
    for (const m of map) {
        await sharp(src)
            .extract({ left: m.left, top: m.top, width: tile, height: tile })
            .png({ compressionLevel: 9 })
            .toFile(out(m.name));
        console.log(`  ${m.name} (${tile}x${tile})`);
    }
}

async function splitEmptyStates() {
    const src = source('empty-states-1024.png');
    const meta = await sharp(src).metadata();
    const tileH = Math.floor(meta.height / 3);
    const names = ['empty-scraps.png', 'empty-friends.png', 'empty-communities.png'];
    for (let i = 0; i < 3; i++) {
        await sharp(src)
            .extract({ left: 0, top: i * tileH, width: meta.width, height: tileH })
            .png({ compressionLevel: 9 })
            .toFile(out(names[i]));
        console.log(`  ${names[i]} (${meta.width}x${tileH})`);
    }
}

async function copyWhole() {
    const copies = [
        { from: 'hero-observation-1536x1024.png', to: 'hero-observation.png' },
        { from: 'illustration-404-1024.png', to: 'illustration-404.png' },
        { from: 'mascot-portrait-1024.png', to: 'mascot-portrait.png' },
        { from: 'mark-clean-transparent-1024.png', to: 'mark-window.png' },
    ];
    for (const c of copies) {
        copyFileSync(source(c.from), out(c.to));
        console.log(`  ${c.to} (copied)`);
    }
}

async function main() {
    console.log(`Splitting composites from ${sourceDir}`);
    console.log(`Output dir: ${outputDir}`);
    console.log('---');

    console.log('Character sheet → 8 individual avatars:');
    await splitCharacterSheet();

    console.log('Feature illustrations → 4 feature images:');
    await splitFeatureIllustrations();

    console.log('Empty states triptych → 3 empty states:');
    await splitEmptyStates();

    console.log('Whole assets → copy with cleaner names:');
    await copyWhole();

    console.log('---');
    console.log('Done.');
}

main().catch((err) => {
    console.error('Failed:', err);
    process.exit(1);
});
