'use strict';

// ZESTAW "IMPOSTORZY": głowy w stylu Bottts Neutral (cały kafelek to głowa w jaskrawym kolorze, żeby graczy
// dało się odróżnić na pierwszy rzut oka), ale oczy, buzie i nakrycia głowy są szpiegowskie.
// Wszystko rysowane od zera. Część = jeden wpis w odpowiednim katalogu niżej.
//
// Stany: kicked - oczy z krzyżykami i wyblakłe barwy; revealed - impostor zrzuca przebranie
// (znika nakrycie, oczy robią się czerwone, buzia pokazuje kły). Części stanów nie są w katalogu.

const { BACKGROUND_COLORS, SPECIAL_BACKGROUNDS, specialBackgroundSvg, specialBackgroundCss } = require('./backgrounds');

const INK = '#141414';
const COLOR_PATTERN = /^[0-9a-f]{6}$/;

const attrs = o => Object.entries(o).map(([k, v]) => ` ${k}="${v}"`).join('');
const P = (d, fill, o = {}) => `<path d="${d}" fill="${fill}"${attrs(o)}/>`;
const C = (cx, cy, r, fill, o = {}) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"${attrs(o)}/>`;
const R = (x, y, w, h, fill, o = {}) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${attrs(o)}/>`;
const L = (d, stroke, w, o = {}) => `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${attrs(o)}/>`;

const range = (from, to, step) => Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);

// ===== wzory głowy: półprzezroczysta ciemna warstwa na kolorze =====
const PATTERNS = {
    dots: { name: 'Kropki', rarity: 'common', draw: () => range(0, 5, 1).flatMap(row => range(0, 5, 1).map(col => C(10 + col * 20 + (row % 2) * 10, 10 + row * 20, 4, '#000', { opacity: .15 }))).join('') },
    stripes: { name: 'Paski', rarity: 'common', draw: () => range(0, 240, 20).map(x => L(`M${x} -4L${x - 124} 124`, '#000', 7, { opacity: .12 })).join('') },
    grid: { name: 'Siatka', rarity: 'common', draw: () => range(20, 100, 20).map(v => L(`M${v} 0V120M0 ${v}H120`, '#000', 2.5, { opacity: .15 })).join('') }
};

// ===== oczy (środek twarzy ok. y=56) =====
const EYES = {
    shades: {
        name: 'Ciemne okulary', rarity: 'common',
        draw: () => R(52, 50, 16, 6, INK) + P('M14 44H54V60C54 70 48 72 34 72C20 72 14 68 14 58Z', INK) + P('M66 44H106V58C106 68 100 72 86 72C72 72 66 70 66 60Z', INK)
            + P('M20 48L32 48L22 66L20 66Z', '#fff', { opacity: .35 }) + P('M72 48L84 48L74 66L72 66Z', '#fff', { opacity: .35 })
    },
    monocle: {
        name: 'Monokl', rarity: 'common',
        draw: () => C(38, 56, 14, '#fff', { stroke: INK, 'stroke-width': 4 }) + C(40, 57, 6, INK)
            + C(82, 56, 15, '#fff', { stroke: '#f1c40f', 'stroke-width': 5 }) + C(80, 57, 7, INK) + C(77, 54, 2.2, '#fff')
            + L('M95 66C108 78 104 98 96 108', '#f1c40f', 2.5, { 'stroke-dasharray': '1 4' })
    },
    night: {
        name: 'Noktowizor', rarity: 'rare',
        draw: () => [36, 84].map(x => C(x, 56, 19, INK) + C(x, 56, 13, '#2ecc71') + C(x, 56, 13, 'none', { stroke: '#a8f5c6', 'stroke-width': 1.5, opacity: .8 })
            + L(`M${x - 13} 56H${x + 13}M${x} 43V69`, INK, 2, { opacity: .55 }) + C(x - 5, 51, 3.2, '#fff', { opacity: .85 })).join('')
            + R(54, 52, 12, 6, INK)
    }
};

// ===== buzie (ok. y=92) =====
const MOUTHS = {
    zip: {
        name: 'Zamek', rarity: 'common',
        draw: () => L('M28 92H88', INK, 6) + range(0, 4, 1).map(i => L(`M${35 + i * 12} 86V98`, '#d8d8d8', 2.5)).join('')
            + R(86, 85, 12, 14, '#f1c40f', { rx: 3, stroke: INK, 'stroke-width': 3 }) + C(92, 92, 2.2, INK)
    },
    mustache: {
        name: 'Sztuczny wąs', rarity: 'common',
        draw: () => P('M60 84C50 75 32 78 24 90C34 87 44 93 60 90C76 93 86 87 96 90C88 78 70 75 60 84Z', INK) + P('M40 84C46 82 52 83 56 85', 'none', { stroke: '#fff', 'stroke-width': 2, 'stroke-linecap': 'round', opacity: .3 })
    },
    smirk: {
        name: 'Chytry uśmiech', rarity: 'common',
        draw: () => L('M34 92Q58 102 88 84', INK, 6) + L('M88 84L93 79', INK, 5) + P('M70 93L76 90L77 97Z', '#fff', { stroke: INK, 'stroke-width': 1.5, 'stroke-linejoin': 'round' })
    }
};

// ===== nakrycia głowy: zasłaniają górę kafelka =====
const GEAR = {
    fedora: {
        name: 'Kapelusz', rarity: 'common',
        draw: () => P('M26 34C24 12 36 4 60 4C84 4 96 12 94 34Z', '#2c2c34') + R(26, 22, 68, 9, '#c0392b') + P('M26 22H94V25H26Z', '#000', { opacity: .2 })
            + '<ellipse cx="60" cy="34" rx="54" ry="8" fill="#1d1d24"/>' + P('M38 10C46 6 54 6 60 6', 'none', { stroke: '#fff', 'stroke-width': 2.5, 'stroke-linecap': 'round', opacity: .25 })
    },
    hood: {
        name: 'Kaptur', rarity: 'common',
        draw: () => P('M0 0H120V112C116 96 110 34 60 28C10 34 4 96 0 112Z', '#22222c') + P('M0 0H120V106C114 90 108 30 60 22C12 30 6 90 0 106Z', '#2e2e3a')
            + L('M60 28C110 34 116 96 120 112', '#000', 3, { opacity: .35 }) + L('M60 28C10 34 4 96 0 112', '#000', 3, { opacity: .35 })
    },
    headset: {
        name: 'Słuchawka agenta', rarity: 'rare',
        draw: () => L('M12 54C12 4 108 4 108 54', '#2a2a2a', 9) + L('M12 54C12 6 108 6 108 54', '#555', 2, { opacity: .8 })
            + R(2, 46, 16, 28, '#2a2a2a', { rx: 6, stroke: INK, 'stroke-width': 2.5 }) + R(102, 46, 16, 28, '#2a2a2a', { rx: 6, stroke: INK, 'stroke-width': 2.5 })
            + C(10, 60, 3.5, '#e74c3c') + L('M110 74C112 100 100 108 82 106', INK, 3.5) + C(80, 106, 5.5, '#e74c3c', { stroke: INK, 'stroke-width': 2 })
    }
};

// Części widoczne tylko w stanach awatara
const REVEAL = {
    eyes: [36, 84].map(x => P(`M${x - 17} 62Q${x} 40 ${x + 17} 62Q${x} 70 ${x - 17} 62Z`, '#fff', { stroke: INK, 'stroke-width': 3, 'stroke-linejoin': 'round' }) + C(x, 58, 6, '#e74c3c')).join('')
        + L('M18 40L48 52M102 40L72 52', INK, 5),
    mouth: P('M28 86Q60 108 92 86Q60 96 28 86Z', INK, { 'stroke-linejoin': 'round' }) + P('M38 90L44 100L50 92ZM70 92L76 100L82 90Z', '#fff', { stroke: INK, 'stroke-width': 1.5, 'stroke-linejoin': 'round' }),
    kickedEyes: [36, 84].map(x => L(`M${x - 11} 45L${x + 11} 67M${x + 11} 45L${x - 11} 67`, INK, 6)).join('')
};

const CATALOG = { pattern: PATTERNS, eyes: EYES, mouth: MOUTHS, gear: GEAR };
const SLOTS = [
    { id: 'background', name: 'Kolor', kind: 'swatch' }, { id: 'pattern', name: 'Wzór', kind: 'avatar' },
    { id: 'eyes', name: 'Oczy', kind: 'avatar' }, { id: 'mouth', name: 'Buzia', kind: 'avatar' }, { id: 'gear', name: 'Czapka', kind: 'avatar' }
];
const DEFAULT_AVATAR = { background: '2196f3', pattern: 'dots', eyes: 'shades', mouth: 'zip', gear: 'fedora' };
const ORDER = Object.keys(DEFAULT_AVATAR);
const STATES = ['kicked', 'revealed'];

function isValid(slot, value) {
    if (typeof value !== 'string') return false;
    if (slot === 'background') return COLOR_PATTERN.test(value) || Object.hasOwn(SPECIAL_BACKGROUNDS, value);
    return Object.hasOwn(CATALOG[slot], value);
}

function clean(avatar) {
    const cleaned = {};
    ORDER.forEach(slot => {
        const value = avatar ? avatar[slot] : undefined;
        cleaned[slot] = isValid(slot, value) ? value : DEFAULT_AVATAR[slot];
    });
    return cleaned;
}

function render(cfg, state) {
    const special = SPECIAL_BACKGROUNDS[cfg.background];
    const head = special ? specialBackgroundSvg(special) : R(0, 0, 120, 120, '#' + cfg.background);
    const revealed = state === 'revealed', kicked = state === 'kicked';

    const picture = head
        + PATTERNS[cfg.pattern].draw()
        + (revealed ? '' : GEAR[cfg.gear].draw())
        + (revealed ? REVEAL.eyes : kicked ? REVEAL.kickedEyes : EYES[cfg.eyes].draw())
        + (revealed ? REVEAL.mouth : MOUTHS[cfg.mouth].draw())
        // lekkie cieniowanie dołu, jak w Bottts
        + '<defs><linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></linearGradient></defs>'
        + R(0, 0, 120, 120, 'url(#shade)');

    const body = kicked ? `<g filter="url(#faded)">${picture}</g>` : picture;
    const defs = kicked ? '<defs><filter id="faded"><feColorMatrix type="saturate" values=".15"/></filter></defs>' : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">${defs}${body}</svg>`;
}

const ROUTE = '/avatar/impostor/' + ORDER.map(slot => ':' + slot).join('/');

function send(req, res) {
    for (const slot of ORDER) if (!isValid(slot, req.params[slot])) return res.sendStatus(404);
    const state = STATES.includes(req.query.state) ? req.query.state : undefined;
    res.set({ 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=3600' });
    res.send(render(req.params, state));
}

function catalog() {
    const parts = {
        background: [
            ...BACKGROUND_COLORS.map(color => ({ id: color, name: '', rarity: 'common', css: '#' + color })),
            ...Object.entries(SPECIAL_BACKGROUNDS).map(([id, background]) => ({ id, name: background.name, rarity: 'rare', css: specialBackgroundCss(background) }))
        ]
    };
    ['pattern', 'eyes', 'mouth', 'gear'].forEach(slot => {
        parts[slot] = Object.entries(CATALOG[slot]).map(([id, item]) => ({ id, name: item.name, rarity: item.rarity }));
    });
    return { id: 'impostor', name: 'Impostorzy', slots: SLOTS, parts };
}

module.exports = { id: 'impostor', name: 'Impostorzy', ROUTE, ORDER, DEFAULT_AVATAR, clean, render, send, catalog };
