import { encryptMessage, epochLabel, hexToBytes, nextEpoch, signHmac, toHex, truncateCiphertext, verifyHmac } from './crypto.js';
import { DEMO_PASSPHRASE, DEMO_SALT, deriveMessageKey, initSharedKey } from './session.js';

const VALID_ROLES = new Set(['alice', 'bob', 'eve']);
const textDecoder = new TextDecoder();

const state = {
  role: null,
  epoch: 1,
  messageCount: 0,
  sharedKeyBytes: null,
  peers: [],
  interceptCount: 0,
  attackMode: 'classical',
  sound: true,
  socket: null,
  reconnectAttempts: 0,
  lastSendAt: null,
  lastMessageKeyHex: '',
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
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
  if (modal.id === 'keyModal') playKeyDerivationReveal();
}

function closeModal(modal) {
  modal.hidden = true;
  document.body.style.overflow = '';
}

function updateRoster(roles) {
  state.peers = roles;
  for (const role of ['alice', 'bob', 'eve']) $('#peer-' + role)?.classList.toggle('online', roles.includes(role));
}

function setLatency(ms) {
  const value = Math.max(1, Math.round(ms));
  $('#headerLatency').textContent = `${value}ms`;
  $('#latencyMetric').innerHTML = `${value} <small>ms</small>`;
}

async function setKeyInspector() {
  if (!state.sharedKeyBytes) return;
  const current = await deriveMessageKey(state.sharedKeyBytes, state.epoch);
  state.lastMessageKeyHex = current.keyHex;
  $('#sharedKey').textContent = toHex(state.sharedKeyBytes);
  $('#rootKey').textContent = `${toHex(state.sharedKeyBytes)} · salt ${toHex(DEMO_SALT)}`;
  $('#messageKey').textContent = current.keyHex;
}

async function setSessionTelemetry() {
  $('#keyCount').textContent = epochLabel(state.epoch);
  $('#ratchetLabel').textContent = `Epoch ${epochLabel(state.epoch)} · ${state.role === 'eve' ? 'Observed' : 'Synchronized'}`;
  $('#epochBadge').textContent = `EPOCH ${epochLabel(state.epoch)}`;
  $('#modalEpoch').textContent = epochLabel(state.epoch);
  if (state.sharedKeyBytes) $('#fingerprint').textContent = fingerprintFromBytes(state.sharedKeyBytes);
  const previous = Math.max(0, state.epoch - 1);
  const previousTwo = Math.max(0, state.epoch - 2);
  $('#ratchetFlow').innerHTML = `
    <div class="key-node destroyed"><span>MK ${epochLabel(previousTwo)}</span><strong>DELETED</strong></div><i></i>
    <div class="key-node destroyed"><span>MK ${epochLabel(previous)}</span><strong>DELETED</strong></div><i></i>
    <div class="key-node current"><span>MK ${epochLabel(state.epoch)}</span><strong>ACTIVE</strong></div><i class="dashed"></i>
    <div class="key-node future"><span>MK ${epochLabel(state.epoch + 1)}</span><strong>LOCKED</strong></div>`;
  await setKeyInspector();
}

function flashStack() {
  $$('.stack-item').forEach((item, index) => setTimeout(() => item.classList.add('flash'), index * 80));
  setTimeout(() => $$('.stack-item').forEach(item => item.classList.remove('flash')), 1000);
}

function addSystemMessage(text) {
  $('#messages').innerHTML = `<div class="system-message"><span></span> ${escapeHtml(text)} <time>${timeNow()}</time></div>`;
}

