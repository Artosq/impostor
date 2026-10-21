// Drives a real 4-player game against the local server and screenshots the card at each beat.
const { chromium } = require('./tools/node_modules/playwright-core');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(__dirname, 'shots');
const PORT = 10777;
const URL = `http://localhost:${PORT}/`;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
fs.mkdirSync(OUT, { recursive: true });

const NAMES = ['Kasia', 'Tomek', 'Ola', 'Maciek'];
const AVATARS = [
  { eyes: 'happy', mouth: 'smile02', pattern: 'circuits', background: 'e74c3c' },
  { eyes: 'round', mouth: 'grill01', pattern: 'camo01', background: '3498db' },
  { eyes: 'hearts', mouth: 'smile01', pattern: 'dots', background: '2ecc71' },
  { eyes: 'robocop', mouth: 'square01', pattern: 'grunge01', background: 'f1c40f' },
];
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const server = spawn('node', ['server.js'], { cwd: ROOT, env: { ...process.env, PORT }, stdio: 'inherit' });
  await wait(2500);
  const browser = await chromium.launch({ executablePath: CHROME });
  const pages = [];
  try {
    for (let i = 0; i < 4; i++) {
      const ctx = await browser.newContext({ viewport: { width: 430, height: 1000 }, deviceScaleFactor: 3 });
      await ctx.addInitScript(([av, i]) => {
        if (!localStorage.getItem('init')) {
          localStorage.clear();
          localStorage.setItem('init', '1');
          localStorage.setItem('botConfig', JSON.stringify(av));
          localStorage.setItem('playerExp', String(120 + i * 340));
          localStorage.setItem('playerLVL', String(3 + i * 2));
        }
      }, [AVATARS[i], i]);
      const p = await ctx.newPage();
      p.on('dialog', d => d.accept());
      await p.goto(URL);
      await p.evaluate(n => { const el = document.getElementById('input-name'); el.value = n; el.dispatchEvent(new Event('change')); }, NAMES[i]);
      pages.push(p);
    }
    await wait(1500);
    await shoot(pages[0], 'login');

    await pages[0].evaluate(() => createRoom());
    await wait(800);
    const code = await pages[0].evaluate(() => currentRoomCode);
    await shoot(pages[0], 'lobby1');
    for (let i = 1; i < 4; i++) {
      await pages[i].evaluate(c => joinRoom(c), code);
      await wait(700);
      await shoot(pages[0], `lobby${i + 1}`);
    }
    await pages[0].evaluate(() => selectCategory('Filmy'));
    await wait(700);
    await shoot(pages[0], 'lobby-set');

    // Category picker list + custom editor typing
    await pages[0].evaluate(() => openCategoryPicker());
    await wait(1500);
    await shootSel(pages[0], '.picker-window', 'picker');
    await pages[0].evaluate(() => openCategoryEditor());
    await wait(500);
    const name = 'Nasza ekipa';
    const lines = ['Wakacje w Łebie', 'Grill u Tomka | Kiełbasa, Ogród', 'Pies Oli', 'Karaoke | Mikrofon, Fałsz'];
    await pages[0].fill('#editor-name', name);
    await pages[0].evaluate(() => updateEditorStatus());
    let text = '';
    for (let k = 0; k < lines.length; k++) {
      text += (k ? '\n' : '') + lines[k];
      await pages[0].fill('#editor-entries', text);
      await pages[0].evaluate(() => updateEditorStatus());
      await wait(150);
      await shootSel(pages[0], '.picker-window', `editor${k + 1}`);
    }
    await pages[0].evaluate(() => { closeCategoryEditor(); closeCategoryPicker(); });
    await wait(600);
    await pages[0].evaluate(() => selectCategory('Filmy'));
    await wait(500);

    await pages[0].evaluate(() => startGame());
    await wait(1500);
    const roles = [];
    for (let i = 0; i < 4; i++) {
      roles.push(await pages[i].evaluate(() => document.getElementById('role-name').innerText));
      await shoot(pages[i], `game${i}-hidden`);
      await pages[i].evaluate(() => { document.getElementById('role-display').style.transition = 'none'; document.getElementById('role-display').style.filter = 'none'; });
      await wait(100);
      await shoot(pages[i], `game${i}-shown`);
    }
    fs.writeFileSync(path.join(OUT, 'roles.json'), JSON.stringify({ roles, names: NAMES }));
    console.log('roles', roles);

    await pages[0].evaluate(() => { window.confirm = () => true; castVote(); });
    await wait(1200);
    await shoot(pages[0], 'vote');
    const imp = roles.findIndex(r => r === 'IMPOSTOR');
    for (let i = 0; i < 4; i++) {
      const target = imp === i ? (i + 1) % 4 : imp;
      await pages[i].evaluate(t => { document.querySelectorAll('.vote-tile')[t].click(); }, target);
      if (i === (imp === 0 ? 1 : 0)) { await wait(400); await shoot(pages[i], 'vote-picked'); }
    }
    await wait(600);
    await pages[0].evaluate(() => { window.confirm = () => true; endGame(); });
    await wait(2500);
    await shoot(pages[0], 'results');
    await shoot(pages[imp], 'results-imp');
  } finally {
    await browser.close();
    server.kill();
  }

  async function shoot(p, name) {
    await p.locator('#card').screenshot({ path: path.join(OUT, name + '.png') });
  }
  async function shootSel(p, sel, name) {
    await p.locator(sel).screenshot({ path: path.join(OUT, name + '.png') });
  }
})();
