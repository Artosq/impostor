'use strict';

// PLIKI STATYCZNE (public/) - szybciej niż zwykłe express.static:
// - kompresja Brotli i gzip liczona raz, przy pierwszym użyciu pliku, a nie przy każdym żądaniu,
// - index.html dostaje do adresów skryptów, stylów i obrazków odcisk zawartości (?v=abc123),
//   więc przeglądarka trzyma je w pamięci przez rok i przy kolejnym wejściu nie pyta o nic serwera.
//   Zmiana pliku = nowy odcisk = gracze od razu dostają nową wersję.
// - fonty (wołane z CSS bez odcisku) są trzymane 30 dni, reszta jest sprawdzana przez ETag,
// - style z <link rel="stylesheet"> są wklejane prosto do index.html: strona rysuje się bez czekania
//   na osobne pliki CSS (index.html i tak jest sprawdzany ETagiem, więc przy kolejnym wejściu nic nie idzie),
// - %SITE_URL% w stronie, robots.txt i sitemap.xml zamienia się na publiczny adres gry (adres kanoniczny, podgląd linku).
// Poza Renderem (lokalnie) zmieniony plik jest wczytywany od nowa bez restartu serwera.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const PUBLIC_DIR = path.join(__dirname, 'public');
const WATCH_FILES = !process.env.RENDER && process.env.NODE_ENV !== 'production';
const SITE_URL = (process.env.SITE_URL || process.env.RENDER_EXTERNAL_URL || 'https://impostor-3uk0.onrender.com').replace(/\/+$/, '');

// Pliki spoza public/ podawane pod własnym adresem
const EXTRA_FILES = {
    '/vendor/socket.io.min.js': path.join(path.dirname(require.resolve('socket.io')), '..', 'client-dist', 'socket.io.min.js'),
    '/vendor/qrcode.js': require.resolve('qrcode-generator'),      // kody QR w oknie zaproszenia (MIT)
    '/vendor/jsqr.js': require.resolve('jsqr'),                    // skaner QR tam, gdzie przeglądarka nie ma własnego (Apache-2.0)
    '/favicon.ico': path.join(PUBLIC_DIR, 'icons', 'favicon-32.png')   // przeglądarki i Google pytają o ten adres same
};

const TYPES = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8',
    '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
    '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.xml': 'application/xml; charset=utf-8'
};
const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.json', '.svg', '.txt', '.webmanifest', '.xml']);
const WITH_SITE_URL = new Set(['.html', '.txt', '.xml']);
const YEAR = 'public, max-age=31536000, immutable';
const MONTH = 'public, max-age=2592000';
const REVALIDATE = 'no-cache';

const cache = new Map();    // adres -> { file, mtime, type, hash, raw, br, gzip }

function fileFor(urlPath) {
    if (Object.hasOwn(EXTRA_FILES, urlPath)) return EXTRA_FILES[urlPath];
    let decoded;
    try { decoded = decodeURIComponent(urlPath === '/' ? '/index.html' : urlPath); } catch (e) { return null; }
    const file = path.join(PUBLIC_DIR, decoded);
    // nie wychodzimy poza public/
    return file.startsWith(PUBLIC_DIR + path.sep) ? file : null;
}

function build(urlPath, file, stat) {
    const ext = path.extname(file).toLowerCase();
    let raw = fs.readFileSync(file);
    if (ext === '.html') raw = Buffer.from(inlineStyles(addVersions(raw.toString('utf8'))));
    if (WITH_SITE_URL.has(ext)) raw = Buffer.from(raw.toString('utf8').replaceAll('%SITE_URL%', SITE_URL));
    const entry = {
        file, mtime: stat.mtimeMs, type: TYPES[ext] || 'application/octet-stream',
        hash: crypto.createHash('sha1').update(raw).digest('hex').slice(0, 10), raw,
        compressible: COMPRESSIBLE.has(ext) && raw.length > 1024
    };
    cache.set(urlPath, entry);
    return entry;
}

