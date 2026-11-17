// Проверка без телефона: Chromium с «камерой» из test/*.y4m, снимки экрана → test/shot-*.png
const path = require('path'); const fs = require('fs');
const { chromium } = require('playwright');
const { start } = require('./serve');
const ROOT = path.join(__dirname, '..');
(async () => {
  const video = path.resolve(process.argv[2] || 'test/v7-energy-white-a.y4m');
  const srv = await start(ROOT, 8092);
  const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${video}`, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 1, permissions: ['camera'] });
  const p = await ctx.newPage();
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text().slice(0, 200)); });
  p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  await p.goto('http://localhost:8092/public/');
  await p.screenshot({ path: path.join(ROOT, 'test/shot-0-start.png') });
  await p.click('#go');
  const t0 = Date.now();
  let found = null;
  while (Date.now() - t0 < 60000 && !found) { await p.waitForTimeout(500); found = await p.evaluate(() => window.__found || null); }
  console.log('распознан бланк:', found, 'за', ((Date.now() - t0) / 1000).toFixed(1), 'с');
  for (const [i, ms] of [[1, 6000], [2, 5000], [3, 1500]]) { await p.waitForTimeout(ms); await p.screenshot({ path: path.join(ROOT, `test/shot-${i}.png`) }); }
  console.log('ошибки:', [...new Set(errs)].slice(0, 8));
  await b.close(); srv.close();
})().catch((e) => { console.error(e); process.exit(1); });
