// Видео-«камера» для проверки без телефона: бланк на столе, лёгкое покачивание. → test/<имя>.y4m
// Запуск из папки с sharp: node tools/make-fake-camera.js targets/v7-energy-white-a.jpg
const path = require('path'); const fs = require('fs');
const sharp = require(process.env.SHARP || 'sharp');
const W = 640, H = 480, FR = 30, N = 60;
(async () => {
  const src = path.resolve(process.argv[2]);
  const out = path.join(__dirname, '../test', path.basename(src).replace(/\.\w+$/, '.y4m'));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const fd = fs.openSync(out, 'w');
  fs.writeSync(fd, `YUV4MPEG2 W${W} H${H} F${FR}:1 Ip A1:1 C420jpeg\n`);
  for (let f = 0; f < N; f++) {
    const ang = 6 * Math.sin((f / N) * 2 * Math.PI);
    const card = await sharp(src).resize({ width: 470 }).rotate(ang, { background: '#00000000' }).png().toBuffer();
    const m = await sharp(card).metadata();
    const { data } = await sharp({ create: { width: W, height: H, channels: 3, background: '#6b5a48' } })
      .composite([{ input: card, left: Math.round((W - m.width) / 2), top: Math.round((H - m.height) / 2) }])
      .removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const Y = Buffer.alloc(W * H), U = Buffer.alloc(W * H / 4), V = Buffer.alloc(W * H / 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3, r = data[i], g = data[i + 1], b = data[i + 2];
      Y[y * W + x] = Math.max(0, Math.min(255, 0.299 * r + 0.587 * g + 0.114 * b));
      if (!(y % 2) && !(x % 2)) {
        const j = (y / 2) * (W / 2) + x / 2;
        U[j] = Math.max(0, Math.min(255, 128 - 0.168736 * r - 0.331264 * g + 0.5 * b));
        V[j] = Math.max(0, Math.min(255, 128 + 0.5 * r - 0.418688 * g - 0.081312 * b));
      }
    }
    fs.writeSync(fd, 'FRAME\n'); fs.writeSync(fd, Y); fs.writeSync(fd, U); fs.writeSync(fd, V);
  }
  fs.closeSync(fd); console.log('✓', out);
})();
