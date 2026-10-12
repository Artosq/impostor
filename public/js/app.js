const KICKED_EYES = 'dizzy';
const HOST_CROWN_SVG = '<svg viewBox="0 0 26 20" fill="#f1c40f" stroke="black" stroke-width="2" stroke-linejoin="round">'
    + '<path d="M3 17L2 5l6 5 5-8 5 8 6-5-1 12z"/>'
    + '<circle cx="13" cy="13" r="1.6" fill="#e74c3c" stroke="none"/></svg>';
const SCREENS = ['screen-login', 'screen-lobby', 'screen-game', 'screen-vote', 'screen-load', 'screen-customize', 'screen-results'];
const SCREENS_WITH_STATS = ['screen-login', 'screen-customize', 'screen-results'];

const botAssets = {
    eyes: [
        "bulging", "dizzy", "eva", "frame1", "frame2",
        "glow", "happy", "hearts", "robocop", "round",
        "roundFrame01", "roundFrame02", "sensor", "shade01"
    ],
    mouth: [
        "bite", "diagram", "grill01", "grill02", "grill03",
        "smile01", "smile02", "square01", "square02"
    ],
    pattern: [
        "grunge02", "camo01", "camo02", "circuits",
        "dirty01", "dirty02", "dots", "grunge01"
    ],
    background: [
        "f44336", "e91e63", "9c27b0", "673ab7", "3f51b5",
        "2196f3", "009688", "4caf50",
        "8bc34a", "cddc39", "ffeb3b", "ffc107", "ff9800",
        "ff5722", "795548", "9e9e9e", "607d8b", "263238"
    ]
};

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

let botConfig = loadBotConfig();

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

function loadBotConfig() {
    const defaultConfig = {
        eyes: randomItem(botAssets.eyes),
        mouth: randomItem(botAssets.mouth),
        background: '555555',
        pattern: "camo01"
    };

    const savedBotConfig = localStorage.getItem('botConfig');
    if (!savedBotConfig) return defaultConfig;

    try {
        const parsed = JSON.parse(savedBotConfig);
        if (parsed && parsed.eyes && parsed.mouth && parsed.pattern) return parsed;
    } catch (e) {
        localStorage.removeItem('botConfig');
    }
    return defaultConfig;
}

// ===== EKRANY =====

