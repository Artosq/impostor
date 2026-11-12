const RESULTS_SUSPENSE_MS = 2000; // tyle trwa "liczenie głosów", zanim pojawi się werdykt
const REVEAL_DELAY_MS = 2600;    // po tylu ms odkryty impostor zrzuca przebranie na ekranie wyników
const HOST_CROWN_SVG = '<svg viewBox="0 0 26 20" fill="#f1c40f" stroke="black" stroke-width="2" stroke-linejoin="round">'
    + '<path d="M3 17L2 5l6 5 5-8 5 8 6-5-1 12z"/>'
    + '<circle cx="13" cy="13" r="1.6" fill="#e74c3c" stroke="none"/></svg>';
const SCREENS = ['screen-login', 'screen-lobby', 'screen-game', 'screen-vote', 'screen-load', 'screen-customize', 'screen-results', 'screen-editor', 'screen-profile'];
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
let avatarCatalogLoading = true;
let botConfig = {};          // wygląd gracza w aktywnym zestawie (razem z nazwą zestawu w polu style)

// Poziom i doświadczenie trzyma profil gracza (profileStore.js) - razem ze statystykami i odznakami
let playerExp = Math.max(0, ProfileStore.get().exp || 0);
let playerLVL = Math.max(1, ProfileStore.get().level || 1);

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

// Ekran, który właśnie blednie (przejście "fade through", style.css): leży na swoim dawnym miejscu nad nowym
// i po animacji wraca do zwykłego ukrytego stanu
const SCREEN_LEAVE_MAX_MS = 250;    // animacja wyjścia trwa 100 ms

function finishLeaving(screen) {
    screen.classList.remove('screen-leaving');
    screen.classList.add('hidden');
    screen.style.top = screen.style.left = screen.style.width = '';
}

// Klasa "screen-entering" zostaje na ekranie do następnej zmiany ekranu - zdjęta zaraz po animacji przywracała
// podstawową animację .screen (screenFadeIn), która ruszała od zera: ekran znikał i pojawiał się drugi raz (mignięcie)
document.addEventListener('animationend', event => {
    if (event.animationName === 'screenFadeOut' && event.target.classList.contains('screen-leaving')) finishLeaving(event.target);
});

function showScreen(screenId) {
    const previous = currentScreen;
    currentScreen = screenId;

    // poprzednie przejście jeszcze trwa - kończymy je od razu
    document.querySelectorAll('.screen-leaving').forEach(finishLeaving);

    // Przejście tylko przy faktycznej zmianie ekranu (np. odświeżenie poczekalni pokazuje ten sam ekran).
    // Stary ekran zostaje na chwilę widoczny w swoim miejscu i blednie, nowy od razu zajmuje swoje miejsce w karcie.
    const old = previous && previous !== screenId ? byId(previous) : null;
    const animate = old && !old.classList.contains('hidden');
    if (animate) {
        old.style.top = `${old.offsetTop}px`;
        old.style.left = `${old.offsetLeft}px`;
        old.style.width = `${old.offsetWidth}px`;
        old.classList.remove('screen-entering');     // w tej samej chwili zaczyna blednąć - nic nie rusza od nowa
        old.classList.add('screen-leaving');
        // zabezpieczenie, gdyby przeglądarka nie zgłosiła końca animacji (karta w tle, animacje wyłączone)
        setTimeout(() => { if (old.classList.contains('screen-leaving')) finishLeaving(old); }, SCREEN_LEAVE_MAX_MS);
    }

    SCREENS.forEach(id => {
        if (!(animate && id === previous)) byId(id).classList.add('hidden');
    });
    const screen = byId(screenId);
    screen.classList.remove('hidden');
    if (animate) {
        screen.classList.remove('screen-entering');
        void screen.offsetWidth;            // ponowne dodanie klasy zaczyna animację od początku
        screen.classList.add('screen-entering');
    }

    // wejście do poczekalni (z menu, gry, wyników, edytora) - wszystkie kafelki graczy wchodzą od nowa
    if (screenId === 'screen-lobby' && previous !== 'screen-lobby') lobbyTilesRoom = null;

    const showStats = SCREENS_WITH_STATS.includes(screenId);
    byId('logo').classList.toggle('hidden', showStats || screenId === 'screen-editor' || screenId === 'screen-profile');   // edytor i profil potrzebują miejsca
    byId('player-stats').classList.toggle('hidden', !showStats);
    if (screenId === 'screen-login' && typeof maybeShowLoginPrompt === 'function') maybeShowLoginPrompt();   // login.js
    updateCornerButtons();
}

// isNotice: zwykła informacja (zielona, bez wyszarzania karty) zamiast błędu
// Jeden komunikat naraz i jeden wspólny licznik: nowy komunikat podmienia poprzedni (z podskokiem, żeby było widać
// zmianę) i liczy 3 s od nowa. Wcześniej każdy miał własny licznik, który chował też późniejsze komunikaty.
const MESSAGE_VISIBLE_MS = 3000;
let messageTimer = null;

