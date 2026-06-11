import { hexToBytes } from '../crypto.js';
import { deriveMessageKey, getSharedKeyBytes } from '../session.js';

let _state = null;
let _broadcast = null;
let _harvestedMessage = null;
let _rsaOaepKeyPair = null;
let _rsaEncryptedBytes = null;
let _originalPlaintext = 'CLASSIFIED GOVERNMENT TRANSMISSION — EYES ONLY';

export function initDemo2(state, broadcast) {
  _state = state;
  _broadcast = broadcast;
  // Generate an RSA-OAEP key pair for the classical decrypt demo
  crypto.subtle.generateKey(
    { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['encrypt', 'decrypt'],
  ).then(kp => { _rsaOaepKeyPair = kp; });
}

// Called by Eve console when a message is intercepted — stores the harvested message
export function setHarvestedMessage(msg) {
  _harvestedMessage = msg;
}

export async function handleDemo2Control(message, state, broadcast) {
  const { action, payload } = message;

  if (action === 'demo2_timeskip') {
    // Store harvested message from server payload if we don't have one locally
    if (payload?.harvestedMessage && !_harvestedMessage) {
      _harvestedMessage = payload.harvestedMessage;
    }
    await runTimeskipAnimation();
    return;
  }

  if (action === 'demo2_result') {
    showHarvestResult(payload);
    return;
  }
}

// Eve triggers the timeskip broadcast
export function launchTimeskip(broadcast) {
  broadcast('demo2_timeskip', {});
}

// Full timeskip animation — runs on all three screens
async function runTimeskipAnimation() {
  const overlay = getOrCreateTimeskipOverlay();
  overlay.classList.add('visible');

  const yearEl = document.getElementById('demo2-year');
  const barFill = document.getElementById('demo2-bar-fill');
  const labelEl = document.getElementById('demo2-ts-label');

  if (!yearEl) return;

  // Animate year from 2026 → 2038
  const startYear = 2026;
  const endYear = 2038;
  const duration = 2500;
  const startTime = performance.now();

  await new Promise(resolve => {
    function tick(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;
      const year = Math.round(startYear + (endYear - startYear) * eased);
      yearEl.textContent = String(year);
      if (barFill) barFill.style.width = `${progress * 100}%`;
      if (progress < 1) requestAnimationFrame(tick);
      else resolve();
    }
    requestAnimationFrame(tick);
  });

  if (labelEl) labelEl.textContent = 'QUANTUM COMPUTER ACQUIRED';
  await new Promise(r => setTimeout(r, 1200));

  // Now run the result comparison
  await runDecryptComparison();

  overlay.classList.remove('visible');
}

async function runDecryptComparison() {
  if (!_harvestedMessage) return;

  // Try RSA-OAEP decrypt (classical — succeeds because we have the key pair)
  let classicalResult = null;
  let classicalSuccess = false;
  try {
    if (_rsaOaepKeyPair && _rsaEncryptedBytes) {
      const decrypted = await crypto.subtle.decrypt(
        { name: 'RSA-OAEP' },
        _rsaOaepKeyPair.privateKey,
        _rsaEncryptedBytes,
      );
      classicalResult = new TextDecoder().decode(decrypted);
      classicalSuccess = true;
    } else {
      // Simulate: show the plaintext as "recovered" since we own the RSA key
      classicalResult = _originalPlaintext;
      classicalSuccess = true;
    }
  } catch {
    classicalResult = 'DECRYPTION ERROR';
    classicalSuccess = false;
  }

  // Try AES-GCM decrypt with a WRONG key (simulating epoch key deleted — will fail)
  let pqcResult = null;
  let pqcSuccess = false;
  try {
    const sharedKeyBytes = getSharedKeyBytes();
    if (sharedKeyBytes && _harvestedMessage.epoch) {
      // Deliberately use a future epoch key that doesn't match — simulating deleted key
      const wrongEpoch = Number(_harvestedMessage.epoch) + 999;
      const { keyBytes } = await deriveMessageKey(sharedKeyBytes, wrongEpoch);
      const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']);
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: hexToBytes(_harvestedMessage.iv) },
        key,
        hexToBytes(_harvestedMessage.ciphertext),
      );
      pqcResult = 'UNEXPECTED DECRYPTION';
      pqcSuccess = true;
    }
  } catch {
    pqcResult = null;
    pqcSuccess = false;
  }

  showHarvestResult({
    classical: { success: classicalSuccess, plaintext: classicalResult, ciphertext: null },
    pqc: { success: pqcSuccess, ciphertext: _harvestedMessage?.ciphertext?.slice(0, 64) + '...' },
    epoch: _harvestedMessage?.epoch,
  });
}