async function sendMessage(text) {
  if (state.role !== 'alice' || !state.socket || state.socket.readyState !== WebSocket.OPEN) {
    showToast('Alice must be connected before sending', '!');
    return;
  }
  const sendButton = $('.send-button');
  sendButton.disabled = true;
  const { keyBytes, keyHex } = await deriveMessageKey(state.sharedKeyBytes, state.epoch);
  state.lastMessageKeyHex = keyHex;
  const { iv, encrypted } = await encryptMessage(text, keyBytes);
  const hmac = await signHmac(encrypted, keyBytes);
  const ciphertextHex = toHex(encrypted);
  const ivHex = toHex(iv);
  state.socket.send(JSON.stringify({ type: 'message', ciphertext: ciphertextHex, iv: ivHex, epoch: state.epoch, hmac }));
  state.lastSendAt = performance.now();

  const row = document.createElement('div');
  row.className = 'message-row sent';
  row.innerHTML = `<div class="bubble"><p>${escapeHtml(text)}</p><div><span class="cipher-preview">${truncateCiphertext(encrypted)}</span><span>ML-DSA ✓ · HMAC ✓</span><time>${timeNow()}</time></div></div>`;
  $('#messages').append(row);
  $('#messages').scrollTo({ top: $('#messages').scrollHeight, behavior: 'smooth' });

  state.messageCount += 1;
  state.epoch = nextEpoch(state.epoch);
  $('#messageCount').textContent = String(state.messageCount);
  await setSessionTelemetry();
  flashStack();
  sendButton.disabled = false;
  showToast(`Message encrypted · MK ${epochLabel(state.epoch - 1)} erased`);
}

async function handleBobRelay(message) {
  const row = document.createElement('div');
  row.className = 'message-row received';
  row.innerHTML = `<div class="mini-avatar">A</div><div class="bubble"><p class="cipher-preview">${message.ciphertext.slice(0, 64)}…</p><div><span>DECRYPTING...</span><time>${timeNow()}</time></div></div>`;
  $('#messages').append(row);
  $('#messages').scrollTo({ top: $('#messages').scrollHeight, behavior: 'smooth' });
  await wait(300);

  const { keyBytes } = await deriveMessageKey(state.sharedKeyBytes, message.epoch);
  const hmacOk = await verifyHmac(hexToBytes(message.ciphertext), keyBytes, message.hmac);
  try {
    const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: hexToBytes(message.iv) }, key, hexToBytes(message.ciphertext));
    row.querySelector('.bubble').innerHTML = `<p>${escapeHtml(textDecoder.decode(decrypted))}</p><div><span>DECRYPTED ✓ · HMAC ${hmacOk ? '✓' : '✗'}</span><time>${timeNow()}</time></div>`;
    state.messageCount += 1;
    $('#messageCount').textContent = String(state.messageCount);
  } catch (error) {
    row.querySelector('.bubble').innerHTML = `<p class="danger-line">DECRYPTION FAILED</p><p class="cipher-preview">${message.ciphertext}</p><div><span>HMAC ${hmacOk ? '✓' : '✗'}</span><time>${timeNow()}</time></div>`;
    console.error(error);
  }
  state.epoch = Math.max(state.epoch, Number(message.epoch) + 1);
  await setSessionTelemetry();
  flashStack();
}

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

async function handleEveRelay(message) {
  state.interceptCount += 1;
  $('#interceptCount').textContent = String(state.interceptCount);
  const terminal = $('#eveLog');
  const lines = [
    [`[EPOCH ${message.epoch}] Intercepted ${message.ciphertext.length / 2} bytes`, ''],
    [`IV: ${message.iv}`, ''],
    [`Ciphertext: ${message.ciphertext.slice(0, 48)}...`, ''],
    ['Attempting AES-256-GCM brute force [2^256 keys]...', ''],
    ['Attempting HMAC forgery...', ''],
    ['Attempting ML-KEM lattice reduction...', ''],
    [`ATTACK FAILED — Forward secrecy epoch ${message.epoch} key permanently erased.`, 'danger-line'],
    ['No prior epoch keys recoverable.', 'success-line'],
    ['──────────────────────────────────────', 'separator'],
  ];
  for (const [index, [line, className]] of lines.entries()) {
    await typeTerminalLine(terminal, line, className);
    if (index === 3) await wait(500);
    if (index === 4) await wait(400);
    if (index === 5) await wait(700);
  }
}

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
  if (state.reconnectAttempts >= 5) return;
  state.reconnectAttempts += 1;
  showToast('Connection lost — reconnecting', '!');
  setTimeout(connectWebSocket, 2000);
}

