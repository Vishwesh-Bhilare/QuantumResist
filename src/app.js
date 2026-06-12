import { encryptMessage, epochLabel, hexToBytes, nextEpoch, signHmac, toHex, truncateCiphertext, verifyHmac } from './crypto.js';
import { deriveMessageKey, generateSessionSecret, getSharedKeyBytes, receiveSessionSecret } from './session.js';
import { initDemo1, handleDemo1Control } from './demos/demo1.js';
import { initDemo2, handleDemo2Control } from './demos/demo2.js';
import { initDemo3, handleDemo3Control } from './demos/demo3.js';
import { initDemo4, handleDemo4Control } from './demos/demo4.js';
import { initDemo5, handleDemo5Control } from './demos/demo5.js';
import { initEveConsole } from './ui/eve-console.js';

const VALID_ROLES = new Set(['alice', 'bob', 'eve']);
const textDecoder = new TextDecoder();

const state = {
  role: null,
  epoch: 1,
  messageCount: 0,
  peers: [],
  interceptCount: 0,
  sound: true,
  socket: null,
  reconnectAttempts: 0,
  lastSendAt: null,
  attackMode: 'classical',
};

const $ = id => document.getElementById(id) ?? document.querySelector(id);
const $q = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const timeNow = () => new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());

function escapeHtml(value) {
  const node = document.createElement('div');
  node.textContent = value;
  return node.innerHTML;
}

function fingerprintFromBytes(bytes) {
  return toHex(bytes).slice(0, 8).match(/.{1,2}/g).join(':');
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
  if (modal.id === 'keyModal') playKeyDerivationReveal();
}

function closeModal(modal) {
  if (!modal) return;
  modal.hidden = true;
  document.body.style.overflow = '';
}

function updateRoster(roles) {
  state.peers = roles;
  for (const role of ['alice', 'bob', 'eve']) {
    document.getElementById('peer-' + role)?.classList.toggle('online', roles.includes(role));
  }
}

function setLatency(ms) {
  const value = Math.max(1, Math.round(ms));
  const h = document.getElementById('headerLatency');
  const m = document.getElementById('latencyMetric');
  if (h) h.textContent = `${value}ms`;
  if (m) m.innerHTML = `${value} <small>ms</small>`;
}

async function setKeyInspector() {
  const sharedKeyBytes = getSharedKeyBytes();
  if (!sharedKeyBytes) return;
  const current = await deriveMessageKey(sharedKeyBytes, state.epoch);
  const sharedEl = document.getElementById('sharedKey');
  const rootEl = document.getElementById('rootKey');
  const msgEl = document.getElementById('messageKey');
  if (sharedEl) sharedEl.textContent = toHex(sharedKeyBytes).slice(0, 48) + '...';
  if (rootEl) rootEl.textContent = toHex(sharedKeyBytes).slice(0, 32) + ' · runtime-generated';
  if (msgEl) msgEl.textContent = current.keyHex;
}

async function setSessionTelemetry() {
  const sharedKeyBytes = getSharedKeyBytes();
  const keyCountEl = document.getElementById('keyCount');
  const ratchetLabelEl = document.getElementById('ratchetLabel');
  const epochBadgeEl = document.getElementById('epochBadge');
  const modalEpochEl = document.getElementById('modalEpoch');
  const fingerprintEl = document.getElementById('fingerprint');

  if (keyCountEl) keyCountEl.textContent = epochLabel(state.epoch);
  if (ratchetLabelEl) ratchetLabelEl.textContent = `Epoch ${epochLabel(state.epoch)} · ${state.role === 'eve' ? 'Observed' : 'Synchronized'}`;
  if (epochBadgeEl) epochBadgeEl.textContent = `EPOCH ${epochLabel(state.epoch)}`;
  if (modalEpochEl) modalEpochEl.textContent = epochLabel(state.epoch);
  if (sharedKeyBytes && fingerprintEl) fingerprintEl.textContent = fingerprintFromBytes(sharedKeyBytes);
  updateRatchetFlow();
  await setKeyInspector();
}

