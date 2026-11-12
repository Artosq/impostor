// LOGOWANIE W GRZE: pasek "Konto gościa · Zaloguj się" pod nagłówkiem profilu i okienko "Zapisz postęp" (Google albo link z maila).
// Samo logowanie robi auth.js, postęp przenosi serwer (accounts.js). Ładowany po profile.js.
//
// Zachęta: okienko pokazuje się samo (w menu) raz po osiągnięciu poziomu 3 i raz po poziomie 10,
// a dopóki konto jest tymczasowe, przy awatarze w menu świeci kropka (od poziomu 3).

const LOGIN_PROMPT_LEVELS = [3, 10];
const LOGIN_PROMPT_KEY = 'loginPromptLevel';
const LOGIN_DOT_LEVEL = 3;
const ACCOUNT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>';
let loginView = 'choose';
let loginPromptPending = false;

function accountsOn() {
    return Auth.enabled && ProfileStore.isAccount();
}

// ===== OKIENKO =====
function openLogin(title = '— Zapisz postęp —') {
    if (!accountsOn()) return;
    byId('login-title').textContent = Auth.isAnonymous() ? title : '— Twoje konto —';
    showLoginView(Auth.isAnonymous() ? 'choose' : 'account');
    byId('login').classList.remove('hidden', 'closing');
}

function closeLogin() {
    const panel = byId('login');
    if (panel.classList.contains('hidden') || panel.classList.contains('closing')) return;
    panel.classList.add('closing');
    setTimeout(() => {
        if (!panel.classList.contains('closing')) return;
        panel.classList.add('hidden');
        panel.classList.remove('closing');
    }, PICKER_CLOSE_MS);
}

// Dolny przycisk: z formularza e-maila wraca do wyboru, w pozostałych widokach zamyka
function loginBackOrClose() {
    if (loginView === 'email') showLoginView('choose');
    else closeLogin();
}

function showLoginView(view) {
    loginView = view;
    ['choose', 'email', 'sent', 'account'].forEach(name => byId(`login-${name}`).classList.toggle('hidden', name !== view));
    showLoginError('');
    byId('login-close').textContent = { choose: 'Nie teraz', email: '<- Wróć', sent: 'Zamknij', account: 'Zamknij' }[view];
    byId('login-close').classList.toggle('hidden', view === 'account');     // widok konta ma własne przyciski
    if (view === 'email') setTimeout(() => byId('login-email-input').focus(), 50);
    if (view === 'account') renderAccountView();
}

// Widok "Twoje konto": awatar, nick i poziom, adres z ikoną sposobu logowania
function renderAccountView() {
    byId('login-account-avatar').src = avatarUrl(botConfig);
    byId('login-account-nick').textContent = byId('input-name').value.trim() || 'Gracz';
    byId('login-account-level').textContent = `Poziom ${ProfileStore.get().level}`;
    byId('login-account-email').textContent = Auth.email() || 'konto Google';
    // ta sama ikona co na przycisku logowania (Google albo koperta)
    const source = document.querySelector(Auth.provider() === 'google' ? '.login-google svg' : '.login-mail svg');
    byId('login-account-icon').replaceChildren(source.cloneNode(true));
}

function showLoginError(text) {
    byId('login-error').textContent = text;
    byId('login-error').classList.toggle('hidden', !text);
}

// ===== AKCJE =====
async function loginGoogleClick() {
    showLoginError('');
    try {
        await Auth.loginGoogle();         // przejście na stronę Google - gra wraca sama po zalogowaniu
    } catch (err) {
        showLoginError('Nie udało się połączyć z Google. Spróbuj za chwilę.');
    }
}

async function loginEmailSubmit() {
    const input = byId('login-email-input');
    const email = input.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showLoginError('To nie wygląda na adres e-mail');
    const button = byId('login-send');
    button.disabled = true;
    showLoginError('');
    try {
        await Auth.sendEmailLink(email);
        byId('login-sent-email').textContent = email;
        showLoginView('sent');
    } catch (err) {
        showLoginError(err.status === 429 || /rate|limit/i.test(err.message)
            ? 'Za dużo prób - poczekaj chwilę i spróbuj ponownie'
            : 'Nie udało się wysłać maila. Spróbuj za chwilę.');
    } finally {
        button.disabled = false;
    }
}

async function logoutClick() {
    if (!confirm('Wylogować? Na tym urządzeniu zaczniesz od nowa jako gość - Twój postęp zostaje na koncie.')) return;
    await Auth.logout();
    location.reload();                    // nowa strona = nowe konto tymczasowe
}

// ===== PRZYCISK W PROFILU I KROPKA W MENU =====
function updateAccountChip() {
    const chip = byId('account-chip');
    const on = accountsOn();
    chip.classList.toggle('hidden', !on);
    byId('profile-account').classList.toggle('hidden', Auth.enabled);
    if (!on) return;
    const anonymous = Auth.isAnonymous();
    chip.classList.toggle('is-anonymous', anonymous);
    const text = createElement('span', 'account-chip-text');
    if (anonymous) text.append('Konto gościa · ', createElement('b', '', 'Zaloguj się'));
    else text.textContent = Auth.email() || 'Twoje konto';
    chip.innerHTML = ACCOUNT_ICON;
    chip.append(text);
    chip.title = anonymous ? 'Postęp jest zapisany tylko na tym urządzeniu. Zaloguj się, żeby go nie stracić i grać na innych.' : 'Twoje konto';
}

// Kropka przy awatarze: konto tymczasowe od poziomu 3 (profile.js łączy ją z kropką nowych odznak)
function needsLoginDot() {
    return accountsOn() && Auth.isAnonymous() && ProfileStore.get().level >= LOGIN_DOT_LEVEL;
}

// ===== ZACHĘTA PO POZIOMIE 3 I 10 =====
// Po rundzie (app.js) zapamiętujemy, że jest powód; okienko pokazuje się dopiero w menu, nie na wynikach
function noteLevelForLogin(level) {
    if (!accountsOn() || !Auth.isAnonymous()) return;
    let shown = 0;
    try { shown = Number(localStorage.getItem(LOGIN_PROMPT_KEY)) || 0; } catch (e) { /* bez pamięci */ }
    const due = LOGIN_PROMPT_LEVELS.filter(l => level >= l && l > shown).pop();
    if (!due) return;
    loginPromptPending = true;
    try { localStorage.setItem(LOGIN_PROMPT_KEY, String(due)); } catch (e) { /* bez pamięci */ }
}

// Wołane przy wejściu do menu (app.js: showScreen)
function maybeShowLoginPrompt() {
    if (!loginPromptPending || !accountsOn() || !Auth.isAnonymous()) return;
    loginPromptPending = false;
    setTimeout(() => { if (currentScreen === 'screen-login') openLogin('— Nie strać postępu —'); }, 600);
}

// ===== POSTĘP GOŚCIA PO ZALOGOWANIU NA ISTNIEJĄCE KONTO =====
// Serwer pyta tylko, gdy konto gościa tego urządzenia ma jakiś postęp (puste usuwa sam)
function showMergeOffer(offer) {
    byId('merge-level').textContent = offer.level;
    byId('merge-games').textContent = offer.games;
    byId('merge-badges').textContent = offer.badges;
    byId('merge-offer').classList.remove('hidden', 'closing');
}

function answerMergeOffer(add) {
    sendMergeAnswer(add);            // app.js
    const panel = byId('merge-offer');
    panel.classList.add('closing');
    setTimeout(() => {
        panel.classList.add('hidden');
        panel.classList.remove('closing');
    }, PICKER_CLOSE_MS);
}
