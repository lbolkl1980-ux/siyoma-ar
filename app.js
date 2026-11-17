// SIYOMA · «Оживающий сертификат».
//   /           — дополненная реальность: камера узнаёт бланк, над ним начинается шоу
//   /?demo      — демо без сертификата (для показа на встрече, можно крутить пальцем)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Show, prepareDragon, PAPER_H } from './js/show.js';
import { Sound } from './js/audio.js';

// Кнопки после шоу (пусто — нет кнопок). Пример: { text: '📸 Фото с турнира', url: 'https://...' }
const LINKS = [];

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const sound = new Sound();

// вспышка экрана (молния, рык, огонь)
let flashA = 0;
function flash(a, color = '#E8FBFF') { if (a > flashA) { flashA = a; $('flash').style.background = color; } }
function tickFlash(dt) { flashA = Math.max(0, flashA - dt * 2.8); $('flash').style.opacity = flashA; }

async function loadAssets() {
  const fonts = [
    new FontFace('SiyomaSerif', 'url(assets/fonts/cormorant-cyr-700.woff2)', { weight: '700', unicodeRange: 'U+0400-04FF' }),
    new FontFace('SiyomaSerif', 'url(assets/fonts/cormorant-lat-700.woff2)', { weight: '700', unicodeRange: 'U+0000-00FF, U+2000-206F' }),
    new FontFace('SiyomaSans', 'url(assets/fonts/montserrat-cyr-700.woff2)', { weight: '700', unicodeRange: 'U+0400-04FF' }),
    new FontFace('SiyomaSans', 'url(assets/fonts/montserrat-lat-700.woff2)', { weight: '700', unicodeRange: 'U+0000-00FF, U+2000-206F' }),
  ];
  await Promise.all(fonts.map((f) => f.load().then((ff) => document.fonts.add(ff)).catch(() => {})));
  const gltf = prepareDragon(await new GLTFLoader().loadAsync('assets/models/dragon.glb'));
  return { gltf };
}

function showLinks() {
  if (!LINKS.length) return;
  $('links').innerHTML = LINKS.map((l) => `<a href="${l.url}" target="_blank" rel="noopener">${l.text}</a>`).join('');
  $('links').classList.add('show');
}

// ── Режим AR ────────────────────────────────────────────────────────────────
async function runAR(assets) {
  const { MindARThree } = await import('./vendor/mindar/mindar-image-three.prod.js');
  const targets = await (await fetch('targets.json')).json();
  const mindar = new MindARThree({ container: $('ar'), imageTargetSrc: 'targets.mind', maxTrack: 1, uiScanning: 'no', uiLoading: 'yes', filterMinCF: .0001, filterBeta: .001 });
  const { renderer, scene, camera } = mindar;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const shows = targets.map((name, i) => {
    const anchor = mindar.addAnchor(i);
    const show = new Show(anchor.group, { gltf: assets.gltf, sound, onFlash: flash });
    let lostAt = 0;
    anchor.onTargetFound = () => { show.start(performance.now() - lostAt > 4000); $('hint').classList.add('hide'); window.__found = name; setTimeout(showLinks, 4000); };
    anchor.onTargetLost = () => { lostAt = performance.now(); show.stop(); $('hint').classList.remove('hide'); };
    return { show, group: anchor.group };
  });
  await mindar.start();
  $('hint').classList.remove('hide');
  const clock = new THREE.Clock(), cam = new THREE.Vector3();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), .05);
    for (const { show, group } of shows) {
      if (!show.root.visible) continue;
      group.updateWorldMatrix(true, false);
      cam.set(0, 0, 0); group.worldToLocal(cam);
      show.update(dt, cam, renderer.domElement.height);
    }
    tickFlash(dt);
    renderer.render(scene, camera);
  });
}

// ── Демо без сертификата ────────────────────────────────────────────────────
async function runDemo(assets) {
  $('demo-bar').classList.add('show');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: params.has('capture') });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace; $('ar').appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, .01, 50);
  camera.up.set(0, 0, 1);
  const portrait = innerHeight > innerWidth;
  camera.position.set(0, portrait ? -1.75 : -1.1, portrait ? 1.55 : 1.0);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, .15); controls.enableDamping = true; controls.enablePan = false;
  controls.minDistance = .7; controls.maxDistance = 3.5; controls.maxPolarAngle = Math.PI * .47;
  controls.update();
  // стол и лист
  const tex = await new THREE.TextureLoader().loadAsync('assets/demo-cert.jpg'); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const table = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshBasicMaterial({ color: '#15161d' })); table.position.z = -.003; scene.add(table);
  const shadowC = document.createElement('canvas'); shadowC.width = shadowC.height = 128;
  const sg = shadowC.getContext('2d'); const r = sg.createRadialGradient(64, 64, 10, 64, 64, 64); r.addColorStop(0, 'rgba(0,0,0,.7)'); r.addColorStop(1, 'rgba(0,0,0,0)'); sg.fillStyle = r; sg.fillRect(0, 0, 128, 128);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.5, PAPER_H * 1.5), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shadowC), transparent: true, depthWrite: false })); shadow.position.z = -.002; scene.add(shadow);
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(1, PAPER_H), new THREE.MeshBasicMaterial({ map: tex })); scene.add(paper);
  const anchor = new THREE.Group(); scene.add(anchor);
  const show = new Show(anchor, { gltf: assets.gltf, sound, onFlash: flash });
  show.start(true); setTimeout(showLinks, 4000);
  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
  $('replay').onclick = () => show.start(true);
  const step = (dt) => { controls.update(); show.update(dt, camera.position.clone(), renderer.domElement.height); tickFlash(dt); renderer.render(scene, camera); };
  if (params.has('capture')) { window.__step = step; window.__ready = true; return; }
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => step(Math.min(clock.getDelta(), .05)));
}

// ── Кнопки ──────────────────────────────────────────────────────────────────
async function begin(mode) {
  sound.unlock();
  $('start').classList.add('hide');
  $('mute').classList.add('show');
  try {
    const assets = await loadAssets();
    if (mode === 'demo') await runDemo(assets); else await runAR(assets);
  } catch (e) { console.error(e); $('err').style.display = 'flex'; }
}
$('go').addEventListener('click', () => begin('ar'));
$('demo').addEventListener('click', () => begin('demo'));
$('mute').addEventListener('click', () => { sound.setMuted(!sound.muted); $('mute').textContent = sound.muted ? '🔇' : '🔊'; });
if (params.has('demo') && (params.has('capture') || params.has('autostart'))) begin('demo');
else if (params.has('autostart')) begin('ar');
