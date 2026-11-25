// ŚCIEŻKA NAGRÓD I POSIADANE RZECZY - wspólna logika przeglądarki (gość) i serwera (konto, accounts.js).
// Dane: data/sciezka.json (co jest od razu, co na którym poziomie, co tylko w sklepie).
//
// Rzecz (item) ma id:  part:<zestaw>:<slot>:<id>  frame:<id>  kick:<id>  skin:<id>  host  supporter  cat:<paczka>  host-trial
// Posiadane = zestaw startowy + odebrane nagrody ze ścieżki (profile.path.claimed) + zakupy (tabela unlocks).
// Losowa nagroda wypada przy odebraniu: z puli danej rzadkości, bez rzeczy, które gracz już ma.

(function (root) {
    'use strict';

    const RARITIES = ['common', 'rare', 'epic', 'legendary'];
    const TRIAL_MS = 24 * 60 * 60 * 1000;       // darmowy wieczór z Pakietem Hosta

    function create(def, catalogParts) {
        const style = def.style;
        const partItem = (slot, id) => `part:${style}:${slot}:${id}`;
        const rarity = {};          // item -> rzadkość
        const slots = Object.keys(catalogParts);
        slots.forEach(slot => catalogParts[slot].forEach(p => { rarity[partItem(slot, p.id)] = p.rarity || 'common'; }));
        ['kicks', 'skins'].forEach(group => Object.entries(def[group] || {}).forEach(([id, x]) => { rarity[`${group.slice(0, -1)}:${id}`] = x.rarity; }));

        const starter = new Set(Object.entries(def.starter).flatMap(([slot, ids]) => ids.map(id => partItem(slot, id))));
        const shopOnly = new Set(def.shopOnly);

        // nagroda poziomu w jednej postaci: { item } | { random: [rzadkości po kolei] } | { hostTrial: true }
        function rewardAt(level) {
            if (level < 2) return null;
            const r = def.path[level];
            if (r) {
                if (r.part) { const [slot, id] = r.part.split(':'); return { item: partItem(slot, id) }; }
                if (r.frame) return { item: `frame:${r.frame}` };
                if (r.kick) return { item: `kick:${r.kick}` };
                if (r.skin) return { item: `skin:${r.skin}` };
                if (r.hostTrial) return { hostTrial: true };
                if (r.random) return { random: [r.random, ...RARITIES.filter(x => x !== r.random)] };
            }
            const a = def.afterPath;
            return { random: level % 10 === 0 ? a.every10 : level % 5 === 0 ? a.every5 : level % 2 ? a.odd : a.even };
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
            const have = owned(profile, purchased);
            let item = null;
            if (reward.hostTrial) {
                item = 'host-trial';
            } else if (reward.item) {
                item = reward.item;
            } else {
                // najpierw losowa zakładka (oczy / buzia / wzór / tło), potem część z niej - inaczej
                // przeważałyby tła, których rzadkich jest najwięcej
                const pick = list => list[Math.floor(rnd() * list.length) % list.length];
                for (const r of reward.random) {
                    const free = pools[r].filter(it => !have.has(it));
                    if (!free.length) continue;
                    const bySlot = {};
                    free.forEach(it => { const slot = it.split(':')[2]; (bySlot[slot] = bySlot[slot] || []).push(it); });
                    item = pick(bySlot[pick(Object.keys(bySlot))]);
                    break;
                }
            }
            path.claimed[level] = item || 'none';      // "none" - wszystko już zebrane
            return { item: item || 'none', random: Boolean(reward.random) };
        }

        // Darmowy wieczór: odebrany, a jeszcze nieużyty -> włączenie na 24 h
        function trialState(profile, now = Date.now()) {
            const path = pathOf(profile);
            const has = [...Object.values(path.claimed), ...(Array.isArray(path.extra) ? path.extra : [])].includes('host-trial');
            return { available: has && !path.trialUntil, activeUntil: path.trialUntil && path.trialUntil > now ? path.trialUntil : 0, used: Boolean(path.trialUntil) };
        }
        function startTrial(profile, now = Date.now()) {
            const st = trialState(profile, now);
            if (!st.available) return false;
            pathOf(profile).trialUntil = now + TRIAL_MS;
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
            style, partItem, rewardAt, info, owned, source, unclaimed, claim, trialState, startTrial, canUsePart,
            isShopOnly: item => shopOnly.has(item), isStarter: item => starter.has(item), lastPathLevel, rarityOf: item => rarity[item] || null,
            kicks: def.kicks || {}, skins: def.skins || {}, pools
        };
    }

    const api = { create, RARITIES, TRIAL_MS };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.Rewards = api;
})(typeof window !== 'undefined' ? window : globalThis);
