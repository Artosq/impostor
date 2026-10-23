// WYGLĄD KATEGORII: emoji przy nazwie i grafika w tle kafelka.
// Klucz to id kategorii z serwera; kategoria bez wpisu dostaje wygląd "default".

function categorySvg(shapes) {
    return `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${shapes}</svg>`;
}

const categoryArt = {
    // kostka do gry
    losowa: {
        emoji: '\u{1F3B2}',
        svg: categorySvg(`
            <rect x="10" y="10" width="44" height="44" rx="8"/>
            <circle cx="22" cy="22" r="3" fill="currentColor"/>
            <circle cx="42" cy="22" r="3" fill="currentColor"/>
            <circle cx="32" cy="32" r="3" fill="currentColor"/>
            <circle cx="22" cy="42" r="3" fill="currentColor"/>
            <circle cx="42" cy="42" r="3" fill="currentColor"/>`)
    },
    // kubek z parą i klucz
    Przedmioty: {
        emoji: '\u{1F4E6}',
        svg: categorySvg(`
            <rect x="6" y="32" width="24" height="24" rx="3"/>
            <path d="M30 38h5a5 5 0 0 1 0 12h-5"/>
            <path d="M13 26c0-4 4-4 4-8M22 26c0-4 4-4 4-8"/>
            <circle cx="48" cy="14" r="8"/>
            <path d="M48 22v32M48 42h8M48 51h6"/>`)
    },
    // pad
    Gry: {
        emoji: '\u{1F3AE}',
        svg: categorySvg(`
            <path d="M18 20h28a12 12 0 0 1 12 12v8a8 8 0 0 1-14 5l-4-5H24l-4 5a8 8 0 0 1-14-5v-8a12 12 0 0 1 12-12z"/>
            <path d="M20 28v8M16 32h8"/>
            <circle cx="42" cy="29" r="2" fill="currentColor"/>
            <circle cx="48" cy="35" r="2" fill="currentColor"/>`)
    },
    // klaps filmowy
    Filmy: {
        emoji: '\u{1F3AC}',
        svg: categorySvg(`
            <rect x="8" y="30" width="48" height="26" rx="3"/>
            <path d="M8 30l44-13 2 8-44 13z"/>
            <path d="M19 27l5 6M31 23l5 6M43 20l5 6"/>
            <path d="M16 40h32M16 48h20"/>`)
    },
    // globus
    Kraje: {
        emoji: '\u{1F30D}',
        svg: categorySvg(`
            <circle cx="32" cy="32" r="26"/>
            <ellipse cx="32" cy="32" rx="11" ry="26"/>
            <path d="M6 32h52M10 19h44M10 45h44"/>`)
    },
    // sylwetka w koronie
    Osoby: {
        emoji: '\u{1F464}',
        svg: categorySvg(`
            <circle cx="32" cy="27" r="10"/>
            <path d="M12 58c0-12 9-18 20-18s20 6 20 18"/>
            <path d="M22 13l4 5 6-8 6 8 4-5v8H22z"/>`)
    },
    // TRYB PYTANIA
    // dymek z pytajnikiem
    klasyczne: {
        emoji: '❓',
        svg: categorySvg(`
            <path d="M8 12h48v30H30l-12 10v-10H8z"/>
            <path d="M26 22a6 6 0 1 1 8 5.6c-1.3.6-2 1.6-2 3V32"/>
            <circle cx="32" cy="37" r="1.5" fill="currentColor"/>`)
    },
    // trzy osoby i wskazująca strzałka
    'kto-z-nas': {
        emoji: '👉',
        svg: categorySvg(`
            <circle cx="16" cy="24" r="6"/><circle cx="32" cy="20" r="7"/><circle cx="48" cy="24" r="6"/>
            <path d="M6 44c0-6 4-10 10-10s10 4 10 10M22 44c0-8 4-12 10-12s10 4 10 12M38 44c0-6 4-10 10-10s10 4 10 10"/>
            <path d="M32 50v8M28 54l4 4 4-4"/>`)
    },
    // suwak
    skala: {
        emoji: '🎚️',
        svg: categorySvg(`
            <path d="M8 32h48"/>
            <circle cx="40" cy="32" r="7" fill="currentColor"/>
            <path d="M8 20v-6M18 22v-8M28 24v-10M38 22v-8M48 20v-6"/>
            <path d="M12 48h6M44 48h8M48 44v8"/>`)
    },
    // ołówek - kategoria wpisana przez hosta
    wlasna: {
        emoji: '\u270F\uFE0F',
        svg: categorySvg(`
            <path d="M44 8l12 12-32 32-16 4 4-16z"/>
            <path d="M36 16l12 12M12 40l12 12"/>`)
    },
    // plus - tworzenie nowej kategorii
    nowa: {
        emoji: '\u2795',
        svg: categorySvg(`
            <circle cx="32" cy="32" r="24"/>
            <path d="M32 20v24M20 32h24"/>`)
    },
    // metka
    default: {
        emoji: '\u{1F3F7}️',
        svg: categorySvg(`
            <path d="M8 30V10h20l28 28-20 20z"/>
            <circle cx="20" cy="22" r="4"/>`)
    }
};

// Kafelek kategorii: używany na liście w oknie wyboru i jako przycisk w poczekalni
function createCategoryTile(category, description, onClick) {
    const art = categoryArt[category.id] || categoryArt.default;

    const tile = createElement('button', 'category-card');
    tile.onclick = onClick;

    const picture = createElement('div', 'category-art');
    picture.innerHTML = art.svg;

    const text = createElement('div', 'category-text');
    text.append(
        createElement('div', 'category-name', `${art.emoji} ${category.name}`),
        createElement('div', 'category-description', description)
    );

    tile.append(picture, text);
    return tile;
}
