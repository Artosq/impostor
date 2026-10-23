// TRYB IMPOSTOR: gracze widzą hasło, impostor tylko podpowiedź do niego.
// Dane: data/impostor.json - { "Kategoria": [{ "word": "...", "hints": ["...", ...], "aliases": ["inna nazwa", ...] }] }
// W trakcie głosowania impostor może raz spróbować odgadnąć hasło: trafi - wygrywa od razu, pomyli się - przegrywa
// (przełącznik "Ostatnia szansa impostora").
//
// DODATKOWE ROLE (przełączniki w "Ustawieniach gry", każda wymaga jednego gracza więcej):
//   Wspólnik   - zna hasło i wie, kto jest impostorem (impostor nie wie o nim); wygrywa z impostorem
//   Błazen     - zna hasło; wygrywa sam, jeśli zostanie wyrzucony (wtedy wszyscy inni przegrywają)
//   Detektyw   - zna hasło i jedną osobę, która na pewno nie jest impostorem; wygrywa z graczami
//   Podmieniec - dostaje inne losowe hasło z tej samej kategorii i o tym nie wie (karta: "GRACZ"); wygrywa z graczami

const { randomItem, shuffle, cleanText, isText, loadData, publicPlayer } = require('../utils');
const shared = require('./shared');
const { matchesWord } = require('./guess');

const CATEGORY_NAMES = { Przedmioty: 'Inne' };  // nazwa na kafelku, jeśli inna niż w pliku
const MIN_WORDS = 10;                           // mniejsze kategorie nie trafiają do gry

function isValidEntry(entry) {
    return entry && isText(entry.word)
        && Array.isArray(entry.hints) && entry.hints.length > 0 && entry.hints.every(isText);
}

function loadCategories() {
    const categories = new Map();

    Object.entries(loadData('impostor.json')).forEach(([name, entries]) => {
        const valid = Array.isArray(entries) ? entries.filter(isValidEntry) : [];
        const skipped = (Array.isArray(entries) ? entries.length : 0) - valid.length;

        if (skipped > 0) console.warn(`Impostor: kategoria "${name}" - pominięto ${skipped} błędnych haseł`);
        if (valid.length < MIN_WORDS) {
            return console.warn(`Impostor: kategoria "${name}" pominięta (${valid.length} haseł, minimum ${MIN_WORDS})`);
        }
        categories.set(name, valid);
    });

    if (categories.size === 0) throw new Error('brak kategorii w data/impostor.json');
    return categories;
}

const categories = loadCategories();
const RANDOM_CATEGORY = 'losowa';
const CUSTOM_CATEGORY = 'wlasna';
const NO_HINT = 'Brak podpowiedzi';

const MAX_GUESS_LENGTH = 60;

const ROLE_ACCOMPLICE = 'WSPOLNIK';
const ROLE_JESTER = 'BLAZEN';
const ROLE_DETECTIVE = 'DETEKTYW';
const ROLE_CHANGELING = 'PODMIENIEC';
const JESTER_TEAM = 'BLAZEN';
const MIN_REGULAR_PLAYERS = 2;      // gdy są dodatkowe role, tylu zwykłych graczy musi zostać obok impostorów i ról

// Przełączniki w oknie "Ustawienia gry" (kolejność = kolejność losowania ról)
const OPTIONS = [
    { id: 'lastChance', name: 'Ostatnia szansa impostora', description: 'W trakcie głosowania impostor może raz zgadnąć hasło: trafi - wygrywa, pomyli się - przegrywa', default: true },
    { id: 'accomplice', name: 'Wspólnik', description: 'Zna hasło i wie, kto jest impostorem. Wygrywa razem z nim', default: false, players: 1, role: ROLE_ACCOMPLICE },
    { id: 'jester', name: 'Błazen', description: 'Zna hasło, ale wygrywa sam, jeśli zostanie wyrzucony', default: false, players: 1, role: ROLE_JESTER },
    { id: 'detective', name: 'Detektyw', description: 'Wie o jednej osobie, że na pewno nie jest impostorem', default: false, players: 1, role: ROLE_DETECTIVE },
    { id: 'changeling', name: 'Podmieniec', description: 'Dostaje inne hasło z tej kategorii i nie wie o tym', default: false, players: 1, role: ROLE_CHANGELING }
];

