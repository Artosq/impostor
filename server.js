const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { Server } = require('socket.io');
const { cleanText, publicPlayer } = require('./utils');
const { getMode, listModes, cleanOptions } = require('./modes');
const avatars = require('./avatars');
const assets = require('./assets');
const nicks = require('./public/js/nicks');
const { maskNick } = require('./nickFilter');
const accounts = require('./accounts');
const analytics = require('./analytics');

// USTAWIENIA
const PORT = process.env.PORT || 10000;
const MAX_ROOMS = 500;
const MAX_PLAYERS = 16;
const MAX_NAME_LENGTH = 12;
const MAX_LEVEL = 999;

const LIST_AVATARS = 5;                     // ilu graczy (poza hostem) widać na liście pokoi
const LIST_MAX_ROOMS = 12;                  // na telefonie widać kilka - więcej i tak nikt nie przewija
const LIST_THROTTLE_MS = 2500;              // zmiany listy z tego czasu idą jedną wiadomością
const MENU = 'menu';                        // pokój Socket.IO osób w menu - tylko one dostają listę pokoi

const MIN_VOTE_MS = 5 * 1000;               // host może zakończyć głosowanie dopiero po tym czasie
const MAX_SKIPS = 3;                        // ile razy na rundę host może wylosować nowe hasło / pytanie
const RESULTS_VISIBLE_MS = 60 * 1000;       // czas na kliknięcie "Zagraj ponownie" po wynikach
const DISCONNECT_GRACE_MS = 2 * 60 * 1000;  // czas na powrót rozłączonego gracza
const ROOM_IDLE_MS = 10 * 60 * 1000;        // pokój, w którym nikt nie jest połączony
const ROOM_MAX_IDLE_MS = 60 * 60 * 1000;    // pokój bez żadnej akcji
const CLEANUP_INTERVAL_MS = 30 * 1000;

const app = express();
const server = http.createServer(app);

// Strona i jej pliki: skompresowane z góry i z długim cache (zob. assets.js)
app.use(assets.serve);
avatars.register(app);

// Link zaproszenia: /1234 otwiera menu z wpisanym kodem pokoju
app.get(/^\/(\d{4})$/, (req, res) => res.redirect(302, `/?kod=${req.params[0]}`));

// Strona analityki (tylko dla admina - dane sprawdza /api/analytics)
app.get('/analityka', (req, res) => res.redirect(302, '/analityka.html'));

// ANALITYKA: dane dla strony /analityka - tylko dla admina (konto z e-mailem z ADMIN_EMAILS w ustawieniach Render)
app.get('/api/analytics', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!analytics.enabled || !accounts.enabled) return res.status(503).json({ error: 'Analityka wyłączona (brak bazy)' });
    const token = (req.get('authorization') || '').replace(/^Bearer /, '');
    let identity = null;
    try { identity = token ? await accounts.verifyToken(token) : null; } catch (e) { /* zły token */ }
    if (!identity) return res.status(401).json({ error: 'Zaloguj się w grze' });
    if (!analytics.isAdmin(identity)) return res.status(403).json({ error: 'To konto nie ma dostępu do analityki' });

    const day = /^\d{4}-\d{2}-\d{2}$/;
    const to = day.test(req.query.to) ? req.query.to : analytics.warsawDay();
    const from = day.test(req.query.from) ? req.query.from : '2000-01-01';
    try {
        const report = await analytics.report(from, to);
        res.json({ ...report, online: io.engine.clientsCount });
    } catch (err) {
        console.error('Analityka (raport):', err.message);
        res.status(500).json({ error: 'Nie udało się pobrać danych' });
    }
});

// Lekki adres do sprawdzania, czy serwer żyje (używa go też budzik poniżej)
app.get('/health', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.send('ok');
});

// Klienta Socket.IO podaje assets.js (wersja zminifikowana, skompresowana, z cache)
// Ping co 10 s: zerwane połączenie (uśpiony telefon, zmiana sieci) wychodzi na jaw po ok. 18 s, a nie po 45 s.
// Kompresja wiadomości (permessage-deflate) z pamięcią poprzednich wiadomości na każdym połączeniu:
// w teście ok. 15x mniej transferu (limit egress na Renderze), za cenę ok. 40% więcej CPU
// i ok. 0,23 MB RAM na gracza. Pingi i drobne wiadomości (poniżej progu) idą bez kompresji.
const io = new Server(server, {
    cors: { origin: "*" },
    serveClient: false,
    pingInterval: 10000,
    pingTimeout: 8000,
    perMessageDeflate: { threshold: 256 },
    maxHttpBufferSize: 256 * 1024     // największa wiadomość to własna kategoria hosta (~60 KB); domyślnie 1 MB
});

