/**
 * Generates the app's icon set procedurally (no design tools): a bold geometric
 * emblem — a filled 12-point starburst with a luminous teal->periwinkle gradient
 * and sheen, ringed by a thin hexagon, with a bright core — on a vibrant
 * full-bleed indigo->navy gradient. Modern-iOS style (edge-to-edge colour, one
 * bold centred subject, no inner frame; iOS applies the rounded mask). It mirrors
 * the in-app breathing orb's starburst. 2x2 supersampled. `node scripts/generate-icon.js`.
 *
 *   assets/images/icon.png                     – 1024² master icon (RGB, opaque)
 *   assets/images/now-playing.png              – 1024² lock-screen artwork
 *   assets/images/splash-icon.png              – 512² emblem on transparent
 *   assets/images/android-icon-foreground.png  – 512² emblem, in the safe zone
 *   assets/images/android-icon-background.png   – 512² gradient
 *   assets/images/android-icon-monochrome.png  – 432² white emblem (themed)
 *   assets/images/favicon.png                  – 48² mini icon
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'assets', 'images');

// --- tiny PNG encoder (RGBA, or RGB when opaque) ---------------------------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}
function writePNG(file, width, height, rgba, opaque = false) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = opaque ? 2 : 6;
  const channels = opaque ? 3 : 4;
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 4;
      const dst = y * (stride + 1) + 1 + x * channels;
      raw[dst] = rgba[src];
      raw[dst + 1] = rgba[src + 1];
      raw[dst + 2] = rgba[src + 2];
      if (!opaque) raw[dst + 3] = rgba[src + 3];
    }
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  const png = Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, png);
  console.log(`  wrote ${path.relative(process.cwd(), file)} (${(png.length / 1024).toFixed(0)} KB)`);
}

// --- colour + geometry helpers --------------------------------------------
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
function gradient(stops, t) {
  if (t <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const span = stops[i][0] - stops[i - 1][0];
      const local = span > 0 ? (t - stops[i - 1][0]) / span : 0;
      return mix(stops[i - 1][1], stops[i][1], local);
    }
  }
  return stops[stops.length - 1][1];
}
function distSeg(px, py, x1, y1, x2, y2) {
  const vx = x2 - x1, vy = y2 - y1, wx = px - x1, wy = py - y1;
  const c1 = vx * wx + vy * wy;
  if (c1 <= 0) return Math.hypot(px - x1, py - y1);
  const c2 = vx * vx + vy * vy;
  if (c2 <= c1) return Math.hypot(px - x2, py - y2);
  const b = c1 / c2;
  return Math.hypot(px - (x1 + b * vx), py - (y1 + b * vy));
}
// Even-odd point-in-polygon.
function inPoly(px, py, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function polyEdges(cx, cy, R, sides, rotDeg) {
  const base = (rotDeg * Math.PI) / 180 - Math.PI / 2;
  const pts = [];
  for (let k = 0; k < sides; k++) pts.push([cx + R * Math.cos(base + (2 * Math.PI * k) / sides), cy + R * Math.sin(base + (2 * Math.PI * k) / sides)]);
  const e = [];
  for (let k = 0; k < sides; k++) e.push([...pts[k], ...pts[(k + 1) % sides]]);
  return e;
}

const BG_STOPS = [
  [0.0, hex('#454AA0')],
  [0.45, hex('#23264B')],
  [1.0, hex('#0C0E1C')],
];
// Luminous fill swept diagonally: pale periwinkle (top-left) -> sky -> teal.
const INK_STOPS = [
  [0.0, hex('#D8DEFF')],
  [0.5, hex('#85CBEE')],
  [1.0, hex('#54E0CC')],
];
const RING = hex('#A6B2F8'); // hexagon ring + glow accent

/**
 * Render the geometric emblem.
 *  opts.bg     – 'gradient' | 'transparent'
 *  opts.scale  – 1 = fill; <1 shrinks (Android safe zone)
 *  opts.mono   – flat white silhouette (Android themed icon)
 *  opts.geom   – include the hexagon ring (off for tiny sizes)
 */
