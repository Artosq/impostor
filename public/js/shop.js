// SKLEP: Pakiet Hosta (20 zł, na zawsze), wygląd (animowane SVG), paczki kategorii, komplet.
// Na razie tylko wystawa - płatności i zapisywanie zakupów (Supabase) dojdą później, "Kup" pokazuje informację.
// Dwa ekrany: screen-shop (zakładki) i screen-shop-host (szczegóły pakietu) - przejścia robi showScreen.
// Ładowany po app.js (korzysta z byId, createElement, showScreen, showError, avatarUrl, botConfig, GameIcons).

const SHOP_TABS = [
    { id: 'featured', name: 'Polecane' },
    { id: 'looks', name: 'Wygląd' },
    { id: 'packs', name: 'Kategorie' }
];

// color: kolor paska kafelka, wide: kafelek na całą szerokość
const HOST_PACK = {
    name: 'Pakiet Hosta', price: 20,
    room: [
        { icon: 'secret', color: 'gold', name: 'Wszystkie paczki haseł', desc: 'Każda płatna paczka haseł - obecne i wszystkie nowe. Wybierasz je w poczekalni, a grają nimi wszyscy w pokoju.' },
        { icon: 'veteran', color: 'green', name: 'Turniej z podium', desc: 'Gracie kilka rund, punkty się sumują, a na koniec podium dla najlepszych graczy wieczoru.' },
        { icon: 'jester', color: 'violet', name: 'Własne role', desc: 'Ustawiasz zestaw ról: np. dwóch impostorów albo błazen i detektyw naraz. Do tego własne timery i więcej miejsc w pokoju.' },
        { icon: 'ui_players', color: 'blue', name: 'Stały pokój ekipy', desc: 'Własny kod pokoju, np. ZIOMKI. Ekipa zawsze wchodzi pod ten sam kod i link.' },
        { icon: 'detective', color: 'blue', name: 'Historia wieczoru', desc: 'Po grze widać wszystkie hasła, kto był impostorem w każdej rundzie i statystyki całej ekipy.' },
        { icon: 'streak', color: 'red', name: 'Zadania dla przegranych', desc: 'Po rundzie osoby, które przegrały, losują zabawne wyzwanie. Idealne na imprezę.' },
        { icon: 'ui_fast', color: 'green', name: 'Motyw pokoju i nowe tryby wcześniej', wide: true, desc: 'Własne kolory i tło poczekalni, a nowe tryby gry dostajesz przed wszystkimi.' }
    ],
    me: [
        { icon: 'host', color: 'gold', name: 'Korona, złoty nick i odznaka', wide: true, desc: 'Animowana korona przy awatarze, złoty nick i odznaka „Gospodarz” - widzą je wszyscy w pokoju.' }
    ]
};

const HOST_HERO_PERKS = ['Wszystkie paczki haseł', 'Turniej z podium', 'Własne role', 'Stały pokój ekipy', 'Korona hosta'];

// preview: jak narysować miniaturkę (renderShopPreview)
const SHOP_LOOKS = [
    { id: 'pack-mafia', name: 'Pakiet Mafia', note: '5 rzeczy', price: 6, animated: true, preview: 'mafia' },
    { id: 'pack-space', name: 'Pakiet Kosmos', note: '5 rzeczy', price: 6, animated: true, preview: 'space' },
    { id: 'aura-violet', name: 'Aura fioletowa', price: 3, animated: true, preview: 'aura' },
    { id: 'aura-fire', name: 'Aura płomieni', price: 3, animated: true, preview: 'fire' },
    { id: 'nick-rainbow', name: 'Tęczowy nick', price: 3, animated: true, preview: 'nick' },
    { id: 'card-neon', name: 'Karta „Neon”', price: 3, preview: 'card-neon' },
    { id: 'card-color', name: 'Karta „Kolor”', price: 3, preview: 'card-color' }
];

const SHOP_PACKS = [
    { id: 'cat-movies', name: 'Filmy i seriale', note: '150 haseł', price: 5 },
    { id: 'cat-poland', name: 'Polska', note: '150 haseł', price: 5 },
    { id: 'cat-memes', name: 'Memy i internet', note: '150 haseł', price: 5 },
    { id: 'cat-sport', name: 'Sport', note: '150 haseł', price: 5 }
];

const SHOP_BUNDLE_PRICE = 35;

// Korona hosta: kołysze się (CSS), gwiazdka mruga (SMIL) - animacja w samym SVG, jak GIF, ale ostra
const SHOP_CROWN = `<svg class="shop-crown" viewBox="0 0 60 40" aria-hidden="true">
<path d="M6 34L2 10L18 22L30 4L42 22L58 10L54 34Z" fill="#f1c40f" stroke="#111" stroke-width="4" stroke-linejoin="round"/>
<circle cx="30" cy="24" r="4" fill="#e74c3c" stroke="#111" stroke-width="2"/>
<path d="M48 8l2 -6l2 6l6 2l-6 2l-2 6l-2 -6l-6 -2z" fill="#fff"><animate attributeName="opacity" values="1;0.1;1" dur="1.6s" repeatCount="indefinite"/></path>
</svg>`;