function showScreen(screenId) {
    SCREENS.forEach(id => {
        byId(id).classList.add('hidden');
    });
    byId(screenId).classList.remove('hidden');

    const showStats = SCREENS_WITH_STATS.includes(screenId);
    byId('logo').classList.toggle('hidden', showStats);
    byId('player-stats').classList.toggle('hidden', !showStats);
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

// Awatary generuje serwer gry; "-" w adresie oznacza awatar bez tej części
function avatarUrl({ eyes, mouth, pattern, background }, overrides = {}) {
    const parts = { eyes, mouth, pattern, background, ...overrides };
    return `/avatar/${parts.eyes || '-'}/${parts.mouth || '-'}/${parts.pattern || '-'}/${parts.background || '-'}`;
}

let customizeRendered = false;

function customizeAvatar() {
    // Podglądy części powstają dopiero przy pierwszym otwarciu panelu
    if (!customizeRendered) renderCustomizeOptions();
    updateCustomizePreview();
    showScreen('screen-customize');
}

function updateCustomizePreview() {
    byId('customize-player-avatar').src = avatarUrl(botConfig);
}

function randomizeAvatar(element) {
    Object.keys(botAssets).forEach(part => {
        botConfig[part] = randomItem(botAssets[part]);
    });
    localStorage.setItem('botConfig', JSON.stringify(botConfig));

    renderCustomizeOptions();
    updateCustomizePreview();
    changeNick();
    spinDice(element);
}

function renderCustomizeOptions() {
    ['eyes', 'mouth', 'pattern'].forEach(part => {
        byId(`${part}-customize`).innerHTML = botAssets[part].map(name => {
            return `<img class="customize-tile ${part}-custom ${botConfig[part] === name ? 'selected' : ''}"
                        src="${avatarUrl({ [part]: name })}"
                        onclick="updatePart(this, '${part}', '${name}')">`;
        }).join('');
    });

    byId('background-customize').innerHTML = botAssets.background.map(color => {
        return `<div class="customize-tile background-custom ${botConfig.background === color ? 'selected' : ''}"
                    style="background-color: #${color}"
                    onclick="updatePart(this, 'background', '${color}')"></div>`;
    }).join('');

    customizeRendered = true;
}

function changeCustomizeCategory(element, categoryId) {
    document.querySelectorAll(".customize-category").forEach(el => {
        el.classList.add("hidden");
    });
    byId(categoryId).classList.remove("hidden");

    document.querySelectorAll(".customize-categories-tile").forEach(el => {
        el.classList.remove("selected");
    });
    element.classList.add("selected");
}

function updatePart(element, part, value) {
    botConfig[part] = value;

    // Obsługa wizualna zaznaczenia (ramki)
    document.querySelectorAll(`.${part}-custom`).forEach(t => t.classList.remove('selected'));
    if (element) element.classList.add('selected');

    localStorage.setItem('botConfig', JSON.stringify(botConfig));

    updateCustomizePreview();
    changeNick();
}

// ===== NICK =====

function changeNick() {
    byId('main-player-avatar').src = avatarUrl(botConfig);
}

function saveNick(newNick) {
    localStorage.setItem('savedNick', newNick);
    if (newNick.length <= 3) {
        impostorWisdom("Nick krótki jak twój...");
    }
}

function randomNick() {
    const prefix = ['Basil', 'Chili', 'Ginger', 'Olive', 'Clover'];
    const rest = ['Sprout', 'Berry', 'Mint', 'Bean', 'Radish'];
    return randomItem(prefix) + randomItem(rest);
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

function drawProgressBar() {
    pCanvas.width = pCanvas.clientWidth;
    pCanvas.height = pCanvas.clientHeight;

    const w = pCanvas.width;
    const h = pCanvas.height;

    pCtx.clearRect(0, 0, w, h);

    let targetWidth = w * (progress / 100);
    currentWidth += (targetWidth - currentWidth) * 0.05;

    pCtx.fillStyle = colorSecondary;
    pCtx.fillRect(0, 0, currentWidth, h);

    if (progress < targetProgress) {
        progress = Math.min(progress + 0.5, targetProgress); // Prędkość ładowania
    }
    byId('exp-counter').innerHTML = `
    LVL: ${playerLVL || 0} <br>
    EXP: ${Math.floor((playerExp * progress / targetProgress) || 0)} / ${getRequiredExp(playerLVL) || 0}
`;
    progressAnimation = requestAnimationFrame(drawProgressBar);
}

// ===== POKOJE =====

const socket = io();

function createRoom() {
    let name = byId('input-name').value || randomNick();
    socket.emit('create_room', { playerName: name, avatar: botConfig, level: playerLVL, userId: userId });
}

// function gameModePanel(){
//     document.getElementById("screen-mode").classList.remove("hidden");
// }

function joinRoom(listCode) {
    let name = byId('input-name').value || randomNick();
    let code = listCode || byId('input-code').value.trim().toUpperCase();
    socket.emit('join_room', { playerName: name, roomCode: code, avatar: botConfig, level: playerLVL, userId: userId });
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
        ...change
    });
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
    byId('room-settings').textContent = summary.join(' · ');
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
        const description = c.random ? 'Inna przy każdej grze' : `${c.count} haseł`;
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
    showPickerView('picker-view-list');
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

function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}

