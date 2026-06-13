// src/demos/demo2.js
// Harvest Now, Decrypt Later — Server‑side RSA decryption + PQC forward secrecy failure
// Client only: harvest storage, timeskip animation, result display.

let _broadcast = null;
let _harvested = null;           // { ciphertext, iv, epoch, hmac, plaintext, harvestedAt }

export function initDemo2(state, broadcast) {
  _broadcast = broadcast;
}

// Called when app receives a demo_control message with action 'demo2_*'
export async function handleDemo2Control(message, state, broadcast) {
  const { action, payload } = message;

  if (action === 'demo2_harvest') {
    // Store harvested message (sent from Alice via server)
    if (payload?.harvested) {
      _harvested = payload.harvested;
      // Show local notification
      const banner = document.createElement('div');
      banner.className = 'harvest-banner';
      banner.innerHTML = `📡 MESSAGE HARVESTED — STORED FOR FUTURE DECRYPTION (Epoch ${_harvested.epoch})`;
      document.body.appendChild(banner);
      setTimeout(() => banner.remove(), 3000);
    }
    return;
  }

  if (action === 'demo2_timeskip') {
    await runTimeskipAnimation(state, broadcast);
    return;
  }

  if (action === 'demo2_decrypt_result') {
    // Server broadcasts the decryption result
    displaySplitResult(payload);
    return;
  }
}

// Timeskip animation (2.5s, 2026 → 2038)
async function runTimeskipAnimation(state, broadcast) {
  const overlay = getOrCreateTimeskipOverlay();
  const yearEl = document.getElementById('demo2-year');
  const barFill = document.getElementById('demo2-bar-fill');
  const labelEl = document.getElementById('demo2-ts-label');

  if (yearEl) yearEl.textContent = '2026';
  if (barFill) {
    barFill.style.transition = 'none';
    barFill.style.width = '0%';
  }
  if (labelEl) labelEl.textContent = '⏩ FAST FORWARDING…';

  overlay.classList.add('visible');
  await wait(120);

  const startYear = 2026, endYear = 2038, duration = 2500;
  const startTime = performance.now();
  await new Promise((resolve) => {
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

  if (labelEl) labelEl.textContent = '🧠 QUANTUM COMPUTER ACQUIRED';
  await wait(800);
  overlay.classList.remove('visible');
  await wait(200);

  // Request decryption from server (includes both RSA and PQC paths)
  if (_harvested) {
    broadcast('demo2_decrypt_request', {
      harvested: _harvested,
    });
  } else {
    // No harvested message – show error
    displaySplitResult({
      classical: 'failed',
      classicalPlaintext: '(no message harvested)',
      pqc: 'failed',
      pqcMessage: 'NO HARVESTED MESSAGE',
    });
  }
}

// Display side‑by‑side result overlay
function displaySplitResult(result) {
  let overlay = document.getElementById('demo2-result');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'demo2-result';
    overlay.className = 'harvest-result-overlay';
    document.body.appendChild(overlay);
  }

  const classicalSuccess = result.classical === 'decrypted';
  const classicalPlaintext = result.classicalPlaintext || '(decryption failed)';
  const pqcMessage = result.pqcMessage || 'STILL ENCRYPTED — KEY DELETED';

  overlay.innerHTML = `
    <button class="harvest-close" id="demo2-close">×</button>
    <div class="harvest-split">
      <div class="harvest-card classical">
        <div class="harvest-card-header">
          <strong>🔓 RSA‑2048 MESSAGE</strong>
          <span class="status-badge ${classicalSuccess ? 'success' : 'danger'}">${classicalSuccess ? 'DECRYPTED' : 'FAILED'}</span>
        </div>
        <div class="harvest-card-label">⚛️ SHOR'S ALGORITHM</div>
        <div class="harvest-card-value" style="margin-bottom:10px">RSA private key recovered from public modulus</div>
        <div class="harvest-card-label">📄 PLAINTEXT</div>
        <div class="harvest-card-value revealed">${escapeHtml(classicalPlaintext)}</div>
        <div style="margin-top:10px;padding:8px;background:rgba(255,102,110,.06);border:1px solid rgba(255,102,110,.2);border-radius:3px">
          <div style="color:#ff666e;font:7px var(--mono);letter-spacing:.8px">⚠ MESSAGE RECOVERED BY QUANTUM ATTACKER</div>
        </div>
      </div>
      <div class="harvest-card pqc">
        <div class="harvest-card-header">
          <strong>🛡️ ML‑KEM‑1024 + AES‑256‑GCM</strong>
          <span class="status-badge success">PROTECTED</span>
        </div>
        <div class="harvest-card-label">🧬 FORWARD SECRECY</div>
        <div class="harvest-card-value" style="margin-bottom:10px">No efficient quantum attack · Ratchet advanced</div>
        <div class="harvest-card-label">🔐 INTERCEPTED CIPHERTEXT</div>
        <div class="harvest-card-value blocked">${escapeHtml(pqcMessage)}</div>
        <div style="margin-top:10px;padding:8px;background:rgba(41,232,199,.04);border:1px solid rgba(41,232,199,.2);border-radius:3px">
          <div style="color:#29e8c7;font:7px var(--mono);letter-spacing:.8px">✓ EPOCH KEY DELETED · DECRYPTION IMPOSSIBLE</div>
        </div>
      </div>
    </div>`;

  const closeBtn = document.getElementById('demo2-close');
  if (closeBtn) closeBtn.addEventListener('click', () => overlay.classList.remove('visible'));
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.remove('visible');
  });
  overlay.classList.add('visible');
}

// Helper: create or get timeskip overlay DOM element
function getOrCreateTimeskipOverlay() {
  let el = document.getElementById('demo2-timeskip');
  if (!el) {
    el = document.createElement('div');
    el.id = 'demo2-timeskip';
    el.className = 'timeskip-overlay';
    el.innerHTML = `
      <div class="timeskip-year" id="demo2-year">2026</div>
      <div class="timeskip-label" id="demo2-ts-label">⏩ FAST FORWARDING…</div>
      <div class="timeskip-bar"><div class="timeskip-bar-fill" id="demo2-bar-fill"></div></div>`;
    document.body.appendChild(el);
  }
  return el;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
