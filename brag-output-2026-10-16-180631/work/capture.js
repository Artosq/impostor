// Plays the storyboard's session against the real (rigged) server and screenshots each beat.
const { chromium } = require('../../brag-output/work/tools/node_modules/playwright-core');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(__dirname, 'shots');
const PORT = 10778;
const URL = `http://localhost:${PORT}/`;
fs.mkdirSync(OUT, { recursive: true });
const wait = ms => new Promise(r => setTimeout(r, ms));

const P = {
  Kasia:  { eyes: 'happy', mouth: 'smile02', pattern: 'circuits', background: 'e74c3c' },
  Tomek:  { eyes: 'round', mouth: 'grill01', pattern: 'camo01', background: '3498db' },
  Ola:    { eyes: 'hearts', mouth: 'smile01', pattern: 'dots', background: '2ecc71' },
  Maciek: { eyes: 'robocop', mouth: 'square01', pattern: 'grunge01', background: 'f1c40f' },
  Troll:  { eyes: 'shade01', mouth: 'grill02', pattern: 'grunge02', background: '8e44ad' },
  Kuba:   { eyes: 'eva', mouth: 'smile01', pattern: 'circuits', background: 'e67e22' },
  Ewa:    { eyes: 'bulging', mouth: 'diagram', pattern: 'dots', background: '1abc9c' },
  Zosia:  { eyes: 'frame1', mouth: 'smile02', pattern: 'camo02', background: 'e84393' },
  Bartek: { eyes: 'roundFrame01', mouth: 'square02', pattern: 'grunge01', background: '95a5a6' },
};

