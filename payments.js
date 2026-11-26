'use strict';

// SKLEP I PŁATNOŚCI (Stripe Checkout: BLIK, Przelewy24, karta).
//
// Jak to działa:
// 1. Zalogowany gracz (Google / e-mail - nie konto gościa) klika "Kup" -> POST /api/shop/checkout z tokenem.
// 2. Serwer tworzy w Stripe stronę płatności (Checkout Session) i odsyła jej adres - przeglądarka tam przechodzi.
// 3. Po opłaceniu Stripe woła POST /api/stripe/webhook (podpisane STRIPE_WEBHOOK_SECRET). Dopiero wtedy serwer
//    zapisuje zakup (purchases) i odblokowane rzeczy (unlocks) - przeglądarka nie ma jak tego podrobić.
// 4. Gracz online dostaje od razu "shop_owned" z nową listą rzeczy.
//
// Klucze tylko w ustawieniach serwera (Render -> Environment), nigdy w kodzie:
//   STRIPE_SECRET_KEY      - klucz tajny (sk_test_... do testów, sk_live_... na prawdziwe pieniądze)
//   STRIPE_WEBHOOK_SECRET  - sekret podpisu webhooka (whsec_...)
//   SHOP_TEST_PURCHASES=1  - tryb próbny BEZ Stripe: "Kup" od razu przyznaje rzecz (tylko do testów, nigdy na produkcji)
//
// Ceny w groszach. Rzeczy (item) to to, co trafia do tabeli unlocks; produkt może dać kilka rzeczy.

const crypto = require('crypto');
const { db } = require('./db');

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const TEST_PURCHASES = process.env.SHOP_TEST_PURCHASES === '1';
const WEBHOOK_TOLERANCE_S = 5 * 60;
// BLIK i Przelewy24 działają tylko w złotówkach; Stripe pokazuje z tej listy to, co ma włączone w panelu
const PAYMENT_METHODS = ['blik', 'p24', 'card'];

// Zestawy wyglądu: rzeczy, których nie ma na ścieżce (data/sciezka.json -> shopOnly)
const BUNDLES = {
    'bundle-maszyna': { name: 'Zestaw Maszyna', price: 999, items: ['part:bottts:eyes:cylon', 'part:bottts:mouth:equalizer', 'part:bottts:pattern:matrix', 'kick:explosion'] },
    'bundle-slodziak': { name: 'Zestaw Słodziak', price: 999, items: ['part:bottts:eyes:hearts', 'part:bottts:mouth:bubblegum', 'part:bottts:pattern:sparkles'] },
    'bundle-detektyw': { name: 'Zestaw Detektyw', price: 999, items: ['part:bottts:eyes:monocle', 'part:bottts:mouth:goldtooth', 'skin:noir'] },
    'bundle-kosmita': { name: 'Zestaw Kosmita', price: 999, items: ['part:bottts:eyes:alien', 'part:bottts:mouth:wave', 'part:bottts:pattern:craters'] },
    'bundle-zima': { name: 'Zestaw Zima', price: 999, items: ['part:bottts:eyes:snowflake', 'part:bottts:mouth:icicles', 'part:bottts:pattern:frost'] },
    'bundle-upior': { name: 'Zestaw Upiór', price: 999, items: ['part:bottts:eyes:ghost', 'part:bottts:mouth:stitches', 'part:bottts:pattern:cobweb'] }
};

// Ceny w groszach - najniższa 4,99 zł (przy mniejszych kwotach prowizja operatora zjada dużą część)
const PRODUCTS = {
    host: { name: 'Pakiet Hosta', price: 1999, items: ['host'] },
    supporter: { name: 'Wspierający', price: 999, items: ['supporter'] },
    'cat-movies': { name: 'Paczka haseł: Seriale', price: 499, items: ['cat:movies'] },
    'cat-poland': { name: 'Paczka haseł: Polska', price: 499, items: ['cat:poland'] },
    ...BUNDLES,
    komplet: { name: 'Komplet: Pakiet Hosta i wszystkie zestawy', price: 4499, items: ['host', ...Object.values(BUNDLES).flatMap(b => b.items)] }
};

