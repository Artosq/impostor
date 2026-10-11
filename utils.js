const fs = require('fs');
const path = require('path');

function randomItem(items) {
    return items[Math.floor(Math.random() * items.length)];
}

function shuffle(items) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

function cleanText(value, maxLength) {
    return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function isText(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

// Dane gracza widoczne dla wszystkich (bez ról, haseł i userId)
function publicPlayer(player) {
    return { id: player.publicId, name: player.name, avatar: player.avatar, level: player.level };
}

// Wczytuje plik z katalogu data/
function loadData(fileName) {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'data', fileName), 'utf8'));
}

module.exports = { randomItem, shuffle, cleanText, isText, publicPlayer, loadData };
