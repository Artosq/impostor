const RESULTS_SUSPENSE_MS = 2000; // tyle trwa "liczenie głosów", zanim pojawi się werdykt
const REVEAL_DELAY_MS = 2600;    // po tylu ms odkryty impostor zrzuca przebranie na ekranie wyników
const HOST_CROWN_SVG = '<svg viewBox="0 0 26 20" fill="#f1c40f" stroke="black" stroke-width="2" stroke-linejoin="round">'
    + '<path d="M3 17L2 5l6 5 5-8 5 8 6-5-1 12z"/>'
    + '<circle cx="13" cy="13" r="1.6" fill="#e74c3c" stroke="none"/></svg>';
const SCREENS = ['screen-login', 'screen-lobby', 'screen-game', 'screen-vote', 'screen-load', 'screen-customize', 'screen-results', 'screen-editor'];
const SCREENS_WITH_STATS = ['screen-login', 'screen-customize', 'screen-results'];

// Kolejność części w adresie awatara - taka sama jak w avatars/*.js na serwerze
const AVATAR_ORDER = {
    impostor: ['background', 'pattern', 'eyes', 'mouth', 'gear'],
    agent: ['bg', 'body', 'head', 'gear', 'eyes', 'mouth', 'mask', 'extra', 'accent'],
    bottts: ['eyes', 'mouth', 'pattern', 'background']
};
// Gdzie zapisany jest wygląd gracza w każdym zestawie (botConfig to zapis z poprzednich wersji)
const AVATAR_STORAGE = { impostor: 'impostorConfig', agent: 'agentConfig', bottts: 'botConfig' };

function byId(id) {
    return document.getElementById(id);
}

function randomItem(items) {
    return items[Math.floor(Math.random() * items.length)];
}

// ===== STAN GRACZA =====
// Wczytywany przed połączeniem z serwerem, żeby powrót do pokoju miał już userId

let userId = localStorage.getItem('userId');
if (!userId) {
    userId = generateUID();
    localStorage.setItem('userId', userId);
}

let avatarCatalog = null;    // zestawy awatarów, ich części i rzadkości (z serwera: /avatar-catalog)
let avatarStyle = null;      // aktywny zestaw, ustalany przez serwer
let botConfig = {};          // wygląd gracza w aktywnym zestawie (razem z nazwą zestawu w polu style)

let playerExp = parseInt(localStorage.getItem('playerExp'));
if (!playerExp || playerExp <= 0) playerExp = 0;

let playerLVL = parseInt(localStorage.getItem('playerLVL'));
if (!playerLVL || playerLVL <= 1) playerLVL = 1;

let currentRoomCode = "";
let myPlayerId = null;
let selectedPlayers = [];
let availableModes = [];    // tryby i ich kategorie przysłane przez serwer
let roomCustom = null;      // własna kategoria wybrana w pokoju: { id, name, count }
let gameMode;
let category;
let impostors;

