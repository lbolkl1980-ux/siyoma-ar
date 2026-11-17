// SIYOMA · «Оживающий сертификат»: камера узнаёт бланк — из бумаги выходит дракон, огонь, молнии.
import * as THREE from 'three';
import { MindARThree } from './vendor/mindar/mindar-image-three.prod.js';

// Кнопки после анимации (пусто — кнопок нет). Пример: { text: '📸 Фото с турнира', url: 'https://...' }
const LINKS = [];

const SKY = '#00B9F0', RED = '#EC3237', GOLD = '#F4D27A', YELLOW = '#FFD21F', ORANGE = '#F7931E';
const PAPER_H = 210 / 297; // пропорция А4 альбомный (ширина метки = 1)

// ── Текстуры, нарисованные в коде ────────────────────────────────────────────
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.userData.canvas = c;
  return t;
}
const flameTex = canvasTex(128, 128, (g, w) => {
  const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  r.addColorStop(0, 'rgba(255,255,230,1)'); r.addColorStop(.25, 'rgba(255,210,31,.95)');
  r.addColorStop(.55, 'rgba(247,120,20,.55)'); r.addColorStop(1, 'rgba(216,33,63,0)');
  g.fillStyle = r; g.fillRect(0, 0, w, w);
});
const sparkTex = canvasTex(64, 64, (g, w) => {
  const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.3, 'rgba(255,255,255,.6)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, w, w);
});
const frameTex = canvasTex(1024, Math.round(1024 * (PAPER_H + .12) / 1.12), (g, w, h) => {
  const pad = w * .05;
  g.shadowColor = SKY; g.strokeStyle = '#BFF3FF';
  for (const [blur, lw, a] of [[40, 10, .5], [18, 6, .8], [4, 3, 1]]) {
    g.shadowBlur = blur; g.lineWidth = lw; g.globalAlpha = a;
    g.strokeRect(pad, pad, w - 2 * pad, h - 2 * pad);
  }
});
function textTex(lines) {
  return canvasTex(1024, 300, (g, w, h) => {
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const [big, small] = lines;
    g.font = '900 120px Georgia, "Times New Roman", serif';
    g.shadowColor = ORANGE; g.shadowBlur = 40;
    const gr = g.createLinearGradient(0, 40, 0, 190);
    gr.addColorStop(0, '#FFF6CF'); gr.addColorStop(.5, GOLD); gr.addColorStop(1, '#B8862F');
    g.fillStyle = gr; g.fillText(big, w / 2, 115);
    g.shadowBlur = 0; g.lineWidth = 3; g.strokeStyle = '#5a3c0a'; g.strokeText(big, w / 2, 115);
    g.font = '700 46px -apple-system, Roboto, sans-serif'; g.fillStyle = '#fff'; g.shadowColor = SKY; g.shadowBlur = 18;
    g.fillText(small, w / 2, 240);
  });
}
// Молния: перерисовывается на холсте каждые ~0.1 с
function drawBolt(g, w, h) {
  g.clearRect(0, 0, w, h);
  const pts = [[0, h / 2]];
  const N = 24;
  for (let i = 1; i < N; i++) pts.push([(i / N) * w, h / 2 + (Math.random() - .5) * h * .7]);
  pts.push([w, h / 2]);
  const stroke = (lw, col, blur) => {
    g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.lineWidth = lw; g.strokeStyle = col; g.shadowColor = SKY; g.shadowBlur = blur; g.lineJoin = 'round'; g.stroke();
  };
  stroke(14, 'rgba(0,185,240,.35)', 30); stroke(6, SKY, 16); stroke(2.5, '#F0FDFF', 6);
  // ответвление
  const [bx, by] = pts[4 + Math.floor(Math.random() * (N - 8))];
  g.beginPath(); g.moveTo(bx, by);
  let x = bx, y = by;
  for (let i = 0; i < 6; i++) { x += w * .03; y += (Math.random() - .3) * h * .25; g.lineTo(x, y); }
  g.lineWidth = 2; g.strokeStyle = '#BFF3FF'; g.stroke();
}

