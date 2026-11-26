// POSIADANE RZECZY, ŚCIEŻKA NAGRÓD I ZAŁOŻONE DODATKI (ramka, efekt wyrzucenia, skórka karty) - przeglądarka.
// Zasady liczy rewards.js (te same co serwer). Gość: postęp i nagrody w tej przeglądarce. Konto: nagrody losuje
// i zapisuje serwer ("path_claim"), zakupy przychodzą jako lista rzeczy ("account" / "shop_owned").
// Ładowany po app.js (korzysta z avatarCatalog, socket, ProfileStore).

const Inventory = (() => {
    const LOOK_KEY = 'look';
    let R = null;
    let unlocks = new Set();        // zakupy konta
    let look = loadLook();          // { kick, skin } - założone dodatki
    const listeners = new Set();

    function loadLook() {
        try {
            const saved = JSON.parse(localStorage.getItem(LOOK_KEY));
            if (saved && typeof saved === 'object') return { kick: saved.kick || null, skin: saved.skin || null };
        } catch (e) { /* brak zapisu */ }
        return { kick: null, skin: null };
    }
    function saveLook() {
        try { localStorage.setItem(LOOK_KEY, JSON.stringify(look)); } catch (e) { /* pełna pamięć */ }
    }
    function notify() { listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); }

    // Po wczytaniu katalogu awatarów (app.js: loadAvatarCatalog)
    function init() {
        if (!avatarCatalog || !avatarCatalog.rewards) return;
        const def = avatarCatalog.rewards;
        const style = avatarCatalog.styles[def.style];
        if (!style) return;
        R = Rewards.create(def, style.parts);
        dropUnowned();
        notify();
    }

    const ready = () => R !== null;
    const isAccount = () => ProfileStore.isAccount();
    function owned() {
        return R ? R.owned(ProfileStore.get(), isAccount() || unlocks.has('dev:all') ? unlocks : null) : new Set();
    }
    const has = item => owned().has(item);

    // Część awatara: można założyć? (inne zestawy niż ścieżka - zawsze)
    function canUsePart(styleId, slot, id) {
        return !R || R.canUsePart(styleId, slot, id, owned());
    }
    const partItem = (slot, id) => (R ? R.partItem(slot, id) : `part::${slot}:${id}`);

    // Skąd zdobyć rzecz: { level } | { random } | { shop } (rewards.js: source)
    const source = item => (R ? R.source(item) : {});
    const info = item => (R ? R.info(item) : { name: item, rarity: 'common' });

    // ===== DODATKI (efekt wyrzucenia / skórka karty) =====
    const getLook = () => ({ ...look });
    function setLook(kind, id) {
        look[kind] = id || null;
        saveLook();
        notify();
    }
    // Do pokoju idzie efekt wyrzucenia (skórkę karty widzi tylko właściciel)
    const lookToSend = () => ({ kick: look.kick || undefined });

    // Założone rzeczy, których gracz już nie ma (np. wylogowanie) - zdejmujemy
    // zdjęte dodatki pamiętamy - wracają, gdy przyjdzie lista zakupów (konto łączy się chwilę po starcie)
    const droppedLook = {};
    function dropUnowned() {
        if (!R) return;
        const have = owned();
        let changed = false;
        ['kick', 'skin'].forEach(kind => {
            if (!look[kind] && droppedLook[kind] && have.has(`${kind}:${droppedLook[kind]}`)) {
                look[kind] = droppedLook[kind]; delete droppedLook[kind]; changed = true;
            } else if (look[kind] && !have.has(`${kind}:${look[kind]}`)) {
                droppedLook[kind] = look[kind]; look[kind] = null; changed = true;
            }
        });
        if (changed) saveLook();
    }

    // ===== ŚCIEŻKA =====
    const unclaimed = () => (R ? R.unclaimed(ProfileStore.get()) : []);
    const rewardAt = level => (R ? R.rewardAt(level) : null);
    const claimedAt = level => ((ProfileStore.get().path || {}).claimed || {})[level];

    // Odebranie nagrody: konto - losuje serwer; gość - tutaj. Zwraca { item, random } albo { error }
    function claim(level) {
        if (!R) return Promise.resolve({ error: 'Chwila - wczytuję nagrody' });
        if (isAccount()) {
            return new Promise(resolve => {
                const done = data => {
                    if (data.level !== level) return;
                    socket.off('path_claimed', done);
                    if (data.path) ProfileStore.applyAccount({ path: data.path });
                    notify();
                    resolve(data);
                };
                socket.on('path_claimed', done);
                socket.emit('path_claim', level);
            });
        }
        let result;
        return ProfileStore.updateLocal(p => { result = R.claim(p, level, null); }).then(() => { notify(); return result; });
    }

    // Skrzynka: rozdanie kart -> { count, chest } i wybór karty -> { item, cards, index }. Konto - serwer, gość - tutaj.
    function askServer(event, reply, level, ...args) {
        return new Promise(resolve => {
            const done = data => {
                if (data.level !== level) return;
                socket.off(reply, done);
                if (data.path) ProfileStore.applyAccount({ path: data.path });
                notify();
                resolve(data);
            };
            socket.on(reply, done);
            socket.emit(event, level, ...args);
        });
    }
    function deal(level) {
        if (!R) return Promise.resolve({ error: 'Chwila - wczytuję nagrody' });
        if (isAccount()) return askServer('path_deal', 'path_dealt', level);
        let result;
        return ProfileStore.updateLocal(p => { result = R.dealCards(p, level, null); }).then(() => result);
    }
    function pick(level, index) {
        if (!R) return Promise.resolve({ error: 'Chwila - wczytuję nagrody' });
        if (isAccount()) return askServer('path_pick', 'path_claimed', level, index);
        let result;
        return ProfileStore.updateLocal(p => { result = R.pickCard(p, level, index, null); }).then(() => { notify(); return result; });
    }

    const trial = () => (R ? R.trialState(ProfileStore.get()) : { available: false, activeUntil: 0 });
    // Darmowy wieczór z Pakietem Hosta działa tylko na koncie (pokój sprawdza serwer)
    function startTrial() {
        if (!isAccount() || Auth.isAnonymous()) return false;
        socket.emit('path_trial');
        return true;
    }

    // ===== ZAKUPY =====
    function setUnlocks(list) {
        unlocks = new Set(Array.isArray(list) ? list : []);
        dropUnowned();
        if (typeof restoreStrippedParts === 'function' && avatarCatalog) restoreStrippedParts();
        notify();
    }
    const hasPack = pack => unlocks.has(pack) || unlocks.has('host');

    socket.on('shop_owned', list => setUnlocks(list));
    socket.on('path_trial_started', path => { ProfileStore.applyAccount({ path }); notify(); });
    socket.on('path_reset', path => { ProfileStore.applyAccount({ path }); notify(); });

    // DEWELOPER: ścieżka od nowa - konto przez serwer, gość u siebie
    const isDev = () => unlocks.has('dev:all');
    function devResetPath() {
        if (!isDev()) return;
        if (isAccount()) return socket.emit('dev_path_reset');
        ProfileStore.updateLocal(p => { p.path = { claimed: {}, extra: [], trialUntil: 0, trialsUsed: 0, deals: {} }; }).then(notify);
    }
    // wylogowanie: zakupy konta znikają z tej przeglądarki
    ProfileStore.onChange(() => {
        if (!ProfileStore.isAccount() && unlocks.size && !unlocks.has('dev:all')) unlocks = new Set();
        if (R) dropUnowned();
    });

    return {
        init, ready, owned, has, canUsePart, partItem, source, info,
        getLook, setLook, lookToSend,
        unclaimed, rewardAt, claimedAt, claim, deal, pick, trial, startTrial, isDev, devResetPath,
        setUnlocks, hasPack, unlocks: () => new Set(unlocks),
        kicks: () => (R ? R.kicks : {}), skins: () => (R ? R.skins : {}),
        pools: () => (R ? R.pools : {}), chests: () => (R ? R.chests : {}),     // ruletka skrzynki (path.js)
        onChange: fn => listeners.add(fn)
    };
})();