function generateUID() {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return 'uid-' + Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

// ===== EKRANY =====

let currentScreen = 'screen-login';    // ekran widoczny zaraz po wczytaniu strony

function showScreen(screenId) {
    currentScreen = screenId;
    SCREENS.forEach(id => {
        byId(id).classList.add('hidden');
    });
    byId(screenId).classList.remove('hidden');

    const showStats = SCREENS_WITH_STATS.includes(screenId);
    byId('logo').classList.toggle('hidden', showStats || screenId === 'screen-editor');   // edytor potrzebuje miejsca
    byId('player-stats').classList.toggle('hidden', !showStats);
    if (showStats) refreshProgressBar();
    updateCornerButtons();
}

function showError(msg) {
    const errorDisplay = byId('error-display');
    const errorBlur = byId('error-blur');

    errorDisplay.innerText = msg;
    errorDisplay.style.opacity = '';
    errorDisplay.style.top = '5%';
    errorBlur.style.filter = 'saturate(0%)';
    setTimeout(() => {
        errorDisplay.style.opacity = 0;
        errorDisplay.style.top = '';
        errorBlur.style.filter = '';
    }, 3000);
}

function impostorWisdom(text) {
    const span = byId('impostor-thoughts');
    span.innerText = text;
    span.style.opacity = 1;
    setTimeout(() => {
        span.style.opacity = 0;
    }, 5000);
}

// ===== AWATAR =====

// Osoby z włączonym "ogranicz ruch" w systemie dostają awatary bez animacji
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

// Awatary rysuje serwer gry. Adres: /avatar/<zestaw>/<części po kolei>[?state=kicked|revealed][&motion=off]
function avatarUrl(avatar, state) {
    const style = avatar && AVATAR_ORDER[avatar.style] ? avatar.style : avatarStyle;
    if (!style) return 'icon-192.png';

    const parts = AVATAR_ORDER[style].map(part => encodeURIComponent((avatar && avatar[part]) || '-')).join('/');
    const query = [];
    if (state) query.push(`state=${state}`);
    if (reducedMotion.matches) query.push('motion=off');
    return `/avatar/${style}/${parts}${query.length ? `?${query.join('&')}` : ''}`;
}

function loadAvatarConfig(style) {
    try {
        const saved = JSON.parse(localStorage.getItem(AVATAR_STORAGE[style]));
        if (saved && typeof saved === 'object') return { ...saved, style };
    } catch (e) {
        localStorage.removeItem(AVATAR_STORAGE[style]);
    }
    return { style };
}

function saveAvatarConfig() {
    const { style, ...parts } = botConfig;
    localStorage.setItem(AVATAR_STORAGE[style], JSON.stringify(parts));
}

function activeCatalog() {
    return avatarCatalog.styles[avatarStyle];
}

// Losowa część; nowy gracz i braki w zapisanym wyglądzie dostają zwykłe części
function randomPart(slot, onlyCommon) {
    const items = activeCatalog().parts[slot.id];
    const common = items.filter(item => item.rarity === 'common');
    return randomItem(onlyCommon && common.length ? common : items).id;
}

// Części spoza katalogu (np. usunięte albo z innego zestawu) zamieniamy na zwykłe
function completeAvatarConfig() {
    activeCatalog().slots.forEach(slot => {
        if (!activeCatalog().parts[slot.id].some(item => item.id === botConfig[slot.id])) {
            botConfig[slot.id] = randomPart(slot, true);
        }
    });
    saveAvatarConfig();
}

async function loadAvatarCatalog() {
    try {
        avatarCatalog = await (await fetch('/avatar-catalog')).json();
        avatarStyle = avatarCatalog.active;
        botConfig = loadAvatarConfig(avatarStyle);
        completeAvatarConfig();
        changeNick();
    } catch (e) {
        console.error('Nie udało się wczytać katalogu awatarów', e);
    }
}

// ===== PANEL PERSONALIZACJI (zakładki i kafelki powstają z katalogu) =====

let customizeSlot = null;    // aktywna zakładka panelu

function customizeAvatar() {
    if (!avatarCatalog) return;     // katalog jeszcze się wczytuje

    renderCustomizeTabs();
    updateCustomizePreview();
    showScreen('screen-customize');
}

function updateCustomizePreview() {
    byId('customize-player-avatar').src = avatarUrl(botConfig);
}

function renderCustomizeTabs() {
    const { slots } = activeCatalog();
    if (!slots.some(slot => slot.id === customizeSlot)) customizeSlot = slots[0].id;

    const panel = byId('customize-categories-panel');
    panel.style.setProperty('--tabs', slots.length <= 5 ? slots.length : 3);
    panel.replaceChildren(...slots.map(slot => {
        const tab = createElement('button', 'customize-categories-tile', slot.name);
        tab.dataset.slot = slot.id;
        tab.classList.toggle('selected', slot.id === customizeSlot);
        tab.onclick = () => {
            customizeSlot = slot.id;
            renderCustomizeTabs();
        };
        return tab;
    }));
    renderCustomizeOptions();
}

// Kafelek części: kolory jako próbka, reszta jako cały awatar z tą częścią. Ramka pokazuje rzadkość.
function createCustomizeTile(slot, item) {
    const isSwatch = slot.kind === 'swatch';
    const tile = createElement(isSwatch ? 'div' : 'img', `customize-tile rarity-${item.rarity || 'common'}${isSwatch ? '' : ' skeleton'}`);

    if (isSwatch) tile.style.background = item.css;
    else tile.src = avatarUrl({ style: botConfig.style, [slot.id]: item.id });   // sama ta część, bez reszty wyglądu

    tile.title = item.name || '';
    tile.dataset.part = item.id;
    tile.classList.toggle('selected', botConfig[slot.id] === item.id);
    tile.onclick = () => updatePart(slot.id, item.id);
    return tile;
}

// Rysujemy tylko aktywną zakładkę; każdy kafelek pokazuje jedną część, niezależnie od reszty wyglądu
function renderCustomizeOptions() {
    const slot = activeCatalog().slots.find(s => s.id === customizeSlot);
    byId('customize-list').replaceChildren(...activeCatalog().parts[slot.id].map(item => createCustomizeTile(slot, item)));
}

function updatePart(slotId, value) {
    botConfig[slotId] = value;
    saveAvatarConfig();

    // Kafelki się nie zmieniają - przestawiamy tylko zaznaczenie
    byId('customize-list').querySelectorAll('.customize-tile').forEach(tile => {
        tile.classList.toggle('selected', tile.dataset.part === value);
    });
    updateCustomizePreview();
    changeNick();
}

function randomizeAvatar(element) {
    activeCatalog().slots.forEach(slot => {
        botConfig[slot.id] = randomPart(slot, false);
    });
    saveAvatarConfig();

    renderCustomizeOptions();
    updateCustomizePreview();
    changeNick();
    spinDice(element);
}

// ===== NICK =====

function changeNick() {
    if (avatarStyle) byId('main-player-avatar').src = avatarUrl(botConfig);
}

// Czy nick w polu jest wylosowany (kostka) - taki serwer może podmienić, gdy jest już w pokoju
let nickIsRandom = false;

function saveNick(newNick) {
    nickIsRandom = false;
    localStorage.setItem('savedNick', newNick);
    if (newNick.length <= 3) {
        impostorWisdom("Nick krótki jak twój...");
    }
}

// Słowa i wersja językowa są w js/nicks.js
function randomNick() {
    return Nicks.randomNick();
}

// Nick do wysłania na serwer; pusty pole = losowy
function nickToSend() {
    const typed = byId('input-name').value.trim();
    return { playerName: typed || randomNick(), randomName: !typed || nickIsRandom };
}

let diceRotation = 0;
function spinDice(element) {
    diceRotation += 360;
    element.style.transform = `rotate(${diceRotation}deg)`;

    const diceSides = ['&#9856', '&#9857', '&#9858', '&#9859', '&#9860', '&#9861'];
    setTimeout(() => {
        element.innerHTML = randomItem(diceSides);
    }, 100);
}

function rollDice(element) {
    byId('input-name').value = randomNick();
    nickIsRandom = true;
    changeNick();
    spinDice(element);
}

// ===== EXP =====

const pCanvas = byId('progressCanvas');
const pCtx = pCanvas.getContext('2d');
const colorSecondary = '#2ecc71';

let progress = 0;            // Aktualny stan (0 do 100)
let targetProgress = 100;    // Do ilu ma dobić
let currentWidth = 0;        // Pomocnicza do płynnej animacji
let progressAnimation = null;

function getRequiredExp(level) {
    const baseXP = 100;
    return Math.floor(baseXP + (level - 1) * 50);
}

function updateExp(exp) {
    if (exp >= getRequiredExp(playerLVL)) {
        exp -= getRequiredExp(playerLVL);
        playerLVL++;
        return updateExp(exp);
    }
    playerExp = exp;
    progress = 0;
    targetProgress = exp / getRequiredExp(playerLVL) * 100;
    currentWidth = 0;
    localStorage.setItem('playerExp', exp);
    localStorage.setItem('playerLVL', playerLVL);

    cancelAnimationFrame(progressAnimation);
    drawProgressBar();
}

let lastExpText = '';

// Rysuje pasek klatka po klatce tylko do chwili, gdy dojedzie do celu - potem nic nie obciąża telefonu
function drawProgressBar() {
    // Zmiana rozmiaru czyści płótno i wymusza przeliczenie układu, więc tylko gdy naprawdę się zmienił
    if (pCanvas.width !== pCanvas.clientWidth || pCanvas.height !== pCanvas.clientHeight) {
        pCanvas.width = pCanvas.clientWidth;
        pCanvas.height = pCanvas.clientHeight;
    }

    const w = pCanvas.width;
    const h = pCanvas.height;

    pCtx.clearRect(0, 0, w, h);

    let targetWidth = w * (progress / 100);
    currentWidth += (targetWidth - currentWidth) * 0.05;

    if (progress < targetProgress) {
        progress = Math.min(progress + 0.5, targetProgress); // Prędkość ładowania
    }

    // Koniec animacji: pasek stoi dokładnie na celu
    const finished = progress >= targetProgress && Math.abs(w * (targetProgress / 100) - currentWidth) < 0.5;
    if (finished) currentWidth = w * (targetProgress / 100);

    pCtx.fillStyle = colorSecondary;
    pCtx.fillRect(0, 0, currentWidth, h);

    const text = `
    LVL: ${playerLVL || 0} <br>
    EXP: ${Math.floor((playerExp * progress / targetProgress) || 0)} / ${getRequiredExp(playerLVL) || 0}
`;
    if (text !== lastExpText) {
        byId('exp-counter').innerHTML = text;
        lastExpText = text;
    }

    progressAnimation = finished ? null : requestAnimationFrame(drawProgressBar);
}

// Ponowne narysowanie paska (np. po powrocie do menu albo zmianie rozmiaru okna)
function refreshProgressBar() {
    if (progressAnimation === null) progressAnimation = requestAnimationFrame(drawProgressBar);
}
window.addEventListener('resize', refreshProgressBar);

// ===== POKOJE =====

// Od razu WebSocket - oszczędza kilka wymian z serwerem przy łączeniu. Gdy sieć go blokuje, zostaje odpytywanie.
// Przy każdym (ponownym) połączeniu serwer dostaje nasz pokój i id - od razu przywraca nas do gry
const socket = io({
    transports: ['websocket', 'polling'],
    tryAllTransports: true,
    auth: callback => callback({ userId: userId, roomCode: localStorage.getItem('lastRoomCode') || '' })
});

function createRoom() {
    socket.emit('create_room', { ...nickToSend(), avatar: botConfig, level: playerLVL, userId: userId });
}

// function gameModePanel(){
//     document.getElementById("screen-mode").classList.remove("hidden");
// }

function joinRoom(listCode) {
    let code = listCode || byId('input-code').value.trim().toUpperCase();
    socket.emit('join_room', { ...nickToSend(), roomCode: code, avatar: botConfig, level: playerLVL, userId: userId });
}

// ===== PRZYCISKI W ROGACH KARTY =====

const ROOM_SCREENS = ['screen-lobby', 'screen-game', 'screen-vote'];
const CONFIRM_LEAVE_SCREENS = ['screen-game', 'screen-vote'];   // w trakcie rundy wyjście trzeba potwierdzić
const LEAVE_CONFIRM_MS = 3000;
let leaveConfirmTimer = null;

function updateCornerButtons() {
    resetLeaveConfirm();
    byId('btn-leave').classList.toggle('hidden', !ROOM_SCREENS.includes(currentScreen));
    byId('btn-rules').classList.toggle('hidden', currentScreen !== 'screen-login');
    byId('btn-sound').classList.toggle('hidden', currentScreen === 'screen-results');   // na wynikach zasłaniałby napis
    if (typeof updateWakeLock === 'function') updateWakeLock();     // session.js
    byId('btn-download').classList.toggle('hidden', !(canInstall() && currentScreen === 'screen-login'));
    byId('install-help').classList.add('hidden');
}

function resetLeaveConfirm() {
    clearTimeout(leaveConfirmTimer);
    byId('btn-leave').classList.remove('confirm');
}

// W trakcie rundy pierwsze kliknięcie pyta "Na pewno?", drugie (w ciągu 3 s) wychodzi
function leaveClick() {
    const button = byId('btn-leave');
    if (CONFIRM_LEAVE_SCREENS.includes(currentScreen) && !button.classList.contains('confirm')) {
        button.classList.add('confirm');
        leaveConfirmTimer = setTimeout(resetLeaveConfirm, LEAVE_CONFIRM_MS);
        return;
    }
    resetLeaveConfirm();
    leaveRoom();
}

// ===== INSTALACJA APLIKACJI (PWA) =====
// Ikona w rogu menu głównego i jednorazowa propozycja po pierwszej grze.
// Safari na iPhonie nie ma okna instalacji - zamiast niego pokazujemy krótką instrukcję.

const INSTALL_OFFER_KEY = 'installOfferShown';
const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
let installPrompt = null;

function isInstalled() {
    return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

function canInstall() {
    return !isInstalled() && (installPrompt !== null || isIos);
}

window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    updateCornerButtons();
});

