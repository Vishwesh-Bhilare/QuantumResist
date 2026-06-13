import { classicalDecrypt, getClassicalKeyBytes } from './classical-crypto.js';
import { hexToBytes, toHex } from './crypto.js';
import { deriveMessageKey, getSharedKeyBytes } from './session.js';

let _state = null;
let _broadcast = null;
let _attackActive = false;
let _currentStep = 0;
let _selectedMessage = null;
let _selectedMessageIndex = -1;
let _recentMessages = [];
let _classicalKeyBytes = null;
let _panelElement = null;

export function initAttackDemo(state, broadcast) {
  _state = state;
  _broadcast = broadcast;
  _classicalKeyBytes = getClassicalKeyBytes();
}

export function addInterceptedMessage(pqcMsg, classicalMsg) {
  const entry = {
    epoch: pqcMsg.epoch,
    pqcCiphertext: pqcMsg.ciphertext,
    pqcIV: pqcMsg.iv,
    pqcHMAC: pqcMsg.hmac,
    classicalCiphertext: classicalMsg?.ciphertext || null,
    classicalIV: classicalMsg?.iv || null,
    classicalHMAC: classicalMsg?.hmac || null,
    plaintext: classicalMsg?.plaintext || null,
    timestamp: Date.now(),
  };
  _recentMessages.unshift(entry);
  if (_recentMessages.length > 10) _recentMessages.pop();
  if (_selectedMessageIndex === -1 && _recentMessages.length > 0) {
    _selectedMessage = _recentMessages[0];
    _selectedMessageIndex = 0;
  }
  if (_attackActive && _panelElement && _selectedMessage) {
    renderAttackStep(_currentStep);
  }
}

export function selectMessageForAttack(index) {
  if (_recentMessages[index]) {
    _selectedMessage = _recentMessages[index];
    _selectedMessageIndex = index;
    console.log(`Selected message Epoch ${_selectedMessage.epoch} for attack`);
    if (_attackActive && _panelElement) {
      renderAttackStep(_currentStep);
    }
    return true;
  }
  return false;
}

// Make available globally for Eve console
if (typeof window !== 'undefined') {
  window.selectAttackMessage = selectMessageForAttack;
}

export function startAttackDemo() {
  if (_attackActive) closeAttackPanels();
  _attackActive = true;
  _currentStep = 0;
  renderAttackPanels();
  if (_selectedMessage) renderAttackStep(1);
  else renderAttackStep(0);
}

export function resetAttackDemo() {
  _attackActive = false;
  _currentStep = 0;
  closeAttackPanels();
}

export async function attackStep(step) {
  if (!_attackActive) {
    startAttackDemo();
    return;
  }
  _currentStep = step;
  await renderAttackStep(step);
}

function renderAttackPanels() {
  closeAttackPanels();
  _panelElement = document.createElement('div');
  _panelElement.id = 'attack-demo-panel';
  _panelElement.className = 'attack-demo-panel';
  _panelElement.innerHTML = `
    <div class="attack-demo-header">
      <h3>⚔️ QUANTUM ATTACK SIMULATION (Step-by-Step)</h3>
      <button class="attack-demo-close" id="attack-demo-close">×</button>
    </div>
    <div class="attack-demo-two-column">
      <div class="attack-demo-classical">
        <div class="attack-demo-title">🏛️ CLASSICAL SYSTEM <span class="badge-danger">RSA-2048 + AES (STATIC)</span></div>
        <div class="attack-demo-content" id="classical-content"></div>
      </div>
      <div class="attack-demo-pqc">
        <div class="attack-demo-title">🔮 POST-QUANTUM SYSTEM <span class="badge-success">ML-KEM-1024 + RATCHET</span></div>
        <div class="attack-demo-content" id="pqc-content"></div>
      </div>
    </div>
    <div class="attack-demo-footer">
      <div class="attack-step-indicator">
        <button class="step-btn" data-step="1">1. Setup</button>
        <button class="step-btn" data-step="2">2. Encrypt</button>
        <button class="step-btn" data-step="3">3. Harvest</button>
        <button class="step-btn" data-step="4">4. Quantum Attack</button>
        <button class="step-btn" data-step="5">5. Forward Secrecy</button>
      </div>
      <button class="attack-reset-btn" id="attack-reset-btn">Reset Demo</button>
    </div>
  `;
  
  const container = document.getElementById('attack-demo-container');
  if (container) container.appendChild(_panelElement);
  else document.body.appendChild(_panelElement);

  document.getElementById('attack-demo-close')?.addEventListener('click', () => resetAttackDemo());
  document.getElementById('attack-reset-btn')?.addEventListener('click', () => resetAttackDemo());
  document.querySelectorAll('.step-btn').forEach(btn => {
    btn.addEventListener('click', () => attackStep(parseInt(btn.dataset.step, 10)));
  });
}