function product(id) {
    return Object.hasOwn(PRODUCTS, id) ? PRODUCTS[id] : null;
}

const enabled = Boolean(STRIPE_SECRET_KEY && STRIPE_WEBHOOK_SECRET) || TEST_PURCHASES;

// ===== POSIADANIE =====
// Paczka kategorii: kupiona osobno albo w Pakiecie Hosta
function ownsCategoryPack(unlocks, pack) {
    return Boolean(unlocks) && (unlocks.has(pack) || unlocks.has('host'));
}

async function loadUnlocks(userId) {
    const { rows } = await db().query(`select item_id from public.unlocks where user_id = $1`, [userId]);
    return new Set(rows.map(r => r.item_id));
}

// Zapis zakupu i rzeczy - raz na transakcję (unique provider + provider_ref), drugi raz nic nie robi
async function grant(userId, productId, providerRef, amount, provider) {
    const prod = product(productId);
    if (!prod) throw new Error(`Nieznany produkt ${productId}`);
    const client = await db().connect();
    try {
        await client.query('begin');
        const { rowCount } = await client.query(
            `insert into public.purchases (user_id, provider, provider_ref, product, amount, currency, status)
             values ($1, $2, $3, $4, $5, 'PLN', 'paid') on conflict (provider, provider_ref) do nothing`,
            [userId, provider, providerRef, productId, amount]);
        if (rowCount) {
            for (const item of prod.items) {
                await client.query(
                    `insert into public.unlocks (user_id, item_id, source) values ($1, $2, 'purchase') on conflict do nothing`,
                    [userId, item]);
            }
        }
        await client.query('commit');
        return rowCount > 0;
    } catch (err) {
        await client.query('rollback');
        throw err;
    } finally {
        client.release();
    }
}

// ===== STRIPE =====
function form(obj, prefix = '', out = []) {
    for (const [key, value] of Object.entries(obj)) {
        const name = prefix ? `${prefix}[${key}]` : key;
        if (value !== null && typeof value === 'object') form(value, name, out);
        else out.push(`${encodeURIComponent(name)}=${encodeURIComponent(value)}`);
    }
    return out.join('&');
}

async function createCheckout(userId, productId, baseUrl) {
    const prod = product(productId);
    const body = {
        mode: 'payment',
        client_reference_id: userId,
        metadata: { user_id: userId, product: productId },
        payment_intent_data: { metadata: { user_id: userId, product: productId } },
        line_items: { 0: { quantity: 1, price_data: { currency: 'pln', unit_amount: prod.price, product_data: { name: prod.name } } } },
        payment_method_types: Object.fromEntries(PAYMENT_METHODS.map((m, i) => [i, m])),
        locale: 'pl',
        success_url: `${baseUrl}/?zakup=ok`,
        cancel_url: `${baseUrl}/?zakup=anulowano`
    };
    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`Stripe: ${data.error ? data.error.message : res.status}`);
    return data.url;
}

// Podpis webhooka: nagłówek "t=<czas>,v1=<hmac>"; hmac = SHA256(sekret, "<czas>.<surowe body>")
function verifySignature(rawBody, header) {
    if (!header) return false;
    const parts = Object.fromEntries(header.split(',').map(kv => kv.split('=')).filter(kv => kv.length === 2).map(([k, v]) => [k, v]));
    const timestamp = Number(parts.t);
    const signatures = header.split(',').filter(kv => kv.startsWith('v1=')).map(kv => kv.slice(3));
    if (!timestamp || !signatures.length || Math.abs(Date.now() / 1000 - timestamp) > WEBHOOK_TOLERANCE_S) return false;
    const expected = crypto.createHmac('sha256', STRIPE_WEBHOOK_SECRET).update(`${timestamp}.${rawBody}`).digest('hex');
    return signatures.some(sig => sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)));
}

