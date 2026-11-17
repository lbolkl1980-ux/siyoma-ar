// «Шоу» над сертификатом: молнии → огненный портал → 3D-дракон вылетает, кружит, дышит огнём →
// золотая табличка «ПОЗДРАВЛЯЕМ!» и конфетти. Координаты: лист в плоскости XY (ширина 1), Z — вверх от листа.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

export const PAPER_H = 210 / 297;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const outBack = (t) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);
const rand = (a, b) => a + Math.random() * (b - a);
const BRAND = ['#00B9F0', '#EC3237', '#FFD21F', '#F7931E', '#6A2BC2', '#1F5BD8', '#ffffff'];

// ── Частицы (огонь, искры) ─────────────────────────────────────────────────
const P_VERT = `
attribute float aSize; attribute float aLife; attribute vec3 aColor;
varying float vLife; varying vec3 vColor;
uniform float uViewH;
void main(){
  vLife = aLife; vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position,1.0);
  gl_Position = projectionMatrix * mv;
  float grow = uRamp > 0.5 ? (0.45 + aLife * 1.3) : (1.0 - aLife * 0.5);
  gl_PointSize = aLife < 0.0 ? 0.0 : aSize * grow * uViewH * projectionMatrix[1][1] * 0.5 / -mv.z;
}`;
const P_FRAG = `
varying float vLife; varying vec3 vColor; uniform float uRamp;
void main(){
  vec2 c = gl_PointCoord - 0.5; float d = length(c) * 2.0;
  if (d > 1.0 || vLife < 0.0) discard;
  float soft = pow(1.0 - d, 1.6);
  vec3 col; float a;
  if (uRamp > 0.5) {
    float l = vLife;
    col = mix(vec3(1.0,1.0,0.85), vec3(1.0,0.82,0.12), smoothstep(0.0,0.18,l));
    col = mix(col, vec3(0.97,0.45,0.08), smoothstep(0.18,0.45,l));
    col = mix(col, vec3(0.85,0.13,0.25), smoothstep(0.45,0.75,l));
    col = mix(col, vec3(0.25,0.08,0.35), smoothstep(0.75,1.0,l));
    a = soft * (1.0 - smoothstep(0.55, 1.0, l)) * 1.15;
  } else { col = vColor; a = soft * (1.0 - vLife) * 1.2; }
  gl_FragColor = vec4(col * a, a);
}`;
class Particles {
  constructor(max, ramp) {
    this.max = max; this.n = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max).fill(-1); this.dur = new Float32Array(max).fill(1);
    this.size = new Float32Array(max); this.col = new Float32Array(max * 3).fill(1);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aLife', new THREE.BufferAttribute(this.life, 1));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    this.uniforms = { uViewH: { value: 800 }, uRamp: { value: ramp ? 1 : 0 } };
    const mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: 'uniform float uRamp;' + P_VERT, fragmentShader: P_FRAG, transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor });
    // «аддитивно с прозрачностью»: яркий огонь, но не пересвечивает бумагу до белого
    mat.blendEquation = THREE.AddEquation;
    this.points = new THREE.Points(g, mat); this.points.frustumCulled = false;
    this.cursor = 0;
  }
  spawn(p, v, dur, size, color) {
    const i = this.cursor; this.cursor = (this.cursor + 1) % this.max;
    this.pos.set([p.x, p.y, p.z], i * 3); this.vel.set([v.x, v.y, v.z], i * 3);
    this.life[i] = 0; this.dur[i] = dur; this.size[i] = size;
    if (color) { const c = new THREE.Color(color); this.col.set([c.r, c.g, c.b], i * 3); }
  }
  update(dt, gz = 0, drag = 0, viewH = 800) {
    this.uniforms.uViewH.value = viewH;
    const k = Math.max(0, 1 - drag * dt);
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] < 0) continue;
      this.life[i] += dt / this.dur[i];
      if (this.life[i] >= 1) { this.life[i] = -1; continue; }
      const j = i * 3;
      this.vel[j] *= k; this.vel[j + 1] *= k; this.vel[j + 2] = this.vel[j + 2] * k + gz * dt;
      this.pos[j] += this.vel[j] * dt; this.pos[j + 1] += this.vel[j + 1] * dt; this.pos[j + 2] += this.vel[j + 2] * dt;
    }
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = a.aLife.needsUpdate = a.aSize.needsUpdate = a.aColor.needsUpdate = true;
  }
}

