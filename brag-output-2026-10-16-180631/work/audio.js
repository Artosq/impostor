// Synthesizes music + SFX as one mix: 120 BPM, A minor, events locked to the storyboard.
const fs = require('fs');
const SR = 44100, DUR = 30, N = Math.round(SR * DUR);
const L = new Float32Array(N), R = new Float32Array(N);
const sendL = new Float32Array(N), sendR = new Float32Array(N);
const BEAT = 60 / 128, b = x => x * BEAT;
const hz = m => 440 * Math.pow(2, (m - 69) / 12);
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647 * 2 - 1;

function add(t0, len, fn, { gain = 1, pan = 0, send = 0.2 } = {}) {
  const s0 = Math.floor(t0 * SR), n = Math.floor(len * SR);
  const gl = gain * Math.cos((pan + 1) * Math.PI / 4), gr = gain * Math.sin((pan + 1) * Math.PI / 4);
  for (let i = 0; i < n; i++) {
    const k = s0 + i; if (k < 0 || k >= N) continue;
    const v = fn(i / SR);
    L[k] += v * gl; R[k] += v * gr; sendL[k] += v * gl * send; sendR[k] += v * gr * send;
  }
}
// band-limited-ish saw from harmonics, warm
const saw = (f, t, h = 8) => { let v = 0; for (let k = 1; k <= h; k++) v += Math.sin(2 * Math.PI * f * k * t) / k; return v * 0.6; };
const env = (t, a, d) => Math.min(1, t / a) * Math.exp(-t / d);

// --- instruments
function kick(t0, g = 1) { add(t0, 0.45, t => { const f = 45 + 110 * Math.exp(-t * 28); return Math.sin(2 * Math.PI * (45 * t + 110 * (1 - Math.exp(-t * 28)) / 28)) * Math.exp(-t * 7) * (f > 0); }, { gain: 0.9 * g, send: 0.02 }); }
function hat(t0, g = 1) { let lp = 0; add(t0, 0.06, t => { const n = rnd(); const hp = n - lp; lp = lp * 0.6 + n * 0.4; return hp * Math.exp(-t * 70); }, { gain: 0.07 * g, pan: 0.3, send: 0.05 }); }
function bass(t0, m, len = 0.24) { let y = 0; add(t0, len + 0.05, t => { const x = saw(hz(m), t, 10); y += (x - y) * 0.08; return y * Math.min(1, t / 0.005) * Math.exp(-t * 4) * (t < len ? 1 : Math.exp(-(t - len) * 80)); }, { gain: 0.42, send: 0.03 }); }
function pad(t0, notes, len, g = 0.06) { notes.forEach((m, j) => [-0.12, 0.12].forEach(det => {
  let y = 0; add(t0, len, t => { const x = saw(hz(m) * Math.pow(2, det / 12), t, 6); y += (x - y) * 0.03; return y * Math.min(1, t / 0.4) * Math.min(1, (len - t) / 0.5); }, { gain: g, pan: det * 4 * (j % 2 ? 1 : -1), send: 0.5 });
})); }
function pluck(t0, m, g = 0.18, pan = 0) { add(t0, 0.6, t => (Math.sin(2 * Math.PI * hz(m) * t) + 0.3 * Math.sin(4 * Math.PI * hz(m) * t)) * env(t, 0.003, 0.14), { gain: g, pan, send: 0.35 }); }
function blip(t0, m, g = 0.22) { add(t0, 0.5, t => (Math.sign(Math.sin(2 * Math.PI * hz(m) * t)) * 0.25 + Math.sin(2 * Math.PI * hz(m) * t) * 0.75) * env(t, 0.002, 0.09), { gain: g, send: 0.4 }); }
function whoosh(tEnd, len = 0.45, g = 0.12) { let y = 0; add(tEnd - len, len + 0.15, t => { const p = Math.min(1, t / len); y += (rnd() - y) * (0.02 + 0.25 * p * p); return y * p * p * (t > len ? Math.exp(-(t - len) * 30) : 1); }, { gain: g, pan: 0, send: 0.4 }); }
function clap(t0, g = 1) { let lp = 0; add(t0, 0.18, t => { const n = rnd(); lp = lp * 0.5 + n * 0.5; const e = t < 0.012 ? 1 : t < 0.024 ? 0.6 : Math.exp(-(t - 0.024) * 30); return (n - lp * 0.6) * e; }, { gain: 0.16 * g, pan: -0.1, send: 0.35 }); }
function tick(t0, g = 0.05) { add(t0, 0.03, t => rnd() * Math.exp(-t * 200), { gain: g, pan: -0.2, send: 0.1 }); }
function boom(t0, g = 1) {
  add(t0, 1.6, t => Math.sin(2 * Math.PI * (38 * t + 80 * (1 - Math.exp(-t * 10)) / 10)) * Math.exp(-t * 2.2), { gain: 0.8 * g, send: 0.15 });
  let y = 0; add(t0, 0.5, t => { y += (rnd() - y) * 0.15; return y * Math.exp(-t * 9); }, { gain: 0.35 * g, send: 0.5 });
  [45, 52, 57].forEach(m => { let z = 0; add(t0, 1.4, t => { const x = saw(hz(m), t, 12); z += (x - z) * (0.05 + 0.2 * Math.exp(-t * 6)); return z * env(t, 0.004, 0.5); }, { gain: 0.16 * g, send: 0.45 }); });
}

