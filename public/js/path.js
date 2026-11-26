// EKRAN ŚCIEŻKI NAGRÓD: kafelki poziomów (sekcje po 10), odbieranie, skrzynka z ruletką, kupony na darmowy wieczór.
// Wejście: pasek poziomu w menu (czerwona kropka, gdy jest nagroda do odebrania). Zasady - rewards.js / inventory.js.
// Ładowany po app.js i inventory.js (korzysta z byId, createElement, showScreen, showError, avatarUrl, botConfig...).

const PATH_COLORS = { common: '#9e9e9e', rare: '#3498db', epic: '#b16cf0', legendary: '#f1c40f' };
const PIX_BOX = c => `<svg viewBox="0 0 12 10" shape-rendering="crispEdges"><path d="M0 2h12v8H0z" fill="${c}"/><path d="M0 2h12v2H0z" fill="#111" opacity=".35"/><path d="M5 2h2v8H5z" fill="#111" opacity=".25"/><path d="M5 4h2v2H5z" fill="#fff"/><path d="M1 0h10v2H1z" fill="${c}"/></svg>`;
const PIX_CHECK = '<svg viewBox="0 0 7 6" shape-rendering="crispEdges"><path d="M6 0h1v2H6zM5 2h1v1H5zM4 3h1v1H4zM3 4h1v1H3zM2 5h1v1H2zM1 4h1v1H1zM0 3h1v1H0z" fill="#111"/></svg>';
const CHEST_NAMES = { common: 'Skrzynka zwykła', rare: 'Skrzynka rzadka', epic: 'Skrzynka epicka', legendary: 'Skrzynka złota' };
const PRIZE_RARITY_NAMES = { common: 'Zwykła', rare: 'Rzadka', epic: 'Epicka', legendary: 'Złota' };
const PATH_AHEAD = 6;           // ile poziomów ponad obecny pokazujemy po końcu zaplanowanej ścieżki

function openPath() {
    if (typeof Inventory === 'undefined' || !Inventory.ready()) return;
    renderPath();
    showScreen('screen-path');
    // przewinięcie do pierwszej nagrody do odebrania albo do obecnego poziomu
    const target = byId('path-list').querySelector('.path-node.st-claim, .road-me, .path-node.st-now');
    if (target) target.scrollIntoView({ block: 'center' });
}

function closePath() {
    showScreen('screen-login');
}

// Obrazek nagrody: rzecz (część / efekt / skórka) albo skrzynka w kolorze rzadkości
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
    if (item === 'host-trial' || (reward && reward.hostTrial)) return { name: 'Darmowy wieczór z Pakietem Hosta', rarity: 'legendary', sub: 'kupon na 24 h' };
    if (item === 'none') return { name: 'Wszystko zebrane!', rarity: 'common', sub: '' };
    if (item) {
        const info = Inventory.info(item);
        const kind = { kick: 'Efekt: ', skin: 'Karta: ' }[info.kind] || '';
        return { name: kind + info.name, rarity: info.rarity, sub: reward && reward.random ? 'ze skrzynki' : 'gwarantowana' };
    }
    const rarity = reward.random[0];
    return { name: CHEST_NAMES[rarity], rarity, sub: 'szansa na lepszą' };
}

// Pasek szans skrzynki w kolorach rzadkości
function chestOddsBar(odds) {
    const bar = createElement('span', 'path-odds');
    Object.entries(odds || {}).forEach(([r, p]) => {
        const part = createElement('i');
        part.style.flex = p;
        part.style.background = PATH_COLORS[r];
        bar.append(part);
    });
    return bar;
}

function renderPath() {
    const profile = ProfileStore.get();
    const level = profile.level;
    const needed = getRequiredExp(level);
    byId('path-level').textContent = `Poz. ${level}`;
    byId('path-exp').textContent = `${profile.exp}/${needed}`;
    byId('path-fill').style.width = `${Math.min(100, profile.exp / needed * 100)}%`;
    renderVoucherBar(byId('path-voucher'));

    const last = Math.max(avatarCatalogLastPathLevel(), level + PATH_AHEAD);
    const list = byId('path-list');
    list.replaceChildren(buildRoad(last, level, profile.exp / needed));

    // następna złota nagroda
    let nextGold = null;
    for (let l = level + 1; l <= last + 20 && !nextGold; l++) {
        const r = Inventory.rewardAt(l);
        if (r && ((r.random && r.random[0] === 'legendary') || r.hostTrial)) nextGold = l;
    }
    byId('path-next').textContent = nextGold ? `Następna złota nagroda: poziom ${nextGold}` : '';

    // DEWELOPER: przycisk do odbierania nagród od nowa (tylko z dostępem do wszystkiego)
    if (Inventory.isDev()) {
        const reset = createElement('button', 'path-dev-reset', 'DEV: odbierz nagrody od nowa');
        reset.onclick = () => { if (confirm('Wyczyścić odebrane nagrody i kupony?')) Inventory.devResetPath(); };
        list.append(reset);
    }
}

