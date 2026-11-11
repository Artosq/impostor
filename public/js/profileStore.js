// DANE GRACZA: poziom, doświadczenie, statystyki, historia gier i odznaki - cała gra korzysta tylko z tego modułu.
//
// Dwa tryby:
// - gość (bez połączenia z kontem): postęp liczy przeglądarka i trzyma go w swojej pamięci (localBackend),
// - konto (Supabase, zob. accounts.js na serwerze): postęp liczy i zapisuje serwer gry po każdej rundzie,
//   przeglądarka dostaje gotowe dane (useAccount, applyAccount) - nie da się go podrobić.
// Zasady liczenia (EXP, statystyki, odznaki) są wspólne: progress.js.
//
// Funkcje zmieniające dane zwracają Promise. get() oddaje od razu ostatnio znany profil (do rysowania menu).
// Ładowany po badges.js i progress.js, przed app.js.

(function (root) {
    'use strict';

    const STORAGE_KEY = 'impostorProfile';
    const Core = root.ProgressCore;

    // ===== BACKEND: PAMIĘĆ PRZEGLĄDARKI (gość) =====
    const localBackend = {
        async load() { return localBackend.loadNow(); },
        // Profil z przeglądarki albo nowy - z poziomem i doświadczeniem z wcześniejszych wersji gry (playerExp/playerLVL)
        loadNow() {
            try {
                const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
                if (saved && typeof saved === 'object') return Core.normalize(saved);
            } catch (e) { /* uszkodzony zapis - zaczynamy od nowa */ }
            const profile = Core.emptyProfile();
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
    let account = null;         // { send(event, data) } - połączenie z kontem na serwerze
    const listeners = new Set();

    function notify() {
        listeners.forEach(fn => { try { fn(profile); } catch (e) { console.error(e); } });
    }

    async function commit() {
        notify();
        if (!account) await backend.save(profile);
        return profile;
    }

    root.ProfileStore = {
        // ostatnio znany profil (tylko do odczytu - zmiany przez funkcje poniżej)
        get: () => profile,
        isAccount: () => account !== null,

        // świeży profil z backendu gościa
        async load() {
            profile = Core.normalize(await backend.load());
            notify();
            return profile;
        },

        // Poziom i EXP po rundzie: gość zapisuje u siebie, przy koncie to tylko odświeżenie widoku (zapisał serwer)
        async setProgress(level, exp) {
            profile.level = level;
            profile.exp = exp;
            return commit();
        },

        // Zapis rundy gościa; zwraca nowe albo podniesione odznaki do pokazania na ekranie wyników.
        // Przy koncie nic nie robi - rundę zapisał serwer, a odznaki przyszły razem z wynikami.
        async recordGame(game) {
            if (account) return [];
            Core.applyGame(profile, game, new Date(game.at).getHours());
            const earned = Core.updateBadges(profile, root.Badges);
            await commit();
            return earned;
        },

        // Wyczyn spoza rundy (np. "installed" - pierwsze uruchomienie z ikony); zwraca nowe odznaki
        async recordFeat(id) {
            if (profile.feats[id]) return [];
            if (account) account.send('account_feat', id);
            profile.feats[id] = Date.now();
            const earned = Core.updateBadges(profile, root.Badges);
            await commit();
            return earned;
        },

        async markBadgesSeen() {
            if (!profile.unseenBadges.length) return profile;
            if (account) account.send('badges_seen');
            profile.unseenBadges = [];
            return commit();
        },

        onChange(fn) { listeners.add(fn); },

        // ===== KONTO =====
        // Połączenie z kontem: od teraz profil przychodzi z serwera. send(event, data) wysyła prośbę do serwera.
        useAccount(sender, accountProfile) {
            account = sender;
            if (accountProfile) root.ProfileStore.applyAccount(accountProfile);
        },

        // Profil (cały albo jego część: level, exp, unseenBadges...) przysłany przez serwer
        applyAccount(data) {
            profile = Core.normalize({ ...profile, ...data });
            notify();
            return profile;
        },

        // Rozłączenie z kontem (np. wylogowanie) - wraca postęp gościa z tej przeglądarki
        leaveAccount() {
            account = null;
            profile = localBackend.loadNow();
            notify();
        },

        // Postęp gościa z tej przeglądarki (do jednorazowego przeniesienia na konto)
        localProfile: () => localBackend.loadNow(),

        // Podmiana sposobu zapisu gościa: { load(): Promise<profil>, save(profil): Promise }
        async useBackend(next) {
            backend = next;
            return root.ProfileStore.load();
        },

        localBackend
    };
})(window);