// ===== ADRESY =====
// onGrant(userId) - serwer gry odsyła graczowi online nową listę rzeczy
function register(app, express, { verifyToken, onGrant }) {
    // Lista produktów dla sklepu w przeglądarce (ceny tylko stąd - przeglądarka ich nie ustala)
    app.get('/api/shop/catalog', (req, res) => {
        res.set('Cache-Control', 'no-cache');
        res.json({
            enabled, test: TEST_PURCHASES && !STRIPE_SECRET_KEY,
            products: Object.fromEntries(Object.entries(PRODUCTS).map(([id, p]) => [id, { name: p.name, price: p.price, items: p.items }]))
        });
    });

    app.post('/api/shop/checkout', express.json({ limit: '2kb' }), async (req, res) => {
        res.set('Cache-Control', 'no-store');
        if (!enabled) return res.status(503).json({ error: 'Płatności ruszą wkrótce' });
        const token = (req.get('authorization') || '').replace(/^Bearer /, '');
        let identity = null;
        try { identity = token ? await verifyToken(token) : null; } catch (e) { /* zły token */ }
        if (!identity) return res.status(401).json({ error: 'Zaloguj się, aby kupować' });
        if (identity.isAnonymous) return res.status(403).json({ error: 'login', message: 'Zakupy tylko po zalogowaniu (Google albo e-mail) - wtedy nie przepadną' });
        const productId = req.body && typeof req.body.product === 'string' ? req.body.product : '';
        const prod = product(productId);
        if (!prod) return res.status(400).json({ error: 'Nieznany produkt' });

        try {
            // tryb próbny: bez Stripe, od razu przyznane (tylko gdy SHOP_TEST_PURCHASES=1 i brak klucza Stripe)
            if (TEST_PURCHASES && !STRIPE_SECRET_KEY) {
                await grant(identity.id, productId, `test-${crypto.randomUUID()}`, 0, 'test');
                onGrant(identity.id);
                return res.json({ granted: true });
            }
            const base = `${req.get('x-forwarded-proto') || req.protocol}://${req.get('host')}`;
            res.json({ url: await createCheckout(identity.id, productId, base) });
        } catch (err) {
            console.error('Sklep (płatność):', err.message);
            res.status(502).json({ error: 'Nie udało się rozpocząć płatności - spróbuj za chwilę' });
        }
    });

    // Stripe potwierdza płatność; surowe body jest potrzebne do sprawdzenia podpisu
    app.post('/api/stripe/webhook', express.raw({ type: 'application/json', limit: '256kb' }), async (req, res) => {
        if (!STRIPE_WEBHOOK_SECRET) return res.sendStatus(503);
        const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
        if (!verifySignature(raw, req.get('stripe-signature'))) return res.sendStatus(400);
        let event;
        try { event = JSON.parse(raw); } catch (e) { return res.sendStatus(400); }

        // BLIK i karta: zapłacone od razu; Przelewy24 bywa potwierdzane później (async_payment_succeeded)
        const PAID = ['checkout.session.completed', 'checkout.session.async_payment_succeeded'];
        const session = event.data && event.data.object;
        if (PAID.includes(event.type) && session && session.payment_status === 'paid') {
            const userId = session.metadata && session.metadata.user_id;
            const productId = session.metadata && session.metadata.product;
            if (!userId || !product(productId)) {
                console.error('Sklep (webhook): brak gracza albo produktu w sesji', session.id);
                return res.sendStatus(200);       // nie ponawiać - i tak nie da się przypisać
            }
            try {
                await grant(userId, productId, session.id, session.amount_total || 0, 'stripe');
                onGrant(userId);
            } catch (err) {
                console.error('Sklep (zapis zakupu):', err.message);
                return res.sendStatus(500);       // Stripe ponowi
            }
        }
        res.sendStatus(200);
    });
}

module.exports = { enabled, register, ownsCategoryPack, loadUnlocks, product, PRODUCTS, TEST_PURCHASES };