function render(size, opts = {}) {
  const { bg = 'gradient', scale = 1, mono = false, geom = true } = opts;
  const transparent = bg === 'transparent';
  const cx = size / 2;
  const cy = size / 2;
  const SS = 2;
  const Ro = 0.40 * size * scale; // star outer radius
  const Ri = 0.17 * size * scale; // star inner radius (sharp 12-point)
  const POINTS = 12;
  const coreR = 0.085 * size * scale;
  const hexR = 0.495 * size * scale;
  const stroke = Math.max(1.5, size * 0.012 * scale);

  // 12-point star vertices (24 points alternating outer/inner), starting at top.
  const star = [];
  const starEdges = [];
  for (let i = 0; i < POINTS * 2; i++) {
    const ang = (Math.PI * i) / POINTS - Math.PI / 2;
    const rad = i % 2 === 0 ? Ro : Ri;
    star.push([cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad]);
  }
  for (let i = 0; i < star.length; i++) starEdges.push([...star[i], ...star[(i + 1) % star.length]]);
  const hexEdges = geom ? polyEdges(cx, cy, hexR, 6, 0) : [];

  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let Rr = 0;
      let Gg = 0;
      let Bb = 0;
      let Aa = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;
          const fx = px / size;
          const fy = py / size;

          let r;
          let g;
          let b;
          let a;
          if (transparent) {
            r = g = b = 0;
            a = 0;
          } else {
            const bgc = gradient(BG_STOPS, clamp01((fx + fy) / 2));
            r = bgc[0] / 255;
            g = bgc[1] / 255;
            b = bgc[2] / 255;
            a = 1;
          }
          const over = (col, amt) => {
            if (amt <= 0) return;
            r = lerp(r, col[0] / 255, amt);
            g = lerp(g, col[1] / 255, amt);
            b = lerp(b, col[2] / 255, amt);
            if (transparent) a = Math.max(a, amt);
          };

          // Hexagon ring (under the star): crisp line + soft glow.
          if (geom && !mono) {
            let dmin = Infinity;
            for (const e of hexEdges) { const d = distSeg(px, py, e[0], e[1], e[2], e[3]); if (d < dmin) dmin = d; }
            over(RING, (1 - smooth(0, stroke, dmin)) * 0.8);
            over(RING, (1 - smooth(0, stroke * 6, dmin)) * 0.12);
          }

          // Distance to the star boundary (for AA + outer glow).
          let sd = Infinity;
          for (const e of starEdges) { const d = distSeg(px, py, e[0], e[1], e[2], e[3]); if (d < sd) sd = d; }
          const inside = inPoly(px, py, star);
          const aa = 1.2;

          if (mono) {
            const cov = inside ? 1 : 1 - smooth(0, aa, sd);
            if (cov > 0) { r = g = b = 1; a = Math.max(a, cov); }
          } else {
            // Outer glow around the star.
            if (!inside) over(mix(INK_STOPS[2][1], RING, 0.4), Math.pow(1 - smooth(0, Ro * 0.5, sd), 2) * 0.28);
            // Filled star: diagonal ink + upper-left sheen.
            const cov = inside ? 1 : 1 - smooth(0, aa, sd);
            if (cov > 0) {
              const ink = gradient(INK_STOPS, clamp01((fx + fy) / 2));
              const hd = Math.hypot(fx - 0.36, fy - 0.32);
              const sheen = Math.pow(clamp01(1 - hd / 0.5), 3) * 0.7;
              const col = [lerp(ink[0], 255, sheen), lerp(ink[1], 255, sheen), lerp(ink[2], 255, sheen)];
              over(col, cov);
            }
            // Bright core.
            const cd = Math.hypot(px - cx, py - cy);
            over([255, 255, 255], (1 - smooth(coreR * 0.6, coreR, cd)) * 0.95);
            over(INK_STOPS[1][1], (1 - smooth(coreR, coreR * 1.8, cd)) * 0.3);
          }

          Rr += clamp01(r);
          Gg += clamp01(g);
          Bb += clamp01(b);
          Aa += clamp01(a);
        }
      }
      const n = SS * SS;
      const o = (y * size + x) * 4;
      buf[o] = Math.round((Rr / n) * 255);
      buf[o + 1] = Math.round((Gg / n) * 255);
      buf[o + 2] = Math.round((Bb / n) * 255);
      buf[o + 3] = Math.round((Aa / n) * 255);
    }
  }
  return buf;
}

function flatGradient(size) {
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const c = gradient(BG_STOPS, clamp01((x / size + y / size) / 2));
      const o = (y * size + x) * 4;
      buf[o] = Math.round(c[0]);
      buf[o + 1] = Math.round(c[1]);
      buf[o + 2] = Math.round(c[2]);
      buf[o + 3] = 255;
    }
  }
  return buf;
}

console.log('Generating geometric app icons...');
writePNG(path.join(OUT, 'icon.png'), 1024, 1024, render(1024, { bg: 'gradient' }), true);
writePNG(path.join(OUT, 'now-playing.png'), 1024, 1024, render(1024, { bg: 'gradient' }), true);
writePNG(path.join(OUT, 'splash-icon.png'), 512, 512, render(512, { bg: 'transparent' }));
writePNG(path.join(OUT, 'android-icon-foreground.png'), 512, 512, render(512, { bg: 'transparent', scale: 0.62, geom: false }));
writePNG(path.join(OUT, 'android-icon-background.png'), 512, 512, flatGradient(512));
writePNG(path.join(OUT, 'android-icon-monochrome.png'), 432, 432, render(432, { bg: 'transparent', scale: 0.62, mono: true, geom: false }));
writePNG(path.join(OUT, 'favicon.png'), 48, 48, render(48, { bg: 'gradient', geom: false }), true);
console.log('Done.');