window.addEventListener('appinstalled', () => {
    installPrompt = null;
    byId('install-offer').classList.add('hidden');
    updateCornerButtons();
});

async function installApp() {
    if (!installPrompt) {
        byId('install-help').classList.toggle('hidden');
        return;
    }
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    byId('install-offer').classList.add('hidden');
    updateCornerButtons();
}

// Propozycja na ekranie wyników pojawia się tylko raz
function showInstallOffer() {
    let shown = false;
    try { shown = localStorage.getItem(INSTALL_OFFER_KEY) === '1'; } catch (e) { /* bez pamięci: pokaż */ }
    const show = canInstall() && !shown;
    byId('install-offer').classList.toggle('hidden', !show);
    if (show) {
        try { localStorage.setItem(INSTALL_OFFER_KEY, '1'); } catch (e) { /* bez pamięci */ }
    }
}

function leaveRoom() {
    socket.emit('leave_room');
    localStorage.removeItem('lastRoomCode');
}

// Kafelki trybów budują się z listy przysłanej przez serwer
function renderTiles(containerId, tileClass, items, onSelect) {
    byId(containerId).replaceChildren(...items.map(item => {
        const tile = document.createElement('button');
        tile.className = tileClass;
        tile.dataset.id = item.id;
        tile.textContent = item.name;
        tile.onclick = () => onSelect(item.id);
        return tile;
    }));
}

function markSelectedTile(tileClass, id) {
    document.querySelectorAll(`.${tileClass}`).forEach(tile => {
        tile.classList.toggle('selected', tile.dataset.id === id);
    });
}

// ===== USTAWIENIA GRY =====
// Trzyma je serwer: host wysyła zmianę, a wszyscy (host też) dostają ją z powrotem w room_update

function renderModes(modes) {
    availableModes = modes;
    renderTiles('mode-tiles', 'mode-tile', modes, id => changeSettings({ mode: id }));
    applySettings();
}

function findMode(id) {
    return availableModes.find(mode => mode.id === id);
}

function changeSettings(change) {
    socket.emit('set_room_settings', {
        roomCode: currentRoomCode,
        mode: gameMode,
        category: category,
        impostorCount: parseInt(impostors),
        options: change.mode && change.mode !== gameMode ? null : roomOptions,     // nowy tryb = jego domyślne
        ...change
    });
}

// ===== USTAWIENIA GRY (przełączniki trybu: ostatnia szansa, dodatkowe role) =====
let roomOptions = {};

