// src/app.js - 3‑laptop synchronized PQC presentation system
import {
  encryptMessage,
  epochLabel,
  hexToBytes,
  nextEpoch,
  signHmac,
  toHex,
  truncateCiphertext,
  verifyHmac,
} from './crypto.js';
import {
  generateSessionSecret,
  receiveSessionSecret,
  initializeRatchet,
  deriveMessageKey,
  advanceRatchet,
  getDeletedEpochs,
  getCurrentRootKey,
  getSharedKeyBytes,
  getCurrentEpoch,
} from './session.js';
import {
  initDemo1,
  handleDemo1Control,
  getRSAKeyPair,
} from './demos/demo1.js';
import {
  initDemo2,
  handleDemo2Control,
} from './demos/demo2.js';
import {
  initDemo3,
  handleDemo3Control,
} from './demos/demo3.js';
import {
  initDemo4,
  handleDemo4Control,
} from './demos/demo4.js';
import {
  initDemo5,
  handleDemo5Control,
} from './demos/demo5.js';
import { initEveConsole } from './ui/eve-console.js';

// ----------------------------------------------------------------------
//  Constants & helpers
// ----------------------------------------------------------------------
const VALID_ROLES = new Set(['alice', 'bob', 'eve']);
const textDecoder = new TextDecoder();

const $ = (id) => document.getElementById(id) ?? document.querySelector(id);
const $q = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const timeNow = () =>
  new Intl.DateTimeFormat('en', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());

function escapeHtml(value) {
  const node = document.createElement('div');
  node.textContent = value;
  return node.innerHTML;
}

function fingerprintFromBytes(bytes) {
  return toHex(bytes)
    .slice(0, 8)
    .match(/.{1,2}/g)
    .join(':');
}

function showToast(message, symbol = '✓') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.querySelector('span').textContent = symbol;
  toast.querySelector('p').textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove('show'), 2300);
}

