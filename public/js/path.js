// EKRAN ŚCIEŻKI NAGRÓD: lista poziomów z nagrodami, odbieranie (skrzynka z losową nagrodą), darmowy wieczór.
// Wejście: pasek poziomu w menu (czerwona kropka, gdy jest nagroda do odebrania). Zasady - rewards.js / inventory.js.
// Ładowany po app.js i inventory.js (korzysta z byId, createElement, showScreen, showError, avatarUrl, botConfig...).

const PATH_COLORS = { common: '#9e9e9e', rare: '#3498db', epic: '#b16cf0', legendary: '#f1c40f' };
const PIX_BOX = c => `<svg viewBox="0 0 12 10" shape-rendering="crispEdges"><path d="M0 2h12v8H0z" fill="${c}"/><path d="M0 2h12v2H0z" fill="#111" opacity=".35"/><path d="M5 2h2v8H5z" fill="#111" opacity=".25"/><path d="M5 4h2v2H5z" fill="#fff"/><path d="M1 0h10v2H1z" fill="${c}"/></svg>`;
const PIX_CHECK = '<svg viewBox="0 0 7 6" shape-rendering="crispEdges"><path d="M6 0h1v2H6zM5 2h1v1H5zM4 3h1v1H4zM3 4h1v1H3zM2 5h1v1H2zM1 4h1v1H1zM0 3h1v1H0z" fill="#111"/></svg>';
const RANDOM_NAMES = { common: 'Losowa zwykła', rare: 'Losowa rzadka', epic: 'Losowa epicka', legendary: 'Losowa złota' };
const PATH_AHEAD = 6;           // ile poziomów ponad obecny pokazujemy po końcu zaplanowanej ścieżki

function openPath() {
    if (typeof Inventory === 'undefined' || !Inventory.ready()) return;
    renderPath();
    showScreen('screen-path');
    // przewinięcie do pierwszej nagrody do odebrania albo do obecnego poziomu
    const target = byId('path-list').querySelector('.path-row.st-claim, .path-row.st-now');
    if (target) target.scrollIntoView({ block: 'center' });
}

function closePath() {
    showScreen('screen-login');
}

// Obrazek nagrody: rzecz (część / ramka / efekt / skórka) albo skrzynka w kolorze rzadkości
// animate: animowane części ruszają się (sklep); na ścieżce stoją, żeby lista była lekka
function rewardPicture(item, randomRarity, animate = false) {
    const pic = createElement('span', 'path-pic');
    if (!item) {
        pic.innerHTML = PIX_BOX(PATH_COLORS[randomRarity] || '#9e9e9e');
        return pic;
    }
    if (item === 'host-trial') {
        pic.innerHTML = PIX_CROWN_SVG;
        pic.classList.add('path-pic-crown');
        return pic;
    }
    if (item === 'none') {
        pic.innerHTML = PIX_CHECK;
        return pic;
    }
    const info = Inventory.info(item);
    if (info.kind === 'part') {
        const img = createElement('img');
        img.src = avatarUrl({ style: avatarCatalog.rewards.style, [info.slot]: info.id }, undefined, !animate);
        img.alt = '';
        pic.append(img);
    } else if (info.kind === 'kick') {
        pic.append(Cosmetics.kickThumb(info.id));
    } else if (info.kind === 'skin') {
        pic.append(Cosmetics.skinThumb(info.id));
    }
    return pic;
}

function rewardLabel(item, reward) {
    if (item === 'host-trial' || (reward && reward.hostTrial)) return { name: 'Wieczór z Pakietem Hosta', rarity: 'legendary', sub: '24 h dla Twojego pokoju' };
    if (item === 'none') return { name: 'Wszystko zebrane!', rarity: 'common', sub: '' };
    if (item) {
        const info = Inventory.info(item);
        const kind = { kick: 'Efekt: ', skin: 'Karta: ' }[info.kind] || '';
        return { name: kind + info.name, rarity: info.rarity, sub: reward && reward.random ? 'wylosowana' : 'gwarantowana' };
    }
    const rarity = reward.random[0];
    return { name: RANDOM_NAMES[rarity], rarity, sub: 'losowa' };
}

