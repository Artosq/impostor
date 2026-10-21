// node render.js stills 0.4 2.2 ...   -> stills/t.png
// node render.js frames               -> frames/00000.jpg ... (30fps, DURATION seconds)
const { chromium } = require('./tools/node_modules/playwright-core');
const path = require('path');
const fs = require('fs');

const DURATION = 20.5, FPS = 30;
const [mode, ...times] = process.argv.slice(2);

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto('file:///' + path.join(__dirname, 'comp.html').replace(/\\/g, '/'));
  await page.evaluate(() => window.ready);
  const outDir = path.join(__dirname, mode === 'stills' ? 'stills' : 'frames');
  fs.mkdirSync(outDir, { recursive: true });

  const list = mode === 'stills' ? times.map(Number) : [...Array(Math.round(DURATION * FPS)).keys()].map(f => f / FPS);
  for (let i = 0; i < list.length; i++) {
    await page.evaluate(t => window.render(t), list[i]);
    const file = mode === 'stills' ? `${list[i]}.png` : `${String(i).padStart(5, '0')}.jpg`;
    await page.screenshot({ path: path.join(outDir, file), ...(mode === 'stills' ? {} : { type: 'jpeg', quality: 92 }) });
  }
  await browser.close();
})();