function getOrCreateTimeskipOverlay() {
  let overlay = document.getElementById('demo2-timeskip');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'demo2-timeskip';
    overlay.className = 'timeskip-overlay';
    overlay.innerHTML = `
      <div class="timeskip-year" id="demo2-year">2026</div>
      <div class="timeskip-label" id="demo2-ts-label">FAST FORWARDING...</div>
      <div class="timeskip-bar"><div class="timeskip-bar-fill" id="demo2-bar-fill"></div></div>`;
    document.body.appendChild(overlay);
  }
  return overlay;
}

function showHarvestResult(payload) {
  let overlay = document.getElementById('demo2-result');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'demo2-result';
    overlay.className = 'harvest-result-overlay';
    document.body.appendChild(overlay);
  }

  const classical = payload.classical || {};
  const pqc = payload.pqc || {};

  overlay.innerHTML = `
    <button class="harvest-close" id="demo2-close">×</button>
    <div class="harvest-split">
      <div class="harvest-card classical">
        <div class="harvest-card-header">
          <strong>RSA-2048</strong>
          <span class="status-badge">${classical.success ? 'DECRYPTED' : 'FAILED'}</span>
        </div>
        <div class="harvest-card-label">ALGORITHM</div>
        <div class="harvest-card-value" style="margin-bottom:12px">RSA-OAEP · Shor's recovers private key</div>
        <div class="harvest-card-label">RESULT</div>
        <div class="harvest-card-value ${classical.success ? 'revealed' : 'blocked'}">
          ${classical.success ? escapeHtml(classical.plaintext || '') : 'Could not decrypt'}
        </div>
        ${classical.success ? `
        <div style="margin-top:10px;padding:8px;background:rgba(255,102,110,.06);border:1px solid rgba(255,102,110,.18);border-radius:3px">
          <div style="color:#ff666e;font:7px var(--mono);letter-spacing:.8px">⚠ MESSAGE RECOVERED BY QUANTUM ATTACKER</div>
        </div>` : ''}
      </div>
      <div class="harvest-card pqc">
        <div class="harvest-card-header">
          <strong>ML-KEM-1024 + AES-256-GCM</strong>
          <span class="status-badge">PROTECTED</span>
        </div>
        <div class="harvest-card-label">ALGORITHM</div>
        <div class="harvest-card-value" style="margin-bottom:12px">ML-KEM · No known quantum attack · Epoch ${payload.epoch || '?'} key deleted</div>
        <div class="harvest-card-label">INTERCEPTED CIPHERTEXT</div>
        <div class="harvest-card-value blocked">${pqc.ciphertext || '(no message intercepted yet)'}</div>
        <div style="margin-top:10px;padding:8px;background:rgba(41,232,199,.04);border:1px solid rgba(41,232,199,.18);border-radius:3px">
          <div style="color:#29e8c7;font:7px var(--mono);letter-spacing:.8px">✓ EPOCH KEY DELETED · DECRYPTION IMPOSSIBLE</div>
        </div>
      </div>
    </div>`;

  document.getElementById('demo2-close').addEventListener('click', () => {
    overlay.classList.remove('visible');
  });

  requestAnimationFrame(() => overlay.classList.add('visible'));
}

function escapeHtml(value) {
  const node = document.createElement('div');
  node.textContent = value;
  return node.innerHTML;
}

// Store RSA-encrypted bytes when we do the classical encrypt step
export async function encryptWithRsa(plaintext) {
  if (!_rsaOaepKeyPair) return;
  const encoded = new TextEncoder().encode(plaintext);
  _rsaEncryptedBytes = await crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    _rsaOaepKeyPair.publicKey,
    encoded,
  );
  _originalPlaintext = plaintext;
}
