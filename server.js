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

// USTAWIENIA
const PORT = process.env.PORT || 10000;
const MAX_ROOMS = 500;
const MAX_PLAYERS = 16;
const MAX_NAME_LENGTH = 12;
const MAX_LEVEL = 999;

const LIST_AVATARS = 5;                     // ilu graczy (poza hostem) widać na liście pokoi

const MIN_VOTE_MS = 5 * 1000;               // host może zakończyć głosowanie dopiero po tym czasie
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

// Lekki adres do sprawdzania, czy serwer żyje (używa go też budzik poniżej)
app.get('/health', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.send('ok');
});

// Klienta Socket.IO podaje assets.js (wersja zminifikowana, skompresowana, z cache)
// Ping co 10 s: zerwane połączenie (uśpiony telefon, zmiana sieci) wychodzi na jaw po ok. 18 s, a nie po 45 s
const io = new Server(server, {
    cors: { origin: "*" },
    serveClient: false,
    pingInterval: 10000,
    pingTimeout: 8000
});

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
    return {
        userId: userId,                     // sekret gracza - nigdy nie trafia do innych klientów
        publicId: crypto.randomUUID(),      // identyfikator widoczny dla wszystkich
        socketId: socket.id,
        connected: true,
        name: cleanText(playerName, MAX_NAME_LENGTH) || 'Gracz',
        avatar: avatars.cleanAvatar(avatar),
        level: cleanLevel(level)
    };
}

// Pusty nick albo wylosowany, który już jest w pokoju, zamienia się na inny losowy.
// Nick wpisany ręcznie zostaje, nawet jeśli ktoś ma taki sam.
function roomNickname(room, playerName, randomName) {
    const name = cleanText(playerName, MAX_NAME_LENGTH);
    const taken = room ? room.players.map(p => p.name) : [];
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
    return { mode: room.mode.id, ...room.mode.playerView(room, player) };
}

// Koniec gry: host zakończył głosowanie albo impostor zgadywał hasło
function finishGame(room) {
    const results = room.mode.finish(room);
    room.status = 'finished';

    room.players.forEach(p => {
        p.away = true;
        io.to(p.socketId).emit('game_over', {
            mode: room.mode.id,
            ...results,
            ...room.mode.playerResult(room, p, results)
        });
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

function emitVoteStatus(room) {
    room.players.forEach(p => {
        io.to(p.socketId).emit('vote_status', voteStatus(room, p));
    });
}

// Publiczne pokoje: najpierw te, do których da się wejść, potem pełne, na końcu gry w toku
function roomListView() {
    const listOrder = entry => (entry.status !== 'waiting' ? 2 : entry.isFull ? 1 : 0);

    return [...rooms.values()]
        .filter(room => !room.isPrivate)
        .map(room => {
            const host = findHost(room) || room.players[0];
            const isWaiting = room.status === 'waiting';
            return {
                code: isWaiting ? room.code : null,
                status: isWaiting ? 'waiting' : 'playing',
                isFull: room.players.length >= MAX_PLAYERS,
                playerCount: room.players.length,
                maxPlayers: MAX_PLAYERS,
                host: { name: host.name, avatar: host.avatar },
                avatars: room.players.filter(p => p !== host).slice(0, LIST_AVATARS).map(p => p.avatar)
            };
        })
        .sort((a, b) => listOrder(a) - listOrder(b));
}

function broadcastRoomList() {
    io.emit('room_list', roomListView());
}

// Poczekalnię widzą tylko ci, którzy w niej są - reszta ogląda jeszcze wyniki
function emitLobby(room) {
    const view = lobbyView(room);
    room.players.filter(p => !p.away).forEach(p => {
        io.to(p.socketId).emit('room_update', view);
    });
}

// ZARZĄDZANIE POKOJAMI
function deleteRoom(roomCode) {
    rooms.delete(roomCode);
    io.socketsLeave(roomCode);
}

function assignHost(room, player) {
    room.host = player.userId;
    io.to(player.socketId).emit('is_host', true);
    if (room.status === 'voting') emitVoteStatus(room);    // nowy host dostaje listę głosujących
    console.log(`Nowy host w pokoju ${room.code}: ${player.name}`);
}

function attachSocket(socket, room, player) {
    player.socketId = socket.id;
    player.connected = true;
    socket.data.roomCode = room.code;
    socket.join(room.code);
    socket.emit('joined', { roomCode: room.code, playerId: player.publicId });
}

function removePlayer(room, player) {
    const wasHost = room.host === player.userId;
    room.players = room.players.filter(p => p !== player);
    console.log(`Gracz ${player.name} opuścił pokój ${room.code}`);

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
        socket.data.roomCode = undefined;
        socket.leave(room.code);
        if (reason) socket.emit('error', reason);
        socket.emit('left_room_success');
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
    console.log(`Połączono: ${socket.id}`);

    // Błąd w jednym zdarzeniu nie może wyłączyć całego serwera
    const handle = (event, handler) => {
        socket.on(event, (...args) => {
            try {
                handler(...args);
            } catch (err) {
                console.error(`Błąd w zdarzeniu "${event}":`, err);
            }
        });
    };

    socket.emit('mode_list', listModes());
    socket.emit('room_list', roomListView());

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
        console.log(`Rejoin: Gracz ${player.name} wrócił do pokoju ${room.code}`);

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
    const auth = socket.handshake.auth || {};
    if (typeof auth.roomCode === 'string' && auth.roomCode && isValidUserId(auth.userId)) {
        try {
            rejoin(auth.roomCode, auth.userId);
        } catch (err) {
            console.error('Błąd przy powrocie do pokoju:', err);
        }
    }

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

        room.players.forEach((p) => {
            io.to(p.socketId).emit('game_start', { ...gameView(room, p), countdown: true });
        });

        broadcastRoomList();
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
                console.log(`Głosowanie rozpoczęte przez hosta: ${requester.name}`);

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
        console.log(`Gracz ${player.name} zmienił wybór (${choice.length} głosów)`);
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
    });

    handle('disconnect', () => {
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
            console.log(`Sprzątacz usunął pokój widmo: ${room.code}`);
        }
    });
    broadcastRoomList();
}, CLEANUP_INTERVAL_MS);

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Serwer działa na porcie ${PORT}`);
    if (process.env.RENDER) assets.warmUp();
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
