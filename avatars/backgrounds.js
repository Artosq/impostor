'use strict';

// SPECJALNE KOLORY GŁOWY / TŁA wspólne dla zestawów awatarów: tęcza, gradienty, pół na pół, galaktyka.
// Definicje są w data/avatars/wlasne.json (pole backgrounds), a tu zamieniamy je na SVG i CSS.

const SPECIAL_BACKGROUNDS = require('../data/avatars/wlasne.json').backgrounds;

// Paleta jednolitych kolorów (ta sama co w klasycznych Bottts), pierwszy to domyślny szary
const BACKGROUND_COLORS = [
    '555555', 'f44336', 'e91e63', '9c27b0', '673ab7', '3f51b5', '2196f3', '009688', '4caf50',
    '8bc34a', 'cddc39', 'ffeb3b', 'ffc107', 'ff9800', 'ff5722', '795548', '9e9e9e', '607d8b', '263238'
];

function gradientStops(colors) {
    return colors.map((color, i) => `<stop offset="${Math.round(i / (colors.length - 1) * 100)}%" stop-color="${color}"/>`).join('');
}

// Gwiazdki galaktyki w stałych miejscach, żeby awatar był zawsze taki sam
function starDots() {
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    return Array.from({ length: 24 }, () => {
        const x = (rnd() * 120).toFixed(1), y = (rnd() * 120).toFixed(1), r = (0.6 + rnd() * 1.4).toFixed(2);
        return `<circle cx="${x}" cy="${y}" r="${r}" fill="white" fill-opacity="${(0.4 + rnd() * 0.5).toFixed(2)}"/>`;
    }).join('');
}

// Płaski połysk metalu: dwa jasne ukośne pasy (bez gradientów, w stylu Bottts)
const SHEEN = '<path d="M0 70L70 0H95L0 95Z" fill="white" fill-opacity=".16"/><path d="M0 105L105 0H113L0 113Z" fill="white" fill-opacity=".1"/>';

function materialSvg(finish, [base, second]) {
    const fill = `<rect width="120" height="120" fill="${base}"/>`;
    if (finish === 'brushed') {
        const lines = Array.from({ length: 40 }, (_, i) => `M0 ${i * 3}h120v1H0z`).join('');
        return fill + `<path d="${lines}" fill="white" fill-opacity=".08"/>` + SHEEN;
    }
    if (finish === 'carbon') {
        // splot włókna: na przemian poziome i pionowe połówki komórek 6x6
        let weave = '';
        for (let y = 0; y < 120; y += 6) for (let x = 0; x < 120; x += 6) {
            weave += (x / 6 + y / 6) % 2 ? `M${x} ${y}h6v3h-6z` : `M${x} ${y}h3v6h-3z`;
        }
        return fill + `<path d="${weave}" fill="${second}"/>` + '<path d="M0 70L70 0H95L0 95Z" fill="white" fill-opacity=".07"/>';
    }
    if (finish === 'plastic') {
        return fill + '<ellipse cx="32" cy="26" rx="28" ry="13" transform="rotate(-20 32 26)" fill="white" fill-opacity=".7"/>'
            + '<ellipse cx="96" cy="104" rx="60" ry="34" fill="black" fill-opacity=".05"/>';
    }
    return fill + SHEEN;    // metal: złoto, miedź, brąz, grafit
}

// Malowanie: drugi kolor w kształcie maski, pasa, opaski albo czubka (oczy ok. y 20-68, buzia y 72-96)
const PAINT_SHAPES = {
    faceplate: 'M16 16H104L98 102Q60 118 22 102Z',
    stripe: 'M48 0H72V120H48Z',
    eyeband: 'M0 24H120V64H0Z',
    cap: 'M0 0H120V30Q60 16 0 30Z'
};
function paintSvg(shape, [base, accent]) {
    const d = PAINT_SHAPES[shape];
    return `<rect width="120" height="120" fill="${base}"/><path d="${d}" fill="${accent}"/>`
        + `<path d="${d}" fill="none" stroke="black" stroke-opacity=".15" stroke-width="2"/>`;
}

// SVG tła 120x120 wstawiane w miejsce jednolitego koloru
function specialBackgroundSvg({ type, colors, direction, finish, shape }) {
    if (type === 'solid') return `<rect width="120" height="120" fill="${colors[0]}"/>`;
    if (type === 'material') return materialSvg(finish, colors);
    if (type === 'paint') return paintSvg(shape, colors);
    if (type === 'split') {
        const [first, second] = colors;
        return direction === 'diagonal'
            ? `<path d="M0 0H120L0 120Z" fill="${first}"/><path d="M120 0V120H0Z" fill="${second}"/>`
            : `<rect width="60" height="120" fill="${first}"/><rect x="60" width="60" height="120" fill="${second}"/>`;
    }
    const vertical = type === 'stars';
    const gradient = `<defs><linearGradient id="special-bg" x1="0" y1="0" x2="${vertical ? 0 : 1}" y2="1">${gradientStops(colors)}</linearGradient></defs>`;
    return gradient + '<rect width="120" height="120" fill="url(#special-bg)"/>' + (type === 'stars' ? starDots() : '');
}

// Ten sam wygląd w CSS - dla kafelka w panelu personalizacji
function specialBackgroundCss(background) {
    const { type, colors, direction } = background;
    if (type === 'solid') return colors[0];
    // materiały i malowania: kafelek pokazuje dokładnie to samo SVG co awatar
    if (type === 'material' || type === 'paint') {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">${specialBackgroundSvg(background)}</svg>`;
        return `url("data:image/svg+xml,${encodeURIComponent(svg)}") center / cover`;
    }
    if (type === 'split') {
        return `linear-gradient(${direction === 'diagonal' ? '135deg' : '90deg'}, ${colors[0]} 50%, ${colors[1]} 50%)`;
    }
    return `linear-gradient(${type === 'stars' ? '180deg' : '135deg'}, ${colors.join(', ')})`;
}

module.exports = { BACKGROUND_COLORS, SPECIAL_BACKGROUNDS, specialBackgroundSvg, specialBackgroundCss };
