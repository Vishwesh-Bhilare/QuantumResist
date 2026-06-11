import { encryptMessage, epochLabel, formatFingerprint, nextEpoch, randomBytes, toHex, truncateCiphertext } from './crypto.js';

const state = {
  epoch: 1,
  messageCount: 0,
  attackMode: 'classical',
  keyBytes: randomBytes(32),
  shared: randomBytes(32),
  root: randomBytes(32),
  sound: true,
};

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const timeNow = () => new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function setSessionTelemetry() {
  $('#keyCount').textContent = epochLabel(state.epoch);
  $('#ratchetLabel').textContent = `Epoch ${epochLabel(state.epoch)} · Synchronized`;
  $('#epochBadge').textContent = `EPOCH ${epochLabel(state.epoch)}`;
  $('#modalEpoch').textContent = epochLabel(state.epoch);
  $('#fingerprint').textContent = formatFingerprint(state.root);
  const previous = Math.max(0, state.epoch - 1);
  const previousTwo = Math.max(0, state.epoch - 2);
  $('#ratchetFlow').innerHTML = `
    <div class="key-node destroyed"><span>MK ${epochLabel(previousTwo)}</span><strong>DELETED</strong></div><i></i>
    <div class="key-node destroyed"><span>MK ${epochLabel(previous)}</span><strong>DELETED</strong></div><i></i>
    <div class="key-node current"><span>MK ${epochLabel(state.epoch)}</span><strong>ACTIVE</strong></div><i class="dashed"></i>
    <div class="key-node future"><span>MK ${epochLabel(state.epoch + 1)}</span><strong>LOCKED</strong></div>`;
}

function showToast(message, symbol = '✓') {
  const toast = $('#toast');
  toast.querySelector('span').textContent = symbol;
  toast.querySelector('p').textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => toast.classList.remove('show'), 2300);
}

