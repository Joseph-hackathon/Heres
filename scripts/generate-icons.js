#!/usr/bin/env node
/**
 * Generate adaptive icon images for Heres TWA
 * Usage: node scripts/generate-icons.js
 *
 * Requires: npm install sharp
 * If sharp is not available, it will generate placeholder PNG files
 */

const fs = require('fs');
const path = require('path');

const LOGO_PATH = 'public/logo-white.png';
const OUTPUT_DIR = 'public/icons';

// Dark background color (#030712)
const BACKGROUND_COLOR = '#030712';

const SIZES = [
    { size: 48, folder: 'mipmap-mdpi' },
    { size: 72, folder: 'mipmap-hdpi' },
    { size: 96, folder: 'mipmap-xhdpi' },
    { size: 144, folder: 'mipmap-xxhdpi' },
    { size: 192, folder: 'mipmap-xxxhdpi' },
];

// PNG signature for minimal valid PNG
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

// Create minimal valid PNG with solid color
function createSolidColorPng(size, hexColor) {
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);

    // PNG IHDR chunk
    const ihdr = Buffer.alloc(25);
    ihdr.writeUInt32BE(13, 0); // chunk length
    ihdr.write('IHDR', 4);
    ihdr.writeUInt32BE(size, 8);
    ihdr.writeUInt32BE(size, 12);
    ihdr.writeUInt8(8, 16); // bit depth
    ihdr.writeUInt8(2, 17); // color type (RGB)
    ihdr.writeUInt8(0, 18); // compression
    ihdr.writeUInt8(0, 19); // filter
    ihdr.writeUInt8(0, 20); // interlace

    // IHDR CRC
    const ihdrCrc = crc32(ihdr.slice(4));

    // Raw image data (uncompressed RGB)
    const rawData = Buffer.alloc(size * size * 3 + size);
    for (let y = 0; y < size; y++) {
        rawData[y * (size * 3 + 1)] = 0; // filter type: none
        for (let x = 0; x < size; x++) {
            const offset = y * (size * 3 + 1) + x * 3 + 1;
            rawData[offset] = r;
            rawData[offset + 1] = g;
            rawData[offset + 2] = b;
        }
    }

    // Compress image data
    const compressed = zlibDeflate(rawData);

    // IDAT chunk
    const idat = Buffer.alloc(12 + compressed.length);
    idat.writeUInt32BE(compressed.length, 0);
    idat.write('IDAT', 4);
    compressed.copy(idat, 8);
    const idatCrc = crc32(idat.slice(4));

    // IEND chunk
    const iend = Buffer.alloc(12);
    iend.writeUInt32BE(0, 0);
    iend.write('IEND', 4);
    const iendCrc = crc32(iend.slice(4));

    // Combine all chunks
    const png = Buffer.concat([
        PNG_SIGNATURE,
        createChunk(ihdr, ihdrCrc),
        createChunk(idat, idatCrc),
        createChunk(iend, iendCrc),
    ]);

    return png;
}

function createChunk(data, crc) {
    const chunk = Buffer.alloc(12 + data.length - 4);
    chunk.writeUInt32BE(data.length - 4, 0);
    data.copy(chunk, 4);
    chunk.writeUInt32BE(crc, data.length + 4);
    return chunk;
}

function crc32(data) {
    let crc = 0xffffffff;
    const table = makeCrcTable();
    for (let i = 0; i < data.length; i++) {
        crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xff];
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function makeCrcTable() {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        table[i] = c;
    }
    return table;
}

function zlibDeflate(data) {
    try {
        const zlib = require('zlib');
        return zlib.deflateSync(data, { level: 9 });
    } catch (e) {
        // Fallback: return uncompressed with zlib header
        const adler = adler32(data);
        const header = Buffer.alloc(2);
        header.writeUInt8(0x78, 0);
        header.writeUInt8(0x9c, 1);
        const footer = Buffer.alloc(4);
        footer.writeUInt32BE(adler, 0);
        return Buffer.concat([header, data, footer]);
    }
}

function adler32(data) {
    let a = 1, b = 0;
    for (let i = 0; i < data.length; i++) {
        a = (a + data[i]) % 65521;
        b = (b + a) % 65521;
    }
    return (b << 16) | a;
}

// Generate icons for a single size
async function generateIconForSize(size, folder, useSharp) {
    const bgPath = path.join(OUTPUT_DIR, folder, 'ic_launcher_background.png');
    const fgPath = path.join(OUTPUT_DIR, folder, 'ic_launcher_foreground.png');

    if (useSharp) {
        const sharp = require('sharp');

        // Generate background
        const bgSvg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="${BACKGROUND_COLOR}"/></svg>`;
        await sharp(Buffer.from(bgSvg)).png().toFile(bgPath);
        console.log(`✓ Background: ${bgPath}`);

        // Generate foreground (logo scaled to 66%)
        const logoBuffer = fs.readFileSync(LOGO_PATH);
        const newSize = Math.round(size * 0.66);

        await sharp(Buffer.from(bgSvg))
            .composite([{
                input: await sharp(logoBuffer).resize(newSize, newSize, { fit: 'contain' }).png().toBuffer(),
                gravity: 'center',
            }])
            .png()
            .toFile(fgPath);
        console.log(`✓ Foreground: ${fgPath}`);
    } else {
        // Fallback: create solid color background
        const bgPng = createSolidColorPng(size, BACKGROUND_COLOR);
        fs.writeFileSync(bgPath, bgPng);
        console.log(`✓ Background (fallback): ${bgPath}`);

        // Copy logo as foreground
        if (fs.existsSync(LOGO_PATH)) {
            fs.copyFileSync(LOGO_PATH, fgPath);
            console.log(`✓ Foreground (copied logo): ${fgPath}`);
        }
    }
}

// Main async function
async function generateIcons() {
    console.log('🎨 Generating adaptive icons for Heres TWA...\n');

    // Create directories
    for (const { folder } of SIZES) {
        const dir = path.join(OUTPUT_DIR, folder);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            console.log(`Created directory: ${dir}`);
        }
    }

    // Check if sharp is available
    let useSharp = false;
    try {
        require.resolve('sharp');
        useSharp = true;
        console.log('Using sharp for high-quality icon generation\n');
    } catch (e) {
        console.log('Sharp not found. Using fallback PNG generation.\n');
        console.log('For better quality icons, run: npm install sharp\n');
    }

    // Generate icons for all sizes
    for (const { size, folder } of SIZES) {
        await generateIconForSize(size, folder, useSharp);
    }

    console.log('\n✅ Icon generation complete!\n');
    console.log('Next steps:');
    console.log('1. Deploy your site with the updated manifest.json');
    console.log('2. Update public/.well-known/assetlinks.json with your signing certificate fingerprint');
    console.log('3. Run: npm run build && npx bubblewrap build\n');
}

// Run if called directly
if (require.main === module) {
    generateIcons().catch(console.error);
}

module.exports = { generateIcons };
