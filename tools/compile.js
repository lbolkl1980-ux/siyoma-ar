// Готовит public/targets.mind — «отпечатки» бланков, по которым камера их узнаёт.
// Берёт все картинки из targets/ (по алфавиту). Запуск: node tools/compile.js
const fs = require('fs'); const path = require('path');
const { chromium } = require('playwright');
const { start } = require('./serve');
const ROOT = path.join(__dirname, '..');
(async () => {
  const files = fs.readdirSync(path.join(ROOT, 'targets')).filter((f) => /\.(jpe?g|png)$/.test(f)).sort();
  const srv = await start(ROOT, 8091);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  p.on('console', (m) => { const t = m.text(); if (!/progress/.test(t)) console.log('  [page]', t); });
  await p.goto('http://localhost:8091/tools/blank.html');
  const data = await p.evaluate(async (files) => {
    const { Compiler } = await import('/public/vendor/mindar/mindar-image.prod.js');
    const imgs = await Promise.all(files.map((f) => new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = '/targets/' + f; })));
    const c = new Compiler();
    let last = 0;
    await c.compileImageTargets(imgs, (pr) => { if (pr - last > 10) { last = pr; console.log('progress ' + Math.round(pr)); } });
    const buf = await c.exportData();
    return Array.from(new Uint8Array(buf));
  }, files);
  fs.writeFileSync(path.join(ROOT, 'public/targets.mind'), Buffer.from(data));
  fs.writeFileSync(path.join(ROOT, 'public/targets.json'), JSON.stringify(files.map((f) => f.replace(/\.\w+$/, '')), null, 1));
  console.log('✓ targets.mind', (data.length / 1024).toFixed(0) + ' КБ,', files.length, 'бланков:', files.join(', '));
  await b.close(); srv.close();
})().catch((e) => { console.error(e); process.exit(1); });
