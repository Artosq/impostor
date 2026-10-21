'use strict';

// AWATARY "AGENCI": ciemne sylwetki noir z neonowym światłem krawędziowym, świecącymi oczami
// i jaskrawymi maskami. Wszystko rysowane od zera (bez cudzych zasobów), składane z części.
//
// Każda część katalogu ma nazwę i rzadkość (common / rare / epic / legendary) pod skrzynki za poziomy.
// Części oznaczone `animated` ruszają się tylko w zwykłym stanie awatara (nie po wyrzuceniu).
// Nowa część = jeden wpis w odpowiednim katalogu niżej.

const INK = '#0a0b0e', INK2 = '#15171c', INK3 = '#242730', INK4 = '#3b3f4b', FACE = '#1b1e25', BG = '#12141a';

const ACCENTS = {
    green: { name: 'Zielony', hex: '#39e079' }, red: { name: 'Czerwony', hex: '#ff4d4d' }, blue: { name: 'Niebieski', hex: '#4fb3ff' },
    yellow: { name: 'Żółty', hex: '#ffd43b' }, magenta: { name: 'Różowy', hex: '#ff5fd2' }, cyan: { name: 'Turkusowy', hex: '#4ff0ff' },
    orange: { name: 'Pomarańczowy', hex: '#ff9a3d' }, white: { name: 'Biały', hex: '#f2f2f2' }, violet: { name: 'Fioletowy', hex: '#a78bfa' }
};

// ===== kolory =====
const hexToRgb = hex => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgbToHex = (r, g, b) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const shade = (hex, f) => { const [r, g, b] = hexToRgb(hex); return rgbToHex(r * f, g * f, b * f); };

function hslToHex(h, s, l) {
    const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return rgbToHex(f(0) * 255, f(8) * 255, f(4) * 255);
}

