// SERVICE WORKER: szybsze kolejne wejścia i ekran "Brak internetu" zamiast błędu przeglądarki.
// - strona (index.html) zawsze z sieci - po wdrożeniu nowej wersji gracz od razu ją dostaje,
// - pliki z odciskiem wersji (?v=...) i awatary z pamięci telefonu - ich adres zmienia się razem z treścią,
// - czcionki z pamięci, odświeżane w tle,
// - bez sieci: offline.html (w stylu gry), sam wraca do gry, gdy internet wróci.
// Połączenie z grą (Socket.IO), katalog awatarów i reszta zawsze idą prosto do serwera.

const CACHE = 'impostor-v1';             // zmiana nazwy czyści stare pliki wszystkim graczom
const OFFLINE_PAGE = '/offline.html';
const MAX_AVATARS = 300;                 // awatarów w pamięci - najstarsze wypadają

// Strona offline i wszystko, czego używa (serwer dopisuje do adresów odcisk wersji, więc bierzemy je z niej samej)
async function precacheOffline() {
    const cache = await caches.open(CACHE);
    const response = await fetch(OFFLINE_PAGE, { cache: 'no-cache' });
    if (!response.ok) return;
    const html = await response.clone().text();
    await cache.put(OFFLINE_PAGE, response);
    const urls = [...html.matchAll(/(?:src|href)="([^"]+)"|url\("([^"]+)"\)/g)].map(m => m[1] || m[2]).filter(u => u.startsWith('/'));
    await cache.addAll([...new Set(urls)]);
}

self.addEventListener('install', event => {
    event.waitUntil(precacheOffline().then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const names = await caches.keys();
        await Promise.all(names.filter(name => name !== CACHE).map(name => caches.delete(name)));
        // strona zaczyna się pobierać równolegle z uruchamianiem service workera
        if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
        await self.clients.claim();
    })());
});

async function fromNetworkOrOffline(event) {
    try {
        const preloaded = await event.preloadResponse;
        if (preloaded) return preloaded;
        return await fetch(event.request);
    } catch (e) {
        return (await caches.match(OFFLINE_PAGE)) || Response.error();
    }
}

async function fromCacheFirst(request, limit) {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) {
        await cache.put(request, response.clone());
        if (limit) trim(cache, limit);
    }
    return response;
}

// Z pamięci od razu, a w tle sprawdzenie, czy na serwerze nie ma nowszej wersji
async function fromCacheThenRefresh(request) {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    const refresh = fetch(request).then(response => {
        if (response.ok) cache.put(request, response.clone());
        return response;
    }).catch(() => cached);
    return cached || refresh;
}

async function trim(cache, limit) {
    const avatars = (await cache.keys()).filter(request => new URL(request.url).pathname.startsWith('/avatar/'));
    await Promise.all(avatars.slice(0, Math.max(0, avatars.length - limit)).map(request => cache.delete(request)));
}

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (url.origin !== location.origin) return;

    if (request.mode === 'navigate') {
        event.respondWith(fromNetworkOrOffline(event));
    } else if (url.pathname.startsWith('/avatar/') && url.searchParams.has('v')) {
        event.respondWith(fromCacheFirst(request, MAX_AVATARS));
    } else if (url.searchParams.has('v')) {
        event.respondWith(fromCacheFirst(request));
    } else if (url.pathname.startsWith('/fonts/') || url.pathname === '/logo.svg') {
        event.respondWith(fromCacheThenRefresh(request));
    }
    // reszta (Socket.IO, katalog awatarów, manifest, ikony): zwykle, przez przeglądarkę
});