// Nazwy włączonych ról (opcje, które wymagają dodatkowego gracza) - lista jest jawna dla wszystkich
function enabledRoleNames(mode, options) {
    return (mode.options || []).filter(o => o.players > 0 && options[o.id]).map(o => o.name);
}

function openGameOptions() {
    renderGameOptions();
    byId('game-options').classList.remove('hidden', 'closing');
}

function closeGameOptions() {
    const panel = byId('game-options');
    if (panel.classList.contains('hidden') || panel.classList.contains('closing')) return;
    panel.classList.add('closing');
    setTimeout(() => {
        if (!panel.classList.contains('closing')) return;
        panel.classList.add('hidden');
        panel.classList.remove('closing');
    }, PICKER_CLOSE_MS);
}

function renderGameOptions() {
    const mode = findMode(gameMode);
    if (!mode) return;
    byId('options-list').replaceChildren(...(mode.options || []).map(option => {
        const row = createElement('div', 'option-row');
        row.classList.toggle('is-on', Boolean(roomOptions[option.id]));
        const text = createElement('div', 'option-text');
        text.append(createElement('div', 'option-name', option.name), createElement('div', 'option-description', option.description));
        const toggle = createElement('span', 'privacy-switch option-switch');
        toggle.append(createElement('span', 'privacy-knob'));
        row.append(text, toggle);
        row.onclick = () => changeSettings({ options: { ...roomOptions, [option.id]: !roomOptions[option.id] } });
        return row;
    }));
    const extra = (mode.options || []).filter(o => o.players > 0 && roomOptions[o.id]).length;
    const needed = parseInt(impostors) + (extra > 0 ? extra + 2 : 1);    // jak na serwerze
    byId('options-players').textContent = `Potrzeba co najmniej ${needed} graczy`;
}

function selectCategory(id) {
    closeCategoryPicker();
    changeSettings({ category: id });
}

function selectImpostors(id) {
    changeSettings({ impostorCount: parseInt(id) });
}

function applySettings(settings) {
    if (settings) {
        gameMode = settings.mode;
        category = settings.category;
        impostors = String(settings.impostorCount);
        roomCustom = settings.custom;
        roomOptions = settings.options || {};
    }

    // Lista trybów albo ustawienia pokoju mogły jeszcze nie dotrzeć
    const mode = findMode(gameMode);
    if (!mode) return;

    // Własną kategorię zna tylko przeglądarka hosta - reszta dostaje jej nazwę z ustawień pokoju
    const selectedCategory = mode.categories.find(c => c.id === category)
        || (roomCustom && { id: category, name: roomCustom.name });

    markSelectedTile('mode-tile', gameMode);
    document.querySelectorAll('.impostor-tile').forEach(tile => {
        tile.classList.toggle('selected', tile.id === impostors);
    });

    byId('category-select').classList.toggle('hidden', !selectedCategory);
    if (selectedCategory) {
        byId('category-current').replaceChildren(
            createCategoryTile(selectedCategory, 'Kliknij, aby zmienić', openCategoryPicker)
        );
    }

    // Podsumowanie dla graczy, którzy nie są hostem
    const summary = [mode.name];
    if (selectedCategory) summary.push(selectedCategory.name);
    summary.push(`${impostors} ${impostors === '1' ? 'impostor' : 'impostorów'}`);
    const lastChance = (mode.options || []).find(o => o.id === 'lastChance');
    if (lastChance && roomOptions.lastChance) summary.push('ostatnia szansa');
    byId('room-settings').textContent = summary.join(' · ');

    // Jawna lista ról w grze (dla wszystkich) i licznik na przycisku hosta
    const roles = enabledRoleNames(mode, roomOptions);
    byId('room-roles').classList.toggle('hidden', roles.length === 0);
    byId('room-roles').textContent = roles.length ? `W grze: ${roles.join(', ')}` : '';
    byId('btn-game-options').classList.toggle('hidden', !(mode.options && mode.options.length));
    byId('options-count').textContent = roles.length ? `+${roles.length}` : '';
    if (!byId('game-options').classList.contains('hidden')) renderGameOptions();
}

// ===== OKNO WYBORU KATEGORII =====

function normalizeText(text) {
    return text.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');
}

function isCustomCategorySelected(customId) {
    return Boolean(roomCustom) && roomCustom.id === customId;
}

function renderCategoryPicker() {
    const mode = findMode(gameMode);
    const query = normalizeText(byId('picker-search').value);
    const matches = c => normalizeText(c.name).includes(query);
    const list = byId('picker-list');

    const tiles = mode.categories.filter(matches).map(c => {
        const description = c.random ? 'Inna przy każdej grze' : `${c.count} ${c.unit || 'haseł'}`;
        const tile = createCategoryTile(c, description, () => selectCategory(c.id));
        tile.classList.toggle('selected', c.id === category);
        return tile;
    });

    // Własne kategorie hosta i kafelek do tworzenia nowej
    if (mode.custom) {
        loadCustomCategories().filter(matches).forEach(c => {
            tiles.push(createCustomCategoryTile(c, isCustomCategorySelected(c.id)));
        });
    }

    list.replaceChildren(...tiles);
    if (tiles.length === 0) {
        list.append(createElement('p', 'picker-empty', 'Brak takiej kategorii'));
    }
    if (mode.custom) list.append(createNewCategoryTile());
}

const PICKER_CLOSE_MS = 250;    // długość animacji wyjścia w style.css

function openCategoryPicker() {
    byId('picker-search').value = "";
    renderCategoryPicker();

    // Kafelki wjeżdżają po kolei tylko przy otwarciu, nie przy każdym wyszukiwaniu
    byId('picker-list').querySelectorAll('.category-card').forEach((tile, index) => {
        tile.classList.add('picker-enter');
        tile.style.animationDelay = `${0.1 + index * 0.04}s`;
    });

    byId('category-picker').classList.remove('hidden', 'closing');
}

// Okno najpierw odgrywa animację wyjścia, a dopiero potem znika
function closeCategoryPicker() {
    const picker = byId('category-picker');
    if (picker.classList.contains('hidden') || picker.classList.contains('closing')) return;

    picker.classList.add('closing');
    setTimeout(() => {
        // Ponowne otwarcie w trakcie zamykania zdejmuje "closing" - wtedy nie chowamy
        if (!picker.classList.contains('closing')) return;
        picker.classList.add('hidden');
        picker.classList.remove('closing');
    }, PICKER_CLOSE_MS);
}

// Kliknięcie w tło i Escape zamykają tylko listę - w edytorze łatwo byłoby stracić wpisane hasła
function dismissCategoryPicker() {
    if (!isCategoryEditorOpen()) closeCategoryPicker();
}

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') dismissCategoryPicker();
});

