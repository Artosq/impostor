// SKLEP: Pakiet Hosta, Wspierający, zestawy wyglądu, paczki haseł, Komplet. Ceny i zawartość podaje serwer
// (/api/shop/catalog, payments.js). Płatność: Stripe (BLIK / Przelewy24 / karta) - tylko po zalogowaniu.
// Dwa ekrany: screen-shop (zakładki) i screen-shop-host (szczegóły pakietu) - przejścia robi showScreen.
// Ładowany po app.js (korzysta z byId, createElement, showScreen, showError, avatarUrl, botConfig, GameIcons, Auth, Inventory).

const SHOP_TABS = [
    { id: 'featured', name: 'Polecane' },
    { id: 'looks', name: 'Wygląd' },
    { id: 'packs', name: 'Kategorie' }
];

// Pakiet Hosta: soon - funkcja w przygotowaniu (kupujący dostaną ją za darmo, gdy będzie gotowa)
const HOST_PACK = {
    room: [
        { icon: 'secret', color: 'gold', name: 'Wszystkie paczki haseł', desc: 'Każda płatna paczka haseł - obecne i wszystkie nowe. Wybierasz je w poczekalni, a grają nimi wszyscy w pokoju.' },
        { icon: 'host', color: 'gold', name: 'Złoty pasek w poczekalni', desc: 'Wszyscy w pokoju widzą „Pokój z Pakietem Hosta” i komu zawdzięczają paczki.' },
        { icon: 'veteran', color: 'green', name: 'Turniej z podium', soon: true, desc: 'Gracie kilka rund, punkty się sumują, a na koniec podium dla najlepszych graczy wieczoru.' },
        { icon: 'jester', color: 'violet', name: 'Własne role', soon: true, desc: 'Ustawiasz zestaw ról: np. dwóch impostorów albo błazen i detektyw naraz. Do tego własne timery i więcej miejsc w pokoju.' },
        { icon: 'ui_players', color: 'blue', name: 'Stały pokój ekipy', soon: true, desc: 'Własny kod pokoju, np. ZIOMKI. Ekipa zawsze wchodzi pod ten sam kod i link.' },
        { icon: 'detective', color: 'blue', name: 'Historia wieczoru', soon: true, desc: 'Po grze widać wszystkie hasła, kto był impostorem w każdej rundzie i statystyki całej ekipy.' }
    ],
    me: [
        { icon: 'host', color: 'gold', name: 'Złota korona i złoty nick', wide: true, desc: 'Gdy jesteś gospodarzem: świecąca złota korona i złota obwódka awatara. Złoty nick w każdym pokoju.' }
    ]
};

const SHOP_CROWN = `<svg class="shop-crown" viewBox="0 0 60 40" aria-hidden="true">
<path d="M6 34L2 10L18 22L30 4L42 22L58 10L54 34Z" fill="#f1c40f" stroke="#111" stroke-width="4" stroke-linejoin="round"/>
<circle cx="30" cy="24" r="4" fill="#e74c3c" stroke="#111" stroke-width="2"/>
<path d="M48 8l2 -6l2 6l6 2l-6 2l-2 6l-2 -6l-6 -2z" fill="#fff"><animate attributeName="opacity" values="1;0.1;1" dur="1.6s" repeatCount="indefinite"/></path>
</svg>`;

let shopTab = 'featured';
let shopCatalog = null;         // { enabled, test, products: { id: { name, price, items } } }

const price = grosze => `${(grosze / 100).toFixed(2).replace('.', ',')} zł`;

async function loadShopCatalog() {
    try {
        shopCatalog = await (await fetch('/api/shop/catalog')).json();
    } catch (e) {
        shopCatalog = null;
    }
    return shopCatalog;
}

// ===== OTWIERANIE =====

async function openShop(tab) {
    if (tab && SHOP_TABS.some(t => t.id === tab)) shopTab = tab;
    if (!shopCatalog) await loadShopCatalog();
    renderShopTabs();
    showScreen('screen-shop');
}

function closeShop() {
    showScreen('screen-login');
}

// ===== KUPOWANIE =====

// Czy gracz ma już wszystko z produktu
function ownsProduct(id) {
    const product = shopCatalog && shopCatalog.products[id];
    if (!product || typeof Inventory === 'undefined') return false;
    const have = Inventory.owned();
    const unlocks = Inventory.unlocks();
    return product.items.every(item => have.has(item) || unlocks.has(item) || (item.startsWith('cat:') && unlocks.has('host')));
}