// ===== OCHRONA PRZED SPAMEM =====
// Każde zdarzenie od gracza ma limit: ile razy (count) w danym czasie (ms). Nadmiar jest po cichu pomijany -
// zwykły gracz nigdy go nie dobija. Połączenie, które zalewa serwer (ponad FLOOD_LIMIT zdarzeń w FLOOD_WINDOW_MS),
// jest zrywane: to skrypt, nie człowiek.
const RATE_LIMITS = {
    create_room: { count: 4, ms: 10000 },
    join_room: { count: 8, ms: 10000 },
    rejoin_room: { count: 8, ms: 10000 },
    set_room_settings: { count: 20, ms: 5000 },
    send_fuck: { count: 5, ms: 3000 },          // reakcje
    kick_player: { count: 5, ms: 5000 },
    set_room_privacy: { count: 6, ms: 5000 },
    ping_check: { count: 10, ms: 10000 },
    account_import: { count: 2, ms: 60000 },
    account_merge: { count: 3, ms: 60000 },
    account_merge_preview: { count: 3, ms: 60000 },
    track: { count: 5, ms: 60000 },
    get_profile: { count: 10, ms: 10000 },
    default: { count: 20, ms: 5000 }
};
const FLOOD_LIMIT = 150;
const FLOOD_WINDOW_MS = 10000;
const RATE_LIMITED_MESSAGE = { create_room: 'Za dużo prób, poczekaj chwilę', join_room: 'Za dużo prób, poczekaj chwilę' };

// Licznik na jedno połączenie: zdarzenie -> czasy ostatnich wywołań (tylko z okna limitu)
function createRateLimiter() {
    const recent = new Map();
    let floodCount = 0;
    let floodStart = Date.now();
    return {
        // false = zdarzenie pominąć
        allow(event) {
            const now = Date.now();
            if (now - floodStart > FLOOD_WINDOW_MS) { floodStart = now; floodCount = 0; }
            floodCount++;
            const limit = RATE_LIMITS[event] || RATE_LIMITS.default;
            const times = (recent.get(event) || []).filter(t => now - t < limit.ms);
            if (times.length >= limit.count) { recent.set(event, times); return false; }
            times.push(now);
            recent.set(event, times);
            return true;
        },
        flooding: () => floodCount > FLOOD_LIMIT
    };
}

const rooms = new Map();

// NARZĘDZIA
function isValidUserId(userId) {
    return typeof userId === 'string' && userId.length >= 8 && userId.length <= 64;
}

// LIMIT ZŁYCH KODÓW: kody mają 4 cyfry, więc bez limitu dałoby się zgadywać prywatne pokoje skryptem.
// Liczymy tylko nietrafione kody, na adres IP (zza serwera pośredniczącego Rendera - z x-forwarded-for).
const JOIN_FAIL_LIMIT = 10;
const JOIN_FAIL_WINDOW_MS = 60 * 1000;
const joinFailures = new Map();    // ip -> { count, resetAt }

function clientIp(socket) {
    const forwarded = socket.handshake.headers['x-forwarded-for'];
    return (forwarded ? forwarded.split(',')[0] : socket.handshake.address || '').trim();
}

function tooManyJoinFailures(ip) {
    const entry = joinFailures.get(ip);
    return Boolean(entry && entry.resetAt > Date.now() && entry.count >= JOIN_FAIL_LIMIT);
}

function noteJoinFailure(ip) {
    const now = Date.now();
    const entry = joinFailures.get(ip);
    if (!entry || entry.resetAt <= now) joinFailures.set(ip, { count: 1, resetAt: now + JOIN_FAIL_WINDOW_MS });
    else entry.count++;
}

setInterval(() => {
    const now = Date.now();
    joinFailures.forEach((entry, ip) => { if (entry.resetAt <= now) joinFailures.delete(ip); });
}, JOIN_FAIL_WINDOW_MS).unref();

function generateRoomCode() {
    let roomCode;
    do {
        roomCode = Math.floor(1000 + Math.random() * 9000).toString();
    } while (rooms.has(roomCode));
    return roomCode;
}

// Poziom liczy przeglądarka gracza - to tylko ozdoba w poczekalni
function cleanLevel(level) {
    return Number.isInteger(level) && level >= 1 && level <= MAX_LEVEL ? level : 1;
}

function createPlayer(socket, { userId, playerName, avatar, level }) {
    const name = cleanText(playerName, MAX_NAME_LENGTH) || 'Gracz';
    return {
        userId: userId,                     // sekret gracza - nigdy nie trafia do innych klientów
        publicId: crypto.randomBytes(6).toString('base64url'),  // identyfikator widoczny dla wszystkich (krótki - powtarza się w wielu wiadomościach)
        socketId: socket.id,
        connected: true,
        rawName: name,                      // pełny nick (zostaje na serwerze)
        name: name,                         // nick pokazywany innym - w pokoju publicznym z gwiazdkami (applyRoomNames)
        avatar: avatars.cleanAvatar(avatar),
        level: cleanLevel(level)
    };
}

// Pokój publiczny widzą obcy: wulgaryzmy i obelgi w nickach zamieniają się na gwiazdki (nickFilter.js).
// W prywatnym (znajomi z kodem) nicki w całości. Wołane przy wejściu do pokoju i przy zmianie prywatności.
function applyRoomNames(room) {
    room.players.forEach(p => {
        p.name = room.isPrivate ? p.rawName : maskNick(p.rawName);
    });
}

