// TRYB IMPOSTOR: gracze widzą hasło, impostor tylko podpowiedź do niego.
// Dane: data/impostor.json - { "Kategoria": [{ "word": "...", "hints": ["...", ...] }] }

const { randomItem, isText, loadData } = require('../utils');
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
const totalWords = [...categories.values()].reduce((sum, words) => sum + words.length, 0);

module.exports = {
    id: 'impostor',
    name: 'Impostor',
    categories: [
        { id: RANDOM_CATEGORY, name: 'Losowa', count: totalWords, random: true },
        ...[...categories.entries()].map(([id, words]) => ({ id, name: CATEGORY_NAMES[id] || id, count: words.length }))
    ],

    start(room, { category: selectedCategory, impostorCount }) {
        const error = shared.checkImpostorCount(room, impostorCount);
        if (error) return error;

        // "Losowa" wybiera inną kategorię przy każdym starcie
        const category = selectedCategory === RANDOM_CATEGORY ? randomItem([...categories.keys()]) : selectedCategory;
        if (!categories.has(category)) return 'Nie znaleziono wybranej kategorii!';

        // Losowanie hasła z kategorii
        const selected = randomItem(categories.get(category));

        room.round = {
            category: category,
            word: selected.word,
            hint: randomItem(selected.hints),
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
