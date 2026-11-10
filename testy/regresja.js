// TEST REGRESJI: cała gra w przeglądarce (3 telefony 360 px) na lokalnym serwerze.
// Uruchomienie: PORT=10557 node server.js   oraz   node testy/regresja.js [katalog na zrzuty]
// Potrzebne: npm install --no-save puppeteer-core socket.io-client  + Chrome w standardowym miejscu.
// Sprawdza: poczekalnię, panel awatara (zakładki rysowane raz), Impostora z "Nowym hasłem", głosowanie, wyniki,
// "Kto z nas", listę pokoi, udostępnianie, polskie litery z czcionki gry i to, czy nic się nie przelewa.

const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const URL = process.env.URL || 'http://localhost:10557';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = process.argv[2] || path.join(__dirname, 'zrzuty');
fs.mkdirSync(OUT, { recursive: true });

const wait = ms => new Promise(r => setTimeout(r, ms));
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) fails++; };
const errors = [];

async function open(browser, name) {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 360, height: 780, isMobile: true, hasTouch: true });
    page.on('dialog', d => d.accept());
    page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
    await page.evaluateOnNewDocument(() => { try { localStorage.setItem('rulesSeen', '1'); } catch (e) {} });
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof socket !== 'undefined' && socket.connected && avatarCatalog, { timeout: 30000 });
    await page.type('#input-name', name);
    return page;
}

