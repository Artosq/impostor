// STRONA GRACZA: nagłówek (awatar, nick, poziom) i zakładki Statystyki / Odznaki / Historia.
// Wyniki rund trafiają do ProfileStore (profileStore.js), nowe odznaki pokazują się na ekranie wyników.
// Ładowany po app.js (korzysta z byId, createElement, showScreen, avatarUrl, botConfig, getRequiredExp...).

const PROFILE_TABS = [
    { id: 'stats', name: 'Statystyki' },
    { id: 'badges', name: 'Odznaki' },
    { id: 'history', name: 'Historia' }
];
const MODE_NAMES = { impostor: 'Impostor', pytania: 'Pytania' };
const ROLE_LABELS = { IMPOSTOR: 'Impostor', GRACZ: 'Gracz', WSPOLNIK: 'Wspólnik', BLAZEN: 'Błazen', DETEKTYW: 'Detektyw', PODMIENIEC: 'Podmieniec' };
let profileTab = 'stats';
let profileReturnScreen = 'screen-login';

// ===== OTWIERANIE I NAGŁÓWEK =====

function openProfile() {
    if (!avatarCatalog) return;     // katalog awatarów jeszcze się wczytuje
    renderProfileHeader();
    renderProfileTabs();
    showScreen('screen-profile');
    // konto: świeże statystyki i historia z serwera (przychodzą jako "account_profile", app.js)
    if (ProfileStore.isAccount()) socket.emit('get_profile');
}

function closeProfile() {
    showScreen('screen-login');
}

function renderProfileHeader() {
    const profile = ProfileStore.get();
    byId('profile-avatar').src = avatarUrl(botConfig);
    byId('profile-nick').textContent = byId('input-name').value.trim() || 'Bez nicku';
    byId('profile-level').textContent = `Poziom ${profile.level}`;
    const needed = getRequiredExp(profile.level);
    byId('profile-exp-text').textContent = `${profile.exp} / ${needed} EXP`;
    byId('profile-exp-fill').style.width = `${Math.min(100, profile.exp / needed * 100)}%`;
}

function renderProfileTabs() {
    const panel = byId('profile-tabs');
    const unseen = ProfileStore.get().unseenBadges.length;
    panel.replaceChildren(...PROFILE_TABS.map(tab => {
        const button = createElement('button', 'customize-categories-tile', tab.name);
        button.classList.toggle('selected', tab.id === profileTab);
        if (tab.id === 'badges' && unseen) button.classList.add('has-new');
        // tylko przełączenie klasy - czerwone światełko płynnie przechodzi na nową zakładkę (jak w panelu wyglądu)
        button.onclick = () => {
            if (profileTab === tab.id) return;
            profileTab = tab.id;
            panel.querySelectorAll('.customize-categories-tile').forEach(b => b.classList.toggle('selected', b === button));
            renderProfileContent();
        };
        return button;
    }));
    renderProfileContent();
}

function renderProfileContent() {
    const content = byId('profile-content');
    const render = { stats: renderStatsTab, badges: renderBadgesTab, history: renderHistoryTab }[profileTab];
    content.replaceChildren(...render(ProfileStore.get()));
    content.classList.toggle('is-plain', profileTab === 'stats');     // statystyki bez ramki
    content.scrollTop = 0;
    // treść zakładki "wlatuje" jak kafelki w panelu wyglądu
    content.style.animation = 'none';
    void content.offsetWidth;
    content.style.animation = '';
    if (profileTab === 'badges') ProfileStore.markBadgesSeen().then(updateProfileDot);
}

// ===== ZAKŁADKI =====