function showError(msg, isNotice = false) {
    const errorDisplay = byId('error-display');
    const errorBlur = byId('error-blur');
    const notice = isNotice === true;
    const visible = messageTimer !== null;

    errorDisplay.innerText = msg;
    errorDisplay.classList.toggle('is-notice', notice);
    errorDisplay.style.opacity = '';
    errorDisplay.style.top = '5%';
    errorBlur.style.filter = notice ? '' : 'saturate(0%)';     // informacja nie wyszarza karty, także w trakcie błędu

    if (visible) {
        errorDisplay.classList.remove('message-bump');
        void errorDisplay.offsetWidth;                          // ponowne dodanie klasy zaczyna animację od początku
        errorDisplay.classList.add('message-bump');
    }

    clearTimeout(messageTimer);
    messageTimer = setTimeout(() => {
        messageTimer = null;
        errorDisplay.style.opacity = 0;
        errorDisplay.style.top = '';
        errorBlur.style.filter = '';
        errorDisplay.classList.remove('message-bump');
    }, MESSAGE_VISIBLE_MS);
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

// Awatary rysuje serwer gry. Adres: /avatar/<zestaw>/<części po kolei>?v=<wersja>[&state=kicked|revealed][&motion=off]
// Wersja (z katalogu) zmienia się z każdą zmianą skórek - obrazki są w pamięci przeglądarki przez rok
function avatarUrl(avatar, state) {
    const style = avatar && AVATAR_ORDER[avatar.style] ? avatar.style : avatarStyle;
    if (!style) return 'icons/icon-192.png';

    const parts = AVATAR_ORDER[style].map(part => encodeURIComponent((avatar && avatar[part]) || '-')).join('/');
    const query = [];
    if (avatarCatalog && avatarCatalog.version) query.push(`v=${avatarCatalog.version}`);
    if (state) query.push(`state=${state}`);
    if (reducedMotion.matches) query.push('motion=off');
    return `/avatar/${style}/${parts}${query.length ? `?${query.join('&')}` : ''}`;
}

// Awatar z listy pokoi: "zestaw.część.część..." - numery w katalogu (system 36), "!wartość" dosłownie, "-" brak.
// Odpowiednik avatarCode w avatars/index.js
function decodeListAvatar(code) {
    if (!avatarCatalog || typeof code !== 'string') return null;
    const [styleIndex, ...parts] = code.split('.');
    const style = Object.keys(avatarCatalog.styles)[styleIndex];
    if (!AVATAR_ORDER[style]) return null;

    const avatar = { style };
    AVATAR_ORDER[style].forEach((part, i) => {
        const token = parts[i];
        if (!token || token === '-') return;
        if (token[0] === '!') avatar[part] = decodeURIComponent(token.slice(1));
        else {
            const item = (avatarCatalog.styles[style].parts[part] || [])[parseInt(token, 36)];
            if (item) avatar[part] = item.id;
        }
    });
    return avatar;
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
    avatarCatalogLoading = false;
    if (pendingRoomList) renderRoomList(pendingRoomList);
}

// ===== PANEL PERSONALIZACJI (zakładki i kafelki powstają z katalogu) =====

let customizeSlot = null;    // aktywna zakładka panelu

// Edycja wyglądu otwierana z menu albo ze strony gracza - powrót tam, skąd przyszedł
let customizeReturnScreen = 'screen-login';

function closeCustomize() {
    if (customizeReturnScreen === 'screen-profile') openProfile();
    else showScreen('screen-login');
}

function customizeAvatar() {
    if (!avatarCatalog) return;     // katalog jeszcze się wczytuje
    customizeReturnScreen = currentScreen === 'screen-profile' ? 'screen-profile' : 'screen-login';

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
            panel.querySelectorAll('.customize-categories-tile').forEach(t => t.classList.toggle('selected', t === tab));
            renderCustomizeOptions(true);
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

// Rysujemy tylko aktywną zakładkę; każdy kafelek pokazuje jedną część, niezależnie od reszty wyglądu,
// więc raz zrobione kafelki zakładki są zapamiętywane - przy powrocie zmienia się tylko zaznaczenie
const customizeTiles = new Map();   // "zestaw:część" -> kafelki

// flyIn: zmiana zakładki - kafelki "wlatują z góry" (przy otwarciu panelu robi to już animacja ekranu)
function renderCustomizeOptions(flyIn = false) {
    const slot = activeCatalog().slots.find(s => s.id === customizeSlot);
    const key = `${avatarStyle}:${slot.id}`;
    if (!customizeTiles.has(key)) customizeTiles.set(key, activeCatalog().parts[slot.id].map(item => createCustomizeTile(slot, item)));

    const tiles = customizeTiles.get(key);
    tiles.forEach(tile => {
        tile.classList.toggle('selected', botConfig[slot.id] === tile.dataset.part);
        // obrazek nie przyszedł mimo ponowień (np. brak zasięgu) - przy kolejnym otwarciu zakładki próbujemy od nowa
        if (tile.classList.contains('skeleton-failed')) {
            tile.classList.replace('skeleton-failed', 'skeleton');
            delete tile.dataset.retry;
            tile.src = avatarUrl({ style: botConfig.style, [slot.id]: tile.dataset.part });
        }
    });
    const list = byId('customize-list');
    list.replaceChildren(...tiles);

    // kafelki "wlatują z góry" przy zmianie zakładki (animacja fadeIn siatki zaczyna się od nowa)
    if (flyIn) {
        list.style.animation = 'none';
        void list.offsetWidth;
        list.style.animation = '';
    }
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

// Pasek w menu: wypełnienie przesuwa CSS (transition), a liczba EXP odlicza w górę razem z nim.
// Rysuje tylko przez chwilę po zmianie - potem nic nie obciąża telefonu.
const EXP_COUNT_MS = 1000;
let expAnimation = null;

function getRequiredExp(level) {
    return ProgressCore.requiredExp(level);     // progress.js - te same progi u gościa i na serwerze
}

function updateExp(exp) {
    if (exp >= getRequiredExp(playerLVL)) {
        exp -= getRequiredExp(playerLVL);
        playerLVL++;
        return updateExp(exp);
    }
    playerExp = exp;
    ProfileStore.setProgress(playerLVL, exp);
    renderExpBar(true);
}

function renderExpBar(animate) {
    const needed = getRequiredExp(playerLVL);
    const fill = byId('main-exp-fill');
    byId('main-level').textContent = `Poziom ${playerLVL}`;

    if (animate) {          // od zera do aktualnego stanu
        fill.style.transition = 'none';
        fill.style.width = '0%';
        void fill.offsetWidth;
        fill.style.transition = '';
    }
    fill.style.width = `${Math.min(100, playerExp / needed * 100)}%`;

    cancelAnimationFrame(expAnimation);
    const text = byId('main-exp-text');
    if (!animate) {
        text.textContent = `${playerExp} / ${needed} EXP`;
        return;
    }
    const start = performance.now();
    const step = now => {
        const t = Math.min(1, (now - start) / EXP_COUNT_MS);
        text.textContent = `${Math.round(playerExp * (1 - Math.pow(1 - t, 3)))} / ${needed} EXP`;
        expAnimation = t < 1 ? requestAnimationFrame(step) : null;
    };
    expAnimation = requestAnimationFrame(step);
}

// ===== POKOJE =====

const ACCOUNT_TOKEN_WAIT_MS = 3000;

// Wersja tej strony (wpisuje ją serwer, zob. assets.js) - porównywana z wersją na serwerze przy każdym połączeniu
const APP_VERSION = (document.querySelector('meta[name="app-version"]') || {}).content || '';

// Od razu WebSocket - oszczędza kilka wymian z serwerem przy łączeniu. Gdy sieć go blokuje, zostaje odpytywanie.
// Przy każdym (ponownym) połączeniu serwer dostaje nasz pokój i id - od razu przywraca nas do gry
const socket = io({
    transports: ['websocket', 'polling'],
    tryAllTransports: true,
    // token konta (auth.js) - przy pierwszym wejściu chwilę trwa założenie konta tymczasowego,
    // ale gra nie czeka na nie dłużej niż ACCOUNT_TOKEN_WAIT_MS (wtedy łączy się jako gość)
    auth: callback => Promise.race([Auth.getToken(), new Promise(r => setTimeout(r, ACCOUNT_TOKEN_WAIT_MS))])
        .catch(() => null)
        .then(token => callback({
            userId: userId,
            roomCode: localStorage.getItem('lastRoomCode') || '',
            modesVersion: availableModes.length ? (savedModes() || {}).version : undefined,
            appVersion: APP_VERSION,       // inna niż na serwerze = komunikat "Dostępna nowa wersja" (session.js)
            accessToken: token || undefined
        }))
});

// ===== KONTO =====
// Serwer wczytał konto (accounts.js): od teraz postęp liczy i zapisuje serwer, przeglądarka tylko go pokazuje.
// Za pierwszym razem przenosimy na konto postęp gościa z tej przeglądarki (raz na konto).
const IMPORTED_KEY = 'impostorProfileImported';     // postęp gościa z tej przeglądarki już raz przeniesiony
let accountMergeSent = false;

socket.on('account', data => {
    if (!data || !data.profile) return;
    const firstTime = !ProfileStore.isAccount();
    ProfileStore.useAccount({ send: (event, payload) => socket.emit(event, payload) }, data.profile);
    playerLVL = ProfileStore.get().level;
    playerExp = ProfileStore.get().exp;
    renderExpBar(false);
    // login.js i profile.js wczytują się po app.js - zdarzenie z serwera może przyjść wcześniej
    if (typeof updateAccountChip === 'function') updateAccountChip();
    if (typeof updateProfileDot === 'function') updateProfileDot();

    // Przeniesienie postępu gościa: raz na przeglądarkę (po wylogowaniu nowe konto tymczasowe nie dostaje go drugi raz)
    if (data.needsImport) {
        let imported = false;
        try { imported = localStorage.getItem(IMPORTED_KEY) === '1'; } catch (e) { /* bez pamięci */ }
        socket.emit('account_import', imported ? {} : ProfileStore.localProfile());
        try { localStorage.setItem(IMPORTED_KEY, '1'); } catch (e) { /* bez pamięci */ }
        return;
    }
    rewardInstall();                 // odznaka za uruchomienie z ikony - także na koncie

    if (accountMergeSent) {
        accountMergeSent = false;
        showError('Postęp z tego urządzenia dodany do konta', true);
    }
    if (!firstTime) return;
    // powrót z Google / linku z maila
    const redirect = Auth.takeRedirectResult();
    if (redirect && redirect.ok && !Auth.isAnonymous()) showError(`Zalogowano: ${Auth.email() || 'konto Google'}`, true);
    else if (redirect && !redirect.ok) showError(/expired|invalid/i.test(redirect.code + redirect.message) ? 'Link wygasł - wyślij nowy' : 'Logowanie nie powiodło się');
    // zalogowanie na istniejące konto: serwer pokaże, co jest na koncie gościa tego urządzenia (login.js pyta gracza)
    Auth.takeMergeToken().then(token => {
        if (!token) return;
        pendingMergeToken = token;
        socket.emit('account_merge_preview', token);
    });
});

let pendingMergeToken = null;
socket.on('account_merge_offer', offer => {
    if (!offer || offer.empty || !pendingMergeToken) { pendingMergeToken = null; return; }
    if (typeof showMergeOffer === 'function') showMergeOffer(offer);
});

// Odpowiedź z okienka "Postęp z tego urządzenia" (login.js)
function sendMergeAnswer(add) {
    if (!pendingMergeToken) return;
    accountMergeSent = add;
    socket.emit('account_merge', pendingMergeToken, add);
    pendingMergeToken = null;
}

// Pełny profil (statystyki, historia) - o który prosi strona gracza (profile.js)
socket.on('account_profile', profile => {
    ProfileStore.applyAccount(profile);
    if (currentScreen === 'screen-profile' && typeof renderProfileTabs === 'function') renderProfileTabs();
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
    byId('btn-download').classList.toggle('has-new', installOfferState().dismissed && canInstall());   // przypomnienie po "Nie teraz"
    byId('install-help').classList.add('hidden');
    if (currentScreen !== 'screen-results') closeInstallOffer();     // np. host od razu zaczął kolejną rundę
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
    closeInstallOffer();
    updateCornerButtons();
});

async function installApp() {
    if (!installPrompt) {
        const help = byId('install-help');
        // iPad: "Udostępnij" u góry po prawej (strzałka w górę), iPhone: na dolnym pasku Safari
        help.classList.toggle('is-ipad', /ipad/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
        help.classList.toggle('hidden');
        return;
    }
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    updateCornerButtons();
}

function closeInstallHelp() {
    byId('install-help').classList.add('hidden');
}

// ===== PROPOZYCJA INSTALACJI PO GRZE =====
// Okno po wynikach: po 2. grze, potem po kolejnych 5 i 10 (najwyżej 3 razy). Od drugiego razu można wybrać
// "Nie pokazuj więcej". Po "Nie teraz" przycisk instalacji w rogu menu ma czerwoną kropkę i co jakiś czas podskakuje.
// Nagroda: odznaka "Stały bywalec" przy pierwszym uruchomieniu gry z ikony.

const INSTALL_OFFER_GAPS = [2, 5, 10];     // ile gier przed kolejnym pokazaniem okna
const INSTALL_OFFER_DELAY_MS = 2500;       // po werdykcie - najpierw wynik, potem propozycja
let installOfferTimer = null;

function installOfferState() {
    let state = null;
    try { state = JSON.parse(localStorage.getItem(INSTALL_OFFER_KEY)); } catch (e) { /* bez pamięci */ }
    // starsza wersja gry zapisywała tylko "1" (okno pokazane raz) - liczymy to jako pierwsze pokazanie
    if (state === 1) state = { shows: 1, games: 0 };
    return state && typeof state === 'object' ? { shows: 0, games: 0, never: false, dismissed: false, ...state } : { shows: 0, games: 0, never: false, dismissed: false };
}

function saveInstallOfferState(state) {
    try { localStorage.setItem(INSTALL_OFFER_KEY, JSON.stringify(state)); } catch (e) { /* bez pamięci */ }
}

// Wywoływane po każdej grze (ekran wyników)
function showInstallOffer() {
    const state = installOfferState();
    if (state.never || state.shows >= INSTALL_OFFER_GAPS.length || !canInstall()) return;
    state.games++;
    saveInstallOfferState(state);
    if (state.games < INSTALL_OFFER_GAPS[state.shows]) return;

    // liczy się dopiero, gdy okno naprawdę się pokaże (gracz mógł już wyjść z wyników - wtedy po następnej grze)
    clearTimeout(installOfferTimer);
    installOfferTimer = setTimeout(() => {
        if (currentScreen !== 'screen-results' || !canInstall()) return;
        const shown = installOfferState();
        shown.games = 0;
        shown.shows++;
        saveInstallOfferState(shown);
        byId('install-never').classList.toggle('hidden', shown.shows < 2);
        byId('install-offer').classList.remove('hidden', 'closing');
    }, RESULTS_SUSPENSE_MS + INSTALL_OFFER_DELAY_MS);
}

function closeInstallOffer() {
    clearTimeout(installOfferTimer);
    const panel = byId('install-offer');
    if (panel.classList.contains('hidden') || panel.classList.contains('closing')) return;
    panel.classList.add('closing');
    setTimeout(() => {
        if (!panel.classList.contains('closing')) return;
        panel.classList.add('hidden');
        panel.classList.remove('closing');
    }, PICKER_CLOSE_MS);
}

function acceptInstallOffer() {
    closeInstallOffer();
    installApp();
}

// "Nie teraz" albo "Nie pokazuj więcej": okno znika, a przycisk w rogu menu dostaje przypominającą kropkę
function dismissInstallOffer(never = false) {
    const state = installOfferState();
    state.dismissed = true;
    if (never) state.never = true;
    saveInstallOfferState(state);
    closeInstallOffer();
    updateCornerButtons();
}

// Gra uruchomiona z ikony: odznaka "Stały bywalec" (raz) i komunikat na zachętę
async function rewardInstall() {
    if (!isInstalled() || typeof ProfileStore === 'undefined') return;
    const earned = await ProfileStore.recordFeat('installed');
    if (!earned.length) return;
    if (typeof updateProfileDot === 'function') updateProfileDot();
    showError('Nowa odznaka: Stały bywalec', true);
}
document.addEventListener('DOMContentLoaded', rewardInstall);

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

// Lista trybów zmienia się tylko z nową wersją gry - trzymamy ją u siebie, a serwer przysyła ją,
// gdy podana przy łączeniu wersja jest nieaktualna (oszczędza transfer przy każdym ponownym połączeniu)

function savedModes() {
    try {
        const saved = JSON.parse(localStorage.getItem('modeList'));
        return saved && Array.isArray(saved.modes) ? saved : null;
    } catch (e) {
        return null;
    }
}

function renderModes(modes, version) {
    availableModes = modes;
    if (version) {
        try { localStorage.setItem('modeList', JSON.stringify({ version, modes })); } catch (e) {}
    }
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
    renderGameOptions(true);
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

// Okno budowane raz przy otwarciu (elementy wjeżdżają po kolei). Kliknięcie albo zmiana od serwera
// tylko przełącza klasy - przełącznik, kółko, ramka i kolor przechodzą płynnie (transition w style.css).
let gameOptionsMode = null;

function renderGameOptions(fresh = false) {
    const mode = findMode(gameMode);
    if (!mode) return;
    const options = mode.options || [];
    const roles = options.filter(option => option.players > 0);
    if (fresh || gameOptionsMode !== mode.id) buildGameOptions(mode, options, roles);

    byId('options-list').querySelectorAll('[data-option]').forEach(element => {
        element.classList.toggle('is-on', Boolean(roomOptions[element.dataset.option]));
    });
    const extra = roles.filter(option => roomOptions[option.id]).length;
    const count = byId('options-roles-count');
    if (count) count.textContent = `${extra} / ${roles.length}`;
    const needed = parseInt(impostors) + (extra > 0 ? extra + 2 : 1);    // jak na serwerze
    byId('options-players').replaceChildren(GameIcons.element('ui_players', 'options-players-icon'), `Potrzeba co najmniej ${needed} graczy`);
}

function buildGameOptions(mode, options, roles) {
    gameOptionsMode = mode.id;
    const prepare = (element, option) => {
        element.dataset.option = option.id;
        if (option.color) element.style.setProperty('--option-color', option.color);
        // od razu u siebie (szybkie kliknięcia kilku opcji nie cofają się nawzajem), potem do serwera,
        // który i tak odsyła ustawienia pokoju wszystkim
        element.onclick = () => {
            roomOptions = { ...roomOptions, [option.id]: !roomOptions[option.id] };
            renderGameOptions();
            changeSettings({ options: roomOptions });
        };
        return element;
    };

    // Zasady (bez dodatkowych graczy): wiersz z opisem i przełącznikiem
    const rules = options.filter(option => !option.players).map(option => {
        const row = prepare(createElement('div', 'option-row'), option);
        const text = createElement('div', 'option-text');
        text.append(createElement('div', 'option-name', option.name), createElement('div', 'option-description', option.description));
        const switcher = createElement('span', 'privacy-switch option-switch');
        switcher.append(createElement('span', 'privacy-knob'));
        if (GameIcons.has(option.id)) row.append(GameIcons.element(option.id, 'option-icon'));      // icons.js
        row.append(text, switcher);
        return row;
    });

    // Dodatkowe role: kafelki 2x2 z ikoną, krótkim opisem i kółkiem zaznaczenia
    const tiles = roles.map(option => {
        const tile = prepare(createElement('div', 'option-tile'), option);
        tile.title = option.description;
        tile.append(createElement('span', 'option-check'), GameIcons.element(GameIcons.has(option.id) ? option.id : 'secret', 'option-tile-icon'),
            createElement('div', 'option-name', option.name), createElement('div', 'option-description', option.short || option.description));
        return tile;
    });

    const section = (title, countId) => {
        const head = createElement('div', 'options-section');
        head.append(createElement('span', '', title));
        if (countId) {
            const count = createElement('span');
            count.id = countId;
            head.append(count);
        }
        return head;
    };
    const list = [];
    if (rules.length) list.push(section('Zasady'), ...rules);
    if (roles.length) {
        const grid = createElement('div', 'option-tiles');
        grid.append(...tiles);
        list.push(section('Dodatkowe role', 'options-roles-count'), grid);
    }
    // wjazd po kolei: nagłówki, wiersze i kafelki
    [...list.filter(element => !element.classList.contains('option-tiles')), ...tiles].forEach((element, i) => {
        element.classList.add('picker-enter');
        element.style.animationDelay = `${i * 40}ms`;
    });
    byId('options-list').replaceChildren(...list);
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
// Awatar nie przyszedł (np. chwilowa przerwa w sieci na telefonie): dwie kolejne próby, dopiero potem szary kafelek.
// Ważne w panelu wyglądu - jego kafelki są zapamiętywane, więc bez ponowienia zostałyby szare do odświeżenia strony.
const IMAGE_RETRIES = 2;
const IMAGE_RETRY_MS = 1500;
document.addEventListener('error', event => {
    const img = event.target;
    if (img.tagName !== 'IMG' || img.src.startsWith('data:')) return;
    const tries = Number(img.dataset.retry || 0);
    if (tries < IMAGE_RETRIES && new URL(img.src).pathname.startsWith('/avatar/')) {
        img.dataset.retry = String(tries + 1);
        setTimeout(() => {
            const url = new URL(img.src);
            url.searchParams.set('retry', String(tries + 1));     // inny adres = przeglądarka naprawdę pyta jeszcze raz
            img.src = url.toString();
        }, IMAGE_RETRY_MS * (tries + 1));
        return;
    }
    if (img.classList.contains('skeleton')) img.classList.replace('skeleton', 'skeleton-failed');
}, true);

function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}

// Wpis listy pokoi z serwera: [kod, stan, liczba graczy, nick hosta, awatar hosta, [awatary graczy]]
const MAX_ROOM_PLAYERS = 16;    // jak MAX_PLAYERS w server.js
const LIST_FULL = 1, LIST_PLAYING = 2;

function createRoomRow([code, state, playerCount, hostName, hostCode, playerCodes]) {
    const joinable = state !== LIST_FULL && state !== LIST_PLAYING;
    const row = createElement('div', 'room-row');

    const hostAvatar = createElement('img', 'room-row-host skeleton');
    hostAvatar.src = avatarUrl(decodeListAvatar(hostCode));

    // Pod nickiem: kod i gracze albo powód, dla którego nie da się wejść
    const details = createElement('div', 'room-row-details');
    if (state === LIST_PLAYING) details.append('W trakcie gry');
    else if (state === LIST_FULL) details.append('Pełny');
    else details.append(`#${code}`);

    playerCodes.forEach(playerCode => {
        const avatar = createElement('img', 'skeleton');
        avatar.src = avatarUrl(decodeListAvatar(playerCode));
        details.append(avatar);
    });
    const hiddenPlayers = playerCount - 1 - playerCodes.length;
    if (hiddenPlayers > 0) details.append(`+${hiddenPlayers}`);

    const info = createElement('div', 'room-row-info');
    info.append(createElement('div', 'room-row-name', hostName), details);

    if (joinable) {
        row.classList.add('joinable');
        row.onclick = () => joinRoom(code);
    } else {
        row.classList.add('locked');
    }

    row.append(hostAvatar, info, createElement('div', 'room-row-count', `${playerCount}/${MAX_ROOM_PLAYERS}`));
    return row;
}

let renderedRoomList = null;
let pendingRoomList = null;     // lista, która przyszła przed katalogiem awatarów (bez niego nie odczytamy awatarów)
let roomIsPrivate = false;
let amIHost = false;

function renderRoomList(rooms) {
    // gdy katalog się nie wczyta, lista i tak się pokaże - z zastępczymi obrazkami
    if (avatarCatalogLoading) {
        pendingRoomList = rooms;
        return;
    }
    pendingRoomList = null;

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

// Nicki pokazane w poczekalni - w pokoju publicznym serwer zamienia wulgaryzmy na gwiazdki (nickFilter.js),
// w prywatnym pokazuje je w całości. Zmieniony nick miga, a jego właściciel dostaje wyjaśnienie.
const shownNames = new Map();     // id gracza -> ostatnio pokazany nick
let shownNamesRoom = null;

function noteNameChanges(room) {
    if (shownNamesRoom !== room.code) {
        shownNames.clear();
        shownNamesRoom = room.code;
    }
    const me = room.players.find(p => p.id === myPlayerId);
    const myBefore = shownNames.get(myPlayerId);
    if (me && me.name !== myBefore) {
        const typed = byId('input-name').value;
        if (me.name.includes('*') && !typed.includes('*')) {
            showError(`W pokoju publicznym Twój nick wyświetla się jako ${me.name}`, true);
        } else if (myBefore && myBefore.includes('*') && !me.name.includes('*')) {
            showError('Pokój prywatny - Twój nick wyświetla się w całości', true);
        }
    }
    const changed = new Set(room.players.filter(p => shownNames.has(p.id) && shownNames.get(p.id) !== p.name).map(p => p.id));
    room.players.forEach(p => shownNames.set(p.id, p.name));
    return changed;
}

function renderLobby(room) {
    const isHost = room.hostId === myPlayerId;
    const list = byId('players-list');
    const changedNames = noteNameChanges(room);

    amIHost = isHost;
    roomIsPrivate = room.isPrivate;

    byId('room-code-display').innerText = room.code;
    byId('room-privacy').classList.toggle('is-private', room.isPrivate);
    byId('room-privacy').classList.toggle('is-host', isHost);
    byId('room-privacy-label').textContent = room.isPrivate ? '\u{1F512} Pokój prywatny' : 'Pokój publiczny';

    applySettings(room.settings);

    // Nowy pokój (albo powrót do niego) - wszystkie kafelki wchodzą od nowa
    if (lobbyTilesRoom !== room.code) {
        lobbyTiles.clear();
        lobbyTilesRoom = room.code;
        list.replaceChildren();
    }

    const tiles = room.players.map(p => {
        const key = JSON.stringify([p.name, avatarUrl(p.avatar), p.id === room.hostId, Boolean(p.away), p.id === myPlayerId, isHost]);
        const known = lobbyTiles.get(p.id);
        if (known && known.key === key) return known.element;      // nic się nie zmieniło - kafelek zostaje, bez animacji

        const element = createPlayerTile(p, room, isHost, known && known.element);
        if (known) element.classList.add('no-enter');                // był już w pokoju - nie "wchodzi" drugi raz
        if (changedNames.has(p.id)) element.classList.add('nick-changed');
        lobbyTiles.set(p.id, { key, element });
        return element;
    });

    const present = new Set(room.players.map(p => p.id));
    lobbyTiles.forEach((tile, id) => { if (!present.has(id)) lobbyTiles.delete(id); });

    // Na liście zostają te same elementy: przeniesienie albo ponowne wstawienie elementu odpaliłoby jego animację od nowa
    if (!lobbyInviteSlot) lobbyInviteSlot = createInviteSlot();
    const wanted = [...tiles, lobbyInviteSlot];
    [...list.children].forEach(child => { if (!wanted.includes(child)) child.remove(); });
    wanted.forEach((element, i) => {
        const current = list.children[i];
        if (current !== element) list.insertBefore(element, current || null);
    });
    fitPlayerTags(list);
}

// Kafelki poczekalni wg id gracza: odświeżane tylko wtedy, gdy coś się w nich zmieniło
const lobbyTiles = new Map();     // id gracza -> { key, element }
let lobbyTilesRoom = null;
let lobbyInviteSlot = null;

function createPlayerTile(p, room, isHost, previous) {
    const container = createElement('div', 'avatar-container');
    container.id = `player-${p.id}`;
    container.style.position = 'relative';
    container.onclick = () => sendFuck(p.id);
    if (p.away) {
        container.classList.add('away');
        container.title = 'Ogląda jeszcze wyniki';
    }

    // ten sam wygląd - ten sam obrazek (nowy wczytywałby się i mignął szkieletem)
    const url = avatarUrl(p.avatar);
    const oldAvatar = previous && previous.querySelector('.player-avatar');
    let avatar = oldAvatar && oldAvatar.getAttribute('src') === url ? oldAvatar : null;
    if (!avatar) {
        avatar = createElement('img', 'player-avatar skeleton');
        avatar.src = url;
    }

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
    return container;
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
        tag.style.maxWidth = '';
        tag.classList.remove('clipped');
        if (tag.offsetWidth <= maxWidth) return;

        tag.style.paddingLeft = tag.style.paddingRight = '6px';
        let size = parseFloat(getComputedStyle(tag).fontSize);
        while (tag.offsetWidth > maxWidth && size > TAG_MIN_FONT) {
            size = Math.max(TAG_MIN_FONT, size - 0.5);
            tag.style.fontSize = `${size}px`;
        }
    });
    clipWidestTags(list);
    breakPlayerRows(list);
}

// Ostateczność (wąski telefon, długie nicki): gdy trzy kafelki rzędu nie mieszczą się nawet z najmniejszą czcionką,
// najszersze plakietki rzędu dostają wspólną maksymalną szerokość i wielokropek - tylko tyle, ile trzeba,
// żeby w rzędzie zostało 3 graczy. Pełny nick w podpowiedzi.
function clipWidestTags(list) {
    const width = list.clientWidth;
    const tiles = [...list.querySelectorAll('.avatar-container')];
    for (let i = 0; i < tiles.length; i += PLAYERS_PER_ROW) {
        const row = tiles.slice(i, i + PLAYERS_PER_ROW);
        const room = width - (row.length - 1) * PLAYERS_GAP;
        const widths = row.map(tile => tile.offsetWidth);
        if (widths.reduce((sum, w) => sum + w, 0) <= room) continue;

        // wspólny limit c: suma min(szerokość, c) = miejsce w rzędzie ("Zaproś +" się nie skraca)
        const clippable = row.map(tile => !tile.classList.contains('invite-slot'));
        let limit = Math.max(...widths);
        while (limit > 0 && row.reduce((sum, tile, k) => sum + (clippable[k] ? Math.min(widths[k], limit) : widths[k]), 0) > room) limit--;
        row.forEach((tile, k) => {
            const tag = tile.querySelector('.player-tag');
            if (!clippable[k] || widths[k] <= limit || !tag) return;
            tag.classList.add('clipped');
            tag.style.maxWidth = `${limit}px`;
            tag.title = tag.textContent;
        });
    }
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
    // przy kliknięciu, nie przy rysowaniu: po odświeżeniu serwer potrafi przywrócić poczekalnię, zanim wczyta się invite.js
    container.onclick = () => openInvite();

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

// Nowe hasło / pytanie dla wszystkich (ktoś nie zna hasła, pytanie nie pasuje do grupy) - role zostają
const SKIP_CONTENT = { impostor: 'hasło', pytania: 'pytanie' };
let skipMode = null;

function updateSkipButton(data) {
    skipMode = data.mode;
    const button = byId('btn-skip');
    const what = SKIP_CONTENT[data.mode];
    button.classList.toggle('hidden', !what || !data.skipsLeft);
    if (what) button.textContent = `NOWE ${what.toUpperCase()} (${data.skipsLeft})`;
}

function skipContent() {
    if (confirm(`Wylosować nowe ${SKIP_CONTENT[skipMode]} dla wszystkich?`)) socket.emit('skip_content', currentRoomCode);
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

    showInstallOffer();

    // Konto: EXP, poziom i odznaki policzył i zapisał serwer (accounts.js)
    if (results.progress) {
        const progress = results.progress;
        byId('res-exp').textContent = `+${progress.gainedExp} EXP`;
        ProfileStore.applyAccount({ level: progress.level, exp: progress.exp, unseenBadges: progress.unseenBadges });
        playerLVL = progress.level;
        playerExp = progress.exp;
        renderExpBar(true);
        showEarnedBadges(progress.earned);       // profile.js
        updateProfileDot();
        if (typeof noteLevelForLogin === 'function') noteLevelForLogin(progress.level);   // login.js - zachęta po poziomie 3 i 10
        return;
    }

    // Gość: wszystko liczy przeglądarka (te same zasady - progress.js)
    const gainedExp = ProgressCore.expForGame(results, wasIKicked);
    byId('res-exp').textContent = `+${gainedExp} EXP`;
    recordFinishedGame(results, wasIKicked);        // profile.js - statystyki, historia, odznaki
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
if (savedModes()) renderModes(savedModes().modes);    // zapamiętana lista - serwer jej już nie przyśle

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
    noteRoundStart(data);       // profile.js - kategoria i czas rundy do statystyk
    updateSkipButton(data);
    if (data.countdown) startCountdown();
    else sfx.play('roundStart');
    if (data.skipped) showError(`Host wylosował nowe ${SKIP_CONTENT[data.mode] || 'zadanie'} - sprawdź kartę`, true);
    socket.emit('check_host', currentRoomCode);
});

socket.on('start_vote', (vote) => {
    showScreen('screen-vote');
    sfx.play('voteStart');
    noteVote(vote);             // profile.js - odpowiedzi w "Kto z nas" do statystyk
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


// Przyciski w rogach od razu po wczytaniu strony (później odświeża je showScreen)
updateCornerButtons();
