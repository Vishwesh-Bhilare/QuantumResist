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

const $ = selector => document.querySelector(selector);
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
  const toast = $('#toast');
  if (!toast) return;
  toast.querySelector('span').textContent = symbol;
  toast.querySelector('p').textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => toast.classList.remove('show'), 2300);
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
    $('#peer-' + role)?.classList.toggle('online', roles.includes(role));
  }
}

function setLatency(ms) {
  const value = Math.max(1, Math.round(ms));
  const headerEl = $('#headerLatency');
  const metricEl = $('#latencyMetric');
  if (headerEl) headerEl.textContent = `${value}ms`;
  if (metricEl) metricEl.innerHTML = `${value} <small>ms</small>`;
}

async function setKeyInspector() {
  const sharedKeyBytes = getSharedKeyBytes();
  if (!sharedKeyBytes) return;
  const current = await deriveMessageKey(sharedKeyBytes, state.epoch);
  const sharedEl = $('#sharedKey');
  const rootEl = $('#rootKey');
  const msgEl = $('#messageKey');
  if (sharedEl) sharedEl.textContent = toHex(sharedKeyBytes).slice(0, 48) + '...';
  if (rootEl) rootEl.textContent = toHex(sharedKeyBytes).slice(0, 32) + ' · runtime-generated';
  if (msgEl) msgEl.textContent = current.keyHex;
}

async function setSessionTelemetry() {
  const sharedKeyBytes = getSharedKeyBytes();
  const keyCountEl = $('#keyCount');
  const ratchetLabelEl = $('#ratchetLabel');
  const epochBadgeEl = $('#epochBadge');
  const modalEpochEl = $('#modalEpoch');
  const fingerprintEl = $('#fingerprint');

  if (keyCountEl) keyCountEl.textContent = epochLabel(state.epoch);
  if (ratchetLabelEl) ratchetLabelEl.textContent = `Epoch ${epochLabel(state.epoch)} · ${state.role === 'eve' ? 'Observed' : 'Synchronized'}`;
  if (epochBadgeEl) epochBadgeEl.textContent = `EPOCH ${epochLabel(state.epoch)}`;
  if (modalEpochEl) modalEpochEl.textContent = epochLabel(state.epoch);
  if (sharedKeyBytes && fingerprintEl) fingerprintEl.textContent = fingerprintFromBytes(sharedKeyBytes);
  updateRatchetFlow();
  await setKeyInspector();
}

function updateRatchetFlow() {
  const flowEl = $('#ratchetFlow');
  if (!flowEl) return;
  const epoch = state.epoch;
  // Show 6 nodes: current-3 through current+2
  const nodes = [];
  for (let e = Math.max(1, epoch - 3); e <= epoch + 2; e++) {
    if (e < epoch - 1) {
      nodes.push(`<div class="key-node destroyed"><span>MK ${epochLabel(e)}</span><strong>DELETED</strong></div>`);
    } else if (e === epoch - 1 && epoch > 1) {
      nodes.push(`<div class="key-node destroyed"><span>MK ${epochLabel(e)}</span><strong>DELETED</strong></div>`);
    } else if (e === epoch) {
      nodes.push(`<div class="key-node current"><span>MK ${epochLabel(e)}</span><strong>ACTIVE</strong></div>`);
    } else {
      nodes.push(`<div class="key-node future"><span>MK ${epochLabel(e)}</span><strong>LOCKED</strong></div>`);
    }
    if (e < epoch + 2) {
      const isDashed = e >= epoch;
      nodes.push(`<i${isDashed ? ' class="dashed"' : ''}></i>`);
    }
  }
  flowEl.innerHTML = nodes.join('');
}

function flashStack() {
  $$('.stack-item').forEach((item, index) => setTimeout(() => item.classList.add('flash'), index * 80));
  setTimeout(() => $$('.stack-item').forEach(item => item.classList.remove('flash')), 1000);
}

function addSystemMessage(text) {
  const msgEl = $('#messages');
  if (!msgEl) return;
  msgEl.innerHTML += `<div class="system-message"><span></span> ${escapeHtml(text)} <time>${timeNow()}</time></div>`;
}

