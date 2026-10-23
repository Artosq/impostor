// SESJA GRACZA: połączenie z serwerem, ekran bez wygaszania i przycisk "wstecz".
// Ładowany po app.js (korzysta z socket, currentScreen, showScreen i reszty).

// ===== POŁĄCZENIE =====
// Po uśpieniu telefonu albo zmianie karty połączenie bywa martwe, choć przeglądarka uważa je za aktywne.
// Dlatego po każdym powrocie do gry sprawdzamy je pingiem, a gdy nie odpowiada - łączymy od nowa.
// Kliknięcia z czasu zerwania są wysyłane po ponownym połączeniu, a serwer przywraca nas do pokoju
// jeszcze przed nimi. Gdy mimo wszystko połączenie nie wraca, strona sama się odświeża.

const CONNECTION_BANNER_DELAY_MS = 1000;   // krótkie zerwania nie migają paskiem
const PING_TIMEOUT_MS = 2500;
const AUTO_RELOAD_AFTER_MS = 20000;        // tyle bez połączenia (przy działającym internecie) = odświeżenie
const AUTO_RELOAD_GUARD_MS = 60000;        // nie częściej niż raz na minutę

let disconnectedSince = null;
let bannerTimer = null;

function setConnectionBanner(visible) {
    byId('connection-banner').classList.toggle('hidden', !visible);
    byId('card').classList.toggle('disconnected', visible);
}

socket.on('disconnect', () => {
    disconnectedSince = Date.now();
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => setConnectionBanner(true), CONNECTION_BANNER_DELAY_MS);
});

socket.on('connect', () => {
    disconnectedSince = null;
    clearTimeout(bannerTimer);
    setConnectionBanner(false);
});

// Czy połączenie naprawdę działa? Jeśli serwer nie odpowie na ping, zaczynamy od nowa
function checkConnection() {
    if (!socket.connected) {
        socket.connect();
        return;
    }
    socket.timeout(PING_TIMEOUT_MS).emit('ping_check', error => {
        if (!error) return;
        socket.disconnect();
        socket.connect();
    });
}

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkConnection();
});
window.addEventListener('online', checkConnection);
window.addEventListener('focus', checkConnection);
// powrót przyciskiem "wstecz" z innej strony (strona wyjęta z pamięci przeglądarki)
window.addEventListener('pageshow', event => {
    if (event.persisted) checkConnection();
});

// Ostateczność: odświeżenie strony (pokój i wygląd są zapamiętane, więc nic nie ginie).
// Tylko gdy serwer odpowiada - jeśli leży, odświeżenie dałoby stronę błędu przeglądarki zamiast paska "Łączenie…"
let reloadCheckRunning = false;

async function reloadIfStuck() {
    const stuck = disconnectedSince !== null && Date.now() - disconnectedSince > AUTO_RELOAD_AFTER_MS;
    if (!stuck || reloadCheckRunning || document.visibilityState !== 'visible' || !navigator.onLine) return;

    let lastReload = 0;
    try { lastReload = Number(sessionStorage.getItem('autoReloadAt')) || 0; } catch (e) { /* bez pamięci */ }
    if (Date.now() - lastReload < AUTO_RELOAD_GUARD_MS) return;

    reloadCheckRunning = true;
    try {
        const response = await fetch('/health', { cache: 'no-store', signal: AbortSignal.timeout(3000) });
        if (response.ok && !socket.connected) {
            try { sessionStorage.setItem('autoReloadAt', String(Date.now())); } catch (e) { /* bez pamięci */ }
            location.reload();
        }
    } catch (e) {
        // serwer nie odpowiada - zostaje pasek "Łączenie…", Socket.IO sam próbuje dalej
    } finally {
        reloadCheckRunning = false;
    }
}
setInterval(reloadIfStuck, 2000);

// ===== EKRAN NIE GAŚNIE W TRAKCIE GRY =====
// Runda to głównie rozmowa - telefon nie powinien się w tym czasie wygaszać.