function renderPath() {
    const profile = ProfileStore.get();
    const level = profile.level;
    const needed = getRequiredExp(level);
    byId('path-level').textContent = `Poz. ${level}`;
    byId('path-exp').textContent = `${profile.exp}/${needed}`;
    byId('path-fill').style.width = `${Math.min(100, profile.exp / needed * 100)}%`;

    const last = Math.max(avatarCatalogLastPathLevel(), level + PATH_AHEAD);
    const list = byId('path-list');
    const rows = [];
    for (let l = 2; l <= last; l++) rows.push(pathRow(l, level));
    list.replaceChildren(...rows);

    // następna złota nagroda
    let nextGold = null;
    for (let l = level + 1; l <= last + 20 && !nextGold; l++) {
        const r = Inventory.rewardAt(l);
        if (r && ((r.random && r.random[0] === 'legendary') || r.hostTrial)) nextGold = l;
    }
    byId('path-next').textContent = nextGold ? `Następna złota nagroda: poziom ${nextGold}` : '';
}

function avatarCatalogLastPathLevel() {
    return Math.max(...Object.keys(avatarCatalog.rewards.path).map(Number));
}

function pathRow(l, level) {
    const reward = Inventory.rewardAt(l);
    const claimed = Inventory.claimedAt(l);
    const state = claimed !== undefined ? 'done' : l <= level ? 'claim' : l === level + 1 ? 'now' : 'lock';
    const item = claimed !== undefined ? claimed : reward.item || (reward.hostTrial ? 'host-trial' : null);
    const label = rewardLabel(claimed !== undefined ? claimed : item, reward);

    const row = createElement('div', `path-row st-${state}`);
    row.append(createElement('div', 'path-num', String(l)));
    const box = createElement('div', `path-reward r-${label.rarity}`);
    box.append(rewardPicture(item, reward.random && reward.random[0]));
    const text = createElement('div', 'path-name', label.name);
    if (label.sub) text.append(createElement('small', '', label.sub));
    box.append(text);

    if (state === 'claim') {
        const button = createElement('button', 'path-claim', 'Odbierz');
        button.onclick = () => claimLevel(l, button);
        box.append(button);
    } else if (state === 'done' && claimed === 'host-trial' && Inventory.trial().available) {
        const button = createElement('button', 'path-claim', 'Włącz');
        button.onclick = () => showReveal('host-trial', false, true);
        box.append(button);
    } else if (state === 'done') {
        box.append(Object.assign(createElement('span', 'path-ok'), { innerHTML: PIX_CHECK }));
    } else {
        box.append(Object.assign(createElement('span', 'path-lock'), { innerHTML: PIX_LOCK_SVG }));
    }
    row.append(box);
    return row;
}

async function claimLevel(level, button) {
    button.disabled = true;
    const result = await Inventory.claim(level);
    if (result.error) {
        button.disabled = false;
        return showError(result.error);
    }
    renderPath();
    updatePathDot();
    showReveal(result.item, result.random);
}

