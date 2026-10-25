'use strict';

// Wysyłka obrazków awatarów i katalogu części: Brotli/gzip i ETag, a gotowe (już skompresowane) odpowiedzi
// trzymamy w pamięci, bo te same awatary są pobierane w kółko przez wszystkich graczy pokoju -
// rysowanie i kompresja raz.

const zlib = require('zlib');
const crypto = require('crypto');
const { AVATAR_VERSION } = require('./version');

const MAX_CACHED = 3000;          // ok. 3000 × 3 wersje × ~1 kB - kilka MB pamięci
const cache = new Map();          // klucz -> { raw, br, gzip, etag } (Map pamięta kolejność - najstarszy wypada pierwszy)

// Metadane licencji i komentarz DiceBear to ok. 800 bajtów na każdym obrazku - przeglądarce nie są potrzebne
function slimSvg(svg) {
    return svg.replace(/<metadata[\s\S]*?<\/metadata>/, '').replace(/<!--[\s\S]*?-->/g, '');
}

function entryFor(key, render) {
    let entry = cache.get(key);
    if (entry) {
        cache.delete(key);        // świeżo użyty trafia na koniec kolejki
    } else {
        const raw = Buffer.from(render());
        entry = {
            raw,
            br: zlib.brotliCompressSync(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9 } }),
            gzip: zlib.gzipSync(raw, { level: 9 }),
            etag: `"${crypto.createHash('sha1').update(raw).digest('base64url').slice(0, 16)}"`
        };
        if (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value);
    }
    cache.set(key, entry);
    return entry;
}

// key opisuje odpowiedź (np. ścieżka + stan) - bez dowolnych dopisków z adresu, które zapychałyby pamięć.
// render() wołane tylko, gdy odpowiedzi nie ma jeszcze w pamięci
function sendCached(req, res, { key, type, cacheControl, render }) {
    const entry = entryFor(key, render);
    res.set({ 'Content-Type': type, 'Cache-Control': cacheControl, 'ETag': entry.etag, 'Vary': 'Accept-Encoding' });
    if (req.headers['if-none-match'] === entry.etag) return res.status(304).end();

    const accepts = req.headers['accept-encoding'] || '';
    const encoding = /\bbr\b/.test(accepts) ? 'br' : /\bgzip\b/.test(accepts) ? 'gzip' : null;
    if (encoding) res.set('Content-Encoding', encoding);
    res.end(encoding ? entry[encoding] : entry.raw);
}

// Długi cache tylko dla adresu z aktualną wersją awatarów - stary (lub bez wersji) mógłby utrwalić dawny wygląd
function sendSvg(req, res, key, cacheControl, render) {
    const current = req.query.v === AVATAR_VERSION;
    sendCached(req, res, { key, type: 'image/svg+xml', cacheControl: current ? cacheControl : 'no-cache', render: () => slimSvg(render()) });
}

module.exports = { sendSvg, sendCached };
