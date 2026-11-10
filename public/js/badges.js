// ODZNAKI: definicje w jednym miejscu. Dwa rodzaje:
// - z poziomami (brąz, srebro, złoto, diament) - licznik ze statystyk i progi,
// - jednorazowe - wyczyn z profilu (profileStore.js, "feats"); sekretne do zdobycia pokazują się jako "???".
// Nowa odznaka = jeden wpis w BADGES. Ładowany przed profileStore.js.

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
        { id: 'veteran', icon: '🎖️', name: 'Weteran', description: 'Rozegrane gry', count: s => s.games, steps: [10, 50, 200, 500] },
        { id: 'bluffer', icon: '🎭', name: 'Mistrz blefu', description: 'Wygrane jako impostor', count: s => s.impostorWins, steps: [3, 15, 50, 150] },
        { id: 'hunter', icon: '🔎', name: 'Łowca impostorów', description: 'Gry z głosem na prawdziwego impostora', count: s => s.correctVotes, steps: [5, 25, 100, 300] },
        { id: 'clean', icon: '😇', name: 'Czysta karta', description: 'Wygrane jako zwykły gracz', count: s => s.playerWins, steps: [5, 25, 100, 300] },
        { id: 'lastChance', icon: '🎯', name: 'Ostatnia szansa', description: 'Trafione hasła po zdemaskowaniu', count: s => s.guessesCorrect, steps: [1, 5, 20, 50] },
        { id: 'streak', icon: '🔥', name: 'Seria', description: 'Najdłuższa seria wygranych z rzędu', count: s => s.bestStreak, steps: [3, 5, 8, 12] },
        { id: 'host', icon: '👑', name: 'Gospodarz', description: 'Gry rozegrane jako host', count: s => s.hostGames, steps: [5, 25, 100, 300] },
        { id: 'pointed', icon: '👉', name: 'Wskazany palcem', description: 'Ile razy wskazali Cię inni w „Kto z nas”', count: s => s.pointedAt, steps: [5, 25, 100, 300] },
        { id: 'scapegoat', icon: '🐐', name: 'Kozioł ofiarny', description: 'Wyrzucony, choć niewinny', count: s => s.kickedInnocent, steps: [3, 15, 50, 150] },
        { id: 'jester', icon: '🤡', name: 'Błazen', description: 'Wygrane jako Błazen', count: roleWins('BLAZEN'), steps: [1, 5, 20, 50] },
        { id: 'accomplice', icon: '🤝', name: 'Wspólnik', description: 'Wygrane jako Wspólnik', count: roleWins('WSPOLNIK'), steps: [1, 5, 20, 50] },
        { id: 'detective', icon: '🕵️', name: 'Detektyw', description: 'Wygrane jako Detektyw', count: roleWins('DETEKTYW'), steps: [1, 5, 20, 50] },
        { id: 'changeling', icon: '🦎', name: 'Podmieniec', description: 'Wygrane jako Podmieniec', count: roleWins('PODMIENIEC'), steps: [1, 5, 20, 50] },

        { id: 'firstBlood', icon: '🩸', name: 'Pierwsza krew', description: 'Pierwsza wygrana jako impostor', feat: 'firstBlood' },
        { id: 'invisible', icon: '👻', name: 'Niewidzialny', description: 'Wygraj jako impostor bez ani jednego głosu przeciwko sobie', feat: 'invisible', secret: true },
        { id: 'unanimous', icon: '🗳️', name: 'Jednomyślność', description: 'Wszyscy zagłosowali na impostora', feat: 'unanimous', secret: true },
        { id: 'betrayal', icon: '🗡️', name: 'Zdrada', description: 'Jako Wspólnik doprowadź impostora do wygranej', feat: 'betrayal', secret: true },
        { id: 'fullHouse', icon: '🏠', name: 'Pełna chata', description: 'Zagraj w pokoju z 10 lub więcej osobami', feat: 'fullHouse' },
        { id: 'nightOwl', icon: '🦉', name: 'Nocny marek', description: 'Zagraj między północą a 4:00', feat: 'nightOwl', secret: true }
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
        // zdobyte odznaki z poziomem - porównuje je profileStore.js z tym, co gracz już miał
        evaluate: profile => BADGES.map(badge => ({ id: badge.id, tier: status(badge, profile).tier })).filter(b => b.tier >= 0)
    };
})(window);
