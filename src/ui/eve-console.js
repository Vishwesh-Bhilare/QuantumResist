import { launchDemo1Step } from '../demos/demo1.js';
import { launchTimeskip, setHarvestedMessage } from '../demos/demo2.js';
import { launchStealKey, launchRatchetSync } from '../demos/demo3.js';
import { launchDemo5, launchDemo5Phase, closeDemo5 } from '../demos/demo5.js';

let _state = null;
let _broadcast = null;
let _interceptCount = 0;
let _demo5Phase = 0;

export function initEveConsole(mountEl, state, broadcast) {
  _state = state;
  _broadcast = broadcast;
  if (!mountEl) return;

  mountEl.innerHTML = `
    <section class="eve-layout">
      <article class="eve-log-panel">
        <div class="eve-log-header">
          <div>
            <span class="panel-kicker">PASSIVE INTERCEPT</span>
            <h2 style="margin:4px 0 0;font-size:14px;font-weight:600">Eve — Ciphertext Monitor</h2>
          </div>
          <div style="display:flex;align-items:center;gap:14px">
            <span style="font:8px var(--mono);color:#4a6165">ROLE: <span style="color:#ff666e">EVE (ATTACKER)</span></span>
            <div class="connected" style="color:#ff666e">
              <i style="background:#ff666e;box-shadow:0 0 8px #ff666e"></i> NO SHARED KEY
            </div>
          </div>
        </div>
        <div style="padding:10px 12px;display:grid;grid-template-columns:repeat(3,1fr);gap:8px;border-bottom:1px solid var(--line-soft)">
          <div class="eve-stat"><div class="eve-stat-value zero" id="eve-intercepted">0</div><div class="eve-stat-label">INTERCEPTED</div></div>
          <div class="eve-stat"><div class="eve-stat-value danger" id="eve-decrypted">0</div><div class="eve-stat-label">DECRYPTED</div></div>
          <div class="eve-stat"><div class="eve-stat-value" id="eve-epoch" style="font-size:16px">—</div><div class="eve-stat-label">LAST EPOCH</div></div>
        </div>
        <div class="eve-log" id="eveLog" aria-live="polite"></div>
      </article>

      <aside class="eve-sidebar">
        <div class="demo-control-panel">
          <div class="demo-control-header">
            <span>DEMO CONTROL</span>
            <span class="phase-badge" id="eve-phase-badge">READY</span>
          </div>

          <div class="demo-section">
            <div class="demo-section-title">Demo 1 · RSA vs Post-Quantum</div>
            <button class="demo-btn" id="btn-d1-rsa"><span class="btn-dot"></span>Step 1 — Show RSA setup</button>
            <button class="demo-btn" id="btn-d1-attack" disabled><span class="btn-dot"></span>Step 2 — Quantum attack RSA</button>
            <button class="demo-btn" id="btn-d1-kyber" disabled><span class="btn-dot"></span>Step 3 — Switch to ML-KEM</button>
          </div>

          <div class="demo-section">
            <div class="demo-section-title">Demo 2 · Harvest Now, Decrypt Later</div>
            <button class="demo-btn" id="btn-d2-timeskip" disabled><span class="btn-dot"></span>Fast-forward to 2038</button>
          </div>

          <div class="demo-section">
            <div class="demo-section-title">Demo 3 · Key Ratchet</div>
            <button class="demo-btn" id="btn-d3-sync"><span class="btn-dot"></span>Sync ratchet view</button>
            <button class="demo-btn danger" id="btn-d3-steal" disabled><span class="btn-dot"></span>Steal current key</button>
          </div>

          <div class="demo-section">
            <div class="demo-section-title">Demo 5 · Resistance Meter</div>
            <button class="demo-btn" id="btn-d5-open"><span class="btn-dot"></span>Open meter (all screens)</button>
            <button class="demo-btn" id="btn-d5-phase" disabled><span class="btn-dot"></span>Advance phase (0→3)</button>
            <button class="demo-btn danger" id="btn-d5-close" disabled><span class="btn-dot"></span>Close meter</button>
          </div>
        </div>

        <div class="attack-posture">
          <h3>ATTACK STATUS</h3>
          <div class="posture-row"><span>AES-GCM KEY</span><strong class="fail">UNKNOWN</strong></div>
          <div class="posture-row"><span>HMAC KEY</span><strong class="fail">UNKNOWN</strong></div>
          <div class="posture-row"><span>BRUTE FORCE</span><strong class="pass">FAILED</strong></div>
          <div class="posture-row"><span>FORWARD SECRECY</span><strong class="pass">ACTIVE</strong></div>
          <div class="posture-row"><span>PLAINTEXT BYTES</span><strong class="fail">0</strong></div>
        </div>
      </aside>
    </section>`;

  bindEveButtons(state, broadcast);
  document.addEventListener('eve:intercept', e => handleIntercept(e.detail));
}

