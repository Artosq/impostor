// TRYB IMPOSTOR: gracze widzą hasło, impostor tylko podpowiedź do niego.
// Dane: data/impostor.json - { "Kategoria": [{ "word": "...", "hints": ["...", ...] }] }

const { randomItem, cleanText, isText, loadData } = require('../utils');
const shared = require('./shared');

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

    start(room, { category: selectedCategory, impostorCount, customCategory }) {
        const error = shared.checkImpostorCount(room, impostorCount);
        if (error) return error;

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

        room.round = {
            category: category,
            word: selected.word,
            hint: selected.hints.length > 0 ? randomItem(selected.hints) : NO_HINT,
            impostors: shared.assignImpostors(room, impostorCount),
            starter: shared.pickStarter(room)
        };
        return null;
    },

    playerView(room, player) {
        const { category, word, hint, starter } = room.round;
        return {
            category: category,
            starter: starter,
            role: player.role,
            data: player.role === shared.ROLE_IMPOSTOR ? hint : word
        };
    },

    onAction() {},

    voteView: shared.voteView,

    finish(room) {
        return { ...shared.huntResults(room), word: room.round.word };
    },

    playerResult: shared.huntPlayerResult
};