const SHOP_HAT = `<svg class="shop-overlay shop-hat" viewBox="0 0 80 40" aria-hidden="true">
<path d="M6 32C20 26 60 26 74 32C64 38 16 38 6 32Z" fill="#1b1b1b" stroke="#111" stroke-width="3"/>
<path d="M20 30L24 8C30 4 50 4 56 8L60 30Z" fill="#2b2b2b" stroke="#111" stroke-width="3"/>
<path d="M22 24H58V29H21Z" fill="#e74c3c"/>
<circle cx="66" cy="12" r="4" fill="#bbb" opacity=".6"><animate attributeName="cy" values="14;2" dur="2s" repeatCount="indefinite"/><animate attributeName="opacity" values=".7;0" dur="2s" repeatCount="indefinite"/></circle>
</svg>`;

const SHOP_HELMET = `<svg class="shop-overlay shop-helmet" viewBox="0 0 100 100" aria-hidden="true">
<circle cx="50" cy="50" r="44" fill="rgba(140,200,255,.18)" stroke="#d8e6f0" stroke-width="6"/>
<path d="M24 30A34 34 0 0 1 46 16" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".8"/>
<circle cx="50" cy="4" r="4" fill="#e74c3c"><animate attributeName="opacity" values="1;.2;1" dur="1s" repeatCount="indefinite"/></circle>
</svg>`;

let shopTab = 'featured';

// ===== OTWIERANIE =====

function openShop() {
    renderShopTabs();
    showScreen('screen-shop');
}

function closeShop() {
    showScreen('screen-login');
}

function openHostPack() {
    renderHostDetails();
    showScreen('screen-shop-host');
}

function closeHostPack() {
    showScreen('screen-shop');
}

function shopBuy() {
    showError('Płatności ruszą wkrótce - sklep jest w przygotowaniu', true);
}

// ===== ZAKŁADKI SKLEPU =====

function renderShopTabs() {
    const panel = byId('shop-tabs');
    panel.replaceChildren(...SHOP_TABS.map(tab => {
        const button = createElement('button', 'customize-categories-tile', tab.name);
        button.classList.toggle('selected', tab.id === shopTab);
        button.onclick = () => {
            if (shopTab === tab.id) return;
            shopTab = tab.id;
            panel.querySelectorAll('.customize-categories-tile').forEach(b => b.classList.toggle('selected', b === button));
            renderShopContent(true);
        };
        return button;
    }));
    renderShopContent();
}

function renderShopContent(animate = false) {
    const content = byId('shop-content');
    content.scrollTop = 0;
    if (shopTab === 'featured') {
        content.replaceChildren(
            renderHostHero(),
            createElement('div', 'shop-section', 'Nowy wygląd'),
            renderLooksGrid(SHOP_LOOKS.slice(0, 2)),
            createElement('div', 'shop-section', 'Komplet'),
            renderBundle()
        );
    } else if (shopTab === 'looks') {
        content.replaceChildren(
            createElement('p', 'shop-hint', 'Animowane rzeczy widzą wszyscy w pokoju'),
            renderLooksGrid(SHOP_LOOKS)
        );
    } else {
        const hint = createElement('button', 'shop-hint-gold');
        hint.append('Wszystkie paczki są w ', createElement('b', '', 'Pakiecie Hosta'), ' ->');
        hint.onclick = openHostPack;
        content.replaceChildren(hint, ...SHOP_PACKS.map(renderPackRow));
    }
    if (animate) {     // krótkie przenikanie przy zmianie zakładki
        content.classList.remove('shop-fade');
        void content.offsetWidth;
        content.classList.add('shop-fade');
    }
}

function shopIcon(name, className = 'shop-row-icon') {
    const span = createElement('span', className);
    if (GameIcons.has(name)) span.append(GameIcons.element(name));
    return span;
}

function buyButton(label, extraClass = '') {
    const button = createElement('button', `shop-buy ${extraClass}`.trim(), label);
    button.onclick = event => { event.stopPropagation(); shopBuy(); };
    return button;
}

function renderHostHero() {
    const card = createElement('div', 'shop-card shop-hero');
    card.onclick = openHostPack;
    card.append(
        createElement('span', 'shop-ribbon', 'Na zawsze'),
        createElement('h2', 'shop-hero-title', HOST_PACK.name),
        createElement('p', 'shop-hero-sub', 'Korzysta cały pokój')
    );
    const list = createElement('ul', 'shop-perks');
    HOST_HERO_PERKS.forEach(text => list.append(createElement('li', '', text)));
    card.append(list, buyButton(`Kup za ${HOST_PACK.price} zł`, 'shop-buy-gold shop-buy-wide'), createElement('div', 'shop-more', 'Zobacz więcej ->'));
    return card;
}

function renderLooksGrid(items) {
    const grid = createElement('div', 'shop-grid');
    items.forEach(item => {
        const tile = createElement('div', 'shop-item');
        if (item.animated) tile.append(createElement('span', 'shop-anim', 'Anim'));
        tile.append(renderShopPreview(item.preview));
        const name = createElement('div', 'shop-item-name', item.name);
        if (item.note) name.append(createElement('small', '', item.note));
        tile.append(name, buyButton(`${item.price} zł`));
        grid.append(tile);
    });
    return grid;
}