function enableBtn(id) { const b = document.getElementById(id); if (b) b.disabled = false; }
function disableBtn(id) { const b = document.getElementById(id); if (b) b.disabled = true; }
function setPhase(label) { const el = document.getElementById('eve-phase-badge'); if (el) el.textContent = label; }

function bindEveButtons(state, broadcast) {
  document.getElementById('btn-d1-rsa')?.addEventListener('click', async () => {
    await launchDemo1Step('rsa_classical', broadcast);
    setPhase('Demo 1 — Step 1');
    enableBtn('btn-d1-attack');
  });
  document.getElementById('btn-d1-attack')?.addEventListener('click', async () => {
    await launchDemo1Step('quantum_attack', broadcast);
    setPhase('Demo 1 — Step 2');
    enableBtn('btn-d1-kyber');
  });
  document.getElementById('btn-d1-kyber')?.addEventListener('click', async () => {
    await launchDemo1Step('kyber_switch', broadcast);
    setPhase('Demo 1 — Complete');
  });

  document.getElementById('btn-d2-timeskip')?.addEventListener('click', () => {
    launchTimeskip(broadcast);
    setPhase('Demo 2 — Timeskip');
  });

  document.getElementById('btn-d3-sync')?.addEventListener('click', async () => {
    await launchRatchetSync(broadcast, state);
    setPhase('Demo 3 — Ratchet sync');
    enableBtn('btn-d3-steal');
  });
  document.getElementById('btn-d3-steal')?.addEventListener('click', async () => {
    await launchStealKey(broadcast, state);
    setPhase('Demo 3 — Key stolen');
  });

  document.getElementById('btn-d5-open')?.addEventListener('click', () => {
    _demo5Phase = 0;
    launchDemo5(broadcast);
    setPhase('Demo 5 — Open');
    enableBtn('btn-d5-phase');
    enableBtn('btn-d5-close');
  });
  document.getElementById('btn-d5-phase')?.addEventListener('click', () => {
    _demo5Phase = Math.min(_demo5Phase + 1, 3);
    launchDemo5Phase(broadcast);
    setPhase(`Demo 5 — Phase ${_demo5Phase}/3`);
    if (_demo5Phase >= 3) disableBtn('btn-d5-phase');
  });
  document.getElementById('btn-d5-close')?.addEventListener('click', () => {
    closeDemo5(broadcast);
    _demo5Phase = 0;
    setPhase('READY');
    disableBtn('btn-d5-phase');
    disableBtn('btn-d5-close');
  });
}

async function handleIntercept(message) {
  _interceptCount++;
  setHarvestedMessage(message);

  // Update stats
  const intEl = document.getElementById('eve-intercepted');
  const epochEl = document.getElementById('eve-epoch');
  if (intEl) intEl.textContent = String(_interceptCount);
  if (epochEl) epochEl.textContent = String(message.epoch ?? '?');

  // Enable gated buttons
  enableBtn('btn-d2-timeskip');
  enableBtn('btn-d3-steal');

  // Log to terminal
  const log = document.getElementById('eveLog');
  if (!log) return;

  const lines = [
    { t: `[EPOCH ${message.epoch}] Intercepted ${Math.floor((message.ciphertext?.length || 0) / 2)} bytes`, cls: '' },
    { t: `IV: ${message.iv}`, cls: '' },
    { t: `CT: ${(message.ciphertext || '').slice(0, 48)}…`, cls: '' },
    { t: 'Attempting AES-256-GCM brute force [2^256 keys]…', cls: 'warn-line' },
    { t: 'Attempting HMAC-SHA-256 forgery…', cls: 'warn-line' },
    { t: 'Attempting ML-KEM lattice reduction…', cls: 'warn-line' },
    { t: `ATTACK FAILED — Epoch ${message.epoch} key permanently erased.`, cls: 'danger-line' },
    { t: 'No prior epoch keys recoverable. Forward secrecy intact.', cls: 'success-line' },
    { t: '─'.repeat(50), cls: 'separator' },
  ];

  for (const [i, { t, cls }] of lines.entries()) {
    await typeTerminalLine(log, t, cls, i < 3 ? 0 : (i - 2) * 280);
  }
}

function typeTerminalLine(log, text, className, delay = 0) {
  return new Promise(resolve => {
    setTimeout(async () => {
      const item = document.createElement('div');
      item.className = className;
      log.appendChild(item);
      for (const char of text) {
        item.append(char);
        log.scrollTop = log.scrollHeight;
        await new Promise(r => setTimeout(r, 10));
      }
      resolve();
    }, delay);
  });
}
