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

// SVG tła 120x120 wstawiane w miejsce jednolitego koloru
function specialBackgroundSvg({ type, colors, direction }) {
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
function specialBackgroundCss({ type, colors, direction }) {
    if (type === 'split') {
        return `linear-gradient(${direction === 'diagonal' ? '135deg' : '90deg'}, ${colors[0]} 50%, ${colors[1]} 50%)`;
    }
    return `linear-gradient(${type === 'stars' ? '180deg' : '135deg'}, ${colors.join(', ')})`;
}

module.exports = { BACKGROUND_COLORS, SPECIAL_BACKGROUNDS, specialBackgroundSvg, specialBackgroundCss };