// Drużyna roli - kto wygrywa razem
function teamOf(role) {
    if (role === shared.ROLE_IMPOSTOR || role === ROLE_ACCOMPLICE) return shared.ROLE_IMPOSTOR;
    if (role === ROLE_JESTER) return JESTER_TEAM;
    return shared.ROLE_PLAYER;
}

// Dodatkowe role dla zwykłych graczy (impostorzy są już wylosowani)
function assignExtraRoles(room, enabledRoles) {
    const regulars = shuffle(room.players.filter(p => p.role === shared.ROLE_PLAYER));
    enabledRoles.forEach((role, i) => { regulars[i].role = role; });
}

// Granice kategorii wpisanej przez hosta
const CUSTOM_LIMITS = { name: 20, minEntries: 3, maxEntries: 300, word: 40, hints: 5, hint: 30 };

// Kategoria hosta przychodzi z jego przeglądarki, więc każde pole jest przycinane i sprawdzane.
// Podpowiedzi są opcjonalne.
function cleanCustomCategory(input) {
    if (!input || !Array.isArray(input.entries)) return null;

    const name = cleanText(input.name, CUSTOM_LIMITS.name);
    const seen = new Set();
    const entries = [];

    input.entries.slice(0, CUSTOM_LIMITS.maxEntries).forEach(entry => {
        const word = cleanText(entry && entry.word, CUSTOM_LIMITS.word);
        if (!word || seen.has(word.toLowerCase())) return;
        seen.add(word.toLowerCase());

        const hints = (Array.isArray(entry.hints) ? entry.hints : [])
            .map(hint => cleanText(hint, CUSTOM_LIMITS.hint))
            .filter(Boolean)
            .slice(0, CUSTOM_LIMITS.hints);
        entries.push({ word, hints });
    });

    if (!name || entries.length < CUSTOM_LIMITS.minEntries) return null;
    return { id: cleanText(input.id, 24), name, entries };
}

const totalWords = [...categories.values()].reduce((sum, words) => sum + words.length, 0);

