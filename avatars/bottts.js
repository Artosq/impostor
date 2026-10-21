'use strict';

// ZESTAW "ROBOTY (KLASYCZNE)": serwer sam generuje SVG (DiceBear, styl Bottts Neutral) - bez zewnętrznego serwisu.
// Awatar to cztery części wybierane przez gracza: oczy, buzia, wzór i tło (kolor albo specjalne tło).
// Ten zestaw zostaje w projekcie jako zapasowy; który zestaw jest aktywny, ustawia avatars/index.js.
//
// data/avatars/bottts-neutral.json - kopia 1:1 stylu Bottts Neutral (z licencją w polu meta)
// data/avatars/wlasne.json         - nasze części w tym samym stylu, doklejane do kopii

const bottts = require('../data/avatars/bottts-neutral.json');
const own = require('../data/avatars/wlasne.json');
const { BACKGROUND_COLORS, SPECIAL_BACKGROUNDS, specialBackgroundSvg, specialBackgroundCss } = require('./backgrounds');

// Nasze warianty trafiają za oryginalnymi, więc kolejność części Bottts się nie zmienia
const definition = structuredClone(bottts);
Object.entries(own.components).forEach(([component, { variants }]) => {
    Object.assign(definition.components[component].variants, variants);
});

const PARTS = {
    eyes: Object.keys(definition.components.eyes.variants),
    mouth: Object.keys(definition.components.mouth.variants),
    pattern: Object.keys(definition.components.texture.variants)
};
const COLOR_PATTERN = /^[0-9a-f]{6}$/;
// Specjalne tła (tęcza, pół na pół, galaktyka...) są wspólne z innymi zestawami
const DEFAULT_AVATAR = { eyes: 'round', mouth: 'smile01', pattern: 'camo01', background: '555555' };
const ORDER = Object.keys(DEFAULT_AVATAR);
const NO_PART = '-';    // w adresie: awatar bez tej części
const KICKED_EYES = 'dizzy';     // wyrzucony gracz ma oczy z krzyżykami

function isValidPart(part, value) {
    if (part === 'background') return COLOR_PATTERN.test(value) || Object.hasOwn(SPECIAL_BACKGROUNDS, value);
    return PARTS[part].includes(value);
}

// Wygląd przysłany przez gracza; błędne części wracają do domyślnych
function clean(avatar) {
    const cleaned = {};
    Object.keys(DEFAULT_AVATAR).forEach(part => {
        const value = avatar ? avatar[part] : undefined;
        cleaned[part] = typeof value === 'string' && isValidPart(part, value) ? value : DEFAULT_AVATAR[part];
    });
    return cleaned;
}

// @dicebear/core jest modułem ES, stąd wczytanie przez import()
const renderer = import('@dicebear/core').then(({ Avatar, Style }) => {
    const style = new Style(definition);

    // Pusta tablica oznacza "bez tej części"
    return ({ eyes, mouth, pattern, background }) => {
        const special = background && SPECIAL_BACKGROUNDS[background];
        const svg = new Avatar(style, {
            eyesVariant: eyes || [],
            mouthVariant: mouth || [],
            textureVariant: pattern || [],
            backgroundColor: special ? 'ffffff' : background || [],
            textureProbability: 100
        }).toString();

        // Specjalne tło zastępuje jednolity prostokąt tła, który rysuje DiceBear
        return special
            ? svg.replace('<rect width="120" height="120" fill="#ffffff"/>', specialBackgroundSvg(special))
            : svg;
    };
});

// GET /avatar/bottts/:eyes/:mouth/:pattern/:background[?state=kicked|revealed]
const ROUTE = '/avatar/bottts/:eyes/:mouth/:pattern/:background';

async function send(req, res) {
    const parts = {};
    for (const part of ORDER) {
        const value = req.params[part];
        if (value !== NO_PART && !isValidPart(part, value)) return res.sendStatus(404);
        parts[part] = value === NO_PART ? null : value;
    }
    if (req.query.state === 'kicked') parts.eyes = KICKED_EYES;

    const render = await renderer;
    res.set({
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=31536000, immutable'
    });
    res.send(render(parts));
}

// Katalog dla klienta (panel personalizacji) w tym samym formacie co zestaw Agentów
function catalog() {
    const part = id => ({ id, name: id, rarity: 'common' });
    return {
        id: 'bottts',
        name: 'Roboty (klasyczne)',
        slots: [
            { id: 'eyes', name: 'Oczy', kind: 'avatar' }, { id: 'mouth', name: 'Buzia', kind: 'avatar' },
            { id: 'pattern', name: 'Wzór', kind: 'avatar' }, { id: 'background', name: 'Tło', kind: 'swatch' }
        ],
        parts: {
            eyes: PARTS.eyes.map(part),
            mouth: PARTS.mouth.map(part),
            pattern: PARTS.pattern.map(part),
            background: [
                ...BACKGROUND_COLORS.map(color => ({ id: color, name: '', rarity: 'common', css: '#' + color })),
                ...Object.entries(SPECIAL_BACKGROUNDS).map(([id, background]) => ({ id, name: background.name, rarity: 'rare', css: specialBackgroundCss(background) }))
            ]
        }
    };
}

module.exports = { id: 'bottts', name: 'Roboty (klasyczne)', ROUTE, ORDER, DEFAULT_AVATAR, clean, send, catalog };