// ── Молния: ломаная из «смещения середины», ядро + свечение ───────────────
function boltPoints(a, b, rough, depth) {
  let pts = [a.clone(), b.clone()];
  for (let d = 0; d < depth; d++) {
    const next = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], q = pts[i + 1], len = p.distanceTo(q);
      const m = p.clone().add(q).multiplyScalar(.5);
      m.add(V(rand(-1, 1), rand(-1, 1), rand(-.4, .4)).multiplyScalar(len * rough));
      next.push(m, q);
    }
    pts = next;
  }
  return pts;
}
function tube(pts, r, mat) {
  const path = new THREE.CurvePath();
  for (let i = 0; i < pts.length - 1; i++) path.add(new THREE.LineCurve3(pts[i], pts[i + 1]));
  return new THREE.Mesh(new THREE.TubeGeometry(path, pts.length * 2, r, 5, false), mat);
}

// ── Огненный портал ────────────────────────────────────────────────────────
const PORTAL_FRAG = `
varying vec2 vUv; uniform float uTime; uniform float uOpen;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<4;i++){ s+=a*n(p); p*=2.1; a*=0.5; } return s; }
void main(){
  vec2 p = vUv*2.0-1.0; float r = length(p); float ang = atan(p.y,p.x);
  float R = uOpen;
  if (R <= 0.001 || r > R + 0.35) discard;
  float sw = ang + r*5.0 - uTime*2.6;
  float f = fbm(vec2(cos(sw), sin(sw))*1.6 + vec2(r*4.0 - uTime*1.2, uTime*0.4));
  // спиральные рукава огня, тёмная середина, голубые разряды
  float arms = sin(ang*3.0 + r*16.0 - uTime*5.0)*0.5 + 0.5;
  float heat = pow(r/R, 1.3) * (0.35 + 1.0*arms*f) + 0.15*f;
  vec3 col = mix(vec3(0.05,0.02,0.13), vec3(0.42,0.12,0.62), smoothstep(0.05,0.35,heat));
  col = mix(col, vec3(0.96,0.36,0.08), smoothstep(0.3,0.65,heat));
  col = mix(col, vec3(1.0,0.86,0.35), smoothstep(0.65,1.0,heat));
  col += vec3(0.0,0.62,0.95) * smoothstep(0.9,1.0,arms) * smoothstep(0.75,0.75-0.4,r/R) * 0.9;
  float rim = exp(-pow((r - R) / (0.05 + 0.03*f), 2.0));
  col += vec3(1.0,0.9,0.6) * rim * 1.4;
  float inside = 1.0 - smoothstep(R - 0.01, R + 0.02, r);
  float glow = exp(-max(r - R, 0.0) * 9.0) * 0.55 * (0.7 + 0.5*f);
  float a = max(inside, glow);
  vec3 outc = r > R ? vec3(1.0,0.55,0.1) * glow : col;
  gl_FragColor = vec4(outc, a);
}`;

