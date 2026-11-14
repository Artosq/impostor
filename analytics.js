'use strict';

// ANALITYKA - zdarzenia z gry do bazy (tabele: supabase/analytics.sql) i dane dla strony /analityka.
//
// - Anonimowo: zamiast identyfikatora gracza zapisujemy jego skrót (hash z sekretem) - nie da się z niego odczytać,
//   kto to był. Bez adresów IP i bez ciasteczek, więc nie trzeba banera zgody.
// - Tanio: zdarzenia czekają w pamięci i idą do bazy paczką co kilkanaście sekund (jedno zapytanie).
// - Zdarzenia: visit (wejście do gry), online (ilu graczy połączonych - co 5 min), room (nowy pokój),
//   round (zakończona runda), login (zalogowanie Google / mailem).
// - Dzienne podsumowania liczy baza (analytics_rollup, codziennie po północy i przy otwarciu strony analityki).
// - Stronę analityki widzi tylko admin: zalogowany w grze kontem, którego e-mail jest w ADMIN_EMAILS (Render).
//
// Bez DATABASE_URL analityka jest wyłączona - gra działa normalnie.

const crypto = require('crypto');
const { db, hasDatabase } = require('./db');

const enabled = hasDatabase && process.env.ANALYTICS !== 'off';
const FLUSH_MS = 15 * 1000;
const FLUSH_MAX = 300;                       // przy dużym ruchu zapis wcześniej
const VISIT_REPEAT_MS = 30 * 60 * 1000;      // ponowne wejście tej samej osoby liczy się dopiero po 30 min
const ONLINE_SAMPLE_MS = 5 * 60 * 1000;
const TIME_ZONE = 'Europe/Warsaw';
// sekret do skrótów: własny (ANALYTICS_SALT) albo wyprowadzony z hasła do bazy - i tak nigdy nie opuszcza serwera
const SALT = process.env.ANALYTICS_SALT || crypto.createHash('sha256').update('impostor:' + (process.env.DATABASE_URL || '')).digest('hex');
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

let buffer = [];
let flushTimer = null;
const lastVisit = new Map();      // skrót gracza -> kiedy ostatnio liczone wejście

function visitorOf(userId) {
    return typeof userId === 'string' && userId ? crypto.createHash('sha256').update(SALT + userId).digest('base64url').slice(0, 16) : null;
}

function warsawDay(at = new Date()) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

function track(type, userId, data = {}) {
    if (!enabled) return;
    buffer.push({ at: new Date(), type, visitor: visitorOf(userId), data });
    if (buffer.length >= FLUSH_MAX) flush();
    else if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_MS);
}

// Wejście do gry (pierwsze połączenie strony); powtórka tej samej osoby w ciągu 30 min się nie liczy
function visit(userId, data) {
    const visitor = visitorOf(userId);
    if (!enabled || !visitor) return;
    const now = Date.now();
    if (now - (lastVisit.get(visitor) || 0) < VISIT_REPEAT_MS) return;
    lastVisit.set(visitor, now);
    if (lastVisit.size > 50000) lastVisit.clear();       // bez puchnięcia pamięci
    track('visit', userId, data);
}

async function flush() {
    clearTimeout(flushTimer);
    flushTimer = null;
    if (!buffer.length) return;
    const batch = buffer;
    buffer = [];
    try {
        const values = [];
        const params = [];
        batch.forEach((e, i) => {
            values.push(`($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4})`);
            params.push(e.at, e.type, e.visitor, e.data);
        });
        await db().query(`insert into public.analytics_events (at, type, visitor, data) values ${values.join(',')}`, params);

        // kiedy odwiedzający był pierwszy i ostatni raz (nowi / powracający)
        const visitors = [...new Set(batch.filter(e => e.type === 'visit' && e.visitor).map(e => e.visitor))];
        if (visitors.length) {
            const day = warsawDay();
            await db().query(
                `insert into public.analytics_visitors (visitor, first_day, last_day)
                 select v, $2::date, $2::date from unnest($1::text[]) v
                 on conflict (visitor) do update set last_day = greatest(public.analytics_visitors.last_day, excluded.last_day)`,
                [visitors, day]);
        }
    } catch (err) {
        console.error('Analityka:', err.message);
    }
}

// Ilu graczy jest połączonych - próbka co 5 minut (szczyt dnia na wykresie)
function startOnlineSampling(countConnected) {
    if (!enabled) return;
    setInterval(() => track('online', null, { count: countConnected() }), ONLINE_SAMPLE_MS).unref();
}

// ===== STRONA ANALITYKI =====
function isAdmin(identity) {
    return Boolean(identity && !identity.isAnonymous && identity.email && ADMIN_EMAILS.includes(identity.email));
}

// Dzienne podsumowania z zakresu dat (dziś i wczoraj przeliczane na bieżąco)
async function report(from, to) {
    await flush();
    const today = warsawDay();
    const yesterday = warsawDay(new Date(Date.now() - 24 * 3600 * 1000));
    await db().query('select public.analytics_rollup($1::date)', [yesterday]);
    await db().query('select public.analytics_rollup($1::date)', [today]);
    const { rows } = await db().query(
        `select day::text as day, metric, key, value from public.analytics_daily where day between $1::date and $2::date order by day`,
        [from, to]);
    return { today, rows };
}

module.exports = { enabled, track, visit, flush, startOnlineSampling, isAdmin, report, visitorOf, warsawDay };
