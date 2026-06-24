/**
 * Generates the app's icon set procedurally (no design tools), so the brand mark
 * matches the in-app "breathing orb": a luminous indigo→teal orb with a soft halo
 * on the app's deep-navy background. Reproducible: `node scripts/generate-icon.js`.
 *
 *   assets/images/icon.png                     – 1024² master icon (navy bg + orb)
 *   assets/images/splash-icon.png              – 512² orb on transparent (splash)
 *   assets/images/android-icon-foreground.png  – 512² orb, kept in the safe zone
 *   assets/images/android-icon-background.png   – 512² flat navy
 *   assets/images/android-icon-monochrome.png  – 432² white orb (themed icons)
 *   assets/images/favicon.png                  – 48² mini icon
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'assets', 'images');

// --- tiny PNG encoder (RGBA, 8-bit) ---------------------------------------
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
  ihdr[8] = 8; // bit depth
  // Opaque images (the iOS app icon) use RGB (type 2) so there's no alpha
  // channel — the App Store rejects icons with transparency.
  ihdr[9] = opaque ? 2 : 6;
  // 10,11,12 = compression, filter, interlace = 0
  // Prepend a 0 filter byte per scanline.
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
// Smoothstep from edge0->edge1 (returns 0..1). Used for anti-aliased falloffs.
function smooth(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}
// Multi-stop gradient lookup. stops: [[t, [r,g,b]], ...] sorted by t.
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

// Brand palette (matches src/theme + the in-app orb).
const NAVY = hex('#0E1020');
const NAVY_LIFT = hex('#171B36');
const CORE = hex('#EAF0FF'); // soft luminous centre (not pure white)
const INDIGO = hex('#8B9DF0');
const TEAL = hex('#6FD6C7');
const HALO = hex('#7FA6E0');
const RING = hex('#AEBCF6');

const ORB_STOPS = [
  [0.0, CORE],
  [0.45, INDIGO],
  [1.0, TEAL],
];

/**
 * Render the orb composition.
 *  opts.bg        – background: 'navy' | 'transparent'
 *  opts.scale     – 1 = fill; <1 shrinks the orb (Android safe zone)
 *  opts.mono      – render a flat white disc instead of the gradient orb
 *  opts.rings     – draw the faint breath ring (off for tiny sizes)
 */
function render(size, opts = {}) {
  const { bg = 'navy', scale = 1, mono = false, rings = true } = opts;
  const half = size / 2;
  const cx = half;
  const cy = half;
  const rc = 0.52 * scale; // orb radius (fraction of half)
  const rh = 0.82 * scale; // halo outer radius
  const ringR = 0.68 * scale;
  const aa = 1.5 / half; // ~1.5px anti-alias band, in normalized units
  const buf = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5 - cx) / half;
      const dy = (y + 0.5 - cy) / half;
      const d = Math.hypot(dx, dy);

      let r, g, b, a;
      if (bg === 'navy') {
        // Subtle radial lift toward the centre for a touch of depth.
        const lift = smooth(1.15, 0.0, d) * 0.6;
        [r, g, b] = mix(NAVY, NAVY_LIFT, lift);
        a = 255;
      } else {
        r = g = b = 0;
        a = 0;
      }

      if (mono) {
        const orbA = smooth(rc + aa, rc - aa, d);
        if (orbA > 0) {
          r = g = b = 255;
          a = Math.max(a, Math.round(orbA * 255));
        }
        buf[(y * size + x) * 4 + 0] = r;
        buf[(y * size + x) * 4 + 1] = g;
        buf[(y * size + x) * 4 + 2] = b;
        buf[(y * size + x) * 4 + 3] = a;
        continue;
      }

      // Halo glow (under everything else).
      const haloA = smooth(rh, rc * 0.85, d) * 0.4;
      if (haloA > 0) {
        const blended = mix([r, g, b], HALO, haloA);
        r = blended[0];
        g = blended[1];
        b = blended[2];
        if (bg !== 'navy') a = Math.max(a, Math.round(haloA * 255));
      }

      // Faint breath ring.
      if (rings) {
        const ringIntensity = Math.exp(-(((d - ringR) / 0.018) ** 2)) * 0.5;
        if (ringIntensity > 0.01) {
          const blended = mix([r, g, b], RING, ringIntensity);
          r = blended[0];
          g = blended[1];
          b = blended[2];
          if (bg !== 'navy') a = Math.max(a, Math.round(ringIntensity * 255));
        }
      }

      // The orb itself (on top).
      const orbA = smooth(rc + aa, rc - aa, d);
      if (orbA > 0) {
        const oc = gradient(ORB_STOPS, clamp01(d / rc));
        r = lerp(r, oc[0], orbA);
        g = lerp(g, oc[1], orbA);
        b = lerp(b, oc[2], orbA);
        a = Math.max(a, Math.round(orbA * 255));
      }

      const i = (y * size + x) * 4;
      buf[i] = Math.round(clamp01(r / 255) * 255);
      buf[i + 1] = Math.round(clamp01(g / 255) * 255);
      buf[i + 2] = Math.round(clamp01(b / 255) * 255);
      buf[i + 3] = a;
    }
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

console.log('Generating app icons...');
writePNG(path.join(OUT, 'icon.png'), 1024, 1024, render(1024, { bg: 'navy' }), true);
writePNG(path.join(OUT, 'splash-icon.png'), 512, 512, render(512, { bg: 'transparent' }));
writePNG(path.join(OUT, 'android-icon-foreground.png'), 512, 512, render(512, { bg: 'transparent', scale: 0.66 }));
writePNG(path.join(OUT, 'android-icon-background.png'), 512, 512, flat(512, NAVY));
writePNG(path.join(OUT, 'android-icon-monochrome.png'), 432, 432, render(432, { bg: 'transparent', scale: 0.66, mono: true, rings: false }));
writePNG(path.join(OUT, 'favicon.png'), 48, 48, render(48, { bg: 'navy', rings: false }));
console.log('Done.');
