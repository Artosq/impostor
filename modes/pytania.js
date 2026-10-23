// TRYB PYTANIA: wszyscy odpowiadają na pytanie, ale impostor dostał inne z tego samego zestawu.
// Kategorie różnią się rodzajem odpowiedzi:
//   Klasyczne    - data/pytania.json            - odpowiedź tekstem
//   Kto z nas   - data/pytania-kto-z-nas.json  - odpowiedzią jest gracz z pokoju
//   Skala 1–10   - data/pytania-skala.json      - odpowiedź suwakiem
// Każdy plik: [{ "cat": "nazwa zestawu", "questions": ["...", ...] }] - para pytań zawsze z jednego zestawu.

const { cleanText, isText, publicPlayer, loadData } = require('../utils');
const shared = require('./shared');

const MAX_ANSWER_LENGTH = 16;
const SCALE_MIN = 1;
const SCALE_MAX = 10;

const CATEGORY_FILES = [
    { id: 'klasyczne', name: 'Klasyczne', file: 'pytania.json', answer: 'text' },
    { id: 'kto-z-nas', name: 'Kto z nas', file: 'pytania-kto-z-nas.json', answer: 'player' },
    { id: 'skala', name: 'Skala 1–10', file: 'pytania-skala.json', answer: 'scale' }
];

function isValidSet(set) {
    return set && Array.isArray(set.questions) && set.questions.length >= 2 && set.questions.every(isText);
}

function loadQuestionSets(file) {
    const sets = loadData(file);
    const valid = Array.isArray(sets) ? sets.filter(isValidSet) : [];
    const skipped = (Array.isArray(sets) ? sets.length : 0) - valid.length;

    if (skipped > 0) console.warn(`Pytania (${file}): pominięto ${skipped} błędnych zestawów`);
    return valid;
}

// Kategoria bez poprawnych zestawów nie trafia do gry
const categories = CATEGORY_FILES
    .map(category => ({ ...category, sets: loadQuestionSets(category.file) }))
    .filter(category => category.sets.length > 0);
if (categories.length === 0) throw new Error('brak zestawów pytań w data/');

// Odpowiedź gracza w formie do pokazania na ekranie głosowania
function answerText(room, answer) {
    if (answer === undefined || answer === '') return '';
    if (room.round.answerType === 'player') {
        const chosen = room.players.find(p => p.publicId === answer);
        return chosen ? chosen.name : '';
    }
    if (room.round.answerType === 'scale') return `${answer}/${SCALE_MAX}`;
    return answer;
}

module.exports = {
    id: 'pytania',
    name: 'Pytania',
    categories: categories.map(c => ({ id: c.id, name: c.name, count: c.sets.reduce((sum, set) => sum + set.questions.length, 0), unit: 'pytań' })),

    start(room, { impostorCount, category: selectedCategory }) {
        const error = shared.checkImpostorCount(room, impostorCount);
        if (error) return error;

        const category = categories.find(c => c.id === selectedCategory) || categories[0];

        // Dwa różne pytania z jednego zestawu - za każdym razem inna para, bez pytań, które pokój ostatnio miał
        const set = shared.pickFresh(room, `questionSet:${category.id}`, category.sets, s => s.cat);
        const key = `question:${category.id}:${set.cat}`;
        const playersQuestion = shared.pickFresh(room, key, set.questions);
        const impostorsQuestion = shared.pickFresh(room, key, set.questions.filter(q => q !== playersQuestion));

        room.round = {
            categoryName: category.name,
            answerType: category.answer,
            impostorsQuestion: impostorsQuestion,
            playersQuestion: playersQuestion,
            answers: new Map(),
            impostors: shared.assignImpostors(room, impostorCount)
        };
        return null;
    },

    // Rola nie jest wysyłana - impostor nie wie, że ma inne pytanie
    playerView(room, player) {
        const { impostorsQuestion, playersQuestion, answerType, categoryName } = room.round;
        const view = {
            category: categoryName,
            question: player.role === shared.ROLE_IMPOSTOR ? impostorsQuestion : playersQuestion,
            answerType: answerType,
            answer: room.round.answers.get(player)       // po powrocie do gry odpowiedź zostaje zaznaczona
        };
        if (answerType === 'player') view.players = room.players.map(p => ({ id: p.publicId, name: p.name, avatar: p.avatar }));
        if (answerType === 'scale') view.scale = { min: SCALE_MIN, max: SCALE_MAX };
        return view;
    },

    // Odpowiedź sprawdzana według rodzaju kategorii
    onAction(room, player, type, payload) {
        if (type !== 'answer' || room.status !== 'playing') return null;
        const { answerType, answers } = room.round;

        if (answerType === 'player') {
            if (room.players.some(p => p.publicId === payload)) answers.set(player, payload);
        } else if (answerType === 'scale') {
            const value = Number(payload);
            if (Number.isInteger(value) && value >= SCALE_MIN && value <= SCALE_MAX) answers.set(player, value);
        } else {
            answers.set(player, cleanText(payload, MAX_ANSWER_LENGTH));
        }
        return null;
    },

    voteView(room) {
        const { playersQuestion, answers } = room.round;
        return {
            ...shared.voteView(room),
            question: playersQuestion,
            players: room.players.map(p => ({ ...publicPlayer(p), answer: answerText(room, answers.get(p)) }))
        };
    },

    finish(room) {
        const { playersQuestion, impostorsQuestion } = room.round;
        return { ...shared.huntResults(room), playersQuestion, impostorsQuestion };
    },

    playerResult: shared.huntPlayerResult
};