// Płatność: po zalogowaniu (Google / e-mail) serwer otwiera stronę Stripe; w trybie próbnym przyznaje od razu
async function shopBuy(productId = 'host') {
    if (!shopCatalog) await loadShopCatalog();
    if (!shopCatalog || !shopCatalog.enabled || typeof Auth === 'undefined' || !Auth.enabled) {
        return showError('Płatności ruszą wkrótce', true);
    }
    if (ownsProduct(productId)) return showError('Masz to już na koncie', true);
    if (Auth.isAnonymous()) {
        return openLogin('— Zaloguj się, aby kupić —');      // zakupy tylko na koncie - wtedy nie przepadną
    }
    const token = await Auth.getToken();
    if (!token) return showError('Brak połączenia z kontem - spróbuj za chwilę');
    showError('Otwieram płatność…', true);
    try {
        const res = await fetch('/api/shop/checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ product: productId })
        });
        const data = await res.json();
        if (data.url) { location.href = data.url; return; }
        if (data.granted) { showError('Gotowe - zakup jest na Twoim koncie', true); return; }
        if (data.error === 'login') return openLogin('— Zaloguj się, aby kupić —');
        showError(data.message || data.error || 'Nie udało się rozpocząć płatności');
    } catch (e) {
        showError('Brak połączenia - spróbuj za chwilę');
    }
}

// Powrót ze strony płatności (?zakup=ok / ?zakup=anulowano)
(function handlePaymentReturn() {
    const params = new URLSearchParams(location.search);
    const state = params.get('zakup');
    if (!state) return;
    params.delete('zakup');
    history.replaceState(null, '', location.pathname + (params.toString() ? `?${params}` : '') + location.hash);
    setTimeout(() => {
        if (state === 'ok') showError('Dziękujemy! Zakup pojawi się na koncie za chwilę', true);
        else showError('Płatność anulowana', true);
    }, 600);
})();