// Kolor dodatkowy (dekoracje masek, tła): odcień przesunięty o 150 stopni
function trimOf(hex) {
    const [r, g, b] = hexToRgb(hex).map(v => v / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
    if (max === min) return '#8b93a7';
    const d = max - min, s = l > .5 ? d / (2 - max - min) : d / (max + min);
    if (s < .12) return '#8b93a7';
    let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
    return hslToHex((h + 150) % 360, Math.min(1, s), Math.min(.68, Math.max(.5, l)));
}

// ===== narzędzia rysunkowe =====
const attrs = o => Object.entries(o).map(([k, v]) => ` ${k}="${v}"`).join('');
const P = (d, fill, o = {}) => `<path d="${d}" fill="${fill}"${attrs(o)}/>`;
const C = (cx, cy, r, fill, o = {}) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"${attrs(o)}/>`;
const E = (cx, cy, rx, ry, fill, o = {}) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}"${attrs(o)}/>`;
const R = (x, y, w, h, fill, o = {}) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${attrs(o)}/>`;
const L = (d, stroke, w, o = {}) => `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${attrs(o)}/>`;
const mirror = svg => `<g transform="matrix(-1 0 0 1 120 0)">${svg}</g>`;
const pair = fn => fn() + mirror(fn());

// Odbicie ścieżki w poziomie (tylko współrzędne bezwzględne: M L H V C Q A Z)
function flipPath(d) {
    const f = x => +(120 - x).toFixed(2);
    return d.match(/[MLHVCQSTAZ][^MLHVCQSTAZ]*/g).map(seg => {
        const cmd = seg[0];
        const nums = (seg.slice(1).match(/-?\d*\.?\d+/g) || []).map(Number);
        let out;
        if (cmd === 'H') out = nums.map(f);
        else if (cmd === 'V' || cmd === 'Z') out = nums;
        else if (cmd === 'A') {
            out = [];
            for (let i = 0; i < nums.length; i += 7) out.push(nums[i], nums[i + 1], nums[i + 2], nums[i + 3], 1 - nums[i + 4], f(nums[i + 5]), nums[i + 6]);
        } else out = nums.map((n, i) => (i % 2 === 0 ? f(n) : n));
        return cmd + out.join(' ');
    }).join('');
}

// Światło krawędziowe: kolorowa kopia przesunięta w lewo-górę pod ciemnym kształtem
const rim = (d, fill, c, off = 1.5) => P(d, c, { transform: `translate(${-off} ${-off})`, opacity: .95 }) + P(d, fill);
const rimPair = (d, fill, c, off) => rim(d, fill, c, off) + rim(flipPath(d), fill, c, off);

// Poświata: kilka warstw o malejącej przezroczystości
const glowDot = (cx, cy, r, c) => C(cx, cy, r + 5, c, { opacity: .13 }) + C(cx, cy, r + 2.5, c, { opacity: .26 }) + C(cx, cy, r, c) + C(cx - r * .3, cy - r * .3, r * .32, '#fff', { opacity: .85 });
const glowLine = (d, c, w) => L(d, c, w + 7, { opacity: .12 }) + L(d, c, w + 3.5, { opacity: .25 }) + L(d, c, w);
const glowFill = (d, c) => P(d, c, { stroke: c, 'stroke-width': 7, 'stroke-linejoin': 'round', opacity: .12 })
    + P(d, c, { stroke: c, 'stroke-width': 3.5, 'stroke-linejoin': 'round', opacity: .26 }) + P(d, c);

// Ruch: tylko CSS wewnątrz SVG, więc system może go wyłączyć (prefers-reduced-motion)
const motion = (ctx, css) => { if (ctx.anim) ctx.css.push(css); };

const SHOULDERS = 'M4 120 C4 99 24 91 45 87 L75 87 C96 91 116 99 116 120 Z';
const NECK = 'M49 66 H71 V90 Q60 96 49 90 Z';

// ===== KSZTAŁT TWARZY =====
const HEADS = {
    oval: { name: 'Owalna', rarity: 'common', d: 'M40 52 A20 24 0 1 0 80 52 A20 24 0 1 0 40 52 Z' },
    pointed: { name: 'Szpiczasta', rarity: 'common', d: 'M40 50 C40 32 49 26 60 26 C71 26 80 32 80 50 C80 62 70 74 60 82 C50 74 40 62 40 50 Z' },
    square: { name: 'Kwadratowa', rarity: 'common', d: 'M40 38 Q40 28 50 28 H70 Q80 28 80 38 V62 Q80 76 70 76 H50 Q40 76 40 62 Z' },
    round: { name: 'Okrągła', rarity: 'common', d: 'M37 54 A23 23 0 1 0 83 54 A23 23 0 1 0 37 54 Z' },
    long: { name: 'Długa', rarity: 'rare', d: 'M43 50 C43 32 50 24 60 24 C70 24 77 32 77 50 C77 68 70 80 60 80 C50 80 43 68 43 50 Z' }
};

// ===== UBRANIE (torso = zamiennik domyślnych ramion; back = pod głową; front = nad głową) =====
const BODIES = {
    plain: { name: 'Sweter', rarity: 'common', back: () => '', front: () => '' },
    suit: {
        name: 'Garnitur', rarity: 'common', back: () => '',
        front: c => P('M49 87 L60 108 L71 87 Z', '#cfd3dc')
            + L('M36 92 L49 88 L60 110 L52 120', INK3, 1.6) + L('M84 92 L71 88 L60 110 L68 120', INK3, 1.6)
            + P('M56.5 88 H63.5 L62.5 93 H57.5 Z', c, { opacity: .85 }) + P('M57.5 93 H62.5 L65 111 L60 116 L55 111 Z', c)
    },
    hoodie: {
        name: 'Bluza', rarity: 'common',
        back: c => rim('M33 92 C33 76 46 70 60 70 C74 70 87 76 87 92 Z', INK2, c, 1.2),
        front: c => L('M54 97 L52 113', INK4, 1.5) + L('M66 97 L68 113', INK4, 1.5) + C(52, 114, 1.8, c) + C(68, 114, 1.8, c)
    },
    turtle: {
        name: 'Golf', rarity: 'common', back: () => '',
        front: () => P('M45 72 H75 V92 Q60 98 45 92 Z', INK2) + L('M46 78 H74 M46 84 H74 M46 90 Q60 95 74 90', INK3, 1.3)
    },
    trench: {
        name: 'Prochowiec', rarity: 'rare', back: () => '',
        front: c => rimPair('M26 106 L31 80 L44 64 L58 90 L51 108 Z', INK2, c)
            + L('M60 104 V120', INK3, 1.6) + C(55, 112, 1.5, INK4) + C(65, 112, 1.5, INK4)
    },
    scarf: {
        name: 'Szalik', rarity: 'rare', back: () => '',
        front: c => P('M38 86 Q60 100 82 86 L84 98 Q60 114 36 98 Z', c) + P('M62 98 L75 101 L72 118 L59 116 Z', c, { opacity: .85 })
            + L('M62 106 L74 108.5 M61 112 L73 114.5', INK, 1.4, { opacity: .35 })
    },
    burglar: {
        name: 'Włamywacz', rarity: 'epic', back: () => '', front: () => '',
        torso: c => {
            let stripes = '';
            for (let y = 92; y < 120; y += 8) stripes += R(0, y, 120, 4, INK);
            return rim(SHOULDERS, '#d8dbe3', c, 1.5) + `<defs><clipPath id="tc"><path d="${SHOULDERS}"/></clipPath></defs><g clip-path="url(#tc)">${stripes}</g>`;
        }
    },
    cape: {
        name: 'Peleryna', rarity: 'epic',
        torso: (c, ctx) => rim('M0 120 C2 98 20 88 40 84 L80 84 C100 88 118 98 120 120 Z', shade(ctx.t, .42), c, 1.5),
        back: () => '',
        front: (c, ctx) => rimPair('M36 84 L52 98 L48 108 L28 92 Z', shade(ctx.t, .62), c, 1.2) + P('M52 98 L60 104 L68 98 L66 110 L60 116 L54 110 Z', shade(ctx.t, .3))
    }
};

// ===== NAKRYCIE GŁOWY =====
const GEAR = {
    bald: { name: 'Łysy', rarity: 'common', front: () => E(52, 36, 7, 3, '#fff', { opacity: .07 }) },
    beanie: {
        name: 'Czapka', rarity: 'common',
        front: c => rim('M40 44 C37 24 48 14 60 14 C72 14 83 24 80 44 Z', INK, c)
            + rim('M38 36 H82 V48 H38 Z', INK2, c, 1.2)
            + L('M44 37 V47 M50 37 V47 M56 37 V47 M62 37 V47 M68 37 V47 M74 37 V47', INK3, 1.2) + R(38, 41.5, 44, 2.2, c)
    },
    slick: {
        name: 'Zaczes', rarity: 'common',
        front: c => rim('M40 48 C37 30 46 20 60 20 C76 20 84 30 80 48 C77 38 70 33 58 34 C49 35 43 40 40 48 Z', INK, c) + L('M47 28 C56 23 68 24 75 31', INK4, 1.6)
    },
    cap: {
        name: 'Płaska czapka', rarity: 'rare',
        front: c => rim('M37 46 C35 30 46 22 62 22 C78 22 87 32 85 46 Z', INK, c)
            + rim('M37 46 H85 C86 51 78 54 61 54 C46 54 38 52 37 46 Z', INK2, c, 1.2) + C(62, 22, 2.2, INK3) + L('M62 24 L62 46', INK3, 1.2)
    },
    fedora: {
        name: 'Kapelusz', rarity: 'rare',
        front: c => rim('M21 42 C21 34 40 31 60 31 C80 31 99 34 99 42 C99 49 80 52 60 52 C40 52 21 49 21 42 Z', INK, c)
            + rim('M41 42 C39 26 47 15 60 15 C73 15 81 26 79 42 Z', INK, c)
            + P('M40.4 34 C48 37 72 37 79.6 34 L79.2 42 C72 45 48 45 40.8 42 Z', c) + L('M53 17 Q60 23 67 17', INK3, 1.6)
    },
    bowler: {
        name: 'Melonik', rarity: 'rare',
        front: c => rim('M30 44 C30 40 45 39 60 39 C75 39 90 40 90 44 C90 49 75 51 60 51 C45 51 30 49 30 44 Z', INK, c)
            + rim('M41 44 C38 22 49 12 60 12 C71 12 82 22 79 44 Z', INK, c) + P('M40.4 38 C48 41 72 41 79.6 38 L79.2 44 C72 47 48 47 40.8 44 Z', c)
    },
    beret: {
        name: 'Beret', rarity: 'rare',
        front: (c, ctx) => rim('M32 42 C28 28 46 20 66 22 C88 24 94 38 84 46 C70 50 46 50 32 42 Z', shade(ctx.t, .8), c) + L('M62 22 L66 14', INK3, 2.4) + L('M40 32 C48 27 60 26 70 28', '#fff', 1.6, { opacity: .3 })
    },
    tophat: {
        name: 'Cylinder', rarity: 'epic',
        front: c => rim('M26 39 C26 34 94 34 94 39 C94 45 26 45 26 39 Z', INK, c)
            + rim('M41 39 L44 9 H76 L79 39 Z', INK, c) + P('M42 32 H78 L78.6 39 H41.4 Z', c)
    },
    hood: {
        name: 'Kaptur', rarity: 'epic', noHead: true,
        back: c => rim('M16 120 C14 84 26 44 46 26 C52 20 56 15 60 11 C64 15 68 20 74 26 C94 44 106 84 104 120 Z', INK, c)
            + E(60, 57, 19, 25, '#050608') + E(60, 57, 19, 25, 'none', { stroke: INK3, 'stroke-width': 1.5 })
            + L('M30 96 C30 80 34 70 40 62 M90 96 C90 80 86 70 80 62', INK2, 1.6),
        front: () => ''
    },
    balaclava: {
        name: 'Kominiarka', rarity: 'epic', noMask: true,
        front: c => rim('M37 54 C37 30 48 25 60 25 C72 25 83 30 83 54 C83 71 72 80 60 80 C48 80 37 71 37 54 Z', INK, c)
            + R(40, 49, 40, 13, FACE, { rx: 6 })
            + L('M44 30 V47 M52 27 V47 M60 26 V47 M68 27 V47 M76 30 V47 M46 64 V78 M54 66 V80 M62 66 V80 M70 66 V78', INK2, 1.2)
    }
};

// ===== OCZY =====
const EYES = {
    slit: { name: 'Szparki', rarity: 'common', svg: c => pair(() => glowFill('M40 55 Q49 53 58 60 Q48 62 40 59 Z', c)) },
    dots: { name: 'Kropki', rarity: 'common', svg: c => pair(() => glowDot(50, 56, 4.2, c)) },
    round: { name: 'Okrągłe', rarity: 'common', svg: c => pair(() => C(50, 56, 9, c, { opacity: .18 }) + C(50, 56, 7, 'none', { stroke: c, 'stroke-width': 1.8 }) + C(50, 56, 3, c)) },
    sleepy: { name: 'Zmrużone', rarity: 'common', svg: c => pair(() => glowFill('M43 57 H57 A7 6 0 0 1 43 57 Z', c) + R(41, 54.6, 18, 2.8, INK)) },
    angry: { name: 'Groźne', rarity: 'rare', svg: c => pair(() => glowDot(50, 57, 3.8, c) + L('M40 50 L58 55', INK4, 3.2) + L('M40 50 L58 55', c, 1.1, { opacity: .7 })) },
    wide: { name: 'Wielkie', rarity: 'rare', svg: c => pair(() => C(50, 55, 8.5, c, { opacity: .2 }) + C(50, 55, 6.4, c) + C(50, 55, 2.1, INK) + C(48, 53, 1.3, '#fff')) },
    cat: { name: 'Kocie', rarity: 'rare', svg: c => pair(() => E(50, 56, 7, 5.5, c, { opacity: .3 }) + E(50, 56, 5.5, 4.4, c) + R(48.8, 50.5, 2.4, 11, INK, { rx: 1.2 })) },
    shades: {
        name: 'Okulary', rarity: 'rare',
        svg: c => pair(() => P('M39 52 H57 Q58 63 52 64.5 Q43 65 40 58 Z', INK) + L('M39 52 H57 Q58 63 52 64.5 Q43 65 40 58 Z', INK4, 1.4)
            + L('M43 55.5 L50 53.5 M45 60 L53 55', '#fff', 1.3, { opacity: .55 })) + L('M57 54 Q60 52.5 63 54', INK4, 1.6) + C(54.5, 53.4, 1.2, c)
    },
    goggles: {
        name: 'Noktowizor', rarity: 'epic',
        svg: c => L('M30 56 H40 M80 56 H90', INK4, 3)
            + pair(() => C(50, 56, 10, INK3) + C(50, 56, 7.5, c, { opacity: .35 }) + C(50, 56, 7.5, 'none', { stroke: c, 'stroke-width': 1.6 }) + C(47.5, 53.5, 2, '#fff', { opacity: .9 })) + R(58, 54.5, 4, 3, INK3)
    },
    monocle: {
        name: 'Monokl', rarity: 'epic',
        svg: c => glowDot(50, 56, 4.2, c) + C(70, 56, 8, 'none', { stroke: '#d4af37', 'stroke-width': 1.8 }) + glowDot(70, 56, 3.6, c) + L('M77 61 C84 70 82 82 76 92', '#d4af37', 1.1, { opacity: .8 })
    },
    patch: {
        name: 'Przepaska', rarity: 'epic',
        svg: c => glowDot(50, 56, 4.2, c) + L('M38 48 L82 62', INK4, 1.6)
            + P('M63 50 H77.5 Q80 50 80 53 V60 Q80 64 76 64 H66 Q62 64 62 60 V53 Q62 50 63 50 Z', INK, { stroke: INK4, 'stroke-width': 1.2 })
    },
    cyclops: {
        name: 'Cyklop', rarity: 'epic', animated: true,
        svg: (c, ctx) => {
            motion(ctx, '.cy{animation:cy 4s ease-in-out infinite}@keyframes cy{0%,100%{transform:translateX(0)}30%{transform:translateX(-4px)}65%{transform:translateX(4px)}}');
            return glowFill('M48 56 A12 7.5 0 1 0 72 56 A12 7.5 0 1 0 48 56 Z', c) + `<g class="cy">${R(58.6, 49, 2.8, 14, INK, { rx: 1.4 })}</g>`;
        }
    },
    visor: {
        name: 'Wizjer', rarity: 'legendary', animated: true,
        svg: (c, ctx) => {
            motion(ctx, '.vs{animation:vs 2.6s ease-in-out infinite}@keyframes vs{0%,100%{transform:translateX(-34px)}50%{transform:translateX(0)}}');
            return P('M38 52 H82 Q85 52 85 55 V59 Q85 62 82 62 H38 Q35 62 35 59 V55 Q35 52 38 52 Z', INK)
                + glowLine('M40 57 H80', c, 3.2) + `<g class="vs">${C(76, 57, 2.4, '#fff', { opacity: .95 })}${C(76, 57, 5, '#fff', { opacity: .2 })}</g>`;
        }
    }
};
const EYES_SIMPLE = new Set(['dots', 'round', 'slit', 'cat', 'wide', 'angry', 'sleepy']);   // te oczy rysują się w otworach maski

// ===== DOLNA CZĘŚĆ TWARZY =====
const MOUTHS = {
    none: { name: 'Brak', rarity: 'common', svg: () => '' },
    line: { name: 'Kreska', rarity: 'common', svg: () => L('M52 69 H68', INK4, 1.8) },
    smirk: { name: 'Uśmieszek', rarity: 'common', svg: c => glowLine('M51 69 Q61 73 70 66', c, 1.6) },
    mustache: {
        name: 'Wąsy', rarity: 'rare',
        svg: () => P('M60 64 C54 60 46 62 45 68 C50 66 55 67 60 68 C65 67 70 66 75 68 C74 62 66 60 60 64 Z', INK) + L('M47 64.6 C52 62 56 63 60 65', '#fff', 1, { opacity: .25 })
    },
    bandana: {
        name: 'Chusta', rarity: 'rare',
        svg: c => P('M40 62 Q60 70 80 62 L79 70 Q71 87 60 87 Q49 87 41 70 Z', INK3) + L('M40 62 Q60 70 80 62', c, 1.6, { opacity: .9 })
            + C(52, 74, 1.4, c, { opacity: .8 }) + C(60, 79, 1.4, c, { opacity: .8 }) + C(68, 74, 1.4, c, { opacity: .8 })
    },
    grin: {
        name: 'Szeroki uśmiech', rarity: 'epic',
        svg: c => {
            let teeth = '';
            for (let i = 1; i <= 6; i++) {
                const t = i / 7, x = 45 + 30 * t, y = 64 + 18 * t * (1 - t);
                teeth += L(`M${x.toFixed(1)} ${(y + 0.6).toFixed(1)} V${(y - 3.4).toFixed(1)}`, c, 1.1, { opacity: .9 });
            }
            return glowLine('M45 64 Q60 79 75 64', c, 1.8) + teeth;
        }
    }
};
const MOUTH_DEAD = { svg: () => '' };

// ===== MASKI: maska = kształt + otwory na oczy; oczy rysują się w otworach =====
const MASKS = {
    none: { name: 'Brak', rarity: 'common' },
    domino: {
        name: 'Domino', rarity: 'rare', covers: 'eyes',
        shape: 'M29 52 C35 44 48 45 60 50 C72 45 85 44 91 52 C93 62 83 69 72 65 C67 63 63 60 60 60 C57 60 53 63 48 65 C37 69 27 62 29 52 Z',
        holes: [{ cx: 50, cy: 56.5, rx: 7, ry: 4.6, rot: -10 }],
        front: (c, t) => C(33, 53.5, 1.5, t) + C(87, 53.5, 1.5, t) + L('M37 49.5 Q46 47 54 52', '#fff', 1.3, { opacity: .35 })
    },
    venetian: {
        name: 'Wenecka', rarity: 'rare', covers: 'eyes',
        shape: 'M25 40 C31 51 44 47 53 53 C57 55 58.5 56.5 60 56.5 C61.5 56.5 63 55 67 53 C76 47 89 51 95 40 C98 60 88 74 74 71 C67 69 63.5 65 60 65 C56.5 65 53 69 46 71 C32 74 22 60 25 40 Z',
        holes: [{ cx: 49, cy: 58.5, rx: 7.5, ry: 4.8, rot: -16 }],
        front: (c, t) => P('M60 43 L65.5 50 L60 57 L54.5 50 Z', t, { stroke: INK, 'stroke-width': 1.8, 'stroke-linejoin': 'round' }) + pair(() => L('M30 47 Q35 57 43 54', t, 1.6))
    },
    cat: {
        name: 'Kot', rarity: 'epic', covers: 'full',
        shape: 'M36 52 C36 40 48 36 60 36 C72 36 84 40 84 52 C84 66 72 74 60 74 C48 74 36 66 36 52 Z',
        holes: [{ cx: 50, cy: 55, rx: 6.6, ry: 4.8, rot: -20 }],
        ears: 'M37 46 L34 24 L53 38 Z',
        front: () => P('M56.5 62 H63.5 L60 66.5 Z', INK) + L('M60 66.5 V69 M60 69 Q55 73 51 70 M60 69 Q65 73 69 70', INK, 1.8)
            + pair(() => L('M32 62 L42 63 M32 68 L42 66.5', INK, 1.4))
    },
    theater: {
        name: 'Teatralna', rarity: 'epic', covers: 'full',
        shape: 'M36 32 C36 25 84 25 84 32 C86 54 84 72 76 82 C70 90 50 90 44 82 C36 72 34 54 36 32 Z',
        holes: [{ cx: 50, cy: 55, rx: 6.4, ry: 3.8, rot: -20 }],
        front: (c, t) => P('M44 69 Q60 88 76 69 Q60 76 44 69 Z', INK) + pair(() => L('M40 46 Q47 42 55 47', INK, 2.4)) + C(42, 65, 3.6, t, { opacity: .55 }) + C(78, 65, 3.6, t, { opacity: .55 })
    },
    ski: {
        name: 'Kominiarka', rarity: 'epic', covers: 'full', fabric: true,
        shape: 'M35 54 C35 33 46 27 60 27 C74 27 85 33 85 54 C85 73 74 84 60 84 C46 84 35 73 35 54 Z',
        slot: 'M39 49 H81 Q83 49 83 51 V62 Q83 64 81 64 H39 Q37 64 37 62 V51 Q37 49 39 49 Z',
        holes: [{ cx: 50, cy: 56.5, rx: 6.2, ry: 4.6, rot: 0, hidden: true }],
        front: () => L('M40 30 V47 M48 28 V47 M56 27 V47 M64 27 V47 M72 28 V47 M80 30 V47 M42 66 V80 M50 66 V83 M58 66 V84 M66 66 V84 M74 66 V82', INK, 1.3, { opacity: .35 })
    },
    bag: {
        name: 'Torba', rarity: 'epic', covers: 'full', kraft: true,
        shape: 'M33 30 L41 25 L49 30 L60 24 L71 30 L79 25 L87 30 L89 84 Q60 90 31 84 Z',
        holes: [{ cx: 50, cy: 54, rx: 6, ry: 5, rot: 0 }],
        front: () => L('M47 72 Q60 66 73 72', INK, 2.6) + L('M33 30 L41 36 L49 30 M60 24 V34 M71 30 L79 36 L87 30', INK, 1.4, { opacity: .35 })
    },
    gas: {
        name: 'Maska gazowa', rarity: 'legendary', covers: 'full',
        shape: 'M34 38 C34 31 86 31 86 38 L87 62 C87 78 74 88 60 88 C46 88 33 78 33 62 Z',
        holes: [{ cx: 49, cy: 56, rx: 9.5, ry: 9.5, ring: true }],
        back: () => L('M33 48 H18 M87 48 H102 M33 64 H18 M87 64 H102', INK, 4.6) + L('M33 48 H18 M87 48 H102 M33 64 H18 M87 64 H102', INK3, 2),
        front: () => P('M52 76 H68 V86 Q68 91 60 91 Q52 91 52 86 Z', INK3, { stroke: INK, 'stroke-width': 2.2, 'stroke-linejoin': 'round' }) + L('M55 79 V88 M60 79 V89 M65 79 V88', INK, 1.4)
    },
    beak: {
        name: 'Dziób', rarity: 'legendary', covers: 'full',
        shape: 'M45 46 C45 38 75 38 75 46 L73 58 C71 70 65 84 60 98 C55 84 49 70 47 58 Z',
        holes: [{ cx: 51, cy: 51, rx: 6, ry: 6, ring: true }],
        back: () => L('M45 50 H34 M75 50 H86', INK, 3.4),
        front: () => L('M60 58 V90', INK, 1.4, { opacity: .35 })
    }
};

// Oczy wewnątrz otworu maski (lewy otwór opisany, prawy to jego odbicie)
function holeEye(id, h, c) {
    const r = Math.min(h.rx, h.ry);
    const g = inner => `<g transform="rotate(${h.rot || 0} ${h.cx} ${h.cy})">${inner}</g>`;
    switch (id) {
        case 'round': return g(C(h.cx, h.cy, r * .95, 'none', { stroke: c, 'stroke-width': 1.4 }) + C(h.cx, h.cy, r * .45, c));
        case 'slit': return g(glowFill(`M${h.cx - h.rx + 1} ${h.cy} Q${h.cx} ${h.cy - h.ry + .8} ${h.cx + h.rx - 1} ${h.cy} Q${h.cx} ${h.cy + h.ry * .55} ${h.cx - h.rx + 1} ${h.cy} Z`, c));
        case 'cat': return g(E(h.cx, h.cy, h.rx * .8, h.ry * .85, c) + R(h.cx - 1, h.cy - h.ry * .85, 2, h.ry * 1.7, INK, { rx: 1 }));
        case 'wide': return g(E(h.cx, h.cy, h.rx * .85, h.ry * .85, '#fff') + C(h.cx, h.cy, r * .4, INK));
        case 'angry': return g(glowDot(h.cx, h.cy + .5, r * .6, c)) + L(`M${h.cx - h.rx} ${h.cy - h.ry - 1} L${h.cx + h.rx} ${h.cy - h.ry + 2}`, INK, 2.2);
        case 'sleepy': return g(P(`M${h.cx - h.rx * .8} ${h.cy + 1} H${h.cx + h.rx * .8} A${h.rx * .8} ${h.ry * .9} 0 0 1 ${h.cx - h.rx * .8} ${h.cy + 1} Z`, c));
        case 'dead': return g(L(`M${h.cx - 2.6} ${h.cy - 2.6} L${h.cx + 2.6} ${h.cy + 2.6} M${h.cx + 2.6} ${h.cy - 2.6} L${h.cx - 2.6} ${h.cy + 2.6}`, '#fff', 1.8));
        default: return g(glowDot(h.cx, h.cy, r * .62, c));
    }
}

// ===== DODATKI =====
const EXTRAS = {
    none: { name: 'Nic', rarity: 'common', front: () => '' },
    badge: {
        name: 'Odznaka', rarity: 'common',
        front: c => P('M34 104 L36.4 109 L41.8 109.7 L37.8 113.4 L38.9 118.7 L34 116 L29.1 118.7 L30.2 113.4 L26.2 109.7 L31.6 109 Z', c)
    },
    earpiece: {
        name: 'Słuchawka', rarity: 'rare',
        front: c => R(78, 52, 5, 10, INK3, { rx: 2 }) + C(80.5, 55, 1.2, c) + L('M81 62 C86 72 80 82 74 90 C70 96 66 98 62 100', INK4, 1.5)
    },
    headset: {
        name: 'Zestaw', rarity: 'rare',
        front: c => L('M40 58 C36 28 84 28 80 58', INK3, 3) + R(34, 54, 8, 13, INK3, { rx: 3 }) + C(38, 60.5, 1.6, c) + L('M38 67 C38 76 46 80 54 77', INK3, 1.6) + C(55, 77, 2.4, c)
    },
    scar: {
        name: 'Blizna', rarity: 'rare',
        front: () => L('M72 38 L58 72', INK4, 1.6) + L('M69 46 L74 48 M66 54 L71 56 M63 62 L68 64', INK4, 1.2)
    },
    disguise: {
        name: 'Przebranie', rarity: 'epic',
        front: c => pair(() => C(50, 56, 10.5, 'none', { stroke: c, 'stroke-width': 2.4 })) + L('M60.5 55 H59.5', c, 2.4) + E(60, 64, 4.6, 3.6, c)
            + P('M60 68 C53 63 43 66 43 73 C49 70 55 71 60 72.5 C65 71 71 70 77 73 C77 66 67 63 60 68 Z', INK) + L('M45 69 C50 66.5 55 67 60 69', '#fff', 1, { opacity: .3 })
    },
    antenna: {
        name: 'Antena', rarity: 'legendary', animated: true,
        front: (c, ctx) => {
            motion(ctx, '.an{animation:an 1.6s ease-in-out infinite}@keyframes an{0%,100%{opacity:.25}50%{opacity:1}}');
            return L('M60 16 V6', INK4, 1.6) + C(60, 5, 2.6, c) + `<g class="an">${C(60, 5, 7.6, c, { opacity: .3 })}${C(60, 5, 5, c, { opacity: .35 })}</g>`;
        }
    }
};

// ===== TŁA =====
const BGS = {
    dark: {
        name: 'Ciemne', rarity: 'common',
        svg: () => `<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c1f27"/><stop offset="1" stop-color="#0d0f13"/></linearGradient></defs>` + R(0, 0, 120, 120, 'url(#bg)')
    },
    blinds: {
        name: 'Żaluzje', rarity: 'common',
        svg: c => { let s = R(0, 0, 120, 120, BG); for (let x = 0; x < 200; x += 16) s += P(`M${x} 0 H${x + 7} L${x + 7 - 34} 120 H${x - 34} Z`, c, { opacity: .11 }); return s; }
    },
    grid: {
        name: 'Celownik', rarity: 'common',
        svg: c => {
            let s = R(0, 0, 120, 120, BG);
            for (let i = 15; i < 120; i += 15) s += L(`M${i} 0 V120 M0 ${i} H120`, '#fff', .8, { opacity: .06 });
            return s + C(60, 60, 44, 'none', { stroke: c, 'stroke-width': 1.4, opacity: .4 }) + L('M60 8 V22 M60 98 V112 M8 60 H22 M98 60 H112', c, 1.4, { opacity: .55 });
        }
    },
    spot: {
        name: 'Reflektor', rarity: 'common',
        svg: c => `<defs><radialGradient id="bg" cx="0.5" cy="0" r="0.9"><stop offset="0" stop-color="${c}" stop-opacity=".5"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient></defs>` + R(0, 0, 120, 120, BG) + P('M44 0 H76 L116 120 H4 Z', 'url(#bg)')
    },
    stripes: {
        name: 'Pasy', rarity: 'common',
        svg: (c, ctx) => { let s = R(0, 0, 120, 120, shade(ctx.t, .35)); for (let x = -40; x < 140; x += 24) s += P(`M${x} 0 h12 l-40 120 h-12 Z`, shade(ctx.t, .5)); return s; }
    },
    dots: {
        name: 'Kropki', rarity: 'common',
        svg: (c, ctx) => { let s = R(0, 0, 120, 120, shade(ctx.t, .3)); for (let y = 8; y < 120; y += 16) for (let x = 8 + (y / 16 % 2) * 8; x < 120; x += 16) s += C(x, y, 3.4, shade(ctx.t, .55)); return s; }
    },
    blueprint: {
        name: 'Plan', rarity: 'rare',
        svg: () => {
            let s = R(0, 0, 120, 120, '#0e2a4d');
            for (let i = 10; i < 120; i += 10) s += L(`M${i} 0 V120 M0 ${i} H120`, '#5d9be0', i % 50 ? .6 : 1.2, { opacity: i % 50 ? .22 : .4 });
            return s + C(60, 60, 36, 'none', { stroke: '#8fc1ff', 'stroke-width': 1, opacity: .4, 'stroke-dasharray': '3 4' });
        }
    },
    redacted: {
        name: 'Zaczernione', rarity: 'rare',
        svg: () => {
            let s = R(0, 0, 120, 120, '#1a1b20'), seed = 5;
            const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
            for (let y = 8; y < 120; y += 14) {
                if ((y / 14) % 2) s += R(8 + rnd() * 10, y, 40 + rnd() * 50, 8, '#000');
                else for (let x = 8; x < 108;) { const w = 10 + rnd() * 22; s += R(x, y + 3, w, 2.4, '#3a3d46'); x += w + 5; }
            }
            return s;
        }
    },
    print: {
        name: 'Odcisk palca', rarity: 'rare',
        svg: c => {
            let s = R(0, 0, 120, 120, BG);
            for (let i = 0; i < 12; i++) {
                const r = 6 + i * 4.8, gap = 8 + (i % 3) * 5;
                s += E(60, 62, r * .86, r, 'none', { stroke: c, 'stroke-width': 1.7, opacity: .22, 'stroke-dasharray': `${20 + i * 3} ${gap}`, transform: `rotate(${i * 25} 60 62)` });
            }
            return s;
        }
    },
    curtain: {
        name: 'Kurtyna', rarity: 'rare',
        svg: (c, ctx) => {
            let s = R(0, 0, 120, 120, shade(ctx.t, .28));
            for (let x = 0; x < 120; x += 20) s += P(`M${x} 0 H${x + 10} Q${x + 14} 60 ${x + 10} 120 H${x} Q${x + 4} 60 ${x} 0 Z`, shade(ctx.t, .5), { opacity: .9 });
            return s + `<defs><radialGradient id="bg" cx=".5" cy=".35" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></radialGradient></defs>` + R(0, 0, 120, 120, 'url(#bg)') + R(0, 0, 120, 10, shade(ctx.t, .35));
        }
    },
    harlequin: {
        name: 'Romby', rarity: 'rare',
        svg: (c, ctx) => { let s = R(0, 0, 120, 120, '#15171e'); for (let y = 0; y < 130; y += 20) for (let x = (y / 20 % 2) * 10; x < 130; x += 20) s += P(`M${x} ${y - 10} L${x + 10} ${y} L${x} ${y + 10} L${x - 10} ${y} Z`, shade(ctx.t, .42)); return s; }
    },
    sun: {
        name: 'Promienie', rarity: 'rare',
        svg: (c, ctx) => {
            let s = R(0, 0, 120, 120, shade(ctx.t, .45));
            for (let i = 0; i < 16; i++) s += P(`M60 60 L${60 + 100 * Math.cos(i * Math.PI / 8)} ${60 + 100 * Math.sin(i * Math.PI / 8)} L${60 + 100 * Math.cos((i + .5) * Math.PI / 8)} ${60 + 100 * Math.sin((i + .5) * Math.PI / 8)} Z`, shade(ctx.t, .62));
            return s;
        }
    },
    city: {
        name: 'Miasto', rarity: 'epic',
        svg: c => {
            let s = `<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d1020"/><stop offset="1" stop-color="${c}" stop-opacity=".35"/></linearGradient></defs>` + R(0, 0, 120, 120, 'url(#bg)');
            s += C(94, 24, 9, '#f4f1de', { opacity: .9 });
            [[0, 74, 18], [16, 62, 16], [30, 80, 14], [76, 66, 18], [92, 78, 14], [104, 58, 16]].forEach(([x, y, w]) => {
                s += R(x, y, w, 120 - y, INK2);
                for (let wy = y + 6; wy < 112; wy += 9) for (let wx = x + 3; wx < x + w - 3; wx += 6) if ((wx * 7 + wy * 3) % 5 < 2) s += R(wx, wy, 2.6, 3.6, c, { opacity: .8 });
            });
            return s;
        }
    },
    confetti: {
        name: 'Konfetti', rarity: 'epic',
        svg: (c, ctx) => {
            let s = R(0, 0, 120, 120, '#171922'), seed = 3;
            const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
            const cols = [ctx.t, '#ffd93d', '#4fe3f5', '#ff5fd2', '#3ddc84'];
            for (let i = 0; i < 34; i++) s += R(rnd() * 116, rnd() * 116, 3 + rnd() * 3, 3 + rnd() * 3, cols[i % 5], { transform: `rotate(${Math.floor(rnd() * 90)} 60 60)`, opacity: .85 });
            return s;
        }
    },
    alarm: {
        name: 'Alarm', rarity: 'epic',
        svg: () => `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset=".5" stop-color="#7a1f26"/><stop offset=".5" stop-color="#1b3d78"/></linearGradient></defs>` + R(0, 0, 120, 120, 'url(#bg)')
    },
    neon: {
        name: 'Neon', rarity: 'epic',
        svg: () => `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5b2a86"/><stop offset=".5" stop-color="#1b2a6b"/><stop offset="1" stop-color="#0f6f6a"/></linearGradient></defs>` + R(0, 0, 120, 120, 'url(#bg)')
    },
    radar: {
        name: 'Radar', rarity: 'legendary', animated: true,
        svg: (c, ctx) => {
            motion(ctx, '.sw{animation:sw 6s linear infinite;transform-origin:60px 60px}@keyframes sw{to{transform:rotate(360deg)}}.bl{animation:bl 6s linear infinite}@keyframes bl{0%,100%{opacity:1}50%{opacity:.25}}');
            return R(0, 0, 120, 120, BG)
                + `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${c}" stop-opacity="0"/><stop offset="1" stop-color="${c}" stop-opacity=".45"/></linearGradient></defs>`
                + C(60, 60, 22, 'none', { stroke: c, 'stroke-width': 1, opacity: .28 }) + C(60, 60, 40, 'none', { stroke: c, 'stroke-width': 1, opacity: .28 }) + C(60, 60, 58, 'none', { stroke: c, 'stroke-width': 1, opacity: .28 })
                + L('M60 0 V120 M0 60 H120', c, 1, { opacity: .2 })
                + `<g class="sw">${P('M60 60 L120 30 A67 67 0 0 1 120 90 Z', 'url(#bg)', { transform: 'rotate(-40 60 60)' })}</g>`
                + `<g class="bl">${C(92, 34, 2.4, c)}${C(24, 88, 2, c, { opacity: .8 })}</g>`;
        }
    },
    cctv: {
        name: 'Monitoring', rarity: 'legendary', animated: true,
        svg: (c, ctx) => {
            motion(ctx, '.rc{animation:rc 1.4s steps(1) infinite}@keyframes rc{0%{opacity:1}50%{opacity:0}}');
            let s = R(0, 0, 120, 120, '#10141a');
            for (let y = 0; y < 120; y += 4) s += R(0, y, 120, 1.4, '#000', { opacity: .25 });
            s += L('M8 20 V8 H20 M100 8 H112 V20 M112 100 V112 H100 M20 112 H8 V100', '#fff', 2, { opacity: .55 });
            return s + `<g class="rc">${C(18, 17, 3.4, '#ff3b3b')}${C(18, 17, 6, '#ff3b3b', { opacity: .25 })}</g>`;
        }
    }
};