function playTime(ms) {
    const minutes = Math.round(ms / 60000);
    return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

// ===== STATYSTYKI: WYKRESY =====
// Wykresy są zawsze widoczne - bez gier puste (zarys), z każdą rundą się wypełniają.

const ROLE_COLORS = { GRACZ: '#2ecc71', IMPOSTOR: '#e74c3c', WSPOLNIK: '#e67e22', BLAZEN: '#f1c40f', DETEKTYW: '#3498db', PODMIENIEC: '#9b59b6' };
const MODE_COLORS = ['#2ecc71', '#3498db', '#f1c40f', '#9b59b6'];
const HISTORY_FORM = 20;     // tyle rund mieści historia (profileStore.js)
const ratio = (part, all) => all ? part / all : 0;

// SVG z samych liczb (bez tekstu od graczy), więc wstawiany jako znaczniki
function svgElement(markup) {
    const holder = document.createElement('div');
    holder.innerHTML = markup;
    return holder.firstElementChild;
}

function statSection(title, ...children) {
    const section = createElement('section', 'stat-section');
    section.append(createElement('h3', 'stat-title', title), ...children);
    return section;
}

// Półkole: procent wygranych
function winGauge(s) {
    const value = Math.round(ratio(s.wins, s.games) * 100);
    const gauge = createElement('div', 'stat-gauge');
    gauge.append(svgElement(`<svg viewBox="0 0 200 108" aria-hidden="true">
        <path class="chart-track" d="M16 100 A84 84 0 0 1 184 100" pathLength="100"/>
        <path class="chart-fill" d="M16 100 A84 84 0 0 1 184 100" pathLength="100" stroke-dasharray="${value} 100"/>
    </svg>`));
    const center = createElement('div', 'stat-gauge-center');
    center.append(createElement('div', 'stat-big', s.games ? `${value}%` : '–'), createElement('div', 'stat-caption', 'wygranych'));
    gauge.append(center);
    const losses = s.games - s.wins;
    return [gauge, createElement('p', 'stat-note', s.games ? `${s.wins} W · ${losses} P · ${s.games} gier` : 'Zagraj pierwszą rundę')];
}

// Kółko: wygrane w danej roli
function roleDonut(label, wins, games, color) {
    const value = Math.round(ratio(wins, games) * 100);
    const box = createElement('div', 'stat-donut');
    const chart = createElement('div', 'stat-donut-chart');
    chart.append(svgElement(`<svg viewBox="0 0 100 100" aria-hidden="true">
        <circle class="chart-track" cx="50" cy="50" r="40" pathLength="100"/>
        <circle class="chart-fill" cx="50" cy="50" r="40" pathLength="100" stroke-dasharray="${value} 100" style="stroke:${color}"/>
    </svg>`), createElement('div', 'stat-donut-value', games ? `${value}%` : '–'));
    box.append(chart, createElement('div', 'stat-donut-label', label), createElement('div', 'stat-caption', `${wins} / ${games}`));
    return box;
}

// Forma: ostatnie rundy jako kratki (najstarsza po lewej)
function formStrip(history) {
    const strip = createElement('div', 'stat-form');
    const games = history.slice(0, HISTORY_FORM).reverse();
    for (let i = 0; i < HISTORY_FORM; i++) {
        const game = games[i];
        strip.append(createElement('span', game ? (game.won ? 'is-win' : 'is-lose') : ''));
    }
    return strip;
}

// Pasek skuteczności: nazwa, procent i wypełnienie
function rateBar(label, part, all, color = 'var(--secondary)') {
    const row = createElement('div', 'stat-bar');
    const head = createElement('div', 'stat-bar-head');
    head.append(createElement('span', '', label), createElement('span', 'stat-bar-value', all ? `${Math.round(ratio(part, all) * 100)}%` : '–'));
    const track = createElement('div', 'stat-bar-track');
    const fill = createElement('div', 'stat-bar-fill');
    fill.style.width = `${ratio(part, all) * 100}%`;
    fill.style.background = color;
    track.append(fill);
    row.append(head, track, createElement('div', 'stat-caption', `${part} / ${all}`));
    return row;
}

// Pasek podzielony na części (role, tryby) z legendą
function splitBar(parts) {
    const total = parts.reduce((sum, part) => sum + part.value, 0);
    const bar = createElement('div', 'stat-split');
    const legend = createElement('div', 'stat-legend');
    parts.filter(part => part.value).forEach(part => {
        const segment = createElement('span');
        segment.style.flexGrow = part.value;
        segment.style.background = part.color;
        bar.append(segment);
        const item = createElement('span', 'stat-legend-item', `${part.label} ${Math.round(part.value / total * 100)}%`);
        item.style.setProperty('--dot', part.color);
        legend.append(item);
    });
    if (!total) legend.append(createElement('span', 'stat-caption', 'Brak rozegranych rund'));
    return [bar, legend];
}

// Najczęstsze kategorie: słupki względem najczęstszej
function topCategories(categories) {
    const top = Object.entries(categories).sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (!top.length) return [createElement('p', 'stat-caption', 'Tu pojawią się Twoje ulubione kategorie')];
    return top.map(([name, count]) => {
        const row = createElement('div', 'stat-rank');
        const track = createElement('div', 'stat-bar-track');
        const fill = createElement('div', 'stat-bar-fill');
        fill.style.width = `${count / top[0][1] * 100}%`;
        track.append(fill);
        row.append(createElement('span', 'stat-rank-name', name), track, createElement('span', 'stat-bar-value', String(count)));
        return row;
    });
}

function numberTile(value, label) {
    const tile = createElement('div', 'stat-number');
    tile.append(createElement('div', 'stat-number-value', String(value)), createElement('div', 'stat-caption', label));
    return tile;
}

function renderStatsTab(profile) {
    const s = profile.stats;
    const caughtImpostor = s.kicked - s.kickedInnocent;      // ile razy wyrzucono Cię jako impostora

    const donuts = createElement('div', 'stat-donuts');
    donuts.append(roleDonut('Impostor', s.impostorWins, s.impostorGames, 'var(--danger)'), roleDonut('Gracz', s.playerWins, s.playerGames, 'var(--secondary)'));

    const roles = Object.keys(ROLE_COLORS).map(role => ({ label: ROLE_LABELS[role], value: s.roles[role] || 0, color: ROLE_COLORS[role] }));
    const modes = Object.entries(s.modes).map(([mode, value], i) => ({ label: MODE_NAMES[mode] || mode, value, color: MODE_COLORS[i % MODE_COLORS.length] }));

    const numbers = createElement('div', 'stat-numbers');
    numbers.append(
        numberTile(s.streak, `seria (rekord ${s.bestStreak})`),
        numberTile(playTime(s.playMs), 'czas gry'),
        numberTile(s.hostGames, 'gry jako host'),
        numberTile(s.pointedAt, 'wskazania w "Kto z nas"')
    );

    return [
        statSection('Wygrane', ...winGauge(s)),
        statSection('Wygrane według roli', donuts),
        statSection(`Ostatnie ${HISTORY_FORM} rund`, formStrip(profile.history)),
        statSection('Skuteczność',
            rateBar('Trafne głosy', s.correctVotes, s.playerGames),
            rateBar('Niewykryty impostor', Math.max(0, s.impostorGames - caughtImpostor), s.impostorGames, 'var(--danger)'),
            rateBar('Ostatnia szansa', s.guessesCorrect, s.guesses, 'var(--danger)')),
        statSection('Role', ...splitBar(roles)),
        statSection('Tryby', ...splitBar(modes)),
        statSection('Ulubione kategorie', ...topCategories(s.categories)),
        numbers
    ];
}

function badgeCard(badge, profile) {
    const status = Badges.status(badge, profile);
    const earned = status.tier >= 0;
    const hidden = badge.secret && !earned;
    const tier = earned ? Badges.TIERS[status.tier] : null;
    const card = createElement('div', `badge-card ${earned ? 'tier-' + (badge.feat ? 'special' : tier.id) : 'locked'}`);
    if (profile.unseenBadges.includes(badge.id)) card.classList.add('is-new');

    card.append(createElement('div', 'badge-icon', hidden ? '❓' : badge.icon));
    const info = createElement('div', 'badge-info');
    info.append(createElement('div', 'badge-name', hidden ? '???' : badge.name));
    info.append(createElement('div', 'badge-tier', !earned ? (hidden ? 'Sekretna odznaka' : 'Do zdobycia') : badge.feat ? 'Zdobyta' : tier.name));
    info.append(createElement('div', 'badge-description', hidden ? 'Odkryjesz ją, gdy ją zdobędziesz' : badge.description));
    if (!badge.feat) {
        const bar = createElement('div', 'badge-progress');
        const fill = createElement('div', 'badge-progress-fill');
        const goal = status.next || badge.steps[badge.steps.length - 1];
        fill.style.width = `${Math.min(100, status.value / goal * 100)}%`;
        bar.append(fill);
        info.append(bar, createElement('div', 'badge-count', status.next ? `${status.value} / ${status.next}` : `${status.value} - najwyższy poziom`));
    }
    card.append(info);
    return card;
}

function renderBadgesTab(profile) {
    const order = badge => { const st = Badges.status(badge, profile); return st.tier >= 0 ? -10 - st.tier : badge.secret ? 1 : 0; };
    const badges = [...Badges.BADGES].sort((a, b) => order(a) - order(b));
    const earned = badges.filter(badge => Badges.status(badge, profile).tier >= 0).length;
    const list = createElement('div', 'badges-list');
    list.append(...badges.map(badge => badgeCard(badge, profile)));
    return [createElement('p', 'profile-summary', `Zdobyte: ${earned} / ${Badges.BADGES.length}`), list];
}

function historyDate(at) {
    const date = new Date(at), now = new Date();
    const time = date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
    const days = Math.round((new Date(now.toDateString()) - new Date(date.toDateString())) / 86400000);
    if (days === 0) return `dziś ${time}`;
    if (days === 1) return `wczoraj ${time}`;
    return date.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
}

function renderHistoryTab(profile) {
    if (!profile.history.length) return [createElement('p', 'profile-empty', 'Tu zobaczysz swoje ostatnie rundy.')];
    return profile.history.map(game => {
        const row = createElement('div', `history-row ${game.won ? 'is-win' : 'is-lose'}`);
        const top = createElement('div', 'history-top');
        top.append(createElement('span', 'history-result', game.won ? 'Wygrana' : 'Przegrana'),
            createElement('span', 'history-date', historyDate(game.at)));
        const details = [MODE_NAMES[game.mode] || game.mode, game.category, ROLE_LABELS[game.role] || game.role, `${game.players} graczy`].filter(Boolean);
        row.append(top, createElement('div', 'history-details', details.join(' · ')));
        if (game.subject) row.append(createElement('div', 'history-subject', game.subject));
        return row;
    });
}

// ===== KROPKA "NOWE ODZNAKI" PRZY AWATARZE W MENU =====

function updateProfileDot() {
    const unseen = ProfileStore.get().unseenBadges.length > 0;
    byId('player-stats').querySelector('.main-avatar').classList.toggle('has-new', unseen);
    byId('profile-tabs').querySelectorAll('.has-new').forEach(tab => tab.classList.toggle('has-new', unseen));
}

// ===== ZAPIS RUND =====
// Dane z początku rundy i z głosowania, potrzebne do statystyk po wynikach

let roundInfo = null;

function noteRoundStart(data) {
    if (data.countdown || !roundInfo) roundInfo = { startedAt: Date.now(), category: data.category, answerType: data.answerType, vote: null };
    else roundInfo.category = data.category;     // nowe hasło od hosta albo powrót do gry - runda ta sama
}

function noteVote(vote) {
    if (roundInfo) roundInfo.vote = vote;
}

// Runda gościa: rekord liczy progress.js (te same zasady co serwer dla kont), zapisuje profileStore.js.
// Gracz z kontem tu nie trafia - jego rundę zapisał serwer (app.js: showResults, results.progress).
async function recordFinishedGame(results) {
    const game = ProgressCore.gameRecord(results, myPlayerId, {
        at: Date.now(),
        host: amIHost,
        category: roundInfo && roundInfo.category,
        startedAt: roundInfo && roundInfo.startedAt,
        answerType: roundInfo && roundInfo.answerType,
        votePlayers: roundInfo && roundInfo.vote && roundInfo.vote.players
    });
    roundInfo = null;
    if (!game) return;
    const earned = await ProfileStore.recordGame(game);
    showEarnedBadges(earned);
    updateProfileDot();
}

// Nowe odznaki pod wynikiem rundy (pokazują się razem z werdyktem - style.css .res-reveal)
function showEarnedBadges(earned) {
    const box = byId('res-badges');
    box.replaceChildren(...earned.map(({ id, tier }, i) => {
        const badge = Badges.byId(id);
        const item = createElement('div', `res-badge tier-${badge.feat ? 'special' : Badges.TIERS[tier].id}`);
        item.style.animationDelay = `${0.5 + i * 0.25}s`;
        item.append(createElement('span', 'res-badge-icon', badge.icon),
            createElement('span', 'res-badge-text', `${badge.name}${badge.feat ? '' : ' · ' + Badges.TIERS[tier].name}`));
        return item;
    }));
    box.classList.toggle('hidden', earned.length === 0);
    if (earned.length) setTimeout(() => sfx.play('badge'), RESULTS_SUSPENSE_MS + 500);
}

ProfileStore.onChange(() => { if (currentScreen === 'screen-profile') renderProfileHeader(); });
updateProfileDot();
