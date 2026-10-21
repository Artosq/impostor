// Builds Kasia's robot step by step in the real customization menu: tab -> tile, per part.
// Saves a screenshot per step plus tap positions (in screenshot px) to shots/custom-steps.json.
const { chromium } = require('../../brag-output/work/tools/node_modules/playwright-core');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(__dirname, 'shots');
const PORT = 10780;
const wait = ms => new Promise(r => setTimeout(r, ms));
const STEPS = [
  { tab: 0, part: 'eyes', value: 'happy', label: 'OCZY' },
  { tab: 1, part: 'mouth', value: 'smile02', label: 'BUZIA' },
  { tab: 2, part: 'pattern', value: 'circuits', label: 'WZÓR' },
  { tab: 3, part: 'background', value: 'red', label: 'TŁO' },
];

(async () => {
  const server = spawn('node', ['server.js'], { cwd: ROOT, env: { ...process.env, PORT }, stdio: 'ignore' });
  await wait(2500);
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const ctx = await browser.newContext({ viewport: { width: 430, height: 1000 }, deviceScaleFactor: 3 });
  await ctx.addInitScript(() => {
    localStorage.setItem('botConfig', JSON.stringify({ eyes: 'round', mouth: 'smile01', pattern: 'camo01', background: '555555' }));
  });
  const p = await ctx.newPage();
  const meta = [];
  const card = p.locator('#card');
  const rel = async sel => {      // element centre in screenshot px
    const [c, e] = await Promise.all([card.boundingBox(), p.locator(sel).first().boundingBox()]);
    return [(e.x + e.width / 2 - c.x) * 3, (e.y + e.height / 2 - c.y) * 3];
  };
  try {
    await p.goto(`http://localhost:${PORT}/`);
    await wait(1200);
    await p.evaluate(() => customizeAvatar());
    await wait(1200);
    await card.screenshot({ path: path.join(OUT, 'cs-start.png') });
    for (const [i, s] of STEPS.entries()) {
      const tabSel = `.customize-categories-tile >> nth=${s.tab}`;
      const tabPos = await rel(tabSel);
      await p.locator(tabSel).click();
      await wait(400);
      await card.screenshot({ path: path.join(OUT, `cs-${i}-tab.png`) });
      // the tile to pick; for the background take the reddest colour on offer
      const tileSel = await p.evaluate(({ part, value }) => {
        const tiles = [...document.querySelectorAll(`.${part}-custom`)];
        let idx;
        if (part === 'background') {
          const score = el => { const [r, g, b] = getComputedStyle(el).backgroundColor.match(/\d+/g).map(Number); return r - (g + b) / 2; };
          idx = tiles.indexOf(tiles.reduce((a, b) => score(b) > score(a) ? b : a));
        } else idx = tiles.findIndex(t => t.getAttribute('onclick').includes(`'${value}'`));
        tiles[idx].scrollIntoView({ block: 'center' });
        return `.${part}-custom >> nth=${idx}`;
      }, s);
      await wait(400);
      await card.screenshot({ path: path.join(OUT, `cs-${i}-scroll.png`) });
      const tilePos = await rel(tileSel);
      await p.locator(tileSel).click();
      await wait(600);
      await card.screenshot({ path: path.join(OUT, `cs-${i}-pick.png`) });
      meta.push({ ...s, tabPos, tilePos });
    }
    const size = await card.boundingBox();
    fs.writeFileSync(path.join(OUT, 'custom-steps.json'), JSON.stringify({ steps: meta, h: size.height * 3 }, null, 1));
  } finally {
    await browser.close(); server.kill();
  }
})();
