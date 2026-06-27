/**
 * Compresses the generated audio: converts every assets/audio/**\/*.wav to .mp3
 * (and deletes the .wav). Run after `node scripts/generate-audio.js`, which
 * writes uncompressed WAV intermediates — this is what shrinks the app from
 * ~130 MB of audio to ~13 MB with no audible loss.
 *
 *   node scripts/generate-audio.js     # writes .wav intermediates
 *   node scripts/convert-audio.mjs     # -> .mp3, deletes the .wav
 *
 * Bitrate: the binaural Frequencies (music/) use 192 kbps; everything else
 * 160 kbps. The binaural offsets are preserved through the encode (verified by
 * measuring each track's L/R carrier difference).
 *
 * Requires `@breezystack/lamejs` (a devDependency).
 */

import { readFileSync, writeFileSync, rmSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Mp3Encoder } from '@breezystack/lamejs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'assets', 'audio');

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.wav')) out.push(p);
  }
  return out;
}

function parseWav(buf) {
  let channels = 2, sampleRate = 44100, bits = 16, dataOff = 44, dataLen = buf.length - 44;
  let off = 12;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const sz = buf.readUInt32LE(off + 4);
    if (id === 'fmt ') {
      channels = buf.readUInt16LE(off + 10);
      sampleRate = buf.readUInt32LE(off + 12);
      bits = buf.readUInt16LE(off + 22);
    } else if (id === 'data') {
      dataOff = off + 8; dataLen = sz; break;
    }
    off += 8 + sz + (sz & 1);
  }
  return { channels, sampleRate, bits, dataOff, dataLen };
}

function toMp3(wavPath, kbps) {
  const buf = readFileSync(wavPath);
  const { channels, sampleRate, bits, dataOff, dataLen } = parseWav(buf);
  if (bits !== 16) throw new Error(`${wavPath}: ${bits}-bit not supported`);
  const enc = new Mp3Encoder(channels, sampleRate, kbps);
  const BLOCK = 1152;
  const chunks = [];
  if (channels === 2) {
    const frames = dataLen / 4;
    const left = new Int16Array(frames);
    const right = new Int16Array(frames);
    for (let i = 0; i < frames; i++) {
      left[i] = buf.readInt16LE(dataOff + i * 4);
      right[i] = buf.readInt16LE(dataOff + i * 4 + 2);
    }
    for (let i = 0; i < frames; i += BLOCK) {
      const mp3 = enc.encodeBuffer(left.subarray(i, i + BLOCK), right.subarray(i, i + BLOCK));
      if (mp3.length) chunks.push(Buffer.from(mp3));
    }
  } else {
    const frames = dataLen / 2;
    const mono = new Int16Array(frames);
    for (let i = 0; i < frames; i++) mono[i] = buf.readInt16LE(dataOff + i * 2);
    for (let i = 0; i < frames; i += BLOCK) {
      const mp3 = enc.encodeBuffer(mono.subarray(i, i + BLOCK));
      if (mp3.length) chunks.push(Buffer.from(mp3));
    }
  }
  const end = enc.flush();
  if (end.length) chunks.push(Buffer.from(end));
  const out = Buffer.concat(chunks);
  writeFileSync(wavPath.replace(/\.wav$/, '.mp3'), out);
  return { inMB: buf.length / 1048576, outMB: out.length / 1048576 };
}

const wavs = walk(ROOT);
if (!wavs.length) {
  console.log('No .wav files found — run generate-audio.js first.');
  process.exit(0);
}
let totIn = 0, totOut = 0;
for (const w of wavs) {
  const kbps = w.includes(`${'/'}music${'/'}`) ? 192 : 160;
  const { inMB, outMB } = toMp3(w, kbps);
  totIn += inMB; totOut += outMB;
  rmSync(w);
  console.log(`  ${w.split('/audio/')[1]}  ${inMB.toFixed(2)} -> ${outMB.toFixed(2)} MB @${kbps}k`);
}
console.log(`\nTOTAL  ${totIn.toFixed(1)} MB -> ${totOut.toFixed(1)} MB  (saved ${(totIn - totOut).toFixed(1)} MB)`);