function openModal(modal) {
  if (!modal) return;
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeModal(modal) {
  if (!modal) return;
  modal.hidden = true;
  document.body.style.overflow = '';
}

// ----------------------------------------------------------------------
//  Global state (only UI and coordination, epoch source is session.js)
// ----------------------------------------------------------------------
const state = {
  role: null,               // 'alice', 'bob' or 'eve'
  messageCount: 0,
  peers: [],
  interceptCount: 0,
  sound: true,
  socket: null,
  reconnectAttempts: 0,
  lastSendAt: null,
  attackMode: 'classical',
};

// Helper to sync UI with session epoch
async function syncEpochFromSession() {
  await setSessionTelemetry();
}

// ----------------------------------------------------------------------
//  UI updates (ratchet flow, telemetry, roster)
// ----------------------------------------------------------------------
function updateRoster(roles) {
  state.peers = roles;
  for (const role of ['alice', 'bob', 'eve']) {
    const el = document.getElementById(`peer-${role}`);
    if (el) {
      if (roles.includes(role)) el.classList.add('online');
      else el.classList.remove('online');
    }
  }
}

function setLatency(ms) {
  const value = Math.max(1, Math.round(ms));
  const h = document.getElementById('headerLatency');
  const m = document.getElementById('latencyMetric');
  if (h) h.textContent = `${value}ms`;
  if (m) m.innerHTML = `${value} <small>ms</small>`;
}

async function setSessionTelemetry() {
  const sharedKeyBytes = getSharedKeyBytes();
  const currentEpoch = getCurrentEpoch();

  state.epoch = currentEpoch;

  const keyCountEl = document.getElementById('keyCount');
  const ratchetLabelEl = document.getElementById('ratchetLabel');
  const epochBadgeEl = document.getElementById('epochBadge');
  const modalEpochEl = document.getElementById('modalEpoch');
  const fingerprintEl = document.getElementById('fingerprint');
  const displayEpoch = currentEpoch + 1; // show 1‑based

  if (keyCountEl) keyCountEl.textContent = epochLabel(displayEpoch);
  if (ratchetLabelEl)
    ratchetLabelEl.textContent = `Epoch ${epochLabel(displayEpoch)} · ${
      state.role === 'eve' ? 'Observed' : 'Synchronized'
    }`;
  if (epochBadgeEl) epochBadgeEl.textContent = `EPOCH ${epochLabel(displayEpoch)}`;
  if (modalEpochEl) modalEpochEl.textContent = epochLabel(displayEpoch);
  if (sharedKeyBytes && fingerprintEl)
    fingerprintEl.textContent = fingerprintFromBytes(sharedKeyBytes);

  await updateRatchetFlow();
  await updateKeyInspector();
}

async function updateRatchetFlow() {
  const flowEl = document.getElementById('ratchetFlow');
  if (!flowEl) return;

  const current = getCurrentEpoch();
  const deleted = getDeletedEpochs();
  const nodes = [];

  for (let e = Math.max(0, current - 3); e <= current + 2; e++) {
    const isDeleted = deleted.includes(e);
    const isCurrent = e === current;
    const epochLabelNum = e + 1;

    if (isDeleted) {
      nodes.push(
        `<div class="key-node destroyed"><span>MK ${epochLabelNum}</span><strong>DELETED</strong></div>`
      );
    } else if (isCurrent) {
      nodes.push(
        `<div class="key-node current"><span>MK ${epochLabelNum}</span><strong>ACTIVE</strong></div>`
      );
    } else {
      nodes.push(
        `<div class="key-node future"><span>MK ${epochLabelNum}</span><strong>LOCKED</strong></div>`
      );
    }
    if (e < current + 2) {
      nodes.push(`<i${e >= current ? ' class="dashed"' : ''}></i>`);
    }
  }
  flowEl.innerHTML = nodes.join('');
}

async function updateKeyInspector() {
  const sharedKeyBytes = getSharedKeyBytes();
  const rootKeyHex = await getCurrentRootKey();
  const sharedEl = document.getElementById('sharedKey');
  const rootEl = document.getElementById('rootKey');
  const msgEl = document.getElementById('messageKey');

  if (sharedEl && sharedKeyBytes)
    sharedEl.textContent = toHex(sharedKeyBytes).slice(0, 48) + '…';
  if (rootEl) rootEl.textContent = rootKeyHex ? rootKeyHex.slice(0, 32) + '…' : 'not initialised';
  if (msgEl) msgEl.textContent = '— ratchet protects each message —';
}

function flashStack() {
  $$('.stack-item').forEach((item, idx) =>
    setTimeout(() => item.classList.add('flash'), idx * 80)
  );
  setTimeout(
    () => $$('.stack-item').forEach((item) => item.classList.remove('flash')),
    1000
  );
}

function addSystemMessage(text) {
  const msgEl = document.getElementById('messages');
  if (!msgEl) return;
  msgEl.innerHTML += `<div class="system-message"><span></span> ${escapeHtml(text)} <time>${timeNow()}</time></div>`;
  msgEl.scrollTop = msgEl.scrollHeight;
}

// ----------------------------------------------------------------------
//  RSA encryption helper for Demo 2
// ----------------------------------------------------------------------
async function encryptWithRSA(plaintext, publicKeyJwk) {
  try {
    const publicKey = await crypto.subtle.importKey(
      'jwk',
      publicKeyJwk,
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      false,
      ['encrypt']
    );
    
    const encoder = new TextEncoder();
    const plaintextBytes = encoder.encode(plaintext);
    const encrypted = await crypto.subtle.encrypt(
      { name: 'RSA-OAEP' },
      publicKey,
      plaintextBytes
    );
    
    return toHex(new Uint8Array(encrypted));
  } catch (error) {
    console.error('RSA encryption failed:', error);
    return null;
  }
}

// ----------------------------------------------------------------------
//  WebSocket communication
// ----------------------------------------------------------------------
export function broadcastDemoControl(action, payload = {}) {
  if (!state.socket || state.socket.readyState !== WebSocket.OPEN) return;
  state.socket.send(JSON.stringify({ type: 'demo_control', action, payload }));
}

function sendRatchetAdvance() {
  const epoch = getCurrentEpoch();
  broadcastDemoControl('ratchet_advance', {
    epoch,
    deletedEpochs: getDeletedEpochs(),
  });
}

async function sendMessage(text) {
  if (state.role !== 'alice') {
    showToast('Only Alice can send messages', '!');
    return;
  }
  if (!getSharedKeyBytes()) {
    showToast('Session not initialised yet', '!');
    return;
  }

  const sendButton = $q('.send-button');
  if (sendButton) sendButton.disabled = true;

  try {
    const currentEpoch = getCurrentEpoch();
    
    const { keyBytes, keyHex } = await deriveMessageKey(currentEpoch);
    const { iv, encrypted } = await encryptMessage(text, keyBytes);
    const hmac = await signHmac(encrypted, keyBytes);
    const ciphertextHex = toHex(encrypted);
    const ivHex = toHex(iv);
    
    let rsaCiphertext = null;
    const rsaKeyPair = getRSAKeyPair();
    if (rsaKeyPair && rsaKeyPair.publicKey) {
      try {
        const publicKeyJwk = await crypto.subtle.exportKey('jwk', rsaKeyPair.publicKey);
        rsaCiphertext = await encryptWithRSA(text, publicKeyJwk);
        if (rsaCiphertext) {
          console.log(`RSA encrypted copy created for epoch ${currentEpoch}`);
        }
      } catch (err) {
        console.warn('Failed to create RSA encrypted copy:', err);
      }
    }

    state.socket.send(
      JSON.stringify({
        type: 'message',
        ciphertext: ciphertextHex,
        iv: ivHex,
        epoch: currentEpoch,
        hmac,
        plaintext: text,
        rsaCiphertext: rsaCiphertext,
      })
    );
    state.lastSendAt = performance.now();

    handleDemo4Control({
      action: 'pipeline_send',
      payload: { keyHex, ivHex, hmac, ciphertextHex, plaintext: text, epoch: currentEpoch },
    });

    const row = document.createElement('div');
    row.className = 'message-row sent';
    row.innerHTML = `<div class="bubble"><p>${escapeHtml(text)}</p><div><span class="cipher-preview">${truncateCiphertext(encrypted)}</span><span>ML-DSA ✓ · HMAC ✓</span><time>${timeNow()}</time></div></div>`;
    const messagesEl = document.getElementById('messages');
    if (messagesEl) {
      messagesEl.appendChild(row);
      messagesEl.scrollTo({ top: 999999, behavior: 'smooth' });
    }

    await advanceRatchet();
    state.messageCount++;
    const msgCountEl = document.getElementById('messageCount');
    if (msgCountEl) msgCountEl.textContent = String(state.messageCount);

    await syncEpochFromSession();
    flashStack();
    sendRatchetAdvance();
    showToast(`Message sent · epoch ${getCurrentEpoch()}`);
  } catch (err) {
    console.error('Send error:', err);
    showToast('Encryption failed', '!');
  } finally {
    if (sendButton) sendButton.disabled = false;
  }
}

async function handleBobRelay(message) {
  const sharedKeyBytes = getSharedKeyBytes();
  if (!sharedKeyBytes) {
    showToast('Session key missing – cannot decrypt', '!');
    return;
  }

  const row = document.createElement('div');
  row.className = 'message-row received';
  row.innerHTML = `<div class="mini-avatar">A</div><div class="bubble"><p class="cipher-preview">${message.ciphertext.slice(0, 64)}…</p><div><span>DECRYPTING...</span><time>${timeNow()}</time></div></div>`;
  const messagesEl = document.getElementById('messages');
  if (messagesEl) {
    messagesEl.appendChild(row);
    messagesEl.scrollTo({ top: 999999, behavior: 'smooth' });
  }
  await wait(300);

  try {
    const msgEpoch = Number(message.epoch);
    const { keyBytes, keyHex } = await deriveMessageKey(msgEpoch);
    const hmacOk = await verifyHmac(hexToBytes(message.ciphertext), keyBytes, message.hmac);
    const aesKey = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: hexToBytes(message.iv) },
      aesKey,
      hexToBytes(message.ciphertext)
    );
    const plaintext = textDecoder.decode(decrypted);

    row.querySelector('.bubble').innerHTML = `<p>${escapeHtml(plaintext)}</p><div><span>DECRYPTED ✓ · HMAC ${hmacOk ? '✓' : '✗'}</span><time>${timeNow()}</time></div>`;

    handleDemo4Control({
      action: 'pipeline_receive',
      payload: {
        keyHex,
        ivHex: message.iv,
        hmac: message.hmac,
        ciphertextHex: message.ciphertext,
        plaintext,
        epoch: msgEpoch,
      },
    });

    state.messageCount++;
    const msgCountEl = document.getElementById('messageCount');
    if (msgCountEl) msgCountEl.textContent = String(state.messageCount);

    await syncEpochFromSession();
    flashStack();
  } catch (error) {
    row.querySelector('.bubble').innerHTML = `<p class="danger-line">DECRYPTION FAILED</p><p class="cipher-preview">${message.ciphertext.slice(0, 48)}</p><div><span>ERR</span><time>${timeNow()}</time></div>`;
    console.error('Bob decrypt error:', error);
  }
}

