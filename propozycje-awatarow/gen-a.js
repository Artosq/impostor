// PROPOZYCJA A: "CIENIE" - agenci w stylu noir: ciemne sylwetki, neonowe światło krawędziowe,
// świecące oczy. Wszystko rysowane od zera, bez żadnych cudzych zasobów.
(function (root) {
    const INK = '#0a0b0e', INK2 = '#15171c', INK3 = '#242730', INK4 = '#3b3f4b', FACE = '#1b1e25', BG = '#12141a';

    const ACCENTS = {
        green: '#39e079', red: '#ff4d4d', blue: '#4fb3ff', yellow: '#ffd43b', magenta: '#ff5fd2',
        cyan: '#4ff0ff', orange: '#ff9a3d', white: '#f2f2f2', violet: '#a78bfa'
    };

    // ===== narzędzia rysunkowe =====
    const attrs = o => Object.entries(o).map(([k, v]) => ` ${k}="${v}"`).join('');
    const P = (d, fill, o = {}) => `<path d="${d}" fill="${fill}"${attrs(o)}/>`;
    const C = (cx, cy, r, fill, o = {}) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"${attrs(o)}/>`;
    const E = (cx, cy, rx, ry, fill, o = {}) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}"${attrs(o)}/>`;
    const R = (x, y, w, h, fill, o = {}) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${attrs(o)}/>`;
    const L = (d, stroke, w, o = {}) => `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${attrs(o)}/>`;
    const mirror = svg => `<g transform="matrix(-1 0 0 1 120 0)">${svg}</g>`;
    const pair = fn => fn() + mirror(fn());

    // Odbicie ścieżki w poziomie (tylko współrzędne bezwzględne: M L H V C Q A Z)
    function flipPath(d) {
        const f = x => +(120 - x).toFixed(2);
        return d.match(/[MLHVCQSTAZ][^MLHVCQSTAZ]*/g).map(seg => {
            const cmd = seg[0];
            const nums = (seg.slice(1).match(/-?\d*\.?\d+/g) || []).map(Number);
            let out;
            if (cmd === 'H') out = nums.map(f);
            else if (cmd === 'V' || cmd === 'Z') out = nums;
            else if (cmd === 'A') {
                out = [];
                for (let i = 0; i < nums.length; i += 7) out.push(nums[i], nums[i + 1], nums[i + 2], nums[i + 3], 1 - nums[i + 4], f(nums[i + 5]), nums[i + 6]);
            } else out = nums.map((n, i) => (i % 2 === 0 ? f(n) : n));
            return cmd + out.join(' ');
        }).join('');
    }

    // Światło krawędziowe: kolorowa kopia przesunięta w lewo-górę pod ciemnym kształtem
    const rim = (d, fill, c, off = 1.5) => P(d, c, { transform: `translate(${-off} ${-off})`, opacity: .95 }) + P(d, fill);
    const rimPair = (d, fill, c, off) => rim(d, fill, c, off) + rim(flipPath(d), fill, c, off);

    // Poświata: kilka warstw o malejącej przezroczystości
    const glowDot = (cx, cy, r, c) => C(cx, cy, r + 5, c, { opacity: .13 }) + C(cx, cy, r + 2.5, c, { opacity: .26 }) + C(cx, cy, r, c) + C(cx - r * .3, cy - r * .3, r * .32, '#fff', { opacity: .85 });
    const glowLine = (d, c, w) => L(d, c, w + 7, { opacity: .12 }) + L(d, c, w + 3.5, { opacity: .25 }) + L(d, c, w);
    const glowFill = (d, c) => P(d, c, { stroke: c, 'stroke-width': 7, 'stroke-linejoin': 'round', opacity: .12 })
        + P(d, c, { stroke: c, 'stroke-width': 3.5, 'stroke-linejoin': 'round', opacity: .26 }) + P(d, c);

    const SHOULDERS = 'M4 120 C4 99 24 91 45 87 L75 87 C96 91 116 99 116 120 Z';
    const NECK = 'M49 66 H71 V90 Q60 96 49 90 Z';

    // ===== KSZTAŁT TWARZY =====
    const HEADS = {
        oval: { name: 'Owalna', d: 'M40 52 A20 24 0 1 0 80 52 A20 24 0 1 0 40 52 Z' },
        pointed: { name: 'Szpiczasta', d: 'M40 50 C40 32 49 26 60 26 C71 26 80 32 80 50 C80 62 70 74 60 82 C50 74 40 62 40 50 Z' },
        square: { name: 'Kwadratowa', d: 'M40 38 Q40 28 50 28 H70 Q80 28 80 38 V62 Q80 76 70 76 H50 Q40 76 40 62 Z' },
        round: { name: 'Okrągła', d: 'M37 54 A23 23 0 1 0 83 54 A23 23 0 1 0 37 54 Z' },
        long: { name: 'Długa', d: 'M43 50 C43 32 50 24 60 24 C70 24 77 32 77 50 C77 68 70 80 60 80 C50 80 43 68 43 50 Z' }
    };

    // ===== UBRANIE (back = pod głową, front = nad głową) =====
    const BODIES = {
        plain: { name: 'Sweter', back: () => '', front: () => '' },
        suit: {
            name: 'Garnitur',
            back: () => '',
            front: c => P('M49 87 L60 108 L71 87 Z', '#cfd3dc')
                + L('M36 92 L49 88 L60 110 L52 120', INK3, 1.6) + L('M84 92 L71 88 L60 110 L68 120', INK3, 1.6)
                + P('M56.5 88 H63.5 L62.5 93 H57.5 Z', c, { opacity: .85 }) + P('M57.5 93 H62.5 L65 111 L60 116 L55 111 Z', c)
        },
        trench: {
            name: 'Prochowiec',
            back: () => '',
            front: c => rimPair('M26 106 L31 80 L44 64 L58 90 L51 108 Z', INK2, c)
                + L('M60 104 V120', INK3, 1.6) + C(55, 112, 1.5, INK4) + C(65, 112, 1.5, INK4)
        },
        hoodie: {
            name: 'Bluza',
            back: c => rim('M33 92 C33 76 46 70 60 70 C74 70 87 76 87 92 Z', INK2, c, 1.2),
            front: c => L('M54 97 L52 113', INK4, 1.5) + L('M66 97 L68 113', INK4, 1.5) + C(52, 114, 1.8, c) + C(68, 114, 1.8, c)
        },
        turtle: {
            name: 'Golf',
            back: () => '',
            front: () => P('M45 72 H75 V92 Q60 98 45 92 Z', INK2) + L('M46 78 H74 M46 84 H74 M46 90 Q60 95 74 90', INK3, 1.3)
        },
        scarf: {
            name: 'Szalik',
            back: () => '',
            front: c => P('M38 86 Q60 100 82 86 L84 98 Q60 114 36 98 Z', c) + P('M62 98 L75 101 L72 118 L59 116 Z', c, { opacity: .85 })
                + L('M62 106 L74 108.5 M61 112 L73 114.5', INK, 1.4, { opacity: .35 })
        }
    };

    // ===== NAKRYCIE GŁOWY =====
    const GEAR = {
        fedora: {
            name: 'Kapelusz',
            front: c => rim('M21 42 C21 34 40 31 60 31 C80 31 99 34 99 42 C99 49 80 52 60 52 C40 52 21 49 21 42 Z', INK, c)
                + rim('M41 42 C39 26 47 15 60 15 C73 15 81 26 79 42 Z', INK, c)
                + P('M40.4 34 C48 37 72 37 79.6 34 L79.2 42 C72 45 48 45 40.8 42 Z', c)
                + L('M53 17 Q60 23 67 17', INK3, 1.6)
        },
        bowler: {
            name: 'Melonik',
            front: c => rim('M30 44 C30 40 45 39 60 39 C75 39 90 40 90 44 C90 49 75 51 60 51 C45 51 30 49 30 44 Z', INK, c)
                + rim('M41 44 C38 22 49 12 60 12 C71 12 82 22 79 44 Z', INK, c)
                + P('M40.4 38 C48 41 72 41 79.6 38 L79.2 44 C72 47 48 47 40.8 44 Z', c)
        },
        hood: {
            name: 'Kaptur', noHead: true,
            back: c => rim('M16 120 C14 84 26 44 46 26 C52 20 56 15 60 11 C64 15 68 20 74 26 C94 44 106 84 104 120 Z', INK, c)
                + E(60, 57, 19, 25, '#050608') + E(60, 57, 19, 25, 'none', { stroke: INK3, 'stroke-width': 1.5 })
                + L('M30 96 C30 80 34 70 40 62 M90 96 C90 80 86 70 80 62', INK2, 1.6),
            front: () => ''
        },
        cap: {
            name: 'Płaska czapka',
            front: c => rim('M37 46 C35 30 46 22 62 22 C78 22 87 32 85 46 Z', INK, c)
                + rim('M37 46 H85 C86 51 78 54 61 54 C46 54 38 52 37 46 Z', INK2, c, 1.2)
                + C(62, 22, 2.2, INK3) + L('M62 24 L62 46', INK3, 1.2)
        },
        beanie: {
            name: 'Czapka',
            front: c => rim('M40 44 C37 24 48 14 60 14 C72 14 83 24 80 44 Z', INK, c)
                + rim('M38 36 H82 V48 H38 Z', INK2, c, 1.2)
                + L('M44 37 V47 M50 37 V47 M56 37 V47 M62 37 V47 M68 37 V47 M74 37 V47', INK3, 1.2) + R(38, 41.5, 44, 2.2, c)
        },
        slick: {
            name: 'Zaczes',
            front: c => rim('M40 48 C37 30 46 20 60 20 C76 20 84 30 80 48 C77 38 70 33 58 34 C49 35 43 40 40 48 Z', INK, c)
                + L('M47 28 C56 23 68 24 75 31', INK4, 1.6)
        },
        bald: {
            name: 'Łysy',
            front: () => E(52, 36, 7, 3, '#fff', { opacity: .07 })
        },
        balaclava: {
            name: 'Kominiarka',
            front: c => rim('M37 54 C37 30 48 25 60 25 C72 25 83 30 83 54 C83 71 72 80 60 80 C48 80 37 71 37 54 Z', INK, c)
                + R(40, 49, 40, 13, FACE, { rx: 6 })
                + L('M44 30 V47 M52 27 V47 M60 26 V47 M68 27 V47 M76 30 V47 M46 64 V78 M54 66 V80 M62 66 V80 M70 66 V78', INK2, 1.2)
        }
    };

    // ===== OCZY =====
    const EYES = {
        slit: {
            name: 'Szparki',
            svg: c => pair(() => glowFill('M40 55 Q49 53 58 60 Q48 62 40 59 Z', c))
        },
        dots: { name: 'Kropki', svg: c => pair(() => glowDot(50, 56, 4.2, c)) },
        round: {
            name: 'Okrągłe',
            svg: c => pair(() => C(50, 56, 9, c, { opacity: .18 }) + C(50, 56, 7, 'none', { stroke: c, 'stroke-width': 1.8 }) + C(50, 56, 3, c))
        },
        cyclops: {
            name: 'Cyklop',
            svg: c => glowFill('M48 56 A12 7.5 0 1 0 72 56 A12 7.5 0 1 0 48 56 Z', c) + R(58.6, 49, 2.8, 14, INK, { rx: 1.4 })
        },
        cat: {
            name: 'Kocie',
            svg: c => pair(() => E(50, 56, 7, 5.5, c, { opacity: .3 }) + E(50, 56, 5.5, 4.4, c) + R(48.8, 50.5, 2.4, 11, INK, { rx: 1.2 }))
        },
        visor: {
            name: 'Wizjer',
            svg: c => P('M38 52 H82 Q85 52 85 55 V59 Q85 62 82 62 H38 Q35 62 35 59 V55 Q35 52 38 52 Z', INK)
                + glowLine('M40 57 H80', c, 3.2) + C(76, 57, 2.2, '#fff', { opacity: .9 })
        },
        shades: {
            name: 'Okulary',
            svg: c => pair(() => P('M39 52 H57 Q58 63 52 64.5 Q43 65 40 58 Z', INK) + L('M39 52 H57 Q58 63 52 64.5 Q43 65 40 58 Z', INK4, 1.4)
                + L('M43 55.5 L50 53.5 M45 60 L53 55', '#fff', 1.3, { opacity: .55 }))
                + L('M57 54 Q60 52.5 63 54', INK4, 1.6) + C(54.5, 53.4, 1.2, c)
        },
        goggles: {
            name: 'Noktowizor',
            svg: c => L('M30 56 H40 M80 56 H90', INK4, 3)
                + pair(() => C(50, 56, 10, INK3) + C(50, 56, 7.5, c, { opacity: .35 }) + C(50, 56, 7.5, 'none', { stroke: c, 'stroke-width': 1.6 }) + C(47.5, 53.5, 2, '#fff', { opacity: .9 }))
                + R(58, 54.5, 4, 3, INK3)
        },
        monocle: {
            name: 'Monokl',
            svg: c => glowDot(50, 56, 4.2, c) + C(70, 56, 8, 'none', { stroke: '#d4af37', 'stroke-width': 1.8 }) + glowDot(70, 56, 3.6, c)
                + L('M77 61 C84 70 82 82 76 92', '#d4af37', 1.1, { opacity: .8 })
        },
        patch: {
            name: 'Przepaska',
            svg: c => glowDot(50, 56, 4.2, c) + L('M38 48 L82 62', INK4, 1.6) + P('M63 50 H77.5 Q80 50 80 53 V60 Q80 64 76 64 H66 Q62 64 62 60 V53 Q62 50 63 50 Z', INK, { stroke: INK4, 'stroke-width': 1.2 })
        },
        sleepy: {
            name: 'Zmrużone',
            svg: c => pair(() => glowFill('M43 57 H57 A7 6 0 0 1 43 57 Z', c) + R(41, 54.6, 18, 2.8, INK))
        },
        wide: {
            name: 'Wielkie',
            svg: c => pair(() => C(50, 55, 8.5, c, { opacity: .2 }) + C(50, 55, 6.4, c) + C(50, 55, 2.1, INK) + C(48, 53, 1.3, '#fff'))
        },
        angry: {
            name: 'Groźne',
            svg: c => pair(() => glowDot(50, 57, 3.8, c) + L('M40 50 L58 55', INK4, 3.2) + L('M40 50 L58 55', c, 1.1, { opacity: .7 }))
        },
        dead: {
            name: 'Krzyżyki',
            svg: c => pair(() => glowLine('M44 51 L56 61 M56 51 L44 61', c, 2.4))
        }
    };

    // ===== DOLNA CZĘŚĆ TWARZY =====
    const MOUTHS = {
        none: { name: 'Brak', svg: () => '' },
        smirk: { name: 'Uśmieszek', svg: c => glowLine('M51 69 Q61 73 70 66', c, 1.6) },
        grin: {
            name: 'Szeroki uśmiech',
            svg: c => {
                let teeth = '';
                for (let i = 1; i <= 6; i++) {
                    const t = i / 7, x = 45 + 30 * t, y = 64 + 36 * t * (1 - t) / 1.0 * 0.5;
                    teeth += L(`M${x.toFixed(1)} ${(y + 0.6).toFixed(1)} V${(y - 3.4).toFixed(1)}`, c, 1.1, { opacity: .9 });
                }
                return glowLine('M45 64 Q60 79 75 64', c, 1.8) + teeth;
            }
        },
        bandana: {
            name: 'Chusta',
            svg: c => P('M40 62 Q60 70 80 62 L79 70 Q71 87 60 87 Q49 87 41 70 Z', INK3) + L('M40 62 Q60 70 80 62', c, 1.6, { opacity: .9 })
                + C(52, 74, 1.4, c, { opacity: .8 }) + C(60, 79, 1.4, c, { opacity: .8 }) + C(68, 74, 1.4, c, { opacity: .8 })
        },
        mustache: {
            name: 'Wąsy',
            svg: () => P('M60 64 C54 60 46 62 45 68 C50 66 55 67 60 68 C65 67 70 66 75 68 C74 62 66 60 60 64 Z', INK)
                + L('M47 64.6 C52 62 56 63 60 65', '#fff', 1, { opacity: .25 })
        },
        line: { name: 'Kreska', svg: () => L('M52 69 H68', INK4, 1.8) }
    };

    // ===== DODATKI =====
    const EXTRAS = {
        none: { name: 'Nic', back: () => '', front: () => '' },
        earpiece: {
            name: 'Słuchawka',
            back: () => '',
            front: c => R(78, 52, 5, 10, INK3, { rx: 2 }) + C(80.5, 55, 1.2, c) + L('M81 62 C86 72 80 82 74 90 C70 96 66 98 62 100', INK4, 1.5)
        },
        headset: {
            name: 'Zestaw',
            back: () => '',
            front: c => L('M40 58 C36 28 84 28 80 58', INK3, 3) + R(34, 54, 8, 13, INK3, { rx: 3 }) + C(38, 60.5, 1.6, c)
                + L('M38 67 C38 76 46 80 54 77', INK3, 1.6) + C(55, 77, 2.4, c)
        },
        disguise: {
            name: 'Przebranie',
            back: () => '',
            front: c => pair(() => C(50, 56, 10.5, 'none', { stroke: c, 'stroke-width': 2.4 })) + L('M60.5 55 H59.5', c, 2.4)
                + E(60, 64, 4.6, 3.6, c) + P('M60 68 C53 63 43 66 43 73 C49 70 55 71 60 72.5 C65 71 71 70 77 73 C77 66 67 63 60 68 Z', INK)
                + L('M45 69 C50 66.5 55 67 60 69', '#fff', 1, { opacity: .3 })
        },
        antenna: {
            name: 'Antena',
            back: () => '',
            front: c => L('M60 16 V6', INK4, 1.6) + glowDot(60, 5, 2.6, c)
        },
        scar: {
            name: 'Blizna',
            back: () => '',
            front: () => L('M72 38 L58 72', INK4, 1.6) + L('M69 46 L74 48 M66 54 L71 56 M63 62 L68 64', INK4, 1.2)
        },
        badge: {
            name: 'Odznaka',
            back: () => '',
            front: c => P('M34 104 L36.4 109 L41.8 109.7 L37.8 113.4 L38.9 118.7 L34 116 L29.1 118.7 L30.2 113.4 L26.2 109.7 L31.6 109 Z', c)
        }
    };

    // ===== TŁA =====
    const defsId = 'ga';
    const BGS = {
        blinds: {
            name: 'Żaluzje',
            svg: c => {
                let s = R(0, 0, 120, 120, BG);
                for (let x = 0; x < 200; x += 16) s += P(`M${x} 0 H${x + 7} L${x + 7 - 34} 120 H${x - 34} Z`, c, { opacity: .11 });
                return s;
            }
        },
        radar: {
            name: 'Radar',
            svg: c => R(0, 0, 120, 120, BG)
                + `<defs><linearGradient id="${defsId}r" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${c}" stop-opacity="0"/><stop offset="1" stop-color="${c}" stop-opacity=".45"/></linearGradient></defs>`
                + P('M60 60 L120 30 A67 67 0 0 1 120 90 Z', `url(#${defsId}r)`, { transform: 'rotate(-40 60 60)' })
                + C(60, 60, 22, 'none', { stroke: c, 'stroke-width': 1, opacity: .28 }) + C(60, 60, 40, 'none', { stroke: c, 'stroke-width': 1, opacity: .28 }) + C(60, 60, 58, 'none', { stroke: c, 'stroke-width': 1, opacity: .28 })
                + L('M60 0 V120 M0 60 H120', c, 1, { opacity: .2 }) + C(92, 34, 2.4, c) + C(24, 88, 2, c, { opacity: .8 })
        },
        spot: {
            name: 'Reflektor',
            svg: c => `<defs><radialGradient id="${defsId}s" cx="0.5" cy="0" r="0.9"><stop offset="0" stop-color="${c}" stop-opacity=".5"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient></defs>`
                + R(0, 0, 120, 120, BG) + P('M44 0 H76 L116 120 H4 Z', `url(#${defsId}s)`)
        },
        grid: {
            name: 'Celownik',
            svg: c => {
                let s = R(0, 0, 120, 120, BG);
                for (let i = 15; i < 120; i += 15) s += L(`M${i} 0 V120 M0 ${i} H120`, '#fff', .8, { opacity: .06 });
                return s + C(60, 60, 44, 'none', { stroke: c, 'stroke-width': 1.4, opacity: .4 }) + L('M60 8 V22 M60 98 V112 M8 60 H22 M98 60 H112', c, 1.4, { opacity: .55 });
            }
        },
        city: {
            name: 'Miasto',
            svg: c => {
                let s = `<defs><linearGradient id="${defsId}c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d1020"/><stop offset="1" stop-color="${c}" stop-opacity=".35"/></linearGradient></defs>` + R(0, 0, 120, 120, `url(#${defsId}c)`);
                s += C(94, 24, 9, '#f4f1de', { opacity: .9 });
                const b = [[0, 74, 18], [16, 62, 16], [30, 80, 14], [76, 66, 18], [92, 78, 14], [104, 58, 16]];
                b.forEach(([x, y, w]) => {
                    s += R(x, y, w, 120 - y, INK2);
                    for (let wy = y + 6; wy < 112; wy += 9) for (let wx = x + 3; wx < x + w - 3; wx += 6) if ((wx * 7 + wy * 3) % 5 < 2) s += R(wx, wy, 2.6, 3.6, c, { opacity: .8 });
                });
                return s;
            }
        },
        cctv: {
            name: 'Monitoring',
            svg: c => {
                let s = R(0, 0, 120, 120, '#10141a');
                for (let y = 0; y < 120; y += 4) s += R(0, y, 120, 1.4, '#000', { opacity: .25 });
                s += L('M8 20 V8 H20 M100 8 H112 V20 M112 100 V112 H100 M20 112 H8 V100', '#fff', 2, { opacity: .55 });
                return s + C(18, 17, 3.4, '#ff3b3b') + C(18, 17, 6, '#ff3b3b', { opacity: .25 });
            }
        },
        redacted: {
            name: 'Zaczernione',
            svg: () => {
                let s = R(0, 0, 120, 120, '#1a1b20'), seed = 5;
                const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
                for (let y = 8; y < 120; y += 14) {
                    if ((y / 14) % 2) s += R(8 + rnd() * 10, y, 40 + rnd() * 50, 8, '#000');
                    else for (let x = 8; x < 108;) { const w = 10 + rnd() * 22; s += R(x, y + 3, w, 2.4, '#3a3d46'); x += w + 5; }
                }
                return s;
            }
        },
        print: {
            name: 'Odcisk palca',
            svg: c => {
                let s = R(0, 0, 120, 120, BG);
                for (let i = 0; i < 12; i++) {
                    const r = 6 + i * 4.8, gap = 8 + (i % 3) * 5;
                    s += E(60, 62, r * .86, r, 'none', { stroke: c, 'stroke-width': 1.7, opacity: .22, 'stroke-dasharray': `${20 + i * 3} ${gap}`, transform: `rotate(${i * 25} 60 62)` });
                }
                return s;
            }
        },
        blueprint: {
            name: 'Plan',
            svg: () => {
                let s = R(0, 0, 120, 120, '#0e2a4d');
                for (let i = 10; i < 120; i += 10) s += L(`M${i} 0 V120 M0 ${i} H120`, '#5d9be0', i % 50 ? .6 : 1.2, { opacity: i % 50 ? .22 : .4 });
                return s + C(60, 60, 36, 'none', { stroke: '#8fc1ff', 'stroke-width': 1, opacity: .4, 'stroke-dasharray': '3 4' });
            }
        },
        alarm: {
            name: 'Alarm',
            svg: () => `<defs><linearGradient id="${defsId}a" x1="0" y1="0" x2="1" y2="1"><stop offset=".5" stop-color="#7a1f26"/><stop offset=".5" stop-color="#1b3d78"/></linearGradient></defs>` + R(0, 0, 120, 120, `url(#${defsId}a)`)
        },
        neon: {
            name: 'Neon',
            svg: () => `<defs><linearGradient id="${defsId}n" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5b2a86"/><stop offset=".5" stop-color="#1b2a6b"/><stop offset="1" stop-color="#0f6f6a"/></linearGradient></defs>` + R(0, 0, 120, 120, `url(#${defsId}n)`)
        },
        dark: {
            name: 'Ciemne',
            svg: () => `<defs><linearGradient id="${defsId}d" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c1f27"/><stop offset="1" stop-color="#0d0f13"/></linearGradient></defs>` + R(0, 0, 120, 120, `url(#${defsId}d)`)
        }
    };

    const CATALOG = { body: BODIES, head: HEADS, gear: GEAR, eyes: EYES, mouth: MOUTHS, extra: EXTRAS, bg: BGS };
    const SLOTS = ['bg', 'body', 'head', 'gear', 'eyes', 'mouth', 'extra'];
    const PARTS = Object.fromEntries(Object.entries(CATALOG).map(([slot, items]) => [slot, Object.keys(items)]));
    PARTS.accent = Object.keys(ACCENTS);
    const NAMES = Object.fromEntries(Object.entries(CATALOG).map(([slot, items]) => [slot, Object.fromEntries(Object.entries(items).map(([id, item]) => [id, item.name]))]));

    // ===== SKŁADANIE =====
    function render(cfg) {
        const pick = (slot, def) => CATALOG[slot][cfg[slot]] || CATALOG[slot][def];
        const c = ACCENTS[cfg.accent] || ACCENTS.green;
        const body = pick('body', 'plain'), shape = pick('head', 'oval'), gear = pick('gear', 'bald'), eyes = pick('eyes', 'dots'), mouth = pick('mouth', 'none'), extra = pick('extra', 'none'), bg = pick('bg', 'dark');

        const head = gear.noHead ? '' : rim(shape.d, FACE, c, 1.4);
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" fill="none">`
            + bg.svg(c)
            + body.back(c) + (gear.back ? gear.back(c) : '')
            + rim(SHOULDERS, INK, c, 1.5) + P(NECK, INK2)
            + head
            + mouth.svg(c) + eyes.svg(c)
            + gear.front(c) + extra.front(c) + body.front(c)
            + `<defs><radialGradient id="${defsId}v" cx=".5" cy=".5" r=".75"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></radialGradient></defs>`
            + `<rect width="120" height="120" fill="url(#${defsId}v)"/>`
            + `</svg>`;
    }

    // Stan "wyrzucony": oczy z krzyżykami, wyszarzenie
    function renderKicked(cfg) {
        return render({ ...cfg, eyes: 'dead' }).replace('<svg ', '<svg style="filter:grayscale(.85) brightness(.85)" ');
    }

    function rng(seed) {
        let s = seed >>> 0;
        return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    }
    function random(seed) {
        const r = rng(seed), pickOf = list => list[Math.floor(r() * list.length)];
        const cfg = {};
        SLOTS.forEach(slot => { cfg[slot] = pickOf(PARTS[slot].filter(id => !(slot === 'eyes' && id === 'dead'))); });
        cfg.accent = pickOf(PARTS.accent);
        return cfg;
    }

    const api = {
        id: 'A', title: 'Cienie', tagline: 'Agenci noir: ciemne sylwetki, neonowe światło, świecące oczy',
        render, renderKicked, random, PARTS, NAMES, SLOTS, ACCENTS,
        base: { body: 'suit', head: 'pointed', gear: 'fedora', eyes: 'slit', mouth: 'none', extra: 'none', accent: 'green', bg: 'blinds' }
    };
    root.GenA = api;
    if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
