// DODATKI WIDOCZNE W GRZE: efekty wyrzucenia (pikselowe cząsteczki z CSS) i miniatury dodatków do panelu, ścieżki i sklepu.
// Style: sekcja "DODATKI" w style.css. Które dodatki gracz ma - inventory.js.

const Cosmetics = (() => {
    // ===== MINIATURY EFEKTÓW: gładkie, w stylu miniatur kart (zaokrąglone kształty, ciemny obrys) =====
    const O = 'stroke="#111" stroke-width="2.2" stroke-linejoin="round"';
    const KICK_THUMBS = {
        // konfetti: mała postać, nad nią kolorowe paski konfetti
        confetti: `<rect x="10" y="16" width="12" height="12" rx="3" fill="#7f8c8d" ${O}/>
            <circle cx="13.5" cy="21" r="1.4" fill="#111"/><circle cx="18.5" cy="21" r="1.4" fill="#111"/><path d="M13.5 24.6q2.5 1.6 5 0" fill="none" stroke="#111" stroke-width="1.4" stroke-linecap="round"/>
            <rect x="5" y="5" width="5" height="2.4" rx="1.2" fill="#e74c3c" transform="rotate(-30 7.5 6.2)"/>
            <rect x="13" y="2.5" width="5" height="2.4" rx="1.2" fill="#f1c40f" transform="rotate(20 15.5 3.7)"/>
            <rect x="22" y="5" width="5" height="2.4" rx="1.2" fill="#2ecc71" transform="rotate(40 24.5 6.2)"/>
            <rect x="3" y="11" width="4" height="2.2" rx="1.1" fill="#b16cf0" transform="rotate(60 5 12.1)"/>
            <rect x="25" y="11.5" width="4" height="2.2" rx="1.1" fill="#3498db" transform="rotate(-50 27 12.6)"/>
            <circle cx="10" cy="11" r="1.3" fill="#fff"/><circle cx="21" cy="10" r="1.3" fill="#f1c40f"/>`,
        // wybuch: gwiazda ognia, w środku żółta i biała kula
        explosion: `<path d="M16 2l3.2 6.4 6.8-2.6-2.6 6.8L30 16l-6.6 3.4 2.6 6.8-6.8-2.6L16 30l-3.2-6.4-6.8 2.6 2.6-6.8L2 16l6.6-3.4-2.6-6.8 6.8 2.6z" fill="#e74c3c" ${O}/>
            <circle cx="16" cy="16" r="7.5" fill="#ff9800"/><circle cx="16" cy="16" r="4.8" fill="#f1c40f"/><circle cx="16" cy="16" r="2.2" fill="#fff8d0"/>`,
        // czarna dziura: fioletowy wir, czarny środek, drobinki
        blackhole: `<circle cx="16" cy="16" r="12" fill="#6c3483" ${O}/><circle cx="16" cy="16" r="9" fill="none" stroke="#b16cf0" stroke-width="3" stroke-dasharray="10 4"/>
            <circle cx="16" cy="16" r="5.5" fill="#050208"/><circle cx="5" cy="5" r="1.2" fill="#fff"/><circle cx="27.5" cy="8" r="1.2" fill="#4ff0ff"/><circle cx="26" cy="27" r="1.2" fill="#fff"/><circle cx="4.5" cy="25" r="1" fill="#4ff0ff"/>`,
        // kowadło i żółta gwiazdka
        anvil: `<path d="M3 13h19l7-1v3.5l-5 1.5-2 2.5H6.5C5 19.5 3 17 3 15z" fill="#8a94a3" ${O}/>
            <path d="M10.5 19.5h8v3h-8z" fill="#5b6470" ${O}/><path d="M6 22.5h17v4.5H6z" fill="#5b6470" ${O}/>
            <path d="M24 2.5l1.2 2.8 3 .3-2.3 2 .7 3-2.6-1.6-2.6 1.6.7-3-2.3-2 3-.3z" fill="#f1c40f" stroke="#111" stroke-width="1.2" stroke-linejoin="round"/>`,
        none: `<rect x="7" y="14" width="18" height="4" rx="2" fill="#666"/>`
    };
    function kickThumb(id) {
        const el = document.createElement('span');
        el.className = `kick-thumb kick-thumb-${id || 'none'}`;
        el.innerHTML = `<svg viewBox="0 0 32 32">${KICK_THUMBS[id] || KICK_THUMBS.none}</svg>`;
        return el;
    }
    // karta: mała teczka w motywie skórki (zakładka, kartka z liniami, pieczątka)
    function skinThumb(id) {
        const el = document.createElement('span');
        el.className = `skin-thumb skin-${id || 'classic'}`;
        el.innerHTML = '<i class="st-tab"></i><i class="st-sheet"><i class="st-line"></i><i class="st-line st-short"></i><i class="st-stamp"></i></i>';
        return el;
    }

    // ===== EFEKTY WYRZUCENIA =====
    const COLORS = ['#2ecc71', '#e74c3c', '#f1c40f', '#3498db', '#b16cf0', '#ffffff'];
    const PIX_STAR = c => `<svg viewBox="0 0 5 5" shape-rendering="crispEdges"><path d="M2 0h1v5H2zM0 2h5v1H0zM1 1h3v3H1z" fill="${c}"/></svg>`;
    const PIX_ANVIL = `<svg viewBox="0 0 14 9" shape-rendering="crispEdges"><path d="M0 0h11v1h3v1h-2v1H0z" fill="#5b6470"/><path d="M0 0h11v1H0z" fill="#8a94a3"/><path d="M4 3h6v2H4z" fill="#3f4650"/><path d="M2 5h10v2H2z" fill="#5b6470"/><path d="M1 7h12v2H1z" fill="#3f4650"/></svg>`;
    const rnd = (a, b) => a + Math.random() * (b - a);
    const EFFECT_MS = 2000;

    function layer(tile, cls) {
        const el = document.createElement('div');
        el.className = `kx ${cls || ''}`;
        tile.append(el);
        return el;
    }
    function particle(parent, vars) {
        const p = document.createElement('span');
        p.className = 'kx-p';
        Object.entries(vars).forEach(([k, v]) => p.style.setProperty(`--${k}`, v));
        parent.append(p);
    }
    const span = cls => Object.assign(document.createElement('span'), { className: cls });

    // tile: element z <img> awatara; type: confetti | explosion | blackhole | anvil
    function playKick(tile, type) {
        const img = tile.querySelector('img') || tile.firstElementChild;      // awatar albo miniatura
        if (!img || !type) return;
        // efekty są robione pod duży awatar (~96 px) - przy małym (wiersz głosów) zmniejszamy je proporcjonalnie
        const size = img.getBoundingClientRect().width || 96;
        tile.style.setProperty('--kx-k', Math.max(0.45, Math.min(1, size / 96)).toFixed(2));
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        tile.classList.add('kx-host');
        const added = [];
        const track = el => { added.push(el); return el; };

        if (type === 'confetti') {
            img.classList.add('kx-hop');
            const l = track(layer(tile, 'kx-conf'));
            for (let i = 0; i < 34; i++) {
                const a = rnd(-Math.PI * .95, -Math.PI * .05), d = rnd(40, 95);
                particle(l, { c: COLORS[i % COLORS.length], s: `${Math.round(rnd(4, 8))}px`, dx: `${Math.cos(a) * d}px`, dy: `${Math.sin(a) * d}px`, r: `${rnd(-400, 400)}deg`, d: `${rnd(0, .08)}s`, t: `${rnd(1.1, 1.6)}s` });
            }
        } else if (type === 'explosion') {
            img.classList.add('kx-shake', 'kx-soot');
            const boom = track(layer(tile));
            boom.style.zIndex = 3;
            boom.append(span('kx-flash'), span('kx-ring'));
            const fire = track(layer(tile, 'kx-fire'));
            fire.style.zIndex = 3;
            for (let i = 0; i < 36; i++) {
                const a = (i / 36) * Math.PI * 2 + rnd(-.15, .15), d = rnd(40, 85);
                particle(fire, { c: ['#fff3b0', '#f1c40f', '#ff9800', '#e74c3c', '#ff5722'][i % 5], s: `${Math.round(rnd(8, 14))}px`, dx: `${Math.cos(a) * d}px`, dy: `${Math.sin(a) * d}px`, d: `${rnd(0, .1)}s`, t: `${rnd(.7, 1)}s` });
            }
            const smoke = track(layer(tile, 'kx-smoke'));
            for (let i = 0; i < 8; i++) particle(smoke, { c: ['#555', '#777', '#444'][i % 3], s: `${Math.round(rnd(10, 16))}px`, dx: `${rnd(-28, 28)}px`, d: `${rnd(.2, .45)}s` });
        } else if (type === 'blackhole') {
            const hole = track(layer(tile));
            hole.style.zIndex = 0;
            hole.append(span('kx-hole'));
            const swirl = track(layer(tile, 'kx-swirl'));
            swirl.style.zIndex = 3;
            for (let i = 0; i < 22; i++) {
                const a = rnd(0, Math.PI * 2), d = rnd(55, 85);
                particle(swirl, { c: ['#b16cf0', '#ffffff', '#6c3483', '#4ff0ff'][i % 4], s: `${Math.round(rnd(3, 6))}px`, dx: `${Math.cos(a) * d}px`, dy: `${Math.sin(a) * d}px`, d: `${rnd(0, .6)}s` });
            }
            img.classList.add('kx-suck');
        } else if (type === 'anvil') {
            img.classList.add('kx-squash');
            const top = track(layer(tile));
            top.style.zIndex = 4;
            top.insertAdjacentHTML('beforeend', `<span class="kx-anvil">${PIX_ANVIL}</span>`);
            const dust = track(layer(tile, 'kx-dust'));
            for (let i = 0; i < 10; i++) particle(dust, { c: '#bbb', s: `${Math.round(rnd(6, 10))}px`, dx: `${(i % 2 ? 1 : -1) * rnd(30, 55)}px` });
            const stars = track(layer(tile));
            stars.style.zIndex = 4;
            stars.insertAdjacentHTML('beforeend', `<span class="kx-stars-show"><span class="kx-stars">${[0, 1, 2].map(i => `<span class="kx-star" style="transform:rotate(${i * 120}deg) translate(26px) rotate(${-i * 120}deg)">${PIX_STAR(['#f1c40f', '#fff', '#f1c40f'][i])}</span>`).join('')}</span></span>`);
        }
        // sprzątanie po efekcie
        setTimeout(() => {
            added.forEach(el => el.remove());
            img.classList.remove('kx-hop', 'kx-shake', 'kx-soot', 'kx-suck', 'kx-squash');
            tile.classList.remove('kx-host');
        }, EFFECT_MS + 200);
    }

    return { kickThumb, skinThumb, playKick };
})();