// Pusty nick albo wylosowany, który już jest w pokoju, zamienia się na inny losowy.
// Nick wpisany ręcznie zostaje, nawet jeśli ktoś ma taki sam.
function roomNickname(room, playerName, randomName) {
    const name = cleanText(playerName, MAX_NAME_LENGTH);
    const taken = room ? room.players.map(p => p.rawName) : [];
    const isTaken = taken.some(other => other.toLowerCase() === name.toLowerCase());
    if (name && !(randomName === true && isTaken)) return name;
    return nicks.randomNick(nicks.NICK_LANGUAGE, taken);
}

function findBySocket(room, socket) {
    return room.players.find(p => p.socketId === socket.id);
}

function touch(room) {
    room.lastActivity = Date.now();
}

// WIDOKI WYSYŁANE DO KLIENTÓW (bez ról, haseł i userId)
function findHost(room) {
    return room.players.find(p => p.userId === room.host);
}

// away = gracz ogląda jeszcze wyniki poprzedniej gry
function lobbyView(room) {
    const host = findHost(room);
    return {
        code: room.code,
        isPrivate: room.isPrivate,
        settings: room.settings,
        hostId: host ? host.publicId : null,
        players: room.players.map(p => ({ ...publicPlayer(p), away: Boolean(p.away) }))
    };
}

// USTAWIENIA GRY (tryb, kategoria, liczba impostorów) - trzyma je serwer, żeby widzieli je wszyscy
function defaultCategory(mode) {
    const category = mode.categories.find(c => !c.random) || mode.categories[0];
    return category ? category.id : null;
}

function defaultSettings() {
    const mode = getMode(listModes()[0].id);
    return { mode: mode.id, category: defaultCategory(mode), impostorCount: 1, custom: null, options: cleanOptions(mode) };
}

function gameView(room, player) {
    const skipsLeft = room.mode.reroll ? MAX_SKIPS - room.skipsUsed : 0;
    return { mode: room.mode.id, ...room.mode.playerView(room, player), skipsLeft };
}

// Koniec gry: host zakończył głosowanie albo impostor zgadywał hasło
function finishGame(room) {
    // "Kto z nas": odpowiedzi graczy (do statystyki "wskazany przez innych") - zanim runda się zamknie
    const votePlayers = room.round && room.round.answerType === 'player' ? room.mode.voteView(room).players : null;
    const results = room.mode.finish(room);
    room.status = 'finished';
    const at = Date.now();
    // kategoria wybrana w pokoju (np. "Losowa", a nie wylosowana); własnej nie zapisujemy z nazwy - wpisał ją host
    const chosenCategory = (room.mode.categories || []).find(c => c.id === room.settings.category);
    analytics.track('round', null, {
        mode: room.mode.id,
        category: room.settings.custom ? 'Własna kategoria' : chosenCategory ? chosenCategory.name : null,
        players: room.players.length,
        ms: room.roundStartedAt ? at - room.roundStartedAt : 0
    });

    room.players.forEach(p => {
        p.away = true;
        const result = { mode: room.mode.id, ...results, ...room.mode.playerResult(room, p, results) };
        // gracz z kontem: postęp liczy i zapisuje serwer (accounts.js), przeglądarka dostaje gotowe EXP i odznaki
        const socket = io.sockets.sockets.get(p.socketId);
        const account = socket && socket.data.account;
        if (account) {
            result.progress = accounts.recordRound(account, result, p.publicId, {
                at, host: room.host === p.userId, startedAt: room.roundStartedAt, votePlayers,
                category: room.round && (room.round.category || room.round.categoryName),
                answerType: room.round && room.round.answerType
            });
        }
        io.to(p.socketId).emit('game_over', result);
    });

    // Kto do tego czasu nie kliknie "Zagraj ponownie", odpada; pusty pokój znika
    room.resultsTimer = setTimeout(() => {
        if (rooms.get(room.code) === room) ejectAwayPlayers(room);
    }, RESULTS_VISIBLE_MS);
}

function voteView(room, player) {
    return {
        mode: room.mode.id,
        ...room.mode.voteView(room),
        ...voteStatus(room, player),
        endLockMs: Math.max(0, room.voteStartedAt + MIN_VOTE_MS - Date.now())
    };
}

// Ile osób już kogoś wskazało. Kto to był, wie tylko host (na kogo głosował - nikt do wyników).
function voteStatus(room, player) {
    const voted = room.players.filter(p => (room.playerChoices.get(p.userId) || []).length > 0);
    return {
        count: voted.length,
        total: room.players.length,
        voted: player.userId === room.host ? voted.map(p => p.publicId) : []
    };
}

// Host dostaje listę głosujących, reszta jedną wspólną wiadomość
function emitVoteStatus(room) {
    const host = findHost(room);
    const others = room.players.filter(p => p !== host).map(p => p.socketId);
    if (others.length) io.to(others).emit('vote_status', voteStatus(room, room.players.find(p => p !== host)));
    if (host) io.to(host.socketId).emit('vote_status', voteStatus(room, host));
}

