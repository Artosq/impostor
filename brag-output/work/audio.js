// Synthesizes music + SFX as one mix: 120 BPM, A minor, events locked to the storyboard.
const fs = require('fs');
const SR = 44100, DUR = 20.5, N = Math.round(SR * DUR);
const L = new Float32Array(N), R = new Float32Array(N);
const sendL = new Float32Array(N), sendR = new Float32Array(N);
const BEAT = 0.5, DROP = 2.5, END_GROOVE = 19.5;
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
function tick(t0, g = 0.05) { add(t0, 0.03, t => rnd() * Math.exp(-t * 200), { gain: g, pan: -0.2, send: 0.1 }); }
function boom(t0, g = 1) {
  add(t0, 1.6, t => Math.sin(2 * Math.PI * (38 * t + 80 * (1 - Math.exp(-t * 10)) / 10)) * Math.exp(-t * 2.2), { gain: 0.8 * g, send: 0.15 });
  let y = 0; add(t0, 0.5, t => { y += (rnd() - y) * 0.15; return y * Math.exp(-t * 9); }, { gain: 0.35 * g, send: 0.5 });
  [45, 52, 57].forEach(m => { let z = 0; add(t0, 1.4, t => { const x = saw(hz(m), t, 12); z += (x - z) * (0.05 + 0.2 * Math.exp(-t * 6)); return z * env(t, 0.004, 0.5); }, { gain: 0.16 * g, send: 0.45 }); });
}

// --- arrangement
// intro tension: Am pad + clock ticks, riser into the drop
pad(0, [57, 60, 64], 2.6, 0.045);
for (let t = 0; t < DROP; t += BEAT) tick(t, 0.07);
[[1.0, 69], [1.5, 72], [2.0, 76]].forEach(([t, m]) => blip(t, m));   // three green reveals
whoosh(DROP, 1.0, 0.1);
boom(DROP);                                                            // impostor

// groove from the drop: Am F C G, one bar (2s) each
const PROG = [[45, [57, 60, 64]], [41, [57, 60, 65]], [48, [55, 60, 64]], [43, [55, 59, 62]]];
for (let bar = 0; DROP + bar * 2 < END_GROOVE; bar++) {
  const t0 = DROP + bar * 2, [root, chord] = PROG[bar % 4];
  pad(t0, chord, 2.05, 0.035);
  for (let b = 0; b < 4; b++) {
    const tb = t0 + b * BEAT; if (tb >= END_GROOVE) break;
    const outroGap = tb >= 17.5 && tb < 18.0;                       // breath before "KTO KŁAMIE?"
    if (!outroGap && tb > DROP) kick(tb);
    if (!outroGap) { hat(tb + BEAT / 2); bass(tb, root); bass(tb + BEAT / 2, root + (b === 3 ? 7 : 0)); }
    if (tb >= 5) pluck(tb + 0.25, chord[(b + bar) % 3] + 12, 0.06, b % 2 ? 0.4 : -0.4);
  }
}
// transitions
[5.0, 8.0, 11.0, 14.5, 17.5].forEach(t => whoosh(t, 0.4, 0.09));
// scene 2 logo shimmer
[69, 72, 76, 81].forEach((m, i) => pluck(5.1 + i * 0.07, m, 0.1, i % 2 ? 0.5 : -0.5));
// players join
[[8.5, 76], [9.0, 79], [9.5, 81]].forEach(([t, m]) => blip(t, m, 0.13));
// taps + typing
tick(12.2, 0.12); blip(12.2, 69, 0.08);
[12.95, 13.05, 13.35, 13.45, 13.75, 13.85].forEach(t => tick(t, 0.06));
tick(15.5, 0.12); blip(15.5, 72, 0.1);
// win chime
[69, 72, 76, 81].forEach((m, i) => blip(16.0 + i * 0.08, m, 0.1));
// outro hit + final ring
boom(18.0, 0.7);
pad(END_GROOVE - 0.1, [45, 57, 60, 64], 1.1, 0.05);

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