function avatarCatalogLastPathLevel() {
    return Math.max(...Object.keys(avatarCatalog.rewards.path).map(Number));
}

// ===== DROGA: nagrody jako okrągłe przystanki na krętej ścieżce =====
// Przystanki na przemian: środek, prawo, środek, lewo. Tor jest zielony do obecnego poziomu i dalej
// tyle, ile EXP masz w tym poziomie; Twój robot stoi jak pionek przy przystanku z następną nagrodą.
const ROAD_ROW = 128;           // odstęp między przystankami (px)
const ROAD_TOP = 52;            // środek pierwszego przystanku
const ROAD_X = [50, 76, 50, 24];    // położenie przystanków w poprzek (% szerokości)

function buildRoad(last, level, progress) {
    const levels = [];
    for (let l = 2; l <= last; l++) levels.push(l);
    const point = i => [ROAD_X[i % ROAD_X.length], ROAD_TOP + i * ROAD_ROW];
    const height = ROAD_TOP * 2 + 60 + (levels.length - 1) * ROAD_ROW;     // +60: napis i przycisk pod ostatnim przystankiem
    const road = createElement('div', 'path-road');
    road.style.height = `${height}px`;

    // tor: cały szary, przebyta część zielona (do obecnego poziomu i kawałek dalej wg EXP)
    const pts = levels.map((_, i) => point(i));
    const at = levels.indexOf(level);
    const t = Math.min(1, Math.max(0, progress || 0));
    let done = [];
    if (at >= 0 && at < pts.length - 1) {
        const [a, b] = [pts[at], pts[at + 1]];
        done = [...pts.slice(0, at + 1), [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]];
    } else if (level > levels[levels.length - 1]) {
        done = pts;
    }
    const line = list => list.length ? `M${list.map(p => p.join(' ')).join(' L')}` : '';
    road.innerHTML = `<svg class="road-svg" viewBox="0 0 100 ${height}" preserveAspectRatio="none" aria-hidden="true">
        <path d="${line(pts)}" class="road-line"/><path d="${line(done)}" class="road-line road-done"/></svg>`;

    levels.forEach((l, i) => road.append(pathNode(l, level, point(i))));
    return road;
}

function pathNode(l, level, [x, y]) {
    const reward = Inventory.rewardAt(l);
    const claimed = Inventory.claimedAt(l);
    const state = claimed !== undefined ? 'done' : l <= level ? 'claim' : l === level + 1 ? 'now' : 'lock';
    const item = claimed !== undefined ? claimed : reward.item || (reward.hostTrial ? 'host-trial' : null);
    const label = rewardLabel(item, reward);

    const node = createElement('div', `path-node st-${state} r-${label.rarity}`);
    node.style.left = `${x}%`;
    node.style.top = `${y}px`;
    const ring = createElement('div', 'path-ring');
    ring.append(rewardPicture(item, reward.random && reward.random[0]), createElement('span', 'path-lv', String(l)));
    if (state === 'done') ring.append(Object.assign(createElement('span', 'path-ok'), { innerHTML: PIX_CHECK }));
    // pionek: Twój robot przy przystanku, do którego idziesz (po stronie bliżej środka)
    if (state === 'now') {
        const me = createElement('div', `road-me ${x > 50 ? 'me-left' : 'me-right'}`);
        const img = createElement('img');
        img.src = avatarUrl(botConfig, undefined, true);
        img.alt = '';
        me.append(img);
        ring.append(me);
    }
    node.append(ring, createElement('div', 'path-node-name', label.name.replace(/^(Oczy|Buzia|Wzór|Tło|Efekt|Karta): /, '')));
    // skrzynka (jeszcze nieotwarta): pasek szans
    if (!item && reward.odds) node.append(chestOddsBar(reward.odds));

    if (state === 'claim') {
        const button = createElement('button', 'path-claim', 'Odbierz');
        button.onclick = () => claimLevel(l, button);
        node.append(button);
    }
    return node;
}

