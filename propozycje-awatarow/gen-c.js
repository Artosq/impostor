// PROPOZYCJA C: "PIKSELE" - pikselowi szpiedzy na siatce 24x24, w stylu czcionki Silkscreen.
// Każda część to kilka linii pikseli, więc kombinacji jest dowolnie wiele. Rysowane od zera.
(function (root) {
    const INK = '#0b0c10', D1 = '#1b1e27', D2 = '#2c3140', G1 = '#4d5467', G2 = '#9aa2b5', WH = '#f6f6f6', RED = '#e5484d';

    const ACCENTS = {
        green: '#39e079', red: '#ff4d4d', blue: '#4fb3ff', yellow: '#ffd43b', magenta: '#ff5fd2',
        cyan: '#4ff0ff', orange: '#ff9a3d', violet: '#a78bfa'
    };
    const SKINS = { mint: '#8fe3a8', ice: '#9bd7ff', sand: '#ffd08a', rose: '#ff9db8', fog: '#c9ceda', lilac: '#c4a8ff', bone: '#f0ead8' };

    function shade(hex, f) {
        const n = parseInt(hex.slice(1), 16);
        const ch = s => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
        return '#' + [16, 8, 0].map(s => ch(s).toString(16).padStart(2, '0')).join('');
    }

    // ===== płótno pikselowe 24x24 =====
    function Grid(pal) {
        const N = 24, cells = Array.from({ length: N }, () => Array(N).fill(null));
        const color = key => (key && key.length === 1 ? pal[key] : key) || null;
        const api = {
            pal,
            get(x, y) { return x >= 0 && x < N && y >= 0 && y < N ? cells[y][x] : null; },
            px(x, y, key) { if (x >= 0 && x < N && y >= 0 && y < N && key) cells[y][x] = color(key); },
            rect(x, y, w, h, key) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) api.px(x + i, y + j, key); },
            // bitmapa z napisów: '.' = przezroczysty, litera = klucz z palety
            bmp(x0, y0, rows) {
                rows.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== '.') api.px(x0 + i, y0 + j, ch); }));
            },
            svg() {
                let out = '';
                const byColor = new Map();
                cells.forEach((row, y) => {
                    for (let x = 0; x < N;) {
                        const c = row[x];
                        if (!c) { x++; continue; }
                        let w = 1;
                        while (x + w < N && row[x + w] === c) w++;
                        if (!byColor.has(c)) byColor.set(c, []);
                        byColor.get(c).push(`M${x} ${y}h${w}v1h${-w}z`);
                        x += w;
                    }
                });
                byColor.forEach((paths, c) => { out += `<path fill="${c}" d="${paths.join('')}"/>`; });
                return out;
            }
        };
        return api;
    }

    // Wypełnia kształt (inside) i sam dorysowuje obrys; zwraca komórki wnętrza
    function blob(g, x0, y0, w, h, inside, fill, edge = 'k') {
        const has = (x, y) => x >= 0 && y >= 0 && x < w && y < h && inside(x, y);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            if (!has(x, y)) continue;
            const border = !has(x - 1, y) || !has(x + 1, y) || !has(x, y - 1) || !has(x, y + 1);
            g.px(x0 + x, y0 + y, border ? edge : fill);
        }
    }

    // ===== TWARZE: 14 x 12 pikseli, lewy górny róg (5, 7) =====
    const cornerCut = (x, y, w, h) => (x === 0 || x === w - 1) && (y === 0 || y === h - 1);
    const HEADS = {
        square: { name: 'Kwadratowa', inside: (x, y) => !cornerCut(x, y, 14, 12) },
        round: { name: 'Okrągła', inside: (x, y) => { const dx = (x + .5 - 7) / 7, dy = (y + .5 - 6) / 6; return dx * dx + dy * dy <= 1; } },
        pointed: { name: 'Szpiczasta', inside: (x, y) => { const half = y <= 6 ? 7 : 7 - (y - 6) * 1.1; return Math.abs(x + .5 - 7) <= half && !cornerCut(x, y, 14, 12); } },
        long: { name: 'Długa', inside: (x, y) => Math.abs(x + .5 - 7) <= 5 && !((x === 2 || x === 11) && (y === 0 || y === 11)) }
    };

    function drawHead(g, head) {
        blob(g, 5, 7, 14, 12, head.inside, 's');
        // prawy skraj twarzy ciemniejszy (cieniowanie)
        for (let y = 7; y < 19; y++) {
            for (let x = 18; x >= 5; x--) { if (g.get(x, y) === g.pal.s && g.get(x + 1, y) !== g.pal.s) { g.px(x, y, 'S'); break; } }
        }
    }

    // ===== NAKRYCIA GŁOWY (rysowane po twarzy, brzeg ma obejmować górę głowy) =====
    const GEAR = {
        fedora: {
            name: 'Kapelusz',
            draw: g => {
                g.rect(8, 3, 8, 1, 'k'); g.rect(7, 4, 1, 5, 'k'); g.rect(16, 4, 1, 5, 'k'); g.rect(8, 4, 8, 5, 'D');
                g.rect(8, 4, 2, 1, 'g'); g.px(11, 3, 'D'); g.px(12, 3, 'D'); g.px(11, 4, 'k'); g.px(12, 4, 'k');
                g.rect(8, 7, 8, 2, 'a'); g.rect(8, 8, 8, 1, 'A');
                g.rect(1, 9, 22, 1, 'k'); g.rect(1, 10, 1, 1, 'k'); g.rect(22, 10, 1, 1, 'k'); g.rect(2, 10, 20, 1, 'D'); g.rect(2, 11, 20, 1, 'k');
                g.rect(3, 10, 3, 1, 'g');
            }
        },
        bowler: {
            name: 'Melonik',
            draw: g => {
                g.rect(9, 3, 6, 1, 'k'); g.rect(8, 4, 1, 1, 'k'); g.rect(15, 4, 1, 1, 'k'); g.rect(7, 5, 1, 4, 'k'); g.rect(16, 5, 1, 4, 'k');
                g.rect(9, 4, 6, 1, 'D'); g.rect(8, 5, 8, 4, 'D'); g.rect(9, 5, 2, 1, 'g');
                g.rect(8, 7, 8, 1, 'a'); g.rect(5, 9, 14, 1, 'k'); g.rect(5, 10, 1, 1, 'k'); g.rect(18, 10, 1, 1, 'k'); g.rect(6, 10, 12, 1, 'D'); g.rect(6, 11, 12, 1, 'k');
            }
        },
        cap: {
            name: 'Płaska czapka',
            draw: g => {
                blob(g, 5, 4, 14, 7, (x, y) => { const dx = (x + .5 - 7) / 7, dy = (y + .5 - 7) / 5.4; return dx * dx + dy * dy <= 1; }, 'D');
                g.rect(8, 6, 3, 1, 'g'); g.px(12, 4, 'g');
                g.rect(3, 10, 18, 1, 'k'); g.rect(3, 11, 18, 1, 'k'); g.rect(4, 10, 16, 1, 'd');
            }
        },
        beanie: {
            name: 'Czapka',
            draw: g => {
                blob(g, 6, 2, 12, 7, (x, y) => { const dx = (x + .5 - 6) / 6, dy = (y + .5 - 7) / 5.6; return dx * dx + dy * dy <= 1; }, 'D');
                g.rect(8, 4, 3, 1, 'g');
                g.rect(5, 8, 14, 4, 'k'); g.rect(6, 9, 12, 2, 'a'); g.rect(6, 10, 12, 1, 'A');
                for (let x = 7; x < 18; x += 2) g.px(x, 9, 'A');
            }
        },
        slick: {
            name: 'Zaczes',
            draw: g => {
                blob(g, 5, 5, 14, 7, (x, y) => { const dx = (x + .5 - 7) / 7, dy = (y + .5 - 7) / 5.6; return dx * dx + dy * dy <= 1 && !(y >= 5 && x >= 4 && x <= 9); }, 'D');
                g.rect(8, 6, 5, 1, 'g'); g.rect(6, 11, 2, 1, 'D'); g.rect(16, 11, 2, 1, 'D');
            }
        },
        headphones: {
            name: 'Słuchawki',
            draw: g => {
                g.rect(8, 5, 8, 1, 'k'); g.rect(6, 6, 2, 1, 'k'); g.rect(16, 6, 2, 1, 'k'); g.rect(5, 7, 1, 5, 'k'); g.rect(18, 7, 1, 5, 'k');
                g.rect(8, 6, 8, 1, 'g'); g.rect(6, 7, 1, 1, 'g'); g.rect(17, 7, 1, 1, 'g');
                g.rect(2, 11, 4, 6, 'k'); g.rect(3, 12, 3, 4, 'a'); g.rect(18, 11, 4, 6, 'k'); g.rect(18, 12, 3, 4, 'a');
                g.px(3, 12, 'w'); g.px(19, 12, 'w');
            }
        },
        bald: {
            name: 'Łysy',
            draw: g => { g.px(9, 9, 'w'); g.px(10, 9, 'w'); g.px(9, 10, 'w'); }
        },
        hair: {
            name: 'Irokez',
            draw: g => {
                g.rect(10, 3, 4, 1, 'k'); g.rect(9, 4, 1, 4, 'k'); g.rect(14, 4, 1, 4, 'k'); g.rect(10, 4, 4, 5, 'a'); g.rect(10, 4, 1, 3, 'A');
                g.rect(8, 8, 1, 1, 'k'); g.rect(15, 8, 1, 1, 'k'); g.rect(9, 8, 6, 1, 'k');
            }
        }
    };

    // ===== OCZY =====
    const EYES = {
        dots: {
            name: 'Kropki',
            draw: g => { g.rect(8, 13, 2, 2, 'w'); g.rect(14, 13, 2, 2, 'w'); g.px(9, 14, 'k'); g.px(15, 14, 'k'); }
        },
        shades: {
            name: 'Okulary',
            draw: g => {
                g.rect(7, 12, 4, 2, 'k'); g.rect(13, 12, 4, 2, 'k'); g.rect(8, 14, 2, 1, 'k'); g.rect(14, 14, 2, 1, 'k'); g.rect(11, 12, 2, 1, 'k');
                g.px(8, 12, 'l'); g.px(9, 13, 'g'); g.px(14, 12, 'l'); g.px(15, 13, 'g'); g.rect(6, 12, 1, 1, 'k'); g.rect(17, 12, 1, 1, 'k');
            }
        },
        glow: {
            name: 'Świecące',
            draw: g => { g.rect(7, 12, 3, 1, 'k'); g.rect(14, 12, 3, 1, 'k'); g.rect(8, 13, 2, 2, 'a'); g.rect(14, 13, 2, 2, 'a'); g.px(8, 13, 'w'); g.px(14, 13, 'w'); }
        },
        wide: {
            name: 'Wielkie',
            draw: g => { g.rect(7, 12, 3, 3, 'w'); g.rect(14, 12, 3, 3, 'w'); g.px(8, 13, 'k'); g.px(15, 13, 'k'); g.rect(7, 11, 3, 1, 'k'); g.rect(14, 11, 3, 1, 'k'); }
        },
        cyclops: {
            name: 'Cyklop',
            draw: g => { g.rect(9, 12, 6, 3, 'w'); g.rect(8, 13, 1, 1, 'w'); g.rect(15, 13, 1, 1, 'w'); g.rect(11, 13, 2, 2, 'k'); g.rect(9, 11, 6, 1, 'k'); }
        },
        angry: {
            name: 'Groźne',
            draw: g => {
                g.rect(8, 13, 2, 2, 'w'); g.rect(14, 13, 2, 2, 'w'); g.px(9, 14, 'k'); g.px(14, 14, 'k');
                g.px(7, 11, 'k'); g.px(8, 11, 'k'); g.px(9, 12, 'k'); g.px(10, 12, 'k'); g.px(16, 11, 'k'); g.px(15, 11, 'k'); g.px(14, 12, 'k'); g.px(13, 12, 'k');
            }
        },
        dead: {
            name: 'Krzyżyki',
            draw: g => {
                [[8, 12], [14, 12]].forEach(([x, y]) => { g.px(x, y, 'k'); g.px(x + 2, y, 'k'); g.px(x + 1, y + 1, 'k'); g.px(x, y + 2, 'k'); g.px(x + 2, y + 2, 'k'); });
            }
        }
    };

    // ===== USTA =====
    const MOUTHS = {
        none: { name: 'Brak', draw: () => { } },
        line: { name: 'Kreska', draw: g => g.rect(10, 16, 4, 1, 'k') },
        smile: { name: 'Uśmiech', draw: g => { g.px(9, 15, 'k'); g.rect(10, 16, 4, 1, 'k'); g.px(14, 15, 'k'); } },
        grin: { name: 'Szeroki uśmiech', draw: g => { g.rect(9, 15, 6, 1, 'k'); g.rect(10, 16, 4, 1, 'w'); g.rect(9, 16, 1, 1, 'k'); g.rect(14, 16, 1, 1, 'k'); g.rect(10, 17, 4, 1, 'k'); } },
        mustache: { name: 'Wąsy', draw: g => { g.rect(8, 15, 8, 1, 'k'); g.rect(7, 16, 3, 1, 'k'); g.rect(14, 16, 3, 1, 'k'); g.rect(10, 16, 4, 1, 'D'); } },
        bandana: {
            name: 'Chusta',
            draw: g => { g.rect(7, 15, 10, 3, 'a'); g.rect(8, 18, 8, 1, 'a'); g.rect(7, 15, 10, 1, 'A'); g.px(9, 16, 'k'); g.px(12, 17, 'A'); g.px(14, 16, 'A'); g.rect(6, 15, 1, 3, 'k'); g.rect(17, 15, 1, 3, 'k'); }
        }
    };

    // ===== UBRANIE (szyja y=19, ramiona y=20..23) =====
    function shoulders(g, fill) {
        const rows = [[7, 10], [4, 16], [2, 20], [0, 24]];
        rows.forEach(([x, w], j) => {
            const y = 20 + j;
            for (let i = 0; i < w; i++) g.px(x + i, y, i === 0 || i === w - 1 || y === 20 ? 'k' : fill);
        });
        g.rect(9, 19, 1, 1, 'k'); g.rect(14, 19, 1, 1, 'k'); g.rect(10, 19, 4, 1, 'S');
        g.rect(10, 20, 4, 1, 'S');
    }
    const BODIES = {
        plain: { name: 'Sweter', draw: g => { shoulders(g, 'C'); g.rect(8, 22, 1, 2, 'c'); g.rect(15, 22, 1, 2, 'c'); g.rect(3, 22, 2, 1, 'c'); g.rect(19, 22, 2, 1, 'c'); } },
        suit: {
            name: 'Garnitur',
            draw: g => {
                shoulders(g, 'c');
                g.rect(10, 20, 4, 1, 'w'); g.rect(9, 21, 6, 1, 'w'); g.rect(11, 21, 2, 3, 'a');
                g.rect(9, 22, 2, 1, 'w'); g.rect(13, 22, 2, 1, 'w'); g.rect(10, 23, 1, 1, 'C'); g.rect(13, 23, 1, 1, 'C');
                g.px(9, 20, 'k'); g.px(14, 20, 'k'); g.px(8, 21, 'C'); g.px(15, 21, 'C'); g.rect(5, 21, 2, 1, 'C'); g.rect(17, 21, 2, 1, 'C');
            }
        },
        hoodie: {
            name: 'Bluza',
            draw: g => {
                shoulders(g, 'H'); g.rect(8, 20, 8, 1, 'a'); g.rect(9, 21, 6, 1, 'a'); g.rect(10, 20, 4, 1, 'S');
                g.px(10, 22, 'w'); g.px(10, 23, 'w'); g.px(13, 22, 'w'); g.px(13, 23, 'w'); g.px(10, 21, 'A'); g.px(13, 21, 'A');
            }
        },
        scarf: {
            name: 'Szalik',
            draw: g => {
                shoulders(g, 'c'); g.rect(8, 20, 8, 2, 'a'); g.rect(8, 21, 8, 1, 'A'); g.rect(14, 22, 3, 2, 'a'); g.rect(14, 23, 3, 1, 'A'); g.rect(10, 19, 4, 1, 'a');
            }
        }
    };

    // ===== DODATKI =====
    const EXTRAS = {
        none: { name: 'Nic', draw: () => { } },
        earpiece: {
            name: 'Słuchawka',
            draw: g => { g.rect(18, 12, 1, 2, 'g'); g.px(18, 12, 'a'); g.px(19, 14, 'g'); g.px(19, 15, 'g'); g.px(19, 16, 'g'); g.px(18, 17, 'g'); g.px(18, 18, 'g'); g.px(17, 19, 'g'); }
        },
        antenna: {
            name: 'Antena',
            draw: g => { g.rect(11, 1, 2, 2, 'k'); g.rect(11, 0, 2, 1, 'a'); g.px(11, 2, 'g'); }
        },
        scar: {
            name: 'Blizna',
            draw: g => { g.px(15, 10, 'r'); g.px(15, 11, 'r'); g.px(14, 12, 'r'); g.px(14, 13, 'r'); g.px(13, 14, 'r'); g.px(16, 12, 'w'); g.px(15, 14, 'w'); }
        },
        badge: {
            name: 'Odznaka',
            draw: g => { g.px(5, 21, 'a'); g.rect(4, 22, 3, 1, 'a'); g.px(5, 23, 'a'); g.px(4, 23, 'A'); g.px(6, 23, 'A'); }
        },
        blush: {
            name: 'Rumieńce',
            draw: g => { g.rect(7, 15, 2, 1, 'a'); g.rect(15, 15, 2, 1, 'a'); }
        }
    };

    // ===== TŁA =====
    const BGS = {
        solid: { name: 'Gładkie', draw: g => g.rect(0, 0, 24, 24, '#161820') },
        dither: {
            name: 'Szachownica',
            draw: (g, pal) => { for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) g.px(x, y, (x + y) % 2 ? '#191b24' : '#14161d'); }
        },
        stripes: {
            name: 'Pasy',
            draw: (g, pal) => { for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) g.px(x, y, ((x + y) >> 2) % 2 ? shade(pal.a, .22) : shade(pal.a, .16)); }
        },
        grid: {
            name: 'Siatka',
            draw: (g, pal) => { for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) g.px(x, y, x % 4 === 0 || y % 4 === 0 ? shade(pal.a, .3) : '#12141a'); }
        },
        scan: {
            name: 'Linie',
            draw: (g, pal) => { for (let y = 0; y < 24; y++) g.rect(0, y, 24, 1, y % 2 ? '#11131a' : shade(pal.a, .18)); }
        },
        stars: {
            name: 'Gwiazdy',
            draw: (g, pal) => {
                g.rect(0, 0, 24, 24, '#0f1118');
                [[2, 3], [20, 2], [4, 14], [21, 10], [1, 20], [22, 18], [18, 5], [5, 7], [12, 1], [3, 10]].forEach(([x, y], i) => g.px(x, y, i % 3 ? G2 : pal.a));
            }
        },
        city: {
            name: 'Miasto',
            draw: (g, pal) => {
                g.rect(0, 0, 24, 24, shade(pal.a, .18));
                [[0, 12, 5], [4, 9, 5], [9, 14, 4], [14, 10, 5], [18, 13, 6]].forEach(([x, y, w]) => {
                    g.rect(x, y, w, 24 - y, '#0e1016');
                    for (let wy = y + 2; wy < 21; wy += 3) for (let wx = x + 1; wx < x + w - 1; wx += 2) if ((wx + wy) % 3) g.px(wx, wy, pal.a);
                });
                g.rect(19, 2, 3, 3, '#f4f1de');
            }
        },
        alarm: {
            name: 'Alarm',
            draw: g => { for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) g.px(x, y, x + y < 24 ? '#4a1a22' : '#1a2f5c'); }
        }
    };

    const CATALOG = { bg: BGS, body: BODIES, head: HEADS, gear: GEAR, eyes: EYES, mouth: MOUTHS, extra: EXTRAS };
    const SLOTS = ['bg', 'body', 'head', 'gear', 'eyes', 'mouth', 'extra'];
    const PARTS = Object.fromEntries(Object.entries(CATALOG).map(([slot, items]) => [slot, Object.keys(items)]));
    PARTS.skin = Object.keys(SKINS);
    PARTS.accent = Object.keys(ACCENTS);
    const NAMES = Object.fromEntries(Object.entries(CATALOG).map(([slot, items]) => [slot, Object.fromEntries(Object.entries(items).map(([id, item]) => [id, item.name]))]));

    // ===== SKŁADANIE =====
    function render(cfg) {
        const pick = (slot, def) => CATALOG[slot][cfg[slot]] || CATALOG[slot][def];
        const skin = SKINS[cfg.skin] || SKINS.mint, accent = ACCENTS[cfg.accent] || ACCENTS.green;
        const pal = {
            k: INK, s: skin, S: shade(skin, .78), w: WH, a: accent, A: shade(accent, .62),
            d: D2, D: D1, g: G1, l: G2, r: RED,
            c: '#3b4360', C: '#566089', H: shade(accent, .5)     // ubrania: granat, jaśniejszy granat, bluza w kolorze akcentu
        };
        const g = Grid(pal);

        pick('bg', 'solid').draw(g, pal);
        pick('body', 'plain').draw(g);
        drawHead(g, pick('head', 'square'));
        pick('mouth', 'none').draw(g);
        pick('eyes', 'dots').draw(g);
        pick('gear', 'bald').draw(g);
        pick('extra', 'none').draw(g);

        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" shape-rendering="crispEdges">${g.svg()}</svg>`;
    }

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
        cfg.skin = pickOf(PARTS.skin);
        cfg.accent = pickOf(PARTS.accent);
        return cfg;
    }

    const api = {
        id: 'C', title: 'Piksele', tagline: 'Pikselowi szpiedzy na siatce 24×24, w stylu czcionki Silkscreen',
        render, renderKicked, random, PARTS, NAMES, SLOTS, ACCENTS,
        base: { bg: 'grid', body: 'suit', head: 'square', gear: 'fedora', eyes: 'shades', mouth: 'line', extra: 'none', skin: 'mint', accent: 'green' }
    };
    root.GenC = api;
    if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
