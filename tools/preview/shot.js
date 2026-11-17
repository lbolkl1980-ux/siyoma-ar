const { chromium } = require('playwright'); const { start } = require('../serve'); const path = require('path');
(async () => {
  const srv = await start(path.join(__dirname, '../..'), 8093);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1200, height: 400 } });
  p.on('pageerror', (e) => console.log('ERR', e.message));
  await p.goto('http://localhost:8093/tools/preview/' + (process.argv[2] || 'models.html'));
  await p.waitForFunction(() => window.__done, null, { timeout: 120000 });
  console.log(JSON.stringify(await p.evaluate(() => window.__info), null, 1));
  await p.screenshot({ path: process.argv[3] || '/tmp/models.png' });
  await b.close(); srv.close();
})();