// odświeżenie sklepu, gdy przyjdą nowe zakupy (Inventory - "shop_owned")
if (typeof Inventory !== 'undefined') Inventory.onChange(() => { if (currentScreen === 'screen-shop') renderShopContent(); if (currentScreen === 'screen-shop-host') renderProductDetails(); });

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
    if (!shopCatalog) {
        content.replaceChildren(createElement('p', 'shop-hint', 'Nie udało się wczytać sklepu - sprawdź połączenie'));
        return;
    }
    const P = shopCatalog.products;
    if (shopTab === 'featured') {
        content.replaceChildren(
            renderHostHero(P.host),
            renderSupporter(P.supporter),
            createElement('div', 'shop-section', 'Komplet'),
            renderBundle(P.komplet)
        );
    } else if (shopTab === 'looks') {
        const bundles = Object.entries(P).filter(([id]) => id.startsWith('bundle-'));
        content.replaceChildren(
            createElement('p', 'shop-hint', 'Zestawy, których nie ma na ścieżce. Jedna płatność - kilka rzeczy.'),
            ...bundles.map(([id, p]) => renderLookBundle(id, p))
        );
    } else {
        const hint = createElement('button', 'shop-hint-gold');
        hint.append('Wszystkie paczki są w ', createElement('b', '', 'Pakiecie Hosta'), ' ->');
        hint.onclick = openHostPack;
        const packs = Object.entries(P).filter(([id]) => id.startsWith('cat-'));
        content.replaceChildren(hint, ...packs.map(([id, p]) => renderPackRow(id, p)));
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

function buyButton(productId, product, label, extraClass = '') {
    const owned = ownsProduct(productId);
    const button = createElement('button', `shop-buy ${owned ? 'shop-owned' : ''} ${extraClass}`.trim(), owned ? 'Masz' : (label || price(product.price)));
    button.onclick = event => { event.stopPropagation(); shopBuy(productId); };
    return button;
}

function renderHostHero(product) {
    const card = createElement('div', 'shop-card shop-hero');
    card.onclick = openHostPack;
    card.append(
        createElement('span', 'shop-ribbon', 'Na zawsze'),
        createElement('h2', 'shop-hero-title', 'Pakiet Hosta'),
        createElement('p', 'shop-hero-sub', 'Kupujesz raz - korzysta cały pokój')
    );
    const list = createElement('ul', 'shop-perks');
    ['Wszystkie paczki haseł', 'Złota korona i złoty nick', 'Złoty pasek w poczekalni', 'Kolejne funkcje za darmo w aktualizacjach']
        .forEach(text => list.append(createElement('li', '', text)));
    card.append(list, buyButton('host', product, `Kup za ${price(product.price)}`, 'shop-buy-gold shop-buy-wide'), createElement('div', 'shop-more', 'Zobacz więcej ->'));
    return card;
}

function renderSupporter(product) {
    const card = createElement('div', 'shop-card shop-supporter');
    const icon = createElement('span', 'shop-sup-icon');
    icon.innerHTML = PIX_HEART_SVG;
    const text = createElement('div', 'shop-row-text');
    text.append(createElement('b', '', 'Wspierający'), createElement('small', '', 'Złoty nick z serduszkiem - wspierasz twórcę gry'));
    card.append(icon, text, buyButton('supporter', product));
    return card;
}

// Zestaw wyglądu: obrazki rzeczy (części na Twoim awatarze, ramka, efekt, skórka) i cena
// Kolor tła obrazków zestawu (jak na makiecie: części awatara na tle w kolorze zestawu)
const BUNDLE_COLORS = { 'bundle-maszyna': '263238', 'bundle-slodziak': 'e91e63', 'bundle-detektyw': '795548' };

function renderLookBundle(id, product) {
    const card = createElement('div', 'shop-card shop-look-bundle');
    card.onclick = () => openProduct(id);
    const pics = createElement('div', 'bundle-pics');
    // obrazki: same części awatara (bez ramek, efektów i skórek - te są w opisie)
    product.items.filter(item => item.startsWith('part:')).forEach(item => {
        const info = Inventory.info(item);
        const img = createElement('img');
        img.src = avatarUrl({ style: avatarCatalog.rewards.style, [info.slot]: info.id, background: BUNDLE_COLORS[id] || '555555' });     // animowane się ruszają
        img.alt = '';
        pics.append(img);
    });
    const text = createElement('div', 'shop-row-text');
    text.append(createElement('b', '', product.name.replace('Zestaw ', '')));
    const list = createElement('small', 'bundle-list');
    product.items.forEach((item, i) => {
        const info = Inventory.info(item);
        if (i) list.append(' · ');
        list.append(createElement('span', `rc-${info.rarity}`, info.name.replace(/^[^:]+: /, '')));
    });
    text.append(list);
    text.append(createElement('span', 'shop-only', 'Tylko w sklepie'));
    card.append(pics, text, buyButton(id, product));
    return card;
}

function renderPackRow(id, product) {
    const row = createElement('div', 'shop-card shop-pack');
    const text = createElement('div', 'shop-row-text', product.name.replace('Paczka haseł: ', ''));
    text.append(createElement('small', '', '100 haseł · gdy jesteś gospodarzem'));
    row.append(shopIcon('secret'), text, buyButton(id, product));
    return row;
}

function renderBundle(product) {
    const card = createElement('div', 'shop-card shop-bundle');
    const text = createElement('div', 'shop-row-text');
    text.append(createElement('b', '', 'Wszystko'), 'Pakiet Hosta i wszystkie zestawy wyglądu');
    card.append(text, buyButton('komplet', product));
    return card;
}

// ===== SZCZEGÓŁY PRODUKTU (Pakiet Hosta albo zestaw wyglądu): podgląd na górze, lista zawartości, cena =====
let detailProduct = 'host';

const ITEM_DESCRIPTIONS = {
    kick: 'Efekt, gdy zostaniesz wyrzucony - widzi go cały pokój. Dotknij, aby zobaczyć',
    skin: 'Wygląd Twojej karty roli w czasie gry'
};
const SLOT_LABELS = { eyes: 'Oczy', mouth: 'Buzia', pattern: 'Wzór', background: 'Tło' };

function openProduct(id) {
    detailProduct = id;
    renderProductDetails();
    showScreen('screen-shop-host');
}
const openHostPack = () => openProduct('host');

function closeHostPack() {
    showScreen('screen-shop');
}

function renderProductDetails() {
    const id = detailProduct;
    const isHost = id === 'host';
    const product = shopCatalog && shopCatalog.products[id];
    const content = byId('shop-host-content');
    content.scrollTop = 0;

    byId('shop-detail-title').textContent = isHost ? 'Pakiet Hosta' : (product ? product.name.replace('Zestaw ', '') : '');
    byId('shop-detail-title').classList.toggle('shop-title-violet', !isHost);
    byId('shop-detail-sub').textContent = isHost ? 'Kupujesz raz - korzysta cały pokój' : 'Zestaw tylko ze sklepu - kupujesz raz, na zawsze';
    if (product) {
        byId('shop-host-price').textContent = price(product.price);
        const buy = byId('shop-host-buy');
        const owned = ownsProduct(id);
        buy.textContent = owned ? 'Masz to' : isHost ? 'Kup Pakiet Hosta' : 'Kup zestaw';
        buy.classList.toggle('shop-owned', owned);
        buy.classList.toggle('shop-buy-gold', isHost);
        buy.onclick = () => shopBuy(id);
    }

    // podgląd: Pakiet Hosta - Twój awatar ze złotą koroną; zestaw - wszystkie jego rzeczy osobno (jak miniaturki w panelu)
    let preview;
    if (isHost) {
        preview = createElement('div', 'detail-preview host');
        const img = createElement('img');
        img.src = avatarUrl(botConfig);
        img.alt = '';
        preview.append(img);
        preview.insertAdjacentHTML('beforeend', SHOP_CROWN);
    } else {
        // tło w kolorze zestawu (jak na karcie zestawu w sklepie), części narysowane na nim
        const color = BUNDLE_COLORS[id] || '555555';
        preview = createElement('div', 'detail-items');
        preview.style.setProperty('--bundle-bg', `#${color}`);
        (product ? product.items : []).forEach(item => {
            const info = Inventory.info(item);
            const box = createElement('div', `detail-item r-${info.rarity}`);
            const pic = rewardPicture(item, null, true);
            const img = pic.querySelector('img');
            if (img && info.kind === 'part') img.src = avatarUrl({ style: avatarCatalog.rewards.style, [info.slot]: info.id, background: color });
            box.append(pic);
            preview.append(box);
        });
    }

    const rows = isHost ? hostRows() : (product ? product.items.map(item => itemRow(item, preview)) : []);
    content.replaceChildren(preview, ...rows);
}

// Wiersz zawartości: obrazek, nazwa, krótki opis (i plakietka "Wkrótce")
function detailRow(picture, name, desc, extraClass = '', soon = false) {
    const row = createElement('div', `detail-row ${extraClass}`.trim());
    row.append(picture);
    const text = createElement('div', 'detail-text', name);
    if (desc) text.append(createElement('small', '', desc));
    row.append(text);
    if (soon) row.append(createElement('span', 'shop-soon-tag', 'Wkrótce'));
    return row;
}

function itemRow(item, preview) {
    const info = Inventory.info(item);
    const rarity = { common: 'Zwykła', rare: 'Rzadka', epic: 'Epicka', legendary: 'Złota' }[info.rarity] || '';
    const name = info.kind === 'part' ? info.name : { kick: 'Efekt: ', skin: 'Karta: ' }[info.kind] + info.name;
    const desc = info.kind === 'part' ? `${SLOT_LABELS[info.slot] || ''} awatara · ${rarity}` : ITEM_DESCRIPTIONS[info.kind];
    const row = detailRow(rewardPicture(item, null, true), name, desc, `r-${info.rarity}`);
    if (info.kind === 'kick') {
        row.classList.add('clickable');
        row.onclick = () => {
            const box = [...preview.querySelectorAll('.detail-item')].find(b => b.querySelector('.kick-thumb'));
            Cosmetics.playKick(box || preview, info.id);
        };
    }
    return row;
}

// Porównanie "Za darmo" i "Pakiet Hosta": [nazwa, za darmo, w pakiecie, wkrótce]
const HOST_COMPARE = [
    ['Gra i wszystkie tryby', true, true],
    ['Darmowe kategorie haseł', true, true],
    ['Własne kategorie', true, true],
    ['Paczki haseł (Seriale, Polska i każda nowa)', false, true],
    ['Złoty pasek w poczekalni', false, true],
    ['Złota korona i złoty nick', false, true],
    ['Turniej z podium', false, true, true],
    ['Własne role i ustawienia', false, true, true],
    ['Stały pokój ekipy', false, true, true],
    ['Historia wieczoru', false, true, true]
];
const PIX_YES = '<svg viewBox="0 0 7 6" shape-rendering="crispEdges"><path d="M6 0h1v2H6zM5 2h1v1H5zM4 3h1v1H4zM3 4h1v1H3zM2 5h1v1H2zM1 4h1v1H1zM0 3h1v1H0z" fill="currentColor"/></svg>';

function hostRows() {
    const table = createElement('div', 'compare-table');
    const head = createElement('div', 'compare-row compare-head');
    head.append(createElement('span', 'compare-name'), createElement('span', 'compare-col', 'Za darmo'), createElement('span', 'compare-col compare-host', 'Pakiet'));
    table.append(head);
    HOST_COMPARE.forEach(([name, free, host, soon]) => {
        const row = createElement('div', soon ? 'compare-row compare-soon' : 'compare-row');
        const label = createElement('span', 'compare-name', name);
        if (soon) label.append(createElement('small', '', 'wkrótce'));
        const cell = (yes, extra) => {
            const c = createElement('span', `compare-col ${extra || ''}`.trim());
            if (yes) c.innerHTML = PIX_YES;
            else c.append(createElement('i', 'compare-no'));
            c.classList.toggle('yes', yes);
            return c;
        };
        row.append(label, cell(free), cell(host, 'compare-host'));
        table.append(row);
    });
    return [
        table,
        createElement('p', 'shop-hint', '„Wkrótce” - kupujący dostaną za darmo, gdy będzie gotowe. Paczki działają w pokojach, w których jesteś gospodarzem.')
    ];
}

// cena paczek w wyborze kategorii i stan "Masz" - katalog wczytany od razu
loadShopCatalog();
