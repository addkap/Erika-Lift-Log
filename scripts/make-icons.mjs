// Draws the app icon (a pale-aqua kettlebell on a navy-to-sky-blue gradient) as PNG files.
// No image libraries needed: it writes the pixels itself. Run with: node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const DEEP = [27, 54, 93], STEEL = [96, 193, 229], FROZEN = [160, 224, 239];
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

// CRC32 (PNG chunks need it)
const table = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = table[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, sum]);
}

function icon(size) {
  // Kettlebell: a light-aqua bell with a sky-blue centre on a navy-to-sky-blue gradient.
  // Circles with 4x4 sub-samples per pixel for smooth edges. Everything stays inside the middle 70%
  // so round/masked icons never crop it.
  const px = Buffer.alloc(size * size * 3);
  const SUB = 4;
  const colorAt = (x, y) => {
    const d = (cx, cy) => Math.hypot(x - cx, y - cy);
    if (d(0.5, 0.63) < 0.08) return STEEL; // centre spot on the bell
    if (d(0.5, 0.63) < 0.25) return FROZEN; // bell
    const h = d(0.5, 0.40);
    if (h < 0.24 && h > 0.15 && y < 0.46) return FROZEN; // handle (upper half of a ring)
    return mix(DEEP, STEEL, Math.min(1, Math.max(0, (x + y) / 2 - 0.15) * 1.4)); // navy fading to sky blue
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let r = 0, g = 0, b = 0;
    for (let sy = 0; sy < SUB; sy++) for (let sx = 0; sx < SUB; sx++) {
      const c = colorAt((x + (sx + 0.5) / SUB) / size, (y + (sy + 0.5) / SUB) / size);
      r += c[0]; g += c[1]; b += c[2];
    }
    const n = SUB * SUB;
    px.set([Math.round(r / n), Math.round(g / n), Math.round(b / n)], (y * size + x) * 3);
  }

  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) { raw[y * (size * 3 + 1)] = 0; px.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3); }
  const head = Buffer.alloc(13); head.writeUInt32BE(size, 0); head.writeUInt32BE(size, 4); head[8] = 8; head[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

mkdirSync('public/icons', { recursive: true });
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  writeFileSync(`public/icons/${name}`, icon(size));
  console.log('wrote public/icons/' + name);
}
