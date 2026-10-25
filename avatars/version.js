'use strict';

// WERSJA AWATARÓW: odcisk wszystkiego, od czego zależy wygląd (kod zestawów, części w data/avatars/, wersja DiceBear).
// Klient dopisuje ją do adresu obrazka (?v=...), więc po każdej zmianie skórek adresy są nowe
// i gracze od razu widzą nowy wygląd, mimo że obrazki trzymają w pamięci przez rok.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SOURCES = [path.join(__dirname), path.join(__dirname, '..', 'data', 'avatars')];

function computeVersion() {
    const hash = crypto.createHash('sha1');
    SOURCES.forEach(dir => {
        fs.readdirSync(dir).filter(name => /\.(js|json)$/.test(name)).sort().forEach(name => {
            hash.update(name).update(fs.readFileSync(path.join(dir, name)));
        });
    });
    // pakiet nie udostępnia package.json przez require - czytamy plik wprost
    try {
        hash.update(fs.readFileSync(path.join(__dirname, '..', 'node_modules', '@dicebear', 'core', 'package.json')));
    } catch (e) {}
    return hash.digest('base64url').slice(0, 8);
}

module.exports = { AVATAR_VERSION: computeVersion() };
