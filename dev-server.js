#!/usr/bin/env node
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = process.env.PORT || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const RELOAD_SNIPPET = `
<script>
(function () {
  var es = new EventSource('/__reload');
  es.onmessage = function (e) { if (e.data === 'reload') location.reload(); };
  es.onerror = function () { es.close(); setTimeout(function(){ location.reload(); }, 500); };
})();
</script>
`;

const clients = new Set();

function broadcastReload() {
  for (const res of clients) res.write('data: reload\n\n');
}

let debounce;
fs.watch(ROOT, { recursive: true }, (_event, filename) => {
  if (!filename || filename.startsWith('.git') || filename === 'dev-server.js') return;
  clearTimeout(debounce);
  debounce = setTimeout(broadcastReload, 80);
});

const server = http.createServer((req, res) => {
  if (req.url === '/__reload') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write('\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath.endsWith('/')) urlPath += 'index.html';
  const filePath = path.join(ROOT, urlPath);

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    res.setHeader('Cache-Control', 'no-store');

    if (ext === '.html') {
      fs.readFile(filePath, 'utf8', (e, body) => {
        if (e) { res.writeHead(500); res.end('Error'); return; }
        const injected = body.includes('</body>')
          ? body.replace('</body>', RELOAD_SNIPPET + '</body>')
          : body + RELOAD_SNIPPET;
        res.writeHead(200, { 'Content-Type': type });
        res.end(injected);
      });
    } else {
      res.writeHead(200, { 'Content-Type': type });
      fs.createReadStream(filePath).pipe(res);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Dev server: http://localhost:${PORT}`);
});
