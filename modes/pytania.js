// TRYB PYTANIA: wszyscy odpowiadają na pytanie, ale impostor dostał inne z tego samego zestawu.
// Dane: data/pytania.json - [{ "cat": "nazwa zestawu", "questions": ["...", ...] }]

const { randomItem, shuffle, cleanText, isText, publicPlayer, loadData } = require('../utils');
const shared = require('./shared');

const MAX_ANSWER_LENGTH = 16;

function isValidSet(set) {
    return set && Array.isArray(set.questions) && set.questions.length >= 2 && set.questions.every(isText);
}

function loadQuestionSets() {
    const sets = loadData('pytania.json');
    const valid = Array.isArray(sets) ? sets.filter(isValidSet) : [];
    const skipped = (Array.isArray(sets) ? sets.length : 0) - valid.length;

    if (skipped > 0) console.warn(`Pytania: pominięto ${skipped} błędnych zestawów`);
    if (valid.length === 0) throw new Error('brak zestawów pytań w data/pytania.json');
    return valid;
}

const questionSets = loadQuestionSets();

module.exports = {
    id: 'pytania',
    name: 'Pytania',
    categories: [],

    start(room, { impostorCount }) {
        const error = shared.checkImpostorCount(room, impostorCount);
        if (error) return error;

        // Dwa różne pytania z jednego losowego zestawu
        const [impostorsQuestion, playersQuestion] = shuffle(randomItem(questionSets).questions);

        room.round = {
            impostorsQuestion: impostorsQuestion,
            playersQuestion: playersQuestion,
            answers: new Map(),
            impostors: shared.assignImpostors(room, impostorCount)
        };
        return null;
    },

    // Rola nie jest wysyłana - impostor nie wie, że ma inne pytanie
    playerView(room, player) {
        const { impostorsQuestion, playersQuestion } = room.round;
        return {
            category: 'Pytania',
            question: player.role === shared.ROLE_IMPOSTOR ? impostorsQuestion : playersQuestion
        };
    },

    onAction(room, player, type, payload) {
        if (type === 'answer' && room.status === 'playing') {
            room.round.answers.set(player, cleanText(payload, MAX_ANSWER_LENGTH));
        }
    },

    voteView(room) {
        const { playersQuestion, answers } = room.round;
        return {
            ...shared.voteView(room),
            question: playersQuestion,
            players: room.players.map(p => ({ ...publicPlayer(p), answer: answers.get(p) || '' }))
        };
    },

    finish(room) {
        const { playersQuestion, impostorsQuestion } = room.round;
        return { ...shared.huntResults(room), playersQuestion, impostorsQuestion };
    },

    playerResult: shared.huntPlayerResult
};
