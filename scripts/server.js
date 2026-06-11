import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const root = process.cwd();
const port = Number(process.env.PORT || 4173);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
  const target = normalize(join(root, relative));
  if (!target.startsWith(root)) { response.writeHead(403).end('Forbidden'); return; }
  try {
    if (!statSync(target).isFile()) throw new Error('Not a file');
    response.writeHead(200, { 'content-type': mime[extname(target)] || 'application/octet-stream', 'cache-control': 'no-store' });
    createReadStream(target).pipe(response);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
}).listen(port, '0.0.0.0', () => console.log(`QuantumResist running at http://localhost:${port}`));