function closeAttackPanels() {
  if (_panelElement) _panelElement.remove();
  _panelElement = null;
}

async function renderAttackStep(step) {
  const classicalDiv = document.getElementById('classical-content');
  const pqcDiv = document.getElementById('pqc-content');
  if (!classicalDiv || !pqcDiv) return;

  document.querySelectorAll('.step-btn').forEach((btn, i) => {
    btn.classList.remove('active', 'completed');
    if (i+1 === step) btn.classList.add('active');
    else if (i+1 < step) btn.classList.add('completed');
  });

  if (!_selectedMessage) {
    classicalDiv.innerHTML = '<div class="attack-step-status">No intercepted message yet. Wait for Alice to send a message.</div>';
    pqcDiv.innerHTML = '<div class="attack-step-status">No intercepted message yet. Wait for Alice to send a message.</div>';
    return;
  }

  const sharedKeyBytes = getSharedKeyBytes();
  const msg = _selectedMessage;

  switch(step) {
    case 1:
      classicalDiv.innerHTML = `
        <div class="attack-step-card">
          <div class="step-title">🔧 KEY SETUP</div>
          <div class="step-detail">
            <div><strong>Algorithm:</strong> RSA-2048 + AES-256-GCM (static)</div>
            <div><strong>Session Key:</strong> <code>${_classicalKeyBytes ? toHex(_classicalKeyBytes).slice(0,32)+'…' : 'Not initialized'}</code></div>
            <div><strong>Forward Secrecy:</strong> <span class="danger-text">❌ DISABLED</span></div>
            <div class="warning-note">Same key for all messages – once broken, everything is exposed.</div>
          </div>
        </div>`;
      pqcDiv.innerHTML = `
        <div class="attack-step-card">
          <div class="step-title">🔧 KEY SETUP</div>
          <div class="step-detail">
            <div><strong>Algorithm:</strong> ML-KEM-1024 + ratchet + AES-256-GCM</div>
            <div><strong>Session Key:</strong> <code>${sharedKeyBytes ? toHex(sharedKeyBytes).slice(0,32)+'…' : 'Pending'}</code></div>
            <div><strong>Forward Secrecy:</strong> <span class="success-text">✅ ENABLED (Epoch-based)</span></div>
            <div class="success-note">Keys rotate after each message – past keys are deleted.</div>
          </div>
        </div>`;
      break;

    case 2:
      classicalDiv.innerHTML = `
        <div class="attack-step-card">
          <div class="step-title">📨 ENCRYPTED MESSAGE (Classical)</div>
          <div class="step-detail">
            <div><strong>Plaintext:</strong> "${msg.plaintext || '(unknown)'}"</div>
            <div><strong>Ciphertext:</strong> <code>${msg.classicalCiphertext ? msg.classicalCiphertext.slice(0,40)+'…' : 'N/A'}</code></div>
            <div><strong>IV:</strong> <code>${msg.classicalIV || 'N/A'}</code></div>
            <div><strong>HMAC:</strong> <code>${msg.classicalHMAC ? msg.classicalHMAC.slice(0,24)+'…' : 'N/A'}</code></div>
            <div class="warning-note">Static encryption – same key for all messages.</div>
          </div>
        </div>`;
      pqcDiv.innerHTML = `
        <div class="attack-step-card">
          <div class="step-title">📨 ENCRYPTED MESSAGE (Post-Quantum)</div>
          <div class="step-detail">
            <div><strong>Plaintext:</strong> "${msg.plaintext || '(unknown)'}"</div>
            <div><strong>Ciphertext:</strong> <code>${msg.pqcCiphertext.slice(0,40)}…</code></div>
            <div><strong>IV:</strong> <code>${msg.pqcIV}</code></div>
            <div><strong>HMAC:</strong> <code>${msg.pqcHMAC.slice(0,24)}…</code></div>
            <div><strong>Epoch:</strong> ${msg.epoch}</div>
            <div class="success-note">Unique key for this epoch. The key is already deleted if a newer message exists.</div>
          </div>
        </div>`;
      break;

    case 3:
      classicalDiv.innerHTML = `
        <div class="attack-step-card">
          <div class="step-title">📡 HARVESTED CIPHERTEXT (Classical)</div>
          <div class="step-detail">
            <div><strong>Stored:</strong> <code>${msg.classicalCiphertext ? msg.classicalCiphertext.slice(0,48)+'…' : 'N/A'}</code></div>
            <div><strong>Attack Status:</strong> Waiting for quantum computer (2038)</div>
            <div class="warning-note">Vulnerable to Shor's algorithm – RSA private key can be recovered.</div>
          </div>
        </div>`;
      let epochStatus = '';
      if (sharedKeyBytes) {
        try {
          await deriveMessageKey(sharedKeyBytes, msg.epoch);
          epochStatus = '<span class="success-text">✅ Key still derivable (not yet ratcheted away)</span>';
        } catch {
          epochStatus = '<span class="danger-text">⚠️ Key already deleted due to forward secrecy</span>';
        }
      } else {
        epochStatus = '<span class="danger-text">⚠️ No session key available on Eve</span>';
      }
      pqcDiv.innerHTML = `
        <div class="attack-step-card">
          <div class="step-title">📡 HARVESTED CIPHERTEXT (Post-Quantum)</div>
          <div class="step-detail">
            <div><strong>Stored:</strong> <code>${msg.pqcCiphertext.slice(0,48)}…</code></div>
            <div><strong>Epoch:</strong> ${msg.epoch}</div>
            <div>${epochStatus}</div>
            <div class="success-note">No known quantum attack on ML-KEM.</div>
          </div>
        </div>`;
      break;

    case 4:
      let classicalPlain = 'MESSAGE COMPROMISED BY SHOR\'S ALGORITHM';
      if (msg.classicalCiphertext && msg.classicalIV && _classicalKeyBytes) {
        try {
          classicalPlain = await classicalDecrypt(hexToBytes(msg.classicalCiphertext), hexToBytes(msg.classicalIV), _classicalKeyBytes);
        } catch(e) { classicalPlain = '[Decryption error]'; }
      }
      classicalDiv.innerHTML = `
        <div class="attack-step-card attack-broken">
          <div class="step-title">💥 QUANTUM ATTACK (Shor's Algorithm)</div>
          <div class="step-detail">
            <div><strong>Attack:</strong> Factors RSA-2048 modulus → recovers private key</div>
            <div><strong>Recovered AES Key:</strong> <code>${_classicalKeyBytes ? toHex(_classicalKeyBytes).slice(0,32)+'…' : 'N/A'}</code></div>
            <div class="attack-result danger">🔓 DECRYPTED: "${classicalPlain}"</div>
            <div class="warning-note">All past and future messages exposed.</div>
          </div>
        </div>`;
      pqcDiv.innerHTML = `
        <div class="attack-step-card attack-secure">
          <div class="step-title">🛡️ QUANTUM ATTACK (Lattice Problem)</div>
          <div class="step-detail">
            <div><strong>Attack:</strong> No efficient quantum algorithm for MLWE</div>
            <div><strong>Result:</strong> ML-KEM-1024 remains SECURE</div>
            <div class="attack-result success">🔒 Message remains encrypted</div>
            <div class="success-note">Post-quantum secure – no known quantum attack.</div>
          </div>
        </div>`;
      break;

    case 5:
      classicalDiv.innerHTML = `
        <div class="attack-step-card attack-broken">
          <div class="step-title">⚠️ FORWARD SECRECY TEST (Classical)</div>
          <div class="step-detail">
            <div><strong>Key Compromised:</strong> YES</div>
            <div class="past-message exposed">📧 Past message 1: "Initial Setup" – EXPOSED</div>
            <div class="past-message exposed">📧 Past message 2: "${msg.plaintext?.slice(0,30) || 'Unknown'}" – EXPOSED</div>
            <div class="attack-result danger">⚠️ ALL PAST MESSAGES EXPOSED – NO FORWARD SECRECY</div>
          </div>
        </div>`;
      pqcDiv.innerHTML = `
        <div class="attack-step-card attack-secure">
          <div class="step-title">✅ FORWARD SECRECY TEST (Post-Quantum)</div>
          <div class="step-detail">
            <div><strong>Key Compromised:</strong> NO (ratchet prevents key reuse)</div>
            <div class="past-message protected">📧 Past message 1: [KEY DELETED] – PROTECTED</div>
            <div class="past-message protected">📧 Past message 2: [KEY DELETED] – PROTECTED</div>
            <div class="attack-result success">✅ PAST MESSAGES PROTECTED – FORWARD SECRECY ACTIVE</div>
          </div>
        </div>`;
      break;
  }
}