module.exports = {
    id: 'impostor',
    name: 'Impostor',
    categories: [
        { id: RANDOM_CATEGORY, name: 'Losowa', count: totalWords, random: true },
        ...[...categories.entries()].map(([id, words]) => ({ id, name: CATEGORY_NAMES[id] || id, count: words.length }))
    ],

    customCategoryId: CUSTOM_CATEGORY,
    customLimits: CUSTOM_LIMITS,
    cleanCustomCategory: cleanCustomCategory,

    options: OPTIONS.map(({ id, name, description, players }) => ({ id, name, description, default: OPTIONS.find(o => o.id === id).default, players: players || 0 })),

    start(room, { category: selectedCategory, impostorCount, customCategory, options = {} }) {
        const error = shared.checkImpostorCount(room, impostorCount);
        if (error) return error;

        const extraRoles = OPTIONS.filter(o => o.role && options[o.id]).map(o => o.role);
        // bez dodatkowych ról wystarcza dotychczasowe minimum (impostorzy + 1 gracz)
        const needed = impostorCount + extraRoles.length + MIN_REGULAR_PLAYERS;
        if (extraRoles.length > 0 && room.players.length < needed) return `Za mało graczy na wybrane role (potrzeba co najmniej ${needed})`;

        let category;   // nazwa pokazywana graczom
        let entries;

        if (selectedCategory === CUSTOM_CATEGORY) {
            if (!customCategory) return 'Własna kategoria nie została przesłana!';
            category = customCategory.name;
            entries = customCategory.entries;
        } else {
            // "Losowa" wybiera inną kategorię przy każdym starcie
            category = selectedCategory === RANDOM_CATEGORY ? shared.pickFresh(room, 'category', [...categories.keys()]) : selectedCategory;
            if (!categories.has(category)) return 'Nie znaleziono wybranej kategorii!';
            entries = categories.get(category);
        }

        // Losowanie hasła z kategorii (bez tych, które pokój ostatnio miał)
        const selected = shared.pickFresh(room, 'word:' + category, entries, entry => entry.word);

        const impostors = shared.assignImpostors(room, impostorCount);
        assignExtraRoles(room, extraRoles);

        // Podmieniec: inne losowe hasło z tej samej kategorii
        const others = entries.filter(entry => entry.word !== selected.word);
        // Detektyw: jedna osoba, która na pewno nie jest impostorem (ale może być Wspólnikiem albo Błaznem)
        const detective = room.players.find(p => p.role === ROLE_DETECTIVE);
        const cleared = detective ? randomItem(room.players.filter(p => p !== detective && p.role !== shared.ROLE_IMPOSTOR)) : null;

        room.round = {
            category: category,
            word: selected.word,
            aliases: Array.isArray(selected.aliases) ? selected.aliases.filter(isText) : [],
            guess: null,        // { by, text, correct } - próba odgadnięcia hasła przez impostora
            lastChance: Boolean(options.lastChance),
            roles: extraRoles,
            changelingWord: others.length > 0 ? randomItem(others).word : selected.word,
            clearedName: cleared ? cleared.name : null,
            hint: selected.hints.length > 0 ? randomItem(selected.hints) : NO_HINT,
            impostors: impostors,
            starter: shared.pickStarter(room)
        };
        return null;
    },

    // Co widzi gracz na karcie roli. Podmieniec dostaje rolę "GRACZ" - nie może wiedzieć, że jest inny.
    playerView(room, player) {
        const { category, word, hint, starter, changelingWord, clearedName, impostors, roles } = room.round;
        const view = { category, starter, role: player.role, data: word, roles };
        if (player.role === shared.ROLE_IMPOSTOR) view.data = hint;
        if (player.role === ROLE_CHANGELING) { view.role = shared.ROLE_PLAYER; view.data = changelingWord; }
        if (player.role === ROLE_ACCOMPLICE) view.note = `Impostor: ${impostors.map(p => p.name).join(', ')}`;
        if (player.role === ROLE_DETECTIVE && clearedName) view.note = `${clearedName} na pewno nie jest impostorem`;
        return view;
    },

    // Zgadywanie hasła: tylko impostor, tylko w trakcie głosowania i tylko raz na rundę.
    // Zwraca { finish: true } - serwer kończy wtedy grę od razu.
    onAction(room, player, type, payload) {
        if (type !== 'guess' || room.status !== 'voting' || room.round.guess || !room.round.lastChance) return null;
        if (player.role !== shared.ROLE_IMPOSTOR) return null;

        const text = cleanText(payload, MAX_GUESS_LENGTH);
        if (!text) return null;

        room.round.guess = { by: shared.publicPlayerOf(player), text, correct: matchesWord(text, room.round.word, room.round.aliases) };
        return { finish: true };
    },

    voteView(room) {
        return { ...shared.voteView(room), canGuess: room.round.lastChance && !room.round.guess };
    },

    // Rozstrzygnięcie: 1) zgadywanie hasła, 2) wyrzucony Błazen wygrywa sam, 3) zwykłe łapanie impostorów.
    // Na wynikach wszyscy widzą role wszystkich.
    finish(room) {
        const results = { ...shared.huntResults(room), word: room.round.word, roles: room.round.roles };
        const { guess, changelingWord } = room.round;
        const jesterKicked = results.kickedPlayers.some(k => room.players.some(p => p.publicId === k.id && p.role === ROLE_JESTER));

        if (guess) {
            results.guess = guess;
            results.winner = guess.correct ? shared.ROLE_IMPOSTOR : shared.ROLE_PLAYER;
        } else if (jesterKicked) {
            results.winner = JESTER_TEAM;
        }
        results.players = results.players.map(p => ({ ...p, role: room.players.find(x => x.publicId === p.id).role }));
        if (room.round.roles.includes(ROLE_CHANGELING)) results.changelingWord = changelingWord;
        return results;
    },

    playerResult(room, player, results) {
        return { role: player.role, won: results.winner === teamOf(player.role) };
    }
};
