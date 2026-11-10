'use strict';

// FILTR NICKÓW: w pokojach publicznych (widzą je obcy) wulgaryzmy i obelgi w nickach zamieniają się na gwiazdki -
// zostaje pierwsza i ostatnia litera słowa ("Kutaas123" -> "K****s123"). Pełny nick zostaje na serwerze:
// w pokoju prywatnym wraca, a zapisany nick gracza w przeglądarce się nie zmienia.
// Łapie też typowe obejścia: powtórzone litery (kuuurwa), znaki między literami (k.u.r.w.a), cyfry zamiast liter (kurw4)
// i polskie znaki zamienione na zwykłe. Lista słów: data/zakazane-slowa.json

const { loadData } = require('./utils');

const words = loadData('zakazane-slowa.json') || {};
const STEMS = Array.isArray(words.rdzenie) ? words.rdzenie : [];
const WHOLE_WORDS = Array.isArray(words.cale_slowa) ? words.cale_slowa : [];

const LOOKALIKES = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', '$': 's', '!': 'i' };
const LETTER = /\p{L}/u;

// Znak nicku -> mała litera a-z albo null (znak pomijany przy szukaniu słów: kropki, spacje, podkreślniki...)
function normalizeChar(ch) {
    const lower = ch.toLowerCase();
    if (lower === 'ł') return 'l';
    if (LOOKALIKES[lower]) return LOOKALIKES[lower];
    const base = lower.normalize('NFD').replace(/[̀-ͯ]/g, '');
    return /^[a-z]$/.test(base) ? base : null;
}

// Uproszczony zapis nicku (bez powtórzeń liter) + skąd pochodzi każda jego litera
function simplify(nick) {
    let text = '';
    const source = [];
    [...nick].forEach((ch, i) => {
        const letter = normalizeChar(ch);
        if (!letter || letter === text[text.length - 1]) return;
        text += letter;
        source.push(i);
    });
    return { text, source };
}

function findAll(text, word) {
    const found = [];
    for (let at = text.indexOf(word); at !== -1; at = text.indexOf(word, at + 1)) found.push(at);
    return found;
}

function maskNick(nick) {
    if (typeof nick !== 'string' || !nick) return nick;
    const chars = [...nick];
    const { text, source } = simplify(nick);
    const spans = [];     // [pierwszy, ostatni] znak oryginalnego nicku

    const addSpan = (at, length) => {
        const first = source[at];
        let last = source[at + length - 1];
        // powtórzenia ostatniej litery też należą do słowa ("kurwaaa")
        while (last + 1 < chars.length && normalizeChar(chars[last + 1]) === normalizeChar(chars[last])) last++;
        spans.push([first, last]);
    };
    STEMS.forEach(stem => findAll(text, stem).forEach(at => addSpan(at, stem.length)));
    WHOLE_WORDS.forEach(word => findAll(text, word).forEach(at => {
        const first = source[at], last = source[at + word.length - 1];
        const before = chars[first - 1], after = chars[last + 1];
        // osobne słowo: przed i po nim nie ma litery (cyfry i znaki mogą być - "suka123")
        if ((!before || !LETTER.test(before)) && (!after || !LETTER.test(after))) addSpan(at, word.length);
    }));

    // w środku słowa gwiazdki (pierwsza i ostatnia litera zostają), znaki rozdzielające bez zmian
    spans.forEach(([first, last]) => {
        for (let i = first + 1; i < last; i++) {
            if (normalizeChar(chars[i])) chars[i] = '*';
        }
    });
    return chars.join('');
}

module.exports = { maskNick };