const additive = (map, opacity = 1) => new THREE.MeshBasicMaterial({ map, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
const ease = { outBack: (t) => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2), outCubic: (t) => 1 - Math.pow(1 - t, 3) };
const clamp01 = (x) => Math.min(1, Math.max(0, x));

// ── Эффект на одном бланке ──────────────────────────────────────────────────
class Effect {
  constructor(anchorGroup, dragonTex) {
    this.root = new THREE.Group(); anchorGroup.add(this.root);
    this.t = 0; this.active = false;

    // светящаяся рамка вокруг листа
    this.frame = new THREE.Mesh(new THREE.PlaneGeometry(1.12, PAPER_H + .12), additive(frameTex, 0));
    this.frame.position.z = .002; this.root.add(this.frame);

    // молнии по краям листа
    this.bolts = [];
    const edges = [[0, PAPER_H / 2 + .03, 0, 1.0], [0, -PAPER_H / 2 - .03, 0, 1.0], [-.53, 0, Math.PI / 2, PAPER_H], [.53, 0, Math.PI / 2, PAPER_H]];
    for (const [x, y, rot, len] of edges) {
      const tex = canvasTex(512, 96, drawBolt);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(len, .1), additive(tex, 0));
      m.position.set(x, y, .01); m.rotation.z = rot; this.root.add(m);
      this.bolts.push({ m, tex, next: 0 });
    }

    // дракон «встаёт» из бумаги, как в книжке-раскладушке
    const DH = .42, DW = DH * dragonTex.image.width / dragonTex.image.height;
    this.pivot = new THREE.Group(); this.pivot.position.set(0, -.12, 0); this.root.add(this.pivot);
    const g = new THREE.PlaneGeometry(DW, DH); g.translate(0, DH / 2, 0);
    this.dragon = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: dragonTex, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    this.pivot.add(this.dragon);
    // ореол за драконом
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(DW * 1.9, DH * 1.5), additive(canvasTex(256, 256, (c, w) => {
      const r = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      r.addColorStop(0, 'rgba(0,185,240,.55)'); r.addColorStop(1, 'rgba(0,185,240,0)'); c.fillStyle = r; c.fillRect(0, 0, w, w);
    }), 0));
    halo.position.set(0, DH * .55, -.01); this.pivot.add(halo); this.halo = halo;
    this.mouth = new THREE.Vector3(0, DH * .07, .03);

    // надпись над драконом
    this.title = new THREE.Mesh(new THREE.PlaneGeometry(.5, .5 * 300 / 1024), new THREE.MeshBasicMaterial({ map: textTex(['ПОЗДРАВЛЯЕМ!', 'SIYOMA · FIRE ENERGY DRAGON']), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    this.title.position.set(0, DH + .1, .02); this.pivot.add(this.title);

    // огонь изо рта
    this.fire = [];
    for (let i = 0; i < 70; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
      s.visible = false; this.pivot.add(s); this.fire.push({ s, life: 0, v: new THREE.Vector3() });
    }
    // искры фирменных цветов
    this.sparks = [];
    const cols = [SKY, RED, GOLD, YELLOW, '#ffffff'];
    for (let i = 0; i < 50; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkTex, color: cols[i % cols.length], transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
      s.visible = false; this.root.add(s); this.sparks.push({ s, life: 0, v: new THREE.Vector3() });
    }
    this.root.visible = false;
  }
  start() { this.t = 0; this.active = true; this.root.visible = true; }
  stop() { this.active = false; this.root.visible = false; }

  emit(list, setup) { const p = list.find((q) => q.life <= 0); if (p) { setup(p); p.s.visible = true; } }

  update(dt) {
    if (!this.active) return;
    this.t += dt; const t = this.t;

    // рамка и молнии
    this.frame.material.opacity = clamp01(t / .4) * (.75 + .25 * Math.sin(t * 6));
    for (const b of this.bolts) {
      if (t > b.next) {
        drawBolt(b.tex.userData.canvas.getContext('2d'), 512, 96); b.tex.needsUpdate = true;
        b.m.material.opacity = Math.random() < .7 ? 1 : 0; b.next = t + .06 + Math.random() * .12;
      }
      if (t < .25) b.m.material.opacity = 0;
    }

    // дракон: появляется (0.3–1.1 c) и встаёт (0.6–1.6 c), потом «дышит»
    const k1 = clamp01((t - .3) / .8), k2 = clamp01((t - .6) / 1.0);
    const sc = Math.max(.001, ease.outBack(k1));
    this.pivot.scale.setScalar(sc * (1 + .025 * Math.sin(t * 2.2)));
    this.pivot.rotation.x = ease.outCubic(k2) * Math.PI / 2 * .5; // встаёт на 45° — видно и сверху, и сбоку
    this.pivot.position.z = (.02 + .1 * ease.outCubic(k2)) + .025 * Math.sin(t * 1.6) * k2;
    this.halo.material.opacity = k2 * (.55 + .2 * Math.sin(t * 3));

    // надпись
    const k3 = clamp01((t - 1.7) / .6);
    this.title.material.opacity = k3;
    this.title.position.y = this.dragon.geometry.parameters.height + .05 + .015 * Math.sin(t * 2);
    this.title.scale.setScalar(.7 + .3 * ease.outBack(k3));

    // огонь: залп каждые 3 с, по 1.3 с
    const cyc = (t - 1.6) % 3;
    if (t > 1.6 && cyc < 1.3) {
      for (let n = 0; n < 3; n++) this.emit(this.fire, (p) => {
        p.life = p.max = .55 + Math.random() * .35;
        p.s.position.copy(this.mouth);
        p.v.set((Math.random() - .5) * .25, (Math.random() - .5) * .12 - .05, .55 + Math.random() * .35);
      });
    }
    for (const p of this.fire) {
      if (p.life <= 0) continue;
      p.life -= dt; const a = 1 - p.life / p.max;
      p.s.position.addScaledVector(p.v, dt); p.v.y += .25 * dt;
      p.s.scale.setScalar(.03 + a * .13);
      p.s.material.opacity = Math.sin(Math.PI * clamp01(a)) * .95;
      if (p.life <= 0) p.s.visible = false;
    }

    // искры поднимаются с листа
    if (t > .2) this.emit(this.sparks, (p) => {
      p.life = p.max = 1.2 + Math.random() * 1.2;
      p.s.position.set((Math.random() - .5) * 1.05, (Math.random() - .5) * PAPER_H, .01);
      p.v.set((Math.random() - .5) * .05, (Math.random() - .5) * .05, .12 + Math.random() * .25);
    });
    for (const p of this.sparks) {
      if (p.life <= 0) continue;
      p.life -= dt; const a = 1 - p.life / p.max;
      p.s.position.addScaledVector(p.v, dt);
      p.s.scale.setScalar(.012 + .01 * Math.sin(a * 9));
      p.s.material.opacity = Math.sin(Math.PI * clamp01(a));
      if (p.life <= 0) p.s.visible = false;
    }
  }
}

// ── Запуск ──────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
async function run() {
  const targets = await (await fetch('targets.json')).json();
  const mindar = new MindARThree({ container: $('ar'), imageTargetSrc: 'targets.mind', maxTrack: 1, uiScanning: 'no', uiLoading: 'yes', filterMinCF: .0001, filterBeta: .001 });
  const { renderer, scene, camera } = mindar;
  const dragonTex = await new THREE.TextureLoader().loadAsync('assets/dragon.png');
  dragonTex.colorSpace = THREE.SRGBColorSpace;
  const effects = targets.map((name, i) => {
    const anchor = mindar.addAnchor(i);
    const fx = new Effect(anchor.group, dragonTex);
    anchor.onTargetFound = () => { fx.start(); $('hint').classList.add('hide'); window.__found = name; setTimeout(() => LINKS.length && $('links').classList.add('show'), 2500); };
    anchor.onTargetLost = () => { fx.stop(); $('hint').classList.remove('hide'); };
    return fx;
  });
  if (LINKS.length) $('links').innerHTML = LINKS.map((l) => `<a href="${l.url}" target="_blank" rel="noopener">${l.text}</a>`).join('');
  await mindar.start();
  $('hint').classList.remove('hide');
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), .05);
    effects.forEach((e) => e.update(dt));
    renderer.render(scene, camera);
  });
}
$('go').addEventListener('click', async () => {
  $('start').classList.add('hide');
  try { await run(); } catch (e) { console.error(e); $('err').style.display = 'flex'; }
});
if (new URLSearchParams(location.search).has('autostart')) $('go').click();