function handleEveRelay(message) {
  state.interceptCount++;
  document.dispatchEvent(new CustomEvent('eve:intercept', { detail: message }));
}

// ----------------------------------------------------------------------
//  Demo control dispatcher
// ----------------------------------------------------------------------
async function handleDemoControl(message) {
  const { action, payload, from } = message;

  document.dispatchEvent(new CustomEvent('eve:demo_control', { detail: { action, payload, from } }));

  if (action === 'session_init') {
    if (state.role === 'alice') return;
    receiveSessionSecret(payload.secretHex);
    await initializeRatchet();
    await syncEpochFromSession();
    showToast('Session key received – ratchet synchronised');
    const fpEl = document.getElementById('fingerprint');
    const sharedKeyBytes = getSharedKeyBytes();
    if (sharedKeyBytes && fpEl) fpEl.textContent = fingerprintFromBytes(sharedKeyBytes);
    addSystemMessage('DEMO KEY DISTRIBUTION (INSECURE CHANNEL) – for demonstration only');
    return;
  }

  if (action === 'ratchet_advance') {
    const targetEpoch = payload.epoch;
    if (targetEpoch !== undefined && targetEpoch > getCurrentEpoch()) {
      for (let i = getCurrentEpoch(); i < targetEpoch; i++) {
        await advanceRatchet();
      }
      await syncEpochFromSession();
    }
    return;
  }

  await handleDemo1Control(message, state, broadcastDemoControl);
  await handleDemo2Control(message, state, broadcastDemoControl);
  await handleDemo3Control(message, state, broadcastDemoControl, syncEpochFromSession);
  handleDemo4Control(message);
  handleDemo5Control(message, state);
}

