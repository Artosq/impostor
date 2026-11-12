// ODZNAKI: definicje w jednym miejscu. Dwa rodzaje:
// - z poziomami (brąz, srebro, złoto, diament) - licznik ze statystyk i progi,
// - jednorazowe - wyczyn z profilu (profileStore.js, "feats"); sekretne do zdobycia pokazują się jako "???".
// Nowa odznaka = jeden wpis w BADGES + ikona o tym samym id w icons.js. W przeglądarce ładowany przed progress.js, serwer bierze go przez require().

(function (root) {
    'use strict';

    const TIERS = [
        { id: 'bronze', name: 'Brąz' },
        { id: 'silver', name: 'Srebro' },
        { id: 'gold', name: 'Złoto' },
        { id: 'diamond', name: 'Diament' }
    ];

    const roleWins = role => s => s.roleWins[role] || 0;

    const BADGES = [
        { id: 'veteran', name: 'Weteran', description: 'Rozegrane gry', count: s => s.games, steps: [10, 50, 200, 500] },
        { id: 'bluffer', name: 'Mistrz blefu', description: 'Wygrane jako impostor', count: s => s.impostorWins, steps: [3, 15, 50, 150] },
        { id: 'hunter', name: 'Łowca impostorów', description: 'Gry z głosem na prawdziwego impostora', count: s => s.correctVotes, steps: [5, 25, 100, 300] },
        { id: 'clean', name: 'Czysta karta', description: 'Wygrane jako zwykły gracz', count: s => s.playerWins, steps: [5, 25, 100, 300] },
        { id: 'lastChance', name: 'Ostatnia szansa', description: 'Trafione hasła po zdemaskowaniu', count: s => s.guessesCorrect, steps: [1, 5, 20, 50] },
        { id: 'streak', name: 'Seria', description: 'Najdłuższa seria wygranych z rzędu', count: s => s.bestStreak, steps: [3, 5, 8, 12] },
        { id: 'host', name: 'Gospodarz', description: 'Gry rozegrane jako host', count: s => s.hostGames, steps: [5, 25, 100, 300] },
        { id: 'pointed', name: 'Wskazany palcem', description: 'Ile razy wskazali Cię inni w „Kto z nas”', count: s => s.pointedAt, steps: [5, 25, 100, 300] },
        { id: 'scapegoat', name: 'Kozioł ofiarny', description: 'Wyrzucony, choć niewinny', count: s => s.kickedInnocent, steps: [3, 15, 50, 150] },
        { id: 'jester', name: 'Błazen', description: 'Wygrane jako Błazen', count: roleWins('BLAZEN'), steps: [1, 5, 20, 50] },
        { id: 'accomplice', name: 'Wspólnik', description: 'Wygrane jako Wspólnik', count: roleWins('WSPOLNIK'), steps: [1, 5, 20, 50] },
        { id: 'detective', name: 'Detektyw', description: 'Wygrane jako Detektyw', count: roleWins('DETEKTYW'), steps: [1, 5, 20, 50] },
        { id: 'changeling', name: 'Podmieniec', description: 'Wygrane jako Podmieniec', count: roleWins('PODMIENIEC'), steps: [1, 5, 20, 50] },

        { id: 'firstBlood', name: 'Pierwsza krew', description: 'Pierwsza wygrana jako impostor', feat: 'firstBlood' },
        { id: 'invisible', name: 'Niewidzialny', description: 'Wygraj jako impostor bez ani jednego głosu przeciwko sobie', feat: 'invisible', secret: true },
        { id: 'unanimous', name: 'Jednomyślność', description: 'Wszyscy zagłosowali na impostora', feat: 'unanimous', secret: true },
        { id: 'betrayal', name: 'Zdrada', description: 'Jako Wspólnik doprowadź impostora do wygranej', feat: 'betrayal', secret: true },
        { id: 'fullHouse', name: 'Pełna chata', description: 'Zagraj w pokoju z 10 lub więcej osobami', feat: 'fullHouse' },
        { id: 'nightOwl', name: 'Nocny marek', description: 'Zagraj między północą a 4:00', feat: 'nightOwl', secret: true },
        { id: 'installed', name: 'Stały bywalec', description: 'Zainstaluj grę i uruchom ją z ikony', feat: 'installed' }
    ];

    // Najwyższy zdobyty poziom odznaki (-1 = jeszcze nie) i postęp do następnego
    function status(badge, profile) {
        if (badge.feat) {
            const done = Boolean(profile.feats[badge.feat]);
            return { tier: done ? 0 : -1, value: done ? 1 : 0, next: done ? null : 1 };
        }
        const value = badge.count(profile.stats);
        let tier = -1;
        badge.steps.forEach((step, i) => { if (value >= step) tier = i; });
        return { tier, value, next: tier < badge.steps.length - 1 ? badge.steps[tier + 1] : null };
    }

    root.Badges = {
        TIERS,
        BADGES,
        status,
        byId: id => BADGES.find(badge => badge.id === id),
        // zdobyte odznaki z poziomem - porównuje je progress.js z tym, co gracz już miał
        evaluate: profile => BADGES.map(badge => ({ id: badge.id, tier: status(badge, profile).tier })).filter(b => b.tier >= 0)
    };
    // serwer liczy odznaki kont tym samym plikiem (accounts.js)
    if (typeof module === 'object' && module.exports) module.exports = root.Badges;
})(typeof window !== 'undefined' ? window : globalThis);
