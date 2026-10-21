// ZASADY GRY W 3 OBRAZKACH: okno otwiera się samo przy pierwszej wizycie,
// a potem po kliknięciu znaku zapytania w rogu menu. Obrazki to proste SVG rysowane tutaj.

const RULES_SEEN_KEY = 'rulesSeen';
const RULES_CLOSE_MS = 250;     // długość animacji wyjścia okna (style.css)

// ===== rysowanie =====
const RULE_INK = '#000';

// Głowa bota jak w awatarach: kolorowy kafelek z oczami i buzią
function ruleBot(x, y, size, color, { eyes = 'round', mouth = 'smile' } = {}) {
    const s = size / 40;
    const at = (px, py) => `${x + px * s} ${y + py * s}`;
    const eye = ex => {
        if (eyes === 'shifty') return `<rect x="${x + (ex - 4) * s}" y="${y + 14 * s}" width="${8 * s}" height="${4 * s}" rx="${2 * s}" fill="${RULE_INK}"/>`;
        if (eyes === 'x') return `<path d="M${at(ex - 3, 13)}L${at(ex + 3, 19)}M${at(ex + 3, 13)}L${at(ex - 3, 19)}" stroke="${RULE_INK}" stroke-width="${2.2 * s}" stroke-linecap="round"/>`;
        return `<circle cx="${x + ex * s}" cy="${y + 16 * s}" r="${4 * s}" fill="white"/><circle cx="${x + (ex + 1) * s}" cy="${y + 16.5 * s}" r="${2 * s}" fill="${RULE_INK}"/>`;
    };
    const mouths = {
        smile: `<path d="M${at(13, 27)}Q${at(20, 32)} ${at(27, 27)}" fill="none" stroke="${RULE_INK}" stroke-width="${2.4 * s}" stroke-linecap="round"/>`,
        flat: `<path d="M${at(14, 28)}H${x + 26 * s}" stroke="${RULE_INK}" stroke-width="${2.4 * s}" stroke-linecap="round"/>`,
        open: `<ellipse cx="${x + 20 * s}" cy="${y + 28 * s}" rx="${4 * s}" ry="${3 * s}" fill="${RULE_INK}"/>`
    };
    return `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${6 * s}" fill="${color}" stroke="${RULE_INK}" stroke-width="${3 * s}"/>`
        + eye(13) + eye(27) + mouths[mouth];
}

const ruleText = (x, y, value, { size = 12, color = 'white', anchor = 'middle' } = {}) =>
    `<text x="${x}" y="${y}" font-family="Silkscreen, sans-serif" font-size="${size}" fill="${color}" text-anchor="${anchor}">${value}</text>`;

// Telefon z kartą roli
function rulePhone(x, color, botColor, word, opts) {
    return `<rect x="${x}" y="18" width="78" height="138" rx="12" fill="#161616" stroke="${color}" stroke-width="4"/>`
        + `<rect x="${x + 28}" y="26" width="22" height="4" rx="2" fill="#333"/>`
        + ruleBot(x + 19, 44, 40, botColor, opts)
        + ruleText(x + 39, 112, word, { size: word.length > 6 ? 10 : 13, color })
        + (word === '???' ? ruleText(x + 39, 132, 'podp: ser', { size: 8, color: '#999' }) : ruleText(x + 39, 132, 'hasło', { size: 8, color: '#999' }));
}

function ruleBubble(x, y, w, value, color = 'white', tail = 'left') {
    const tx = tail === 'left' ? x + 14 : x + w - 14;
    return `<rect x="${x}" y="${y}" width="${w}" height="26" rx="8" fill="${color}" stroke="${RULE_INK}" stroke-width="2.5"/>`
        + `<path d="M${tx - 6} ${y + 24}L${tx} ${y + 34}L${tx + 6} ${y + 24}Z" fill="${color}" stroke="${RULE_INK}" stroke-width="2.5" stroke-linejoin="round"/>`
        + `<rect x="${tx - 5}" y="${y + 21}" width="10" height="4" fill="${color}"/>`
        + ruleText(x + w / 2, y + 17, value, { size: 9, color: '#141414' });
}

const ruleSvg = inner => `<svg viewBox="0 0 300 175" xmlns="http://www.w3.org/2000/svg" role="img">${inner}</svg>`;