// ── Broadcast helper (wraps demo_control sends) ───────────────────────────────
export function broadcastDemoControl(action, payload = {}) {
  if (!state.socket || state.socket.readyState !== WebSocket.OPEN) return;
  state.socket.send(JSON.stringify({ type: 'demo_control', action, payload }));
}

// ── Send encrypted message (Alice only) ──────────────────────────────────────
async function sendMessage(text) {
  const sharedKeyBytes = getSharedKeyBytes();
  if (state.role !== 'alice' || !state.socket || state.socket.readyState !== WebSocket.OPEN) {
    showToast('Alice must be connected before sending', '!');
    return;
  }
  if (!sharedKeyBytes) { showToast('Session not yet initialized', '!'); return; }

  const sendButton = $('.send-button');
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
  $('#messages')?.append(row);
  $('#messages')?.scrollTo({ top: $('#messages').scrollHeight, behavior: 'smooth' });

  state.messageCount += 1;
  state.epoch = nextEpoch(state.epoch);
  const msgCountEl = $('#messageCount');
  if (msgCountEl) msgCountEl.textContent = String(state.messageCount);
  await setSessionTelemetry();
  flashStack();
  if (sendButton) sendButton.disabled = false;
  showToast(`Message encrypted · MK ${epochLabel(state.epoch - 1)} erased`);
}

// ── Bob receives relayed message ──────────────────────────────────────────────
async function handleBobRelay(message) {
  const sharedKeyBytes = getSharedKeyBytes();
  const row = document.createElement('div');
  row.className = 'message-row received';
  row.innerHTML = `<div class="mini-avatar">A</div><div class="bubble"><p class="cipher-preview">${message.ciphertext.slice(0, 64)}…</p><div><span>DECRYPTING...</span><time>${timeNow()}</time></div></div>`;
  $('#messages')?.append(row);
  $('#messages')?.scrollTo({ top: $('#messages').scrollHeight, behavior: 'smooth' });
  await wait(300);

  const { keyBytes, keyHex } = await deriveMessageKey(sharedKeyBytes, message.epoch);
  const hmacOk = await verifyHmac(hexToBytes(message.ciphertext), keyBytes, message.hmac);

  try {
    const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: hexToBytes(message.iv) }, key, hexToBytes(message.ciphertext));
    const plaintext = textDecoder.decode(decrypted);
    row.querySelector('.bubble').innerHTML = `<p>${escapeHtml(plaintext)}</p><div><span>DECRYPTED ✓ · HMAC ${hmacOk ? '✓' : '✗'}</span><time>${timeNow()}</time></div>`;

    // Show reverse pipeline on Bob's screen
    handleDemo4Control({ action: 'pipeline_receive', payload: { keyHex, ivHex: message.iv, hmac: message.hmac, ciphertextHex: message.ciphertext, plaintext, epoch: message.epoch } });

    state.messageCount += 1;
    const msgCountEl = $('#messageCount');
    if (msgCountEl) msgCountEl.textContent = String(state.messageCount);
  } catch (error) {
    row.querySelector('.bubble').innerHTML = `<p class="danger-line">DECRYPTION FAILED</p><p class="cipher-preview">${message.ciphertext}</p><div><span>HMAC ${hmacOk ? '✓' : '✗'}</span><time>${timeNow()}</time></div>`;
    console.error(error);
  }

  state.epoch = Math.max(state.epoch, Number(message.epoch) + 1);
  await setSessionTelemetry();
  flashStack();
}

// ── Eve receives relayed message ──────────────────────────────────────────────
async function handleEveRelay(message) {
  state.interceptCount += 1;
  const countEl = $('#interceptCount');
  if (countEl) countEl.textContent = String(state.interceptCount);
  // Delegate to eve console module
  const eveConsoleEvent = new CustomEvent('eve:intercept', { detail: message });
  document.dispatchEvent(eveConsoleEvent);
}

