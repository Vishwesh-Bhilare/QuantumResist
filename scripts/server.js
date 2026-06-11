import { createHash } from 'node:crypto';
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const root = process.cwd();
const port = Number(process.env.PORT || 4173);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
const wsGuid = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const validRoles = new Set(['alice', 'bob', 'eve']);
const roles = new Map();
const sockets = new Map();

const server = createServer((request, response) => {
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
});

function log(event, details = '') {
  console.log(`[${new Date().toISOString()}] ${event}${details ? ` ${details}` : ''}`);
}

function frameJson(payload) {
  const body = Buffer.from(JSON.stringify(payload));
  if (body.length < 126) return Buffer.concat([Buffer.from([0x81, body.length]), body]);
  if (body.length < 65536) {
    const header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(body.length, 2);
    return Buffer.concat([header, body]);
  }
  const header = Buffer.alloc(10);
  header[0] = 0x81;
  header[1] = 127;
  header.writeBigUInt64BE(BigInt(body.length), 2);
  return Buffer.concat([header, body]);
}

function send(socket, payload) {
  if (socket.destroyed || !socket.writable) return;
  try { socket.write(frameJson(payload)); }
  catch (error) { log('error', error.message); }
}

function sendError(socket, message) {
  log('error', message);
  send(socket, { type: 'error', message });
}

function broadcastRoster() {
  const online = [...roles.keys()];
  for (const socket of roles.values()) send(socket, { type: 'roster', roles: online });
}

function cleanup(socket) {
  const meta = sockets.get(socket);
  if (!meta) return;
  sockets.delete(socket);
  if (meta.role && roles.get(meta.role) === socket) {
    roles.delete(meta.role);
    log('disconnect', meta.role);
    broadcastRoster();
  }
}

function relayFromAlice(socket, message) {
  const meta = sockets.get(socket);
  if (meta?.role !== 'alice') {
    sendError(socket, 'Only Alice can relay messages');
    return;
  }
  const payload = {
    type: 'relayed',
    from: 'alice',
    ciphertext: message.ciphertext,
    iv: message.iv,
    epoch: message.epoch,
    hmac: message.hmac,
  };
  for (const [role, peer] of roles.entries()) {
    if (role !== 'alice') send(peer, payload);
  }
  log('relay', `epoch=${message.epoch} bytes=${String(message.ciphertext || '').length / 2}`);
}

function handleJson(socket, raw) {
  let message;
  try { message = JSON.parse(raw); }
  catch { sendError(socket, 'Invalid JSON frame'); setTimeout(() => socket.destroy(), 25); return; }

  if (message.type === 'join') {
    const role = String(message.role || '').toLowerCase();
    if (!validRoles.has(role)) { sendError(socket, 'Invalid role'); setTimeout(() => socket.destroy(), 25); return; }
    if (roles.has(role)) { sendError(socket, `Role ${role} is already connected`); setTimeout(() => socket.destroy(), 25); return; }
    sockets.set(socket, { role });
    roles.set(role, socket);
    log('join', role);
    broadcastRoster();
    return;
  }

  if (message.type === 'message') {
    relayFromAlice(socket, message);
    return;
  }

  sendError(socket, `Unknown message type: ${message.type}`);
}

function parseFrames(socket, chunk) {
  const meta = sockets.get(socket) || { role: null, buffer: Buffer.alloc(0) };
  meta.buffer = Buffer.concat([meta.buffer || Buffer.alloc(0), chunk]);
  sockets.set(socket, meta);

  while (meta.buffer.length >= 2) {
    const first = meta.buffer[0];
    const second = meta.buffer[1];
    const opcode = first & 0x0f;
    const fin = (first & 0x80) !== 0;
    const masked = (second & 0x80) !== 0;
    let length = second & 0x7f;
    let offset = 2;

    if (!fin || opcode !== 0x1) { sendError(socket, 'Only unfragmented text frames are supported'); setTimeout(() => socket.destroy(), 25); return; }
    if (!masked) { sendError(socket, 'Client frames must be masked'); setTimeout(() => socket.destroy(), 25); return; }
    if (length === 126) {
      if (meta.buffer.length < offset + 2) return;
      length = meta.buffer.readUInt16BE(offset);
      offset += 2;
    } else if (length === 127) {
      if (meta.buffer.length < offset + 8) return;
      const bigLength = meta.buffer.readBigUInt64BE(offset);
      if (bigLength > BigInt(Number.MAX_SAFE_INTEGER)) { sendError(socket, 'Frame too large'); setTimeout(() => socket.destroy(), 25); return; }
      length = Number(bigLength);
      offset += 8;
    }

    if (meta.buffer.length < offset + 4 + length) return;
    const mask = meta.buffer.subarray(offset, offset + 4);
    offset += 4;
    const payload = Buffer.from(meta.buffer.subarray(offset, offset + length));
    for (let index = 0; index < payload.length; index += 1) payload[index] ^= mask[index % 4];
    meta.buffer = meta.buffer.subarray(offset + length);
    handleJson(socket, payload.toString('utf8'));
  }
}

server.on('upgrade', (request, socket) => {
  const key = request.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return; }
  const accept = createHash('sha1').update(`${key}${wsGuid}`).digest('base64');
  socket.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`,
    '',
    '',
  ].join('\r\n'));
  sockets.set(socket, { role: null, buffer: Buffer.alloc(0) });
  socket.on('data', chunk => parseFrames(socket, chunk));
  socket.on('close', () => cleanup(socket));
  socket.on('end', () => cleanup(socket));
  socket.on('error', error => { log('error', error.message); cleanup(socket); });
});

server.listen(port, '0.0.0.0', () => console.log(`QuantumResist running at http://localhost:${port}`));