const CATALOG = { bg: BGS, body: BODIES, head: HEADS, gear: GEAR, eyes: EYES, mouth: MOUTHS, mask: MASKS, extra: EXTRAS };
const SLOTS = [
    { id: 'bg', name: 'Tło', kind: 'avatar' }, { id: 'body', name: 'Ubranie', kind: 'avatar' }, { id: 'head', name: 'Twarz', kind: 'avatar' },
    { id: 'gear', name: 'Nakrycie', kind: 'avatar' }, { id: 'eyes', name: 'Oczy', kind: 'avatar' }, { id: 'mouth', name: 'Buzia', kind: 'avatar' },
    { id: 'mask', name: 'Maska', kind: 'avatar' }, { id: 'extra', name: 'Dodatek', kind: 'avatar' }, { id: 'accent', name: 'Kolor', kind: 'swatch' }
];
const ORDER = SLOTS.map(slot => slot.id);
const DEFAULT_AVATAR = { bg: 'dark', body: 'suit', head: 'pointed', gear: 'fedora', eyes: 'slit', mouth: 'none', mask: 'none', extra: 'none', accent: 'green' };
const STATES = ['kicked', 'revealed'];

const isValid = (slot, value) => typeof value === 'string' && Object.hasOwn(slot === 'accent' ? ACCENTS : CATALOG[slot], value);

