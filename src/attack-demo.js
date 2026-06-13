/**
 * Attack Demo Controller - Simplified version
 */

import { classicalEncrypt, classicalDecrypt, generateClassicalSessionKey, getClassicalSessionKey, setClassicalSessionKey } from './classical-crypto.js';
import { encryptMessage, hexToBytes, toHex, signHmac } from './crypto.js';
import { deriveMessageKey, getSharedKeyBytes } from './session.js';

let _state = null;
let _broadcast = null;
let _attackActive = false;
let _currentStep = 0;
let _selectedMessage = null;
let _selectedMessageIndex = -1;
let _recentMessages = [];

// Classical system state
let _classicalSessionKeyHex = null;
let _classicalKeyBytes = null;

// Current attack data
let _currentPlaintext = 'Test message for attack demonstration';
let _classicalCiphertext = null;
let _classicalIV = null;
let _pqcCiphertext = null;
let _pqcIV = null;
let _pqcEpoch = 1;

// Panel elements
let _panelElement = null;
let _classicalContentEl = null;
let _pqcContentEl = null;

export function initAttackDemo(state, broadcast) {
  _state = state;
  _broadcast = broadcast;
  
  // Generate classical session key
  if (!getClassicalSessionKey()) {
    const { keyHex, keyBytes } = generateClassicalSessionKey();
    _classicalSessionKeyHex = keyHex;
    _classicalKeyBytes = keyBytes;
    setClassicalSessionKey(keyHex);
  } else {
    _classicalSessionKeyHex = getClassicalSessionKey();
    _classicalKeyBytes = hexToBytes(_classicalSessionKeyHex);
  }
}

export function addInterceptedMessage(message) {
  _recentMessages.push(message);
  if (_recentMessages.length > 10) _recentMessages.shift();
  
  if (!_selectedMessage) {
    _selectedMessage = message;
    _selectedMessageIndex = _recentMessages.length - 1;
  }
}

export function selectMessageForAttack(index) {
  if (_recentMessages[index]) {
    _selectedMessage = _recentMessages[index];
    _selectedMessageIndex = index;
    console.log(`Selected message Epoch ${_selectedMessage.epoch} for attack`);
    return true;
  }
  return false;
}

export function startAttackDemo() {
  if (_attackActive) {
    closeAttackPanels();
  }
  
  _attackActive = true;
  _currentStep = 0;
  
  renderAttackPanels();
  console.log('Attack demo started');
}

export function resetAttackDemo() {
  _attackActive = false;
  _currentStep = 0;
  _classicalCiphertext = null;
  _pqcCiphertext = null;
  
  closeAttackPanels();
  console.log('Attack demo reset');
}

export async function attackStep(step) {
  if (!_attackActive) {
    startAttackDemo();
    return;
  }
  
  _currentStep = step;
  updateStepIndicator(step);
  
  switch(step) {
    case 1:
      await executeStep1();
      break;
    case 2:
      await executeStep2();
      break;
    case 3:
      await executeStep3();
      break;
    case 4:
      await executeStep4();
      break;
    case 5:
      await executeStep5();
      break;
  }
}