// ── Demo control dispatcher ───────────────────────────────────────────────────
async function handleDemoControl(message) {
  const { action, payload, from } = message;

  if (action === 'session_init') {
    receiveSessionSecret(payload.secretHex);
    await setSessionTelemetry();
    showToast(`Session key received from ${from}`);
    // Update fingerprint display
    const sharedKeyBytes = getSharedKeyBytes();
    const fpEl = $('#fingerprint');
    if (sharedKeyBytes && fpEl) fpEl.textContent = fingerprintFromBytes(sharedKeyBytes);
    return;
  }

  // Route to demo modules
  handleDemo1Control(message, state, broadcastDemoControl);
  handleDemo2Control(message, state, broadcastDemoControl);
  handleDemo3Control(message, state, broadcastDemoControl, setSessionTelemetry);
  handleDemo4Control(message);
  handleDemo5Control(message, state);
}

// ── WebSocket ─────────────────────────────────────────────────────────────────
function handleSocketMessage(event) {
  const elapsed = state.lastSendAt ? performance.now() - state.lastSendAt : 0;
  const message = JSON.parse(event.data);
  if (message.type === 'roster') updateRoster(message.roles);
  if (message.type === 'error') showToast(message.message, '!');
  if (message.type === 'relayed') {
    if (elapsed) setLatency(elapsed);
    if (state.role === 'bob') handleBobRelay(message);
    if (state.role === 'eve') handleEveRelay(message);
  }
  if (message.type === 'demo_control') handleDemoControl(message);
}

function connectWebSocket() {
  const connectStartedAt = performance.now();
  const socket = new WebSocket(`ws://${location.host}`);
  state.socket = socket;
  socket.addEventListener('open', () => {
    state.reconnectAttempts = 0;
    setLatency(performance.now() - connectStartedAt);
    socket.send(JSON.stringify({ type: 'join', role: state.role }));
    showToast(`${state.role.toUpperCase()} connected`);
  });
  socket.addEventListener('message', handleSocketMessage);
  socket.addEventListener('close', () => scheduleReconnect());
  socket.addEventListener('error', () => scheduleReconnect());
}

function scheduleReconnect() {
  if (state.reconnectAttempts >= 8) return;
  state.reconnectAttempts += 1;
  showToast('Connection lost — reconnecting', '!');
  setTimeout(connectWebSocket, 2000);
}

// ── Role picker (shown when no ?role= param) ──────────────────────────────────
function injectRolePicker() {
  // Detect LAN IP from current hostname
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
  document.body.insertBefore(picker, $('.app-shell'));
  $('.app-shell').style.display = 'none';
  picker.addEventListener('click', event => {
    const button = event.target.closest('[data-role]');
    if (button) location.search = `?role=${button.dataset.role}`;
  });
}

// ── Role-specific UI config ───────────────────────────────────────────────────
function configureRoleUi() {
  document.body.dataset.role = state.role;
  const brandEl = $('.brand');
  if (brandEl) brandEl.href = `?role=${state.role}`;
  const statusEl = $('.topbar-status span:nth-child(2)');
  if (statusEl) statusEl.textContent = `${state.role.toUpperCase()} secure network`;
  const msgEl = $('#messages');
  if (msgEl) msgEl.innerHTML = '';
  addSystemMessage(`${state.role.toUpperCase()} joined the LAN presentation`);

  if (state.role === 'bob') {
    const composer = $('.composer');
    if (composer) composer.hidden = true;
  }
  if (state.role === 'alice') {
    const composer = $('.composer');
    if (composer) composer.hidden = false;
  }
  if (state.role === 'eve') renderEveLayout();
}

function renderEveLayout() {
  const mainEl = $('main');
  if (!mainEl) return;
  mainEl.dataset.activeView = 'eve';
  mainEl.innerHTML = `<div id="eve-console-mount"></div>`;
  // Eve console is fully managed by eve-console.js
  initEveConsole(document.getElementById('eve-console-mount'), state, broadcastDemoControl);
}

// ── Session reset ─────────────────────────────────────────────────────────────
function resetSession() {
  state.epoch = 1;
  state.messageCount = 0;
  const msgCountEl = $('#messageCount');
  if (msgCountEl) msgCountEl.textContent = '0';
  const handshakeEl = $('#handshakeTime');
  if (handshakeEl) handshakeEl.textContent = timeNow();
  addSystemMessage(`${state.role.toUpperCase()} session counters reset`);
  setSessionTelemetry();
  showToast('Runtime session counters reset');
}

