// AWATARY: serwer sam generuje SVG (DiceBear, styl bottts-neutral) - bez zewnętrznego serwisu.
// Awatar to cztery części wybierane przez gracza: oczy, buzia, wzór i kolor tła.

const definition = require('@dicebear/styles/bottts-neutral.json');

const PARTS = {
    eyes: Object.keys(definition.components.eyes.variants),
    mouth: Object.keys(definition.components.mouth.variants),
    pattern: Object.keys(definition.components.texture.variants)
};
const COLOR_PATTERN = /^[0-9a-f]{6}$/;
const DEFAULT_AVATAR = { eyes: 'round', mouth: 'smile01', pattern: 'camo01', background: '555555' };
const NO_PART = '-';    // w adresie: awatar bez tej części (podgląd pojedynczej części w panelu)

function isValidPart(part, value) {
    return part === 'background' ? COLOR_PATTERN.test(value) : PARTS[part].includes(value);
}

// Wygląd przysłany przez gracza; błędne części wracają do domyślnych
function cleanAvatar(avatar) {
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
    return ({ eyes, mouth, pattern, background }) => new Avatar(style, {
        eyesVariant: eyes || [],
        mouthVariant: mouth || [],
        textureVariant: pattern || [],
        backgroundColor: background || [],
        textureProbability: 100
    }).toString();
});

// GET /avatar/:eyes/:mouth/:pattern/:background
async function sendAvatar(req, res) {
    const parts = {};
    for (const part of Object.keys(DEFAULT_AVATAR)) {
        const value = req.params[part];
        if (value !== NO_PART && !isValidPart(part, value)) return res.sendStatus(404);
        parts[part] = value === NO_PART ? null : value;
    }

    const render = await renderer;
    res.set({
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=31536000, immutable'
    });
    res.send(render(parts));
}

module.exports = { cleanAvatar, sendAvatar };
