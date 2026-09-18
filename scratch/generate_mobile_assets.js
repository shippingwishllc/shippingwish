// scratch/generate_mobile_assets.js
// Generates official PNG icons and adaptive icons for the 4 mobile apps

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let crc = 0 ^ (-1);
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF];
  }
  return (crc ^ (-1)) >>> 0;
}

const table = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  table[i] = c;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcBuf), 0);
  return Buffer.concat([len, t, data, crc]);
}

function createBrandedPng(width, height, bgR, bgG, bgB, fgR, fgG, fgB, symbolType = 'circle') {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const rowSize = 1 + width * 4;
  const raw = Buffer.alloc(height * rowSize);
  const cx = width / 2;
  const cy = height / 2;
  const radius = width * 0.35;
  const innerRadius = width * 0.28;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    raw[rowOffset] = 0; // Filter type: None
    const dy = y - cy;

    for (let x = 0; x < width; x++) {
      const px = rowOffset + 1 + x * 4;
      const dx = x - cx;
      const dist = Math.sqrt(dx * dx + dy * dy);

      let r = bgR;
      let g = bgG;
      let b = bgB;

      if (symbolType === 'truck' || symbolType === 'circle') {
        // Outer glow ring
        if (dist <= radius && dist >= innerRadius) {
          r = fgR; g = fgG; b = fgB;
        } else if (dist < innerRadius) {
          // Inner icon fill
          const inCenter = Math.abs(dx) < (width * 0.18) && Math.abs(dy) < (height * 0.12);
          if (inCenter) {
            r = fgR; g = fgG; b = fgB;
          } else {
            r = Math.min(255, bgR + 15);
            g = Math.min(255, bgG + 20);
            b = Math.min(255, bgB + 30);
          }
        }
      } else if (symbolType === 'lightning' || symbolType === 'carrier') {
        // Modern diamond badge
        const manhattan = Math.abs(dx) + Math.abs(dy);
        if (manhattan <= radius && manhattan >= innerRadius) {
          r = fgR; g = fgG; b = fgB;
        } else if (manhattan < innerRadius) {
          // Central bolt pattern
          const bolt = (dx * 1.5 + dy) > -20 && (dx * 1.5 + dy) < 20 && Math.abs(dy) < (height * 0.22);
          if (bolt) {
            r = fgR; g = fgG; b = fgB;
          } else {
            r = Math.min(255, bgR + 10);
            g = Math.min(255, bgG + 25);
            b = Math.min(255, bgB + 40);
          }
        }
      } else if (symbolType === 'broker' || symbolType === 'shield') {
        // Shield badge
        const inShield = (Math.abs(dx) < width * 0.28) && (dy > -height * 0.28) && (dy < height * 0.15 || (Math.abs(dx) < (height * 0.35 - dy) * 0.8));
        const borderShield = inShield && (Math.abs(dx) > width * 0.24 || dy < -height * 0.24);
        if (borderShield) {
          r = fgR; g = fgG; b = fgB;
        } else if (inShield) {
          r = Math.min(255, bgR + 25);
          g = Math.min(255, bgG + 20);
          b = Math.min(255, bgB + 10);
        }
      } else {
        // TMS Dashboard grid
        const inBox = Math.abs(dx) < radius && Math.abs(dy) < radius;
        const isBorder = inBox && (Math.abs(dx) > radius - 15 || Math.abs(dy) > radius - 15);
        if (isBorder) {
          r = fgR; g = fgG; b = fgB;
        } else if (inBox) {
          const isCross = Math.abs(dx) < 8 || Math.abs(dy) < 8;
          if (isCross) {
            r = fgR; g = fgG; b = fgB;
          }
        }
      }

      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
      raw[px + 3] = 255;
    }
  }

  const idatData = zlib.deflateSync(raw);
  const header = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  return Buffer.concat([
    header,
    chunk('IHDR', ihdr),
    chunk('IDAT', idatData),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const apps = [
  {
    name: 'driver-app',
    bg: [11, 25, 44],       // #0B192C
    fg: [16, 185, 129],     // Emerald Green (#10B981)
    type: 'truck'
  },
  {
    name: 'loadnexus-carrier',
    bg: [7, 15, 30],        // #070F1E
    fg: [59, 130, 246],     // Electric Blue (#3B82F6)
    type: 'carrier'
  },
  {
    name: 'shippingwish-tms',
    bg: [14, 26, 45],       // #0E1A2D
    fg: [192, 132, 252],    // Electric Purple (#C084FC)
    type: 'tms'
  },
  {
    name: 'loadnexus-broker',
    bg: [15, 23, 42],       // #0F172A
    fg: [245, 158, 11],     // Gold / Amber (#F59E0B)
    type: 'broker'
  }
];

console.log('Generating high-resolution official assets for all 4 mobile apps...');

apps.forEach(app => {
  const assetsDir = path.join(__dirname, '..', 'mobile', app.name, 'assets');
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }

  // 1. App Icon (512x512)
  const iconBuffer = createBrandedPng(512, 512, ...app.bg, ...app.fg, app.type);
  fs.writeFileSync(path.join(assetsDir, 'icon.png'), iconBuffer);

  // 2. Adaptive Icon (Android foreground, 512x512)
  const adaptiveBuffer = createBrandedPng(512, 512, ...app.bg, ...app.fg, app.type);
  fs.writeFileSync(path.join(assetsDir, 'adaptive-icon.png'), adaptiveBuffer);

  // 3. Favicon (192x192)
  const faviconBuffer = createBrandedPng(192, 192, ...app.bg, ...app.fg, app.type);
  fs.writeFileSync(path.join(assetsDir, 'favicon.png'), faviconBuffer);

  console.log(`✅ [${app.name}] Created icon.png, adaptive-icon.png, favicon.png`);
});

console.log('🎉 All mobile app assets successfully generated!');