function openModal(modal) {
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeModal(modal) {
  modal.hidden = true;
  document.body.style.overflow = '';
}

async function sendMessage(text) {
  const sendButton = $('.send-button');
  sendButton.disabled = true;
  const activeKey = state.keyBytes;
  const { encrypted } = await encryptMessage(text, activeKey);
  const ciphertext = truncateCiphertext(encrypted);
  const row = document.createElement('div');
  row.className = 'message-row sent';
  row.innerHTML = `<div class="bubble"><p>${escapeHtml(text)}</p><div><span class="cipher-preview">${ciphertext}</span><span>ML-DSA ✓</span><time>${timeNow()}</time></div></div>`;
  $('#messages').append(row);
  $('#messages').scrollTo({ top: $('#messages').scrollHeight, behavior: 'smooth' });

  state.messageCount += 1;
  state.epoch = nextEpoch(state.epoch);
  state.keyBytes = randomBytes(32);
  $('#messageCount').textContent = state.messageCount;
  const latency = 8 + Math.floor(Math.random() * 9);
  $('#headerLatency').textContent = `${latency}ms`;
  $('#latencyMetric').innerHTML = `${latency} <small>ms</small>`;
  setSessionTelemetry();
  $$('.stack-item').forEach((item, index) => setTimeout(() => item.classList.add('flash'), index * 80));
  setTimeout(() => $$('.stack-item').forEach(item => item.classList.remove('flash')), 1000);
  sendButton.disabled = false;
  showToast(`Message encrypted · MK ${epochLabel(state.epoch - 1)} erased`);
}

function escapeHtml(value) {
  const node = document.createElement('div');
  node.textContent = value;
  return node.innerHTML;
}

$('#messageForm').addEventListener('submit', async event => {
  event.preventDefault();
  const input = $('#messageInput');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  try { await sendMessage(text); }
  catch (error) { showToast('Encryption unavailable in this browser', '!'); console.error(error); }
});

function resetSession() {
  state.epoch = 1;
  state.messageCount = 0;
  state.keyBytes = randomBytes(32);
  state.shared = randomBytes(32);
  state.root = randomBytes(32);
  $('#messageCount').textContent = '0';
  $('#handshakeTime').textContent = 'just now';
  $('#messages').innerHTML = `<div class="system-message"><span></span> New secure session established <time>just now</time></div>`;
  setSessionTelemetry();
  showToast('Ephemeral session regenerated');
}

$('#attackButton').addEventListener('click', () => openModal($('#attackModal')));
$('#attackNav').addEventListener('click', () => openModal($('#attackModal')));
$('#resetNav').addEventListener('click', resetSession);
$('#inspectButton').addEventListener('click', () => openModal($('#keyModal')));
$$('[data-close]').forEach(button => button.addEventListener('click', () => closeModal(button.closest('.modal-backdrop'))));
$$('.modal-backdrop').forEach(backdrop => backdrop.addEventListener('click', event => { if (event.target === backdrop) closeModal(backdrop); }));
window.addEventListener('keydown', event => { if (event.key === 'Escape') $$('.modal-backdrop:not([hidden])').forEach(closeModal); });

$$('[data-mode]').forEach(button => button.addEventListener('click', () => {
  $$('[data-mode]').forEach(item => item.classList.remove('active'));
  button.classList.add('active');
  state.attackMode = button.dataset.mode;
  $('#attackTerminal').innerHTML = `<div><span>quantum@lab:~$</span> Target selected: ${state.attackMode === 'classical' ? 'RSA-2048' : 'ML-KEM-1024'}</div>`;
}));

$('#launchAttack').addEventListener('click', async () => {
  const terminal = $('#attackTerminal');
  const launch = $('#launchAttack');
  launch.disabled = true;
  terminal.innerHTML = '';
  const classical = [
    ['Initializing fault-tolerant quantum environment...', ''],
    ['Loading Shor period-finding routine...', ''],
    ['Factoring RSA-2048 modulus [SIMULATED]...', ''],
    ['Private key recovered.', 'danger-line'],
    ['CLASSICAL CHANNEL COMPROMISED', 'danger-line'],
  ];
  const pqc = [
    ['Initializing quantum cryptanalysis environment...', ''],
    ['Inspecting ML-KEM module-lattice structure...', ''],
    ['Testing known quantum speedups...', ''],
    ['No efficient attack is currently known.', 'success-line'],
    ['POST-QUANTUM CHANNEL REMAINS SECURE', 'success-line'],
  ];
  for (const [line, className] of state.attackMode === 'classical' ? classical : pqc) {
    const item = document.createElement('div');
    item.className = className;
    item.innerHTML = `<span>›</span> ${line}`;
    terminal.append(item);
    terminal.scrollTop = terminal.scrollHeight;
    await wait(510);
  }
  launch.disabled = false;
});

$('#revealKeys').addEventListener('click', event => {
  const revealed = event.currentTarget.dataset.revealed === 'true';
  if (revealed) {
    $('#sharedKey').textContent = $('#rootKey').textContent = $('#messageKey').textContent = '••••••••••••••••';
    event.currentTarget.textContent = 'Reveal demo values';
  } else {
    $('#sharedKey').textContent = `${toHex(state.shared).slice(0, 16)}…`;
    $('#rootKey').textContent = `${toHex(state.root).slice(0, 16)}…`;
    $('#messageKey').textContent = `${toHex(state.keyBytes).slice(0, 16)}…`;
    event.currentTarget.textContent = 'Mask values';
  }
  event.currentTarget.dataset.revealed = String(!revealed);
});

$('#copyFingerprint').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('#fingerprint').textContent); showToast('Fingerprint copied'); }
  catch { showToast('Fingerprint ready to compare'); }
});

$('#soundToggle').addEventListener('click', event => {
  state.sound = !state.sound;
  event.currentTarget.style.opacity = state.sound ? '1' : '.35';
  showToast(state.sound ? 'Interface sound enabled' : 'Interface sound muted');
});

$$('.nav-item[data-view]').forEach(button => button.addEventListener('click', () => {
  $$('.nav-item').forEach(item => item.classList.remove('active'));
  button.classList.add('active');
  const target = button.dataset.view === 'keys' ? $('.ratchet-panel') : button.dataset.view === 'messages' ? $('.secure-channel') : document.querySelector('main');
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
}));

setSessionTelemetry();
