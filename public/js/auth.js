// LOGOWANIE (Supabase Auth) - własny mały moduł zamiast biblioteki Supabase (ta ważyłaby 48 KB, a potrzebujemy
// tylko kilku zapytań). W pamięci przeglądarki jest tylko sesja (tajne tokeny), dane konta trzyma baza.
// Token idzie do serwera gry przy łączeniu (app.js) - serwer sprawdza go i wczytuje postęp (accounts.js).
//
// Konta:
// - na start każdy gracz ma konto anonimowe (tymczasowe, przypisane do tej przeglądarki),
// - Google albo link z e-maila zamienia je w stałe: najpierw próbujemy podpiąć Google / adres do konta tymczasowego
//   (to samo konto, nic nie trzeba przenosić); gdy to konto Google / ten adres ma już swoje konto (np. z innego
//   telefonu), logujemy się na nie, a serwer dopisuje do niego postęp z konta tymczasowego (account_merge).
// Google i link z maila wracają do gry z tokenami w adresie (#access_token=...) - readRedirect().
//
// Adres projektu i klucz publiczny wpisuje do strony serwer (assets.js). Bez nich konta są wyłączone
// i gra działa jak wcześniej (postęp gościa w przeglądarce). Ładowany przed app.js.

const Auth = (() => {
    const SESSION_KEY = 'impostorAuth';
    const FLOW_KEY = 'impostorAuthFlow';       // logowanie w toku (przed przejściem do Google / maila)
    const REFRESH_BEFORE_MS = 60 * 1000;      // odświeżamy token minutę przed wygaśnięciem
    const meta = name => (document.querySelector(`meta[name="${name}"]`) || {}).content || '';
    const url = meta('supabase-url');
    const key = meta('supabase-key');
    // https albo lokalna atrapa Supabase do testów
    const enabled = (/^https:\/\//.test(url) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url)) && key.length > 20;

    const storage = {
        get(name) { try { return JSON.parse(localStorage.getItem(name)); } catch (e) { return null; } },
        set(name, value) {
            try { value === null ? localStorage.removeItem(name) : localStorage.setItem(name, JSON.stringify(value)); } catch (e) { /* bez pamięci */ }
        }
    };

    let session = storage.get(SESSION_KEY);

    // Dane z tokenu (identyfikator, e-mail, czy anonimowe) - bez dodatkowego zapytania
    function claims(token) {
        try {
            const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
            return JSON.parse(decodeURIComponent(escape(atob(part))));
        } catch (e) {
            return {};
        }
    }

    function saveSession(data) {
        if (!data || !data.access_token) {
            session = null;
        } else {
            const info = claims(data.access_token);
            const expiresIn = Number(data.expires_in) || 3600;
            session = {
                accessToken: data.access_token,
                refreshToken: data.refresh_token,
                expiresAt: Number(data.expires_at) ? Number(data.expires_at) * 1000 : Date.now() + expiresIn * 1000,
                userId: info.sub,
                email: info.email || null,
                isAnonymous: info.is_anonymous === true
            };
        }
        storage.set(SESSION_KEY, session);
    }

    async function request(path, body, { method = 'POST', token } = {}) {
        const headers = { apikey: key };
        if (body) headers['Content-Type'] = 'application/json';
        if (token) headers.Authorization = `Bearer ${token}`;
        const response = await fetch(`${url}/auth/v1${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error(data.msg || data.error_description || data.message || `HTTP ${response.status}`);
            error.status = response.status;
            error.code = data.error_code || data.code || '';
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

    async function refresh(refreshToken) {
        return request('/token?grant_type=refresh_token', { refresh_token: refreshToken });
    }

    async function obtainToken() {
        try {
            if (session && session.refreshToken) {
                try {
                    saveSession(await refresh(session.refreshToken));
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

    // ===== POWRÓT Z GOOGLE / LINKU Z MAILA =====
    const redirectTo = () => location.origin + '/';
    const enc = encodeURIComponent;

    function readRedirect() {
        const hash = new URLSearchParams(location.hash.slice(1));
        const query = new URLSearchParams(location.search);
        const get = name => hash.get(name) || query.get(name);
        let result = null;
        if (hash.get('access_token')) {
            saveSession({
                access_token: hash.get('access_token'),
                refresh_token: hash.get('refresh_token'),
                expires_in: hash.get('expires_in'),
                expires_at: hash.get('expires_at')
            });
            result = { ok: true, type: hash.get('type') || 'signin' };
        } else if (get('error') || get('error_code')) {
            result = { ok: false, code: get('error_code') || get('error'), message: get('error_description') || '' };
        } else if (get('message')) {
            result = { ok: true, type: 'message', message: get('message') };
        }
        if (result) history.replaceState(null, '', location.pathname);     // tokeny nie zostają w pasku adresu
        return result;
    }

    let redirectResult = enabled ? readRedirect() : null;
    let flow = storage.get(FLOW_KEY);

    // Google odmówił podpięcia, bo to konto Google ma już swoje konto w grze - logujemy się na nie
    if (redirectResult && !redirectResult.ok && flow && flow.kind === 'google' && flow.step === 'link'
        && /identity_already_exists|already/i.test(redirectResult.code + redirectResult.message)) {
        storage.set(FLOW_KEY, { ...flow, step: 'signin' });
        location.replace(`${url}/auth/v1/authorize?provider=google&redirect_to=${enc(redirectTo())}`);
        redirectResult = null;
    }

    // ===== LOGOWANIE =====
    async function loginGoogle() {
        const token = await getToken();
        const anonRefresh = session && session.isAnonymous ? session.refreshToken : null;
        if (token && session.isAnonymous) {
            // próba podpięcia Google do konta tymczasowego (wymaga "Manual linking" w Supabase)
            try {
                const data = await request(`/user/identities/authorize?provider=google&skip_http_redirect=true&redirect_to=${enc(redirectTo())}`,
                    null, { method: 'GET', token });
                if (data.url) {
                    storage.set(FLOW_KEY, { kind: 'google', step: 'link', anonRefresh });
                    location.href = data.url;
                    return;
                }
            } catch (err) { /* podpinanie wyłączone - zwykłe logowanie i dopisanie postępu */ }
        }
        storage.set(FLOW_KEY, { kind: 'google', step: 'signin', anonRefresh });
        location.href = `${url}/auth/v1/authorize?provider=google&redirect_to=${enc(redirectTo())}`;
    }

    // Link logowania na maila; zwraca 'link' (adres dopisany do konta tymczasowego) albo 'signin' (konto już istniało)
    async function sendEmailLink(email) {
        const token = await getToken();
        const anonRefresh = session && session.isAnonymous ? session.refreshToken : null;
        if (token && session.isAnonymous) {
            try {
                await request(`/user?redirect_to=${enc(redirectTo())}`, { email }, { method: 'PUT', token });
                storage.set(FLOW_KEY, { kind: 'email', step: 'link', email });
                return 'link';
            } catch (err) {
                if (!/exist|already|registered/i.test(err.code + err.message)) throw err;
            }
        }
        await request(`/otp?redirect_to=${enc(redirectTo())}`, { email, create_user: true });
        storage.set(FLOW_KEY, { kind: 'email', step: 'signin', email, anonRefresh });
        return 'signin';
    }

    async function logout() {
        if (session) {
            try { await request('/logout?scope=local', null, { token: session.accessToken }); } catch (e) { /* i tak czyścimy */ }
        }
        saveSession(null);
        storage.set(FLOW_KEY, null);
    }

    // Po zalogowaniu na istniejące konto: token konta tymczasowego, z którego serwer przeniesie postęp (raz)
    async function takeMergeToken() {
        const current = storage.get(FLOW_KEY);
        if (!current || !current.anonRefresh || !session || session.isAnonymous) return null;
        storage.set(FLOW_KEY, null);
        try {
            const anon = await refresh(current.anonRefresh);
            return claims(anon.access_token).is_anonymous ? anon.access_token : null;
        } catch (e) {
            return null;
        }
    }

    // Wynik powrotu z Google / linku (do komunikatu w grze) - raz
    function takeRedirectResult() {
        const result = redirectResult;
        redirectResult = null;
        // logowanie zakończone; zostaje tylko wtedy, gdy czeka jeszcze przeniesienie postępu (takeMergeToken)
        if (result && result.ok && flow && (flow.step === 'link' || !flow.anonRefresh)) storage.set(FLOW_KEY, null);
        return result;
    }

    // Po potwierdzeniu adresu z linku Supabase może wrócić bez tokenów - wtedy odświeżamy sesję,
    // żeby token wiedział, że konto jest już stałe
    if (enabled && flow && flow.kind === 'email' && flow.step === 'link' && redirectResult && redirectResult.ok && session) {
        session.expiresAt = 0;
    }

    return {
        enabled,
        getToken,
        loginGoogle,
        sendEmailLink,
        logout,
        takeMergeToken,
        takeRedirectResult,
        pendingEmail: () => (storage.get(FLOW_KEY) || {}).email || null,
        isAnonymous: () => !session || session.isAnonymous,
        email: () => session && session.email,
        userId: () => session && session.userId
    };
})();
