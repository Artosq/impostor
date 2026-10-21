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

function sendCatalog(req, res) {
    res.set('Cache-Control', 'no-cache');
    res.json({
        active: ACTIVE_STYLE,
        styles: Object.fromEntries(Object.entries(styles).map(([id, style]) => [id, style.catalog()]))
    });
}

function register(app) {
    app.get('/avatar-catalog', sendCatalog);
    Object.values(styles).forEach(style => app.get(style.ROUTE, style.send));

    // Adres z poprzednich wersji (bez nazwy zestawu) - otwarte karty dalej pokażą awatary
    app.get('/avatar/:eyes/:mouth/:pattern/:background', styles.bottts.send);
}

module.exports = { cleanAvatar, register, ACTIVE_STYLE, styles };