// Szkielet obrazka znika, gdy obrazek się wczyta; przy błędzie zostaje szary kafelek bez błysku
// (przezroczysty obrazek zastępczy "data:" w index.html nie zdejmuje szkieletu - bez niego przeglądarka rysuje ramkę pustego obrazka)
document.addEventListener('load', event => {
    if (event.target.tagName === 'IMG' && !event.target.src.startsWith('data:')) event.target.classList.remove('skeleton');
}, true);
document.addEventListener('error', event => {
    if (event.target.tagName === 'IMG' && event.target.classList.contains('skeleton')) event.target.classList.replace('skeleton', 'skeleton-failed');
}, true);

function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}

function createRoomRow(room) {
    const joinable = room.status === 'waiting' && !room.isFull;
    const row = createElement('div', 'room-row');

    const hostAvatar = createElement('img', 'room-row-host skeleton');
    hostAvatar.src = avatarUrl(room.host.avatar);

    // Pod nickiem: kod i gracze albo powód, dla którego nie da się wejść
    const details = createElement('div', 'room-row-details');
    if (room.status !== 'waiting') details.append('W trakcie gry');
    else if (room.isFull) details.append('Pełny');
    else details.append(`#${room.code}`);

    room.avatars.forEach(playerAvatar => {
        const avatar = createElement('img', 'skeleton');
        avatar.src = avatarUrl(playerAvatar);
        details.append(avatar);
    });
    const hiddenPlayers = room.playerCount - 1 - room.avatars.length;
    if (hiddenPlayers > 0) details.append(`+${hiddenPlayers}`);

    const info = createElement('div', 'room-row-info');
    info.append(createElement('div', 'room-row-name', room.host.name), details);

    if (joinable) {
        row.classList.add('joinable');
        row.onclick = () => joinRoom(room.code);
    } else {
        row.classList.add('locked');
    }

    row.append(hostAvatar, info, createElement('div', 'room-row-count', `${room.playerCount}/${room.maxPlayers}`));
    return row;
}

let renderedRoomList = null;
let roomIsPrivate = false;
let amIHost = false;

function renderRoomList(rooms) {
    // Serwer odświeża listę co chwilę - bez zmian nie przerysowujemy, żeby karty nie migały
    const snapshot = JSON.stringify(rooms);
    if (snapshot === renderedRoomList) return;
    renderedRoomList = snapshot;

    const listContainer = byId('rooms-list');
    listContainer.replaceChildren();

    if (rooms.length === 0) {
        const empty = createElement('p', '', 'Brak aktywnych pokojów. Stwórz własny!');
        empty.id = 'no-rooms';
        listContainer.append(empty);
        return;
    }

    const header = createElement('div', '', '— LISTA POKOI —');
    header.style.margin = '15px 0';
    header.style.color = '#999';
    listContainer.append(header, ...rooms.map(createRoomRow));
}

function renderLobby(room) {
    const isHost = room.hostId === myPlayerId;
    const list = byId('players-list');

    amIHost = isHost;
    roomIsPrivate = room.isPrivate;
    list.replaceChildren();

    byId('room-code-display').innerText = room.code;
    byId('room-privacy').classList.toggle('is-private', room.isPrivate);
    byId('room-privacy').classList.toggle('is-host', isHost);
    byId('room-privacy-label').textContent = room.isPrivate ? '\u{1F512} Pokój prywatny' : 'Pokój publiczny';

    applySettings(room.settings);

    room.players.forEach(p => {
        const container = createElement('div', 'avatar-container');
        container.id = `player-${p.id}`;
        container.style.position = 'relative';
        container.onclick = () => sendFuck(p.id);
        if (p.away) {
            container.classList.add('away');
            container.title = 'Ogląda jeszcze wyniki';
        }

        const avatar = createElement('img', 'player-avatar skeleton');
        avatar.src = avatarUrl(p.avatar);

        // Znaczniki trzymają się rogów samego awatara, a nie szerszej plakietki z nickiem
        const frame = createElement('div', 'avatar-frame');
        frame.append(avatar);

        if (p.id === room.hostId) {
            const crown = createElement('span', 'host-crown');
            crown.innerHTML = HOST_CROWN_SVG;
            crown.title = 'Host';
            frame.append(crown);
        }

        const tag = createElement('span', p.id === myPlayerId ? 'player-tag this-player' : 'player-tag', p.name);
        container.append(frame, tag);

        if (isHost && p.id !== myPlayerId) {
            const kick = createElement('button', 'kick-button', '✕');
            kick.title = 'Wyrzuć gracza';
            kick.onclick = (event) => {
                event.stopPropagation();
                kickPlayer(p);
            };
            frame.append(kick);
        }

        list.append(container, ' ');
    });

    list.append(createInviteSlot());
    fitPlayerTags(list);
}

// Długie nicki dostają mniejszą czcionkę, żeby w rzędzie mieściło się 3 graczy (krótkie zostają bez zmian).
// Plakietka szersza niż 1/3 listy zmniejsza się krokami, najwyżej do TAG_MIN_FONT - czytelność ważniejsza.
const TAG_MIN_FONT = 8;     // pikselowa czcionka Silkscreen jest najostrzejsza przy 8 px
const PLAYERS_GAP = 6;      // jak column-gap w #players-list

function fitPlayerTags(list) {
    const maxWidth = Math.floor((list.clientWidth - 2 * PLAYERS_GAP) / 3);
    list.querySelectorAll('.avatar-container:not(.invite-slot) .player-tag').forEach(tag => {
        tag.style.fontSize = '';
        tag.style.paddingLeft = tag.style.paddingRight = '';
        if (tag.offsetWidth <= maxWidth) return;

        tag.style.paddingLeft = tag.style.paddingRight = '6px';
        let size = parseFloat(getComputedStyle(tag).fontSize);
        while (tag.offsetWidth > maxWidth && size > TAG_MIN_FONT) {
            size = Math.max(TAG_MIN_FONT, size - 0.5);
            tag.style.fontSize = `${size}px`;
        }
    });
    breakPlayerRows(list);
}

// Rzędy po najwyżej 3 kafelki: kolejny trafia do rzędu, jeśli się zmieści, inaczej zaczyna nowy rząd
const PLAYERS_PER_ROW = 3;