async function claimLevel(level, button) {
    button.disabled = true;
    const reward = Inventory.rewardAt(level);
    if (reward && reward.random) {
        const dealt = await Inventory.deal(level);
        button.disabled = false;
        if (dealt.error) return showError(dealt.error);
        return showChest(level, dealt.count, dealt.chest || reward.chest);
    }
    const result = await Inventory.claim(level);
    if (result.error) {
        button.disabled = false;
        return showError(result.error);
    }
    renderPath();
    updatePathDot();
    showReveal(result.item, result.random, false, result.chest);
}

// ===== KUPONY NA DARMOWY WIECZÓR Z PAKIETEM HOSTA =====
// Odebrany kupon czeka; gracz włącza go sam (tu albo w poczekalni). Kto ma Pakiet Hosta, nie potrzebuje kuponów.
function trialWord(n) {
    if (n === 1) return '1 darmowy wieczór';
    const last = n % 10, tens = n % 100;
    return `${n} ${last >= 2 && last <= 4 && (tens < 12 || tens > 14) ? 'darmowe wieczory' : 'darmowych wieczorów'}`;
}

function renderVoucherBar(bar) {
    if (!bar) return;
    const trial = Inventory.trial();
    const hasHost = Inventory.unlocks().has('host');
    bar.replaceChildren();
    bar.className = 'path-voucher hidden';
    if (hasHost || (!trial.left && !trial.activeUntil)) return;
    bar.classList.remove('hidden');
    const pic = createElement('span', 'path-voucher-pic');
    pic.innerHTML = PIX_CROWN_SVG;
    const text = createElement('b');
    if (trial.activeUntil) {
        bar.classList.add('active');
        text.append('Darmowy wieczór trwa', createElement('small', '', `zostało ${formatLeft(trial.activeUntil - Date.now())}${trial.left ? ` · w zapasie: ${trial.left}` : ''}`));
        bar.append(pic, text);
        return;
    }
    text.append(`Masz ${trialWord(trial.left)}`, createElement('small', '', 'Pakiet Hosta dla Twojego pokoju na 24 h'));
    const button = createElement('button', 'path-voucher-btn', 'Włącz');
    button.onclick = activateTrial;
    bar.append(pic, text, button);
}

function activateTrial() {
    if (!ProfileStore.isAccount() || Auth.isAnonymous()) return openLogin('— Zaloguj się, aby użyć —');
    if (!Inventory.startTrial()) return;
    showError('Darmowy wieczór włączony - działa przez 24 h, gdy jesteś gospodarzem', true);
}