// ── Signature verification ────────────────────────────────────────────────────
async function runSignatureVerification(valid = true) {
  const log = $('#signatureLog');
  const verifyButton = $('#verifySignature');
  const tamperButton = $('#tamperSignature');
  const sharedKeyBytes = getSharedKeyBytes();
  if (!log || !verifyButton || !tamperButton) return;
  verifyButton.disabled = tamperButton.disabled = true;
  log.innerHTML = '';
  const data = new TextEncoder().encode($('#signedMessage').value);
  const keyMaterial = sharedKeyBytes || new Uint8Array(32);
  const signature = await signHmac(data, keyMaterial);
  const ok = valid && await verifyHmac(data, keyMaterial, signature);
  const steps = [
    [`Signing ${data.byteLength} bytes with HMAC-SHA-256...`, ''],
    [`Signature ${signature.slice(0, 24)}... appended.`, ''],
    [ok ? '✓ Signature valid' : '✗ Signature invalid — message integrity compromised', ok ? 'success-line' : 'danger-line'],
  ];
  for (const [line, className] of steps) {
    const item = document.createElement('div');
    item.className = className;
    item.innerHTML = `<span>sig@demo:~$</span> ${escapeHtml(line)}`;
    log.append(item);
    log.scrollTop = log.scrollHeight;
    await wait(420);
  }
  verifyButton.disabled = tamperButton.disabled = false;
}

// ── Key derivation reveal (modal) ─────────────────────────────────────────────
async function playKeyDerivationReveal() {
  await setKeyInspector();
  const steps = $$('[data-key-step]');
  steps.forEach(step => { step.classList.remove('revealed'); step.style.animation = 'none'; });
  void $('#keyPath')?.offsetWidth;
  for (const step of steps) {
    step.style.animation = '';
    step.classList.add('revealed');
    await wait(400);
  }
}

// ── Attack modal ──────────────────────────────────────────────────────────────
async function typeTerminalLine(terminal, line, className = '') {
  const item = document.createElement('div');
  item.className = className;
  terminal.append(item);
  for (const char of line) {
    item.append(char);
    terminal.scrollTop = terminal.scrollHeight;
    await wait(18);
  }
}

async function runAttackDemo() {
  const terminal = $('#attackTerminal');
  const launch = $('#launchAttack');
  if (!terminal || !launch) return;
  launch.disabled = true;
  terminal.innerHTML = '';
  const target = state.attackMode === 'classical' ? 'RSA-2048' : 'ML-KEM-1024';
  const lines = state.attackMode === 'classical'
    ? [
        [`Inspecting ${target} public modulus...`, ''],
        ['Shor period-finding would recover the private key on a cryptographically relevant quantum computer.', 'danger-line'],
        ['CLASSICAL CHANNEL COMPROMISED', 'danger-line'],
      ]
    : [
        [`Inspecting ${target} lattice public material...`, ''],
        ['No efficient quantum attack is currently known for this module-lattice construction.', 'success-line'],
        ['POST-QUANTUM CHANNEL REMAINS SECURE', 'success-line'],
      ];
  for (const [line, className] of lines) await typeTerminalLine(terminal, line, className);
  launch.disabled = false;
}

