'use strict';

// ZESTAWY AWATARÓW: każdy zestaw to osobny moduł z tym samym zestawem funkcji
// (clean, send, catalog, ROUTE). Który jest aktywny dla nowych graczy, ustala zmienna AVATAR_STYLE:
//
//   AVATAR_STYLE=impostor - kolorowe głowy jak w Bottts, ale ze szpiegowskimi oczami, buziami i nakryciami
//   AVATAR_STYLE=agent               - ciemni agenci z maskami, rysowani od zera
//   AVATAR_STYLE=bottts   (domyślnie) - klasyczne roboty (Bottts Neutral) + nasze części
//
// Awatar każdego gracza niesie nazwę swojego zestawu (pole style), więc oba zestawy mogą
// współistnieć w jednym pokoju, a zmiana aktywnego zestawu niczego nie psuje.

const { sendCached } = require('./send');
const { AVATAR_VERSION } = require('./version');

const styles = {
    impostor: require('./impostor'),
    agent: require('./agent'),
    bottts: require('./bottts')
};

const ACTIVE_STYLE = Object.hasOwn(styles, process.env.AVATAR_STYLE) ? process.env.AVATAR_STYLE : 'bottts';

// Awatar przysłany przez gracza; bez nazwy zestawu: stary klient (pola Bottts) albo aktywny zestaw
function cleanAvatar(avatar) {
    let id = ACTIVE_STYLE;
    if (avatar && Object.hasOwn(styles, avatar.style)) id = avatar.style;
    else if (avatar && typeof avatar.pattern === 'string') id = 'bottts';

    return { style: id, ...styles[id].clean(avatar) };
}

// Najkrótszy zapis awatara - na listę pokoi, gdzie awatarów jest dużo: numer zestawu i numery części
// w katalogu (ten sam, który dostaje klient), w systemie 36, rozdzielone kropką, np. "2.3.a.1f.4".
// Część spoza katalogu (np. dowolny kolor tła) idzie dosłownie po "!", brak części to "-".
// Klient odtwarza z tego adres obrazka - zob. decodeListAvatar w public/js/app.js.
const STYLE_IDS = Object.keys(styles);
let partIndexes = null;     // zestaw -> część -> { id części: numer }

function indexesFor(styleId) {
    if (!partIndexes) {
        partIndexes = Object.fromEntries(STYLE_IDS.map(id => [id, Object.fromEntries(
            Object.entries(styles[id].catalog().parts).map(([slot, items]) => [slot, new Map(items.map((item, i) => [item.id, i]))])
        )]));
    }
    return partIndexes[styleId];
}

function avatarCode(avatar) {
    const indexes = indexesFor(avatar.style);
    const parts = styles[avatar.style].ORDER.map(part => {
        const value = avatar[part];
        if (!value) return '-';
        const index = indexes[part] && indexes[part].get(value);
        return index === undefined ? '!' + encodeURIComponent(value) : index.toString(36);
    });
    return [STYLE_IDS.indexOf(avatar.style), ...parts].join('.');
}

// Katalog nie zmienia się do następnego wdrożenia: liczony i kompresowany raz (ok. 42 kB -> kilka kB)
function sendCatalog(req, res) {
    sendCached(req, res, {
        key: 'avatar-catalog',
        type: 'application/json; charset=utf-8',
        cacheControl: 'no-cache',
        render: () => JSON.stringify({
            active: ACTIVE_STYLE,
            version: AVATAR_VERSION,        // klient dopisuje ją do adresów obrazków (zob. version.js)
            styles: Object.fromEntries(Object.entries(styles).map(([id, style]) => [id, style.catalog()]))
        })
    });
}

function register(app) {
    app.get('/avatar-catalog', sendCatalog);
    Object.values(styles).forEach(style => app.get(style.ROUTE, style.send));

    // Adres z poprzednich wersji (bez nazwy zestawu) - otwarte karty dalej pokażą awatary
    app.get('/avatar/:eyes/:mouth/:pattern/:background', styles.bottts.send);
}

module.exports = { cleanAvatar, avatarCode, register, ACTIVE_STYLE, styles };