const RULES = [
    {
        title: 'Każdy dostaje hasło',
        text: 'Wszyscy widzą to samo hasło. <b class="rules-red">Impostor</b> go nie zna - ma tylko kategorię i małą podpowiedź. W trybie Pytania impostor dostaje inne pytanie i nawet o tym nie wie.',
        art: ruleSvg(
            rulePhone(14, '#2ecc71', '#3498db', 'PIZZA')
            + rulePhone(111, '#e74c3c', '#9b59b6', '???', { eyes: 'shifty', mouth: 'flat' })
            + rulePhone(208, '#2ecc71', '#f1c40f', 'PIZZA')
        )
    },
    {
        title: 'Mówcie na żywo',
        text: 'Po kolei rzućcie skojarzenie z hasłem - tak, żeby swoi wiedzieli, że je znacie, ale impostor się nie domyślił. Gra wskaże, kto zaczyna. <b class="rules-red">Impostor</b> blefuje.',
        art: ruleSvg(
            ruleBot(22, 110, 50, '#3498db') + ruleBubble(8, 62, 86, 'Okrągła!')
            + ruleBot(125, 110, 50, '#9b59b6', { eyes: 'shifty', mouth: 'open' }) + ruleBubble(104, 22, 92, 'Eee... pyszna?', '#ffd6d1')
            + `<path d="M182 112q4 7 0 10q-4-3 0-10z" fill="#4fb3ff" stroke="${RULE_INK}" stroke-width="1.5"/>`
            + ruleBot(228, 110, 50, '#f1c40f') + ruleBubble(206, 62, 86, 'Z serem', 'white', 'right')
        )
    },
    {
        title: 'Złapcie impostora',
        text: 'Host otwiera głosowanie i każdy wskazuje podejrzanego. Wyrzucicie <b class="rules-red">impostora</b> - wygrywacie. Ukryje się - wygrywa on.',
        art: ruleSvg(
            ruleBot(20, 98, 46, '#3498db') + ruleBot(234, 98, 46, '#f1c40f')
            + `<path d="M70 118Q110 92 116 102" fill="none" stroke="#e74c3c" stroke-width="4" stroke-linecap="round" stroke-dasharray="2 7"/>`
            + `<path d="M230 118Q190 92 184 102" fill="none" stroke="#e74c3c" stroke-width="4" stroke-linecap="round" stroke-dasharray="2 7"/>`
            + `<rect x="114" y="52" width="72" height="72" rx="12" fill="none" stroke="#e74c3c" stroke-width="4" opacity="0.6"/>`
            + ruleBot(122, 60, 56, '#9b59b6', { eyes: 'x', mouth: 'open' })
            + ruleText(150, 148, 'IMPOSTOR!', { size: 14, color: '#e74c3c' })
            + `<rect x="128" y="20" width="44" height="22" rx="6" fill="#e74c3c" stroke="${RULE_INK}" stroke-width="2.5"/>` + ruleText(150, 36, '2 głosy', { size: 8 })
        )
    }
];

// ===== okno =====
let rulesSlide = 0;
let rulesTouchX = null;

function renderRulesSlide() {
    const rule = RULES[rulesSlide];
    const slide = byId('rules-slide');
    slide.innerHTML = `<div class="rules-art">${rule.art}</div>`
        + `<div class="rules-step">${rulesSlide + 1} / ${RULES.length}</div>`
        + `<div class="rules-heading">${rule.title}</div>`
        + `<p class="rules-text">${rule.text}</p>`;
    slide.classList.remove('rules-enter');
    void slide.offsetWidth;     // ponowne odegranie animacji wejścia
    slide.classList.add('rules-enter');

    byId('rules-dots').replaceChildren(...RULES.map((_, index) => {
        const dot = createElement('span', index === rulesSlide ? 'rules-dot active' : 'rules-dot');
        dot.onclick = () => { rulesSlide = index; renderRulesSlide(); };
        return dot;
    }));
    byId('rules-prev').classList.toggle('invisible', rulesSlide === 0);
    byId('rules-next').textContent = rulesSlide === RULES.length - 1 ? 'Gramy!' : 'Dalej';
}

function openRules() {
    rulesSlide = 0;
    renderRulesSlide();
    byId('rules').classList.remove('hidden', 'closing');
}

function closeRules() {
    const rules = byId('rules');
    if (rules.classList.contains('hidden') || rules.classList.contains('closing')) return;
    try { localStorage.setItem(RULES_SEEN_KEY, '1'); } catch (e) { /* bez pamięci pokaże się znowu */ }

    rules.classList.add('closing');
    setTimeout(() => {
        if (!rules.classList.contains('closing')) return;
        rules.classList.add('hidden');
        rules.classList.remove('closing');
    }, RULES_CLOSE_MS);
}

function changeRulesSlide(step) {
    const next = rulesSlide + step;
    if (next >= RULES.length) return closeRules();
    if (next < 0) return;
    rulesSlide = next;
    renderRulesSlide();
}

// Przesunięcie palcem zmienia obrazek
byId('rules').addEventListener('touchstart', event => { rulesTouchX = event.touches[0].clientX; }, { passive: true });
byId('rules').addEventListener('touchend', event => {
    if (rulesTouchX === null) return;
    const dx = event.changedTouches[0].clientX - rulesTouchX;
    rulesTouchX = null;
    if (Math.abs(dx) > 50) changeRulesSlide(dx < 0 ? 1 : -1);
});

document.addEventListener('keydown', event => {
    if (byId('rules').classList.contains('hidden')) return;
    if (event.key === 'Escape') closeRules();
    if (event.key === 'ArrowRight') changeRulesSlide(1);
    if (event.key === 'ArrowLeft') changeRulesSlide(-1);
});

// Pierwsza wizyta: zasady pokazują się same
(function showRulesOnFirstVisit() {
    let seen = false;
    try { seen = localStorage.getItem(RULES_SEEN_KEY) === '1'; } catch (e) { /* pokaż */ }
    if (!seen && currentScreen === 'screen-login') openRules();
})();
