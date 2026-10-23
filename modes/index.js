// REJESTR TRYBÓW GRY
//
// Każdy tryb to osobny plik w tym katalogu. server.js nie wie nic o konkretnym trybie -
// wywołuje tylko poniższe funkcje, a stan rundy (room.round) należy w całości do trybu.
//
//   id, name              identyfikator i nazwa pokazywana hostowi
//   categories            [{ id, name, count, random }] do wyboru w poczekalni (może być puste);
//                         count = liczba haseł, random = pozycja "losowa", nie wybierana domyślnie
//   start(room, options)  przygotowuje rundę: ustawia room.round i role graczy;
//                         zwraca komunikat błędu albo null.
//                         options: { category, impostorCount, customCategory }
//   options               (opcjonalne) przełączniki w oknie "Ustawienia gry":
//                         [{ id, name, description, default, players }] - players = ilu dodatkowych graczy wymaga
//                         (np. dodatkowa rola). Wybrane wartości trafiają do start() jako options.options.
//   customCategoryId, customLimits, cleanCustomCategory(input)
//                         (opcjonalne) tryb przyjmuje kategorię wpisaną przez hosta: sprawdza ją
//                         i zwraca { id, name, entries } albo null. Gościom trafia tylko nazwa i liczba.
//   playerView(room, player)                to, co gracz widzi w trakcie gry
//   onAction(room, player, type, payload)   akcje gracza specyficzne dla trybu
//   voteView(room)                          dane ekranu głosowania
//   finish(room)                            wyniki wspólne dla wszystkich graczy
//   playerResult(room, player, results)     wynik konkretnego gracza: { role, won }
//
// Nowy tryb: plik tutaj + wpis na liście MODE_FILES + plik w public/js/modes/ (wygląd).

const MODE_FILES = ['./impostor', './pytania'];

const modes = [];
MODE_FILES.forEach(file => {
    try {
        modes.push(require(file));
    } catch (err) {
        console.error(`Tryb ${file} wyłączony:`, err.message);
    }
});

const modesById = new Map(modes.map(mode => [mode.id, mode]));
console.log(`Wczytane tryby: ${modes.map(mode => mode.name).join(', ')}`);

// Wartości przełączników trybu: znane id, tylko true/false, brakujące = domyślne
function cleanOptions(mode, input) {
    const options = {};
    (mode.options || []).forEach(option => {
        const value = input && input[option.id];
        options[option.id] = typeof value === 'boolean' ? value : Boolean(option.default);
    });
    return options;
}

function getMode(id) {
    return modesById.get(id);
}

// Lista dla klienta: z niej budują się kafelki trybów i kategorii
function listModes() {
    return modes.map(mode => ({
        id: mode.id,
        name: mode.name,
        categories: mode.categories,
        options: mode.options || [],
        custom: mode.customCategoryId ? { id: mode.customCategoryId, limits: mode.customLimits } : null
    }));
}

module.exports = { getMode, listModes, cleanOptions };