function createRoomRow(room) {
    const joinable = room.status === 'waiting' && !room.isFull;
    const row = createElement('div', 'room-row');

    const hostAvatar = createElement('img', 'room-row-host');
    hostAvatar.src = avatarUrl(room.host.avatar);

    // Pod nickiem: kod i gracze albo powód, dla którego nie da się wejść
    const details = createElement('div', 'room-row-details');
    if (room.status !== 'waiting') details.append('W trakcie gry');
    else if (room.isFull) details.append('Pełny');
    else details.append(`#${room.code}`);

    room.avatars.forEach(playerAvatar => {
        const avatar = createElement('img');
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

        const avatar = createElement('img', 'player-avatar');
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
function showGame(data) {
    byId('impostor-info').classList.add('hidden');
    byId('input-answer').classList.add('hidden');
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
        tile.style.backgroundImage = `url("${avatarUrl(p.avatar)}")`;
        tile.onclick = () => voteOn(tile, vote.maxVotes, p.id);

        tile.append(` ${p.name} `);

        const extraText = mode.voteTileText(p);
        if (extraText !== null) {
            tile.append(document.createElement('br'), ` ${extraText}`);
        }
        voteDisplay.append(tile);
    });
}

function setHostControls(isHost) {
    ['host-controls', 'host-end-controls', 'host-vote-controls'].forEach(id => {
        byId(id).classList.toggle('hidden', !isHost);
    });

    document.querySelectorAll('.waiting-msg').forEach(el => {
        el.classList.toggle('hidden', isHost);
    });
}

// ===== WYNIKI =====

// Wyrzucony gracz ma na ekranie wyników oczy z krzyżykami
function resultAvatarUrl(player, kickedIds) {
    return avatarUrl(player.avatar, kickedIds.includes(player.id) ? { eyes: KICKED_EYES } : {});
}

function createResultTile(player, kickedIds) {
    const tile = document.createElement('div');
    tile.className = 'res-player-tile';

    const avatar = document.createElement('img');
    avatar.src = resultAvatarUrl(player, kickedIds);

    const name = document.createElement('span');
    name.textContent = player.name;

    tile.append(avatar, name);
    return tile;
}

function renderResultPlayers(containerId, players, kickedIds, emptyText) {
    const container = byId(containerId);
    container.replaceChildren(...players.map(player => createResultTile(player, kickedIds)));

    if (players.length === 0) {
        const empty = document.createElement('span');
        empty.className = 'res-empty';
        empty.textContent = emptyText;
        container.append(empty);
    }
}

// Jedna lista zamiast osobnych sekcji: głosy, impostorzy (na czerwono) i wyrzuceni (z dopiskiem)
function renderResultVotes(results) {
    const container = byId('res-votes');
    const impostorIds = results.impostors.map(i => i.id);
    const kickedIds = results.kickedPlayers.map(k => k.id);
    const ranking = [...results.players].sort((a, b) => b.votes - a.votes);
    const maxVotes = Math.max(1, ...ranking.map(p => p.votes));

    container.replaceChildren(...ranking.map(p => {
        const row = createElement('div', 'res-vote-row');
        if (impostorIds.includes(p.id)) row.classList.add('res-vote-impostor');

        const avatar = createElement('img');
        avatar.src = resultAvatarUrl(p, kickedIds);

        const who = createElement('div', 'res-vote-who');
        who.append(createElement('div', 'res-vote-name', p.name));
        if (kickedIds.includes(p.id)) {
            row.classList.add('res-vote-kicked');
            who.append(createElement('div', 'res-vote-tag', 'Wyrzucony'));
        }

        const bar = createElement('div', 'res-vote-bar');
        const fill = createElement('div');
        fill.style.width = `${p.votes / maxVotes * 100}%`;
        bar.append(fill);

        row.append(avatar, who, bar, createElement('span', 'res-vote-count', p.votes));
        return row;
    }));

    if (kickedIds.length === 0) {
        container.append(createElement('div', 'res-empty', 'Nikt nie został wyrzucony'));
    }
}

function showResults(results) {
    showScreen('screen-results');

    const mode = gameModes[results.mode];
    const won = results.won;
    const wasIKicked = results.kickedPlayers.some(player => player.id === myPlayerId);

    byId('res-banner').className = `res-banner ${won ? 'res-win' : 'res-lose'}`;
    byId('res-outcome').textContent = won ? 'WYGRANA' : 'PRZEGRANA';
    byId('res-summary').textContent = mode.resultSummary(results);
    byId('res-player-status').textContent = wasIKicked ? 'Zostałeś zabity!' : 'Przeżyłeś!';

    byId('res-mode-sections').replaceChildren(...mode.resultSections(results));

    renderResultPlayers('res-impostors', results.impostors, results.kickedPlayers.map(k => k.id), 'Brak impostorów');
    renderResultVotes(results);

    let gainedExp = 0;

    gainedExp += 10;
    gainedExp += (results.players.length * 5);
    if (!wasIKicked) gainedExp += 10;

    if (won) gainedExp *= 1.5;
    gainedExp = Math.floor(gainedExp);

    byId('res-exp').textContent = `+${gainedExp} EXP`;
    updateExp(playerExp + gainedExp);
}

// ===== ZDARZENIA Z SERWERA =====

socket.on("connect", () => {
    const lastRoomCode = localStorage.getItem('lastRoomCode');
    if (!lastRoomCode) return;

    socket.emit('rejoin_room', {
        roomCode: lastRoomCode,
        userId: userId
    });
});

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
        // Pokój zniknął, gdy nas nie było
        currentRoomCode = "";
        showScreen('screen-login');
    }
});

socket.on('mode_list', renderModes);

socket.on('room_list', renderRoomList);

socket.on('room_update', (room) => {
    currentRoomCode = room.code;
    socket.emit('check_host', currentRoomCode);
    localStorage.setItem('lastRoomCode', room.code);
    byId('input-answer').value = "";
    showScreen('screen-lobby');

    renderLobby(room);
});

socket.on('left_room_success', () => {
    console.log("Pomyślnie opuszczono pokój.");
    closeCategoryPicker();
    currentRoomCode = "";
    localStorage.removeItem('lastRoomCode');
    showScreen('screen-login');
});

socket.on('is_host', setHostControls);

socket.on('game_start', (data) => {
    showScreen('screen-game');
    showGame(data);
    socket.emit('check_host', currentRoomCode);
});

socket.on('start_vote', (vote) => {
    showScreen('screen-vote');
    renderVoteTiles(vote);
});

socket.on('game_over', showResults);

socket.on('receive_fuck', (data) => {
    showFuck(data.playerId);
});

socket.on('error', showError);

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {

        // Jeśli socket jest rozłączony, natychmiast wymuszamy próbę połączenia
        if (socket.disconnected) {
            socket.connect();
        }
    }
});

// ===== START =====

byId('input-name').value = localStorage.getItem('savedNick') || "";
changeNick();
updateExp(playerExp);

console.log("EXP: " + playerExp);
console.log('Twoje UID: ' + userId);