// ===== OTWIERANIE NAGRODY: skrzynka - dotknięcie - nagroda wyskakuje =====
// opened: bez skrzynki (np. "Włącz" przy odebranym wcześniej darmowym wieczorze)
function showReveal(item, random, opened = false) {
    const old = byId('path-reveal');
    if (old) old.remove();
    const overlay = createElement('div', 'path-reveal');
    overlay.id = 'path-reveal';
    const label = rewardLabel(item, random ? { random: [] } : null);
    const color = PATH_COLORS[label.rarity] || '#9e9e9e';
    overlay.style.setProperty('--glow', color);

    // skrzynka: kołysze się i świeci, dopóki gracz jej nie dotknie
    const stage = createElement('div', 'reveal-stage');
    const chest = createElement('button', 'reveal-box');
    chest.setAttribute('aria-label', 'Otwórz skrzynkę');
    chest.innerHTML = PIX_BOX(color);
    const hint = createElement('p', 'reveal-hint', 'Dotknij, aby otworzyć');
    stage.append(chest, hint);

    const prize = createElement('div', 'reveal-prize');
    const pic = rewardPicture(item, null);
    pic.classList.add('reveal-pic');
    // część awatara: Twoja postać już z tą częścią (sama część na szarym tle przytłaczała)
    const won = item && item !== 'none' && item !== 'host-trial' ? Inventory.info(item) : null;
    if (won && won.kind === 'part') {
        const img = pic.querySelector('img');
        if (img) img.src = avatarUrl({ ...botConfig, [won.slot]: won.id });
    }
    // kręcące się promienie ZA nagrodą (pojawiają się po otwarciu skrzynki)
    prize.append(createElement('div', 'reveal-rays'), pic, createElement('h3', '', label.name));
    const rarityName = { common: 'Zwykła', rare: 'Rzadka', epic: 'Epicka', legendary: 'Złota' }[label.rarity] || '';
    prize.append(createElement('p', 'reveal-rarity', item === 'host-trial' ? '24 h Pakietu Hosta dla Twojego pokoju' : rarityName));

    const buttons = createElement('div', 'reveal-buttons');
    const later = createElement('button', 'btn-join', 'Później');
    later.onclick = () => overlay.remove();
    if (item === 'host-trial') {
        const canUse = ProfileStore.isAccount() && !Auth.isAnonymous();
        const start = createElement('button', 'btn-create', canUse ? 'Włącz teraz (24 h)' : 'Zaloguj się, aby użyć');
        start.onclick = () => {
            if (!canUse) { overlay.remove(); return openLogin('— Zaloguj się, aby użyć —'); }
            Inventory.startTrial();
            showError('Darmowy wieczór włączony - działa przez 24 h, gdy jesteś gospodarzem', true);
            overlay.remove();
            renderPath();
        };
        buttons.append(start, later);
    } else if (item && item !== 'none') {
        const wear = createElement('button', 'btn-create', 'Załóż teraz');
        wear.onclick = () => { equipItem(item); overlay.remove(); };
        buttons.append(wear, later);
    } else {
        buttons.append(later);
    }
    prize.append(buttons);
    overlay.append(stage, prize);
    byId('card').append(overlay);

    function open() {
        if (overlay.classList.contains('opening')) return;
        overlay.classList.add('opening');           // skrzynka trzęsie się mocniej...
        setTimeout(() => {
            overlay.classList.add('revealed');      // ...pęka, a nagroda wyskakuje
            burst(stage, color);
            sfx.play('hit');
        }, opened ? 0 : 450);
    }
    if (opened) open();
    else {
        chest.onclick = open;
        hint.onclick = open;
    }
}

// Pikselowe iskry z otwartej skrzynki (style cząsteczek jak w efekcie konfetti - cosmetics.js / style.css)
function burst(stage, color) {
    const layer = createElement('div', 'kx kx-conf reveal-burst');
    const colors = [color, color, '#ffffff', '#f1c40f'];
    for (let i = 0; i < 28; i++) {
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.6;
        const dist = 60 + Math.random() * 70;
        const p = createElement('span', 'kx-p');
        p.style.setProperty('--c', colors[i % colors.length]);
        p.style.setProperty('--s', `${Math.round(5 + Math.random() * 5)}px`);
        p.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
        p.style.setProperty('--dy', `${Math.sin(angle) * dist}px`);
        p.style.setProperty('--r', `${Math.round((Math.random() - 0.5) * 720)}deg`);
        p.style.setProperty('--t', `${(0.9 + Math.random() * 0.5).toFixed(2)}s`);
        layer.append(p);
    }
    stage.append(layer);
    setTimeout(() => layer.remove(), 1700);
}

function equipItem(item) {
    const info = Inventory.info(item);
    if (info.kind === 'part') {
        botConfig[info.slot] = info.id;
        saveAvatarConfig();
        changeNick();
    } else if (['kick', 'skin'].includes(info.kind)) {
        Inventory.setLook(info.kind, info.id);
    }
    showError(`Założono: ${info.name}`, true);
}

// Czerwona kropka na pasku poziomu: jest nagroda do odebrania
function updatePathDot() {
    const bar = byId('player-stats-rest');
    if (!bar || typeof Inventory === 'undefined' || !Inventory.ready()) return;
    bar.classList.toggle('has-new', Inventory.unclaimed().length > 0);
}

if (typeof Inventory !== 'undefined') Inventory.onChange(updatePathDot);
ProfileStore.onChange(() => { updatePathDot(); if (currentScreen === 'screen-path') renderPath(); });