// Publiczne pokoje: najpierw te, do których da się wejść, potem pełne, na końcu gry w toku.
// Lista idzie często do wielu osób, więc wpis to tablica bez nazw pól i z najkrótszym zapisem awatarów:
// [kod (null w trakcie gry), stan, liczba graczy, nick hosta, awatar hosta, [awatary kilku graczy]]
const LIST_OPEN = 0, LIST_FULL = 1, LIST_PLAYING = 2;

function roomListView() {
    return [...rooms.values()]
        .filter(room => !room.isPrivate)
        .map(room => {
            const host = findHost(room) || room.players[0];
            const isWaiting = room.status === 'waiting';
            const state = !isWaiting ? LIST_PLAYING : room.players.length >= MAX_PLAYERS ? LIST_FULL : LIST_OPEN;
            return [
                isWaiting ? room.code : null,
                state,
                room.players.length,
                host.name,
                avatars.avatarCode(host.avatar),
                room.players.filter(p => p !== host).slice(0, LIST_AVATARS).map(p => avatars.avatarCode(p.avatar))
            ];
        })
        .sort((a, b) => a[1] - b[1])
        .slice(0, LIST_MAX_ROOMS);
}

// Lista pokoi trafia tylko do osób w menu (grający jej nie widzą), najwyżej raz na LIST_THROTTLE_MS
// i tylko gdy coś się zmieniło - przy wielu pokojach to była większość całego ruchu serwera
let roomListTimer = null;
let sentRoomList = '';

function broadcastRoomList() {
    if (roomListTimer) return;
    roomListTimer = setTimeout(() => {
        roomListTimer = null;
        const list = roomListView();
        const snapshot = JSON.stringify(list);
        if (snapshot === sentRoomList) return;
        sentRoomList = snapshot;
        io.to(MENU).emit('room_list', list);
    }, LIST_THROTTLE_MS);
}

// Gracz poza pokojem: wraca do odbiorców listy i dostaje ją od razu
function enterMenu(socket) {
    socket.data.roomCode = undefined;
    socket.join(MENU);
    socket.emit('room_list', roomListView());
}

// Poczekalnię widzą tylko ci, którzy w niej są - reszta ogląda jeszcze wyniki
function emitLobby(room) {
    const present = room.players.filter(p => !p.away).map(p => p.socketId);
    if (present.length) io.to(present).emit('room_update', lobbyView(room));
}

// ZARZĄDZANIE POKOJAMI
function deleteRoom(roomCode) {
    rooms.delete(roomCode);
    io.in(roomCode).fetchSockets().then(sockets => sockets.forEach(socket => {
        socket.leave(roomCode);
        if (socket.data.roomCode === roomCode) enterMenu(socket);
    }));
}

function assignHost(room, player) {
    room.host = player.userId;
    io.to(player.socketId).emit('is_host', true);
    if (room.status === 'voting') emitVoteStatus(room);    // nowy host dostaje listę głosujących
}

function attachSocket(socket, room, player) {
    player.socketId = socket.id;
    player.connected = true;
    socket.data.roomCode = room.code;
    socket.leave(MENU);
    socket.join(room.code);
    socket.emit('joined', { roomCode: room.code, playerId: player.publicId });
}

function removePlayer(room, player) {
    const wasHost = room.host === player.userId;
    room.players = room.players.filter(p => p !== player);

    const tooFewToPlay = room.status === 'playing' && room.players.length < 2;

    if (room.players.length === 0 || tooFewToPlay) {
        io.to(room.code).emit('left_room_success');
        deleteRoom(room.code);
    } else {
        if (wasHost) {
            const nextHost = room.players.find(p => p.connected && !p.away)
                || room.players.find(p => p.connected)
                || room.players[0];
            assignHost(room, nextHost);
        }
        if (room.status === 'waiting') {
            emitLobby(room);
        } else if (room.status === 'voting') {
            emitVoteStatus(room);
        }
    }
    broadcastRoomList();
}

// Usunięcie gracza decyzją serwera (wyrzucenie, brak powrotu po wynikach) - wraca do menu
function ejectPlayer(room, player, reason) {
    const socket = io.sockets.sockets.get(player.socketId);
    if (socket && socket.data.roomCode === room.code) {
        socket.leave(room.code);
        if (reason) socket.emit('error', reason);
        socket.emit('left_room_success');
        enterMenu(socket);
    }
    removePlayer(room, player);
}

function ejectAwayPlayers(room) {
    clearTimeout(room.resultsTimer);
    room.players.filter(p => p.away).forEach(p => ejectPlayer(room, p));
}

// Rewanż: pierwszy powracający otwiera poczekalnię tego samego pokoju
function returnToLobby(room, player) {
    if (room.status === 'finished') {
        room.status = 'waiting';
        room.mode = null;
        room.round = null;
        broadcastRoomList();
    }
    player.away = false;
    emitLobby(room);
}

function leaveCurrentRoom(socket) {
    const room = rooms.get(socket.data.roomCode);
    const player = room && findBySocket(room, socket);
    socket.data.roomCode = undefined;
    if (!player) return;

    socket.leave(room.code);
    removePlayer(room, player);
}

