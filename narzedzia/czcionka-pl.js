// Polskie litery do Silkscreen (SIL OFL 1.1 - bez zastrzeżonej nazwy, więc zmodyfikowana wersja może nosić tę samą).
// Silkscreen ma z polskich znaków tylko Ó/ó. Ten skrypt robi mały plik z literami ĄĆĘŁŃŚŹŻ (i małymi - w Silkscreen
// małe litery wyglądają jak wielkie): litera bazowa z oryginalnej czcionki + pikselowy znak diakrytyczny.
// Kreska nad Ć/Ń/Ś/Ź to dokładnie ta z oryginalnego Ó.
//
// Uruchomienie (raz, po zmianie wyglądu znaków): node narzedzia/czcionka-pl.js
// Potrzebne tylko do generowania: npm install --no-save opentype.js wawoff2 pngjs
// Dodatkowo czytelny wielokropek "…" (oryginalny wygląda jak podkreślnik).
// Wynik: public/fonts/silkscreen-<grubość>-pl.woff2

const fs = require('fs');
const path = require('path');
const opentype = require('opentype.js');
const wawoff = require('wawoff2');

const FONTS = path.join(__dirname, '..', 'public', 'fonts');
const PX = 125;                  // jeden piksel Silkscreen w jednostkach czcionki
const ROWS = { min: -3, max: 9 }; // zakres wierszy siatki (linia bazowa = 0, wysokość liter = 5)

// Litera polska -> [litera bazowa, znak diakrytyczny]
const LETTERS = {
    'Ą': ['A', 'ogonek'], 'Ć': ['C', 'acute'], 'Ę': ['E', 'ogonek'], 'Ł': ['L', 'stroke'],
    'Ń': ['N', 'acute'], 'Ś': ['S', 'acute'], 'Ź': ['Z', 'acute'], 'Ż': ['Z', 'dot']
};

async function load(file) {
    const ttf = await wawoff.decompress(fs.readFileSync(file));
    return opentype.parse(ttf.buffer.slice(ttf.byteOffset, ttf.byteOffset + ttf.byteLength));
}

// Kontury (same odcinki poziome i pionowe) -> zbiór zapalonych pikseli "x,y" (reguła nonzero)
function toPixels(glyph) {
    const contours = [];
    let current = [];
    glyph.path.commands.forEach(c => {
        if (c.type === 'M') { if (current.length) contours.push(current); current = [[c.x, c.y]]; }
        else if (c.type === 'L') current.push([c.x, c.y]);
        else if (c.type === 'Z') { contours.push(current); current = []; }
    });
    if (current.length) contours.push(current);

    const pixels = new Set();
    const cols = Math.ceil(glyph.advanceWidth / PX) + 2;
    for (let y = ROWS.min; y < ROWS.max; y++) for (let x = -1; x < cols; x++) {
        const px = (x + 0.5) * PX, py = (y + 0.5) * PX;
        let winding = 0;
        contours.forEach(points => points.forEach((a, i) => {
            const b = points[(i + 1) % points.length];
            if (a[0] !== b[0]) return;     // liczą się tylko krawędzie pionowe, przecinane promieniem w prawo
            if (a[0] <= px) return;
            if (a[1] <= py && b[1] > py) winding++;
            else if (b[1] <= py && a[1] > py) winding--;
        }));
        if (winding !== 0) pixels.add(`${x},${y}`);
    }
    return pixels;
}

const parse = key => key.split(',').map(Number);
const columns = pixels => [...pixels].map(k => parse(k)[0]);
const rows = pixels => [...pixels].map(k => parse(k)[1]);

// Grubość pionowej kreski (1 piksel w zwykłej, 2 w pogrubionej) - z litery I
function stemWidth(font) {
    const pixels = toPixels(font.charToGlyph('I'));
    const midRow = 2;
    return [...pixels].filter(k => parse(k)[1] === midRow).length;
}

// Znak diakrytyczny -> piksele dodane do litery bazowej
function diacritic(kind, base, font) {
    const w = stemWidth(font);
    const xs = columns(base), left = Math.min(...xs), right = Math.max(...xs);
    const add = [];
    if (kind === 'acute') {
        // kreska z oryginalnego Ó, przesunięta tak, by stała nad środkiem litery jak nad O
        const o = toPixels(font.charToGlyph('O')), oAcute = toPixels(font.charToGlyph('Ó'));
        const accent = [...oAcute].filter(k => !o.has(k)).map(parse);
        const oCenter = (Math.min(...columns(o)) + Math.max(...columns(o))) / 2;
        const shift = Math.round((left + right) / 2 - oCenter);
        accent.forEach(([x, y]) => add.push([x + shift, y]));
    } else if (kind === 'dot') {
        // kropka wielkości kreski litery, nad środkiem, w wierszu kreski z Ó
        const o = toPixels(font.charToGlyph('O')), oAcute = toPixels(font.charToGlyph('Ó'));
        const accentRow = Math.min(...[...oAcute].filter(k => !o.has(k)).map(k => parse(k)[1]));
        const start = Math.round((left + right + 1) / 2 - w / 2);
        for (let dx = 0; dx < w; dx++) for (let dy = 0; dy < w; dy++) add.push([start + dx, accentRow + dy]);
    } else if (kind === 'ogonek') {
        // haczyk pod prawym dolnym rogiem: w dół, potem w prawo
        const stemRight = right - w + 1;
        for (let dx = 0; dx < w; dx++) add.push([stemRight + dx, -1]);
        for (let dx = 0; dx < w; dx++) add.push([stemRight + dx + w, -2]);
    } else if (kind === 'stroke') {
        // ukośna kreska przez pionową belkę L: piksel z lewej niżej, z prawej wyżej
        // (pojedyncze piksele też w pogrubieniu - podwójne zlewały się w plamę)
        add.push([left - 1, 2]);
        add.push([left + w, 3]);
    }
    return add;
}