// Wygląd przysłany przez gracza; błędne części wracają do domyślnych
function clean(avatar) {
    const cleaned = {};
    ORDER.forEach(slot => {
        const value = avatar ? avatar[slot] : undefined;
        cleaned[slot] = isValid(slot, value) ? value : DEFAULT_AVATAR[slot];
    });
    return cleaned;
}

// Odkryty impostor traci przebranie: znikają nakrycie, maska i dodatki, zostają czerwone oczy i uśmiech
function revealedLook(cfg) {
    return { ...cfg, gear: 'bald', mask: 'none', extra: 'none', eyes: 'slit', mouth: 'grin', accent: 'red', bg: 'alarm' };
}

function maskSvg(mask, id, c, t, ctx, eyeId, cracked) {
    const fill = mask.kraft ? '#c9a56a' : mask.fabric ? shade(c, .45) : c;
    const holes = mask.holes;
    const holeShape = h => (h.ring ? C(h.cx, h.cy, h.rx, '#0e1015', { stroke: INK, 'stroke-width': 3 }) : E(h.cx, h.cy, h.rx, h.ry, INK, { transform: `rotate(${h.rot || 0} ${h.cx} ${h.cy})` }));
    const glint = h => (h.ring ? P(`M${h.cx - h.rx * .6} ${h.cy - h.rx * .2} A${h.rx * .7} ${h.rx * .7} 0 0 1 ${h.cx - h.rx * .1} ${h.cy - h.rx * .7}`, 'none', { stroke: '#fff', 'stroke-width': 1.6, 'stroke-linecap': 'round', opacity: .6 }) : '');
    const inHole = EYES_SIMPLE.has(eyeId) || eyeId === 'dead';

    const body = (mask.ears ? P(mask.ears, fill, { stroke: INK, 'stroke-width': 2.6, 'stroke-linejoin': 'round' }) + P(flipPath(mask.ears), fill, { stroke: INK, 'stroke-width': 2.6, 'stroke-linejoin': 'round' }) : '')
        + P(mask.shape, fill, { stroke: INK, 'stroke-width': 2.8, 'stroke-linejoin': 'round' })
        + `<defs><clipPath id="mk"><path d="${mask.shape}"/></clipPath></defs>`
        + `<g clip-path="url(#mk)">${E(44, 40, 30, 16, '#fff', { opacity: .16 })}${E(78, 92, 38, 20, '#000', { opacity: .14 })}</g>`
        + (mask.slot ? P(mask.slot, INK) : '');

    const holeSvg = pair(() => holes.map(h => (h.hidden ? '' : holeShape(h)) + (inHole ? holeEye(eyeId, h, c) : '') + glint(h)).join(''));
    const crack = cracked ? L('M68 28 L60 44 L68 54 L58 68 L64 90', INK, 2.4) + L('M69 28 L61 44 L69 54 L59 68 L65 90', '#fff', .9, { opacity: .5 }) : '';
    return { back: mask.back ? mask.back(c, t) : '', main: body + holeSvg + (mask.front ? mask.front(c, t) : '') + crack, inHole };
}

