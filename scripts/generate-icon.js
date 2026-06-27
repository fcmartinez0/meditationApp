/**
 * Generates the app's icon set procedurally (no design tools): a glowing glass
 * orb — a shaded sphere (light core through indigo to teal, a specular highlight
 * and a soft halo) framed by a faint geometric ring (hexagon + 12-point
 * starburst), on the app's deep navy with a little stardust. Matches the in-app
 * breathing orb.
 * Reproducible: `node scripts/generate-icon.js`.
 *
 *   assets/images/icon.png                     – 1024² master icon (navy, RGB)
 *   assets/images/now-playing.png              – 1024² lock-screen artwork
 *   assets/images/splash-icon.png              – 512² orb on transparent
 *   assets/images/android-icon-foreground.png  – 512² orb, in the safe zone
 *   assets/images/android-icon-background.png   – 512² flat navy
 *   assets/images/android-icon-monochrome.png  – 432² white orb (themed)
 *   assets/images/favicon.png                  – 48² mini icon
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'assets', 'images');

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
function smooth(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}
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
// Shortest distance from a point to a line segment.
function distSeg(px, py, x1, y1, x2, y2) {
  const vx = x2 - x1;
  const vy = y2 - y1;
  const wx = px - x1;
  const wy = py - y1;
  const c1 = vx * wx + vy * wy;
  if (c1 <= 0) return Math.hypot(px - x1, py - y1);
  const c2 = vx * vx + vy * vy;
  if (c2 <= c1) return Math.hypot(px - x2, py - y2);
  const b = c1 / c2;
  return Math.hypot(px - (x1 + b * vx), py - (y1 + b * vy));
}
// Edges of a regular polygon (rotDeg, starting at top).
function polyEdges(cx, cy, R, sides, rotDeg) {
  const base = (rotDeg * Math.PI) / 180 - Math.PI / 2;
  const pts = [];
  for (let k = 0; k < sides; k++) pts.push([cx + R * Math.cos(base + (2 * Math.PI * k) / sides), cy + R * Math.sin(base + (2 * Math.PI * k) / sides)]);
  const edges = [];
  for (let k = 0; k < sides; k++) edges.push([...pts[k], ...pts[(k + 1) % sides]]);
  return edges;
}

const NAVY = hex('#0E1020');
const NAVY_LIFT = hex('#191D38');
// Iridescent glass: bright core through periwinkle and sky to teal at the rim.
const ORB_STOPS = [
  [0.0, hex('#F4F6FF')],
  [0.36, hex('#A6B0F8')],
  [0.66, hex('#7BA6E8')],
  [1.0, hex('#5FD8C6')],
];
// Soft coloured light pools inside the orb — an aurora trapped in glass (in
// normalized orb coordinates, -1..1; the first is the main gloss highlight).
const AURORA = [
  { x: -0.34, y: -0.4, col: hex('#FFFFFF'), rad: 0.55, amp: 0.5 },
  { x: 0.34, y: 0.34, col: hex('#5FE6D2'), rad: 0.9, amp: 0.7 },
  { x: -0.1, y: 0.1, col: hex('#A98CFF'), rad: 0.8, amp: 0.6 },
  { x: 0.42, y: -0.28, col: hex('#6FA0FF'), rad: 0.7, amp: 0.5 },
];
const HALO = hex('#7C97E8');
const ACCENT = hex('#A6B2F8');
const STAR = hex('#FFFFFF');

/**
 * Render the orb.
 *  opts.bg     – 'navy' | 'transparent'
 *  opts.scale  – 1 = fill; <1 shrinks (Android safe zone)
 *  opts.mono   – flat white orb (Android themed icon)
 *  opts.geom   – draw the geometric frame + stardust (off for tiny sizes)
 */