// Tryby zmieniają się tylko przy wdrożeniu - klient trzyma listę u siebie i podaje jej wersję przy łączeniu
const modeList = listModes();
const MODES_VERSION = crypto.createHash('sha1').update(JSON.stringify(modeList)).digest('base64url').slice(0, 8);

// Gracz, który nie wrócił po rozłączeniu: w poczekalni znika, w trakcie gry oddaje hosta
function handleAbsentPlayer(room, player) {
    const stillAbsent = !player.connected && Date.now() - player.disconnectedAt >= DISCONNECT_GRACE_MS;
    if (rooms.get(room.code) !== room || !room.players.includes(player) || !stillAbsent) return;

    if (room.status === 'waiting') {
        removePlayer(room, player);
    } else if (room.host === player.userId) {
        const nextHost = room.players.find(p => p.connected);
        if (nextHost) assignHost(room, nextHost);
    }
}

io.on('connection', (socket) => {

    // Błąd w jednym zdarzeniu nie może wyłączyć całego serwera; każde zdarzenie przechodzi przez limit (zob. RATE_LIMITS)
    const limiter = createRateLimiter();
    const handle = (event, handler) => {
        socket.on(event, (...args) => {
            if (event !== 'disconnect') {
                if (limiter.flooding()) return socket.disconnect(true);
                if (!limiter.allow(event)) {
                    if (RATE_LIMITED_MESSAGE[event]) socket.emit('error', RATE_LIMITED_MESSAGE[event]);
                    return;
                }
            }
            try {
                handler(...args);
            } catch (err) {
                console.error(`Błąd w zdarzeniu "${event}":`, err);
            }
        });
    };

    const auth = socket.handshake.auth || {};

    // ANALITYKA: pierwsze połączenie strony = wejście do gry (skąd, jakie urządzenie, czy zainstalowana aplikacja)
    if (auth.visit && typeof auth.visit === 'object' && isValidUserId(auth.userId)) {
        const VISIT_SOURCES = ['zaproszenie', 'bezposrednio', 'wyszukiwarka', 'media spolecznosciowe', 'inna strona'];
        const ua = socket.handshake.headers['user-agent'] || '';
        analytics.visit(auth.userId, {
            source: VISIT_SOURCES.includes(auth.visit.source) ? auth.visit.source : 'inne',
            device: /iPad|Tablet/i.test(ua) ? 'tablet' : /Mobi|Android|iPhone/i.test(ua) ? 'telefon' : 'komputer',
            installed: auth.visit.installed === true
        });
    }
    if (auth.modesVersion !== MODES_VERSION) socket.emit('mode_list', modeList, MODES_VERSION);
    // gracz ma otwartą starszą wersję gry (np. po wdrożeniu poprawki) - pasek "Dostępna nowa wersja"
    if (typeof auth.appVersion === 'string' && auth.appVersion && auth.appVersion !== assets.appVersion()) socket.emit('new_version');

    // KONTO (Supabase): przeglądarka przysłała token - wczytujemy postęp z bazy (accounts.js)
    if (accounts.enabled && typeof auth.accessToken === 'string' && auth.accessToken.length < 4096) {
        accounts.attach(socket, auth.accessToken)
            .then(account => { if (account) socket.emit('account', accounts.welcome(account)); })
            .catch(err => console.error('Konto:', err.message));
    }
    const withAccount = fn => (...args) => { if (socket.data.account) fn(socket.data.account, ...args); };

    // Jednorazowe przeniesienie postępu gościa z przeglądarki na konto
    handle('account_import', withAccount((account, localProfile) => {
        accounts.importGuest(account, localProfile)
            .then(done => { if (done) socket.emit('account', accounts.welcome(account)); })
            .catch(err => console.error('Przeniesienie postępu:', err.message));
    }));
    // Pełny profil (statystyki, historia) - przy otwarciu strony gracza
    handle('get_profile', withAccount(account => socket.emit('account_profile', account.profile)));
    handle('badges_seen', withAccount(account => accounts.markBadgesSeen(account)));
    // Zgłoszenia do analityki z przeglądarki - tylko zalogowanie (Google / mailem)
    handle('track', (type, data) => {
        if (type !== 'login' || !data || !['google', 'email'].includes(data.provider)) return;
        if (!isValidUserId(auth.userId)) return;
        analytics.track('login', auth.userId, { provider: data.provider });
    });
    // Zalogowanie na istniejące konto, a na tym urządzeniu jest konto gościa (token udowadnia, że jest jego):
    // najpierw podgląd jego postępu, potem decyzja gracza - dodać do konta albo pominąć
    handle('account_merge_preview', withAccount((account, anonToken) => {
        accounts.previewAnonymous(account, anonToken)
            .then(offer => {
                if (!offer) return;
                if (offer.merged) socket.emit('account', accounts.welcome(account));     // nowe konto: przeniesione od razu
                socket.emit('account_merge_offer', offer);
            })
            .catch(err => console.error('Podgląd konta gościa:', err.message));
    }));
    handle('account_merge', withAccount((account, anonToken, add) => {
        accounts.mergeAnonymous(account, anonToken, add === true)
            .then(done => { if (done && add === true) socket.emit('account', accounts.welcome(account)); })
            .catch(err => console.error('Łączenie kont:', err.message));
    }));
    handle('account_feat', withAccount((account, id) => accounts.recordFeat(account, id)));

    // Tworzenie pokoju
    handle('create_room', ({ playerName, randomName, avatar, level, userId } = {}) => {
        if (!isValidUserId(userId)) return socket.emit('error', 'Nieprawidłowy identyfikator gracza!');
        if (rooms.size >= MAX_ROOMS) return socket.emit('error', 'Zbyt wiele pokoi, spróbuj później!');

        leaveCurrentRoom(socket);

        const player = createPlayer(socket, { userId, playerName: roomNickname(null, playerName, randomName), avatar, level });
        const room = {
            code: generateRoomCode(),
            host: userId,
            players: [player],
            status: 'waiting',
            isPrivate: false,
            settings: defaultSettings(),
            banned: new Set(),      // userId graczy wyrzuconych przez hosta
            lastActivity: Date.now()
        };
        rooms.set(room.code, room);
        applyRoomNames(room);
        analytics.track('room', userId, { mode: room.settings.mode });

        attachSocket(socket, room, player);
        emitLobby(room);
        broadcastRoomList();
    });

    // Dołączanie do pokoju
    handle('join_room', ({ playerName, randomName, roomCode, avatar, level, userId } = {}) => {
        if (!isValidUserId(userId)) return socket.emit('error', 'Nieprawidłowy identyfikator gracza!');

        const ip = clientIp(socket);
        if (tooManyJoinFailures(ip)) {
            return socket.emit('error', 'Zbyt wiele prób z błędnym kodem. Spróbuj za minutę.');
        }

        const room = rooms.get(roomCode);
        if (!room) noteJoinFailure(ip);
        if (!room || room.status !== 'waiting') {
            return socket.emit('error', 'Pokój nie istnieje lub gra już trwa!');
        }
        if (room.banned.has(userId)) {
            return socket.emit('error', 'Zostałeś wyrzucony z tego pokoju!');
        }

        // Ten sam gracz nie dołącza drugi raz - przejmuje swoje miejsce
        let player = room.players.find(p => p.userId === userId);
        if (!player && room.players.length >= MAX_PLAYERS) {
            return socket.emit('error', 'Pokój jest pełny!');
        }

        if (socket.data.roomCode !== room.code) leaveCurrentRoom(socket);

        if (!player) {
            player = createPlayer(socket, { userId, playerName: roomNickname(room, playerName, randomName), avatar, level });
            room.players.push(player);
            applyRoomNames(room);
        }

        touch(room);
        attachSocket(socket, room, player);
        returnToLobby(room, player);
        broadcastRoomList();
    });

    // Powrót gracza do pokoju (po odświeżeniu, zerwaniu połączenia, uśpieniu telefonu)
    function rejoin(roomCode, userId) {
        const room = rooms.get(roomCode);
        const player = room && room.players.find(p => p.userId === userId);

        if (!player) {
            return socket.emit('rejoin_failed', true);
        }

        if (socket.data.roomCode !== room.code) leaveCurrentRoom(socket);

        touch(room);
        attachSocket(socket, room, player);

        if (room.host === userId) {
            socket.emit('is_host', true);
        }

        switch (room.status) {
            case 'waiting':
            case 'finished':
                // Powrót do poczekalni (po odświeżeniu strony na wynikach też)
                returnToLobby(room, player);
                break;

            case 'playing':
                socket.emit('game_start', gameView(room, player));
                break;

            case 'voting':
                socket.emit('game_start', gameView(room, player));
                socket.emit('start_vote', voteView(room, player));
                break;
        }
        socket.emit('rejoin_failed', false);
    }

    // Klient podaje pokój i swoje id już przy łączeniu - wraca do pokoju, zanim wyśle jakąkolwiek akcję
    // (kliknięcia z czasu zerwania docierają po ponownym połączeniu i trafiają już do właściwego gracza)
    if (typeof auth.roomCode === 'string' && auth.roomCode && isValidUserId(auth.userId)) {
        try {
            rejoin(auth.roomCode, auth.userId);
        } catch (err) {
            console.error('Błąd przy powrocie do pokoju:', err);
        }
    }
    // Kto nie wrócił do pokoju, jest w menu i ogląda listę pokoi
    if (!socket.data.roomCode) enterMenu(socket);

    // Starsze karty (sprzed tej wersji) wracają osobnym zdarzeniem
    handle('rejoin_room', ({ roomCode, userId } = {}) => rejoin(roomCode, userId));

    // Klient sprawdza, czy połączenie naprawdę działa (np. po powrocie do karty)
    handle('ping_check', (ack) => {
        if (typeof ack === 'function') ack(true);
    });

    // Host zmienia ustawienia w poczekalni; nieprawidłowe wartości wracają do domyślnych
    handle('set_room_settings', ({ roomCode, mode: modeId, category, impostorCount, custom, options } = {}) => {
        const room = rooms.get(roomCode);
        const player = room && findBySocket(room, socket);
        if (!player || room.host !== player.userId || room.status !== 'waiting') return;
        touch(room);

        const mode = getMode(modeId) || getMode(room.settings.mode);
        const count = Number(impostorCount);

        // Własna kategoria hosta: nowa treść przychodzi w "custom", bez niej zostaje dotychczasowa.
        // Hasła zostają na serwerze - do graczy trafia tylko nazwa i liczba haseł.
        let customCategory = null;
        if (mode.customCategoryId && category === mode.customCategoryId) {
            customCategory = custom ? mode.cleanCustomCategory(custom) : room.customCategory;
            if (!customCategory) socket.emit('error', 'Własna kategoria jest nieprawidłowa!');
        }
        room.customCategory = customCategory;

        let selectedCategory = defaultCategory(mode);
        if (customCategory) selectedCategory = mode.customCategoryId;
        else if (mode.categories.some(c => c.id === category)) selectedCategory = category;

        room.settings = {
            mode: mode.id,
            category: selectedCategory,
            impostorCount: Number.isInteger(count) && count >= 1 && count < MAX_PLAYERS ? count : room.settings.impostorCount,
            custom: customCategory
                ? { id: customCategory.id, name: customCategory.name, count: customCategory.entries.length }
                : null,
            // przełączniki z okna "Ustawienia gry"; bez nowych wartości zostają dotychczasowe (przy zmianie trybu - domyślne)
            options: cleanOptions(mode, options || (mode.id === room.settings.mode ? room.settings.options : null))
        };
        emitLobby(room);
    });

    // Start gry - rundę przygotowuje wybrany tryb
    handle('start_game', ({ roomCode } = {}) => {
        const room = rooms.get(roomCode);
        const player = room && findBySocket(room, socket);
        if (!player || room.host !== player.userId || room.status !== 'waiting') return;
        touch(room);

        const mode = getMode(room.settings.mode);

        // Kto nie wrócił z ekranu wyników, nie gra w rewanżu
        ejectAwayPlayers(room);

        const error = mode.start(room, { ...room.settings, customCategory: room.customCategory });
        if (error) return socket.emit('error', error);

        room.mode = mode;
        room.status = 'playing';
        room.playerChoices = new Map();
        room.skipsUsed = 0;
        room.roundStartedAt = Date.now();

        room.players.forEach((p) => {
            io.to(p.socketId).emit('game_start', { ...gameView(room, p), countdown: true });
        });

        broadcastRoomList();
    });

    // Host losuje nowe hasło / pytanie (ktoś nie zna hasła, pytanie nie pasuje) - tylko przed głosowaniem.
    // Role zostają; każdy dostaje nową kartę do odkrycia.
    handle('skip_content', (roomCode) => {
        const room = rooms.get(roomCode);
        const player = room && findBySocket(room, socket);
        if (!player || room.host !== player.userId || room.status !== 'playing' || !room.mode.reroll) return;
        if (room.skipsUsed >= MAX_SKIPS) return socket.emit('error', 'Limit nowych haseł w tej rundzie!');
        touch(room);

        const error = room.mode.reroll(room);
        if (error) return socket.emit('error', error);
        room.skipsUsed++;

        room.players.forEach(p => {
            io.to(p.socketId).emit('game_start', { ...gameView(room, p), skipped: true });
        });
    });

    handle('check_host', (roomCode) => {
        const room = rooms.get(roomCode);
        if (!room) return;

        const player = findBySocket(room, socket);
        socket.emit('is_host', Boolean(player && room.host === player.userId));
    });

    handle('cast_vote', (roomCode) => {
        const room = rooms.get(roomCode);
        if (!room) return;
        touch(room);

        const requester = findBySocket(room, socket);

        if (requester && room.host === requester.userId) {
            if (room.status === 'playing') {
                room.status = 'voting';
                room.voteStartedAt = Date.now();

                room.players.forEach(p => {
                    io.to(p.socketId).emit('start_vote', voteView(room, p));
                });
                broadcastRoomList();
            }
        } else {
            socket.emit('error', 'Tylko host może rozpocząć głosowanie!');
        }
    });

    handle('send_vote', (roomCode, selectedIds) => {
        const room = rooms.get(roomCode);
        if (!room || room.status !== 'voting' || !Array.isArray(selectedIds)) return;

        const player = findBySocket(room, socket);
        if (!player) return;
        touch(room);

        // Tylko istniejący gracze i bez powtórzeń; limit głosów pilnuje tryb przy podliczaniu
        const validIds = new Set(room.players.map(p => p.publicId));
        const choice = [...new Set(selectedIds)].filter(id => validIds.has(id));

        room.playerChoices.set(player.userId, choice);
        emitVoteStatus(room);
    });

    // Akcje specyficzne dla trybu (np. odpowiedź na pytanie)
    handle('game_action', (roomCode, type, payload) => {
        const room = rooms.get(roomCode);
        if (!room || !room.mode || room.status === 'finished') return;

        const player = findBySocket(room, socket);
        if (!player) return;

        touch(room);
        const outcome = room.mode.onAction(room, player, type, payload);
        if (outcome && outcome.finish && room.status === 'voting') finishGame(room);
    });

    handle('end_game', (roomCode) => {
        const room = rooms.get(roomCode);
        if (!room) return;
        touch(room);

        const requester = findBySocket(room, socket);
        if (!requester || room.host !== requester.userId || room.status !== 'voting') return;
        if (Date.now() - room.voteStartedAt < MIN_VOTE_MS) {
            return socket.emit('error', 'Daj graczom chwilę na głosowanie!');
        }

        finishGame(room);
    });

    handle('play_again', ({ level } = {}) => {
        const room = rooms.get(socket.data.roomCode);
        const player = room && findBySocket(room, socket);
        if (!player || !player.away) return;

        touch(room);
        player.level = cleanLevel(level);    // po grze gracz mógł awansować
        returnToLobby(room, player);
    });

    // Prywatny pokój znika z listy - wejście tylko z kodem
    handle('set_room_privacy', ({ roomCode, isPrivate } = {}) => {
        const room = rooms.get(roomCode);
        const requester = room && findBySocket(room, socket);
        if (!requester || room.host !== requester.userId) return;

        touch(room);
        room.isPrivate = Boolean(isPrivate);
        applyRoomNames(room);           // nicki z gwiazdkami tylko w pokoju publicznym
        emitLobby(room);
        broadcastRoomList();
    });

    // Wyrzucony gracz nie może wrócić do tego pokoju
    handle('kick_player', ({ roomCode, targetId } = {}) => {
        const room = rooms.get(roomCode);
        const requester = room && findBySocket(room, socket);
        if (!requester || room.host !== requester.userId || room.status !== 'waiting') return;

        const target = room.players.find(p => p.publicId === targetId);
        if (!target || target === requester) return;

        touch(room);
        room.banned.add(target.userId);
        ejectPlayer(room, target, 'Zostałeś wyrzucony z pokoju!');
    });

    handle('send_fuck', ({ roomCode, targetId } = {}) => {
        const room = rooms.get(roomCode);
        if (!room) return;

        const sender = findBySocket(room, socket);
        if (!sender) return;

        const target = room.players.find(p => p.publicId === targetId);
        if (!target) return;

        io.to(target.socketId).emit('receive_fuck', {
            name: sender.name,
            playerId: sender.publicId
        });
    });

    handle('leave_room', () => {
        leaveCurrentRoom(socket);
        socket.emit('left_room_success');
        enterMenu(socket);
    });

    handle('disconnect', () => {
        accounts.detach(socket);
        const room = rooms.get(socket.data.roomCode);
        const player = room && findBySocket(room, socket);
        if (!player) return;

        touch(room);
        player.connected = false;
        player.disconnectedAt = Date.now();
        setTimeout(() => handleAbsentPlayer(room, player), DISCONNECT_GRACE_MS);
    });
});