const AWAKE_SCREENS = ['screen-lobby', 'screen-game', 'screen-vote', 'screen-results', 'screen-editor'];
let wakeLock = null;

async function updateWakeLock() {
    if (!('wakeLock' in navigator)) return;
    const wanted = AWAKE_SCREENS.includes(currentScreen) && document.visibilityState === 'visible';

    if (wanted && !wakeLock) {
        try {
            wakeLock = await navigator.wakeLock.request('screen');
            wakeLock.addEventListener('release', () => { wakeLock = null; });
        } catch (e) {
            wakeLock = null;     // np. tryb oszczędzania baterii - gra działa dalej normalnie
        }
    } else if (!wanted && wakeLock) {
        wakeLock.release().catch(() => {});
        wakeLock = null;
    }
}
// Przeglądarka zwalnia blokadę po schowaniu karty - po powrocie bierzemy ją jeszcze raz
document.addEventListener('visibilitychange', updateWakeLock);

// ===== PRZYCISK "WSTECZ" =====
// Zamiast opuszczać stronę: zamyka okno, wraca do poprzedniego ekranu albo pyta o wyjście z pokoju.
// Przeglądarki pomijają wpisy historii dodane bez dotknięcia strony, dlatego "pułapkę" zakładamy
// przy pierwszym dotknięciu (i ponownie po każdym użyciu "wstecz").

let backTrapSet = false;

function setBackTrap() {
    if (backTrapSet) return;
    history.pushState({ impostorBack: true }, '');
    backTrapSet = true;
}
document.addEventListener('pointerdown', setBackTrap, { capture: true });
document.addEventListener('keydown', setBackTrap, { capture: true });

function isOpen(id) {
    const element = byId(id);
    return !element.classList.contains('hidden') && !element.classList.contains('closing');
}

// Zwraca true, gdy "wstecz" zostało obsłużone w grze
function handleBack() {
    if (isOpen('rules')) return closeRules(), true;
    if (isOpen('invite')) return closeInvite(), true;
    if (isOpen('category-picker')) return closeCategoryPicker(), true;
    if (!byId('install-help').classList.contains('hidden')) return byId('install-help').classList.add('hidden'), true;

    switch (currentScreen) {
        case 'screen-editor':
            closeCategoryEditor();      // pyta o niezapisane zmiany
            return true;
        case 'screen-customize':
            showScreen('screen-login');
            return true;
        case 'screen-lobby':
            if (confirm('Wyjść z pokoju?')) leaveRoom();
            return true;
        case 'screen-game':
        case 'screen-vote':
            if (confirm('Wyjść z trwającej gry?')) leaveRoom();
            return true;
        case 'screen-results':
            leaveRoom();
            return true;
    }
    return false;       // menu bez otwartych okien - kolejne "wstecz" normalnie opuści stronę
}

window.addEventListener('popstate', () => {
    backTrapSet = false;
    if (handleBack()) setBackTrap();
});

// ===== ORIENTACJA PIONOWA =====
// Zainstalowana aplikacja na Androidzie jest zablokowana w pionie przez manifest. Tam, gdzie przeglądarka pozwala
// (aplikacja, pełny ekran), prosimy też o blokadę wprost. W zwykłej karcie gra obraca się w CSS w drugą stronę -
// tutaj tylko zaznaczamy, w którą stronę obrócono telefon, żeby obraz nie stanął do góry nogami.
function lockPortrait() {
    if (screen.orientation && screen.orientation.lock) screen.orientation.lock('portrait').catch(() => {});
}
document.addEventListener('pointerdown', lockPortrait, { once: true, capture: true });

function markLandscapeSide() {
    const type = screen.orientation ? screen.orientation.type : '';
    const secondary = type === 'landscape-secondary' || window.orientation === -90;
    document.documentElement.classList.toggle('landscape-secondary', secondary);
}
if (screen.orientation) screen.orientation.addEventListener('change', markLandscapeSide);
window.addEventListener('orientationchange', markLandscapeSide);
markLandscapeSide();