function renderAttackPanels() {
  closeAttackPanels();
  
  _panelElement = document.createElement('div');
  _panelElement.id = 'attack-demo-panel';
  _panelElement.className = 'attack-demo-panel';
  _panelElement.style.display = 'grid';
  
  _panelElement.innerHTML = `
    <div class="attack-demo-header">
      <h3>⚔️ QUANTUM ATTACK SIMULATION</h3>
      <button class="attack-demo-close" id="attack-demo-close">×</button>
    </div>
    <div class="attack-demo-two-column">
      <div class="attack-demo-classical">
        <div class="attack-demo-title">
          <span>🏛️ CLASSICAL SYSTEM</span>
          <span class="badge-danger">RSA-2048 + AES (STATIC)</span>
        </div>
        <div class="attack-demo-content" id="attack-classical-content">
          <div class="attack-step-status">Click Step 1 to begin</div>
        </div>
      </div>
      <div class="attack-demo-pqc">
        <div class="attack-demo-title">
          <span>🔮 POST-QUANTUM SYSTEM</span>
          <span class="badge-success">ML-KEM-1024 + RATCHET</span>
        </div>
        <div class="attack-demo-content" id="attack-pqc-content">
          <div class="attack-step-status">Click Step 1 to begin</div>
        </div>
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
  
  document.body.appendChild(_panelElement);
  
  _classicalContentEl = document.getElementById('attack-classical-content');
  _pqcContentEl = document.getElementById('attack-pqc-content');
  
  document.getElementById('attack-demo-close')?.addEventListener('click', () => resetAttackDemo());
  document.getElementById('attack-reset-btn')?.addEventListener('click', () => resetAttackDemo());
  
  document.querySelectorAll('.step-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const step = parseInt(btn.dataset.step, 10);
      attackStep(step);
    });
  });
  
  updateStepIndicator(0);
}

function closeAttackPanels() {
  if (_panelElement) {
    _panelElement.remove();
    _panelElement = null;
  }
}

function updateStepIndicator(step) {
  document.querySelectorAll('.step-btn').forEach((btn, i) => {
    btn.classList.remove('active', 'completed');
    if (i + 1 === step) btn.classList.add('active');
    else if (i + 1 < step) btn.classList.add('completed');
  });
}

async function executeStep1() {
  const sharedKeyBytes = getSharedKeyBytes();
  
  if (_classicalContentEl) {
    _classicalContentEl.innerHTML = `
      <div class="attack-step-card">
        <div class="step-title">🔧 KEY SETUP</div>
        <div class="step-detail">
          <div><strong>Algorithm:</strong> RSA-2048 + AES-256-GCM</div>
          <div><strong>Session Key:</strong> <code>${_classicalSessionKeyHex?.slice(0, 32) || 'N/A'}…</code></div>
          <div><strong>Forward Secrecy:</strong> <span class="danger-text">❌ DISABLED</span></div>
          <div class="warning-note">⚠️ Static key - Same key for ALL messages</div>
        </div>
      </div>
    `;
  }
  
  if (_pqcContentEl) {
    _pqcContentEl.innerHTML = `
      <div class="attack-step-card">
        <div class="step-title">🔧 KEY SETUP</div>
        <div class="step-detail">
          <div><strong>Algorithm:</strong> ML-KEM-1024 + AES-256-GCM</div>
          <div><strong>Session Key:</strong> <code>${sharedKeyBytes ? toHex(sharedKeyBytes).slice(0, 32) : 'Pending'}…</code></div>
          <div><strong>Forward Secrecy:</strong> <span class="success-text">✅ ENABLED (Epoch-based)</span></div>
          <div class="success-note">✨ Keys rotate after each message</div>
        </div>
      </div>
    `;
  }
}

async function executeStep2() {
  const plaintext = _selectedMessage?.ciphertext 
    ? `[Intercepted Msg Epoch ${_selectedMessage.epoch}]`
    : 'TOP SECRET MESSAGE';
  
  _currentPlaintext = plaintext;
  
  // Classical encryption
  try {
    const { iv, encrypted } = await classicalEncrypt(plaintext, _classicalKeyBytes);
    _classicalCiphertext = encrypted;
    _classicalIV = iv;
    
    if (_classicalContentEl) {
      _classicalContentEl.innerHTML = `
        <div class="attack-step-card">
          <div class="step-title">📨 ENCRYPTED MESSAGE</div>
          <div class="step-detail">
            <div><strong>Plaintext:</strong> "${plaintext}"</div>
            <div><strong>Ciphertext:</strong> <code>${toHex(encrypted).slice(0, 40)}…</code></div>
            <div><strong>IV:</strong> <code>${toHex(iv).slice(0, 16)}…</code></div>
            <div class="warning-note">⚠️ Static encryption - Same key for all messages</div>
          </div>
        </div>
      `;
    }
  } catch (e) {
    console.error('Classical encrypt error:', e);
  }
  
  // PQC encryption
  const sharedKeyBytes = getSharedKeyBytes();
  if (sharedKeyBytes && _pqcContentEl) {
    try {
      const epoch = _selectedMessage?.epoch || 1;
      const { keyBytes } = await deriveMessageKey(sharedKeyBytes, epoch);
      const { iv, encrypted } = await encryptMessage(plaintext, keyBytes);
      _pqcCiphertext = encrypted;
      _pqcIV = iv;
      _pqcEpoch = epoch;
      
      _pqcContentEl.innerHTML = `
        <div class="attack-step-card">
          <div class="step-title">📨 ENCRYPTED MESSAGE</div>
          <div class="step-detail">
            <div><strong>Plaintext:</strong> "${plaintext}"</div>
            <div><strong>Ciphertext:</strong> <code>${toHex(encrypted).slice(0, 40)}…</code></div>
            <div><strong>IV:</strong> <code>${toHex(iv).slice(0, 16)}…</code></div>
            <div class="success-note">✨ Unique key for Epoch ${epoch}</div>
          </div>
        </div>
      `;
    } catch (e) {
      console.error('PQC encrypt error:', e);
    }
  }
}

async function executeStep3() {
  if (_classicalContentEl) {
    _classicalContentEl.innerHTML = `
      <div class="attack-step-card">
        <div class="step-title">📡 HARVESTED CIPHERTEXT</div>
        <div class="step-detail">
          <div><strong>Stored:</strong> <code>${_classicalCiphertext ? toHex(_classicalCiphertext).slice(0, 48) + '…' : 'N/A'}</code></div>
          <div><strong>Attack Status:</strong> Waiting for quantum computer (2038)</div>
          <div class="warning-note">⚠️ Vulnerable to Shor's algorithm</div>
        </div>
      </div>
    `;
  }
  
  if (_pqcContentEl) {
    _pqcContentEl.innerHTML = `
      <div class="attack-step-card">
        <div class="step-title">📡 HARVESTED CIPHERTEXT</div>
        <div class="step-detail">
          <div><strong>Stored:</strong> <code>${_pqcCiphertext ? toHex(_pqcCiphertext).slice(0, 48) + '…' : 'N/A'}</code></div>
          <div><strong>Attack Status:</strong> Key already deleted (forward secrecy)</div>
          <div class="success-note">✅ No quantum attack known for ML-KEM</div>
        </div>
      </div>
    `;
  }
}

async function executeStep4() {
  let classicalDecrypted = 'MESSAGE COMPROMISED BY SHOR\'S ALGORITHM';
  try {
    if (_classicalCiphertext && _classicalIV) {
      classicalDecrypted = await classicalDecrypt(_classicalCiphertext, _classicalIV, _classicalKeyBytes);
    }
  } catch(e) {}
  
  if (_classicalContentEl) {
    _classicalContentEl.innerHTML = `
      <div class="attack-step-card attack-broken">
        <div class="step-title">💥 QUANTUM ATTACK - SHOR'S ALGORITHM</div>
        <div class="step-detail">
          <div><strong>Attack:</strong> Factors RSA-2048 modulus</div>
          <div><strong>Private Key:</strong> <code>d = 0x3f8e2d1c9a7b4e5f…</code></div>
          <div class="attack-result danger">🔓 DECRYPTED: "${classicalDecrypted}"</div>
          <div class="warning-note">⚠️ ALL MESSAGES COMPROMISED</div>
        </div>
      </div>
    `;
  }
  
  if (_pqcContentEl) {
    _pqcContentEl.innerHTML = `
      <div class="attack-step-card attack-secure">
        <div class="step-title">🛡️ QUANTUM ATTACK - LATTICE PROBLEM</div>
        <div class="step-detail">
          <div><strong>Attack:</strong> No efficient quantum algorithm</div>
          <div><strong>Result:</strong> <span class="success-text">ML-KEM-1024 remains SECURE</span></div>
          <div class="attack-result success">🔒 MESSAGE REMAINS ENCRYPTED</div>
          <div class="success-note">✅ Post-quantum secure</div>
        </div>
      </div>
    `;
  }
}

async function executeStep5() {
  if (_classicalContentEl) {
    _classicalContentEl.innerHTML = `
      <div class="attack-step-card attack-broken">
        <div class="step-title">⚠️ FORWARD SECRECY TEST</div>
        <div class="step-detail">
          <div><strong>Key Compromised:</strong> <span class="danger-text">YES</span></div>
          <div class="past-message exposed">📧 Past Message 1: "Initial Setup" - EXPOSED</div>
          <div class="past-message exposed">📧 Past Message 2: "${_currentPlaintext.slice(0, 30)}" - EXPOSED</div>
          <div class="attack-result danger">⚠️ ALL PAST MESSAGES EXPOSED</div>
        </div>
      </div>
    `;
  }
  
  if (_pqcContentEl) {
    _pqcContentEl.innerHTML = `
      <div class="attack-step-card attack-secure">
        <div class="step-title">✅ FORWARD SECRECY TEST</div>
        <div class="step-detail">
          <div><strong>Key Compromised:</strong> <span class="success-text">NO</span></div>
          <div class="past-message protected">📧 Past Message 1: [KEY DELETED] - PROTECTED</div>
          <div class="past-message protected">📧 Past Message 2: [KEY DELETED] - PROTECTED</div>
          <div class="attack-result success">✅ PAST MESSAGES PROTECTED</div>
        </div>
      </div>
    `;
  }
}