function breakPlayerRows(list) {
    list.querySelectorAll('.row-break').forEach(element => element.remove());
    const width = list.clientWidth;
    let used = 0, count = 0;
    [...list.querySelectorAll('.avatar-container')].forEach(tile => {
        const tileWidth = tile.offsetWidth;
        const fits = count > 0 && count < PLAYERS_PER_ROW && used + PLAYERS_GAP + tileWidth <= width;
        if (count > 0 && !fits) {
            tile.before(createElement('div', 'row-break'));
            used = 0;
            count = 0;
        }
        used += (count > 0 ? PLAYERS_GAP : 0) + tileWidth;
        count++;
    });
}
// czcionka gry wczytuje się chwilę po stronie - wtedy mierzymy jeszcze raz
document.fonts.ready.then(() => fitPlayerTags(byId('players-list')));

const INVITE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>';

// Wolne miejsce na końcu listy graczy: zamiast awatara ikona udostępniania - otwiera zaproszenie (widzą wszyscy)
function createInviteSlot() {
    const container = createElement('div', 'avatar-container invite-slot');
    container.title = 'Zaproś do gry';
    container.onclick = openInvite;

    const icon = createElement('div', 'invite-slot-icon');
    icon.innerHTML = INVITE_ICON;
    const frame = createElement('div', 'avatar-frame');
    frame.append(icon);

    container.append(frame, createElement('span', 'player-tag invite-slot-tag', 'Zaproś +'));
    return container;
}

// Przełącznik pod kodem pokoju - działa tylko u hosta
function togglePrivacy() {
    if (!amIHost) return;
    socket.emit('set_room_privacy', { roomCode: currentRoomCode, isPrivate: !roomIsPrivate });
}

function kickPlayer(player) {
    if (confirm(`Wyrzucić gracza ${player.name}? Nie będzie mógł wrócić do tego pokoju.`)) {
        socket.emit('kick_player', { roomCode: currentRoomCode, targetId: player.id });
    }
}

function playAgain() {
    socket.emit('play_again', { level: playerLVL });
}

// ===== ZACZEPKI =====

function sendFuck(targetId) {
    socket.emit('send_fuck', { roomCode: currentRoomCode, targetId: targetId });
}

function showFuck(senderId) {
    // Szukamy kontenera gracza, który wysłał fucka
    let sender = byId(`player-${senderId}`);
    if (!sender) return; // Zabezpieczenie na wypadek, gdyby nie znalazło elementu

    let fuckElement = document.createElement('div');

    fuckElement.style.position = 'absolute';
    fuckElement.style.top = '100%';
    fuckElement.style.left = '50%';
    fuckElement.style.transform = 'translate(-50%, -60%)';
    fuckElement.style.fontSize = '40px';
    fuckElement.style.zIndex = '9999';
    fuckElement.style.pointerEvents = 'none';
    fuckElement.style.transition = '0.6s';
    fuckElement.style.opacity = '0';

    fuckElement.innerText = '🖕';

    // Wrzucamy do kontenera tego konkretnego gracza
    sender.appendChild(fuckElement);

    setTimeout(() => {
        fuckElement.style.opacity = '1';
        fuckElement.style.top = '50%';
    }, 100);

    setTimeout(() => {
        fuckElement.style.opacity = '0';
        fuckElement.style.top = '100%';
        setTimeout(() => {
            fuckElement.remove();
        }, 500);
    }, 4000);
}

// ===== GRA I GŁOSOWANIE =====

function startGame() {
    socket.emit('start_game', { roomCode: currentRoomCode });
}

function castVote() {
    if (confirm("Zacząć głosowanie?")) socket.emit('cast_vote', currentRoomCode);
}

function endGame() {
    if (confirm("Zakończyć grę?")) socket.emit('end_game', currentRoomCode);
}

function voteOn(selectedTile, maxVotes, playerId) {
    const isSelected = selectedTile.classList.contains('selected');

    if (!isSelected) {
        if (selectedPlayers.length < maxVotes) {
            selectedTile.classList.add('selected');
            selectedPlayers.push(playerId);
        } else {
            console.log("Limit głosów osiągnięty!");
            return;
        }
    } else {
        selectedTile.classList.remove('selected');
        selectedPlayers = selectedPlayers.filter(id => id !== playerId);
    }
    socket.emit('send_vote', currentRoomCode, selectedPlayers);
}

// Wspólne elementy ekranu gry wracają do stanu wyjściowego, resztę ustawia tryb
// ===== KARTA ROLI =====
// Przytrzymanie (palcem, myszą albo spacją) rozjaśnia kartę, puszczenie znowu ją przyciemnia

const roleCard = byId('role-card');

function setRoleRevealed(revealed) {
    roleCard.classList.toggle('revealed', revealed);
}

roleCard.addEventListener('pointerdown', event => {
    event.preventDefault();
    if (roleCard.setPointerCapture) roleCard.setPointerCapture(event.pointerId);
    setRoleRevealed(true);
});
['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => roleCard.addEventListener(type, () => setRoleRevealed(false)));
roleCard.addEventListener('contextmenu', event => event.preventDefault());     // bez menu po długim przytrzymaniu
roleCard.addEventListener('keydown', event => {
    if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        setRoleRevealed(true);
    }
});
roleCard.addEventListener('keyup', () => setRoleRevealed(false));

// ===== ODLICZANIE PRZED RUNDĄ =====
// Tylko przy starcie rundy (serwer wysyła countdown), nie przy powrocie do trwającej gry
const COUNTDOWN_STEP_MS = 650;
let countdownTimers = [];

function startCountdown() {
    const overlay = byId('round-countdown');
    const number = byId('countdown-number');
    countdownTimers.forEach(clearTimeout);
    overlay.classList.remove('hidden', 'closing');

    countdownTimers = [3, 2, 1].map((value, index) => setTimeout(() => {
        number.textContent = value;
        number.classList.remove('countdown-pop');
        void number.offsetWidth;        // ponowne odegranie animacji
        number.classList.add('countdown-pop');
        sfx.play('countdown');
    }, index * COUNTDOWN_STEP_MS));

    countdownTimers.push(setTimeout(() => {
        sfx.play('go');
        overlay.classList.add('closing');
    }, 3 * COUNTDOWN_STEP_MS));
    countdownTimers.push(setTimeout(() => overlay.classList.add('hidden'), 3 * COUNTDOWN_STEP_MS + 250));
}

function showGame(data) {
    setRoleRevealed(false);
    byId('impostor-info').classList.add('hidden');
    byId('role-note').classList.add('hidden');
    byId('game-roles').classList.add('hidden');
    byId('input-answer').classList.add('hidden');
    byId('answer-extra').classList.add('hidden');
    byId('starter-display').classList.add('hidden');
    byId('category-display').innerText = data.category;

    gameModes[data.mode].showGame(data);
}

