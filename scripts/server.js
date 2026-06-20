import { createHash } from 'node:crypto';
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize } from 'node:path';

const root = process.cwd();
const port = Number(process.env.PORT || 4173);
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
};
const wsGuid = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const validRoles = new Set(['alice', 'bob', 'eve']);

// Maps role name -> WebSocket
const roles = new Map();
// Maps socket -> metadata { role, buffer }
const sockets = new Map();
let nextTabId = 1; // not used but kept for compatibility

// Server‑side demonstration state
const demoState = {
  harvestedMessage: null,   // { ciphertext, iv, epoch, hmac, plaintext, harvestedAt }
  sessionSecret: null,      // hex string of the 32‑byte shared secret (from Alice)
  rsaPublicKey: null,       // stored RSA public key JWK or hex
  rsaPrivateKey: null,      // stored RSA private key (for Demo2 decryption)
  rsaMetadata: null,        // additional info (e.g. modulus hex)
  currentEpoch: 1,          // latest ratchet epoch known to the server
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

function log(event, details = '') {
  console.log(`[${new Date().toISOString()}] ${event}${details ? ` ${details}` : ''}`);
}

// ---------- WebSocket framing (unchanged) ----------
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
  try {
    socket.write(frameJson(payload));
  } catch (error) {
    log('send-error', error.message);
  }
}

function sendError(socket, message) {
  log('error', message);
  send(socket, { type: 'error', message });
}

// ---------- Broadcasting helpers ----------
function broadcastRoster() {
  const online = [...roles.keys()];
  for (const socket of roles.values()) {
    send(socket, { type: 'roster', roles: online });
  }
}

function broadcastAll(payload, excludeRole = null) {
  for (const [role, socket] of roles.entries()) {
    if (role !== excludeRole) send(socket, payload);
  }
}

function broadcastAllIncludingSender(payload) {
  for (const socket of roles.values()) send(socket, payload);
}

// ---------- Session state sync for new clients ----------
function sendFullState(socket) {
  send(socket, { type: 'roster', roles: [...roles.keys()] });
  if (demoState.sessionSecret) {
    send(socket, {
      type: 'demo_control',
      action: 'session_init',
      payload: { secretHex: demoState.sessionSecret },
      from: 'alice',
    });
  }
  if (demoState.rsaPublicKey) {
    send(socket, {
      type: 'demo_control',
      action: 'demo1_rsa_keygen',
      payload: {
        publicKey: demoState.rsaPublicKey,
        privateKey: demoState.rsaPrivateKey,   // also send private key (for demo only)
        metadata: demoState.rsaMetadata,
      },
      from: 'alice',
    });
  }
  if (demoState.harvestedMessage) {
    send(socket, {
      type: 'demo_control',
      action: 'demo2_harvest',
      payload: { harvested: demoState.harvestedMessage },
      from: 'alice',
    });
  }
  send(socket, {
    type: 'demo_control',
    action: 'ratchet_advance',
    payload: { epoch: demoState.currentEpoch, deletedEpochs: [] },
    from: 'system',
  });
}

// ---------- Cleanup on disconnect ----------
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

