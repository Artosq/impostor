// STRONA ANALITYKI: dane dzienne z serwera (/api/analytics, tylko dla admina), filtry, kafelki, wykresy, tabela.
// Dostęp: zalogowany w grze kontem admina (sesja z auth.js; e-mail admina w ADMIN_EMAILS na serwerze).
// Paleta wykresów: kolory gry przyciemnione pod ciemne tło (sprawdzone pod kątem daltonizmu i kontrastu).

(() => {
    'use strict';

    const COLORS = ['#1fa85a', '#2f80c4', '#c98500', '#9c5cd6', '#c9661c', '#14937a'];
    const GRID = '#2c2c2c';
    const CARD = '#1f1f1f';
    const MONTHS = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
    const NAMES = {
        source: { zaproszenie: 'Zaproszenie (link / QR)', bezposrednio: 'Bezpośrednio', wyszukiwarka: 'Wyszukiwarka', 'media spolecznosciowe': 'Media społecznościowe', 'inna strona': 'Inna strona', inne: 'Inne' },
        device: { telefon: 'Telefon', komputer: 'Komputer', tablet: 'Tablet', inne: 'Inne' },
        mode: { impostor: 'Impostor', pytania: 'Pytania' },
        login: { google: 'Google', email: 'Link z maila' }
    };
    const SETTINGS_KEY = 'analyticsFilters';
    const $ = id => document.getElementById(id);

    let settings = { range: '30', group: 'day', from: '', to: '' };
    try { settings = { ...settings, ...JSON.parse(localStorage.getItem(SETTINGS_KEY)) }; } catch (e) { /* domyślne */ }
    let data = null;              // { today, rows, online }
    const charts = {};

    // ===== DATY =====
    const addDays = (day, n) => { const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
    const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 86400000);
    const dayList = (from, to) => { const out = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(d); return out; };
    const fmtDay = day => `${+day.slice(8)} ${MONTHS[+day.slice(5, 7) - 1]}`;
    function bucketOf(day) {
        if (settings.group === 'month') return day.slice(0, 7);
        if (settings.group === 'week') {
            const dow = (new Date(day + 'T12:00:00Z').getUTCDay() + 6) % 7;     // poniedziałek = 0
            return addDays(day, -dow);
        }
        return day;
    }
    function bucketLabel(key) {
        if (settings.group === 'month') return `${MONTHS[+key.slice(5, 7) - 1]} ${key.slice(0, 4)}`;
        if (settings.group === 'week') return `od ${fmtDay(key)}`;
        return fmtDay(key);
    }

    // Zakres z filtrów + poprzedni okres tej samej długości (do porównania na kafelkach)
    function currentRange() {
        const today = data ? data.today : new Date().toISOString().slice(0, 10);
        if (settings.range === 'custom' && settings.from && settings.to) {
            const from = settings.from <= settings.to ? settings.from : settings.to;
            const to = settings.from <= settings.to ? settings.to : settings.from;
            const len = daysBetween(from, to) + 1;
            return { from, to, prevFrom: addDays(from, -len), prevTo: addDays(from, -1) };
        }
        if (settings.range === 'all') {
            const first = data && data.rows.length ? data.rows[0].day : today;
            return { from: first, to: today, prevFrom: null, prevTo: null };
        }
        const n = Number(settings.range) || 30;
        const from = addDays(today, -(n - 1));
        return { from, to: today, prevFrom: addDays(from, -n), prevTo: addDays(from, -1) };
    }

    // ===== DANE =====
    // rows -> dzień -> metryka -> klucz -> wartość
    function index(rows) {
        const byDay = {};
        rows.forEach(r => {
            ((byDay[r.day] ||= {})[r.metric] ||= {})[r.key] = r.value;
        });
        return byDay;
    }
    const val = (byDay, day, metric, key = '') => (byDay[day] && byDay[day][metric] && byDay[day][metric][key]) || 0;

    function totals(byDay, from, to) {
        const days = dayList(from, to);
        const sum = (metric, key) => days.reduce((s, d) => s + val(byDay, d, metric, key), 0);
        const today = data.today;
        // powroty: tylko kohorty, dla których minął już cały okres
        const cohort = (metric, wait) => {
            const complete = days.filter(d => daysBetween(d, today) >= wait);
            const back = complete.reduce((s, d) => s + val(byDay, d, metric), 0);
            const fresh = complete.reduce((s, d) => s + val(byDay, d, 'new_visitors'), 0);
            return fresh ? back / fresh : null;
        };
        const rounds = sum('rounds');
        const visitors = sum('visitors');
        return {
            days: days.length,
            avgVisitors: visitors / days.length,
            newVisitors: sum('new_visitors'),
            visits: sum('visits'),
            rounds,
            rooms: sum('rooms'),
            avgPlayers: rounds ? sum('round_players_sum') / rounds : null,
            avgRoundMs: rounds ? sum('round_ms_sum') / rounds : null,
            peak: Math.max(0, ...days.map(d => val(byDay, d, 'peak_online'))),
            returnD1: cohort('return_d1', 2),
            returnD7: cohort('return_d7', 8),
            installedShare: visitors ? sum('installed') / visitors : null,
            logins: Object.keys(NAMES.login).reduce((s, k) => s + sum('login', k), 0)
        };
    }

    // suma po kluczach metryki (źródła, urządzenia, tryby...) w zakresie
    function breakdown(byDay, from, to, metric) {
        const out = {};
        dayList(from, to).forEach(d => {
            Object.entries((byDay[d] && byDay[d][metric]) || {}).forEach(([k, v]) => { out[k] = (out[k] || 0) + v; });
        });
        return out;
    }

    // ===== KAFELKI =====
    const fmtInt = n => Math.round(n).toLocaleString('pl-PL');
    const fmtDec = n => n.toLocaleString('pl-PL', { maximumFractionDigits: 1 });
    const fmtPct = n => n === null ? '–' : `${Math.round(n * 100)}%`;
    const fmtDur = ms => { if (ms === null) return '–'; const s = Math.round(ms / 1000); return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`; };

    function renderTiles(cur, prev) {
        const tiles = [
            ['Gracze dziennie (średnio)', cur.avgVisitors, prev && prev.avgVisitors, fmtDec],
            ['Nowi gracze', cur.newVisitors, prev && prev.newVisitors, fmtInt],
            ['Wejścia do gry', cur.visits, prev && prev.visits, fmtInt],
            ['Rozegrane rundy', cur.rounds, prev && prev.rounds, fmtInt],
            ['Założone pokoje', cur.rooms, prev && prev.rooms, fmtInt],
            ['Graczy w rundzie (średnio)', cur.avgPlayers, prev && prev.avgPlayers, v => v === null ? '–' : fmtDec(v)],
            ['Długość rundy (średnio)', cur.avgRoundMs, prev && prev.avgRoundMs, fmtDur],
            ['Szczyt online', cur.peak, prev && prev.peak, fmtInt],
            ['Wróciło po 1 dniu', cur.returnD1, prev && prev.returnD1, fmtPct],
            ['Wróciło w ciągu 7 dni', cur.returnD7, prev && prev.returnD7, fmtPct],
            ['Z zainstalowaną aplikacją', cur.installedShare, prev && prev.installedShare, fmtPct],
            ['Logowania', cur.logins, prev && prev.logins, fmtInt]
        ];
        $('an-tiles').replaceChildren(...tiles.map(([label, value, before, fmt]) => {
            const tile = document.createElement('div');
            tile.className = 'an-tile';
            const delta = document.createElement('div');
            delta.className = 'an-tile-delta';
            if (prev && value !== null && before !== null && before !== undefined) {
                if (before === 0) delta.textContent = value > 0 ? 'nowość w tym okresie' : 'bez zmian';
                else {
                    const change = (value - before) / before;
                    delta.textContent = `${change >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(change * 100))}% vs poprzedni okres`;
                    delta.classList.add(change > 0.005 ? 'up' : change < -0.005 ? 'down' : 'flat');
                }
            } else delta.textContent = prev ? 'brak danych do porównania' : '';
            tile.innerHTML = `<div class="an-tile-label"></div><div class="an-tile-value"></div>`;
            tile.children[0].textContent = label;
            tile.children[1].textContent = fmt(value);
            tile.append(delta);
            return tile;
        }));
    }

    // ===== WYKRESY =====
    Chart.defaults.color = '#999';
    Chart.defaults.font.family = 'system-ui, -apple-system, "Segoe UI", sans-serif';
    Chart.defaults.font.size = 12;
    Chart.defaults.borderColor = GRID;
    Chart.defaults.plugins.tooltip.backgroundColor = '#111';
    Chart.defaults.plugins.tooltip.borderColor = '#444';
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.legend.labels.boxWidth = 12;
    Chart.defaults.plugins.legend.labels.boxHeight = 12;

    const axes = (stacked = false, percent = false) => ({
        x: { stacked, grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
        y: { stacked, beginAtZero: true, grid: { color: GRID }, border: { display: false },
             ticks: { precision: 0, maxTicksLimit: 5, callback: v => percent ? `${v}%` : v } }
    });

    function setEmpty(id, empty) {
        const canvas = $(id);
        let note = canvas.parentElement.querySelector('.an-empty');
        if (empty && !note) {
            note = document.createElement('div');
            note.className = 'an-empty';
            note.textContent = 'Brak danych w tym okresie';
            canvas.parentElement.append(note);
        }
        if (note) note.classList.toggle('hidden', !empty);
        canvas.classList.toggle('hidden', empty);
    }

    function draw(id, config, empty) {
        setEmpty(id, empty);
        if (charts[id]) charts[id].destroy();
        charts[id] = new Chart($(id), config);
    }

    const bar = (label, values, color, stack) => ({
        type: 'bar', label, data: values, backgroundColor: color, stack,
        borderRadius: 4, borderSkipped: 'start', maxBarThickness: 32,
        borderColor: CARD, borderWidth: stack ? { top: 2 } : 0
    });
    // ostatni odcinek przerywany, gdy ostatni punkt to trwający dzień (tydzień, miesiąc) - jeszcze niepełny
    let partialLast = false;
    const line = (label, values, color) => ({
        type: 'line', label, data: values, borderColor: color, backgroundColor: color,
        borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, pointHitRadius: 12, tension: 0.25, spanGaps: true,
        segment: { borderDash: ctx => partialLast && ctx.p1DataIndex === values.length - 1 ? [5, 5] : undefined }
    });
    const timeOptions = (stacked, percent) => ({
        responsive: true, maintainAspectRatio: false, animation: { duration: 400 },
        interaction: { mode: 'index', intersect: false },
        scales: axes(stacked, percent),
        plugins: { legend: { position: 'bottom' },
            tooltip: { callbacks: percent ? { label: c => `${c.dataset.label}: ${c.raw === null ? '–' : c.raw + '%'}` } : {} } }
    });

    // Słupki poziome: jedna seria, kategorie posortowane malejąco, udział % w podpisie
    function horizontal(id, counts, names, limit) {
        let entries = Object.entries(counts).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
        if (limit && entries.length > limit) entries = entries.slice(0, limit);
        const total = Object.values(counts).reduce((s, v) => s + v, 0);
        draw(id, {
            type: 'bar',
            data: {
                labels: entries.map(([k]) => (names && names[k]) || k),
                datasets: [{ data: entries.map(([, v]) => v), backgroundColor: COLORS[0], borderRadius: 4, borderSkipped: 'start', maxBarThickness: 22 }]
            },
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false, animation: { duration: 400 },
                scales: { x: { beginAtZero: true, grid: { color: GRID }, border: { display: false }, ticks: { precision: 0, maxTicksLimit: 5 } },
                          y: { grid: { display: false }, ticks: { color: '#ccc' } } },
                plugins: { legend: { display: false },
                    tooltip: { callbacks: { label: c => `${fmtInt(c.raw)} (${total ? Math.round(c.raw / total * 100) : 0}%)` } } }
            }
        }, entries.length === 0);
    }

    function renderCharts(byDay, range) {
        const days = dayList(range.from, range.to);
        const keys = [...new Set(days.map(bucketOf))];
        partialLast = range.to === data.today;
        const labels = keys.map((k, i) => bucketLabel(k) + (partialLast && i === keys.length - 1 ? ' (trwa)' : ''));
        const per = (fn, agg = 'sum') => keys.map(k => {
            const ds = days.filter(d => bucketOf(d) === k);
            const vals = ds.map(fn);
            return agg === 'max' ? Math.max(0, ...vals) : vals.reduce((s, v) => s + v, 0);
        });
        const has = arr => arr.some(v => v);

        const fresh = per(d => val(byDay, d, 'new_visitors'));
        const returning = per(d => Math.max(0, val(byDay, d, 'visitors') - val(byDay, d, 'new_visitors')));
        draw('ch-players', { data: { labels, datasets: [bar('Nowi', fresh, COLORS[0], 'p'), bar('Powracający', returning, COLORS[1], 'p')] }, options: timeOptions(true) }, !has(fresh) && !has(returning));

        const rounds = per(d => val(byDay, d, 'rounds'));
        const rooms = per(d => val(byDay, d, 'rooms'));
        draw('ch-games', { data: { labels, datasets: [line('Rundy', rounds, COLORS[0]), line('Pokoje', rooms, COLORS[1])] }, options: timeOptions(false) }, !has(rounds) && !has(rooms));

        const peak = per(d => val(byDay, d, 'peak_online'), 'max');
        const onlineOptions = timeOptions(false);
        onlineOptions.plugins.legend.display = false;
        draw('ch-online', { data: { labels, datasets: [line('Szczyt online', peak, COLORS[2])] }, options: onlineOptions }, !has(peak));

        // powroty: % kohorty (tylko dni, dla których minął cały okres)
        const pct = (metric, wait) => keys.map(k => {
            const ds = days.filter(d => bucketOf(d) === k && daysBetween(d, data.today) >= wait);
            const fresh = ds.reduce((s, d) => s + val(byDay, d, 'new_visitors'), 0);
            return fresh ? Math.round(ds.reduce((s, d) => s + val(byDay, d, metric), 0) / fresh * 100) : null;
        });
        const d1 = pct('return_d1', 2), d7 = pct('return_d7', 8);
        draw('ch-return', { data: { labels, datasets: [line('Po 1 dniu', d1, COLORS[1]), line('W ciągu 7 dni', d7, COLORS[3])] }, options: timeOptions(false, true) }, !d1.some(v => v !== null) && !d7.some(v => v !== null));

        const google = per(d => val(byDay, d, 'login', 'google'));
        const email = per(d => val(byDay, d, 'login', 'email'));
        draw('ch-logins', { data: { labels, datasets: [bar('Google', google, COLORS[1], 'l'), bar('Link z maila', email, COLORS[0], 'l')] }, options: timeOptions(true) }, !has(google) && !has(email));

        horizontal('ch-source', breakdown(byDay, range.from, range.to, 'source'), NAMES.source);
        horizontal('ch-device', breakdown(byDay, range.from, range.to, 'device'), NAMES.device);
        horizontal('ch-mode', breakdown(byDay, range.from, range.to, 'mode'), NAMES.mode);
        horizontal('ch-category', breakdown(byDay, range.from, range.to, 'category'), null, 10);

        // wielkość grup: słupki pionowe w kolejności liczby graczy
        const sizes = breakdown(byDay, range.from, range.to, 'room_size');
        const sizeKeys = Object.keys(sizes).map(Number).sort((a, b) => a - b);
        draw('ch-size', {
            type: 'bar',
            data: { labels: sizeKeys.map(n => n >= 10 ? '10+' : String(n)), datasets: [{ label: 'Rundy', data: sizeKeys.map(n => sizes[n]), backgroundColor: COLORS[5], borderRadius: 4, borderSkipped: 'start', maxBarThickness: 32 }] },
            options: { responsive: true, maintainAspectRatio: false, animation: { duration: 400 }, scales: axes(),
                plugins: { legend: { display: false }, tooltip: { callbacks: { title: c => `${c[0].label} graczy`, label: c => `${fmtInt(c.raw)} rund` } } } }
        }, sizeKeys.length === 0);
    }

    // ===== TABELA (dane dzienne) =====
    function renderTable(byDay, range) {
        const cols = [['Dzień', d => d], ['Gracze', d => val(byDay, d, 'visitors')], ['Nowi', d => val(byDay, d, 'new_visitors')],
            ['Wejścia', d => val(byDay, d, 'visits')], ['Rundy', d => val(byDay, d, 'rounds')], ['Pokoje', d => val(byDay, d, 'rooms')],
            ['Szczyt online', d => val(byDay, d, 'peak_online')], ['Logowania', d => val(byDay, d, 'login', 'google') + val(byDay, d, 'login', 'email')]];
        const table = $('an-table');
        const head = `<thead><tr>${cols.map(([n]) => `<th>${n}</th>`).join('')}</tr></thead>`;
        const body = dayList(range.from, range.to).reverse().map(d => `<tr>${cols.map(([, fn]) => `<td>${typeof fn(d) === 'number' ? fmtInt(fn(d)) : fn(d)}</td>`).join('')}</tr>`).join('');
        table.innerHTML = head + `<tbody>${body}</tbody>`;
    }

    // ===== FILTRY =====
    function syncFilters() {
        document.querySelectorAll('#an-range button').forEach(b => b.classList.toggle('active', b.dataset.range === settings.range));
        document.querySelectorAll('#an-group button').forEach(b => b.classList.toggle('active', b.dataset.group === settings.group));
        $('an-custom').classList.toggle('hidden', settings.range !== 'custom');
        try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* bez pamięci */ }
    }

    function render() {
        if (!data) return;
        syncFilters();
        const range = currentRange();
        if (settings.range === 'custom') { $('an-from').value = range.from; $('an-to').value = range.to; }
        const byDay = index(data.rows);
        $('an-range-label').textContent = `${fmtDay(range.from)} ${range.from.slice(0, 4)} – ${fmtDay(range.to)} ${range.to.slice(0, 4)}`
            + ` · ${daysBetween(range.from, range.to) + 1} dni` + (range.prevFrom ? ' · porównanie z poprzednim okresem tej samej długości' : '');
        const cur = totals(byDay, range.from, range.to);
        const prev = range.prevFrom ? totals(byDay, range.prevFrom, range.prevTo) : null;
        renderTiles(cur, prev);
        renderCharts(byDay, range);
        renderTable(byDay, range);
    }

    document.querySelectorAll('#an-range button').forEach(b => b.onclick = () => {
        settings.range = b.dataset.range;
        if (settings.range === 'custom' && !settings.from) { const r = currentRange(); settings.from = r.from; settings.to = r.to; }
        render();
    });
    document.querySelectorAll('#an-group button').forEach(b => b.onclick = () => { settings.group = b.dataset.group; render(); });
    $('an-from').onchange = () => { settings.from = $('an-from').value; render(); };
    $('an-to').onchange = () => { settings.to = $('an-to').value; render(); };
    $('an-refresh').onclick = () => load();

    // ===== DOSTĘP I POBIERANIE =====
    function gate(text) {
        $('an-loading').classList.add('hidden');
        $('an-main').classList.add('hidden');
        $('an-gate').classList.remove('hidden');
        $('an-gate-text').textContent = text;
    }

    async function load() {
        if (!Auth.enabled) return gate('Analityka działa po podłączeniu bazy Supabase do serwera gry.');
        // bez konta (albo konto gościa) nie pytamy serwera - i nie zakładamy tu nowego konta tymczasowego
        if (!Auth.userId() || Auth.isAnonymous()) return gate('Zaloguj się w grze kontem admina (Profil → „Konto gościa · Zaloguj się”), a potem wróć na tę stronę.');
        const token = await Auth.getToken();
        if (!token) return gate('Nie udało się potwierdzić logowania. Odśwież stronę.');

        $('an-refresh').disabled = true;
        try {
            // cały zapis od początku - dane dzienne są małe, a filtry działają potem bez ponownego pobierania
            const response = await fetch('/api/analytics', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
            const body = await response.json().catch(() => ({}));
            if (response.status === 401) return gate('Zaloguj się w grze kontem admina, a potem wróć na tę stronę.');
            if (response.status === 403) return gate(`To konto (${Auth.email() || 'bez adresu'}) nie ma dostępu do analityki. Adres admina wpisuje się w ustawieniach serwera (ADMIN_EMAILS).`);
            if (!response.ok) return gate(body.error || 'Nie udało się pobrać danych. Spróbuj za chwilę.');
            data = body;
            $('an-online-count').textContent = data.online;
            $('an-online').classList.remove('hidden');
            $('an-loading').classList.add('hidden');
            $('an-gate').classList.add('hidden');
            $('an-main').classList.remove('hidden');
            render();
        } catch (err) {
            gate('Brak połączenia z serwerem gry. Spróbuj za chwilę.');
        } finally {
            $('an-refresh').disabled = false;
        }
    }

    load();
    setInterval(() => { if (document.visibilityState === 'visible' && data) load(); }, 2 * 60 * 1000);
})();