// options.still: awatar bez ruchu (dla osób z włączonym "ogranicz ruch" w systemie)
function render(input, state, options = {}) {
    const cfg = clean(input);
    const look = state === 'revealed' ? revealedLook(cfg) : cfg;
    const kicked = state === 'kicked';

    const c = ACCENTS[look.accent].hex;
    const ctx = { c, t: trimOf(c), anim: !state && !options.still, css: [] };
    const body = BODIES[look.body], shape = HEADS[look.head], bg = BGS[look.bg], mouth = MOUTHS[look.mouth], extra = EXTRAS[look.extra];
    let gear = GEAR[look.gear];
    const mask = MASKS[look.mask];
    if (mask.shape && gear.noMask) gear = GEAR.bald;       // kominiarka i maska nie mieszczą się na jednej głowie
    const eyeId = kicked ? 'dead' : look.eyes;
    const eyes = kicked ? { svg: c0 => pair(() => glowLine('M44 51 L56 61 M56 51 L44 61', c0, 2.4)) } : EYES[look.eyes];

    const m = mask.shape ? maskSvg(mask, look.mask, c, ctx.t, ctx, eyeId, kicked) : null;
    const head = gear.noHead ? '' : rim(shape.d, FACE, c, 1.4);
    const lowerFace = mask.covers === 'full' ? '' : mouth.svg(c, ctx);
    // oczy: w otworach maski albo zwykłe nad twarzą
    const eyesSvg = m && m.inHole ? '' : eyes.svg(c, ctx);

    const picture = bg.svg(c, ctx)
        + body.back(c, ctx) + (gear.back ? gear.back(c, ctx) : '')
        + (body.torso ? body.torso(c, ctx) : rim(SHOULDERS, INK, c, 1.5)) + P(NECK, INK2)
        + head
        + (m ? m.back : '') + lowerFace + (m ? m.main : '') + eyesSvg
        + gear.front(c, ctx) + extra.front(c, ctx) + body.front(c, ctx)
        + `<defs><radialGradient id="av" cx=".5" cy=".5" r=".75"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></radialGradient></defs><rect width="120" height="120" fill="url(#av)"/>`;

    // Ruch (CSS) dopisują same części podczas rysowania, więc składamy go na końcu
    const style = ctx.css.length ? `<style>@media (prefers-reduced-motion: no-preference){${ctx.css.join('')}}</style>` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" fill="none"${kicked ? ' style="filter:grayscale(.85) brightness(.85)"' : ''}>${style}${picture}</svg>`;
}

