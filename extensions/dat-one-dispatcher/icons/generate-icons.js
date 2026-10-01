const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function createPng(width, height) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  
  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const t = Buffer.from(type, 'ascii');
    const body = Buffer.concat([t, data]);
    const crc = Buffer.alloc(4);
    let c = 0xffffffff;
    for (let b of body) {
      c ^= b;
      for (let i = 0; i < 8; i++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0);
    }
    crc.writeUInt32BE((c ^ 0xffffffff) >>> 0);
    return Buffer.concat([len, body, crc]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth 8
  ihdr[9] = 6;  // RGBA color type

  const row = Buffer.alloc(1 + width * 4);
  row[0] = 0; // Filter none
  for (let x = 0; x < width; x++) {
    // Branded royal blue (#2563eb)
    row[1 + x * 4] = 37;      // R
    row[1 + x * 4 + 1] = 99;  // G
    row[1 + x * 4 + 2] = 235; // B
    row[1 + x * 4 + 3] = 255; // Alpha
  }

  const raw = Buffer.concat(Array(height).fill(row));
  const idat = chunk('IDAT', zlib.deflateSync(raw));
  const iend = chunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, chunk('IHDR', ihdr), idat, iend]);
}

const iconsDir = path.join(__dirname);
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });

[16, 48, 128].forEach(size => {
  const file = path.join(iconsDir, `icon-${size}.png`);
  fs.writeFileSync(file, createPng(size, size));
  console.log(`Generated icon: ${file} (${size}x${size})`);
});
