import { hexToBytes } from '../crypto.js';
import { deriveMessageKey, getSharedKeyBytes } from '../session.js';

let _state = null;
let _harvestedMessage = null;
let _rsaOaepKeyPair = null;
let _classicalPlaintext = 'CLASSIFIED GOVERNMENT TRANSMISSION — EYES ONLY';

export function initDemo2(state, broadcast) {
  _state = state;
  // All roles generate an RSA-OAEP key pair for the classical decrypt demo
  crypto.subtle.generateKey(
    { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true, ['encrypt', 'decrypt'],
  ).then(kp => { _rsaOaepKeyPair = kp; }).catch(() => {});
}

// Called by eve-console when a message is intercepted
export function setHarvestedMessage(msg) {
  _harvestedMessage = msg;
}

// Eve console calls this
export function launchTimeskip(broadcast) {
  broadcast('demo2_timeskip', {});
}

export async function handleDemo2Control(message, state, broadcast) {
  const { action, payload } = message;

  if (action === 'demo2_timeskip') {
    // Server attaches harvestedMessage in payload; use it if we don't have one locally
    if (payload?.harvestedMessage && !_harvestedMessage) {
      _harvestedMessage = payload.harvestedMessage;
    }
    await runTimeskipAnimation();
    return;
  }
}

// ── Timeskip animation — all screens ─────────────────────────────────────────

async function runTimeskipAnimation() {
  const overlay = getOrCreateTimeskipOverlay();
  const yearEl = document.getElementById('demo2-year');
  const barFill = document.getElementById('demo2-bar-fill');
  const labelEl = document.getElementById('demo2-ts-label');

  // Reset
  if (yearEl) yearEl.textContent = '2026';
  if (barFill) barFill.style.transition = 'none';
  if (barFill) barFill.style.width = '0%';
  if (labelEl) labelEl.textContent = 'FAST FORWARDING…';

  overlay.classList.add('visible');
  await wait(120); // allow paint

  // Animate year 2026 → 2038
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

  // Show the split-screen result
  await showDecryptResult();
}

async function showDecryptResult() {
  // Classical side: RSA — we have the key pair so decryption "succeeds" (simulating Shor's recovery)
  let classicalPlaintext = _classicalPlaintext;
  let classicalSuccess = true;

  // PQC side: try AES-GCM with wrong epoch key → must fail
  let pqcCipherPreview = '(no message intercepted yet)';
  let pqcFailed = true;

  if (_harvestedMessage) {
    pqcCipherPreview = (_harvestedMessage.ciphertext || '').slice(0, 64) + '…';
    const sharedKeyBytes = getSharedKeyBytes();
    if (sharedKeyBytes) {
      try {
        // Use a deliberately wrong epoch so decryption throws
        const wrongEpoch = Number(_harvestedMessage.epoch || 1) + 9999;
        const { keyBytes } = await deriveMessageKey(sharedKeyBytes, wrongEpoch);
        const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']);
        await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: hexToBytes(_harvestedMessage.iv) },
          key,
          hexToBytes(_harvestedMessage.ciphertext),
        );
        // Should never reach here
        pqcFailed = false;
      } catch {
        pqcFailed = true; // expected
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
