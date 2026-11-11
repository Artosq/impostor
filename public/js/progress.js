// POSTĘP GRACZA - wspólna logika przeglądarki i serwera:
// - przeglądarka liczy nią postęp gościa bez konta (profileStore.js, pamięć przeglądarki),
// - serwer liczy nią postęp kont (accounts.js) - wynik rundy zna sam, więc tego nie da się podrobić.
// Jedna kopia zasad = gość i konto dostają dokładnie to samo EXP, statystyki i odznaki.
// Odznaki definiuje badges.js. W przeglądarce ładowany przed profileStore.js, na serwerze przez require().

(function (root) {
    'use strict';

    const PROFILE_VERSION = 1;
    const HISTORY_LIMIT = 20;
    const MAX_ROUND_MS = 60 * 60 * 1000;     // dłuższa "runda" to zapomniana karta - liczy się najwyżej godzina
    const MAX_LEVEL = 999;
    const FEATS = ['firstBlood', 'invisible', 'unanimous', 'betrayal', 'fullHouse', 'nightOwl', 'installed'];

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
        profile = profile && typeof profile === 'object' ? profile : {};
        const base = emptyProfile();
        const merged = { ...base, ...profile, stats: { ...base.stats, ...(profile.stats || {}) } };
        ['feats', 'badges'].forEach(key => { merged[key] = { ...(profile[key] || {}) }; });
        ['unseenBadges', 'history'].forEach(key => { merged[key] = Array.isArray(profile[key]) ? profile[key] : []; });
        merged.version = PROFILE_VERSION;
        return merged;
    }

    // ===== POZIOMY I EXP =====
    function requiredExp(level) {
        return Math.floor(100 + (level - 1) * 50);
    }

    // Dodaje EXP i podnosi poziom; zwraca liczbę zdobytych poziomów
    function addExp(profile, gained) {
        let levels = 0;
        profile.exp += Math.max(0, Math.floor(gained) || 0);
        while (profile.exp >= requiredExp(profile.level) && profile.level < MAX_LEVEL) {
            profile.exp -= requiredExp(profile.level);
            profile.level++;
            levels++;
        }
        return levels;
    }

    // EXP za rundę: udział + 5 za każdego gracza + 10 za przetrwanie, wygrana x1.5
    function expForGame(result, kicked) {
        let gained = 10 + result.players.length * 5;
        if (!kicked) gained += 10;
        if (result.won) gained *= 1.5;
        return Math.floor(gained);
    }

    // ===== RUNDA Z PUNKTU WIDZENIA GRACZA =====
    // result: to, co gracz dostaje w "game_over" (wyniki rundy + jego rola i wynik)
    // ctx: { at, host, category, startedAt, answerType, votePlayers } - reszta wiadomości o rundzie
    function gameRecord(result, myId, ctx) {
        const me = result.players.find(p => p.id === myId);
        if (!me) return null;
        const impostorIds = new Set(result.impostors.map(p => p.id));
        const impostorVoters = new Set(result.players.filter(p => impostorIds.has(p.id)).flatMap(p => p.voters || []));
        const innocent = result.players.filter(p => !impostorIds.has(p.id));
        const guess = result.guess && result.guess.by && result.guess.by.id === myId ? (result.guess.correct ? 'correct' : 'wrong') : null;

        // "Kto z nas": ile osób (poza mną) wskazało mnie w odpowiedzi
        let pointedAt = 0;
        if (ctx.answerType === 'player' && Array.isArray(ctx.votePlayers)) {
            const mine = ctx.votePlayers.find(p => p.id === myId);
            if (mine) pointedAt = ctx.votePlayers.filter(p => p.id !== myId && p.answer === mine.name).length;
        }

        return {
            at: ctx.at,
            mode: result.mode,
            category: ctx.category || null,
            role: result.role,
            won: Boolean(result.won),
            kicked: result.kickedPlayers.some(p => p.id === myId),
            host: Boolean(ctx.host),
            players: result.players.length,
            playerNames: result.players.filter(p => p.id !== myId).map(p => p.name),
            votedImpostor: impostorVoters.has(myId),
            votesAgainstMe: me.votes || 0,
            unanimous: innocent.length >= 2 && innocent.every(p => impostorVoters.has(p.id)),
            guess,
            subject: result.word || result.playersQuestion || null,
            durationMs: ctx.startedAt ? ctx.at - ctx.startedAt : 0,
            pointedAt
        };
    }

    // hour: godzina rozegrania (0-23) w czasie gracza - do odznaki "Nocny marek"
    function applyGame(profile, game, hour) {
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
        s.playMs += Math.max(0, Math.min(game.durationMs || 0, MAX_ROUND_MS));
        count(s.roles, game.role);
        if (game.won) count(s.roleWins, game.role);
        count(s.modes, game.mode);
        count(s.categories, game.category);

        // jednorazowe wyczyny (badges.js zamienia je na odznaki)
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
    function updateBadges(profile, badges) {
        const earned = [];
        (badges ? badges.evaluate(profile) : []).forEach(({ id, tier }) => {
            const had = profile.badges[id];
            if (had && had.tier >= tier) return;
            profile.badges[id] = { tier, at: Date.now() };
            if (!profile.unseenBadges.includes(id)) profile.unseenBadges.push(id);
            earned.push({ id, tier });
        });
        return earned;
    }

    // ===== PROFIL Z ZEWNĄTRZ =====
    // Profil przysłany przez przeglądarkę (jednorazowe przeniesienie postępu gościa na konto): każde pole
    // przycinane do rozsądnych wartości, odznaki liczone od nowa ze statystyk i wyczynów.
    function sanitize(input) {
        const raw = normalize(input);
        const clean = emptyProfile();
        const int = (value, max = 1e9) => Math.min(max, Math.max(0, Math.floor(Number(value)) || 0));
        const text = (value, max) => typeof value === 'string' ? value.slice(0, max) : null;
        const counts = obj => {
            const out = {};
            Object.entries(obj && typeof obj === 'object' ? obj : {}).slice(0, 50).forEach(([key, value]) => {
                if (key.length <= 40) out[key] = int(value);
            });
            return out;
        };

        clean.level = Math.max(1, int(raw.level, MAX_LEVEL));
        clean.exp = Math.min(int(raw.exp), requiredExp(clean.level) - 1);
        Object.keys(clean.stats).forEach(key => {
            clean.stats[key] = typeof clean.stats[key] === 'object' ? counts(raw.stats[key]) : int(raw.stats[key]);
        });
        FEATS.forEach(id => { if (raw.feats[id]) clean.feats[id] = int(raw.feats[id], 4102444800000) || Date.now(); });
        clean.history = raw.history.slice(0, HISTORY_LIMIT).filter(g => g && typeof g === 'object').map(g => ({
            at: int(g.at, 4102444800000), mode: text(g.mode, 20), category: text(g.category, 40), role: text(g.role, 20),
            won: Boolean(g.won), kicked: Boolean(g.kicked), subject: text(g.subject, 200), players: int(g.players, 16),
            playerNames: Array.isArray(g.playerNames) ? g.playerNames.slice(0, 16).map(n => text(n, 12)).filter(Boolean) : []
        }));
        return clean;
    }

    // Całe EXP zdobyte od początku (poziom 1, 0 EXP = 0)
    function totalExp(profile) {
        let total = profile.exp;
        for (let level = 1; level < profile.level; level++) total += requiredExp(level);
        return total;
    }

    // Połączenie dwóch profili tego samego gracza (np. postęp z dwóch urządzeń): EXP i liczniki się sumują,
    // rekordy (najdłuższa seria) biorą lepszy, wyczyny i historia się łączą. Odznaki liczy potem updateBadges.
    function mergeProfiles(target, source) {
        const a = normalize(target), b = normalize(source);
        const merged = emptyProfile();
        merged.createdAt = Math.min(a.createdAt || Date.now(), b.createdAt || Date.now());
        addExp(merged, totalExp(a) + totalExp(b));
        Object.keys(merged.stats).forEach(key => {
            const x = a.stats[key], y = b.stats[key];
            if (key === 'bestStreak') merged.stats[key] = Math.max(x, y);
            else if (key === 'streak') merged.stats[key] = x;
            else if (typeof merged.stats[key] === 'object') {
                const out = { ...x };
                Object.entries(y || {}).forEach(([k, v]) => { out[k] = (out[k] || 0) + v; });
                merged.stats[key] = out;
            } else merged.stats[key] = (x || 0) + (y || 0);
        });
        [a.feats, b.feats].forEach(feats => Object.entries(feats).forEach(([id, at]) => {
            merged.feats[id] = merged.feats[id] ? Math.min(merged.feats[id], at) : at;
        }));
        merged.badges = { ...b.badges, ...a.badges };
        merged.unseenBadges = [...new Set([...a.unseenBadges, ...b.unseenBadges])];
        merged.history = [...a.history, ...b.history].sort((x, y) => (y.at || 0) - (x.at || 0)).slice(0, HISTORY_LIMIT);
        return merged;
    }

    const ProgressCore = {
        PROFILE_VERSION, HISTORY_LIMIT, MAX_LEVEL, FEATS,
        emptyProfile, normalize, sanitize, mergeProfiles, totalExp,
        requiredExp, addExp, expForGame,
        gameRecord, applyGame, updateBadges
    };
    root.ProgressCore = ProgressCore;
    if (typeof module === 'object' && module.exports) module.exports = ProgressCore;
})(typeof window !== 'undefined' ? window : globalThis);