// ----------------------------------------------------------------------
//  WebSocket lifecycle
// ----------------------------------------------------------------------
function handleSocketMessage(event) {
  let message;
  try {
    message = JSON.parse(event.data);
  } catch {
    console.error('Invalid JSON frame');
    return;
  }

  const elapsed = state.lastSendAt ? performance.now() - state.lastSendAt : 0;
  if (message.type === 'roster') {
    updateRoster(message.roles);
    return;
  }
  if (message.type === 'error') {
    showToast(message.message, '!');
    return;
  }
  if (message.type === 'relayed') {
    if (elapsed > 0) setLatency(elapsed);
    state.lastSendAt = null;
    if (state.role === 'bob') handleBobRelay(message);
    if (state.role === 'eve') handleEveRelay(message);
    return;
  }
  if (message.type === 'demo_control') {
    handleDemoControl(message);
    return;
  }
}

function connectWebSocket(onOpen) {
  const connectStarted = performance.now();
  const socket = new WebSocket(`ws://${location.host}`);
  state.socket = socket;

  socket.addEventListener('open', () => {
    state.reconnectAttempts = 0;
    setLatency(performance.now() - connectStarted);
    socket.send(JSON.stringify({ type: 'register', role: state.role }));
    showToast(`${state.role.toUpperCase()} connected`);
    if (onOpen) onOpen();
  });
  socket.addEventListener('message', handleSocketMessage);
  socket.addEventListener('close', () => scheduleReconnect());
  socket.addEventListener('error', () => scheduleReconnect());
}

