// IKONY GRY (odznaki, role, okienko instalacji, liczba graczy) - własne grafiki SVG zamiast emoji:
// wyglądają identycznie na każdym telefonie i pasują do stylu gry (płaskie kolory, czarny obrys).
// Użycie: GameIcons.svg('veteran') -> znaczniki <svg>, GameIcons.element('veteran') -> element do wstawienia,
// a w HTML <span data-icon="ui_fast"></span> wypełnia się samo po wczytaniu strony.
// Ładowany przed badges.js, profile.js i app.js.

(function (root) {
    'use strict';

    const O = 'stroke="#111" stroke-width="2.6" stroke-linejoin="round"';
    const INK = '#141414';

    function star(cx, cy, R, r, n = 5) {
        const pts = [];
        for (let i = 0; i < n * 2; i++) {
            const a = -Math.PI / 2 + i * Math.PI / n, rad = i % 2 ? r : R;
            pts.push(`${(cx + rad * Math.cos(a)).toFixed(2)},${(cy + rad * Math.sin(a)).toFixed(2)}`);
        }
        return pts.join(' ');
    }
    const at = (x, y, s, body) => `<g transform="translate(${x - 24 * s} ${y - 24 * s}) scale(${s})">${body}</g>`;
    // linia z obrysem: czarna szersza pod kolorową
    const outlinedLine = (d, color, w) => `<path d="${d}" fill="none" stroke="#111" stroke-width="${w + 3.4}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

    // ===== POSTACIE IMPOSTORA =====
    const WOLF = `
        <path d="M11 13l-3-10l9 6zM37 13l3-10l-9 6z" fill="#6d7a7b" ${O}/>
        <g fill="#ecf0f1" ${O}><circle cx="12" cy="17" r="6"/><circle cx="24" cy="11" r="7"/><circle cx="36" cy="17" r="6"/><circle cx="9" cy="28" r="5.5"/><circle cx="39" cy="28" r="5.5"/></g>
        <path d="M14 18h20l-2 15c-1 6-4 10-8 10s-7-4-8-10z" fill="#7f8c8d" ${O}/>
        <path d="M17 24l6 2l-6 1.5z" fill="#f1c40f"/><path d="M31 24l-6 2l6 1.5z" fill="#f1c40f"/>
        <ellipse cx="24" cy="35" rx="5" ry="4" fill="#bdc3c7"/>
        <ellipse cx="24" cy="33" rx="2.3" ry="1.6" fill="${INK}"/>
        <path d="M21 38.5q3 1.5 6 0" fill="none" stroke="${INK}" stroke-width="1.5" stroke-linecap="round"/>
        <path d="M25.5 38.6l.8 2.6l1-2.8z" fill="#fff"/>`;
    const NOIR = (scarf = '#e74c3c', coat = '#8a6d52') => `
        <path d="M9 47l3-18c1-4 5-6 12-6s11 2 12 6l3 18z" fill="${coat}" ${O}/>
        <path d="M17 24l7 12l7-12l-3-2h-8z" fill="${scarf}" ${O}/>
        <path d="M17 25l-4 7M31 25l4 7" stroke="#2e241c" stroke-width="2"/>
        <ellipse cx="24" cy="17" rx="7.5" ry="7.5" fill="#3d3d3d" ${O}/>
        <path d="M15 13C15 6 19 3 24 3s9 3 9 10z" fill="${INK}" ${O}/>
        <ellipse cx="24" cy="13" rx="15" ry="3.4" fill="${INK}" ${O}/>
        <path d="M19 18h3.5M25.5 18h3.5" stroke="#f1c40f" stroke-width="1.8" stroke-linecap="round"/>`;
    const CROSSHAIR = '<circle cx="24" cy="24" r="18" fill="none" stroke="#111" stroke-width="6"/><circle cx="24" cy="24" r="18" fill="none" stroke="#e74c3c" stroke-width="2.8"/>'
        + outlinedLine('M24 2v6M24 40v6M2 24h6M40 24h6', '#e74c3c', 2.8);
    const ACCOMPLICES = at(17, 21, 0.68, NOIR('#9b59b6', '#6e5a80')) + at(30, 27, 0.78, NOIR());

    // ===== IKONY =====
    const ICONS = {
        // sekretna odznaka (jeszcze nieodkryta)
        secret: { name: 'Sekretna', svg: `
            <circle cx="24" cy="24" r="19" fill="#3a3a3a" ${O}/>
            <path d="M18 19c0-4 2.7-6.5 6-6.5s6 2.3 6 5.8c0 4.2-6 5-6 9.2" fill="none" stroke="#bdc3c7" stroke-width="4" stroke-linecap="round"/>
            <circle cx="24" cy="34.5" r="2.6" fill="#bdc3c7"/>` },
        // ----- odznaki z poziomami -----
        veteran: { name: 'Weteran', svg: `
            <path d="M12 3h9l6 15h-9z" fill="#e74c3c" ${O}/>
            <path d="M36 3h-9l-6 15h9z" fill="#3498db" ${O}/>
            <circle cx="24" cy="31" r="13" fill="#f1c40f" ${O}/>
            <circle cx="24" cy="31" r="9" fill="#d4a20b"/>
            <polygon points="${star(24, 31.5, 6.5, 2.8)}" fill="#fff4c2"/>` },
        bluffer: { name: 'Mistrz blefu', svg: WOLF },
        hunter: { name: 'Łowca impostorów', svg: at(24, 25, 0.72, NOIR()) + CROSSHAIR },
        clean: { name: 'Czysta karta', svg: `
            <g transform="rotate(-8 24 24)">
                <rect x="11" y="5" width="26" height="38" rx="5" fill="#ecf0f1" ${O}/>
                <path d="M16.5 25l5.5 5.5l10-12" fill="none" stroke="#2ecc71" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
            </g>` },
        lastChance: { name: 'Ostatnia szansa', svg: `
            <circle cx="21" cy="27" r="17" fill="#e74c3c" ${O}/>
            <circle cx="21" cy="27" r="12" fill="#ecf0f1"/>
            <circle cx="21" cy="27" r="7.5" fill="#e74c3c"/>
            <circle cx="21" cy="27" r="3" fill="#ecf0f1"/>
            ${outlinedLine('M21 27L39 9', '#8b5a2b', 3)}
            <path d="M36 12l2-9l7 7l-9 2z" fill="#f1c40f" ${O}/>` },
        streak: { name: 'Seria', svg: `
            <path d="M24 3c6 9 15 15 15 27c0 9-7 15-15 15s-15-6-15-15c0-8 5-12 8-19c2 5 4 7 7-8z" fill="#e67e22" ${O}/>
            <path d="M24 17c4 6 9 10 9 16c0 6-4 10-9 10s-9-4-9-10c0-5 4-8 9-16z" fill="#f1c40f"/>
            <path d="M24 28c2 3 4 5 4 8c0 3-2 5-4 5s-4-2-4-5c0-3 2-5 4-8z" fill="#fff4c2"/>` },
        host: { name: 'Gospodarz', svg: `
            <path d="M6 17l8 10l10-15l10 15l8-10l-4 20H10z" fill="#f1c40f" ${O}/>
            <rect x="10" y="31" width="28" height="7" rx="1" fill="#d4a20b" ${O}/>
            <circle cx="6" cy="16" r="3" fill="#f1c40f" ${O}/><circle cx="24" cy="11" r="3" fill="#f1c40f" ${O}/><circle cx="42" cy="16" r="3" fill="#f1c40f" ${O}/>
            <circle cx="24" cy="34.5" r="2.6" fill="#e74c3c"/><circle cx="16" cy="34.5" r="2" fill="#3498db"/><circle cx="32" cy="34.5" r="2" fill="#3498db"/>` },
        pointed: { name: 'Wskazany palcem', svg: `
            <rect x="3" y="20" width="8" height="21" rx="2" fill="#e74c3c" ${O}/>
            <path d="M10 38V24c0-3 2-5 5-5h22c2.5 0 4 1.5 4 3.5S39.5 26 37 26h-9c2 0 3 1.3 3 3s-1 3-3 3c2 0 3 1.3 3 3s-1 3-3 3h-1c1.5 0 2.5 1.2 2.5 2.5S26.5 43 25 43H15c-3 0-5-2-5-5z" fill="#f0d9b5" ${O}/>
            <path d="M28 32h-4M28 38h-4M16 25c3-1 6-1 8 1" fill="none" stroke="#c9a77d" stroke-width="1.8" stroke-linecap="round"/>` },
        scapegoat: { name: 'Kozioł ofiarny', svg: `
            <path d="M16 13C10 10 8 4 12 2c1 5 5 7 7 9z" fill="#c8a27a" ${O}/>
            <path d="M32 13c6-3 8-9 4-11c-1 5-5 7-7 9z" fill="#c8a27a" ${O}/>
            <ellipse cx="9" cy="20" rx="6" ry="3" transform="rotate(-20 9 20)" fill="#95a5a6" ${O}/>
            <ellipse cx="39" cy="20" rx="6" ry="3" transform="rotate(20 39 20)" fill="#95a5a6" ${O}/>
            <path d="M20 37l4 10l4-10z" fill="#bdc3c7" ${O}/>
            <path d="M17 11h14c3 0 4 2 4 5l-2 16c-1 6-5 9-9 9s-8-3-9-9l-2-16c0-3 1-5 4-5z" fill="#ecf0f1" ${O}/>
            <ellipse cx="19" cy="22" rx="2.2" ry="2.6" fill="${INK}"/><ellipse cx="29" cy="22" rx="2.2" ry="2.6" fill="${INK}"/>
            <ellipse cx="24" cy="33" rx="4.5" ry="3" fill="#c9c9c9"/>
            <circle cx="22.3" cy="33" r="1" fill="${INK}"/><circle cx="25.7" cy="33" r="1" fill="${INK}"/>` },
        jester: { name: 'Błazen', svg: `
            <path d="M14 26C10 20 7 16 3 11c8 1 13 5 16 10z" fill="#9b59b6" ${O}/>
            <path d="M34 26c4-6 7-10 11-15c-8 1-13 5-16 10z" fill="#9b59b6" ${O}/>
            <path d="M16 24c1-8 4-14 8-19c4 5 7 11 8 19z" fill="#f1c40f" ${O}/>
            <circle cx="24" cy="32" r="11" fill="#ecf0f1" ${O}/>
            <rect x="12" y="21" width="24" height="6" rx="3" fill="#8e44ad" ${O}/>
            <circle cx="3.5" cy="11" r="3" fill="#f1c40f" ${O}/><circle cx="24" cy="5" r="3" fill="#9b59b6" ${O}/><circle cx="44.5" cy="11" r="3" fill="#f1c40f" ${O}/>
            <circle cx="20" cy="32" r="1.8" fill="${INK}"/><circle cx="28" cy="32" r="1.8" fill="${INK}"/>
            <path d="M19 36.5q5 4 10 0" fill="none" stroke="#e74c3c" stroke-width="2.2" stroke-linecap="round"/>` },
        accomplice: { name: 'Wspólnik', svg: ACCOMPLICES },
        detective: { name: 'Detektyw', svg: `
            <path d="M11 20C11 10 15 6 22 6s11 4 11 14z" fill="#8b5a2b" ${O}/>
            <ellipse cx="22" cy="20.5" rx="18" ry="4.5" fill="#6b4423" ${O}/>
            <rect x="11" y="14.5" width="22" height="4" fill="#2c2c2c"/>
            ${outlinedLine('M33 37l8 8', '#6b4423', 4.5)}
            <circle cx="28" cy="32" r="8" fill="#7fd4ff" stroke="#111" stroke-width="7"/>
            <circle cx="28" cy="32" r="8" fill="#7fd4ff" stroke="#95a5a6" stroke-width="3.2"/>
            <path d="M24 29q2-3 5-3" fill="none" stroke="#ecf0f1" stroke-width="2" stroke-linecap="round"/>` },
        changeling: { name: 'Podmieniec', svg: `
            <rect x="3" y="12" width="14" height="20" rx="2.5" transform="rotate(-12 10 22)" fill="#ecf0f1" ${O}/>
            <rect x="31" y="12" width="14" height="20" rx="2.5" transform="rotate(12 38 22)" fill="#ecf0f1" ${O}/>
            <path d="M7 18h5M7 22h4" transform="rotate(-12 10 22)" stroke="#95a5a6" stroke-width="1.6" stroke-linecap="round"/>
            <path d="M35 18h5M35 22h4" transform="rotate(12 38 22)" stroke="#95a5a6" stroke-width="1.6" stroke-linecap="round"/>
            <rect x="15" y="9" width="18" height="26" rx="3" fill="#1abc9c" ${O}/>
            <path d="M20.5 18c0-2.5 1.6-4 3.5-4s3.5 1.4 3.5 3.5c0 2.5-3.5 3-3.5 5.5" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>
            <circle cx="24" cy="28.5" r="1.7" fill="#fff"/>` },
        // ----- odznaki jednorazowe -----
        firstBlood: { name: 'Pierwsza krew', svg: `
            <path d="M24 4c6 10 13 17 13 26c0 8-6 14-13 14s-13-6-13-14c0-9 7-16 13-26z" fill="#e74c3c" ${O}/>
            <path d="M17 29c0-4 2-7 4-10" fill="none" stroke="#ff8a7d" stroke-width="2.6" stroke-linecap="round"/>
            <path d="M24 44c-5 0-9-3-11-7c3 2 7 3 11 3s8-1 11-3c-2 4-6 7-11 7z" fill="#b83227"/>` },
        invisible: { name: 'Niewidzialny', svg: `
            <path d="M10 44V22c0-10 6-16 14-16s14 6 14 16v22l-4.5-4l-4.7 4l-4.8-4l-4.8 4l-4.7-4z" fill="#ffffff" ${O}/>
            <path d="M14 22c0-7 4-11 9-12" fill="none" stroke="#dfe9f2" stroke-width="3" stroke-linecap="round"/>
            <ellipse cx="19" cy="22" rx="2.6" ry="3.6" fill="${INK}"/><ellipse cx="29" cy="22" rx="2.6" ry="3.6" fill="${INK}"/>
            <ellipse cx="24" cy="31" rx="3" ry="3.6" fill="${INK}"/>` },
        unanimous: { name: 'Jednomyślność', svg: `
            <rect x="14" y="4" width="20" height="24" rx="2" transform="rotate(-6 24 16)" fill="#ecf0f1" ${O}/>
            <path d="M18.5 15l4 4l7-8" fill="none" stroke="#2ecc71" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>
            <rect x="6" y="23" width="36" height="21" rx="3" fill="#3498db" ${O}/>
            <rect x="13" y="22" width="22" height="4" rx="2" fill="${INK}"/>
            <path d="M6 30h36" stroke="#2c7bb6" stroke-width="2"/>` },
        betrayal: { name: 'Zdrada', svg: `
            <g transform="rotate(40 24 24)">
                <path d="M24 2l4.5 7v20h-9V9z" fill="#d0d6dc" ${O}/>
                <path d="M24 7v21" stroke="#9aa4ad" stroke-width="2"/>
                <rect x="14" y="28.5" width="20" height="4.5" rx="2.2" fill="#f1c40f" ${O}/>
                <rect x="20.5" y="33" width="7" height="9" rx="2" fill="#8b5a2b" ${O}/>
                <circle cx="24" cy="44.5" r="2.6" fill="#f1c40f" ${O}/>
            </g>
            <path d="M38 6c1.5 2.5 3 4 3 6a3 3 0 0 1-6 0c0-2 1.5-3.5 3-6z" fill="#e74c3c" ${O}/>` },
        fullHouse: { name: 'Pełna chata', svg: `
            <path d="M22.3 8.6c.8-1.6 2.6-1.6 3.4 0l11.6 27.6c.9 2.2-.5 4.3-2.9 4.6c-6.9.9-13.9.9-20.8 0c-2.4-.3-3.8-2.4-2.9-4.6z" fill="#9b59b6" ${O}/>
            <path d="M17.6 21.5q6.4 3 12.8 0M14.4 30q9.6 4.2 19.2 0" fill="none" stroke="#f1c40f" stroke-width="3.2" stroke-linecap="round"/>
            <circle cx="24" cy="7" r="3.6" fill="#f1c40f" ${O}/>
            <circle cx="8" cy="14" r="2" fill="#e74c3c"/><circle cx="41" cy="19" r="2" fill="#3498db"/><circle cx="9" cy="33" r="1.8" fill="#2ecc71"/>` },
        nightOwl: { name: 'Nocny marek', svg: `
            <path d="M14 3a11 11 0 1 0 12 15a9 9 0 1 1-12-15z" fill="#f1c40f" ${O}/>
            <path d="M38 6l1 2l2 .5l-2 .8l-1 2l-1-2l-2-.8l2-.5zM43 15l.7 1.4l1.4.4l-1.4.5l-.7 1.4l-.7-1.4l-1.4-.5l1.4-.4z" fill="#f1c40f"/>
            <path d="M14 18l-1-8l7 5zM34 18l1-8l-7 5z" fill="#6d4a2c" ${O}/>
            <ellipse cx="24" cy="30" rx="15" ry="15" fill="#7a5230" ${O}/>
            <ellipse cx="24" cy="34" rx="8.5" ry="9" fill="#c9a27a"/>
            <path d="M24 34v6M20.5 36.5l1.5 2M27.5 36.5l-1.5 2" stroke="#a8825c" stroke-width="1.3" stroke-linecap="round"/>
            <circle cx="17.5" cy="25" r="6.5" fill="#ecf0f1" ${O}/><circle cx="30.5" cy="25" r="6.5" fill="#ecf0f1" ${O}/>
            <circle cx="18" cy="25.5" r="3.2" fill="${INK}"/><circle cx="30" cy="25.5" r="3.2" fill="${INK}"/>
            <circle cx="19" cy="24.3" r="1" fill="#fff"/><circle cx="31" cy="24.3" r="1" fill="#fff"/>
            <path d="M22 30l2 3.5l2-3.5z" fill="#e67e22" ${O}/>` },
        installed: { name: 'Stały bywalec', svg: `
            <rect x="11" y="3" width="26" height="42" rx="5" fill="#3d4b57" ${O}/>
            <rect x="14" y="8" width="20" height="30" rx="2" fill="#1f262c"/>
            <rect x="17" y="13" width="14" height="14" rx="3.5" fill="#e74c3c" stroke="#111" stroke-width="1.6"/>
            <path d="M20.5 21.5c0-3.5 1.5-5 3.5-5s3.5 1.5 3.5 5z" fill="#141414"/><ellipse cx="24" cy="21.6" rx="5.5" ry="1.4" fill="#141414"/><path d="M21 24h6v2.6h-6z" fill="#141414"/>
            <rect x="18" y="30" width="12" height="2.2" rx="1.1" fill="#7f8c8d"/>
            <circle cx="24" cy="41.5" r="1.6" fill="#7f8c8d"/>
            <circle cx="36" cy="38" r="7" fill="#2ecc71" ${O}/>
            <path d="M32.6 38l2.4 2.4l4.2-4.6" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>` },
        // ----- interfejs -----
        ui_fullscreen: { name: 'Pełny ekran', svg: outlinedLine('M6 16V6h10M42 16V6H32M6 32v10h10M42 32v10H32', '#2ecc71', 4.5) + `<rect x="15" y="15" width="18" height="18" rx="3" fill="#2a2a2a" ${O}/><path d="M20 24h8" stroke="#2ecc71" stroke-width="3" stroke-linecap="round"/>` },
        ui_fast: { name: 'Szybsze wejście', svg: `<path d="M28 3L10 27h11l-4 18l20-26H25z" fill="#f1c40f" ${O}/><path d="M27 8L15 24" stroke="#fff4c2" stroke-width="2" stroke-linecap="round"/>` },
        ui_phone: { name: 'Ikona na telefonie', svg: `
            <rect x="11" y="3" width="26" height="42" rx="5" fill="#3d4b57" ${O}/>
            <rect x="14" y="8" width="20" height="30" rx="2" fill="#1f262c"/>
            <rect x="17" y="12" width="6" height="6" rx="1.6" fill="#5b7a99"/><rect x="25" y="12" width="6" height="6" rx="1.6" fill="#7fa391"/>
            <rect x="17" y="20" width="6" height="6" rx="1.6" fill="#a3907c"/><rect x="25" y="20" width="6" height="6" rx="1.6" fill="#e74c3c" stroke="#111" stroke-width="1"/>
            <path d="M26.4 24.4c0-1.7.7-2.4 1.6-2.4s1.6.7 1.6 2.4z" fill="#141414"/><ellipse cx="28" cy="24.4" rx="2.4" ry=".7" fill="#141414"/>
            <rect x="17" y="28" width="6" height="6" rx="1.6" fill="#9a8fb0"/>
            <circle cx="24" cy="41.5" r="1.6" fill="#7f8c8d"/>` },
        ui_players: { name: 'Gracze', svg: at(15, 22, 0.62, `<circle cx="24" cy="15" r="8" fill="#7f8c99" ${O}/><path d="M9 44c0-10 6-17 15-17s15 7 15 17z" fill="#7f8c99" ${O}/>`) + at(33, 22, 0.62, `<circle cx="24" cy="15" r="8" fill="#8a9a8e" ${O}/><path d="M9 44c0-10 6-17 15-17s15 7 15 17z" fill="#8a9a8e" ${O}/>`) + at(24, 28, 0.78, `<circle cx="24" cy="15" r="8" fill="#a9b4bd" ${O}/><path d="M9 44c0-10 6-17 15-17s15 7 15 17z" fill="#a9b4bd" ${O}/>`) },
    };

    const cache = {};
    function svg(id) {
        const icon = ICONS[id];
        if (!icon) return '';
        if (!cache[id]) cache[id] = `<svg class="game-icon" viewBox="0 0 48 48" aria-hidden="true">${icon.svg}</svg>`;
        return cache[id];
    }

    function element(id, className = '') {
        const span = document.createElement('span');
        span.className = `game-icon-wrap ${className}`.trim();
        span.innerHTML = svg(id);
        return span;
    }

    root.GameIcons = { svg, element, has: id => Boolean(ICONS[id]) };

    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = svg(el.dataset.icon); });
    });
})(window);
