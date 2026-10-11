// TRYBY GRY PO STRONIE KLIENTA
//
// Każdy tryb to osobny plik w tym katalogu, który dopisuje się do gameModes pod swoim id
// (takim samym jak na serwerze w modes/). app.js nie wie nic o konkretnym trybie -
// wywołuje tylko poniższe funkcje:
//
//   showGame(data)           wypełnia ekran gry danymi gracza
//   voteHeader(vote)         tekst nad kafelkami głosowania albo null
//   voteTileText(player)     dodatkowy tekst na kafelku gracza albo null
//   resultSummary(results)   zdanie pod napisem WYGRANA / PRZEGRANA
//   resultSections(results)  sekcje ekranu wyników specyficzne dla trybu

const gameModes = {};

// ===== WSPÓLNE KLOCKI =====

function createResultSection(label, value, valueClass) {
    const section = document.createElement('div');
    section.className = 'res-section';

    const labelElement = document.createElement('div');
    labelElement.className = 'res-label';
    labelElement.textContent = label;

    const valueElement = document.createElement('div');
    valueElement.className = 'res-value';
    if (valueClass) valueElement.classList.add(valueClass);
    valueElement.textContent = value;

    section.append(labelElement, valueElement);
    return section;
}

// Podsumowanie dla trybów, w których gracze szukają impostorów głosowaniem
function huntSummary(results) {
    const manyImpostors = results.impostors.length > 1;

    if (results.winner === 'GRACZ') {
        return manyImpostors ? 'Impostorzy zostali złapani' : 'Impostor został złapany';
    }
    return manyImpostors ? 'Impostorzy pozostali w ukryciu' : 'Impostor pozostał w ukryciu';
}
