// PROPOZYCJA B: "MASKI" - zamaskowani: jaskrawa maska na ciemnej postaci, gruby czarny kontur jak w logo,
// teatralne tła. Kto jest pod maską? Wszystko rysowane od zera.
(function (root) {
    const INK = '#0c0d11', DARK = '#1b1d25', DARK2 = '#2a2d38';

    const COLORS = {
        red: '#ff5252', orange: '#ff9f43', yellow: '#ffd93d', green: '#3ddc84', cyan: '#4fe3f5',
        blue: '#4f9dff', violet: '#a78bfa', magenta: '#ff5fd2', ivory: '#f4efe2', gold: '#e8b94a'
    };

    // ===== narzędzia =====
    const attrs = o => Object.entries(o).map(([k, v]) => ` ${k}="${v}"`).join('');
    const P = (d, fill, o = {}) => `<path d="${d}" fill="${fill}"${attrs(o)}/>`;
    const C = (cx, cy, r, fill, o = {}) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"${attrs(o)}/>`;
    const E = (cx, cy, rx, ry, fill, o = {}) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}"${attrs(o)}/>`;
    const R = (x, y, w, h, fill, o = {}) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${attrs(o)}/>`;
    const L = (d, stroke, w, o = {}) => `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${attrs(o)}/>`;
    const OL = (d, fill, w = 3.4, o = {}) => P(d, fill, { stroke: INK, 'stroke-width': w, 'stroke-linejoin': 'round', ...o });
    const mirror = svg => `<g transform="matrix(-1 0 0 1 120 0)">${svg}</g>`;
    const pair = fn => fn() + mirror(fn());

    function shade(hex, f) {
        const n = parseInt(hex.slice(1), 16);
        const ch = s => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
        return '#' + [16, 8, 0].map(s => ch(s).toString(16).padStart(2, '0')).join('');
    }

    // ===== UBRANIE =====
    const BODIES = {
        suit: {
            name: 'Garnitur',
            svg: (c, t) => OL('M4 120 C4 99 24 91 45 87 L75 87 C96 91 116 99 116 120 Z', DARK)
                + P('M48 87 L60 106 L72 87 Z', '#e9e6dc', { stroke: INK, 'stroke-width': 2.4, 'stroke-linejoin': 'round' })
                + OL('M52 90 L60 96 L68 90 L68 100 L60 96 L52 100 Z', t, 2.4)
        },
        burglar: {
            name: 'Włamywacz',
            svg: () => {
                let s = OL('M4 120 C4 99 24 91 45 87 L75 87 C96 91 116 99 116 120 Z', '#e9e6dc');
                for (let y = 92; y < 120; y += 8) s += P(`M0 ${y} H120 V${y + 4} H0 Z`, INK, { 'clip-path': 'url(#bodyclip)' });
                return `<defs><clipPath id="bodyclip"><path d="M4 120 C4 99 24 91 45 87 L75 87 C96 91 116 99 116 120 Z"/></clipPath></defs>` + s
                    + L('M4 120 C4 99 24 91 45 87 L75 87 C96 91 116 99 116 120', INK, 3.4);
            }
        },
        cape: {
            name: 'Peleryna',
            svg: (c, t) => OL('M0 120 C2 98 20 88 40 84 L80 84 C100 88 118 98 120 120 Z', t)
                + OL('M36 84 L60 100 L84 84 L90 72 L60 90 L30 72 Z', shade(t, .55), 3)
                + OL('M30 72 L40 84 L48 92 L36 100 L24 90 Z', shade(t, .75), 3)
        },
        hoodie: {
            name: 'Bluza',
            svg: (c, t) => OL('M4 120 C4 99 24 91 45 87 L75 87 C96 91 116 99 116 120 Z', DARK2)
                + OL('M34 90 C36 78 48 74 60 74 C72 74 84 78 86 90 C78 96 68 98 60 98 C52 98 42 96 34 90 Z', shade('#2a2d38', 1.25), 3)
                + L('M54 98 L52 114 M66 98 L68 114', INK, 2.2) + C(52, 115, 2.2, t, { stroke: INK, 'stroke-width': 1.5 }) + C(68, 115, 2.2, t, { stroke: INK, 'stroke-width': 1.5 })
        }
    };

    // ===== GŁOWA POD MASKĄ + NAKRYCIE =====
    const HEAD = 'M38 52 C38 32 48 24 60 24 C72 24 82 32 82 52 C82 72 72 84 60 84 C48 84 38 72 38 52 Z';
    const GEAR = {
        none: { name: 'Gołowłosy', back: () => '', front: () => '' },
        hood: {
            name: 'Kaptur',
            back: () => OL('M14 120 C12 74 26 18 60 18 C94 18 108 74 106 120 Z', DARK2),
            front: () => ''
        },
        tophat: {
            name: 'Cylinder',
            back: () => '',
            front: (c, t) => OL('M25 38 C25 33 95 33 95 38 C95 44 25 44 25 38 Z', INK, 3.4)
                + OL('M40 38 L43 8 H77 L80 38 Z', DARK, 3.4) + P('M41 32 H79 L79.6 38 H40.4 Z', t, { stroke: INK, 'stroke-width': 2.4 })
        },
        fedora: {
            name: 'Kapelusz',
            back: () => '',
            front: (c, t) => OL('M21 42 C21 34 40 31 60 31 C80 31 99 34 99 42 C99 49 80 52 60 52 C40 52 21 49 21 42 Z', DARK, 3.4)
                + OL('M41 42 C39 26 47 15 60 15 C73 15 81 26 79 42 Z', DARK, 3.4)
                + P('M40.4 34 C48 37 72 37 79.6 34 L79.2 42 C72 45 48 45 40.8 42 Z', t, { stroke: INK, 'stroke-width': 2.2, 'stroke-linejoin': 'round' })
        },
        beret: {
            name: 'Beret',
            back: () => '',
            front: (c, t) => OL('M32 42 C28 28 46 20 66 22 C88 24 94 38 84 46 C70 50 46 50 32 42 Z', t, 3.4) + L('M62 22 L66 14', INK, 3) + L('M40 32 C48 27 60 26 70 28', '#fff', 1.6, { opacity: .35 })
        },
        beanie: {
            name: 'Czapka',
            back: () => '',
            front: (c, t) => OL('M38 44 C34 22 48 14 60 14 C72 14 86 22 82 44 Z', DARK2, 3.4) + OL('M36 36 H84 V48 H36 Z', t, 3)
                + L('M44 37 V47 M52 37 V47 M60 37 V47 M68 37 V47 M76 37 V47', INK, 1.4, { opacity: .5 })
        }
    };

    // ===== MASKI =====
    // shape: kształt maski; holes: otwory na oczy (lewy, prawy odbity); front: ozdoby na wierzchu
    const MASKS = {
        domino: {
            name: 'Domino',
            shape: 'M27 51 C32 43 46 44 60 49 C74 44 88 43 93 51 C95 62 84 69 73 65 C67 63 64 59 60 59 C56 59 53 63 47 65 C36 69 25 62 27 51 Z',
            holes: [{ cx: 46, cy: 56, rx: 7.6, ry: 4.9, rot: -12 }],
            front: (c, t) => C(32, 53, 1.6, t, { opacity: .9 }) + C(88, 53, 1.6, t, { opacity: .9 }) + L('M38 48.5 Q46 46 54 51', '#fff', 1.4, { opacity: .35 })
        },
        venetian: {
            name: 'Wenecka',
            shape: 'M23 38 C29 49 42 45 52 51 C56 53 58 55 60 55 C62 55 64 53 68 51 C78 45 91 49 97 38 C100 58 90 72 76 69 C68 67 64 63 60 63 C56 63 52 67 44 69 C30 72 20 58 23 38 Z',
            holes: [{ cx: 45, cy: 58, rx: 8, ry: 5, rot: -18 }],
            front: (c, t) => OL('M60 43 L65.5 50 L60 57 L54.5 50 Z', t, 2.2) + L('M29 46 Q34 56 42 53', t, 1.8) + mirror(L('M29 46 Q34 56 42 53', t, 1.8))
        },
        theater: {
            name: 'Teatralna',
            shape: 'M36 34 C36 27 84 27 84 34 C86 54 84 70 76 80 C70 88 50 88 44 80 C36 70 34 54 36 34 Z',
            holes: [{ cx: 49, cy: 51, rx: 6.4, ry: 3.8, rot: -20 }],
            front: (c, t) => P('M44 67 Q60 86 76 67 Q60 74 44 67 Z', INK) + L('M40 44 Q47 40 55 45', INK, 2.4) + mirror(L('M40 44 Q47 40 55 45', INK, 2.4))
                + C(41, 63, 3.6, t, { opacity: .55 }) + C(79, 63, 3.6, t, { opacity: .55 })
        },
        gas: {
            name: 'Maska gazowa',
            shape: 'M34 38 C34 31 86 31 86 38 L87 62 C87 78 74 88 60 88 C46 88 33 78 33 62 Z',
            holes: [{ cx: 47, cy: 56, rx: 9.5, ry: 9.5, rot: 0, ring: true }],
            back: () => L('M33 48 H18 M87 48 H102 M33 64 H18 M87 64 H102', INK, 4.6) + L('M33 48 H18 M87 48 H102 M33 64 H18 M87 64 H102', DARK2, 2),
            front: () => OL('M52 76 H68 V86 Q68 91 60 91 Q52 91 52 86 Z', DARK2, 2.6) + L('M55 79 V88 M60 79 V89 M65 79 V88', INK, 1.4)
        },
        beak: {
            name: 'Dziób',
            shape: 'M45 46 C45 38 75 38 75 46 L73 58 C71 70 65 84 60 98 C55 84 49 70 47 58 Z',
            holes: [{ cx: 51, cy: 49, rx: 6, ry: 6, rot: 0, ring: true }],
            back: () => L('M45 50 H34 M75 50 H86', INK, 3.4),
            front: (c, t) => L('M60 58 V90', INK, 1.4, { opacity: .35 })
        },
        ski: {
            name: 'Kominiarka',
            shape: 'M35 54 C35 33 46 27 60 27 C74 27 85 33 85 54 C85 73 74 84 60 84 C46 84 35 73 35 54 Z',
            holes: [{ cx: 50, cy: 56, rx: 6.2, ry: 4.6, rot: 0 }],
            slot: 'M39 49 H81 Q83 49 83 51 V62 Q83 64 81 64 H39 Q37 64 37 62 V51 Q37 49 39 49 Z',
            front: () => ''
        },
        bag: {
            name: 'Torba',
            kraft: true,
            shape: 'M33 30 L41 25 L49 30 L60 24 L71 30 L79 25 L87 30 L89 84 Q60 90 31 84 Z',
            holes: [{ cx: 47, cy: 52, rx: 6, ry: 5, rot: 0 }],
            front: () => L('M47 72 Q60 66 73 72', INK, 2.6) + L('M33 30 L41 36 L49 30 M60 24 V34 M71 30 L79 36 L87 30', INK, 1.4, { opacity: .35 })
        },
        cat: {
            name: 'Kot',
            shape: 'M36 52 C36 40 48 36 60 36 C72 36 84 40 84 52 C84 66 72 74 60 74 C48 74 36 66 36 52 Z',
            holes: [{ cx: 48, cy: 54, rx: 6.6, ry: 4.8, rot: -20 }],
            ears: 'M37 46 L34 24 L53 38 Z',
            front: (c, t) => OL('M56.5 62 H63.5 L60 66.5 Z', INK, 1.6) + L('M60 66.5 V69 M60 69 Q55 73 51 70 M60 69 Q65 73 69 70', INK, 1.8)
                + L('M32 62 L42 63 M32 68 L42 66.5', INK, 1.4) + mirror(L('M32 62 L42 63 M32 68 L42 66.5', INK, 1.4))
        }
    };

    // ===== WZORY NA MASCE (rysowane przycięte do kształtu) =====
    const PATTERNS = {
        none: { name: 'Gładka', svg: () => '' },
        stripes: { name: 'Paski', svg: (c, t) => { let s = ''; for (let x = 10; x < 130; x += 12) s += P(`M${x} 20 h5 l-26 80 h-5 Z`, t, { opacity: .75 }); return s; } },
        dots: { name: 'Kropki', svg: (c, t) => { let s = ''; for (let y = 28; y < 96; y += 9) for (let x = 24 + ((y / 9) % 2) * 4.5; x < 100; x += 9) s += C(x, y, 2, t, { opacity: .8 }); return s; } },
        harlequin: { name: 'Arlekin', svg: (c, t) => { let s = ''; for (let y = 24; y < 100; y += 12) for (let x = 12 + ((y / 12) % 2) * 6; x < 110; x += 12) s += P(`M${x} ${y - 6} L${x + 6} ${y} L${x} ${y + 6} L${x - 6} ${y} Z`, t, { opacity: .75 }); return s; } },
        zigzag: { name: 'Zygzak', svg: (c, t) => { let s = ''; for (let y = 34; y < 96; y += 12) s += L(`M10 ${y}${Array.from({ length: 11 }, (_, i) => ` L${20 + i * 9} ${y + (i % 2 ? 0 : 6)}`).join('')}`, t, 2.6, { opacity: .85 }); return s; } },
        half: { name: 'Pół na pół', svg: (c, t) => P('M0 0 H60 V120 H0 Z', t, { opacity: .95 }) },
        top: { name: 'Czoło', svg: (c, t) => P('M0 0 H120 V47 Q60 54 0 47 Z', t, { opacity: .9 }) },
        cracks: { name: 'Pęknięcia', svg: () => L('M70 20 L62 40 L70 52 L60 66 L66 90 M62 40 L48 46 M60 66 L72 72', INK, 1.8, { opacity: .55 }) }
    };

    // ===== OCZY (rysowane w otworze maski) =====
    const eyeIn = (h, inner) => `<g transform="rotate(${h.rot || 0} ${h.cx} ${h.cy})">${inner}</g>`;
    const EYES = {
        white: {
            name: 'Białka',
            svg: (h, c, t, look) => eyeIn(h, E(h.cx, h.cy, h.rx - .8, h.ry - .8, '#fff') + C(h.cx + look * h.rx * .35, h.cy + .4, Math.min(h.rx, h.ry) * .62, INK) + C(h.cx + look * h.rx * .35 - 1, h.cy - 1, Math.min(h.rx, h.ry) * .2, '#fff'))
        },
        glow: {
            name: 'Świecące',
            svg: (h, c, t) => eyeIn(h, E(h.cx, h.cy, h.rx - .8, h.ry - .8, t) + E(h.cx, h.cy, h.rx * .55, h.ry * .55, '#fff', { opacity: .9 }))
        },
        dark: {
            name: 'Puste',
            svg: (h) => eyeIn(h, C(h.cx + 1.5, h.cy - 1.2, 1.4, '#fff', { opacity: .85 }))
        },
        slit: {
            name: 'Szparki',
            svg: (h, c, t) => eyeIn(h, P(`M${h.cx - h.rx + 1} ${h.cy} Q${h.cx} ${h.cy - h.ry + .5} ${h.cx + h.rx - 1} ${h.cy} Q${h.cx} ${h.cy + h.ry * .5} ${h.cx - h.rx + 1} ${h.cy} Z`, t))
        },
        wide: {
            name: 'Zdziwione',
            svg: (h) => eyeIn(h, E(h.cx, h.cy, h.rx - .8, h.ry - .8, '#fff') + C(h.cx, h.cy, Math.min(h.rx, h.ry) * .32, INK))
        },
        x: {
            name: 'Krzyżyki',
            svg: (h, c, t) => eyeIn(h, E(h.cx, h.cy, h.rx - .8, h.ry - .8, '#fff') + L(`M${h.cx - 2.5} ${h.cy - 2.5} L${h.cx + 2.5} ${h.cy + 2.5} M${h.cx + 2.5} ${h.cy - 2.5} L${h.cx - 2.5} ${h.cy + 2.5}`, INK, 1.8))
        }
    };

    // ===== TŁA =====
    const BGS = {
        curtain: {
            name: 'Kurtyna',
            svg: (c, t) => {
                let s = R(0, 0, 120, 120, shade(t, .28));
                for (let x = 0; x < 120; x += 20) s += P(`M${x} 0 H${x + 10} Q${x + 14} 60 ${x + 10} 120 H${x} Q${x + 4} 60 ${x} 0 Z`, shade(t, .5), { opacity: .9 });
                return s + `<defs><radialGradient id="bs" cx=".5" cy=".35" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></radialGradient></defs>` + R(0, 0, 120, 120, 'url(#bs)') + R(0, 0, 120, 10, shade(t, .35));
            }
        },
        spot: {
            name: 'Reflektor',
            svg: (c, t) => R(0, 0, 120, 120, '#14161c') + `<defs><radialGradient id="bs" cx=".5" cy="0" r=".95"><stop offset="0" stop-color="${t}" stop-opacity=".55"/><stop offset="1" stop-color="${t}" stop-opacity="0"/></radialGradient></defs>` + P('M42 0 H78 L118 120 H2 Z', 'url(#bs)')
        },
        confetti: {
            name: 'Konfetti',
            svg: (c, t) => {
                let s = R(0, 0, 120, 120, '#171922'), seed = 3;
                const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
                const cols = [t, '#ffd93d', '#4fe3f5', '#ff5fd2', '#3ddc84'];
                for (let i = 0; i < 34; i++) s += R(rnd() * 116, rnd() * 116, 3 + rnd() * 3, 3 + rnd() * 3, cols[i % 5], { transform: `rotate(${Math.floor(rnd() * 90)} 60 60)`, opacity: .85 });
                return s;
            }
        },
        stripes: {
            name: 'Pasy',
            svg: (c, t) => { let s = R(0, 0, 120, 120, shade(t, .35)); for (let x = -40; x < 140; x += 24) s += P(`M${x} 0 h12 l-40 120 h-12 Z`, shade(t, .5)); return s; }
        },
        sun: {
            name: 'Promienie',
            svg: (c, t) => { let s = R(0, 0, 120, 120, shade(t, .45)); for (let i = 0; i < 16; i++) s += P(`M60 60 L${60 + 100 * Math.cos(i * Math.PI / 8)} ${60 + 100 * Math.sin(i * Math.PI / 8)} L${60 + 100 * Math.cos((i + .5) * Math.PI / 8)} ${60 + 100 * Math.sin((i + .5) * Math.PI / 8)} Z`, shade(t, .62)); return s; }
        },
        harlequin: {
            name: 'Romby',
            svg: (c, t) => { let s = R(0, 0, 120, 120, '#15171e'); for (let y = 0; y < 130; y += 20) for (let x = (y / 20 % 2) * 10; x < 130; x += 20) s += P(`M${x} ${y - 10} L${x + 10} ${y} L${x} ${y + 10} L${x - 10} ${y} Z`, shade(t, .42)); return s; }
        },
        dots: {
            name: 'Kropki',
            svg: (c, t) => { let s = R(0, 0, 120, 120, shade(t, .3)); for (let y = 8; y < 120; y += 16) for (let x = 8 + (y / 16 % 2) * 8; x < 120; x += 16) s += C(x, y, 3.4, shade(t, .55)); return s; }
        },
        dark: {
            name: 'Ciemne',
            svg: () => `<defs><linearGradient id="bs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#232632"/><stop offset="1" stop-color="#101217"/></linearGradient></defs>` + R(0, 0, 120, 120, 'url(#bs)')
        }
    };

    const CATALOG = { bg: BGS, body: BODIES, gear: GEAR, mask: MASKS, pattern: PATTERNS, eyes: EYES };
    const SLOTS = ['bg', 'body', 'gear', 'mask', 'pattern', 'eyes'];
    const PARTS = Object.fromEntries(Object.entries(CATALOG).map(([slot, items]) => [slot, Object.keys(items)]));
    PARTS.color = Object.keys(COLORS);
    PARTS.trim = Object.keys(COLORS);
    const NAMES = Object.fromEntries(Object.entries(CATALOG).map(([slot, items]) => [slot, Object.fromEntries(Object.entries(items).map(([id, item]) => [id, item.name]))]));

    // ===== SKŁADANIE =====
    function render(cfg) {
        const pick = (slot, def) => CATALOG[slot][cfg[slot]] || CATALOG[slot][def];
        const baseColor = COLORS[cfg.color] || COLORS.red, t = COLORS[cfg.trim] || COLORS.yellow;
        const mask = pick('mask', 'domino'), body = pick('body', 'suit'), gear = pick('gear', 'none'), pattern = pick('pattern', 'none'), eyes = pick('eyes', 'white'), bg = pick('bg', 'dark');
        const c = mask.kraft ? '#c9a56a' : baseColor;

        // otwory i oczy: lewy otwór opisany, prawy to jego odbicie
        const holesSvg = mask.holes.map(h => {
            const right = { ...h, cx: 120 - h.cx, rot: -(h.rot || 0) };
            const hole = o => o.ring
                ? C(o.cx, o.cy, o.rx, '#0e1015', { stroke: INK, 'stroke-width': 3.4 })
                : E(o.cx, o.cy, o.rx, o.ry, INK, { transform: `rotate(${o.rot || 0} ${o.cx} ${o.cy})` });
            const lensGlint = o => o.ring ? P(`M${o.cx - o.rx * .6} ${o.cy - o.rx * .2} A${o.rx * .7} ${o.rx * .7} 0 0 1 ${o.cx - o.rx * .1} ${o.cy - o.rx * .7}`, 'none', { stroke: '#fff', 'stroke-width': 1.6, 'stroke-linecap': 'round', opacity: .6 }) : '';
            return (mask.slot ? '' : hole(h) + hole(right)) + eyes.svg(h, c, t, -1) + eyes.svg(right, c, t, 1) + lensGlint(h) + lensGlint(right);
        }).join('');

        const earsSvg = mask.ears ? OL(mask.ears, c, 3.2) + OL(flipPath(mask.ears), c, 3.2) : '';
        const slotSvg = mask.slot ? P(mask.slot, INK) : '';
        const maskBody = OL(mask.shape, c, 3.6)
            + `<defs><clipPath id="bm"><path d="${mask.shape}"/></clipPath></defs>`
            + `<g clip-path="url(#bm)">${pattern.svg(c, t)}`
            + E(44, 40, 30, 16, '#fff', { opacity: .16 }) + E(78, 92, 38, 20, '#000', { opacity: .13 }) + `</g>`
            + L(mask.shape, INK, 3.4);

        const knit = mask.slot ? L('M40 30 V47 M48 28 V47 M56 27 V47 M64 27 V47 M72 28 V47 M80 30 V47 M42 66 V80 M50 66 V83 M58 66 V84 M66 66 V84 M74 66 V82', INK, 1.3, { opacity: .3 }) : '';
        const hoodCover = gear === GEAR.hood ? '' : '';

        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" fill="none">`
            + bg.svg(c, t)
            + body.svg(c, t)
            + (gear.back ? gear.back(c, t) : '')
            + (mask.back ? mask.back(c, t) : '')
            + OL(HEAD, DARK, 3.4)
            + earsSvg
            + maskBody + slotSvg + knit
            + holesSvg
            + (mask.front ? mask.front(c, t) : '')
            + gear.front(c, t)
            + hoodCover
            + (cfg.cracked ? L('M68 28 L60 44 L68 54 L58 68 L64 90', INK, 2.4) + L('M69 28 L61 44 L69 54 L59 68 L65 90', '#fff', .9, { opacity: .5 }) : '')
            + `<defs><radialGradient id="bv" cx=".5" cy=".5" r=".75"><stop offset=".65" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></radialGradient></defs><rect width="120" height="120" fill="url(#bv)"/>`
            + `</svg>`;
    }

    function flipPath(d) {
        const f = x => +(120 - x).toFixed(2);
        return d.match(/[MLHVCQSTAZ][^MLHVCQSTAZ]*/g).map(seg => {
            const cmd = seg[0], nums = (seg.slice(1).match(/-?\d*\.?\d+/g) || []).map(Number);
            let out;
            if (cmd === 'H') out = nums.map(f); else if (cmd === 'V' || cmd === 'Z') out = nums;
            else out = nums.map((n, i) => (i % 2 === 0 ? f(n) : n));
            return cmd + out.join(' ');
        }).join('');
    }

    function renderKicked(cfg) {
        return render({ ...cfg, eyes: 'x', cracked: true }).replace('<svg ', '<svg style="filter:grayscale(.8) brightness(.85)" ');
    }

    function rng(seed) {
        let s = seed >>> 0;
        return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    }
    function random(seed) {
        const r = rng(seed), pickOf = list => list[Math.floor(r() * list.length)];
        const cfg = {};
        SLOTS.forEach(slot => { cfg[slot] = pickOf(PARTS[slot].filter(id => !(slot === 'eyes' && id === 'x'))); });
        cfg.color = pickOf(PARTS.color);
        do { cfg.trim = pickOf(PARTS.trim); } while (cfg.trim === cfg.color);
        return cfg;
    }

    const api = {
        id: 'B', title: 'Maski', tagline: 'Zamaskowani: jaskrawa maska, gruby kontur jak w logo, teatralne tła',
        render, renderKicked, random, PARTS, NAMES, SLOTS, COLORS,
        base: { bg: 'curtain', body: 'suit', gear: 'none', mask: 'domino', pattern: 'none', eyes: 'white', color: 'red', trim: 'yellow' }
    };
    root.GenB = api;
    if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