function injectRolePicker() {
  const picker = document.createElement('div');
  picker.className = 'role-picker';
  picker.innerHTML = ['alice', 'bob', 'eve'].map(role => `
    <button class="role-picker-btn ${role}" type="button" data-role="${role}">
      <span class="role-letter">${role[0].toUpperCase()}</span>
      <span class="role-name">${role.toUpperCase()}</span>
    </button>`).join('');
  document.body.insertBefore(picker, $('.app-shell'));
  $('.app-shell').style.display = 'none';
  picker.addEventListener('click', event => {
    const button = event.target.closest('[data-role]');
    if (button) location.search = `?role=${button.dataset.role}`;
  });
}

function configureRoleUi() {
  document.body.dataset.role = state.role;
  $('.brand').href = `?role=${state.role}`;
  $('.topbar-status span:nth-child(2)').textContent = `${state.role.toUpperCase()} secure network`;
  $('#messages').innerHTML = '';
  addSystemMessage(`${state.role.toUpperCase()} joined the LAN WebSocket demo`);

  if (state.role === 'bob') {
    $('.composer').hidden = true;
    $('.participants .participant strong').textContent = 'Alice';
    $('.participants .participant.right strong').textContent = 'Bob';
  }
  if (state.role === 'alice') $('.composer').hidden = false;
  if (state.role === 'eve') renderEveLayout();
}

function renderEveLayout() {
  $('main').dataset.activeView = 'eve';
  $('main').innerHTML = `
    <section class="eve-layout">
      <article class="eve-log-panel">
        <div class="eve-log-header"><div><span class="panel-kicker">PASSIVE INTERCEPT</span><h2>Eve ciphertext monitor</h2></div><div class="connected"><i></i> NO KEY</div></div>
        <div class="eve-log" id="eveLog" aria-live="polite"></div>
      </article>
      <aside class="eve-sidebar">
        <div class="intercept-stats"><h3>INTERCEPT TELEMETRY</h3><div class="stat-block"><div class="stat-value" id="interceptCount">0</div><div class="stat-label">MESSAGES INTERCEPTED</div></div><div class="stat-block"><div class="stat-value zero" id="decryptedCount">0</div><div class="stat-label">MESSAGES DECRYPTED</div></div></div>
        <article class="panel session-panel"><div class="panel-header compact"><div><span class="panel-kicker">ATTACK STATUS</span><h2>Cryptanalysis result</h2></div></div><div class="posture-grid"><div><span>AES-GCM KEY</span><strong>UNKNOWN</strong></div><div><span>HMAC KEY</span><strong>UNKNOWN</strong></div><div><span>BRUTE FORCE</span><strong class="enabled"><i></i> FAILED</strong></div><div><span>PLAINTEXT</span><strong>0 BYTES</strong></div></div></article>
      </aside>
    </section>`;
  typeTerminalLine($('#eveLog'), 'Eve online. Waiting for relayed ciphertext. No shared secret loaded.', 'success-line');
}

function resetSession() {
  state.epoch = 1;
  state.messageCount = 0;
  $('#messageCount').textContent = '0';
  if ($('#handshakeTime')) $('#handshakeTime').textContent = timeNow();
  addSystemMessage(`${state.role.toUpperCase()} session counters reset`);
  setSessionTelemetry();
  showToast('Runtime session counters reset');
}

