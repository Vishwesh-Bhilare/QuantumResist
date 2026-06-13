import { hexToBytes, toHex } from '../crypto.js';
import { deriveMessageKey, getSharedKeyBytes } from '../session.js';

let _state = null;
let _broadcast = null;
let _harvestedMessage = null;
let _rsaOaepKeyPair = null;
let _classicalPlaintext = 'CLASSIFIED GOVERNMENT TRANSMISSION — EYES ONLY';
let _attackDemoActive = false;
let _attackStep = 0;
let _classicalSessionKey = null;

export function initDemo2(state, broadcast) {
  _state = state;
  _broadcast = broadcast;
  crypto.subtle.generateKey(
    { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true, ['encrypt', 'decrypt'],
  ).then(kp => { _rsaOaepKeyPair = kp; }).catch(() => {});
}

export function setHarvestedMessage(msg) {
  _harvestedMessage = msg;
}

export function launchTimeskip(broadcast) {
  broadcast('demo2_timeskip', {});
}

// Attack Demo Controls
export function startAttackDemo(broadcast) {
  _attackDemoActive = true;
  _attackStep = 0;
  broadcast('attack_step', { step: 0, action: 'start' });
  showAttackDemoPanel();
}

export function attackStep(step, broadcast) {
  _attackStep = step;
  broadcast('attack_step', { step, action: 'step' });
  renderAttackStep(step);
}

export function resetAttackDemo(broadcast) {
  _attackDemoActive = false;
  _attackStep = 0;
  broadcast('attack_step', { step: 0, action: 'reset' });
  closeAttackDemoPanel();
}

export async function handleDemo2Control(message, state, broadcast) {
  const { action, payload } = message;

  if (action === 'demo2_timeskip') {
    if (payload?.harvestedMessage && !_harvestedMessage) {
      _harvestedMessage = payload.harvestedMessage;
    }
    await runTimeskipAnimation();
    return;
  }

  if (action === 'attack_step') {
    if (payload.action === 'start') {
      _attackDemoActive = true;
      showAttackDemoPanel();
    } else if (payload.action === 'reset') {
      _attackDemoActive = false;
      closeAttackDemoPanel();
    } else if (payload.action === 'step') {
      renderAttackStep(payload.step);
    }
    return;
  }

  if (action === 'classical_session_init' && state.role !== 'alice') {
    _classicalSessionKey = payload.secretHex;
  }
}

// Attack Demo Panel Rendering
function showAttackDemoPanel() {
  let panel = document.getElementById('attack-demo-panel');
  if (panel) {
    panel.style.display = 'grid';
    return;
  }

  panel = document.createElement('div');
  panel.id = 'attack-demo-panel';
  panel.className = 'attack-demo-panel';
  panel.innerHTML = `
    <div class="attack-demo-header">
      <h3>⚔️ Quantum Attack Simulation: Classical vs Post-Quantum</h3>
      <button class="attack-demo-close" id="attack-demo-close">×</button>
    </div>
    <div class="attack-demo-two-column">
      <div class="attack-demo-classical">
        <div class="attack-demo-title">Classical System <span class="badge-danger">RSA-2048 + AES-256-GCM</span></div>
        <div class="attack-demo-content" id="attack-classical-content">
          <div class="attack-step-status">Waiting for step 1...</div>
        </div>
      </div>
      <div class="attack-demo-pqc">
        <div class="attack-demo-title">Post-Quantum System <span class="badge-success">ML-KEM-1024 + Ratchet</span></div>
        <div class="attack-demo-content" id="attack-pqc-content">
          <div class="attack-step-status">Waiting for step 1...</div>
        </div>
      </div>
    </div>
    <div class="attack-demo-footer">
      <div class="attack-step-indicator" id="attack-step-indicator">
        <span class="step-dot" data-step="1">1</span> →
        <span class="step-dot" data-step="2">2</span> →
        <span class="step-dot" data-step="3">3</span> →
        <span class="step-dot" data-step="4">4</span> →
        <span class="step-dot" data-step="5">5</span>
      </div>
    </div>
  `;

  document.body.appendChild(panel);
  document.getElementById('attack-demo-close')?.addEventListener('click', () => {
    if (_broadcast) resetAttackDemo(_broadcast);
    panel.style.display = 'none';
  });
}

function closeAttackDemoPanel() {
  const panel = document.getElementById('attack-demo-panel');
  if (panel) panel.style.display = 'none';
}

async function renderAttackStep(step) {
  const classicalContent = document.getElementById('attack-classical-content');
  const pqcContent = document.getElementById('attack-pqc-content');
  if (!classicalContent || !pqcContent) return;

  // Update step indicator
  for (let i = 1; i <= 5; i++) {
    const dot = document.querySelector(`.step-dot[data-step="${i}"]`);
    if (dot) {
      if (i < step) dot.classList.add('completed');
      else if (i === step) dot.classList.add('active');
      else dot.classList.remove('completed', 'active');
    }
  }

  const sharedKeyBytes = getSharedKeyBytes();
  const messageText = document.getElementById('attack-message-input')?.value || 'Top Secret Mission Briefing';

  switch(step) {
    case 1:
      classicalContent.innerHTML = `
        <div class="attack-step-card">
          <div class="step-title">🔧 Step 1: Key Generation</div>
          <div class="step-detail">
            <div><strong>RSA-2048 Key Pair:</strong> Generated</div>
            <div><strong>Session Key:</strong> ${_classicalSessionKey ? _classicalSessionKey.slice(0, 32) + '…' : 'Waiting for Alice…'}</div>
            <div><strong>Forward Secrecy:</strong> ❌ Disabled</div>
            <div class="key-visual">Public Modulus: [2048-bit RSA modulus]</div>
          </div>
        </div>
      `;
      pqcContent.innerHTML = `
        <div class="attack-step-card">
          <div class="step-title">🔧 Step 1: Key Generation</div>
          <div class="step-detail">
            <div><strong>ML-KEM-1024 Key Pair:</strong> Generated</div>
            <div><strong>Session Key:</strong> ${sharedKeyBytes ? toHex(sharedKeyBytes).slice(0, 32) + '…' : 'Waiting for Alice…'}</div>
            <div><strong>Forward Secrecy:</strong> ✅ Enabled (Ratchet)</div>
            <div class="key-visual">Lattice Public Key: [module-LWE parameters]</div>
          </div>
        </div>
      `;
      break;

    case 2:
      classicalContent.innerHTML = `
        <div class="attack-step-card">
          <div class="step-title">📨 Step 2: Send Encrypted Message</div>
          <div class="step-detail">
            <div><strong>Plaintext:</strong> "${escapeHtml(messageText)}"</div>
            <div><strong>Encryption:</strong> AES-256-GCM (static key)</div>
            <div><strong>Ciphertext:</strong> <span class="cipher-demo">a7f3c8e2…[128 bytes]</span></div>
            <div><strong>IV:</strong> 9c4e2b1a8f3d6e7c</div>
            <div><strong>HMAC:</strong> 3f8e2d1c…</div>
          </div>
        </div>
      `;
      pqcContent.innerHTML = `
        <div class="attack-step-card">
          <div class="step-title">📨 Step 2: Send Encrypted Message</div>
          <div class="step-detail">
            <div><strong>Plaintext:</strong> "${escapeHtml(messageText)}"</div>
            <div><strong>Key Derivation:</strong> HMAC-SHA-256 (Epoch-based)</div>
            <div><strong>Ciphertext:</strong> <span class="cipher-demo">b8e4d1f9…[128 bytes]</span></div>
            <div><strong>IV:</strong> 7d2e1f3a8c4b5e6f</div>
            <div><strong>HMAC:</strong> 2a7e4c1d…</div>
            <div><strong>Epoch:</strong> 001 → 002 (key rotated)</div>
          </div>
        </div>
      `;
      break;

    case 3:
      classicalContent.innerHTML = `
        <div class="attack-step-card">
          <div class="step-title">📡 Step 3: Harvest Ciphertext</div>
          <div class="step-detail">
            <div><strong>Stored Ciphertext:</strong> a7f3c8e2…</div>
            <div><strong>Stored IV:</strong> 9c4e2b1a8f3d6e7c</div>
            <div><strong>Stored HMAC:</strong> 3f8e2d1c…</div>
            <div><strong>Attack Status:</strong> Waiting for quantum computer (2038)</div>
          </div>
        </div>
      `;
      pqcContent.innerHTML = `
        <div class="attack-step-card">
          <div class="step-title">📡 Step 3: Harvest Ciphertext</div>
          <div class="step-detail">
            <div><strong>Stored Ciphertext:</strong> b8e4d1f9…</div>
            <div><strong>Stored IV:</strong> 7d2e1f3a8c4b5e6f</div>
            <div><strong>Stored HMAC:</strong> 2a7e4c1d…</div>
            <div><strong>Note:</strong> Epoch 001 key already DELETED</div>
            <div><strong>Attack Status:</strong> Even with quantum computer, epoch key is gone</div>
          </div>
        </div>
      `;
      break;

    case 4:
      classicalContent.innerHTML = `
        <div class="attack-step-card attack-broken">
          <div class="step-title">💥 Step 4: Quantum Attack (Shor's Algorithm)</div>
          <div class="step-detail">
            <div><strong>Attack:</strong> Shor's algorithm factors RSA-2048 modulus</div>
            <div><strong>Private Key Recovered:</strong> d = 0x3f8e…</div>
            <div><strong>AES Key Extracted:</strong> 8c4d2e1f…</div>
            <div class="attack-result danger">
              🔓 MESSAGE DECRYPTED: "${escapeHtml(messageText)}"
            </div>
            <div><strong>Time to break:</strong> Simulated: minutes on CRQC</div>
            <div><strong>All past messages:</strong> COMPROMISED</div>
          </div>
        </div>
      `;
      pqcContent.innerHTML = `
        <div class="attack-step-card attack-secure">
          <div class="step-title">🛡️ Step 4: Quantum Attack (Lattice)</div>
          <div class="step-detail">
            <div><strong>Attack:</strong> No efficient quantum algorithm for MLWE</div>
            <div><strong>Attempted:</strong> Lattice reduction with quantum optimization</div>
            <div><strong>Result:</strong> No improvement over classical</div>
            <div class="attack-result success">
              🔒 MESSAGE REMAINS ENCRYPTED — SECURE
            </div>
            <div><strong>Estimated security:</strong> ≥128 bits quantum security</div>
            <div><strong>Past messages:</strong> Keys already deleted</div>
          </div>
        </div>
      `;
      break;

    case 5:
      classicalContent.innerHTML = `
        <div class="attack-step-card attack-broken">
          <div class="step-title">⚠️ Step 5: Key Compromise Test</div>
          <div class="step-detail">
            <div><strong>Current Key Compromised:</strong> YES (RSA broken)</div>
            <div><strong>Past Message 1 (Epoch 1):</strong> 🔓 "Initial Setup Complete"</div>
            <div><strong>Past Message 2 (Epoch 2):</strong> 🔓 "${escapeHtml(messageText)}"</div>
            <div><strong>Past Message 3 (Epoch 3):</strong> 🔓 "Update Scheduled"</div>
            <div class="attack-result danger">
              ⚠️ ALL PAST MESSAGES EXPOSED — NO FORWARD SECRECY
            </div>
          </div>
        </div>
      `;
      pqcContent.innerHTML = `
        <div class="attack-step-card attack-secure">
          <div class="step-title">✅ Step 5: Key Compromise Test</div>
          <div class="step-detail">
            <div><strong>Current Key Compromised:</strong> NO (ML-KEM unbroken)</div>
            <div><strong>Past Message 1 (Epoch 1):</strong> 🔒 [Key DELETED — Cannot decrypt]</div>
            <div><strong>Past Message 2 (Epoch 2):</strong> 🔒 [Key DELETED — Cannot decrypt]</div>
            <div><strong>Past Message 3 (Epoch 3):</strong> 🔒 [Key DELETED — Cannot decrypt]</div>
            <div class="attack-result success">
              ✅ FORWARD SECRECY — PAST MESSAGES PROTECTED
            </div>
            <div><strong>Current Epoch (4) message:</strong> ${sharedKeyBytes ? 'Active' : 'Pending'}</div>
          </div>
        </div>
      `;
      break;
  }
}

// Timeskip Animation (existing)
async function runTimeskipAnimation() {
  const overlay = getOrCreateTimeskipOverlay();
  const yearEl = document.getElementById('demo2-year');
  const barFill = document.getElementById('demo2-bar-fill');
  const labelEl = document.getElementById('demo2-ts-label');

  if (yearEl) yearEl.textContent = '2026';
  if (barFill) barFill.style.transition = 'none';
  if (barFill) barFill.style.width = '0%';
  if (labelEl) labelEl.textContent = 'FAST FORWARDING…';

  overlay.classList.add('visible');
  await wait(120);

  const startYear = 2026, endYear = 2038, duration = 2800;
  const startTime = performance.now();
  await new Promise(resolve => {
    function tick(now) {
      const p = Math.min((now - startTime) / duration, 1);
      const eased = p < 0.5 ? 2 * p * p : -1 + (4 - 2 * p) * p;
      const year = Math.round(startYear + (endYear - startYear) * eased);
      if (yearEl) yearEl.textContent = String(year);
      if (barFill) {
        barFill.style.transition = 'none';
        barFill.style.width = `${p * 100}%`;
      }
      if (p < 1) requestAnimationFrame(tick);
      else resolve();
    }
    requestAnimationFrame(tick);
  });

  if (labelEl) labelEl.textContent = 'QUANTUM COMPUTER ACQUIRED';
  await wait(1000);

  overlay.classList.remove('visible');
  await wait(400);

  await showDecryptResult();
}

async function showDecryptResult() {
  let classicalPlaintext = _classicalPlaintext;
  let classicalSuccess = true;

  let pqcCipherPreview = '(no message intercepted yet)';
  let pqcFailed = true;

  if (_harvestedMessage) {
    pqcCipherPreview = (_harvestedMessage.ciphertext || '').slice(0, 64) + '…';
    const sharedKeyBytes = getSharedKeyBytes();
    if (sharedKeyBytes) {
      try {
        const wrongEpoch = Number(_harvestedMessage.epoch || 1) + 9999;
        const { keyBytes } = await deriveMessageKey(sharedKeyBytes, wrongEpoch);
        const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']);
        await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: hexToBytes(_harvestedMessage.iv) },
          key,
          hexToBytes(_harvestedMessage.ciphertext),
        );
        pqcFailed = false;
      } catch {
        pqcFailed = true;
      }
    }
  }

  renderHarvestResult({
    classical: { success: classicalSuccess, plaintext: classicalPlaintext },
    pqc: { failed: pqcFailed, cipherPreview: pqcCipherPreview },
    epoch: _harvestedMessage?.epoch || '?',
  });
}