// --- arrangement (beats at 128 BPM)
const PROG = [[45, [57, 60, 64]], [41, [57, 60, 65]], [48, [55, 60, 64]], [43, [55, 59, 62]]];
const groove = (from, to) => { for (let k = from; k < to; k++) {
  const t = b(k), bar = Math.floor(k / 4), [root, chord] = PROG[bar % 4];
  if (k % 4 === 0) pad(t, chord, b(4) + 0.05, 0.03);
  kick(t); if (k % 2 === 1) clap(t);
  hat(t + b(0.5)); hat(t + b(0.25), 0.4); hat(t + b(0.75), 0.4);
  bass(t, root, 0.18); bass(t + b(0.5), root + (k % 4 === 3 ? 12 : 0), 0.18);
  if (k >= 8) [0, 0.25, 0.5, 0.75].forEach((s, j) => pluck(t + b(s), chord[(k * 4 + j) % 3] + 12, 0.045, j % 2 ? 0.45 : -0.45));
} };
// hook: tension, three green reveals, impostor hit
pad(0, [57, 60, 64], b(6) + 0.1, 0.04);
for (let k = 0; k < 6; k++) tick(b(k), 0.08);
[[2, 69], [3, 72], [4, 76]].forEach(([k, m]) => blip(b(k), m));
whoosh(b(6), 1.0, 0.1);
boom(b(6));
groove(6, 43);
// break: ZWROT AKCJI
boom(b(43), 0.9);
pad(b(43), [56, 60, 64], b(2) + 0.05, 0.05);
whoosh(b(45), b(2), 0.12);
groove(45, 60);
// cuts
[8, 10, 15, 19, 21, 23, 26, 29.5, 34, 36, 45, 51, 53, 56].forEach(k => whoosh(b(k), 0.22, 0.05));
// robot: dice rolls
[[10, 69], [11, 72], [12, 74], [13, 76], [14, 81]].forEach(([k, m]) => { tick(b(k), 0.1); blip(b(k), m, 0.12); });
blip(b(9), 64, 0.08);
// room
[[16, 76], [17, 79], [18, 81]].forEach(([k, m]) => blip(b(k), m, 0.12));
blip(b(16), 69, 0.1);
tick(b(21.75), 0.12); blip(b(21.75), 64, 0.1);
tick(b(24.1), 0.12); boom(b(24.2), 0.35);
// categories
boom(b(27.5), 0.3);
tick(b(29.2), 0.1);
[30, 30.25, 31, 31.25, 32, 32.25, 33, 33.25].forEach(k => tick(b(k), 0.05));
// gameplay: bubbles, the hint, the wrong answer
[[36, 72], [37, 76], [38, 74]].forEach(([k, m]) => blip(b(k), m, 0.12));
whoosh(b(39), 0.3, 0.07); pluck(b(39), 57, 0.12);
[58, 64, 70].forEach(m => blip(b(40.5), m, 0.09));
[57, 63].forEach(m => blip(b(41.7), m + 12, 0.08));
// pytania: answers, the suspicious 40
[[46, 69], [46.5, 72], [47, 76]].forEach(([k, m]) => blip(b(k), m, 0.12));
blip(b(47.5), 46, 0.2); blip(b(47.5), 58, 0.1);
boom(b(48.5), 0.4);
// final
tick(b(51.5), 0.12); blip(b(51.5), 69, 0.1);
boom(b(54), 0.9);
[72, 76, 79, 84].forEach((m, i) => blip(b(54) + i * 0.07, m, 0.11));
tick(b(57.1), 0.12); whoosh(b(57.2), 0.3, 0.08);
// outro
boom(b(60));
pad(b(60), [45, 57, 60, 64], 30 - b(60), 0.05);
[69, 72, 76].forEach((m, i) => pluck(b(61) + i * 0.1, m, 0.08, i - 1));

// --- reverb (Schroeder: 4 combs + 2 allpass per side)
function reverb(x, offs) {
  const out = new Float32Array(N);
  [1557, 1617, 1491, 1422].forEach(d => { d += offs; const buf = new Float32Array(d); let i = 0, lp = 0;
    for (let k = 0; k < N; k++) { const y = buf[i]; lp = y * 0.6 + lp * 0.4; buf[i] = x[k] + lp * 0.8; i = (i + 1) % d; out[k] += y * 0.25; } });
  [225, 556].forEach(d => { const buf = new Float32Array(d); let i = 0;
    for (let k = 0; k < N; k++) { const b = buf[i]; const y = -out[k] + b; buf[i] = out[k] + b * 0.5; out[k] = y; i = (i + 1) % d; } });
  return out;
}
const rl = reverb(sendL, 0), rr = reverb(sendR, 23);
let peak = 0;
for (let k = 0; k < N; k++) {
  const fade = Math.min(1, (N - k) / (SR * 0.6));
  L[k] = Math.tanh((L[k] + rl[k] * 0.6) * 1.1) * fade; R[k] = Math.tanh((R[k] + rr[k] * 0.6) * 1.1) * fade;
  peak = Math.max(peak, Math.abs(L[k]), Math.abs(R[k]));
}
const g = 0.89 / peak;
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVEfmt ', 8);
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24);
buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
for (let k = 0; k < N; k++) { buf.writeInt16LE(Math.round(L[k] * g * 32767), 44 + k * 4); buf.writeInt16LE(Math.round(R[k] * g * 32767), 46 + k * 4); }
fs.writeFileSync(__dirname + '/soundtrack.wav', buf);
console.log('peak', peak.toFixed(2));