function render(size, opts = {}) {
  const { bg = 'navy', scale = 1, mono = false, geom = true } = opts;
  const cx = size / 2;
  const cy = size / 2;
  const R = 0.4 * size * scale; // orb radius
  const aa = 1.5; // edge anti-alias in px
  const rng = makeRng(7);

  // Geometry: a hexagon, a 12-point starburst (radial spokes, alternating long
  // and short — celestial radiance, not a hexagram), and a fine tick bezel,
  // framing the orb like a mandala.
  const Rg = 0.62 * size * scale;
  const ringR = 0.76 * size * scale;
  const edges = [];
  if (geom) {
    edges.push(...polyEdges(cx, cy, Rg, 6, 0));
    const burstInner = R * 1.12; // start just outside the orb
    const SPOKES = 12;
    for (let k = 0; k < SPOKES; k++) {
      const ang = (2 * Math.PI * k) / SPOKES - Math.PI / 2;
      const outer = Rg * (k % 2 === 0 ? 0.96 : 0.78); // long / short rays
      edges.push([
        cx + Math.cos(ang) * burstInner,
        cy + Math.sin(ang) * burstInner,
        cx + Math.cos(ang) * outer,
        cy + Math.sin(ang) * outer,
      ]);
    }
    const N = 36;
    for (let k = 0; k < N; k++) {
      const ang = (2 * Math.PI * k) / N - Math.PI / 2;
      const r1 = ringR - size * 0.013 * scale;
      const r2 = ringR + size * 0.013 * scale;
      edges.push([cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1, cx + Math.cos(ang) * r2, cy + Math.sin(ang) * r2]);
    }
  }
  const stroke = Math.max(1.2, size * 0.004);

  // Stardust specks (behind the orb).
  const specks = [];
  if (geom && !mono) {
    for (let i = 0; i < Math.floor(size * 0.06); i++) {
      specks.push({ x: rng() * size, y: rng() * size, r: 0.6 + rng() * 1.6, a: 0.15 + rng() * 0.5 });
    }
  }

  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const dist = Math.hypot(px - cx, py - cy);

      // --- background / behind-orb light ---
      let r;
      let g;
      let b;
      let a;
      if (bg === 'navy') {
        const lift = smooth(0.95 * size, 0, dist) * 0.5;
        [r, g, b] = mix(NAVY, NAVY_LIFT, lift);
        r /= 255;
        g /= 255;
        b /= 255;
        a = 1;
      } else {
        r = g = b = 0;
        a = 0;
      }
      const addLight = (col, amt) => {
        if (amt <= 0) return;
        r = clamp01(r + (col[0] / 255) * amt);
        g = clamp01(g + (col[1] / 255) * amt);
        b = clamp01(b + (col[2] / 255) * amt);
        if (bg !== 'navy') a = clamp01(Math.max(a, amt));
      };

      if (dist > R - aa) {
        // Halo glow around the orb.
        addLight(HALO, smooth(R * 1.9, R, dist) * 0.32);
        if (geom && !mono) {
          // Glowing geometric mandala: crisp lines plus a soft glow around them.
          let dmin = Infinity;
          for (const e of edges) {
            const d = distSeg(px, py, e[0], e[1], e[2], e[3]);
            if (d < dmin) dmin = d;
          }
          addLight(ACCENT, (1 - smooth(0, stroke, dmin)) * 0.75);
          addLight(ACCENT, (1 - smooth(0, stroke * 5, dmin)) * 0.1);
        }
      }

      // --- the orb (a shaded sphere) on top ---
      const dx = (px - cx) / R;
      const dy = (py - cy) / R;
      const r2 = dx * dx + dy * dy;
      const orbA = smooth(R + aa, R - aa, dist);
      if (orbA > 0 && r2 < 1.2) {
        const rr = Math.min(1, Math.sqrt(r2));
        let oc;
        if (mono) {
          oc = STAR;
        } else {
          const nz = Math.sqrt(Math.max(0, 1 - r2));
          // Light from the upper-left.
          const lx = -0.45;
          const ly = -0.55;
          const lz = 0.7;
          const diff = clamp01(dx * lx + dy * ly + nz * lz);
          const base = gradient(ORB_STOPS, rr);
          const shade = 0.5 + 0.6 * diff;
          let cr = base[0] * shade;
          let cg = base[1] * shade;
          let cb = base[2] * shade;
          // Internal aurora — coloured light pools blended in (not added, so the
          // colour stays saturated) to give the glass iridescent depth.
          for (const A of AURORA) {
            const dd = Math.hypot(dx - A.x, dy - A.y);
            const w = clamp01(smooth(A.rad, 0, dd) * A.amp);
            cr = lerp(cr, A.col[0] * shade, w);
            cg = lerp(cg, A.col[1] * shade, w);
            cb = lerp(cb, A.col[2] * shade, w);
          }
          const spec = Math.pow(diff, 30) * 210; // tight specular highlight
          cr += spec;
          cg += spec;
          cb += spec;
          const rim = Math.pow(rr, 5) * 75; // cool rim light at the edge
          cg += rim * 0.6;
          cb += rim;
          oc = [cr, cg, cb];
        }
        r = lerp(r, clamp01(oc[0] / 255), orbA);
        g = lerp(g, clamp01(oc[1] / 255), orbA);
        b = lerp(b, clamp01(oc[2] / 255), orbA);
        if (bg !== 'navy') a = Math.max(a, orbA);
      } else if (!mono) {
        // specks only show in the empty background
        for (const s of specks) {
          const sd = Math.hypot(px - s.x, py - s.y);
          if (sd < s.r) addLight(STAR, (1 - sd / s.r) * s.a);
        }
      }

      const o = (y * size + x) * 4;
      buf[o] = Math.round(clamp01(r) * 255);
      buf[o + 1] = Math.round(clamp01(g) * 255);
      buf[o + 2] = Math.round(clamp01(b) * 255);
      buf[o + 3] = Math.round(clamp01(a) * 255);
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

console.log('Generating orb app icons...');
writePNG(path.join(OUT, 'icon.png'), 1024, 1024, render(1024, { bg: 'navy' }), true);
writePNG(path.join(OUT, 'now-playing.png'), 1024, 1024, render(1024, { bg: 'navy' }), true);
writePNG(path.join(OUT, 'splash-icon.png'), 512, 512, render(512, { bg: 'transparent', geom: false }));
writePNG(path.join(OUT, 'android-icon-foreground.png'), 512, 512, render(512, { bg: 'transparent', scale: 0.62, geom: false }));
writePNG(path.join(OUT, 'android-icon-background.png'), 512, 512, flat(512, NAVY));
writePNG(path.join(OUT, 'android-icon-monochrome.png'), 432, 432, render(432, { bg: 'transparent', scale: 0.62, mono: true, geom: false }));
writePNG(path.join(OUT, 'favicon.png'), 48, 48, render(48, { bg: 'navy', geom: false }));
console.log('Done.');