function load(urlPath) {
    const file = fileFor(urlPath);
    if (!file) return null;
    const known = cache.get(urlPath);
    if (known && !WATCH_FILES) return known;
    let stat;
    try { stat = fs.statSync(file); } catch (e) { return null; }
    if (!stat.isFile()) return null;
    // strona zależy od odcisków innych plików, więc lokalnie budujemy ją za każdym razem
    const fresh = known && known.mtime === stat.mtimeMs && !known.type.startsWith('text/html');
    return fresh ? known : build(urlPath, file, stat);
}

// Adresy lokalne w index.html dostają odcisk zawartości pliku
function addVersions(html) {
    return html.replace(/(src|href|srcset)="([^"?#:]+\.(?:js|css|png|webp|json))"/g, (match, attr, url) => {
        const target = load('/' + url.replace(/^\//, ''));
        return target ? `${attr}="${url}?v=${target.hash}"` : match;
    });
}

// <link rel="stylesheet" href="css/x.css?v=..."> -> <style>treść</style>.
// Względne adresy w CSS (np. ../fonts/) były liczone od css/, teraz liczą się od strony.
function inlineStyles(html) {
    return html.replace(/<link rel="stylesheet" href="([^"?#:]+\.css)(?:\?v=\w+)?">/g, (match, url) => {
        const urlPath = '/' + url.replace(/^\//, '');
        const file = fileFor(urlPath);
        let css;
        try { css = fs.readFileSync(file, 'utf8'); } catch (e) { return match; }
        const base = path.posix.dirname(urlPath);
        css = css.replace(/url\((['"]?)(?![a-z]+:|#|\/)([^'")]+)\1\)/g,
            (m, quote, ref) => `url(${quote}${path.posix.join(base, ref).slice(1)}${quote})`);
        return `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>`;
    });
}

function compressed(entry, encoding) {
    if (!entry[encoding]) {
        entry[encoding] = encoding === 'br'
            ? zlib.brotliCompressSync(entry.raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } })
            : zlib.gzipSync(entry.raw, { level: 9 });
    }
    return entry[encoding];
}

function serve(req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const entry = load(req.path);
    if (!entry) return next();

    const isPage = entry.type.startsWith('text/html');
    const etag = `"${entry.hash}"`;
    res.set({
        'Content-Type': entry.type,
        'ETag': etag,
        'Vary': 'Accept-Encoding',
        'Cache-Control': isPage ? REVALIDATE : req.query.v === entry.hash ? YEAR : entry.type === 'font/woff2' ? MONTH : REVALIDATE
    });
    if (req.headers['if-none-match'] === etag) return res.status(304).end();

    let body = entry.raw;
    if (entry.compressible) {
        const accepts = req.headers['accept-encoding'] || '';
        const encoding = /\bbr\b/.test(accepts) ? 'br' : /\bgzip\b/.test(accepts) ? 'gzip' : null;
        if (encoding) {
            body = compressed(entry, encoding);
            res.set('Content-Encoding', encoding);
        }
    }
    res.set('Content-Length', body.length);
    return req.method === 'HEAD' ? res.end() : res.end(body);
}

// Na produkcji kompresujemy wszystko od razu przy starcie, żeby pierwszy gracz nie czekał
function warmUp() {
    const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(item =>
        item.isDirectory() ? walk(path.join(dir, item.name)) : [path.join(dir, item.name)]);
    const urls = [...walk(PUBLIC_DIR).map(file => '/' + path.relative(PUBLIC_DIR, file).split(path.sep).join('/')), ...Object.keys(EXTRA_FILES)];
    urls.forEach(url => {
        const entry = load(url);
        if (entry && entry.compressible) { compressed(entry, 'br'); compressed(entry, 'gzip'); }
    });
}

module.exports = { serve, warmUp };
