// Sprawdzenie konfiguracji kont (Supabase) - nie wypisuje żadnych haseł ani kluczy.
//
// Uruchomienie (w głównym folderze gry, z plikiem .env zawierającym SUPABASE_URL, SUPABASE_ANON_KEY i DATABASE_URL):
//   node --env-file=.env narzedzia/sprawdz-supabase.js
//
// Uwaga: zakłada jedno konto anonimowe testowe i od razu je usuwa.

'use strict';

const { Pool } = require('pg');

const URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = process.env.SUPABASE_ANON_KEY || '';
const DB = process.env.DATABASE_URL || '';

let problems = 0;
const ok = (good, text, fix) => {
    console.log(`${good ? 'OK   ' : 'BŁĄD '} ${text}`);
    if (!good) { problems++; if (fix) console.log(`      -> ${fix}`); }
};

(async () => {
    console.log('== Zmienne ==');
    ok(/^https:\/\/[\w-]+\.supabase\.co$/.test(URL), 'SUPABASE_URL ma postać https://xxxx.supabase.co', 'Skopiuj "Project URL" z przycisku Connect (bez ukośnika na końcu)');
    ok(KEY.length > 20, 'SUPABASE_ANON_KEY jest ustawiony', 'Skopiuj klucz "anon" albo "publishable" (NIE service_role ani secret)');
    ok(!/service_role|sb_secret_/.test(KEY) && !/"role":"service_role"/.test(Buffer.from((KEY.split('.')[1] || ''), 'base64').toString()),
        'klucz nie jest kluczem administratora', 'To klucz tajny! Użyj klucza publicznego "anon"/"publishable"');
    ok(/^postgres(ql)?:\/\//.test(DB) && !DB.includes('[YOUR-PASSWORD]'), 'DATABASE_URL jest ustawiony (z hasłem)', 'Connect -> Transaction pooler; wpisz hasło w miejsce [YOUR-PASSWORD]');
    let host = '';
    try { host = new globalThis.URL(DB).hostname; } catch (e) { /* zły adres - zgłosi go połączenie */ }
    ok(host.endsWith('pooler.supabase.com'), 'DATABASE_URL to adres przez pooler (działa na Render)',
        /^db\./.test(host)
            ? 'Wpisany jest adres bezpośredni (db.xxx.supabase.co) - działa tylko przez IPv6, a Render ma tylko IPv4. Connect -> Method: "Transaction pooler"'
            : 'Connect -> Method: "Transaction pooler" (host kończy się na pooler.supabase.com, port 6543)');
    if (problems) return finish();

    console.log('\n== Logowanie (Supabase Auth) ==');
    try {
        const jwks = await (await fetch(`${URL}/auth/v1/.well-known/jwks.json`)).json();
        const keys = (jwks.keys || []).filter(k => k.alg !== 'HS256');
        ok(keys.length > 0, `klucze publiczne do sprawdzania logowania (${keys.map(k => k.alg).join(', ') || 'brak'})`,
            'Project Settings -> JWT Keys: potrzebny klucz ECC (P-256) albo RSA. Przy samym "Legacy JWT secret" napisz - jest drugi sposób');
    } catch (err) {
        ok(false, 'pobranie kluczy publicznych: ' + err.message);
    }

    let testUser = null;
    try {
        const response = await fetch(`${URL}/auth/v1/signup`, {
            method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: '{}'
        });
        const data = await response.json().catch(() => ({}));
        testUser = data.user && data.user.id;
        ok(response.ok && data.user && data.user.is_anonymous, 'zakładanie konta anonimowego',
            response.status === 401 || response.status === 403 ? 'Zły klucz SUPABASE_ANON_KEY'
                : 'Authentication -> Sign In / Providers -> włącz "Allow anonymous sign-ins"' + (data.msg ? ` (Supabase: ${data.msg})` : ''));
    } catch (err) {
        ok(false, 'zakładanie konta anonimowego: ' + err.message);
    }

    console.log('\n== Baza ==');
    const pool = new Pool({ connectionString: DB, ssl: { rejectUnauthorized: false }, max: 1 });
    try {
        await pool.query('select 1');
        ok(true, 'połączenie z bazą');
        const { rows: tables } = await pool.query(
            `select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relname = any($1)`, [['profiles', 'custom_categories', 'purchases', 'unlocks']]);
        ok(tables.length === 4, `tabele gry (${tables.length}/4)`, 'SQL Editor -> wklej supabase/schema.sql -> Run');
        ok(tables.length === 4 && tables.every(t => t.relrowsecurity), 'RLS włączone na wszystkich tabelach', 'Uruchom ponownie supabase/schema.sql');
        const { rows: policies } = await pool.query(`select count(*)::int n from pg_policies where schemaname = 'public'`);
        ok(policies[0].n === 0, 'brak reguł dostępu dla przeglądarki (tylko serwer gry)', 'Usuń reguły (policies) z tabel w schemacie public');
        try {
            const { rows: jobs } = await pool.query(`select schedule from cron.job where jobname = 'impostor-porzucone-konta'`);
            ok(jobs.length === 1, 'codzienne sprzątanie porzuconych kont (pg_cron)', 'Database -> Extensions -> włącz pg_cron, potem uruchom ponownie schema.sql');
        } catch (err) {
            ok(false, 'codzienne sprzątanie porzuconych kont (pg_cron)', 'Database -> Extensions -> włącz pg_cron, potem uruchom ponownie schema.sql');
        }
        if (testUser) {
            await pool.query('delete from auth.users where id = $1', [testUser]);
            console.log('      (testowe konto anonimowe usunięte)');
        }
    } catch (err) {
        ok(false, 'połączenie z bazą: ' + err.message.replace(DB, '***'),
            /password/i.test(err.message) ? 'Złe hasło w DATABASE_URL (Project Settings -> Database -> Reset password, jeśli nie pamiętasz)' : 'Sprawdź DATABASE_URL');
    } finally {
        await pool.end();
    }
    finish();
})();

function finish() {
    console.log(problems ? `\nDo poprawienia: ${problems}` : '\nWszystko gotowe - konta mogą działać. Te same trzy zmienne wpisz w Render (Environment).');
    process.exit(problems ? 1 : 0);
}