// ===== OTWIERANIE NAGRODY =====
// Nagroda gwarantowana: dotknięcie -> skrzynka pęka -> nagroda. opened: od razu nagroda (np. po wyborze karty).
function showReveal(item, random, opened = false, chestTier = null) {
    const old = byId('path-reveal');
    if (old) old.remove();
    const overlay = createElement('div', 'path-reveal');
    overlay.id = 'path-reveal';
    const label = rewardLabel(item, random ? { random: [] } : null);
    const color = PATH_COLORS[label.rarity] || '#9e9e9e';
    // skrzynka ma kolor swojej rzadkości - nie zdradza wygranej
    const chestColor = PATH_COLORS[chestTier] || color;
    overlay.style.setProperty('--glow', chestColor);

    const stage = createElement('div', 'reveal-stage');
    const chest = createElement('button', 'reveal-box');
    chest.setAttribute('aria-label', 'Otwórz skrzynkę');
    chest.innerHTML = PIX_BOX(chestColor);
    const hint = createElement('p', 'reveal-hint', 'Dotknij, aby otworzyć');
    stage.append(chest, hint);
    if (chestTier) {
        stage.prepend(createElement('div', 'reveal-chest-name', CHEST_NAMES[chestTier]));
        stage.append(chestOddsBar(Inventory.chests()[chestTier]));
    }

    const prize = createElement('div', 'reveal-prize');
    const pic = rewardPicture(item, null);
    pic.classList.add('reveal-pic');
    // część awatara: Twoja postać już z tą częścią (sama część na szarym tle przytłaczała)
    const won = item && item !== 'none' && item !== 'host-trial' ? Inventory.info(item) : null;
    if (won && won.kind === 'part') {
        const img = pic.querySelector('img');
        if (img) img.src = avatarUrl({ ...botConfig, [won.slot]: won.id });
    }
    // kręcące się promienie ZA nagrodą (pojawiają się po otwarciu)
    prize.append(createElement('div', 'reveal-rays'), pic, createElement('h3', '', label.name));
    prize.append(createElement('p', 'reveal-rarity', item === 'host-trial' ? 'Kupon czeka - włączysz go, kiedy zechcesz' : PRIZE_RARITY_NAMES[label.rarity] || ''));

    const buttons = createElement('div', 'reveal-buttons');
    const later = createElement('button', 'btn-join', item === 'host-trial' ? 'Zachowaj na później' : 'Później');
    later.onclick = () => overlay.remove();
    if (item === 'host-trial') {
        const hasHost = Inventory.unlocks().has('host');
        if (!hasHost) {
            const start = createElement('button', 'btn-create', 'Włącz teraz (24 h)');
            start.onclick = () => { overlay.remove(); activateTrial(); };
            buttons.append(start);
        }
        buttons.append(later);
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

    function reveal() {
        overlay.style.setProperty('--glow', color);
        overlay.classList.add('revealed');
        burst(stage, color);
        sfx.play(['epic', 'legendary'].includes(label.rarity) ? 'badge' : 'hit');
    }
    function open() {
        if (overlay.classList.contains('opening')) return;
        overlay.classList.add('opening');           // skrzynka trzęsie się mocniej...
        setTimeout(reveal, opened ? 0 : 450);       // ...pęka, a nagroda wyskakuje
    }
    if (opened) open();
    else {
        chest.onclick = open;
        hint.onclick = open;
    }
}

// ===== SKRZYNKA: rozdanie kart i wybór =====
// Każda z 5 kart to osobno wylosowana rzecz (losuje serwer, u gościa rewards.js). Gracz wybiera kartę i dostaje
// dokładnie to, co na niej jest; potem odwracają się pozostałe - widać, co jeszcze mógł mieć.
// Zawartość kart przychodzi dopiero po wyborze, więc nie da się jej podejrzeć.
const DEAL_SWAPS = [150, 170, 200, 240, 290, 350];     // czas kolejnych tasowań (ms) - coraz wolniej

function dealSlot(k) {          // k: -2..2 -> położenie w wachlarzu
    return { x: k * 56, y: Math.abs(k) * 10, r: k * 7 };
}

// Okno skrzynki: skrzynka w kolorze swojej rzadkości, nazwa i szanse -> dotknięcie -> karty
function showChest(level, count, chestTier) {
    const old = byId('path-reveal');
    if (old) old.remove();
    const overlay = createElement('div', 'path-reveal');
    overlay.id = 'path-reveal';
    const color = PATH_COLORS[chestTier] || '#9e9e9e';
    overlay.style.setProperty('--glow', color);

    const stage = createElement('div', 'reveal-stage');
    const chest = createElement('button', 'reveal-box');
    chest.setAttribute('aria-label', 'Otwórz skrzynkę');
    chest.innerHTML = PIX_BOX(color);
    const hint = createElement('p', 'reveal-hint', 'Dotknij, aby otworzyć');
    stage.append(createElement('div', 'reveal-chest-name', CHEST_NAMES[chestTier]), chest, hint, chestOddsBar(Inventory.chests()[chestTier]));
    overlay.append(stage);
    byId('card').append(overlay);

    const open = () => {
        if (overlay.classList.contains('opening')) return;
        overlay.classList.add('opening');
        setTimeout(() => dealCards(overlay, level, count), 450);
    };
    chest.onclick = open;
    hint.onclick = open;
}

function dealCards(overlay, level, count) {
    const deal = createElement('div', 'reveal-deal');
    const prompt = createElement('p', 'deal-prompt', 'Wybierz kartę');
    const cards = [];
    for (let i = 0; i < count; i++) {
        const card = createElement('div', 'deal-card');
        const inner = createElement('div', 'deal-inner');
        inner.append(createElement('div', 'deal-back', '?'), createElement('div', 'deal-front'));
        inner.style.setProperty('--d', `${-i * 0.27}s`);     // falowanie kart przy wyborze - każda w innym rytmie
        card.append(inner);
        deal.append(card);
        cards.push(card);
    }
    deal.append(prompt);
    overlay.classList.add('rolling');
    overlay.append(deal);

    const mid = (count - 1) / 2;
    const place = (card, k, ms) => {
        const s = dealSlot(k);
        card.style.transition = `transform ${ms}ms cubic-bezier(.3, .7, .3, 1)`;
        card.style.transform = `translate(${s.x}px, ${s.y}px) rotate(${s.r}deg)`;
        card.style.zIndex = String(10 - Math.abs(k));
    };
    // start: stos na środku, potem wachlarz i tasowanie (dla oka - karty są już rozdane)
    cards.forEach(c => { c.style.transform = 'translate(0, 40px) scale(.6)'; });
    const order = cards.map((_, i) => i - mid);         // order[karta] = miejsce w wachlarzu
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let at = 120;
    setTimeout(() => cards.forEach((c, i) => place(c, order[i], 320)), at);
    at += 420;
    (reduced ? [] : DEAL_SWAPS).forEach(ms => {
        setTimeout(() => {
            const a = Math.floor(Math.random() * count);
            let b = Math.floor(Math.random() * (count - 1));
            if (b >= a) b++;
            [order[a], order[b]] = [order[b], order[a]];
            place(cards[a], order[a], ms);
            place(cards[b], order[b], ms);
            cards[a].style.zIndex = '20';
            sfx.play('tick');
        }, at);
        at += ms + 40;
    });
    setTimeout(() => {
        deal.classList.add('picking');
        cards.forEach((c, i) => { c.onclick = () => pick(c, i); });
    }, at + 100);

    async function pick(chosen, index) {
        if (!deal.classList.contains('picking')) return;
        deal.classList.remove('picking');
        deal.classList.add('picked');
        prompt.textContent = '';
        // wybrana unosi się na środek; pozostałe zjeżdżają w równy rząd pod nią
        const rest = cards.map((c, i) => [c, order[i]]).filter(([c]) => c !== chosen).sort((a, b) => a[1] - b[1]);
        rest.forEach(([c], j) => {
            c.style.transition = `transform .45s cubic-bezier(.3, .7, .3, 1) ${j * 60}ms`;
            c.style.transform = `translate(${(j - (rest.length - 1) / 2) * 62}px, 150px) scale(.68)`;
            c.style.zIndex = '5';
        });
        deal.classList.add('dealt');
        chosen.classList.add('deal-win');
        chosen.style.transition = 'transform .4s cubic-bezier(.2, 1.4, .4, 1)';
        chosen.style.transform = 'translate(0, -6px) scale(1.25)';
        chosen.style.zIndex = '30';
        sfx.play('tick');

        // wybór idzie do serwera; wraca nagroda i zawartość wszystkich kart
        const [result] = await Promise.all([Inventory.pick(level, index), new Promise(r => setTimeout(r, 420))]);
        if (result.error) {
            overlay.remove();
            renderPath();
            return showError(result.error);
        }
        cards.forEach((c, i) => {
            const face = result.cards[i] || 'none';
            const front = c.querySelector('.deal-front');
            front.className = `deal-front r-${face === 'none' ? 'common' : Inventory.info(face).rarity}`;
            front.replaceChildren(rewardPicture(face, null));
        });
        renderPath();
        updatePathDot();
        chosen.classList.add('flipped');
        sfx.play('voteIn');
        // po chwili odwracają się pozostałe - co jeszcze można było wybrać
        setTimeout(() => {
            cards.forEach(c => { if (c !== chosen) c.classList.add('flipped', 'deal-miss'); });
            prompt.textContent = 'Pozostałe karty: to mogło wypaść';
        }, 900);
        setTimeout(() => showReveal(result.item, true, true), 3200);
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

if (typeof Inventory !== 'undefined') Inventory.onChange(() => { updatePathDot(); if (currentScreen === 'screen-path') renderVoucherBar(byId('path-voucher')); });
ProfileStore.onChange(() => { updatePathDot(); if (currentScreen === 'screen-path') renderPath(); });
