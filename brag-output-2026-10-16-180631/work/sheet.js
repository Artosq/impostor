// node sheet.js out.png shot1.png shot2.png ... -> contact sheet of captured shots
const { chromium } = require('../../brag-output/work/tools/node_modules/playwright-core');
const fs = require('fs'), path = require('path');
const fileUrl = p => 'file:///' + path.resolve(p).split(path.sep).join('/');
const [out, ...files] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const p = await b.newPage({ viewport: { width: 1800, height: 1000 } });
  const tiles = files.map(f => `<div style="width:590px"><img src="${fileUrl(path.join('shots', f))}" style="width:590px"><div>${f}</div></div>`).join('');
  fs.writeFileSync('sheet.html', `<body style="margin:0;background:#333;display:flex;flex-wrap:wrap;gap:6px;font:14px sans-serif;color:#fff">${tiles}</body>`);
  await p.goto(fileUrl('sheet.html')); await p.waitForTimeout(500);
  await p.screenshot({ path: out, fullPage: true }); await b.close();
})();
