// Мини-сервер для локальной проверки: node tools/serve.js [порт]
const http = require('http'); const fs = require('fs'); const path = require('path');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.mind': 'application/octet-stream', '.json': 'application/json', '.css': 'text/css' };
function start(root, port = 8090) {
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(root, p);
    if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((r) => srv.listen(port, () => r(srv)));
}
module.exports = { start };
if (require.main === module) start(path.join(__dirname, '..'), Number(process.argv[2]) || 8090).then(() => console.log('http://localhost:' + (process.argv[2] || 8090) + '/public/'));