(async () => {
  const server = spawn('node', ['-r', path.join(__dirname, 'rig.js'), 'server.js'], { cwd: ROOT, env: { ...process.env, PORT }, stdio: 'inherit' });
  await wait(2500);
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const pages = {};
  async function open(name, lvl = 5) {
    const ctx = await browser.newContext({ viewport: { width: 430, height: 1000 }, deviceScaleFactor: 3 });
    await ctx.addInitScript(([av, lvl]) => {
      if (!sessionStorage.getItem('init')) {
        sessionStorage.setItem('init', '1'); localStorage.clear();
        localStorage.setItem('botConfig', JSON.stringify(av));
        localStorage.setItem('playerExp', '420'); localStorage.setItem('playerLVL', String(lvl));
      }
    }, [P[name], lvl]);
    const p = await ctx.newPage();
    p.on('dialog', d => d.accept());
    await p.goto(URL);
    await p.evaluate(n => { const el = document.getElementById('input-name'); el.value = n; el.dispatchEvent(new Event('change')); }, name);
    pages[name] = p;
    return p;
  }
  const shoot = (p, name, sel = '#card') => p.locator(sel).first().screenshot({ path: path.join(OUT, name + '.png') });
  const ev = (p, fn, arg) => p.evaluate(fn, arg);

  try {
    // Other public rooms for the room list
    for (const [host, guest] of [['Kuba', 'Ewa'], ['Bartek', null]]) {
      const h = await open(host); await wait(300);
      await ev(h, () => createRoom()); await wait(500);
      if (guest) { const g = await open(guest); const c = await ev(h, () => currentRoomCode); await ev(g, c => joinRoom(c), c); }
    }

    // (2) Avatar builder on Kasia's phone
    const kasia = await open('Kasia', 7);
    await wait(1200);
    await shoot(kasia, 'login');
    await ev(kasia, () => customizeAvatar()); await wait(900);
    await shoot(kasia, 'custom0');
    const tabs = ['eyes-customize', 'mouth-customize', 'pattern-customize', 'background-customize'];
    for (let i = 0; i < 4; i++) {
      await ev(kasia, () => randomizeAvatar(document.querySelector('.customize-dice'))); await wait(450);
      await shoot(kasia, `custom-roll${i + 1}`);
    }
    for (let i = 1; i < 4; i++) {
      await ev(kasia, ([t, i]) => changeCustomizeCategory(document.querySelectorAll('.customize-categories-tile')[i], t), [tabs[i], i]); await wait(250);
      await shoot(kasia, `custom-tab${i}`);
    }
    // back to Kasia's own look for the rest of the video
    await ev(kasia, av => { Object.assign(botConfig, av); localStorage.setItem('botConfig', JSON.stringify(botConfig)); renderCustomizeOptions(); updateCustomizePreview(); }, P.Kasia);
    await wait(500);
    await shoot(kasia, 'custom-final');
    await ev(kasia, () => showScreen('screen-login')); await wait(400);

    // (3) Room
    await ev(kasia, () => createRoom()); await wait(800);
    const code = await ev(kasia, () => currentRoomCode);
    await shoot(kasia, 'lobby1');
    let n = 1;
    for (const name of ['Tomek', 'Ola', 'Maciek']) {
      const p = await open(name); await wait(300);
      await ev(p, c => joinRoom(c), code); await wait(700);
      await shoot(kasia, `lobby${++n}`);
    }
    const viewer = await open('Zosia'); await wait(1200);
    await shoot(viewer, 'roomlist');
    const troll = await open('Troll'); await wait(300);
    await ev(troll, c => joinRoom(c), code); await wait(700);
    await shoot(kasia, 'lobby-troll');
    await ev(kasia, () => togglePrivacy()); await wait(700);
    await shoot(kasia, 'lobby-private');
    await ev(kasia, () => { const b = [...document.querySelectorAll('.avatar-container')].find(c => c.textContent.includes('Troll')).querySelector('.kick-button'); b.click(); });
    await wait(800);
    await shoot(kasia, 'lobby-kicked');
    await ev(kasia, () => selectCategory('Filmy')); await wait(600);
    await shoot(kasia, 'lobby-set');

    // (4) Categories
    await ev(kasia, () => openCategoryPicker()); await wait(1500);
    await shoot(kasia, 'picker', '.picker-window');
    await ev(kasia, () => openCategoryEditor()); await wait(500);
    await kasia.fill('#editor-name', 'Nasze żarty');
    const lines = ['Kebab o 3 w nocy | Sos, Taksówka', 'Wujek Zbyszek', 'Grill u Tomka | Kiełbasa, Ogród', 'Karaoke | Mikrofon, Fałsz'];
    let text = '';
    for (let k = 0; k < lines.length; k++) {
      text += (k ? '\n' : '') + lines[k];
      await kasia.fill('#editor-entries', text);
      await ev(kasia, () => updateEditorStatus()); await wait(150);
      await shoot(kasia, `editor${k + 1}`, '.picker-window');
    }
    await ev(kasia, () => { closeCategoryEditor(); closeCategoryPicker(); }); await wait(600);
    await ev(kasia, () => selectCategory('Filmy')); await wait(500);

    // (1)+(5) Impostor round: Titanic
    const players = ['Kasia', 'Tomek', 'Ola', 'Maciek'];
    await ev(kasia, () => startGame()); await wait(1500);
    for (const name of players) {
      const p = pages[name];
      await shoot(p, `game-${name}-hidden`);
      await ev(p, () => { const r = document.getElementById('role-display'); r.style.transition = 'none'; r.style.filter = 'none'; }); await wait(100);
      await shoot(p, `game-${name}-shown`);
      await ev(p, () => { document.getElementById('role-display').style.filter = ''; });
    }
    await ev(kasia, () => { window.confirm = () => true; castVote(); }); await wait(1000);
    for (const name of players) await ev(pages[name], t => { [...document.querySelectorAll('.vote-tile')].find(x => x.textContent.includes(t)).click(); }, name === 'Ola' ? 'Maciek' : 'Ola');
    await wait(500);
    await ev(kasia, () => { window.confirm = () => true; endGame(); }); await wait(2000);
    for (const name of players) await ev(pages[name], () => playAgain());
    await wait(1200);

    // (6) Pytania round
    await ev(kasia, () => changeSettings({ mode: 'pytania' })); await wait(700);
    await shoot(kasia, 'lobby-pytania');
    await ev(kasia, () => startGame()); await wait(1500);
    await ev(pages.Kasia, () => { const r = document.getElementById('role-display'); r.style.transition = 'none'; r.style.filter = 'none'; });
    await ev(pages.Ola, () => { const r = document.getElementById('role-display'); r.style.transition = 'none'; r.style.filter = 'none'; });
    await wait(150);
    await shoot(kasia, 'pyt-game-kasia');
    await shoot(pages.Ola, 'pyt-game-ola');
    const answers = { Kasia: '3', Tomek: '4', Maciek: '2', Ola: '40' };
    for (const name of players) {
      await pages[name].fill('#input-answer', answers[name]);
      await ev(pages[name], v => sendAnswer(v), answers[name]);
    }
    await wait(400);
    await shoot(kasia, 'pyt-game-kasia-typed');
    await ev(kasia, () => { window.confirm = () => true; castVote(); }); await wait(1200);
    await shoot(kasia, 'pyt-vote');

    // (7) Final: everyone votes Ola
    for (const name of players) {
      await ev(pages[name], t => { [...document.querySelectorAll('.vote-tile')].find(x => x.textContent.includes(t)).click(); }, name === 'Ola' ? 'Maciek' : 'Ola');
      if (name === 'Kasia') { await wait(400); await shoot(kasia, 'pyt-vote-picked'); }
    }
    await wait(500);
    await ev(kasia, () => { window.confirm = () => true; endGame(); }); await wait(2500);
    await shoot(kasia, 'pyt-results');
    await ev(kasia, () => playAgain()); await wait(1200);
    await shoot(kasia, 'lobby-again');
  } finally {
    await browser.close();
    server.kill();
  }
})();