function scheduleReconnect() {
  if (state.reconnectAttempts >= 8) return;
  state.reconnectAttempts++;
  showToast('Connection lost – reconnecting…', '!');
  setTimeout(() => connectWebSocket(), 2000);
}

// ----------------------------------------------------------------------
//  Role Layout Renderers
// ----------------------------------------------------------------------

function renderAliceLayout() {
  const container = document.getElementById('role-container');
  if (!container) return;
  
  container.innerHTML = `
    <div class="app-shell alice-shell">
      <header class="topbar">
        <div class="brand"><span class="brand-mark" aria-hidden="true"><span></span></span><span>QUANTUM<span>RESIST</span></span></div>
        <div class="topbar-status"><span class="network-dot"></span><span>ALICE · Sender</span><span class="divider"></span><span id="headerLatency">pending</span></div>
        <div class="peer-roster" id="peerRoster">
          <div class="peer-roster-dot" id="peer-alice"><i></i><span>ALICE</span></div>
          <div class="peer-roster-dot" id="peer-bob"><i></i><span>BOB</span></div>
          <div class="peer-roster-dot" id="peer-eve"><i></i><span>EVE</span></div>
        </div>
        <div class="topbar-actions">
          <button class="icon-button" id="soundToggle" aria-label="Toggle sound"><svg viewBox="0 0 24 24"><path d="M11 5 6 9H2v6h4l5 4V5Zm4.5 3.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12"/></svg></button>
          <div class="live-pill"><span></span> LIVE DEMO</div>
        </div>
      </header>
      <main class="alice-main">
        <div class="alice-messages-area">
          <div class="messages" id="messages" aria-live="polite"></div>
          <form class="composer" id="messageForm">
            <button type="button" class="attach" aria-label="Attach file"><svg viewBox="0 0 24 24"><path d="m21.4 11.6-8.8 8.8a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2A2 2 0 0 1 7 14.8l8.5-8.5"/></svg></button>
            <input id="messageInput" maxlength="180" autocomplete="off" placeholder="Type a secure message..." aria-label="Secure message" />
            <div class="composer-security"><svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg> AES-256-GCM</div>
            <button class="send-button" type="submit" aria-label="Send encrypted message"><svg viewBox="0 0 24 24"><path d="m22 2-7 20-4-9-9-4 20-7Z"/><path d="M22 2 11 13"/></svg></button>
          </form>
        </div>
        <div class="alice-status-bar">
          <div class="status-item"><span>🔐 ML-KEM-1024</span><strong>ACTIVE</strong></div>
          <div class="status-item"><span>🔒 AES-256-GCM</span><strong>READY</strong></div>
          <div class="status-item"><span>🔁 Forward Secrecy</span><strong id="epochBadge">EPOCH 001</strong></div>
          <div class="status-item"><span>🔑 Session ID</span><code id="fingerprint">DERIVING</code><button id="copyFingerprint" class="copy-btn">📋</button></div>
        </div>
      </main>
    </div>
  `;
  
  // Create hidden elements needed for demos
  ensureDemoElements();
}

