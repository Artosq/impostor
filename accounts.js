'use strict';

// KONTA GRACZY (Supabase) - jedyne miejsce, które rozmawia z bazą.
//
// - Logowanie: Supabase Auth. Przeglądarka ma konto anonimowe (tymczasowe, przypisane do urządzenia) albo stałe
//   (Google / link z e-maila) i przy łączeniu z grą wysyła swój token. Serwer sprawdza go publicznymi kluczami
//   Supabase (JWKS) - bez żadnego sekretu.
// - Postęp: liczy go serwer po każdej rundzie (te same zasady co u gościa: public/js/progress.js) - przeglądarka
//   nie ma jak go podrobić. Zapis do bazy idzie z opóźnieniem (kilka rund naraz = jedno zapytanie).
// - Baza: zwykły Postgres przez DATABASE_URL (pooler Supabase), trzymany tylko w ustawieniach serwera.
//   Tabele: supabase/schema.sql. Przeprowadzka na własny serwer = inny DATABASE_URL.
//
// Bez SUPABASE_URL i DATABASE_URL konta są wyłączone, a gra działa jak dotąd (postęp w przeglądarce).

const Core = require('./public/js/progress.js');
const Badges = require('./public/js/badges.js');
const { db } = require('./db');

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const DATABASE_URL = process.env.DATABASE_URL || '';
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET || '';     // tylko dla starszych projektów (klucz HS256); nowe mają JWKS
const enabled = Boolean(SUPABASE_URL && DATABASE_URL);

const SAVE_DELAY_MS = 3000;
const TIME_ZONE = 'Europe/Warsaw';           // godzina rundy do odznaki "Nocny marek"

let jose = null;
let keys = null;