function updateRatchetFlow() {
  const flowEl = document.getElementById('ratchetFlow');
  if (!flowEl) return;
  const epoch = state.epoch;
  const nodes = [];
  for (let e = Math.max(1, epoch - 3); e <= epoch + 2; e++) {
    if (e < epoch) {
      nodes.push(`<div class="key-node destroyed"><span>MK ${epochLabel(e)}</span><strong>DELETED</strong></div>`);
    } else if (e === epoch) {
      nodes.push(`<div class="key-node current"><span>MK ${epochLabel(e)}</span><strong>ACTIVE</strong></div>`);
    } else {
      nodes.push(`<div class="key-node future"><span>MK ${epochLabel(e)}</span><strong>LOCKED</strong></div>`);
    }
    if (e < epoch + 2) {
      nodes.push(`<i${e >= epoch ? ' class="dashed"' : ''}></i>`);
    }
  }
  flowEl.innerHTML = nodes.join('');
}

function flashStack() {
  $$('.stack-item').forEach((item, index) => setTimeout(() => item.classList.add('flash'), index * 80));
  setTimeout(() => $$('.stack-item').forEach(item => item.classList.remove('flash')), 1000);
}

function addSystemMessage(text) {
  const msgEl = document.getElementById('messages');
  if (!msgEl) return;
  msgEl.innerHTML += `<div class="system-message"><span></span> ${escapeHtml(text)} <time>${timeNow()}</time></div>`;
}

// ── Broadcast helper ──────────────────────────────────────────────────────────
export function broadcastDemoControl(action, payload = {}) {
  if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
    console.warn('broadcastDemoControl: socket not open', action);
    return;
  }
  state.socket.send(JSON.stringify({ type: 'demo_control', action, payload }));
}

// ── Send encrypted message (Alice only) ──────────────────────────────────────
async function sendMessage(text) {
  const sharedKeyBytes = getSharedKeyBytes();
  if (state.role !== 'alice' || !state.socket || state.socket.readyState !== WebSocket.OPEN) {
    showToast('Alice must be connected before sending', '!');
    return;
  }
  if (!sharedKeyBytes) { showToast('Session not yet initialized — wait a moment', '!'); return; }

  const sendButton = $q('.send-button');
  if (sendButton) sendButton.disabled = true;

  const { keyBytes, keyHex } = await deriveMessageKey(sharedKeyBytes, state.epoch);
  const { iv, encrypted } = await encryptMessage(text, keyBytes);
  const hmac = await signHmac(encrypted, keyBytes);
  const ciphertextHex = toHex(encrypted);
  const ivHex = toHex(iv);

  state.socket.send(JSON.stringify({ type: 'message', ciphertext: ciphertextHex, iv: ivHex, epoch: state.epoch, hmac }));
  state.lastSendAt = performance.now();

  // Show pipeline overlay on Alice's screen
  handleDemo4Control({ action: 'pipeline_send', payload: { keyHex, ivHex, hmac, ciphertextHex, plaintext: text, epoch: state.epoch } });

  const row = document.createElement('div');
  row.className = 'message-row sent';
  row.innerHTML = `<div class="bubble"><p>${escapeHtml(text)}</p><div><span class="cipher-preview">${truncateCiphertext(encrypted)}</span><span>ML-DSA ✓ · HMAC ✓</span><time>${timeNow()}</time></div></div>`;
  document.getElementById('messages')?.append(row);
  document.getElementById('messages')?.scrollTo({ top: 999999, behavior: 'smooth' });

  state.messageCount += 1;
  state.epoch = nextEpoch(state.epoch);
  const msgCountEl = document.getElementById('messageCount');
  if (msgCountEl) msgCountEl.textContent = String(state.messageCount);
  await setSessionTelemetry();
  flashStack();
  if (sendButton) sendButton.disabled = false;
  showToast(`Encrypted · MK ${epochLabel(state.epoch - 1)} erased`);
}

