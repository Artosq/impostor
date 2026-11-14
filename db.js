'use strict';

// BAZA (Postgres w Supabase) - jedno wspólne połączenie dla kont (accounts.js) i analityki (analytics.js).
// Adres DATABASE_URL jest tylko w ustawieniach serwera (Render -> Environment), nigdy w kodzie.
// Darmowy plan Supabase ma ograniczoną liczbę połączeń - dlatego jedna pula dla całej gry.

const DATABASE_URL = process.env.DATABASE_URL || '';
let pool = null;

function db() {
    if (!pool) {
        const { Pool } = require('pg');
        pool = new Pool({
            connectionString: DATABASE_URL,
            max: Number(process.env.DATABASE_POOL_MAX) || 5,
            idleTimeoutMillis: 30000,
            // Supabase wymaga szyfrowanego połączenia; DATABASE_SSL=off dla bazy lokalnej
            ssl: process.env.DATABASE_SSL === 'off' ? false : { rejectUnauthorized: false }
        });
        pool.on('error', err => console.error('Baza:', err.message));
    }
    return pool;
}

module.exports = { db, hasDatabase: Boolean(DATABASE_URL) };