// Piksele -> kontur: jeden prostokąt na każdy ciąg pikseli w wierszu (wszystkie w tę samą stronę - nonzero je łączy)
function toPath(pixels) {
    const p = new opentype.Path();
    const byRow = {};
    [...pixels].map(parse).forEach(([x, y]) => (byRow[y] = byRow[y] || []).push(x));
    Object.entries(byRow).forEach(([y, xs]) => {
        xs.sort((a, b) => a - b);
        let start = xs[0];
        xs.forEach((x, i) => {
            if (xs[i + 1] === x + 1) return;
            const y0 = +y * PX, y1 = (+y + 1) * PX, x0 = start * PX, x1 = (x + 1) * PX;
            p.moveTo(x0, y0); p.lineTo(x0, y1); p.lineTo(x1, y1); p.lineTo(x1, y0); p.close();
            start = xs[i + 1];
        });
    });
    return p;
}

async function build(weight) {
    const font = await load(path.join(FONTS, `silkscreen-${weight}-latin.woff2`));
    const glyphs = [new opentype.Glyph({ name: '.notdef', advanceWidth: font.charToGlyph(' ').advanceWidth, path: new opentype.Path() })];
    const preview = {};

    Object.entries(LETTERS).forEach(([upper, [baseChar, kind]]) => {
        const baseGlyph = font.charToGlyph(baseChar);
        const pixels = toPixels(baseGlyph);
        diacritic(kind, pixels, font).forEach(([x, y]) => pixels.add(`${x},${y}`));
        preview[upper] = pixels;
        const lower = upper.toLowerCase();
        // w Silkscreen małe litery wyglądają jak wielkie - ten sam kształt pod oboma kodami
        [upper, lower].forEach(ch => glyphs.push(new opentype.Glyph({
            name: 'uni' + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0'),
            unicode: ch.codePointAt(0), advanceWidth: baseGlyph.advanceWidth, path: toPath(pixels)
        })));
    });

    // Wielokropek: oryginalny "…" to trzy stykające się piksele (wygląda jak "_") - tu trzy kropki z odstępem
    const dot = toPixels(font.charToGlyph('.'));
    const dotWidth = Math.max(...columns(dot)) - Math.min(...columns(dot)) + 1;
    const ellipsis = new Set();
    [0, 1, 2].forEach(k => dot.forEach(key => {
        const [x, y] = parse(key);
        ellipsis.add(`${x + k * (dotWidth + 1)},${y}`);
    }));
    const ellipsisAdvance = (Math.max(...columns(ellipsis)) + 2) * PX;
    glyphs.push(new opentype.Glyph({ name: 'ellipsis', unicode: 0x2026, advanceWidth: ellipsisAdvance, path: toPath(ellipsis) }));
    preview['…'] = ellipsis;

    const out = new opentype.Font({
        familyName: 'Silkscreen', styleName: weight === 700 ? 'Bold' : 'Regular',
        unitsPerEm: font.unitsPerEm, ascender: font.ascender, descender: font.descender,
        glyphs, weightClass: weight,
        copyright: 'Copyright 2001 The Silkscreen Project Authors (https://github.com/googlefonts/silkscreen). Polish letters added for Impostor.',
        license: 'This Font Software is licensed under the SIL Open Font License, Version 1.1. https://openfontlicense.org'
    });
    const woff2 = await wawoff.compress(new Uint8Array(out.toArrayBuffer()));
    fs.writeFileSync(path.join(FONTS, `silkscreen-${weight}-pl.woff2`), woff2);
    console.log(`silkscreen-${weight}-pl.woff2: ${woff2.length} B, ${glyphs.length - 1} znaków (polskie litery i wielokropek)`);
    return preview;
}

// Podgląd w terminalu: piksele każdej litery
function print(preview) {
    const lines = [];
    for (let y = 7; y >= -2; y--) {
        lines.push(Object.values(preview).map(pixels => {
            let s = '';
            for (let x = -1; x < 7; x++) s += pixels.has(`${x},${y}`) ? '█' : '·';
            return s;
        }).join('  '));
    }
    console.log(Object.keys(preview).map(c => ` ${c}      `).join('  '));
    console.log(lines.join('\n'));
}

(async () => {
    for (const weight of [400, 700]) print(await build(weight));
})();