// Widoczne elementy, których tekst wychodzi poza swoją ramkę albo poza kartę gry (przyciski, kafelki, napisy).
// Mierzony jest sam tekst (Range), bo napis może wystawać z elementu, który ma "overflow: visible".
function overflowing(page) {
    // .category-card: grafika kategorii celowo wystaje i jest przycinana ramką - to nie tekst
    return page.evaluate(() => {
        const card = document.getElementById('card').getBoundingClientRect();
        return [...document.querySelectorAll('button:not(.category-card), .vote-tile, .player-tag, h3, h4, .res-outcome, .res-summary, #category-display, .role-data, .room-row-name')]
            .filter(el => el.offsetParent !== null && el.textContent.trim())
            .filter(el => {
                const range = document.createRange(); range.selectNodeContents(el);
                const text = range.getBoundingClientRect();
                const clipped = el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible';
                return clipped || text.left < card.left - 1 || text.right > card.right + 1;
            })
            .map(el => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''} "${el.textContent.trim().slice(0, 30)}"`);
    });
}

async function checkScreen(page, label) {
    const bad = await overflowing(page);
    ok(bad.length === 0, `${label}: nic się nie przelewa${bad.length ? ' - ' + bad.join(', ') : ''}`);
    await page.screenshot({ path: path.join(OUT, label.replace(/[^a-z0-9ąćęłńóśźż]+/gi, '-') + '.png') });
}

(async () => {
    const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
    const H = await open(browser, 'Bartłomiej'), G = await open(browser, 'Gośćżółć'), K = await open(browser, 'Kasia');
    const P = [H, G, K];

    // --- menu i czcionka ---
    await checkScreen(H, 'menu');
    const fontPl = await H.evaluate(async () => {
        await document.fonts.load('700 16px Silkscreen', 'Ł'); await document.fonts.load('400 16px Silkscreen', 'ż');
        return [...document.fonts].filter(f => f.family.replace(/"/g, '') === 'Silkscreen' && f.unicodeRange.includes('141') && f.status === 'loaded').length;
    });
    ok(fontPl === 2, `polskie litery z czcionki gry (wczytane pliki -pl: ${fontPl}/2)`);

    // --- panel awatara: zakładki rysowane raz ---
    await H.evaluate(() => customizeAvatar()); await wait(800);
    const same = await H.evaluate(async () => {
        const tabs = document.querySelectorAll('.customize-categories-tile');
        const first = document.querySelector('#customize-list .customize-tile');
        tabs[1].click(); await new Promise(r => setTimeout(r, 200));
        tabs[0].click(); await new Promise(r => setTimeout(r, 200));
        return document.querySelector('#customize-list .customize-tile') === first;
    });
    ok(same, 'panel awatara: powrót do zakładki bez rysowania kafelków od nowa');
    const picked = await H.evaluate(() => { const t = document.querySelectorAll('#customize-list .customize-tile')[2]; t.click(); return t.dataset.part; });
    ok(await H.evaluate(p => document.querySelector('#customize-list .customize-tile.selected').dataset.part === p, picked), 'panel awatara: zaznaczenie po wyborze części');
    await checkScreen(H, 'panel awatara');
    await H.evaluate(() => showScreen('screen-login'));

    // --- pokój ---
    await H.$eval('.btn-create', el => el.click()); await H.waitForSelector('#screen-lobby:not(.hidden)'); await wait(300);
    const code = await H.evaluate(() => currentRoomCode);
    for (const p of [G, K]) { await p.type('#input-code', code); await p.$eval('#screen-login .btn-join', el => el.click()); await p.waitForSelector('#screen-lobby:not(.hidden)'); }
    await wait(600);
    ok((await H.$$('#players-list .avatar-container:not(.invite-slot)')).length === 3, 'poczekalnia: 3 graczy');
    await checkScreen(H, 'poczekalnia');

    // lista pokoi w menu u kogoś nowego
    const V = await open(browser, 'Widz');
    await V.waitForFunction(c => [...document.querySelectorAll('.room-row')].some(r => r.innerText.includes('#' + c)), { timeout: 8000 }, code)
        .then(() => ok(true, 'lista pokoi: pokój widoczny w menu'), () => ok(false, 'lista pokoi: pokój widoczny w menu'));

    // --- runda Impostora z nowym hasłem ---
    await H.$eval('#btn-start', el => el.click());
    await Promise.all(P.map(p => p.waitForSelector('#screen-game:not(.hidden)'))); await wait(2800);
    const roles = await Promise.all(P.map(p => p.evaluate(() => impostorRole)));
    ok(roles.filter(r => r === 'IMPOSTOR').length === 1, 'jeden impostor: ' + roles.join(','));
    await checkScreen(H, 'gra');
    const before = await Promise.all(P.map(p => p.$eval('#role-data', el => el.innerText)));
    await H.$eval('#btn-skip', el => el.click()); await wait(900);
    const after = await Promise.all(P.map(p => p.$eval('#role-data', el => el.innerText)));
    const regular = roles.map((r, i) => i).filter(i => roles[i] !== 'IMPOSTOR');
    ok(regular.every(i => after[i] !== before[i]), 'nowe hasło dla graczy');
    ok((await Promise.all(P.map(p => p.evaluate(() => impostorRole)))).join() === roles.join(), 'role bez zmian po nowym haśle');

    await H.$eval('#host-vote-controls .btn-end', el => el.click());
    await Promise.all(P.map(p => p.waitForSelector('#screen-vote:not(.hidden)'))); await wait(700);
    await checkScreen(P[roles.indexOf('IMPOSTOR')], 'głosowanie (impostor)');
    const ids = await H.$$eval('.vote-tile', els => els.map(e => e.dataset.id));
    for (const p of P) await p.evaluate(id => document.querySelector(`.vote-tile[data-id="${id}"]`).click(), ids[1]);
    await H.waitForFunction(() => !document.getElementById('btn-end-game').disabled, { timeout: 60000 });
    await H.$eval('#btn-end-game', el => el.click());
    await Promise.all(P.map(p => p.waitForSelector('#screen-results:not(.hidden)'))); await wait(4500);
    ok(await H.$eval('#res-outcome', el => /WYGRANA|PRZEGRANA/.test(el.textContent)), 'wyniki: werdykt');
    await checkScreen(H, 'wyniki');

    // --- runda "Kto z nas" ---
    for (const p of P) await p.evaluate(() => playAgain());
    await H.waitForSelector('#screen-lobby:not(.hidden)'); await wait(600);
    await H.$$eval('#mode-tiles button', els => els.find(e => e.textContent.toLowerCase().includes('pytania')).click()); await wait(400);
    await H.evaluate(() => selectCategory('kto-z-nas')); await wait(500);
    await H.$eval('#btn-start', el => el.click());
    await Promise.all(P.map(p => p.waitForSelector('#screen-game:not(.hidden)'))); await wait(2800);
    for (const p of P) await p.evaluate(() => document.querySelectorAll('.answer-player')[2].click());
    await checkScreen(G, 'kto z nas');
    await wait(400);
    await H.$eval('#host-vote-controls .btn-end', el => el.click());
    await Promise.all(P.map(p => p.waitForSelector('#screen-vote:not(.hidden)'))); await wait(600);
    const tiles = await H.$$eval('.vote-tile', els => els.map(e => e.innerText.replace(/\s+/g, ' ')));
    ok(tiles.every(t => t.includes('Kasia')), 'Kto z nas: odpowiedzi w głosowaniu: ' + tiles.join(' | '));

    // --- udostępnianie ---
    const shared = await V.evaluate(async () => { let got = null; navigator.share = async d => { got = d; }; currentRoomCode = '1234'; await shareInvite(); return got; });
    ok(shared && Object.keys(shared).join() === 'url', 'udostępnianie: sam link ' + JSON.stringify(shared));

    ok(errors.length === 0, 'brak błędów w przeglądarce ' + errors.join(' | '));
    await browser.close();
    console.log(fails ? `FAILED (${fails})` : 'ALL PASSED');
    process.exit(fails ? 1 : 0);
})().catch(e => { console.log('BŁĄD TESTU', e.message); process.exit(1); });