// ── Табличка «ПОЗДРАВЛЯЕМ!» (золото + бегущий блик) ────────────────────────
function signTexture() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 320;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 1024, 320);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  // синий канал — тёмная обводка/тень
  g.globalCompositeOperation = 'lighter';
  const fit = (txt, size, family, maxW) => { let f = size; do { g.font = `700 ${f}px ${family}`; f -= 4; } while (g.measureText(txt).width > maxW && f > 20); return g.font; };
  const BIG = fit('ПОЗДРАВЛЯЕМ!', 150, '"SiyomaSerif", Georgia, serif', 930), SMALL = fit('SIYOMA  ·  FIRE ENERGY DRAGON', 46, '"SiyomaSans", Arial, sans-serif', 900);
  g.font = BIG;
  g.lineJoin = 'round'; g.lineWidth = 22; g.strokeStyle = '#0000ff'; g.strokeText('ПОЗДРАВЛЯЕМ!', 512, 130);
  g.font = SMALL;
  g.lineWidth = 12; g.strokeText('SIYOMA  ·  FIRE ENERGY DRAGON', 512, 262);
  // красный канал — крупная надпись, зелёный — мелкая
  g.font = BIG; g.fillStyle = '#ff0000'; g.fillText('ПОЗДРАВЛЯЕМ!', 512, 130);
  g.font = SMALL; g.fillStyle = '#00ff00'; g.fillText('SIYOMA  ·  FIRE ENERGY DRAGON', 512, 262);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
}
const SIGN_FRAG = `
varying vec2 vUv; uniform sampler2D uMap; uniform float uTime; uniform float uAlpha;
void main(){
  vec3 m = texture2D(uMap, vUv).rgb;
  vec3 gold = mix(vec3(0.55,0.36,0.08), vec3(1.0,0.93,0.62), smoothstep(0.35, 0.95, vUv.y));
  gold = mix(gold, vec3(0.85,0.6,0.2), smoothstep(0.62, 0.5, vUv.y) * 0.5);
  float band = smoothstep(0.09, 0.0, abs(vUv.x - vUv.y * 0.35 - (fract(uTime * 0.35) * 1.8 - 0.4)));
  vec3 col = gold * m.r + vec3(1.0) * m.g + vec3(1.0,1.0,0.9) * band * m.r * 0.9;
  col = mix(vec3(0.03,0.07,0.14), col, clamp(m.r + m.g, 0.0, 1.0));
  float a = clamp(max(max(m.r, m.g), m.b * 0.75), 0.0, 1.0) * uAlpha;
  gl_FragColor = vec4(col, a);
}`;

function glowTexture(color) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), r = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  r.addColorStop(0, color); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}
function frameTexture() {
  const W = 1024, H = Math.round(1024 * (PAPER_H + .14) / 1.14);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), pad = W * .06;
  g.strokeStyle = '#BFF3FF'; g.shadowColor = '#00B9F0';
  for (const [blur, lw, a] of [[46, 12, .45], [20, 6, .8], [5, 3, 1]]) { g.shadowBlur = blur; g.lineWidth = lw; g.globalAlpha = a; g.strokeRect(pad, pad, W - 2 * pad, H - 2 * pad); }
  return new THREE.CanvasTexture(c);
}

// ── Дракон: перекраска под FIRE ENERGY DRAGON ──────────────────────────────
export function prepareDragon(gltf) {
  const colors = { Main: '#2350D8', Belly: '#F7931E', Wings: '#6A2BC2', Claws: '#FFD21F', Eyes: '#FFD21F' };
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    for (const m of [].concat(o.material)) {
      const c = colors[m.name]; if (!c) continue;
      m.color.set(c); m.flatShading = true; m.roughness = .55; m.metalness = .15;
      if (m.name === 'Eyes') { m.emissive.set('#FFB000'); m.emissiveIntensity = 2.2; }
      if (m.name === 'Main') { m.emissive.set('#0A1E66'); m.emissiveIntensity = .35; }
      if (m.name === 'Wings') { m.side = THREE.DoubleSide; m.emissive.set('#2A0A55'); m.emissiveIntensity = .5; }
      m.needsUpdate = true;
    }
  });
  return gltf;
}

