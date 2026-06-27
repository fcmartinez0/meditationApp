/**
 * Generates the app's icon set procedurally (no design tools): a luminous Julia
 * fractal on a vibrant, full-bleed indigo->navy gradient — modern-iOS style
 * (edge-to-edge colour, one bold centred subject, no inner frame; iOS applies the
 * rounded-rect mask itself). 2x2 supersampled for crisp fractal edges.
 * Reproducible: `node scripts/generate-icon.js`.
 *
 *   assets/images/icon.png                     – 1024² master icon (RGB, opaque)
 *   assets/images/now-playing.png              – 1024² lock-screen artwork
 *   assets/images/splash-icon.png              – 512² fractal on transparent
 *   assets/images/android-icon-foreground.png  – 512² fractal, in the safe zone
 *   assets/images/android-icon-background.png   – 512² gradient
 *   assets/images/android-icon-monochrome.png  – 432² white fractal (themed)
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

// Vibrant diagonal background (indigo top-left -> deep navy bottom-right).
const BG_STOPS = [
  [0.0, hex('#454AA0')],
  [0.45, hex('#23264B')],
  [1.0, hex('#0C0E1C')],
];
// Luminous "ink" filling the fractal interior, swept diagonally: pale periwinkle
// (top-left) through sky to teal (bottom-right), with a white sheen added near
// the light source for a glassy, modern feel.
const INK_STOPS = [
  [0.0, hex('#D8DEFF')],
  [0.5, hex('#85CBEE')],
  [1.0, hex('#54E0CC')],
];
const GLOW_NEAR = hex('#CBD4FF'); // periwinkle, near the boundary
const GLOW_FAR = hex('#5FD9CC'); // teal, in the fade

// Julia constant — the Douady rabbit: a connected, centred, three-lobed set that
// reads as a bold, recognisable fractal even at small sizes.
const C_RE = -0.123;
const C_IM = 0.745;
const MAX_ITER = 240;
const BAILOUT = 16;

/**
 * Render the fractal icon.
 *  opts.bg          – 'gradient' | 'transparent'
 *  opts.scale       – 1 = fill; <1 shrinks the subject (Android safe zone)
 *  opts.mono        – flat white fractal silhouette (Android themed icon)
 *  opts.flatBg      – solid colour background instead of the gradient
 */
function render(size, opts = {}) {
  const { bg = 'gradient', scale = 1, mono = false } = opts;
  const transparent = bg === 'transparent';
  const SS = 2; // 2x2 supersampling
  const half = 1.68 / scale; // half-window in the complex plane (margin from edges)

  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let R = 0;
      let G = 0;
      let B = 0;
      let A = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const fx = (x + (sx + 0.5) / SS) / size; // 0..1
          const fy = (y + (sy + 0.5) / SS) / size;
          const zx0 = (fx * 2 - 1) * half;
          const zy0 = (fy * 2 - 1) * half;

          // Iterate z = z^2 + c.
          let zx = zx0;
          let zy = zy0;
          let n = 0;
          for (; n < MAX_ITER; n++) {
            const x2 = zx * zx;
            const y2 = zy * zy;
            if (x2 + y2 > BAILOUT) break;
            zy = 2 * zx * zy + C_IM;
            zx = x2 - y2 + C_RE;
          }

          let cr;
          let cg;
          let cb;
          let ca;
          if (n >= MAX_ITER) {
            // Interior: luminous radial ink (bright core -> teal edge).
            if (mono) {
              cr = cg = cb = 255;
              ca = 1;
            } else {
              const dt = clamp01((fx + fy) / 2); // diagonal sweep, tl -> br
              const ink = gradient(INK_STOPS, dt);
              // White sheen near the upper-left light source.
              const hd = Math.hypot(fx - 0.33, fy - 0.3);
              const sheen = Math.pow(clamp01(1 - hd / 0.55), 3) * 130;
              cr = ink[0] + sheen;
              cg = ink[1] + sheen;
              cb = ink[2] + sheen;
              ca = 1;
            }
          } else {
            // Exterior: smooth escape time -> a glow that's bright near the set
            // boundary and fades into the background.
            const logz = Math.log(zx * zx + zy * zy) / 2;
            const nu = Math.log(logz / Math.log(2)) / Math.log(2);
            const mu = n + 1 - nu;
            const prox = clamp01(mu / 42); // ~1 near boundary, ~0 far away
            const glowA = Math.pow(prox, 1.5);
            if (mono) {
              cr = cg = cb = 255;
              ca = glowA * 0.0; // monochrome shows only the solid set
            } else {
              const bgc = transparent ? [0, 0, 0] : gradient(BG_STOPS, clamp01((fx + fy) / 2));
              const glow = mix(GLOW_FAR, GLOW_NEAR, clamp01(mu / 24));
              const blended = mix(bgc, glow, glowA);
              cr = blended[0];
              cg = blended[1];
              cb = blended[2];
              ca = transparent ? glowA : 1;
            }
          }
          R += cr;
          G += cg;
          B += cb;
          A += ca;
        }
      }
      const nSamp = SS * SS;
      const o = (y * size + x) * 4;
      buf[o] = Math.round(clamp01(R / nSamp / 255) * 255);
      buf[o + 1] = Math.round(clamp01(G / nSamp / 255) * 255);
      buf[o + 2] = Math.round(clamp01(B / nSamp / 255) * 255);
      buf[o + 3] = Math.round(clamp01(A / nSamp) * 255);
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

console.log('Generating fractal app icons...');
writePNG(path.join(OUT, 'icon.png'), 1024, 1024, render(1024, { bg: 'gradient' }), true);
writePNG(path.join(OUT, 'now-playing.png'), 1024, 1024, render(1024, { bg: 'gradient' }), true);
writePNG(path.join(OUT, 'splash-icon.png'), 512, 512, render(512, { bg: 'transparent' }));
writePNG(path.join(OUT, 'android-icon-foreground.png'), 512, 512, render(512, { bg: 'transparent', scale: 0.62 }));
writePNG(path.join(OUT, 'android-icon-background.png'), 512, 512, flatGradient(512));
writePNG(path.join(OUT, 'android-icon-monochrome.png'), 432, 432, render(432, { bg: 'transparent', scale: 0.62, mono: true }));
writePNG(path.join(OUT, 'favicon.png'), 48, 48, render(48, { bg: 'gradient' }), true);
console.log('Done.');
