// DANE GRACZA: poziom, doświadczenie, statystyki, historia gier i odznaki - cała gra korzysta tylko z tego modułu.
//
// Zapis idzie przez "backend" z dwiema funkcjami: load() i save(profile). Teraz jest to pamięć przeglądarki
// (localBackend). Przy kontach wystarczy dopisać backend z bazą (np. Supabase) o tych samych funkcjach
// i włączyć go przez ProfileStore.useBackend(...) - reszta gry się nie zmienia, a profil z przeglądarki
// można wtedy wysłać na konto (ProfileStore.get()).
//
// Funkcje zmieniające dane zwracają Promise - z bazą zapis potrwa, a gra już na to czeka.
// get() oddaje od razu ostatnio wczytany profil (do rysowania menu bez czekania).
//
// Uwaga: dane w przeglądarce każdy może zmienić. Przy płatnościach albo rankingu wyniki gier musi zapisywać serwer.
// Ładowany przed app.js. Odznaki liczy badges.js.

(function (root) {
    'use strict';

    const STORAGE_KEY = 'impostorProfile';
    const PROFILE_VERSION = 1;
    const HISTORY_LIMIT = 20;

    function emptyStats() {
        return {
            games: 0, wins: 0,
            impostorGames: 0, impostorWins: 0,
            playerGames: 0, playerWins: 0,
            kicked: 0, kickedInnocent: 0,
            correctVotes: 0,                 // gry, w których głosowałeś na prawdziwego impostora
            guesses: 0, guessesCorrect: 0,   // "ostatnia szansa" impostora
            hostGames: 0,
            pointedAt: 0,                    // ile razy wskazali Cię inni w "Kto z nas"
            streak: 0, bestStreak: 0,
            playMs: 0,
            roles: {}, roleWins: {},         // rola -> liczba gier / wygranych
            modes: {}, categories: {}        // tryb / kategoria -> liczba gier
        };
    }

    function emptyProfile() {
        return {
            version: PROFILE_VERSION,
            createdAt: Date.now(),
            level: 1,
            exp: 0,
            stats: emptyStats(),
            feats: {},          // jednorazowe wyczyny (np. "invisible": data) - do odznak bez poziomów
            badges: {},         // id odznaki -> { tier, at } (tier: 0 = brąz ... 3 = diament; jednorazowe: 0)
            unseenBadges: [],   // nowe odznaki, których gracz nie widział jeszcze w profilu
            history: []         // ostatnie gry, najnowsza pierwsza
        };
    }

    // Uzupełnia brakujące pola (profil zapisany starszą wersją gry)
    function normalize(profile) {
        const base = emptyProfile();
        const merged = { ...base, ...profile, stats: { ...base.stats, ...(profile.stats || {}) } };
        ['feats', 'badges'].forEach(key => { merged[key] = { ...(profile[key] || {}) }; });
        ['unseenBadges', 'history'].forEach(key => { merged[key] = Array.isArray(profile[key]) ? profile[key] : []; });
        merged.version = PROFILE_VERSION;
        return merged;
    }

    // ===== BACKEND: PAMIĘĆ PRZEGLĄDARKI =====
    const localBackend = {
        async load() { return localBackend.loadNow(); },
        // Profil z przeglądarki albo nowy - z poziomem i doświadczeniem z wcześniejszych wersji gry (playerExp/playerLVL)
        loadNow() {
            try {
                const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
                if (saved && typeof saved === 'object') return normalize(saved);
            } catch (e) { /* uszkodzony zapis - zaczynamy od nowa */ }
            const profile = emptyProfile();
            try {
                const level = parseInt(localStorage.getItem('playerLVL'));
                const exp = parseInt(localStorage.getItem('playerExp'));
                if (level > 1) profile.level = level;
                if (exp > 0) profile.exp = exp;
            } catch (e) { /* bez pamięci */ }
            return profile;
        },
        async save(profile) {
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(profile)); } catch (e) { /* bez pamięci - zostaje w tej sesji */ }
        }
    };

    let backend = localBackend;
    let profile = localBackend.loadNow();
    const listeners = new Set();

    async function commit() {
        listeners.forEach(fn => { try { fn(profile); } catch (e) { console.error(e); } });
        await backend.save(profile);
        return profile;
    }

    // ===== ZAPIS WYNIKU GRY =====
    // game: wynik jednej rundy z punktu widzenia gracza (app.js zbiera go z ekranu wyników)
    //   { at, mode, category, role, won, kicked, host, players, playerNames, votedImpostor, votesAgainstMe,
    //     unanimous, guess: null | 'correct' | 'wrong', subject, durationMs, pointedAt }
    function applyGame(game) {
        const s = profile.stats;
        const isImpostor = game.role === 'IMPOSTOR';
        const count = (obj, key) => { if (key) obj[key] = (obj[key] || 0) + 1; };

        s.games++;
        if (game.won) s.wins++;
        if (isImpostor) { s.impostorGames++; if (game.won) s.impostorWins++; }
        else { s.playerGames++; if (game.won) s.playerWins++; }
        if (game.kicked) { s.kicked++; if (!isImpostor) s.kickedInnocent++; }
        if (game.votedImpostor) s.correctVotes++;
        if (game.guess) { s.guesses++; if (game.guess === 'correct') s.guessesCorrect++; }
        if (game.host) s.hostGames++;
        s.pointedAt += game.pointedAt || 0;
        s.streak = game.won ? s.streak + 1 : 0;
        s.bestStreak = Math.max(s.bestStreak, s.streak);
        s.playMs += Math.max(0, Math.min(game.durationMs || 0, 60 * 60 * 1000));
        count(s.roles, game.role);
        if (game.won) count(s.roleWins, game.role);
        count(s.modes, game.mode);
        count(s.categories, game.category);

        // jednorazowe wyczyny (badges.js zamienia je na odznaki)
        const hour = new Date(game.at).getHours();
        const feats = {
            firstBlood: isImpostor && game.won,
            invisible: isImpostor && game.won && game.votesAgainstMe === 0,
            unanimous: !isImpostor && game.unanimous,
            betrayal: game.role === 'WSPOLNIK' && game.won,
            fullHouse: game.players >= 10,
            nightOwl: hour >= 0 && hour < 4
        };
        Object.entries(feats).forEach(([id, done]) => { if (done && !profile.feats[id]) profile.feats[id] = game.at; });

        profile.history.unshift({
            at: game.at, mode: game.mode, category: game.category, role: game.role, won: game.won,
            kicked: game.kicked, subject: game.subject, players: game.players, playerNames: (game.playerNames || []).slice(0, 16)
        });
        profile.history.length = Math.min(profile.history.length, HISTORY_LIMIT);
    }

    // Odznaki zdobyte albo podniesione od ostatniego sprawdzenia -> [{ id, tier }]
    function updateBadges() {
        const earned = [];
        (root.Badges ? root.Badges.evaluate(profile) : []).forEach(({ id, tier }) => {
            const had = profile.badges[id];
            if (had && had.tier >= tier) return;
            profile.badges[id] = { tier, at: Date.now() };
            if (!profile.unseenBadges.includes(id)) profile.unseenBadges.push(id);
            earned.push({ id, tier });
        });
        return earned;
    }

    root.ProfileStore = {
        // ostatnio wczytany profil (tylko do odczytu - zmiany przez funkcje poniżej)
        get: () => profile,

        // świeży profil z backendu (z bazą: po zalogowaniu)
        async load() {
            profile = normalize(await backend.load());
            listeners.forEach(fn => fn(profile));
            return profile;
        },

        async setProgress(level, exp) {
            profile.level = level;
            profile.exp = exp;
            return commit();
        },

        // Zapis rundy; zwraca nowe albo podniesione odznaki do pokazania na ekranie wyników
        async recordGame(game) {
            applyGame(game);
            const earned = updateBadges();
            await commit();
            return earned;
        },

        async markBadgesSeen() {
            if (!profile.unseenBadges.length) return profile;
            profile.unseenBadges = [];
            return commit();
        },

        onChange(fn) { listeners.add(fn); },

        // Podmiana sposobu zapisu (np. baza po zalogowaniu): { load(): Promise<profil>, save(profil): Promise }
        async useBackend(next) {
            backend = next;
            return root.ProfileStore.load();
        },

        localBackend
    };
})(window);