// ── Bob receives relayed message ──────────────────────────────────────────────
async function handleBobRelay(message) {
  const sharedKeyBytes = getSharedKeyBytes();
  if (!sharedKeyBytes) {
    showToast('Session key not yet received — message dropped', '!');
    return;
  }
  const row = document.createElement('div');
  row.className = 'message-row received';
  row.innerHTML = `<div class="mini-avatar">A</div><div class="bubble"><p class="cipher-preview">${message.ciphertext.slice(0, 64)}…</p><div><span>DECRYPTING...</span><time>${timeNow()}</time></div></div>`;
  document.getElementById('messages')?.append(row);
  document.getElementById('messages')?.scrollTo({ top: 999999, behavior: 'smooth' });
  await wait(300);

  try {
    const { keyBytes, keyHex } = await deriveMessageKey(sharedKeyBytes, message.epoch);
    const hmacOk = await verifyHmac(hexToBytes(message.ciphertext), keyBytes, message.hmac);
    const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: hexToBytes(message.iv) }, key, hexToBytes(message.ciphertext));
    const plaintext = textDecoder.decode(decrypted);
    row.querySelector('.bubble').innerHTML = `<p>${escapeHtml(plaintext)}</p><div><span>DECRYPTED ✓ · HMAC ${hmacOk ? '✓' : '✗'}</span><time>${timeNow()}</time></div>`;

    handleDemo4Control({ action: 'pipeline_receive', payload: { keyHex, ivHex: message.iv, hmac: message.hmac, ciphertextHex: message.ciphertext, plaintext, epoch: message.epoch } });

    state.messageCount += 1;
    const msgCountEl = document.getElementById('messageCount');
    if (msgCountEl) msgCountEl.textContent = String(state.messageCount);
    state.epoch = Math.max(state.epoch, Number(message.epoch) + 1);
    await setSessionTelemetry();
    flashStack();
  } catch (error) {
    row.querySelector('.bubble').innerHTML = `<p class="danger-line">DECRYPTION FAILED</p><p class="cipher-preview">${message.ciphertext.slice(0, 48)}</p><div><span>ERR</span><time>${timeNow()}</time></div>`;
    console.error('Bob decrypt error:', error);
  }
}

// ── Eve receives relayed message ──────────────────────────────────────────────
function handleEveRelay(message) {
  state.interceptCount += 1;
  // Update eve epoch counter
  state.epoch = Math.max(state.epoch, Number(message.epoch || 1) + 1);
  document.dispatchEvent(new CustomEvent('eve:intercept', { detail: message }));
}

// ── Demo control dispatcher ───────────────────────────────────────────────────
async function handleDemoControl(message) {
  const { action, payload, from } = message;

  // session_init: Bob and Eve receive the shared secret from Alice
  if (action === 'session_init') {
    if (state.role === 'alice') return; // Alice already has it
    receiveSessionSecret(payload.secretHex);
    await setSessionTelemetry();
    showToast('Session key received — synchronized');
    const fpEl = document.getElementById('fingerprint');
    const sharedKeyBytes = getSharedKeyBytes();
    if (sharedKeyBytes && fpEl) fpEl.textContent = fingerprintFromBytes(sharedKeyBytes);
    return;
  }

  // Route to all demo modules — each checks the action internally
  await handleDemo1Control(message, state, broadcastDemoControl);
  await handleDemo2Control(message, state, broadcastDemoControl);
  await handleDemo3Control(message, state, broadcastDemoControl, setSessionTelemetry);
  handleDemo4Control(message);
  handleDemo5Control(message, state);
}

// ── WebSocket ─────────────────────────────────────────────────────────────────
function handleSocketMessage(event) {
  let message;
  try { message = JSON.parse(event.data); }
  catch { console.error('Bad WS frame'); return; }

  const elapsed = state.lastSendAt ? performance.now() - state.lastSendAt : 0;

  if (message.type === 'roster') { updateRoster(message.roles); return; }
  if (message.type === 'error') { showToast(message.message, '!'); return; }
  if (message.type === 'relayed') {
    if (elapsed > 0) setLatency(elapsed);
    state.lastSendAt = null;
    if (state.role === 'bob') handleBobRelay(message);
    if (state.role === 'eve') handleEveRelay(message);
    return;
  }
  if (message.type === 'demo_control') { handleDemoControl(message); return; }
}