function renderVoteTiles(vote) {
    const mode = gameModes[vote.mode];
    const voteDisplay = byId('vote-display');
    const header = mode.voteHeader(vote);

    byId('players-question').classList.toggle('hidden', !header);
    byId('players-question').textContent = header || '';

    selectedPlayers = [];
    voteDisplay.replaceChildren();

    vote.players.forEach(p => {
        const tile = document.createElement('div');
        tile.className = 'vote-tile';
        tile.dataset.id = p.id;
        tile.style.setProperty('--avatar', `url("${avatarUrl(p.avatar)}")`);
        tile.onclick = () => voteOn(tile, vote.maxVotes, p.id);

        tile.append(` ${p.name} `);

        const extraText = mode.voteTileText(p);
        if (extraText !== null) {
            tile.append(document.createElement('br'), ` ${extraText}`);
        }
        voteDisplay.append(tile);
    });

    renderVoteStatus(vote);
    byId('vote-mode-extras').replaceChildren(...(mode.voteExtras ? mode.voteExtras(vote) : []));
    lockEndButton(vote.endLockMs);
}

// Licznik widzą wszyscy; znaczki na kafelkach tych, którzy już zagłosowali - tylko host
function renderVoteStatus({ count, voted, total }) {
    document.querySelectorAll('.vote-tile').forEach(tile => {
        tile.classList.toggle('voted', voted.includes(tile.dataset.id));
    });
    byId('vote-status').textContent = `Zagłosowało: ${count}/${total}`;
}

// Przez pierwsze sekundy głosowania host nie może go zakończyć - przycisk odlicza
const END_BUTTON_TEXT = 'ZAKOŃCZ I POKAŻ WYNIKI';
let endLockTimer = null;

function lockEndButton(lockMs) {
    const button = byId('btn-end-game');
    const unlockAt = Date.now() + lockMs;

    const tick = () => {
        const secondsLeft = Math.ceil((unlockAt - Date.now()) / 1000);
        button.disabled = secondsLeft > 0;
        button.textContent = secondsLeft > 0 ? `ZAKOŃCZ ZA ${secondsLeft}...` : END_BUTTON_TEXT;
        if (secondsLeft <= 0) clearInterval(endLockTimer);
    };

    clearInterval(endLockTimer);
    endLockTimer = setInterval(tick, 200);
    tick();
}

function setHostControls(isHost) {
    ['host-controls', 'host-start', 'host-end-controls', 'host-vote-controls'].forEach(id => {
        byId(id).classList.toggle('hidden', !isHost);
    });

    document.querySelectorAll('.waiting-msg').forEach(el => {
        el.classList.toggle('hidden', isHost);
    });
}

// ===== WYNIKI =====

// Wyrzucony gracz ma na ekranie wyników wersję "po wpadce", a odkryty impostor zrzuca przebranie
function resultAvatarState(player, results) {
    if (results.impostors.some(i => i.id === player.id)) return 'revealed';
    return results.kickedPlayers.some(k => k.id === player.id) ? 'kicked' : undefined;
}

const KICK_HIT_MS = RESULTS_SUSPENSE_MS - 500;    // chwila "trafienia" wyrzuconego (błysk i dźwięk)

function setResultAvatar(img, player, results) {
    const state = resultAvatarState(player, results);
    img.src = avatarUrl(player.avatar);

    if (state === 'kicked') {
        // Krzyżyki w oczach dopiero przy trafieniu - wcześniej zdradzałyby wynik liczenia
        const kicked = avatarUrl(player.avatar, state);
        new Image().src = kicked;
        resultsTimers.push(setTimeout(() => { img.src = kicked; }, KICK_HIT_MS));
    }

    if (state === 'revealed') {
        // Najpierw wygląda jak zwykle, po chwili zrzuca przebranie (obraz czeka już w pamięci)
        const revealed = avatarUrl(player.avatar, state);
        new Image().src = revealed;
        setTimeout(() => {
            img.src = revealed;
            img.classList.add('unmask');
        }, REVEAL_DELAY_MS);
    }
}

function createResultTile(player, results) {
    const tile = document.createElement('div');
    tile.className = 'res-player-tile';

    const avatar = document.createElement('img');
    setResultAvatar(avatar, player, results);

    const name = document.createElement('span');
    name.textContent = player.name;

    tile.append(avatar, name);
    return tile;
}

function renderResultPlayers(containerId, players, results, emptyText) {
    const container = byId(containerId);
    container.replaceChildren(...players.map(player => createResultTile(player, results)));

    if (players.length === 0) {
        const empty = document.createElement('span');
        empty.className = 'res-empty';
        empty.textContent = emptyText;
        container.append(empty);
    }
}

const VOTE_ROW_STEP_MS = 220;    // kolejne wiersze głosów wskakują co tyle
const VOTER_STEP_MS = 90;        // kolejne awatary głosujących w wierszu

// Jedna lista: pasek z liczbą głosów, a pod nim małe awatary tych, którzy głosowali (jak w Among Us).
// Wiersze wskakują po kolei, a wyrzuceni dostają czerwony błysk tuż przed werdyktem.
function renderResultVotes(results) {
    const container = byId('res-votes');
    const mode = gameModes[results.mode];
    const impostorIds = results.impostors.map(i => i.id);
    const kickedIds = results.kickedPlayers.map(k => k.id);
    const playersById = Object.fromEntries(results.players.map(p => [p.id, p]));
    const ranking = [...results.players].sort((a, b) => b.votes - a.votes);
    const maxVotes = Math.max(1, ...ranking.map(p => p.votes));

    container.replaceChildren(...ranking.map((p, index) => {
        const row = createElement('div', 'res-vote-row');
        if (impostorIds.includes(p.id)) row.classList.add('res-vote-impostor');
        const rowDelay = index * VOTE_ROW_STEP_MS;
        row.style.animationDelay = `${rowDelay}ms`;
        resultsTimers.push(setTimeout(() => sfx.play('voteIn'), rowDelay));

        const avatar = createElement('img');
        setResultAvatar(avatar, p, results);

        const who = createElement('div', 'res-vote-who');
        who.append(createElement('div', 'res-vote-name', p.name));
        const tags = [];
        const roleTag = mode.resultRoleTag ? mode.resultRoleTag(p) : null;
        if (roleTag) tags.push(roleTag);
        if (kickedIds.includes(p.id)) {
            row.classList.add('res-vote-kicked');
            tags.push('Wyrzucony');
        }
        if (tags.length) who.append(createElement('div', 'res-vote-tag', tags.join(' · ')));

        // Pasek rośnie, gdy wiersz się pojawia
        const bar = createElement('div', 'res-vote-bar');
        const fill = createElement('div');
        fill.style.width = '0%';
        bar.append(fill);
        resultsTimers.push(setTimeout(() => { fill.style.width = `${p.votes / maxVotes * 100}%`; }, rowDelay + 60));

        // Pod paskiem: kto głosował na tego gracza
        const voters = createElement('div', 'res-voters');
        (p.voters || []).map(id => playersById[id]).filter(Boolean).forEach((voter, voterIndex) => {
            const mini = createElement('img', 'res-voter skeleton');
            mini.src = avatarUrl(voter.avatar);
            mini.title = voter.name;
            mini.alt = voter.name;
            mini.style.animationDelay = `${rowDelay + 150 + voterIndex * VOTER_STEP_MS}ms`;
            voters.append(mini);
        });
        const graph = createElement('div', 'res-vote-graph');
        graph.append(bar);
        if (voters.childElementCount > 0) graph.append(voters);

        row.append(avatar, who, graph, createElement('span', 'res-vote-count', p.votes));
        return row;
    }));

    // Wyrzuceni: błysk i dźwięk tuż przed werdyktem
    if (kickedIds.length > 0) resultsTimers.push(setTimeout(() => sfx.play('hit'), KICK_HIT_MS));

    if (kickedIds.length === 0) {
        container.append(createElement('div', 'res-empty', 'Nikt nie został wyrzucony'));
    }
}

