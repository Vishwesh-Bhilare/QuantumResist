import { createHash } from 'node:crypto';
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize } from 'node:path';

const root = process.cwd();
const port = Number(process.env.PORT || 4173);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
const wsGuid = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const validRoles = new Set(['alice', 'bob', 'eve']);

// Role → socket map
const roles = new Map();
// Socket → metadata map
const sockets = new Map();

// Demo state stored server-side
const demoState = {
  harvestedMessage: null,
  sessionSecret: null, // hex string, set by alice on session_init
  rsaPublicKey: null,  // hex string, set by alice in demo1
};

function getLanIp() {
  const nets = networkInterfaces();
  for (const interfaces of Object.values(nets)) {
    for (const iface of interfaces) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

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
    header[0] = 0x81; header[1] = 126;
    header.writeUInt16BE(body.length, 2);
    return Buffer.concat([header, body]);
  }
  const header = Buffer.alloc(10);
  header[0] = 0x81; header[1] = 127;
  header.writeBigUInt64BE(BigInt(body.length), 2);
  return Buffer.concat([header, body]);
}

function send(socket, payload) {
  if (socket.destroyed || !socket.writable) return;
  try { socket.write(frameJson(payload)); }
  catch (error) { log('send-error', error.message); }
}

function sendError(socket, message) {
  log('error', message);
  send(socket, { type: 'error', message });
}

function broadcastRoster() {
  const online = [...roles.keys()];
  for (const socket of roles.values()) send(socket, { type: 'roster', roles: online });
}

function broadcastAll(payload, excludeRole = null) {
  for (const [role, socket] of roles.entries()) {
    if (role !== excludeRole) send(socket, payload);
  }
}

function broadcastAllIncludingSender(payload) {
  for (const socket of roles.values()) send(socket, payload);
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

// Relay encrypted chat message — only alice can send these
function relayFromAlice(socket, message) {
  const meta = sockets.get(socket);
  if (meta?.role !== 'alice') { sendError(socket, 'Only Alice can relay messages'); return; }

  // Store for Demo 2 harvest
  demoState.harvestedMessage = {
    ciphertext: message.ciphertext,
    iv: message.iv,
    epoch: message.epoch,
    hmac: message.hmac,
    harvestedAt: Date.now(),
  };

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

// Handle demo_control — any role can send, relayed to all including sender
function handleDemoControl(socket, message) {
  const meta = sockets.get(socket);
  const from = meta?.role || 'unknown';
  const action = String(message.action || '');
  const payload = message.payload || {};

  // Special handling: session_init stores the secret and relays to bob/eve
  if (action === 'session_init') {
    if (from !== 'alice') { sendError(socket, 'Only Alice can init the session'); return; }
    demoState.sessionSecret = payload.secretHex;
    log('session_init', `secret=${payload.secretHex?.slice(0, 16)}...`);
    // Relay to bob and eve only (alice already has it)
    for (const [role, peer] of roles.entries()) {
      if (role !== 'alice') send(peer, { type: 'demo_control', action: 'session_init', payload, from: 'alice' });
    }
    return;
  }

  // demo1: store RSA public key
  if (action === 'demo1_rsa_keygen') {
    demoState.rsaPublicKey = payload.publicKeyHex;
    log('demo1', `rsa_keygen publicKey=${payload.publicKeyHex?.slice(0, 16)}...`);
  }

  // demo2: attach harvested message if requesting timeskip
  if (action === 'demo2_timeskip') {
    payload.harvestedMessage = demoState.harvestedMessage;
    payload.rsaPublicKey = demoState.rsaPublicKey;
    log('demo2', 'timeskip broadcast');
  }

  // Broadcast to ALL roles including sender
  broadcastAllIncludingSender({ type: 'demo_control', action, payload, from });
  log('demo_control', `action=${action} from=${from}`);
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
    // If alice joins and there's already a session secret, re-send nothing (alice owns it)
    // If bob/eve joins after alice, send them the current session secret
    if ((role === 'bob' || role === 'eve') && demoState.sessionSecret) {
      send(socket, {
        type: 'demo_control',
        action: 'session_init',
        payload: { secretHex: demoState.sessionSecret },
        from: 'alice',
      });
      log('session_replay', `sent existing secret to ${role}`);
    }
    return;
  }

  if (message.type === 'message') { relayFromAlice(socket, message); return; }
  if (message.type === 'demo_control') { handleDemoControl(socket, message); return; }

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
      length = meta.buffer.readUInt16BE(offset); offset += 2;
    } else if (length === 127) {
      if (meta.buffer.length < offset + 8) return;
      const bigLength = meta.buffer.readBigUInt64BE(offset);
      if (bigLength > BigInt(Number.MAX_SAFE_INTEGER)) { sendError(socket, 'Frame too large'); setTimeout(() => socket.destroy(), 25); return; }
      length = Number(bigLength); offset += 8;
    }

    if (meta.buffer.length < offset + 4 + length) return;
    const mask = meta.buffer.subarray(offset, offset + 4); offset += 4;
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
    '', '',
  ].join('\r\n'));
  sockets.set(socket, { role: null, buffer: Buffer.alloc(0) });
  socket.on('data', chunk => parseFrames(socket, chunk));
  socket.on('close', () => cleanup(socket));
  socket.on('end', () => cleanup(socket));
  socket.on('error', error => { log('error', error.message); cleanup(socket); });
});

const lanIp = getLanIp();
server.listen(port, '0.0.0.0', () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════════════╗');
  console.log('  ║        QuantumResist — Presentation Server       ║');
  console.log('  ╠══════════════════════════════════════════════════╣');
  console.log(`  ║  Local:    http://localhost:${port}               ║`);
  console.log(`  ║  LAN:      http://${lanIp}:${port}          ║`);
  console.log('  ╠══════════════════════════════════════════════════╣');
  console.log(`  ║  Alice:  http://${lanIp}:${port}/?role=alice  ║`);
  console.log(`  ║  Bob:    http://${lanIp}:${port}/?role=bob    ║`);
  console.log(`  ║  Eve:    http://${lanIp}:${port}/?role=eve    ║`);
  console.log('  ╚══════════════════════════════════════════════════╝');
  console.log('');
});
