// ŚCIEŻKA NAGRÓD I POSIADANE RZECZY - wspólna logika przeglądarki (gość) i serwera (konto, accounts.js).
// Dane: data/sciezka.json (co jest od razu, co na którym poziomie, co tylko w sklepie).
//
// Rzecz (item) ma id:  part:<zestaw>:<slot>:<id>  frame:<id>  kick:<id>  skin:<id>  host  supporter  cat:<paczka>  host-trial
// Posiadane = zestaw startowy + odebrane nagrody ze ścieżki (profile.path.claimed) + zakupy (tabela unlocks).
// Skrzynka przy odebraniu losuje rzadkość (szanse: sciezka.json chests), potem rzecz z tej puli, bez rzeczy, które gracz już ma.

(function (root) {
    'use strict';

    const RARITIES = ['common', 'rare', 'epic', 'legendary'];
    const TRIAL_MS = 24 * 60 * 60 * 1000;       // darmowy wieczór z Pakietem Hosta
    const DEAL_SIZE = 5;                        // kart w rozdaniu skrzynki

    function create(def, catalogParts) {
        const style = def.style;
        const partItem = (slot, id) => `part:${style}:${slot}:${id}`;
        const rarity = {};          // item -> rzadkość
        const slots = Object.keys(catalogParts);
        slots.forEach(slot => catalogParts[slot].forEach(p => { rarity[partItem(slot, p.id)] = p.rarity || 'common'; }));
        ['kicks', 'skins'].forEach(group => Object.entries(def[group] || {}).forEach(([id, x]) => { rarity[`${group.slice(0, -1)}:${id}`] = x.rarity; }));

        const starter = new Set(Object.entries(def.starter).flatMap(([slot, ids]) => ids.map(id => partItem(slot, id))));
        const shopOnly = new Set(def.shopOnly);

        // Skrzynka = 5 kart (sciezka.json: chests). Co najmniej 3 karty mają rzadkość skrzynki (base); jedna jest lepsza
        // (bonus), z szansą extraBonus% są dwie lepsze; lepsza karta z szansą jackpot% jest jeszcze o stopień wyżej (jackpotRarity).
        const CHEST_DEF = def.chests || {};
        const chestDef = tier => CHEST_DEF[tier] || { base: tier };
        // Szanse na rzadkość wybranej karty (karty są zakryte - tyle samo dla każdej) - do paska szans
        function chestOdds(tier) {
            const c = chestDef(tier);
            if (!c.bonus) return { [c.base]: 100 };
            const bonusShare = (1 + (c.extraBonus || 0) / 100) / DEAL_SIZE * 100;
            const jackpot = c.jackpotRarity ? bonusShare * (c.jackpot || 0) / 100 : 0;
            const odds = { [c.base]: 100 - bonusShare, [c.bonus]: bonusShare - jackpot };
            if (jackpot) odds[c.jackpotRarity] = jackpot;
            return Object.fromEntries(Object.entries(odds).map(([r, p]) => [r, Math.round(p * 10) / 10]));
        }
        const CHESTS = Object.fromEntries(RARITIES.map(r => [r, chestOdds(r)]));
        const chest = tier => ({ random: [tier], chest: tier, odds: CHESTS[tier] });

        // Rzadkości kart w rozdaniu (w losowej kolejności - karty są zakryte)
        function dealRarities(tier, rnd) {
            const c = chestDef(tier);
            const list = Array(DEAL_SIZE).fill(c.base);
            if (c.bonus) {
                const bonusCards = 1 + (rnd() * 100 < (c.extraBonus || 0) ? 1 : 0);
                for (let i = 0; i < bonusCards; i++) list[DEAL_SIZE - 1 - i] = c.jackpotRarity && rnd() * 100 < (c.jackpot || 0) ? c.jackpotRarity : c.bonus;
            }
            for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)) % (i + 1); [list[i], list[j]] = [list[j], list[i]]; }
            return list;
        }

        // nagroda poziomu w jednej postaci: { item } | { random: [rzadkość skrzynki], chest, odds } | { hostTrial: true }
        function rewardAt(level) {
            if (level < 2) return null;
            const r = def.path[level];
            if (r) {
                if (r.part) { const [slot, id] = r.part.split(':'); return { item: partItem(slot, id) }; }
                if (r.frame) return { item: `frame:${r.frame}` };
                if (r.kick) return { item: `kick:${r.kick}` };
                if (r.skin) return { item: `skin:${r.skin}` };
                if (r.hostTrial) return { hostTrial: true };
                if (r.random) return chest(r.random);
            }
            // po końcu ścieżki: co 10 darmowy wieczór, co 5 złota skrzynka, na przemian epicka / rzadka
            const a = def.afterPath;
            const next = level % 10 === 0 ? a.every10 : level % 5 === 0 ? a.every5 : level % 2 ? a.odd : a.even;
            return next === 'hostTrial' ? { hostTrial: true } : chest(next);
        }

        // Gdy w puli danej rzadkości nic już nie ma - najpierw lepsze, potem gorsze
        function rarityOrder(rarity) {
            const i = RARITIES.indexOf(rarity);
            return [rarity, ...RARITIES.slice(i + 1), ...RARITIES.slice(0, i).reverse()];
        }

        // Losowe pule: części poza zestawem startowym, poza sklepem i poza nagrodami "wiadomo jakimi"
        const known = new Set(Object.keys(def.path).map(l => rewardAt(Number(l))).filter(r => r && r.item).map(r => r.item));
        const pools = Object.fromEntries(RARITIES.map(r => [r, []]));
        slots.forEach(slot => catalogParts[slot].forEach(p => {
            const it = partItem(slot, p.id);
            if (!starter.has(it) && !shopOnly.has(it) && !known.has(it)) pools[p.rarity || 'common'].push(it);
        }));
        const lastPathLevel = Math.max(...Object.keys(def.path).map(Number));
        const levelOfItem = {};      // rzecz "wiadomo jaka" -> poziom ścieżki
        Object.keys(def.path).forEach(l => { const r = rewardAt(Number(l)); if (r && r.item) levelOfItem[r.item] = Number(l); });
        const pooled = new Set(Object.values(pools).flat());

        // Skąd zdobyć rzecz, której gracz nie ma: { level } - konkretny poziom, { random } - losowo ze ścieżki, { shop } - sklep
        function source(item) {
            if (starter.has(item)) return { starter: true };
            if (shopOnly.has(item)) return { shop: true };
            if (levelOfItem[item]) return { level: levelOfItem[item] };
            if (pooled.has(item)) return { random: rarity[item] || 'common' };
            return {};
        }

        function info(item) {
            const [kind, a, b, c] = item.split(':');
            if (kind === 'part') return { kind, slot: b, id: c, rarity: rarity[item] || 'common', name: partName(b, c) };
            if (kind === 'kick' || kind === 'skin') {
                const x = (def[kind + 's'] || {})[a] || {};
                return { kind, id: a, rarity: x.rarity || 'rare', name: x.name || a };
            }
            if (item === 'host-trial') return { kind: 'hostTrial', rarity: 'legendary', name: 'Wieczór z Pakietem Hosta' };
            return { kind, id: a, rarity: 'legendary', name: item };
        }
        const SLOT_NAMES = { eyes: 'Oczy', mouth: 'Buzia', pattern: 'Wzór', background: 'Tło' };
        function partName(slot, id) {
            const names = def.names[slot] || {};
            const list = catalogParts[slot] || [];
            const p = list.find(x => x.id === id);
            const name = names[id] || (p && p.name && p.name !== id ? p.name : null) || (slot === 'background' ? 'Kolor' : id);
            return `${SLOT_NAMES[slot] || slot}: ${name}`;
        }

        function pathOf(profile) {
            if (!profile.path || typeof profile.path !== 'object') profile.path = { claimed: {} };
            if (!profile.path.claimed || typeof profile.path.claimed !== 'object') profile.path.claimed = {};
            return profile.path;
        }

        // purchased: Set rzeczy z zakupów (konto) - "host" daje też wszystkie paczki kategorii
        function owned(profile, purchased) {
            const set = new Set(starter);
            const path = pathOf(profile);
            [...Object.values(path.claimed), ...(Array.isArray(path.extra) ? path.extra : [])]
                .forEach(it => { if (it && it !== 'none' && it !== 'host-trial') set.add(it); });
            if (purchased) purchased.forEach(it => set.add(it));
            if (set.has('dev:all')) Object.keys(rarity).forEach(it => set.add(it));     // deweloper: wszystko
            return set;
        }

        // Poziomy z nagrodą do odebrania (osiągnięte, nieodebrane)
        function unclaimed(profile) {
            const claimed = pathOf(profile).claimed;
            const out = [];
            for (let l = 2; l <= profile.level; l++) if (!Object.hasOwn(claimed, l)) out.push(l);
            return out;
        }

        // Odebranie nagrody poziomu. rnd - losowanie (serwer: crypto, gość: Math.random). Zwraca { item } albo { error }
        function claim(profile, level, purchased, rnd = Math.random, now = Date.now()) {
            level = Number(level);
            if (!Number.isInteger(level) || level < 2 || level > profile.level) return { error: 'Ten poziom jeszcze przed Tobą' };
            const path = pathOf(profile);
            if (Object.hasOwn(path.claimed, level)) return { error: 'Nagroda już odebrana' };
            const reward = rewardAt(level);
            // skrzynka bez wyboru karty (np. starsza wersja gry) - pierwsza karta z rozdania
            if (reward.random) return pickCard(profile, level, 0, purchased, rnd);
            const item = reward.hostTrial ? 'host-trial' : reward.item;
            path.claimed[level] = item || 'none';
            return { item: item || 'none', random: false, chest: null };
        }

        // Jedna losowa rzecz danej rzadkości: najpierw losowa zakładka (oczy / buzia / wzór / tło), potem część z niej -
        // inaczej przeważałyby tła, których rzadkich jest najwięcej. Bez rzeczy posiadanych i już wylosowanych.
        function drawRandom(rarity, have, used, rnd) {
            const pick = list => list[Math.floor(rnd() * list.length) % list.length];
            for (const r of rarityOrder(rarity)) {
                const free = pools[r].filter(it => !have.has(it) && !used.has(it));
                if (!free.length) continue;
                const bySlot = {};
                free.forEach(it => { const slot = it.split(':')[2]; (bySlot[slot] = bySlot[slot] || []).push(it); });
                return pick(bySlot[pick(Object.keys(bySlot))]);
            }
            return null;
        }

        // SKRZYNKA = ROZDANIE KART. Każda karta to osobno wylosowana rzecz; gracz wybiera jedną i dostaje dokładnie ją.
        // Rozdanie zapisuje się w profilu (path.deals) - odświeżenie strony nie losuje od nowa.
        // Przeglądarka konta dostaje tylko liczbę kart; zawartość wszystkich widać dopiero po wyborze.
        function dealCards(profile, level, purchased, rnd = Math.random) {
            level = Number(level);
            if (!Number.isInteger(level) || level < 2 || level > profile.level) return { error: 'Ten poziom jeszcze przed Tobą' };
            const path = pathOf(profile);
            if (Object.hasOwn(path.claimed, level)) return { error: 'Nagroda już odebrana' };
            const reward = rewardAt(level);
            if (!reward.random) return { error: 'Na tym poziomie nie ma skrzynki' };
            if (!path.deals || typeof path.deals !== 'object') path.deals = {};
            if (!Array.isArray(path.deals[level]) || !path.deals[level].length) {
                const have = owned(profile, purchased);
                const used = new Set();
                const cards = [];
                for (const rarity of dealRarities(reward.chest, rnd)) {
                    const it = drawRandom(rarity, have, used, rnd);
                    if (it) used.add(it);
                    cards.push(it || 'none');       // "none" - wszystko już zebrane
                }
                path.deals[level] = cards;
            }
            return { level, count: path.deals[level].length, chest: reward.chest };
        }
        function pickCard(profile, level, index, purchased, rnd = Math.random) {
            const dealt = dealCards(profile, level, purchased, rnd);
            if (dealt.error) return dealt;
            const path = pathOf(profile);
            const cards = path.deals[dealt.level];
            index = Number(index);
            if (!Number.isInteger(index) || index < 0 || index >= cards.length) return { error: 'Nie ma takiej karty' };
            const item = cards[index];
            path.claimed[dealt.level] = item;
            delete path.deals[dealt.level];
            return { item, random: true, chest: dealt.chest, cards, index };
        }

        // Darmowe wieczory z Pakietem Hosta to kupony: każdy odebrany czeka, aż gracz go włączy (24 h).
        // trialsUsed - ile już włączono (starszy profil: sam trialUntil = 1 użyty)
        function trialState(profile, now = Date.now()) {
            const path = pathOf(profile);
            const total = [...Object.values(path.claimed), ...(Array.isArray(path.extra) ? path.extra : [])].filter(it => it === 'host-trial').length;
            const used = Math.max(Number(path.trialsUsed) || 0, path.trialUntil ? 1 : 0);
            const activeUntil = path.trialUntil && path.trialUntil > now ? path.trialUntil : 0;
            const left = Math.max(0, total - used);
            return { available: left > 0 && !activeUntil, left, activeUntil, used };
        }
        function startTrial(profile, now = Date.now()) {
            const st = trialState(profile, now);
            if (!st.available) return false;
            const path = pathOf(profile);
            path.trialsUsed = st.used + 1;
            path.trialUntil = now + TRIAL_MS;
            return true;
        }

        // Czy część może być założona: konto - tylko posiadane; zestawy spoza ścieżki (inny styl) - zawsze
        function canUsePart(styleId, slot, id, have) {
            if (styleId !== style) return true;
            const it = `part:${styleId}:${slot}:${id}`;
            if (!Object.hasOwn(rarity, it)) return true;        // spoza katalogu (np. dowolny kolor) - sprawdza clean()
            return have.has(it);
        }

        return {
            style, partItem, rewardAt, info, owned, source, unclaimed, claim, dealCards, pickCard, trialState, startTrial, canUsePart,
            isShopOnly: item => shopOnly.has(item), isStarter: item => starter.has(item), lastPathLevel, rarityOf: item => rarity[item] || null,
            kicks: def.kicks || {}, skins: def.skins || {}, pools, chests: CHESTS
        };
    }

    const api = { create, RARITIES, TRIAL_MS };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.Rewards = api;
})(typeof window !== 'undefined' ? window : globalThis);