// GET /avatar/agent/:bg/:body/:head/:gear/:eyes/:mouth/:mask/:extra/:accent[?state=kicked|revealed][&motion=off]
const ROUTE = '/avatar/agent/' + ORDER.map(slot => ':' + slot).join('/');

function send(req, res) {
    for (const slot of ORDER) if (!isValid(slot, req.params[slot])) return res.sendStatus(404);
    const state = STATES.includes(req.query.state) ? req.query.state : undefined;
    res.set({ 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=3600' });
    res.send(render(req.params, state, { still: req.query.motion === 'off' }));
}

// Katalog dla klienta (panel personalizacji): nazwy, rzadkości i kolory kafelków
function catalog() {
    const parts = {};
    ORDER.forEach(slot => {
        parts[slot] = slot === 'accent'
            ? Object.entries(ACCENTS).map(([id, a]) => ({ id, name: a.name, rarity: 'common', css: a.hex }))
            : Object.entries(CATALOG[slot]).map(([id, item]) => ({ id, name: item.name, rarity: item.rarity, ...(item.animated ? { animated: true } : {}) }));
    });
    return { id: 'agent', name: 'Agenci', slots: SLOTS, parts };
}

module.exports = {
    id: 'agent', name: 'Agenci', ROUTE, ORDER, DEFAULT_AVATAR, clean, render, send, catalog,
    // pomoc dla narzędzi deweloperskich (arkusze podglądowe, walidacja)
    dev: {
        title: 'Agenci', SLOTS: ORDER.filter(slot => slot !== 'accent'), base: DEFAULT_AVATAR,
        PARTS: Object.fromEntries(ORDER.map(slot => [slot, slot === 'accent' ? Object.keys(ACCENTS) : Object.keys(CATALOG[slot])])),
        NAMES: Object.fromEntries(ORDER.map(slot => [slot, Object.fromEntries((slot === 'accent' ? Object.entries(ACCENTS) : Object.entries(CATALOG[slot])).map(([id, item]) => [id, item.name]))])),
        render: cfg => render(cfg), renderKicked: cfg => render(cfg, 'kicked'), renderRevealed: cfg => render(cfg, 'revealed'),
        random(seed) {
            let s = seed >>> 0;
            const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
            const cfg = {};
            ORDER.forEach(slot => {
                const ids = slot === 'accent' ? Object.keys(ACCENTS) : Object.keys(CATALOG[slot]);
                cfg[slot] = ids[Math.floor(rnd() * ids.length)];
            });
            return cfg;
        }
    }
};
