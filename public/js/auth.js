// LOGOWANIE (Supabase Auth) - własny mały moduł zamiast biblioteki Supabase (ta ważyłaby 48 KB, a potrzebujemy
// tylko kilku zapytań). Każdy gracz dostaje konto anonimowe (tymczasowe, przypisane do tej przeglądarki);
// w pamięci przeglądarki jest tylko sesja (tajne tokeny), a dane konta trzyma baza.
// Token idzie do serwera gry przy łączeniu (app.js) - serwer sprawdza go i wczytuje postęp (accounts.js).
//
// Adres projektu i klucz publiczny wpisuje do strony serwer (assets.js). Bez nich konta są wyłączone
// i gra działa jak wcześniej (postęp gościa w przeglądarce).
// Ładowany przed app.js.

const Auth = (() => {
    const SESSION_KEY = 'impostorAuth';
    const REFRESH_BEFORE_MS = 60 * 1000;      // odświeżamy token minutę przed wygaśnięciem
    const meta = name => (document.querySelector(`meta[name="${name}"]`) || {}).content || '';
    const url = meta('supabase-url');
    const key = meta('supabase-key');
    // https albo lokalna atrapa Supabase do testów
    const enabled = (/^https:\/\//.test(url) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url)) && key.length > 20;

    let session = null;
    try { session = JSON.parse(localStorage.getItem(SESSION_KEY)); } catch (e) { /* bez pamięci */ }

    function saveSession(data) {
        session = data ? {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresAt: (data.expires_at ? data.expires_at * 1000 : Date.now() + data.expires_in * 1000),
            userId: data.user && data.user.id,
            isAnonymous: Boolean(data.user && data.user.is_anonymous)
        } : null;
        try {
            if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
            else localStorage.removeItem(SESSION_KEY);
        } catch (e) { /* bez pamięci: konto tylko do zamknięcia karty */ }
    }

    async function request(path, body) {
        const response = await fetch(`${url}/auth/v1${path}`, {
            method: 'POST',
            headers: { apikey: key, 'Content-Type': 'application/json' },
            body: JSON.stringify(body || {})
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error(data.msg || data.error_description || data.message || `HTTP ${response.status}`);
            error.status = response.status;
            throw error;
        }
        return data;
    }

    // Ważny token dostępu: z pamięci, odświeżony albo nowego konta anonimowego. null = bez konta (gra działa dalej).
    let pending = null;
    function getToken() {
        if (!enabled) return Promise.resolve(null);
        if (session && session.expiresAt - Date.now() > REFRESH_BEFORE_MS) return Promise.resolve(session.accessToken);
        if (!pending) pending = obtainToken().finally(() => { pending = null; });
        return pending;
    }

    async function obtainToken() {
        try {
            if (session && session.refreshToken) {
                try {
                    saveSession(await request('/token?grant_type=refresh_token', { refresh_token: session.refreshToken }));
                    return session.accessToken;
                } catch (err) {
                    // sesja odrzucona (np. konto usunięte po 90 dniach) - zakładamy nowe; błąd sieci - spróbujemy później
                    if (!(err.status >= 400 && err.status < 500)) return null;
                    saveSession(null);
                }
            }
            saveSession(await request('/signup', {}));      // nowe konto anonimowe
            return session.accessToken;
        } catch (err) {
            return null;
        }
    }

    return {
        enabled,
        getToken,
        isAnonymous: () => !session || session.isAnonymous,
        userId: () => session && session.userId
    };
})();