function renderBobLayout() {
  const container = document.getElementById('role-container');
  if (!container) return;
  
  container.innerHTML = `
    <div class="app-shell bob-shell">
      <header class="topbar">
        <div class="brand"><span class="brand-mark" aria-hidden="true"><span></span></span><span>QUANTUM<span>RESIST</span></span></div>
        <div class="topbar-status"><span class="network-dot"></span><span>BOB · Receiver</span><span class="divider"></span><span id="headerLatency">pending</span></div>
        <div class="peer-roster" id="peerRoster">
          <div class="peer-roster-dot" id="peer-alice"><i></i><span>ALICE</span></div>
          <div class="peer-roster-dot" id="peer-bob"><i></i><span>BOB</span></div>
          <div class="peer-roster-dot" id="peer-eve"><i></i><span>EVE</span></div>
        </div>
        <div class="topbar-actions">
          <div class="live-pill"><span></span> LIVE DEMO</div>
        </div>
      </header>
      <main class="bob-main">
        <div class="bob-messages-area">
          <div class="messages" id="messages" aria-live="polite"></div>
        </div>
        <div class="bob-status-bar">
          <div class="status-item"><span>Current Epoch</span><strong id="epochBadge">EPOCH 001</strong></div>
          <div class="status-item"><span>Messages</span><strong id="messageCount">0</strong></div>
          <div class="status-item"><span>Ratchet</span><strong id="ratchetLabel">Synchronized</strong></div>
        </div>
        <div class="ratchet-flow" id="ratchetFlow"></div>
      </main>
    </div>
  `;
  
  ensureDemoElements();
}

function renderEveLayout() {
  const container = document.getElementById('role-container');
  if (!container) return;
  
  container.innerHTML = `
    <div class="app-shell eve-shell">
      <header class="topbar">
        <div class="brand"><span class="brand-mark" aria-hidden="true"><span></span></span><span>QUANTUM<span>RESIST</span></span></div>
        <div class="topbar-status"><span class="network-dot"></span><span>EVE · Attacker</span><span class="divider"></span><span id="headerLatency">pending</span></div>
        <div class="peer-roster" id="peerRoster">
          <div class="peer-roster-dot" id="peer-alice"><i></i><span>ALICE</span></div>
          <div class="peer-roster-dot" id="peer-bob"><i></i><span>BOB</span></div>
          <div class="peer-roster-dot" id="peer-eve"><i></i><span>EVE</span></div>
        </div>
        <div class="topbar-actions">
          <div class="live-pill"><span></span> ATTACK CONSOLE</div>
        </div>
      </header>
      <main class="eve-main">
        <div id="eve-console-mount"></div>
      </main>
    </div>
  `;
  
  ensureDemoElements();
}

