/**
 * Generates the app's icon set procedurally (no design tools): a four-point
 * "star" formed from thousands of tiny glowing dust particles — bright white at
 * the core, fading through indigo to teal at the ray tips — on the app's deep
 * navy. Reproducible: `node scripts/generate-icon.js`.
 *
 *   assets/images/icon.png                     – 1024² master icon (navy bg, RGB)
 *   assets/images/splash-icon.png              – 512² stardust on transparent
 *   assets/images/android-icon-foreground.png  – 512² stardust, in the safe zone
 *   assets/images/android-icon-background.png  – 512² flat navy
 *   assets/images/android-icon-monochrome.png  – 432² white stardust (themed)
 *   assets/images/favicon.png                  – 48² mini icon
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'assets', 'images');

// --- deterministic RNG so the dust is identical every run ------------------
function makeRng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 0xffffffff;
  };
}

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
  ihdr[9] = opaque ? 2 : 6; // RGB (no alpha) for the App Store icon, else RGBA
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

// --- colour helpers --------------------------------------------------------
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
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

const NAVY = hex('#0E1020');
// Core → tips: luminous white heart, quickly into indigo, out to teal tips.
const STAR_STOPS = [
  [0.0, hex('#FFFFFF')],
  [0.22, hex('#AEB8F5')],
  [0.55, hex('#7E8FF0')],
  [1.0, hex('#5FE0CF')],
];

/**
 * Render the stardust star into an RGBA buffer.
 *  opts.bg     – 'navy' | 'transparent'
 *  opts.scale  – 1 = fill; <1 shrinks the star (Android safe zone)
 *  opts.mono   – white-only dust (Android themed/monochrome icon)
 */
function render(size, opts = {}) {
  const { bg = 'navy', scale = 1, mono = false } = opts;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = 0.46 * size * scale;
  const coreFrac = 0.04; // central bright heart as a fraction of the star radius
  const sharp = 6.0; // ray sharpness (higher = thinner, pointier spikes)
  const rng = makeRng(20260625);

  // Additive light buffers.
  const Lr = new Float32Array(size * size);
  const Lg = new Float32Array(size * size);
  const Lb = new Float32Array(size * size);
  const splat = (x, y, r, g, b) => {
    const xi = Math.round(x);
    const yi = Math.round(y);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const px = xi + dx;
        const py = yi + dy;
        if (px < 0 || py < 0 || px >= size || py >= size) continue;
        const w = dx === 0 && dy === 0 ? 1 : Math.abs(dx) + Math.abs(dy) === 1 ? 0.4 : 0.18;
        const idx = py * size + px;
        Lr[idx] += r * w;
        Lg[idx] += g * w;
        Lb[idx] += b * w;
      }
    }
  };

  // The four-point star edge as a function of angle (spikes on the axes).
  const starEdge = (theta) =>
    (coreFrac + (1 - coreFrac) * Math.pow(Math.abs(Math.cos(2 * theta)), sharp)) * maxR;

  const N = Math.floor(size * size * 0.016);
  for (let i = 0; i < N; i++) {
    const theta = rng() * Math.PI * 2;
    const rho = Math.pow(rng(), 2.2) * maxR; // strongly biased to centre so rays taper to points
    const edge = starEdge(theta);
    const x = cx + Math.cos(theta) * rho;
    const y = cy + Math.sin(theta) * rho;

    if (rho > edge) {
      // Sparse faint sky-dust just outside the star, for atmosphere.
      if (rng() < 0.05 && rho < maxR * 1.04) {
        const d = 0.05 + rng() * 0.06;
        if (mono) splat(x, y, d, d, d);
        else splat(x, y, d * 0.7, d * 0.8, d);
      }
      continue;
    }

    const bright = (0.22 + 0.78 * Math.pow(1 - rho / edge, 0.6)) * (0.55 + rng() * 0.8);
    if (mono) {
      splat(x, y, bright, bright, bright);
    } else {
      const c = gradient(STAR_STOPS, rho / maxR);
      splat(x, y, (bright * c[0]) / 255, (bright * c[1]) / 255, (bright * c[2]) / 255);
    }
  }

  // A luminous core glow so the heart of the star reads as solid light.
  const glowR = maxR * 0.11;
  const r0 = Math.ceil(glowR * 3);
  for (let dy = -r0; dy <= r0; dy++) {
    for (let dx = -r0; dx <= r0; dx++) {
      const px = Math.round(cx) + dx;
      const py = Math.round(cy) + dy;
      if (px < 0 || py < 0 || px >= size || py >= size) continue;
      const g = Math.exp(-0.5 * ((dx * dx + dy * dy) / (glowR * glowR))) * 0.75;
      if (g < 0.002) continue;
      const idx = py * size + px;
      if (mono) {
        Lr[idx] += g;
        Lg[idx] += g;
        Lb[idx] += g;
      } else {
        const c = STAR_STOPS[0][1];
        Lr[idx] += (g * c[0]) / 255;
        Lg[idx] += (g * c[1]) / 255;
        Lb[idx] += (g * c[2]) / 255;
      }
    }
  }

  // Compose: navy base (or transparent) + additive light with a filmic roll-off.
  const roll = (v) => 1 - Math.exp(-1.15 * v);
  const buf = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const lr = roll(Lr[i]);
    const lg = roll(Lg[i]);
    const lb = roll(Lb[i]);
    let r;
    let g;
    let b;
    let a;
    if (bg === 'navy') {
      r = clamp01(NAVY[0] / 255 + lr);
      g = clamp01(NAVY[1] / 255 + lg);
      b = clamp01(NAVY[2] / 255 + lb);
      a = 1;
    } else {
      a = clamp01(Math.max(lr, lg, lb));
      // Premultiplied-ish: keep colour where there's light.
      r = clamp01(lr);
      g = clamp01(lg);
      b = clamp01(lb);
    }
    const o = i * 4;
    buf[o] = Math.round(r * 255);
    buf[o + 1] = Math.round(g * 255);
    buf[o + 2] = Math.round(b * 255);
    buf[o + 3] = Math.round(a * 255);
  }
  return buf;
}

function flat(size, color) {
  const buf = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    buf[i * 4] = color[0];
    buf[i * 4 + 1] = color[1];
    buf[i * 4 + 2] = color[2];
    buf[i * 4 + 3] = 255;
  }
  return buf;
}

console.log('Generating stardust app icons...');
writePNG(path.join(OUT, 'icon.png'), 1024, 1024, render(1024, { bg: 'navy' }), true);
// Lock-screen / Control Center now-playing artwork (same stardust mark on navy).
writePNG(path.join(OUT, 'now-playing.png'), 1024, 1024, render(1024, { bg: 'navy' }), true);
writePNG(path.join(OUT, 'splash-icon.png'), 512, 512, render(512, { bg: 'transparent' }));
writePNG(path.join(OUT, 'android-icon-foreground.png'), 512, 512, render(512, { bg: 'transparent', scale: 0.7 }));
writePNG(path.join(OUT, 'android-icon-background.png'), 512, 512, flat(512, NAVY));
writePNG(path.join(OUT, 'android-icon-monochrome.png'), 432, 432, render(432, { bg: 'transparent', scale: 0.7, mono: true }));
writePNG(path.join(OUT, 'favicon.png'), 48, 48, render(48, { bg: 'navy' }));
console.log('Done.');
