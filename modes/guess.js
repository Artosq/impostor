// DOPASOWANIE ZGADYWANEGO HASŁA: czy to, co wpisał impostor, to to samo hasło.
// 1. Ujednolicenie: wielkość liter, polskie znaki, spacje, myślniki i interpunkcja nie mają znaczenia,
//    a angielskie "The" na początku jest pomijane ("the matrix" = "Matrix").
// 2. Literówki (także zamienione miejscami litery): dozwolona liczba rośnie z długością hasła - krótkie słowa muszą być dokładne.
//    Zdrobnienia i zapis fonetyczny ("einsztajn") to już inne słowa - nie są zaliczane.
// 3. Inne nazwy z bazy (pole "aliases"), np. "Star Wars" dla "Gwiezdne wojny".

function normalize(text) {
    return String(text)
        .toLowerCase()
        .replace(/ł/g, 'l')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')    // ą -> a, é -> e ...
        .replace(/&/g, 'and')
        .replace(/^\s*the\s+/, '')
        .replace(/[^a-z0-9]/g, '');
}

// Ile literówek wolno przy haśle tej długości
function allowedTypos(length) {
    if (length <= 3) return 0;
    if (length <= 6) return 1;
    if (length <= 11) return 2;
    return 3;
}

// Odległość edycyjna: ile liter dodać, usunąć, zmienić albo zamienić miejscami ("martix" -> "matrix" = 1)
function editDistance(a, b, limit) {
    if (Math.abs(a.length - b.length) > limit) return limit + 1;
    const rows = [Array.from({ length: b.length + 1 }, (_, j) => j)];
    for (let i = 1; i <= a.length; i++) {
        const row = [i];
        let rowMin = i;
        for (let j = 1; j <= b.length; j++) {
            row[j] = Math.min(rows[i - 1][j] + 1, row[j - 1] + 1, rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) row[j] = Math.min(row[j], rows[i - 2][j - 2] + 1);
            rowMin = Math.min(rowMin, row[j]);
        }
        if (rowMin > limit) return limit + 1;
        rows.push(row);
    }
    return rows[a.length][b.length];
}

// Czy zgadywanie pasuje do hasła albo któregoś z jego zamienników
function matchesWord(guess, word, aliases = []) {
    const typed = normalize(guess);
    if (!typed) return false;
    return [word, ...aliases].some(candidate => {
        const target = normalize(candidate);
        if (!target) return false;
        const limit = allowedTypos(target.length);
        return editDistance(typed, target, limit) <= limit;
    });
}

module.exports = { matchesWord, normalize };