function ensureDemoElements() {
  // Create elements needed by demos that might not exist in role layouts
  if (!document.getElementById('keyCount')) {
    const hiddenEl = document.createElement('div');
    hiddenEl.id = 'keyCount';
    hiddenEl.style.display = 'none';
    document.body.appendChild(hiddenEl);
  }
  if (!document.getElementById('modalEpoch')) {
    const hiddenEl = document.createElement('div');
    hiddenEl.id = 'modalEpoch';
    hiddenEl.style.display = 'none';
    document.body.appendChild(hiddenEl);
  }
  if (!document.getElementById('sharedKey')) {
    const hiddenEl = document.createElement('div');
    hiddenEl.id = 'sharedKey';
    hiddenEl.style.display = 'none';
    document.body.appendChild(hiddenEl);
  }
  if (!document.getElementById('rootKey')) {
    const hiddenEl = document.createElement('div');
    hiddenEl.id = 'rootKey';
    hiddenEl.style.display = 'none';
    document.body.appendChild(hiddenEl);
  }
  if (!document.getElementById('messageKey')) {
    const hiddenEl = document.createElement('div');
    hiddenEl.id = 'messageKey';
    hiddenEl.style.display = 'none';
    document.body.appendChild(hiddenEl);
  }
  if (!document.getElementById('latencyMetric')) {
    const hiddenEl = document.createElement('div');
    hiddenEl.id = 'latencyMetric';
    hiddenEl.style.display = 'none';
    document.body.appendChild(hiddenEl);
  }
  if (!document.getElementById('handshakeTime')) {
    const hiddenEl = document.createElement('div');
    hiddenEl.id = 'handshakeTime';
    hiddenEl.style.display = 'none';
    document.body.appendChild(hiddenEl);
  }
  if (!document.getElementById('signedMessage')) {
    const hiddenEl = document.createElement('input');
    hiddenEl.id = 'signedMessage';
    hiddenEl.type = 'hidden';
    document.body.appendChild(hiddenEl);
  }
  if (!document.getElementById('signatureLog')) {
    const hiddenEl = document.createElement('div');
    hiddenEl.id = 'signatureLog';
    hiddenEl.style.display = 'none';
    document.body.appendChild(hiddenEl);
  }
  if (!document.getElementById('verifySignature')) {
    const hiddenEl = document.createElement('button');
    hiddenEl.id = 'verifySignature';
    hiddenEl.style.display = 'none';
    document.body.appendChild(hiddenEl);
  }
  if (!document.getElementById('tamperSignature')) {
    const hiddenEl = document.createElement('button');
    hiddenEl.id = 'tamperSignature';
    hiddenEl.style.display = 'none';
    document.body.appendChild(hiddenEl);
  }
  if (!document.getElementById('resetSignature')) {
    const hiddenEl = document.createElement('button');
    hiddenEl.id = 'resetSignature';
    hiddenEl.style.display = 'none';
    document.body.appendChild(hiddenEl);
  }
}

// ----------------------------------------------------------------------
//  Event binding (with safety checks)
// ----------------------------------------------------------------------
function bindEvents() {
  const messageForm = document.getElementById('messageForm');
  if (messageForm) {
    messageForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = document.getElementById('messageInput');
      const text = input?.value.trim();
      if (!text) return;
      if (input) input.value = '';
      await sendMessage(text);
    });
  }

  const attackButton = document.getElementById('attackButton');
  if (attackButton) {
    attackButton.addEventListener('click', () => openModal(document.getElementById('attackModal')));
  }

  const resetNav = document.getElementById('resetNav');
  if (resetNav) {
    resetNav.addEventListener('click', () => location.reload());
  }

  const inspectButton = document.getElementById('inspectButton');
  if (inspectButton) {
    inspectButton.addEventListener('click', () => openModal(document.getElementById('keyModal')));
  }

  $$('[data-close]').forEach((btn) =>
    btn.addEventListener('click', () => closeModal(btn.closest('.modal-backdrop')))
  );
  
  $$('.modal-backdrop').forEach((bd) =>
    bd.addEventListener('click', (e) => {
      if (e.target === bd) closeModal(bd);
    })
  );
  
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') $$('.modal-backdrop:not([hidden])').forEach(closeModal);
  });

  const launchAttack = document.getElementById('launchAttack');
  if (launchAttack) {
    launchAttack.addEventListener('click', () => {
      broadcastDemoControl('launch_attack', { mode: state.attackMode });
    });
  }

  const revealKeys = document.getElementById('revealKeys');
  if (revealKeys) {
    revealKeys.addEventListener('click', updateKeyInspector);
  }

  const copyFingerprint = document.getElementById('copyFingerprint');
  if (copyFingerprint) {
    copyFingerprint.addEventListener('click', async () => {
      const fp = document.getElementById('fingerprint');
      if (!fp) return;
      await navigator.clipboard.writeText(fp.textContent);
      showToast('Fingerprint copied');
    });
  }

  const soundToggle = document.getElementById('soundToggle');
  if (soundToggle) {
    soundToggle.addEventListener('click', (e) => {
      state.sound = !state.sound;
      e.currentTarget.style.opacity = state.sound ? '1' : '0.35';
      showToast(state.sound ? 'Sound enabled' : 'Sound muted');
    });
  }

  // Attack mode toggle buttons (in modal)
  $$('[data-mode]').forEach((btn) =>
    btn.addEventListener('click', () => {
      $$('[data-mode]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.attackMode = btn.dataset.mode;
    })
  );
}