function connectWebSocket(onOpen) {
  const connectStartedAt = performance.now();
  const socket = new WebSocket(`ws://${location.host}`);
  state.socket = socket;

  socket.addEventListener('open', () => {
    state.reconnectAttempts = 0;
    setLatency(performance.now() - connectStartedAt);
    socket.send(JSON.stringify({ type: 'join', role: state.role }));
    showToast(`${state.role.toUpperCase()} connected`);
    if (onOpen) onOpen();
  });
  socket.addEventListener('message', handleSocketMessage);
  socket.addEventListener('close', () => scheduleReconnect());
  socket.addEventListener('error', () => scheduleReconnect());
}

function scheduleReconnect() {
  if (state.reconnectAttempts >= 8) return;
  state.reconnectAttempts += 1;
  showToast('Connection lost — reconnecting…', '!');
  setTimeout(() => connectWebSocket(), 2000);
}

// ── Role picker ───────────────────────────────────────────────────────────────
function injectRolePicker() {
  const lanIp = location.hostname !== 'localhost' ? location.hostname : null;
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
      ${lanIp ? `<div class="role-picker-url"><span>LAN URL</span><code>${baseUrl}</code></div>` : ''}
      <div class="role-picker-buttons">
        ${['alice', 'bob', 'eve'].map(role => `
          <button class="role-picker-btn ${role}" type="button" data-role="${role}">
            <span class="role-letter">${role[0].toUpperCase()}</span>
            <span class="role-name">${role.toUpperCase()}</span>
            <span class="role-desc">${role === 'alice' ? 'Sender · Drives messages' : role === 'bob' ? 'Receiver · Sees decryption' : 'Attacker · Controls demos'}</span>
          </button>`).join('')}
      </div>
      <div class="role-picker-urls">
        ${['alice', 'bob', 'eve'].map(role => `
          <div class="role-url-row">
            <span>${role.toUpperCase()}</span>
            <code>${baseUrl}/?role=${role}</code>
          </div>`).join('')}
      </div>
    </div>`;
  document.body.insertBefore(picker, $q('.app-shell'));
  $q('.app-shell').style.display = 'none';
  picker.addEventListener('click', event => {
    const button = event.target.closest('[data-role]');
    if (button) location.search = `?role=${button.dataset.role}`;
  });
}

// ── Role-specific UI config ───────────────────────────────────────────────────
function configureRoleUi() {
  document.body.dataset.role = state.role;
  const brandEl = $q('.brand');
  if (brandEl) brandEl.href = `?role=${state.role}`;
  const statusEl = $q('.topbar-status span:nth-child(2)');
  if (statusEl) statusEl.textContent = `${state.role.toUpperCase()} secure network`;

  if (state.role === 'bob') {
    const composer = $q('.composer');
    if (composer) composer.hidden = true;
  }
  if (state.role === 'eve') {
    renderEveLayout();
  } else {
    // Clear messages for alice/bob
    const msgEl = document.getElementById('messages');
    if (msgEl) msgEl.innerHTML = '';
    addSystemMessage(`${state.role.toUpperCase()} joined the LAN presentation`);
  }
}

function renderEveLayout() {
  const mainEl = $q('main');
  if (!mainEl) return;
  mainEl.dataset.activeView = 'eve';
  mainEl.innerHTML = `<div id="eve-console-mount"></div>`;
  initEveConsole(document.getElementById('eve-console-mount'), state, broadcastDemoControl);
}

// ── Session reset ─────────────────────────────────────────────────────────────
function resetSession() {
  state.epoch = 1;
  state.messageCount = 0;
  const msgCountEl = document.getElementById('messageCount');
  if (msgCountEl) msgCountEl.textContent = '0';
  const handshakeEl = document.getElementById('handshakeTime');
  if (handshakeEl) handshakeEl.textContent = timeNow();
  addSystemMessage(`Session counters reset`);
  setSessionTelemetry();
  showToast('Session counters reset');
}

// ── Signature verification ────────────────────────────────────────────────────
async function runSignatureVerification(valid = true) {
  const log = document.getElementById('signatureLog');
  const verifyBtn = document.getElementById('verifySignature');
  const tamperBtn = document.getElementById('tamperSignature');
  if (!log || !verifyBtn || !tamperBtn) return;
  verifyBtn.disabled = tamperBtn.disabled = true;
  log.innerHTML = '';
  const sharedKeyBytes = getSharedKeyBytes();
  const data = new TextEncoder().encode(document.getElementById('signedMessage')?.value || '');
  const keyMaterial = sharedKeyBytes || new Uint8Array(32);
  const signature = await signHmac(data, keyMaterial);
  const ok = valid && await verifyHmac(data, keyMaterial, signature);
  const steps = [
    [`Signing ${data.byteLength} bytes with HMAC-SHA-256…`, ''],
    [`Signature ${signature.slice(0, 24)}… appended.`, ''],
    [ok ? '✓ Signature valid' : '✗ Signature INVALID — message integrity compromised', ok ? 'success-line' : 'danger-line'],
  ];
  for (const [line, cls] of steps) {
    const item = document.createElement('div');
    item.className = cls;
    item.innerHTML = `<span>sig@demo:~$</span> ${escapeHtml(line)}`;
    log.append(item);
    log.scrollTop = log.scrollHeight;
    await wait(420);
  }
  verifyBtn.disabled = tamperBtn.disabled = false;
}

// ── Key derivation reveal ─────────────────────────────────────────────────────
async function playKeyDerivationReveal() {
  await setKeyInspector();
  const steps = $$('[data-key-step]');
  steps.forEach(step => { step.classList.remove('revealed'); step.style.animation = 'none'; });
  void document.getElementById('keyPath')?.offsetWidth;
  for (const step of steps) {
    step.style.animation = '';
    step.classList.add('revealed');
    await wait(400);
  }
}

// ── Attack modal ──────────────────────────────────────────────────────────────
async function typeTerminalLine(terminal, line, cls = '') {
  const item = document.createElement('div');
  item.className = cls;
  terminal.append(item);
  for (const char of line) {
    item.append(char);
    terminal.scrollTop = terminal.scrollHeight;
    await wait(18);
  }
}

async function runAttackDemo() {
  const terminal = document.getElementById('attackTerminal');
  const launch = document.getElementById('launchAttack');
  if (!terminal || !launch) return;
  launch.disabled = true;
  terminal.innerHTML = '';
  const isClassical = state.attackMode === 'classical';
  const target = isClassical ? 'RSA-2048' : 'ML-KEM-1024';
  const lines = isClassical
    ? [
        [`Inspecting ${target} public modulus…`, ''],
        ['Shor period-finding recovers the private key on a CRQC.', 'danger-line'],
        ['CLASSICAL CHANNEL COMPROMISED', 'danger-line'],
      ]
    : [
        [`Inspecting ${target} lattice public material…`, ''],
        ['No efficient quantum algorithm known for module-lattice constructions.', 'success-line'],
        ['POST-QUANTUM CHANNEL REMAINS SECURE', 'success-line'],
      ];
  for (const [line, cls] of lines) await typeTerminalLine(terminal, line, cls);
  launch.disabled = false;
}

// ── Event bindings ────────────────────────────────────────────────────────────
function bindEvents() {
  // Message form (Alice only — hidden for Bob, not rendered for Eve)
  $q('#messageForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const input = document.getElementById('messageInput');
    const text = input?.value.trim();
    if (!text) return;
    if (input) input.value = '';
    try { await sendMessage(text); }
    catch (error) {
      showToast('Encryption error', '!');
      console.error(error);
      const btn = $q('.send-button');
      if (btn) btn.disabled = false;
    }
  });

  document.getElementById('attackButton')?.addEventListener('click', () => openModal(document.getElementById('attackModal')));
  document.getElementById('attackNav')?.addEventListener('click', () => openModal(document.getElementById('attackModal')));
  document.getElementById('resetNav')?.addEventListener('click', resetSession);
  document.getElementById('inspectButton')?.addEventListener('click', () => openModal(document.getElementById('keyModal')));

  $$('[data-close]').forEach(btn => btn.addEventListener('click', () => closeModal(btn.closest('.modal-backdrop'))));
  $$('.modal-backdrop').forEach(bd => bd.addEventListener('click', e => { if (e.target === bd) closeModal(bd); }));
  window.addEventListener('keydown', e => { if (e.key === 'Escape') $$('.modal-backdrop:not([hidden])').forEach(closeModal); });

  $$('[data-mode]').forEach(btn => btn.addEventListener('click', () => {
    $$('[data-mode]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.attackMode = btn.dataset.mode;
  }));

  document.getElementById('launchAttack')?.addEventListener('click', runAttackDemo);
  document.getElementById('revealKeys')?.addEventListener('click', setKeyInspector);

  document.getElementById('copyFingerprint')?.addEventListener('click', async () => {
    const fp = document.getElementById('fingerprint');
    if (!fp) return;
    await navigator.clipboard.writeText(fp.textContent).catch(() => {});
    showToast('Fingerprint copied');
  });

  document.getElementById('soundToggle')?.addEventListener('click', event => {
    state.sound = !state.sound;
    event.currentTarget.style.opacity = state.sound ? '1' : '.35';
    showToast(state.sound ? 'Sound enabled' : 'Sound muted');
  });

  document.getElementById('verifySignature')?.addEventListener('click', () => {
    const input = document.getElementById('signedMessage');
    runSignatureVerification(!input?.value.includes('[MODIFIED]'));
  });

  document.getElementById('tamperSignature')?.addEventListener('click', () => {
    const input = document.getElementById('signedMessage');
    if (input && !input.value.includes('[MODIFIED]')) input.value += ' [MODIFIED]';
    runSignatureVerification(false);
  });

  document.getElementById('resetSignature')?.addEventListener('click', () => {
    const input = document.getElementById('signedMessage');
    if (input) input.value = `Runtime payload ${new Date().toISOString()}`;
    const ht = document.getElementById('handshakeTime');
    if (ht) ht.textContent = timeNow();
    const log = document.getElementById('signatureLog');
    if (log) log.innerHTML = '<div><span>sig@demo:~$</span> Ready to verify current runtime payload.</div>';
  });

  $$('.nav-item[data-view]').forEach(btn => btn.addEventListener('click', () => {
    $$('.nav-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const mainEl = $q('main');
    if (mainEl) mainEl.dataset.activeView = btn.dataset.view;
    $q('main')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const role = new URLSearchParams(location.search).get('role');
  if (!VALID_ROLES.has(role)) { injectRolePicker(); return; }

  state.role = role;
  configureRoleUi();
  bindEvents();

  // Init demo modules (all roles — they check internally what to show)
  initDemo1(state, broadcastDemoControl);
  initDemo2(state, broadcastDemoControl);
  initDemo3(state, broadcastDemoControl);
  initDemo4(state);
  initDemo5(state, broadcastDemoControl);

  if (role === 'alice') {
    // Alice generates the session secret, then connects and broadcasts it on open
    const { secretHex } = await generateSessionSecret();
    connectWebSocket(() => {
      // Broadcast session_init as soon as socket is open
      state.socket.send(JSON.stringify({
        type: 'demo_control',
        action: 'session_init',
        payload: { secretHex },
      }));
      const fpEl = document.getElementById('fingerprint');
      const kb = getSharedKeyBytes();
      if (kb && fpEl) fpEl.textContent = fingerprintFromBytes(kb);
      setSessionTelemetry();
      const sigInput = document.getElementById('signedMessage');
      if (sigInput) sigInput.value = `Runtime payload ${new Date().toISOString()}`;
      const ht = document.getElementById('handshakeTime');
      if (ht) ht.textContent = timeNow();
    });
  } else if (role === 'bob') {
    connectWebSocket(() => {
      const ht = document.getElementById('handshakeTime');
      if (ht) ht.textContent = timeNow();
      addSystemMessage('BOB waiting for session key from Alice…');
    });
  } else {
    // Eve — no shared key
    connectWebSocket(() => {
      updateRoster([]);
    });
  }
}

main();