// ===== TOKEN Z PRZEGLĄDARKI =====
async function verifyToken(token) {
    if (!jose) jose = await import('jose');
    if (!keys) keys = JWT_SECRET ? new TextEncoder().encode(JWT_SECRET)
        : jose.createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`));
    const { payload } = await jose.jwtVerify(token, keys, { issuer: `${SUPABASE_URL}/auth/v1`, audience: 'authenticated' });
    if (typeof payload.sub !== 'string') throw new Error('Token bez identyfikatora');
    return { id: payload.sub, isAnonymous: payload.is_anonymous === true, email: typeof payload.email === 'string' ? payload.email.toLowerCase() : null };
}

// ===== KONTA W PAMIĘCI =====
// Wczytane konto żyje, dopóki gracz ma połączenie (kilka kart = jedno konto).
const loaded = new Map();      // id -> { id, isAnonymous, profile, importedAt, sockets, saveTimer }

async function loadAccount(id) {
    // jedno zapytanie: nowe konto dostaje pusty profil, istniejące - świeży "ostatnio widziany"
    const { rows } = await db().query(
        `insert into public.profiles (id) values ($1)
         on conflict (id) do update set last_seen_at = now()
         returning data, level, exp, imported_at`, [id]);
    const row = rows[0];
    return {
        id,
        profile: Core.normalize({ ...row.data, level: row.level, exp: row.exp }),
        importedAt: row.imported_at,
        sockets: new Set(),
        saveTimer: null
    };
}

// Połączenie z kontem; zwraca konto albo null (zły albo przeterminowany token)
async function attach(socket, token) {
    let identity;
    try {
        identity = await verifyToken(token);
    } catch (err) {
        return null;        // przeterminowany token: przeglądarka odświeży go przy następnym połączeniu
    }
    if (!socket.connected) return null;
    let account = loaded.get(identity.id);
    if (!account) {
        account = await loadAccount(identity.id);
        // w trakcie wczytywania mogło się pojawić drugie połączenie tego samego konta
        account = loaded.get(identity.id) || account;
        loaded.set(identity.id, account);
    }
    account.isAnonymous = identity.isAnonymous;
    account.sockets.add(socket.id);
    socket.data.account = account;
    return account;
}

function detach(socket) {
    const account = socket.data.account;
    if (!account) return;
    account.sockets.delete(socket.id);
    socket.data.account = null;
    if (account.sockets.size === 0) {
        flush(account).finally(() => {
            if (account.sockets.size === 0 && loaded.get(account.id) === account) loaded.delete(account.id);
        });
    }
}

// ===== ZAPIS =====
function scheduleSave(account) {
    clearTimeout(account.saveTimer);
    account.saveTimer = setTimeout(() => flush(account), SAVE_DELAY_MS);
}

async function flush(account) {
    clearTimeout(account.saveTimer);
    account.saveTimer = null;
    const { level, exp, ...data } = account.profile;
    try {
        await db().query(
            `update public.profiles set data = $2, level = $3, exp = $4, updated_at = now(), last_seen_at = now() where id = $1`,
            [account.id, data, level, exp]);
    } catch (err) {
        console.error('Zapis profilu:', err.message);
    }
}

async function flushAll() {
    await Promise.all([...loaded.values()].map(flush));
}

function warsawHour(at) {
    return parseInt(new Intl.DateTimeFormat('pl-PL', { hour: 'numeric', hourCycle: 'h23', timeZone: TIME_ZONE }).format(at), 10);
}

// ===== RUNDA =====
// result: to, co gracz dostaje w "game_over"; zwraca to, co dopisujemy do tej wiadomości (EXP, odznaki, poziom)
function recordRound(account, result, myId, ctx) {
    const game = Core.gameRecord(result, myId, ctx);
    if (!game) return null;
    const profile = account.profile;
    const gainedExp = Core.expForGame(result, game.kicked);
    Core.applyGame(profile, game, warsawHour(game.at));
    const earned = Core.updateBadges(profile, Badges);
    Core.addExp(profile, gainedExp);
    scheduleSave(account);
    return { gainedExp, earned, level: profile.level, exp: profile.exp, unseenBadges: profile.unseenBadges };
}

// ===== PROŚBY PRZEGLĄDARKI =====
// Jednorazowe przeniesienie postępu gościa z przeglądarki (decyzja: wszystko, raz na konto).
// Dane są przycinane do rozsądnych wartości (progress.js: sanitize).
async function importGuest(account, localProfile) {
    if (account.importedAt) return false;
    const { rowCount } = await db().query(
        `update public.profiles set imported_at = now() where id = $1 and imported_at is null`, [account.id]);
    account.importedAt = new Date();
    if (rowCount === 0) return false;       // już przeniesione (np. w drugiej karcie)

    const seen = account.profile.unseenBadges;
    const merged = Core.mergeProfiles(account.profile, Core.sanitize(localProfile));
    Core.updateBadges(merged, Badges);
    merged.unseenBadges = seen;             // odznaki z przeglądarki gracz już widział
    account.profile = merged;
    await flush(account);
    return true;
}

// Gracz zalogował się na istniejące konto (np. Google z innego telefonu), a na tym urządzeniu miał konto gościa
// (tymczasowe). anonToken udowadnia, że konto gościa jest jego. Najpierw pokazujemy, co na nim jest
// (previewAnonymous), a gracz decyduje: dodać postęp do konta czy pominąć (mergeAnonymous, add = true / false).
// W obu przypadkach konto gościa jest potem usuwane.

async function findAnonymous(account, anonToken) {
    if (account.isAnonymous || typeof anonToken !== 'string' || anonToken.length > 4096) return null;
    let anon;
    try {
        anon = await verifyToken(anonToken);
    } catch (err) {
        return null;
    }
    if (!anon.isAnonymous || anon.id === account.id) return null;
    // konto gościa może być jeszcze wczytane (inna karta) - bierzemy najświeższy stan
    const cached = loaded.get(anon.id);
    if (cached) return { id: anon.id, cached, profile: cached.profile, importedAt: cached.importedAt };
    const { rows } = await db().query(`select data, level, exp, imported_at from public.profiles where id = $1`, [anon.id]);
    if (!rows.length) return { id: anon.id, profile: Core.emptyProfile(), importedAt: null };
    return { id: anon.id, profile: Core.normalize({ ...rows[0].data, level: rows[0].level, exp: rows[0].exp }), importedAt: rows[0].imported_at };
}

async function deleteAnonymous(anon) {
    const { rowCount } = await db().query(`delete from auth.users where id = $1 and is_anonymous`, [anon.id]);
    if (anon.cached) { clearTimeout(anon.cached.saveTimer); loaded.delete(anon.id); }
    return rowCount > 0;
}

const isEmptyProfile = profile => profile.stats.games === 0 && profile.level === 1 && profile.exp === 0;

// Co jest na koncie gościa. Bez pytania: puste konto gościa usuwamy (-> { empty: true }), a gdy konto, na które
// gracz się zalogował, jest puste (nowe konto Google), przenosimy postęp od razu (-> { merged: true }).
async function previewAnonymous(account, anonToken) {
    const anon = await findAnonymous(account, anonToken);
    if (!anon) return null;
    if (isEmptyProfile(anon.profile)) {
        await deleteAnonymous(anon);
        return { empty: true };
    }
    if (isEmptyProfile(account.profile)) {
        return (await mergeAnonymous(account, anonToken, true)) ? { merged: true } : null;
    }
    return {
        empty: false,
        level: anon.profile.level,
        games: anon.profile.stats.games,
        badges: Object.keys(anon.profile.badges).length
    };
}

async function mergeAnonymous(account, anonToken, add) {
    const anon = await findAnonymous(account, anonToken);
    if (!anon) return false;
    // usunięcie przed zapisem: drugie takie samo zgłoszenie (np. dwie karty) nie doda postępu dwa razy
    if (!(await deleteAnonymous(anon))) return false;
    if (!add) return true;

    const merged = Core.mergeProfiles(account.profile, anon.profile);
    Core.updateBadges(merged, Badges);
    account.profile = merged;
    if (anon.importedAt && !account.importedAt) {
        account.importedAt = anon.importedAt;
        await db().query(`update public.profiles set imported_at = $2 where id = $1 and imported_at is null`, [account.id, anon.importedAt]);
    }
    await flush(account);
    return true;
}

function markBadgesSeen(account) {
    if (!account.profile.unseenBadges.length) return;
    account.profile.unseenBadges = [];
    scheduleSave(account);
}

// Wyczyny zgłaszane przez przeglądarkę - tylko takie, na których nic nie zależy (uruchomienie z ikony)
const CLIENT_FEATS = new Set(['installed']);

function recordFeat(account, id) {
    if (!CLIENT_FEATS.has(id) || account.profile.feats[id]) return [];
    account.profile.feats[id] = Date.now();
    const earned = Core.updateBadges(account.profile, Badges);
    scheduleSave(account);
    return earned;
}

// Co przeglądarka dostaje po połączeniu z kontem
function welcome(account) {
    return { isAnonymous: account.isAnonymous, needsImport: !account.importedAt, profile: account.profile };
}

module.exports = {
    enabled, attach, detach, recordRound, importGuest, previewAnonymous, mergeAnonymous, markBadgesSeen, recordFeat, welcome, flushAll,
    // do testów
    verifyToken, loaded
};