function getOrCreateTimeskipOverlay() {
  let el = document.getElementById('demo2-timeskip');
  if (!el) {
    el = document.createElement('div');
    el.id = 'demo2-timeskip';
    el.className = 'timeskip-overlay';
    el.innerHTML = `
      <div class="timeskip-year" id="demo2-year">2026</div>
      <div class="timeskip-label" id="demo2-ts-label">FAST FORWARDING…</div>
      <div class="timeskip-bar"><div class="timeskip-bar-fill" id="demo2-bar-fill"></div></div>`;
    document.body.appendChild(el);
  }
  return el;
}

function renderHarvestResult({ classical, pqc, epoch }) {
  let overlay = document.getElementById('demo2-result');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'demo2-result';
    overlay.className = 'harvest-result-overlay';
    document.body.appendChild(overlay);
  }

  overlay.innerHTML = `
    <button class="harvest-close" id="demo2-close">×</button>
    <div class="harvest-split">
      <div class="harvest-card classical">
        <div class="harvest-card-header">
          <strong>RSA-2048</strong>
          <span class="status-badge">DECRYPTED</span>
        </div>
        <div class="harvest-card-label">ATTACK</div>
        <div class="harvest-card-value" style="margin-bottom:10px">Shor's algorithm recovers RSA private key from public modulus</div>
        <div class="harvest-card-label">RECOVERED PLAINTEXT</div>
        <div class="harvest-card-value revealed">${escapeHtml(classical.plaintext)}</div>
        <div style="margin-top:10px;padding:8px;background:rgba(255,102,110,.06);border:1px solid rgba(255,102,110,.2);border-radius:3px">
          <div style="color:#ff666e;font:7px var(--mono);letter-spacing:.8px">⚠ MESSAGE RECOVERED BY QUANTUM ATTACKER</div>
        </div>
      </div>
      <div class="harvest-card pqc">
        <div class="harvest-card-header">
          <strong>ML-KEM-1024 + AES-256-GCM</strong>
          <span class="status-badge">PROTECTED</span>
        </div>
        <div class="harvest-card-label">ATTACK</div>
        <div class="harvest-card-value" style="margin-bottom:10px">No efficient quantum attack on ML-KEM · Epoch ${epoch} key deleted by forward secrecy</div>
        <div class="harvest-card-label">INTERCEPTED CIPHERTEXT</div>
        <div class="harvest-card-value blocked">${escapeHtml(pqc.cipherPreview)}</div>
        <div style="margin-top:10px;padding:8px;background:rgba(41,232,199,.04);border:1px solid rgba(41,232,199,.2);border-radius:3px">
          <div style="color:#29e8c7;font:7px var(--mono);letter-spacing:.8px">✓ EPOCH KEY DELETED · DECRYPTION IMPOSSIBLE</div>
        </div>
      </div>
    </div>`;

  document.getElementById('demo2-close').addEventListener('click', () => {
    overlay.classList.remove('visible');
  });
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.remove('visible'); });

  requestAnimationFrame(() => overlay.classList.add('visible'));
}

function escapeHtml(value) {
  const node = document.createElement('div');
  node.textContent = String(value);
  return node.innerHTML;
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
