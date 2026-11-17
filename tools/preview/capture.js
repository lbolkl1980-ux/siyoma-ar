// Кадры демо-режима с фиксированным шагом времени → test/demo-XX.png (и анимация test/demo.webp)
const { chromium } = require('playwright'); const { start } = require('../serve'); const path = require('path'); const fs = require('fs');
const ROOT = path.join(__dirname, '../..');
(async () => {
  const [W, H] = (process.env.SIZE || '390x700').split('x').map(Number);
  const times = (process.env.TIMES || '0.3,0.9,1.6,2.2,3.2,4.5,8.0,8.9').split(',').map(Number);
  const srv = await start(ROOT, 8094);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await p.goto('http://localhost:8094/public/?demo&capture');
  await p.waitForFunction(() => window.__ready, null, { timeout: 120000 });
  fs.mkdirSync(path.join(ROOT, 'test'), { recursive: true });
  let t = 0; const FPS = Number(process.env.FPS || 30);
  const frames = [];
  const anim = process.env.ANIM; // «0:9:12» — с 0 по 9 с, 12 кадров/с
  const [a0, a1, afps] = anim ? anim.split(':').map(Number) : [];
  for (const T of anim ? [] : times) {
    while (t < T) { const dt = Math.min(1 / FPS, T - t); await p.evaluate((d) => window.__step(d), dt); t += dt; }
    const f = path.join(ROOT, `test/demo-${T.toFixed(1)}.png`); await p.screenshot({ path: f }); frames.push(f);
  }
  if (anim) {
    while (t < a0) { await p.evaluate((d) => window.__step(d), 1 / FPS); t += 1 / FPS; }
    let i = 0;
    for (let T = a0; T < a1; T += 1 / afps) {
      while (t < T) { const dt = Math.min(1 / FPS, T - t + 1e-6); await p.evaluate((d) => window.__step(d), dt); t += dt; }
      const f = path.join(ROOT, `test/anim-${String(i++).padStart(4, '0')}.png`); await p.screenshot({ path: f, type: 'png' }); frames.push(f);
    }
  }
  console.log(JSON.stringify({ frames: frames.length, errs: [...new Set(errs)].slice(0, 6) }));
  await b.close(); srv.close();
})();