// ----------------------------------------------------------------------
//  Role picker & UI setup
// ----------------------------------------------------------------------
function injectRolePicker() {
  const baseUrl = `${location.protocol}//${location.host}`;
  const picker = document.createElement('div');
  picker.className = 'role-picker';
  picker.innerHTML = `
    <div class="role-picker-inner">
      <div class="role-picker-header">
        <div class="brand-mark" aria-hidden="true"><span></span></div>
        <h1>QUANTUM<span>RESIST</span></h1>
        <p>Select your role for this presentation session</p>
      </div>
      <div class="role-picker-buttons">
        ${['alice', 'bob', 'eve']
          .map(
            (role) => `
          <button class="role-picker-btn ${role}" data-role="${role}">
            <span class="role-letter">${role[0].toUpperCase()}</span>
            <span class="role-name">${role.toUpperCase()}</span>
            <span class="role-desc">${
              role === 'alice'
                ? 'Sender · Drives messages'
                : role === 'bob'
                ? 'Receiver · Sees decryption'
                : 'Attacker · Controls demos'
            }</span>
          </button>`
          )
          .join('')}
      </div>
      <div class="role-picker-urls">
        ${['alice', 'bob', 'eve']
          .map(
            (role) => `
          <div class="role-url-row">
            <span>${role.toUpperCase()}</span>
            <code>${baseUrl}/?role=${role}</code>
          </div>`
          )
          .join('')}
      </div>
    </div>`;
  document.body.appendChild(picker);
  picker.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-role]');
    if (btn) location.search = `?role=${btn.dataset.role}`;
  });
}

// ----------------------------------------------------------------------
//  Application entry point
// ----------------------------------------------------------------------
async function main() {
  const role = new URLSearchParams(location.search).get('role');
  if (!VALID_ROLES.has(role)) {
    injectRolePicker();
    return;
  }

  state.role = role;
  
  // Render role-specific layout FIRST
  if (role === 'alice') renderAliceLayout();
  else if (role === 'bob') renderBobLayout();
  else if (role === 'eve') renderEveLayout();
  
  // Now bind events and initialize demos
  bindEvents();

  // Initialise demo modules
  initDemo1(state, broadcastDemoControl);
  initDemo2(state, broadcastDemoControl);
  initDemo3(state, broadcastDemoControl);
  initDemo4(state);
  initDemo5(state, broadcastDemoControl);

  if (role === 'alice') {
    const { secretHex } = await generateSessionSecret();
    await initializeRatchet();
    connectWebSocket(() => {
      broadcastDemoControl('session_init', { secretHex });
      const fpEl = document.getElementById('fingerprint');
      const kb = getSharedKeyBytes();
      if (kb && fpEl) fpEl.textContent = fingerprintFromBytes(kb);
      syncEpochFromSession();
      const sigInput = document.getElementById('signedMessage');
      if (sigInput) sigInput.value = `Runtime payload ${new Date().toISOString()}`;
      const ht = document.getElementById('handshakeTime');
      if (ht) ht.textContent = timeNow();
      addSystemMessage('DEMO KEY DISTRIBUTION (INSECURE CHANNEL) – for demonstration only');
    });
  } else if (role === 'bob') {
    connectWebSocket(() => {
      addSystemMessage('Bob waiting for session key from Alice…');
      const ht = document.getElementById('handshakeTime');
      if (ht) ht.textContent = timeNow();
    });
  } else if (role === 'eve') {
    connectWebSocket(() => {
      // Eve console will be initialized by its own module
      const mountEl = document.getElementById('eve-console-mount');
      if (mountEl) {
        initEveConsole(mountEl, state, broadcastDemoControl);
      }
    });
  }
}

main();