// SPRZĄTANIE OPUSZCZONYCH POKOI
setInterval(() => {
    const now = Date.now();

    rooms.forEach(room => {
        const idleTime = now - room.lastActivity;
        const isAbandoned = !room.players.some(p => p.connected) && idleTime > ROOM_IDLE_MS;
        const isExpired = idleTime > ROOM_MAX_IDLE_MS;

        if (isAbandoned || isExpired || room.players.length === 0) {
            io.to(room.code).emit('error', 'Pokój wygasł z powodu braku aktywności!');
            io.to(room.code).emit('left_room_success');
            deleteRoom(room.code);
        }
    });
    broadcastRoomList();
}, CLEANUP_INTERVAL_MS);

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Serwer działa na porcie ${PORT}`);
    if (process.env.RENDER) assets.warmUp();
    if (accounts.enabled) console.log('Konta: włączone (Supabase)');
    if (analytics.enabled) console.log('Analityka: włączona');
    analytics.startOnlineSampling(() => io.engine.clientsCount);
    startKeepAlive();
});

// BUDZIK: darmowy Render usypia serwer po 15 minutach bez ruchu z zewnątrz, a pierwsze wejście
// po uśpieniu trwa kilkadziesiąt sekund. Co 10 minut serwer odpytuje sam siebie przez publiczny adres
// (RENDER_EXTERNAL_URL ustawia Render), co liczy się jako ruch. Lokalnie budzik się nie włącza.
const KEEP_ALIVE_MS = 10 * 60 * 1000;

function startKeepAlive() {
    const baseUrl = process.env.KEEP_ALIVE_URL || process.env.RENDER_EXTERNAL_URL;
    if (!baseUrl) return;

    const url = baseUrl.replace(/\/+$/, '') + '/health';
    setInterval(async () => {
        try {
            const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
            if (!response.ok) console.warn(`Budzik: ${url} odpowiedział ${response.status}`);
        } catch (error) {
            console.warn(`Budzik: brak odpowiedzi z ${url} (${error.message})`);
        }
    }, KEEP_ALIVE_MS).unref();
    console.log(`Budzik: co 10 min odpytuję ${url}`);
}

// Render przy wdrożeniu nowej wersji wysyła SIGTERM - zapisujemy jeszcze niezapisany postęp kont
process.on('SIGTERM', () => {
    Promise.all([accounts.flushAll(), analytics.flush()]).finally(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
});