let resultsTimers = [];

function showResults(results) {
    showScreen('screen-results');

    const mode = gameModes[results.mode];
    const won = results.won;

    // Napięcie: najpierw "liczenie głosów" i głosy wskakujące po kolei, po chwili werdykt
    const screen = byId('screen-results');
    resultsTimers.forEach(clearTimeout);
    screen.classList.remove('res-reveal');
    screen.classList.add('res-suspense');
    resultsTimers = [setTimeout(() => {
        screen.classList.remove('res-suspense');
        screen.classList.add('res-reveal');
        sfx.play(won ? 'win' : 'lose');
    }, RESULTS_SUSPENSE_MS)];
    const wasIKicked = results.kickedPlayers.some(player => player.id === myPlayerId);

    byId('res-banner').className = `res-banner ${won ? 'res-win' : 'res-lose'}`;
    byId('res-outcome').textContent = won ? 'WYGRANA' : 'PRZEGRANA';
    // ten sam moment co zrzucenie przebrania przez impostora na awatarze
    if (results.impostors.length > 0) resultsTimers.push(setTimeout(() => sfx.play('reveal'), REVEAL_DELAY_MS));
    byId('res-summary').textContent = mode.resultSummary(results);
    byId('res-player-status').textContent = wasIKicked ? 'Zostałeś zabity!' : 'Przeżyłeś!';

    byId('res-mode-sections').replaceChildren(...mode.resultSections(results));

    renderResultPlayers('res-impostors', results.impostors, results, 'Brak impostorów');
    renderResultVotes(results);

    let gainedExp = 0;

    gainedExp += 10;
    gainedExp += (results.players.length * 5);
    if (!wasIKicked) gainedExp += 10;

    if (won) gainedExp *= 1.5;
    gainedExp = Math.floor(gainedExp);

    byId('res-exp').textContent = `+${gainedExp} EXP`;
    showInstallOffer();
    updateExp(playerExp + gainedExp);
}

// ===== ZDARZENIA Z SERWERA =====

// Powrót do pokoju po ponownym połączeniu robi serwer (dane idą w "auth" przy łączeniu) - zob. session.js
socket.on("connect_error", (error) => {
    console.error("Błąd połączenia:", error.message);
});

socket.on('joined', ({ roomCode, playerId }) => {
    currentRoomCode = roomCode;
    myPlayerId = playerId;
});

socket.on('rejoin_failed', (failed) => {
    if (!failed) return;

    localStorage.removeItem('lastRoomCode');
    if (currentRoomCode) {
        // Pokój zniknął, gdy nas nie było (np. serwer był restartowany)
        currentRoomCode = "";
        showScreen('screen-login');
        showError('Pokój już nie istnieje');
    }
});

socket.on('mode_list', renderModes);

socket.on('room_list', renderRoomList);

socket.on('room_update', (room) => {
    currentRoomCode = room.code;
    socket.emit('check_host', currentRoomCode);
    localStorage.setItem('lastRoomCode', room.code);
    byId('input-answer').value = "";
    // Host piszący własną kategorię zostaje w edytorze, nawet gdy ktoś dołączy
    if (currentScreen !== 'screen-editor') showScreen('screen-lobby');

    playLobbySounds(room);
    renderLobby(room);
});

// Dźwięki poczekalni: ktoś wszedł / wyszedł, host zmienił ustawienia. Pierwsza lista po wejściu jest cicha.
let lobbySnapshot = null;
function playLobbySounds(room) {
    const ids = room.players.map(p => p.id);
    const settings = JSON.stringify([room.settings, room.isPrivate]);
    if (lobbySnapshot && lobbySnapshot.code === room.code) {
        if (ids.some(id => !lobbySnapshot.ids.includes(id))) sfx.play('join');
        else if (lobbySnapshot.ids.some(id => !ids.includes(id))) sfx.play('leave');
        else if (settings !== lobbySnapshot.settings && !amIHost) sfx.play('settings');
    }
    lobbySnapshot = { code: room.code, ids, settings };
}

socket.on('left_room_success', () => {
    console.log("Pomyślnie opuszczono pokój.");
    closeCategoryPicker();
    currentRoomCode = "";
    lobbySnapshot = null;
    localStorage.removeItem('lastRoomCode');
    showScreen('screen-login');
});

socket.on('is_host', setHostControls);

socket.on('game_start', (data) => {
    showScreen('screen-game');
    showGame(data);
    if (data.countdown) startCountdown();
    else sfx.play('roundStart');
    socket.emit('check_host', currentRoomCode);
});

socket.on('start_vote', (vote) => {
    showScreen('screen-vote');
    sfx.play('voteStart');
    renderVoteTiles(vote);
});

socket.on('vote_status', renderVoteStatus);

socket.on('game_over', showResults);

socket.on('receive_fuck', (data) => {
    sfx.play('reaction');
    showFuck(data.playerId);
});

socket.on('error', showError);


// ===== START =====

byId('input-name').value = localStorage.getItem('savedNick') || "";
changeNick();
loadAvatarCatalog();
updateExp(playerExp);

console.log("EXP: " + playerExp);
console.log('Twoje UID: ' + userId);

// Przyciski w rogach od razu po wczytaniu strony (później odświeża je showScreen)
updateCornerButtons();