// ── Event bindings ────────────────────────────────────────────────────────────
function bindEvents() {
  $('#messageForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const input = $('#messageInput');
    const text = input?.value.trim();
    if (!text) return;
    if (input) input.value = '';
    try { await sendMessage(text); }
    catch (error) {
      showToast('Encryption error — check console', '!');
      console.error(error);
      const sendBtn = $('.send-button');
      if (sendBtn) sendBtn.disabled = false;
    }
  });

  $('#attackButton')?.addEventListener('click', () => openModal($('#attackModal')));
  $('#attackNav')?.addEventListener('click', () => openModal($('#attackModal')));
  $('#resetNav')?.addEventListener('click', resetSession);
  $('#inspectButton')?.addEventListener('click', () => openModal($('#keyModal')));

  $$('[data-close]').forEach(button => button.addEventListener('click', () => closeModal(button.closest('.modal-backdrop'))));
  $$('.modal-backdrop').forEach(backdrop => backdrop.addEventListener('click', event => { if (event.target === backdrop) closeModal(backdrop); }));
  window.addEventListener('keydown', event => { if (event.key === 'Escape') $$('.modal-backdrop:not([hidden])').forEach(closeModal); });

  $$('[data-mode]').forEach(button => button.addEventListener('click', () => {
    $$('[data-mode]').forEach(item => item.classList.remove('active'));
    button.classList.add('active');
    state.attackMode = button.dataset.mode;
  }));

  $('#launchAttack')?.addEventListener('click', runAttackDemo);
  $('#revealKeys')?.addEventListener('click', setKeyInspector);

  $('#copyFingerprint')?.addEventListener('click', async () => {
    const fpEl = $('#fingerprint');
    if (!fpEl) return;
    await navigator.clipboard.writeText(fpEl.textContent);
    showToast('Fingerprint copied');
  });

  $('#soundToggle')?.addEventListener('click', event => {
    state.sound = !state.sound;
    event.currentTarget.style.opacity = state.sound ? '1' : '.35';
    showToast(state.sound ? 'Sound enabled' : 'Sound muted');
  });

  $('#verifySignature')?.addEventListener('click', () => {
    const input = $('#signedMessage');
    runSignatureVerification(!(input?.value.includes('[MODIFIED]')));
  });

  $('#tamperSignature')?.addEventListener('click', () => {
    const input = $('#signedMessage');
    if (input && !input.value.includes('[MODIFIED]')) input.value += ' [MODIFIED]';
    runSignatureVerification(false);
  });

  $('#resetSignature')?.addEventListener('click', () => {
    const input = $('#signedMessage');
    if (input) input.value = `Runtime payload ${new Date().toISOString()}`;
    const handshakeEl = $('#handshakeTime');
    if (handshakeEl) handshakeEl.textContent = timeNow();
    const logEl = $('#signatureLog');
    if (logEl) logEl.innerHTML = '<div><span>sig@demo:~$</span> Ready to verify current runtime payload.</div>';
  });

  $$('.nav-item[data-view]').forEach(button => button.addEventListener('click', () => {
    $$('.nav-item').forEach(item => item.classList.remove('active'));
    button.classList.add('active');
    const mainEl = $('main');
    if (mainEl) mainEl.dataset.activeView = button.dataset.view;
    $('main')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
}

// ── Main entry ────────────────────────────────────────────────────────────────
async function main() {
  const role = new URLSearchParams(location.search).get('role');
  if (!VALID_ROLES.has(role)) { injectRolePicker(); return; }

  state.role = role;
  configureRoleUi();
  bindEvents();

  // Initialize demo modules for this role
  initDemo1(state, broadcastDemoControl);
  initDemo2(state, broadcastDemoControl);
  initDemo3(state, broadcastDemoControl);
  initDemo4(state);
  initDemo5(state, broadcastDemoControl);

  if (role === 'alice') {
    // Alice generates and broadcasts the session secret
    const { secretHex } = await generateSessionSecret();
    // Connect first, then broadcast once open
    connectWebSocket();
    // Wait for socket to open before broadcasting
    const waitForOpen = setInterval(() => {
      if (state.socket?.readyState === WebSocket.OPEN) {
        clearInterval(waitForOpen);
        state.socket.send(JSON.stringify({
          type: 'demo_control',
          action: 'session_init',
          payload: { secretHex },
        }));
        const fpEl = $('#fingerprint');
        const sharedKeyBytes = getSharedKeyBytes();
        if (sharedKeyBytes && fpEl) fpEl.textContent = fingerprintFromBytes(sharedKeyBytes);
        setSessionTelemetry();
        const signedMsgInput = $('#signedMessage');
        if (signedMsgInput) signedMsgInput.value = `Runtime payload ${new Date().toISOString()}`;
        const handshakeEl = $('#handshakeTime');
        if (handshakeEl) handshakeEl.textContent = timeNow();
      }
    }, 100);
  } else if (role === 'bob') {
    // Bob waits for session_init from server (handled in handleDemoControl)
    connectWebSocket();
    const handshakeEl = $('#handshakeTime');
    if (handshakeEl) handshakeEl.textContent = timeNow();
  } else {
    // Eve — no shared key, just connects
    connectWebSocket();
    updateRoster([]);
  }
}

main();