// ---------- Message handlers ----------
function relayFromAlice(socket, message) {
  const meta = sockets.get(socket);
  if (meta?.role !== 'alice') {
    sendError(socket, 'Only Alice can relay encrypted messages');
    return;
  }
  // Store harvested message with plaintext (for Demo2)
  demoState.harvestedMessage = {
		ciphertext: message.ciphertext,
		iv: message.iv,
		epoch: message.epoch,
		hmac: message.hmac,
		plaintext: message.plaintext || '(no plaintext stored)',
		rsaCiphertext: message.rsaCiphertext || null,
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

function handleDemoControl(socket, message) {
  const meta = sockets.get(socket);
  const from = meta?.role || 'unknown';
  const action = String(message.action || '');
  const payload = message.payload || {};

  // Session initialisation
  if (action === 'session_init') {
    if (from !== 'alice') {
      sendError(socket, 'Only Alice can initialise the session');
      return;
    }
    demoState.sessionSecret = payload.secretHex;
    log('session_init', `secret=${payload.secretHex?.slice(0, 16)}...`);
    broadcastAll({ type: 'demo_control', action, payload, from: 'alice' }, 'alice');
    return;
  }

  // RSA key storage (from Demo1)
  if (action === 'demo1_rsa_keygen') {
    demoState.rsaPublicKey = payload.publicKey;
    demoState.rsaPrivateKey = payload.privateKey || null;
    demoState.rsaMetadata = payload.metadata;
    log('demo1_rsa_keygen', 'RSA key saved');
    broadcastAllIncludingSender({ type: 'demo_control', action, payload, from });
    return;
  }

  // Harvest message storage
  if (action === 'demo2_harvest') {
    if (payload.harvested) {
      demoState.harvestedMessage = payload.harvested;
      log('demo2_harvest', `harvested epoch=${payload.harvested.epoch}`);
    }
    broadcastAllIncludingSender({ type: 'demo_control', action, payload, from });
    return;
  }

  // Ratchet advance sync
  if (action === 'ratchet_advance') {
    if (payload.epoch !== undefined) demoState.currentEpoch = payload.epoch;
    log('ratchet_advance', `epoch=${demoState.currentEpoch}`);
    broadcastAllIncludingSender({ type: 'demo_control', action, payload, from });
    return;
  }

  // Demo 2: Decrypt request (Harvest Now, Decrypt Later)
  if (action === 'demo2_decrypt_request') {
    log('demo2_decrypt_request', `from=${from}`);
    const harvested = payload.harvested || demoState.harvestedMessage;
    let classicalResult = 'failed';
    let classicalPlaintext = '(RSA decryption unavailable)';
    let pqcResult = 'failed';
    let pqcMessage = 'STILL ENCRYPTED — KEY DELETED';

    if (harvested && harvested.plaintext) {
      // Simulate classical RSA decryption: we have the plaintext from original message
      classicalResult = 'decrypted';
      classicalPlaintext = harvested.plaintext;
    } else if (demoState.harvestedMessage && demoState.harvestedMessage.plaintext) {
      classicalResult = 'decrypted';
      classicalPlaintext = demoState.harvestedMessage.plaintext;
    }

    // PQC path always fails because forward secrecy deletes old keys
    pqcResult = 'failed';
    pqcMessage = 'STILL ENCRYPTED — KEY DELETED';

    const resultPayload = {
      classical: classicalResult,
      classicalPlaintext,
      pqc: pqcResult,
      pqcMessage,
    };
    broadcastAllIncludingSender({
      type: 'demo_control',
      action: 'demo2_decrypt_result',
      payload: resultPayload,
      from: 'server',
    });
    log('demo2_decrypt_result', `classical=${classicalResult} pqc=${pqcResult}`);
    return;
  }

  // Generic demo_control – relay to all clients (including sender)
  broadcastAllIncludingSender({ type: 'demo_control', action, payload, from });
  log('demo_control', `action=${action} from=${from}`);
}

function handleJson(socket, raw) {
  let message;
  try {
    message = JSON.parse(raw);
  } catch {
    sendError(socket, 'Invalid JSON frame');
    setTimeout(() => socket.destroy(), 25);
    return;
  }

  // Register (join) a role
  if (message.type === 'join' || message.type === 'register') {
    const role = String(message.role || '').toLowerCase();
    if (!validRoles.has(role)) {
      sendError(socket, 'Invalid role');
      setTimeout(() => socket.destroy(), 25);
      return;
    }
    if (roles.has(role)) {
      sendError(socket, `Role ${role} is already connected`);
      setTimeout(() => socket.destroy(), 25);
      return;
    }
    const meta = sockets.get(socket);
    if (meta) meta.role = role;
    roles.set(role, socket);
    log('join', role);
    broadcastRoster();
    sendFullState(socket);
    return;
  }

  if (message.type === 'ping') {
    send(socket, { type: 'pong', timestamp: Date.now() });
    return;
  }

  if (message.type === 'message') {
    relayFromAlice(socket, message);
    return;
  }

  if (message.type === 'demo_control') {
    handleDemoControl(socket, message);
    return;
  }

  sendError(socket, `Unknown message type: ${message.type}`);
}

// ---------- WebSocket frame parsing (unchanged) ----------
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

    if (!fin || opcode !== 0x1) {
      sendError(socket, 'Only unfragmented text frames are supported');
      setTimeout(() => socket.destroy(), 25);
      return;
    }
    if (!masked) {
      sendError(socket, 'Client frames must be masked');
      setTimeout(() => socket.destroy(), 25);
      return;
    }
    if (length === 126) {
      if (meta.buffer.length < offset + 2) return;
      length = meta.buffer.readUInt16BE(offset);
      offset += 2;
    } else if (length === 127) {
      if (meta.buffer.length < offset + 8) return;
      const bigLength = meta.buffer.readBigUInt64BE(offset);
      if (bigLength > BigInt(Number.MAX_SAFE_INTEGER)) {
        sendError(socket, 'Frame too large');
        setTimeout(() => socket.destroy(), 25);
        return;
      }
      length = Number(bigLength);
      offset += 8;
    }

    if (meta.buffer.length < offset + 4 + length) return;
    const mask = meta.buffer.subarray(offset, offset + 4);
    offset += 4;
    const payload = Buffer.from(meta.buffer.subarray(offset, offset + length));
    for (let index = 0; index < payload.length; index += 1) {
      payload[index] ^= mask[index % 4];
    }
    meta.buffer = meta.buffer.subarray(offset + length);
    handleJson(socket, payload.toString('utf8'));
  }
}

// ---------- HTTP server ----------
const httpServer = createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
  const target = normalize(join(root, relative));
  if (!target.startsWith(root)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  try {
    if (!statSync(target).isFile()) throw new Error('Not a file');
    response.writeHead(200, {
      'content-type': mime[extname(target)] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    createReadStream(target).pipe(response);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
});

// ---------- WebSocket upgrade ----------
httpServer.on('upgrade', (request, socket) => {
  const key = request.headers['sec-websocket-key'];
  if (!key) {
    socket.destroy();
    return;
  }
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
  socket.on('data', (chunk) => parseFrames(socket, chunk));
  socket.on('close', () => cleanup(socket));
  socket.on('end', () => cleanup(socket));
  socket.on('error', (error) => {
    log('socket-error', error.message);
    cleanup(socket);
  });
});

// ---------- Start server ----------
const lanIp = getLanIp();
httpServer.listen(port, '0.0.0.0', () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════════════════════╗');
  console.log('  ║              QuantumResist — Presentation Server         ║');
  console.log('  ╠══════════════════════════════════════════════════════════╣');
  console.log(`  ║  Local:    http://localhost:${port}                       ║`);
  console.log(`  ║  LAN:      http://${lanIp}:${port}                        ║`);
  console.log('  ╠══════════════════════════════════════════════════════════╣');
  console.log(`  ║  Alice:  http://${lanIp}:${port}/?role=alice              ║`);
  console.log(`  ║  Bob:    http://${lanIp}:${port}/?role=bob                ║`);
  console.log(`  ║  Eve:    http://${lanIp}:${port}/?role=eve                ║`);
  console.log('  ╚══════════════════════════════════════════════════════════╝');
  console.log('');
});