// Miniaturka: twój awatar z dodatkiem z przedmiotu - od razu widać, jak to będzie wyglądać
function renderShopPreview(kind) {
    const pic = createElement('div', `shop-pic shop-pic-${kind}`);
    if (kind === 'nick') {
        pic.append(createElement('span', 'shop-nick-rainbow', byId('input-name').value.trim() || 'Twój nick'));
        return pic;
    }
    if (kind.startsWith('card-')) {
        const card = createElement('div', 'shop-mini-card');
        card.append(createElement('span', 'shop-mini-stamp', 'Tajne'));
        pic.append(card);
        return pic;
    }
    const avatar = createElement('div', 'shop-pic-avatar');
    const img = createElement('img');
    img.src = avatarUrl(botConfig);
    img.alt = '';
    avatar.append(img);
    if (kind === 'mafia') avatar.insertAdjacentHTML('beforeend', SHOP_HAT);
    if (kind === 'space') avatar.insertAdjacentHTML('beforeend', SHOP_HELMET);
    if (kind === 'aura' || kind === 'fire') avatar.append(createElement('span', 'shop-aura'));
    pic.append(avatar);
    return pic;
}

function renderPackRow(pack) {
    const row = createElement('div', 'shop-card shop-pack');
    const text = createElement('div', 'shop-row-text', pack.name);
    text.append(createElement('small', '', pack.note));
    row.append(shopIcon('secret'), text, buyButton(`${pack.price} zł`));
    return row;
}

function renderBundle() {
    const card = createElement('div', 'shop-card shop-bundle');
    const fullPrice = HOST_PACK.price + SHOP_LOOKS.reduce((sum, item) => sum + item.price, 0);
    const text = createElement('div', 'shop-row-text');
    text.append(createElement('b', '', 'Wszystko'), 'Pakiet Hosta i cały wygląd');
    text.append(createElement('small', '', ''));
    text.lastChild.append('zamiast ', createElement('s', '', `${fullPrice} zł`));
    card.append(text, buyButton(`${SHOP_BUNDLE_PRICE} zł`));
    return card;
}

// ===== SZCZEGÓŁY PAKIETU HOSTA: kafelki, dotknięcie pokazuje opis =====

function renderHostDetails() {
    const content = byId('shop-host-content');
    content.scrollTop = 0;

    const avatar = createElement('div', 'shop-host-avatar');
    const img = createElement('img');
    img.src = avatarUrl(botConfig);
    img.alt = '';
    avatar.append(img);
    avatar.insertAdjacentHTML('beforeend', SHOP_CROWN);
    avatar.append(createElement('span', 'shop-host-tag', HOST_PACK.name));

    content.replaceChildren(
        avatar,
        createElement('div', 'shop-group', 'Dla całego pokoju'), renderPerkTiles(HOST_PACK.room),
        createElement('div', 'shop-group', 'Dla ciebie'), renderPerkTiles(HOST_PACK.me),
        createElement('p', 'shop-hint', 'Dotknij kafelka, aby zobaczyć opis')
    );
}

function renderPerkTiles(perks) {
    const grid = createElement('div', 'shop-tiles');
    perks.forEach(perk => {
        const tile = createElement('button', `shop-tile shop-tile-${perk.color}${perk.wide ? ' shop-tile-wide' : ''}`);
        tile.append(shopIcon(perk.icon, 'shop-tile-icon'), createElement('span', 'shop-tile-name', perk.name));
        tile.onclick = () => togglePerk(grid, tile, perk);
        grid.append(tile);
    });
    return grid;
}

// Opis wsuwa się pod rzędem dotkniętego kafelka (na całą szerokość). Drugie dotknięcie chowa
function togglePerk(grid, tile, perk) {
    const content = byId('shop-host-content');
    const wasOpen = tile.classList.contains('open');
    content.querySelectorAll('.shop-tile.open').forEach(t => t.classList.remove('open'));
    content.querySelectorAll('.shop-desc').forEach(d => d.remove());
    if (wasOpen) return;

    tile.classList.add('open');
    const desc = createElement('div', `shop-desc shop-tile-${perk.color}`);
    desc.append(createElement('b', '', perk.name), createElement('p', '', perk.desc));
    // ostatni kafelek w tym samym rzędzie: szerokie zajmują cały rząd, zwykłe są po dwa
    const tiles = [...grid.children].filter(el => el.classList.contains('shop-tile'));
    let rowEnd = tile;
    if (!tile.classList.contains('shop-tile-wide')) {
        let column = 0;
        for (const t of tiles) {
            if (t.classList.contains('shop-tile-wide')) { column = 0; continue; }
            if (t === tile) {
                const next = tiles[tiles.indexOf(t) + 1];
                if (column === 0 && next && !next.classList.contains('shop-tile-wide')) rowEnd = next;
                break;
            }
            column = (column + 1) % 2;
        }
    }
    rowEnd.after(desc);
    desc.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