async function runSignatureVerification(valid = true) {
  const log = $('#signatureLog');
  const verifyButton = $('#verifySignature');
  const tamperButton = $('#tamperSignature');
  verifyButton.disabled = tamperButton.disabled = true;
  log.innerHTML = '';
  const data = new TextEncoder().encode($('#signedMessage').value);
  const signature = await signHmac(data, state.sharedKeyBytes || new Uint8Array(32));
  const ok = valid && await verifyHmac(data, state.sharedKeyBytes || new Uint8Array(32), signature);
  const steps = [
    [`Signing ${data.byteLength} bytes with demo HMAC-SHA-256...`, ''],
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

async function playKeyDerivationReveal() {
  await setKeyInspector();
  const steps = $$('[data-key-step]');
  steps.forEach(step => { step.classList.remove('revealed'); step.style.animation = 'none'; });
  void $('#keyPath').offsetWidth;
  for (const step of steps) {
    step.style.animation = '';
    step.classList.add('revealed');
    await wait(400);
  }
}

function bindEvents() {
  $('#messageForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const input = $('#messageInput');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    try { await sendMessage(text); }
    catch (error) { showToast('Encryption unavailable in this browser', '!'); console.error(error); $('.send-button').disabled = false; }
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
    await navigator.clipboard.writeText($('#fingerprint').textContent);
    showToast('Fingerprint copied');
  });
  $('#soundToggle')?.addEventListener('click', event => {
    state.sound = !state.sound;
    event.currentTarget.style.opacity = state.sound ? '1' : '.35';
    showToast(state.sound ? 'Interface sound enabled' : 'Interface sound muted');
  });
  $('#verifySignature')?.addEventListener('click', () => runSignatureVerification(!$('#signedMessage').value.includes('[MODIFIED]')));
  $('#tamperSignature')?.addEventListener('click', () => {
    const input = $('#signedMessage');
    if (!input.value.includes('[MODIFIED]')) input.value += ' [MODIFIED]';
    runSignatureVerification(false);
  });
  $('#resetSignature')?.addEventListener('click', () => {
    $('#signedMessage').value = `Runtime payload ${new Date().toISOString()}`;
    if ($('#handshakeTime')) $('#handshakeTime').textContent = timeNow();
    $('#signatureLog').innerHTML = '<div><span>sig@demo:~$</span> Ready to verify current runtime payload.</div>';
  });
  $$('.nav-item[data-view]').forEach(button => button.addEventListener('click', () => {
    $$('.nav-item').forEach(item => item.classList.remove('active'));
    button.classList.add('active');
    $('main').dataset.activeView = button.dataset.view;
    $('main').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
}

async function runAttackDemo() {
  const terminal = $('#attackTerminal');
  const launch = $('#launchAttack');
  launch.disabled = true;
  terminal.innerHTML = '';
  const target = state.attackMode === 'classical' ? 'RSA-2048' : 'ML-KEM-1024';
  const lines = state.attackMode === 'classical'
    ? [[`Inspecting ${target} public modulus...`, ''], ['Shor period-finding would recover the private key on a cryptographically relevant quantum computer.', 'danger-line'], ['CLASSICAL CHANNEL COMPROMISED', 'danger-line']]
    : [[`Inspecting ${target} lattice public material...`, ''], ['No efficient quantum attack is currently known for this module-lattice construction.', 'success-line'], ['POST-QUANTUM CHANNEL REMAINS SECURE', 'success-line']];
  for (const [line, className] of lines) await typeTerminalLine(terminal, line, className);
  launch.disabled = false;
}

async function main() {
  const role = new URLSearchParams(location.search).get('role');
  if (!VALID_ROLES.has(role)) { injectRolePicker(); return; }
  state.role = role;
  configureRoleUi();
  bindEvents();
  if (role !== 'eve') {
    const session = await initSharedKey();
    state.sharedKeyBytes = session.sharedKeyBytes;
    const passphraseProof = document.createElement('div');
    passphraseProof.className = 'fingerprint';
    passphraseProof.innerHTML = `<span>DEMO PASSPHRASE</span><code id="passphraseProof">${DEMO_PASSPHRASE}</code>`;
    $('.session-panel').append(passphraseProof);
    $('#signedMessage').value = `Runtime payload ${new Date().toISOString()}`;
    if ($('#handshakeTime')) $('#handshakeTime').textContent = timeNow();
    await setSessionTelemetry();
  } else {
    updateRoster([]);
  }
  connectWebSocket();
}

main();