export class Show {
  constructor(group, { gltf, sound, onFlash }) {
    this.group = group; this.sound = sound; this.onFlash = onFlash || (() => {});
    this.root = new THREE.Group(); group.add(this.root); this.root.visible = false;
    this.t = 0; this.events = [];

    // свет
    this.root.add(new THREE.HemisphereLight('#dfefff', '#2a1640', 1.6));
    const key = new THREE.DirectionalLight('#ffffff', 2.2); key.position.set(.4, -1, 1.6); this.root.add(key); this.root.add(key.target);
    this.mouthLight = new THREE.PointLight('#ff8a1e', 0, 1.2, 1.5); this.root.add(this.mouthLight);
    this.portalLight = new THREE.PointLight('#ff6a1e', 0, 1.0, 1.2); this.portalLight.position.set(0, 0, .08); this.root.add(this.portalLight);

    // светящаяся рамка
    this.frame = new THREE.Mesh(new THREE.PlaneGeometry(1.14, PAPER_H + .14), new THREE.MeshBasicMaterial({ map: frameTexture(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.frame.position.z = .001; this.root.add(this.frame);

    // портал
    this.portalU = { uTime: { value: 0 }, uOpen: { value: 0 } };
    this.portal = new THREE.Mesh(new THREE.PlaneGeometry(.62, .62), new THREE.ShaderMaterial({ uniforms: this.portalU, transparent: true, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }', fragmentShader: PORTAL_FRAG }));
    this.portal.position.z = .002; this.portal.scale.setScalar(1.25); this.root.add(this.portal);

    // частицы
    this.fire = new Particles(900, true); this.root.add(this.fire.points);
    this.sparks = new Particles(500, false); this.root.add(this.sparks.points);

    // молнии
    this.bolts = new THREE.Group(); this.root.add(this.bolts);
    this.boltCore = new THREE.MeshBasicMaterial({ color: '#F2FDFF', transparent: true, depthWrite: false });
    this.boltGlow = new THREE.MeshBasicMaterial({ color: '#00B9F0', transparent: true, opacity: .45, depthWrite: false, blending: THREE.AdditiveBlending });
    this.strikes = [];
    this.impactGlow = glowTexture('rgba(150,235,255,1)');

    // дракон
    this.dragonPos = V(0, 0, -.15); this.dragonFwd = V(0, 0, 1); this.roll = 0;
    this.dragon = new THREE.Group(); this.root.add(this.dragon);
    const model = SkeletonUtils.clone(gltf.scene);
    model.scale.setScalar(.1); this.dragon.add(model);
    this.nose = model.getObjectByName('Nose') || model.getObjectByName('Head');
    this.mixer = new THREE.AnimationMixer(model);
    const clip = (re) => gltf.animations.find((a) => re.test(a.name));
    this.act = { fly: this.mixer.clipAction(clip(/Flying/)), breath: this.mixer.clipAction(clip(/Attack2/) || clip(/Attack/)), roar: this.mixer.clipAction(clip(/Hit/) || clip(/Attack/)) };
    this.act.fly.play(); this.cur = this.act.fly;
    this.dragon.visible = false;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(0,185,240,.55)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    halo.scale.setScalar(.6); this.dragon.add(halo); this.halo = halo;

    // табличка
    this.signU = { uMap: { value: signTexture() }, uTime: { value: 0 }, uAlpha: { value: 0 } };
    const sg = new THREE.PlaneGeometry(.74, .74 * 320 / 1024); sg.translate(0, .74 * 320 / 1024 / 2, 0);
    this.sign = new THREE.Mesh(sg, new THREE.ShaderMaterial({ uniforms: this.signU, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }', fragmentShader: SIGN_FRAG }));
    this.signPivot = new THREE.Group(); this.signPivot.position.set(0, PAPER_H / 2 - .015, .004); this.signPivot.add(this.sign); this.root.add(this.signPivot);

    // конфетти
    const N = 160;
    this.conf = new THREE.InstancedMesh(new THREE.PlaneGeometry(.016, .009), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), N);
    this.conf.frustumCulled = false; this.confData = [];
    for (let i = 0; i < N; i++) { this.conf.setColorAt(i, new THREE.Color(BRAND[i % BRAND.length])); this.confData.push({ p: V(), v: V(), q: new THREE.Quaternion(), w: V(), alive: false }); }
    this.conf.instanceColor.needsUpdate = true; this.conf.count = 0; this.root.add(this.conf);
    this._m = new THREE.Matrix4(); this._s = V(1, 1, 1);
  }

  reset() {
    this.t = 0; this.nextStrike = .12; this.strikeN = 0; this.fired = {}; this.dragon.visible = false;
    this.dragonPos.set(0, 0, -.15); this.dragonFwd.set(0, 0, 1);
    for (const s of this.strikes) this.bolts.remove(s.g); this.strikes = [];
    this.conf.count = 0; this.confData.forEach((c) => (c.alive = false));
    this.fire.life.fill(-1); this.sparks.life.fill(-1);
  }
  start(fresh) { if (fresh || !this.started) this.reset(); this.started = true; this.root.visible = true; }
  stop() { this.root.visible = false; }
  once(key, fn) { if (!this.fired[key]) { this.fired[key] = true; fn(); } }
  play(name, fade = .25) { const a = this.act[name]; if (this.cur === a) return; a.reset().setLoop(name === 'fly' ? THREE.LoopRepeat : THREE.LoopOnce).play(); a.clampWhenFinished = true; this.cur.crossFadeTo(a, fade, false); this.cur = a; }

  strike(to) {
    const from = V(to.x * .4 + rand(-.25, .25), to.y * .4 + rand(-.1, .3), rand(1.1, 1.5));
    const pts = boltPoints(from, to, .22, 6);
    const g = new THREE.Group();
    g.add(tube(pts, .0035, this.boltCore), tube(pts, .014, this.boltGlow));
    for (let k = 0; k < 3; k++) {
      const i = 6 + Math.floor(Math.random() * (pts.length - 14)), p = pts[i];
      const end = p.clone().add(V(rand(-.2, .2), rand(-.2, .2), -rand(.05, .25)));
      g.add(tube(boltPoints(p, end, .3, 3), .002, this.boltCore));
    }
    const imp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.impactGlow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    imp.position.copy(to); imp.scale.setScalar(.3); g.add(imp);
    this.bolts.add(g); this.strikes.push({ g, t: 0 });
    for (let i = 0; i < 40; i++) this.sparks.spawn(to, V(rand(-.5, .5), rand(-.5, .5), rand(.1, .7)), rand(.3, .7), rand(.008, .018), Math.random() < .5 ? '#BFF3FF' : '#00B9F0');
    this.onFlash(.55); this.sound && this.sound.thunder(.8 + Math.random() * .3);
  }

  // Поворот дракона: «вперёд» = f, «вверх» ≈ +Z (от листа), плюс крен
  orient(f, roll) {
    const z = f.clone().normalize();
    let x = V(0, 0, 1).cross(z); if (x.lengthSq() < 1e-4) x = V(1, 0, 0); x.normalize();
    const y = z.clone().cross(x);
    this.dragon.quaternion.setFromRotationMatrix(this._m.makeBasis(x, y, z));
    this.dragon.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), roll));
  }

  update(dt, camLocal, viewH) {
    if (!this.root.visible) return;
    this.t += dt; const t = this.t;
    this.mixer.update(dt);

    // 1) рамка
    this.frame.material.opacity = smooth(0, .4, t) * (.7 + .3 * Math.sin(t * 5.5));

    // 2) молнии: две сразу, потом изредка
    if (t >= this.nextStrike) {
      const corners = [[-.5, PAPER_H / 2], [.5, PAPER_H / 2], [-.5, -PAPER_H / 2], [.5, -PAPER_H / 2]];
      const c = this.strikeN < 2 ? corners[this.strikeN] : corners[Math.floor(Math.random() * 4)];
      this.strike(V(c[0] * rand(.7, 1), c[1] * rand(.7, 1), 0));
      this.strikeN++; this.nextStrike = this.strikeN < 2 ? t + .35 : t + rand(3.5, 6);
    }
    for (const s of this.strikes) {
      s.t += dt; const on = s.t < .28 && (Math.floor(s.t * 30) % 3 !== 1);
      s.g.visible = on;
      if (s.t > .3 && s.g.parent) { this.bolts.remove(s.g); s.g.traverse((o) => o.geometry && o.geometry.dispose()); }
    }
    this.strikes = this.strikes.filter((s) => s.t <= .3);

    // 3) огонь по краям листа
    const rate = t < 1.6 ? 160 : 45;
    for (let i = 0, n = Math.round(rate * dt + Math.random()); i < n; i++) {
      const s = Math.random() * 2 * (1 + PAPER_H); let x, y;
      if (s < 1) { x = s - .5; y = PAPER_H / 2; } else if (s < 2) { x = s - 1.5; y = -PAPER_H / 2; }
      else if (s < 2 + PAPER_H) { x = -.5; y = s - 2 - PAPER_H / 2; } else { x = .5; y = s - 2 - PAPER_H * 1.5; }
      if (t < .25 || Math.random() < .6) this.fire.spawn(V(x, y, 0), V(x * .06, y * .06, rand(.06, .16)), rand(.5, 1.0), rand(.022, .045));
    }

    // 4) портал
    const open = smooth(.6, 1.2, t) * (1 - smooth(3.4, 4.2, t));
    this.portalU.uOpen.value = open * .62; this.portalU.uTime.value = t;
    this.portalLight.intensity = open * (2.2 + Math.sin(t * 17) * .5);
    if (t > .6) this.once('whoosh', () => this.sound && this.sound.whoosh(1.1));
    if (open > .2) for (let i = 0; i < 3; i++) { // искры, затягиваемые в вихрь
      const a = Math.random() * Math.PI * 2, r = rand(.18, .3);
      this.sparks.spawn(V(Math.cos(a) * r, Math.sin(a) * r, rand(0, .03)), V(-Math.sin(a) * .35 - Math.cos(a) * .25, Math.cos(a) * .35 - Math.sin(a) * .25, rand(0, .05)), rand(.4, .8), rand(.006, .012), Math.random() < .5 ? '#FFD21F' : '#F7931E');
    }

    // 5) дракон
    const target = V(), fwd = V(); let roll = 0, breathing = false;
    if (t < 1.25) { this.dragon.visible = false; }
    else {
      this.dragon.visible = true;
      this.once('roar1', () => { this.sound && this.sound.roar(); this.onFlash(.25); });
      const T0 = 2.45, CYC = 7.6;
      if (t < T0) { // вылет из портала: снизу вверх по дуге
        const k = smooth(1.25, T0, t);
        target.set(Math.sin(k * 2.2) * .12, -.05 * k, -.12 + .55 * k);
        fwd.set(Math.cos(k * 2.2) * .3, -.25 * k, 1 - k * .7);
        this.dragonPos.copy(target); // точно по траектории
        this.dragon.scale.setScalar(.35 + .65 * outBack(clamp01((t - 1.25) / .8)));
        for (let i = 0; i < 4; i++) this.fire.spawn(this.dragonPos.clone().add(V(rand(-.03, .03), rand(-.03, .03), -.05)), V(rand(-.1, .1), rand(-.1, .1), rand(-.05, .1)), rand(.3, .6), rand(.03, .05));
      } else {
        this.dragon.scale.setScalar(1);
        const c = (t - T0) % CYC, R = .37;
        if (c < 4.6) { // кружит над листом
          const th = -Math.PI / 2 + (c / 4.6) * Math.PI * 2;
          target.set(Math.cos(th) * R, Math.sin(th) * R * .72, .33 + .05 * Math.sin(th * 2));
          fwd.set(-Math.sin(th), Math.cos(th) * .72, .05 * Math.cos(th * 2) * 2);
          roll = -.45; this.play('fly');
        } else if (c < 7.0) { // зависает и дышит огнём в камеру
          target.set(0, -.2, .36); fwd.copy(camLocal).sub(this.dragonPos); fwd.z *= .6;
          if (c > 4.9) { this.play('breath', .2); }
          if (c > 5.05 && c < 6.55) { breathing = true; this.once('fire' + Math.floor((t - T0) / CYC), () => this.sound && this.sound.fire(1.5)); }
          if (c > 6.6) this.play('fly');
        } else { // возвращается на круг
          const th = -Math.PI / 2; target.set(Math.cos(th) * R, Math.sin(th) * R * .72, .33); fwd.set(1, 0, 0); this.play('fly');
        }
        const k = 1 - Math.exp(-dt * 3.2);
        this.dragonPos.lerp(target, k);
      }
      this.dragon.position.copy(this.dragonPos);
      this.dragonFwd.lerp(fwd.normalize(), 1 - Math.exp(-dt * 5)); this.roll += (roll - this.roll) * (1 - Math.exp(-dt * 3));
      this.orient(this.dragonFwd, this.roll);
      this.halo.material.opacity = .5 + .2 * Math.sin(t * 4);
    }

    // огонь изо рта
    if (breathing && this.nose) {
      const m = this.nose.getWorldPosition(V()); this.root.worldToLocal(m);
      // струя к зрителю и вниз — как будто дракон «поджигает» лист перед собой
      const dir = camLocal.clone().sub(m).normalize().multiplyScalar(.75).add(V(0, -.2, -.55)).normalize();
      for (let i = 0; i < 18; i++) {
        const v = dir.clone().multiplyScalar(rand(.5, .75)).add(V(rand(-.16, .16), rand(-.16, .16), rand(-.12, .12)));
        this.fire.spawn(m.clone().addScaledVector(dir, .05), v, rand(.4, .7), rand(.028, .05));
      }
      this.mouthLight.position.copy(m); this.mouthLight.intensity = 3 + Math.random() * 1.5;
      this.onFlash(.035, '#ff7a1a');
    } else this.mouthLight.intensity *= .85;

    // 6) табличка «ПОЗДРАВЛЯЕМ!» встаёт с верхнего края листа
    const ks = clamp01((t - 2.7) / .9);
    this.signPivot.rotation.x = outBack(ks) * 1.15;
    this.signU.uAlpha.value = smooth(2.7, 3.0, t); this.signU.uTime.value = t;
    this.signPivot.position.z = .004 + .02 * Math.sin(t * 1.7) * ks;
    if (t > 2.75) this.once('chime', () => this.sound && this.sound.chime());

    // 7) конфетти
    if (t > 2.85) this.once('conf', () => {
      this.conf.count = this.confData.length;
      for (const c of this.confData) {
        c.alive = true; c.p.set(rand(-.05, .05), rand(-.05, .05), .05);
        const a = Math.random() * Math.PI * 2, sp = rand(.25, .7);
        c.v.set(Math.cos(a) * sp, Math.sin(a) * sp * .8, rand(.6, 1.1));
        c.q.setFromEuler(new THREE.Euler(rand(0, 6), rand(0, 6), rand(0, 6))); c.w.set(rand(-9, 9), rand(-9, 9), rand(-9, 9));
      }
    });
    if (this.conf.count) {
      const fade = 1 - smooth(10, 12, t);
      this.confData.forEach((c, i) => {
        if (c.p.z > .002) {
          c.v.z -= 1.1 * dt; c.v.multiplyScalar(1 - 1.6 * dt); c.v.z = Math.max(c.v.z, -.18);
          c.v.x += Math.sin(t * 3 + i) * .05 * dt;
          c.p.addScaledVector(c.v, dt);
          c.q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(c.w.x * dt, c.w.y * dt, c.w.z * dt)));
          if (c.p.z <= .002) { c.p.z = .002; c.q.setFromAxisAngle(V(0, 0, 1), rand(0, 6)); }
        }
        this._s.setScalar(Math.max(.001, fade));
        this._m.compose(c.p, c.q, this._s); this.conf.setMatrixAt(i, this._m);
      });
      this.conf.instanceMatrix.needsUpdate = true;
    }

    // 8) искры фирменных цветов поднимаются с листа
    if (Math.random() < dt * 25) this.sparks.spawn(V(rand(-.5, .5), rand(-PAPER_H / 2, PAPER_H / 2), .005), V(rand(-.03, .03), rand(-.03, .03), rand(.08, .22)), rand(1, 2), rand(.007, .013), BRAND[Math.floor(Math.random() * 5)]);

    this.fire.update(dt, .25, .9, viewH);
    this.sparks.update(dt, -.05, .5, viewH);
  }
}
