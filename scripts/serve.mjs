import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT || 4173);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
const publicFiles = new Set(['index.html', 'styles.css', 'app.js', 'lib.js', 'favicon.svg']);
http.createServer(async (request, response) => {
  try {
    if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405); response.end(); return; }
    const name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/+/, '') || 'index.html';
    if (!publicFiles.has(name)) { response.writeHead(404); response.end('Not found'); return; }
    const content = await readFile(path.join(root, name));
    response.writeHead(200, { 'Content-Type': types[path.extname(name)], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch { response.writeHead(500); response.end('Server error'); }
}).listen(port, '127.0.0.1', () => console.log(`Lähi: http://127.0.0.1:${port}`));
