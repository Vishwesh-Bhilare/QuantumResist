import { launchDemo1Step } from '../demos/demo1.js';
import { launchTimeskip, setHarvestedMessage } from '../demos/demo2.js';
import { launchStealKey, launchRatchetSync } from '../demos/demo3.js';
import { launchDemo5, launchDemo5Phase, closeDemo5 } from '../demos/demo5.js';

let _state = null;
let _broadcast = null;
let _interceptCount = 0;
let _hasHarvested = false;
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
          <div style="display:flex;align-items:center;gap:12px">
            <div style="font:8px var(--mono);color:#4a6165">
              ROLE: <span style="color:#ff666e">EVE (ATTACKER)</span>
            </div>
            <div class="connected" style="color:#ff666e">
              <i style="background:#ff666e;box-shadow:0 0 8px #ff666e"></i> NO KEY
            </div>
          </div>
        </div>
        <div class="eve-status-bar" style="padding:10px 12px;gap:8px;display:grid;grid-template-columns:repeat(3,1fr);flex:none;border-bottom:1px solid var(--line-soft)">
          <div class="eve-stat">
            <div class="eve-stat-value zero" id="eve-intercepted">0</div>
            <div class="eve-stat-label">INTERCEPTED</div>
          </div>
          <div class="eve-stat">
            <div class="eve-stat-value danger" id="eve-decrypted">0</div>
            <div class="eve-stat-label">DECRYPTED</div>
          </div>
          <div class="eve-stat">
            <div class="eve-stat-value" id="eve-epoch" style="font-size:16px">—</div>
            <div class="eve-stat-label">EPOCH</div>
          </div>
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
            <button class="demo-btn" id="btn-d1-rsa" title="Show RSA-2048 classical setup">
              <span class="btn-dot"></span>Step 1 — Show RSA setup
            </button>
            <button class="demo-btn" id="btn-d1-attack" title="Trigger quantum attack on RSA" disabled>
              <span class="btn-dot"></span>Step 2 — Quantum attack RSA
            </button>
            <button class="demo-btn" id="btn-d1-kyber" title="Switch to ML-KEM-1024" disabled>
              <span class="btn-dot"></span>Step 3 — Switch to ML-KEM
            </button>
          </div>

          <div class="demo-section">
            <div class="demo-section-title">Demo 2 · Harvest Now, Decrypt Later</div>
            <button class="demo-btn" id="btn-d2-timeskip" title="Fast-forward to 2038 and show decrypt comparison" disabled>
              <span class="btn-dot"></span>Fast-forward to 2038
            </button>
          </div>

          <div class="demo-section">
            <div class="demo-section-title">Demo 3 · Key Ratchet</div>
            <button class="demo-btn" id="btn-d3-sync" title="Sync ratchet view with real key hex labels">
              <span class="btn-dot"></span>Sync ratchet view
            </button>
            <button class="demo-btn danger" id="btn-d3-steal" title="Steal current epoch key and show forward secrecy" disabled>
              <span class="btn-dot"></span>Steal current key
            </button>
          </div>

          <div class="demo-section">
            <div class="demo-section-title">Demo 5 · Resistance Meter</div>
            <button class="demo-btn" id="btn-d5-open">
              <span class="btn-dot"></span>Open meter (all screens)
            </button>
            <button class="demo-btn" id="btn-d5-phase" disabled>
              <span class="btn-dot"></span>Advance phase (0 → 3)
            </button>
            <button class="demo-btn danger" id="btn-d5-close" disabled>
              <span class="btn-dot"></span>Close meter
            </button>
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

  // Listen for intercept events from app.js
  document.addEventListener('eve:intercept', event => {
    handleIntercept(event.detail);
  });
}

function bindEveButtons(state, broadcast) {
  // Demo 1
  document.getElementById('btn-d1-rsa')?.addEventListener('click', async () => {
    await launchDemo1Step('rsa_classical', broadcast);
    setPhase('Demo 1 — Step 1');
    enableButton('btn-d1-attack');
  });

  document.getElementById('btn-d1-attack')?.addEventListener('click', async () => {
    await launchDemo1Step('quantum_attack', broadcast);
    setPhase('Demo 1 — Step 2');
    enableButton('btn-d1-kyber');
  });

  document.getElementById('btn-d1-kyber')?.addEventListener('click', async () => {
    await launchDemo1Step('kyber_switch', broadcast);
    setPhase('Demo 1 — Complete');
  });

  // Demo 2
  document.getElementById('btn-d2-timeskip')?.addEventListener('click', () => {
    launchTimeskip(broadcast);
    setPhase('Demo 2 — Timeskip');
  });

  // Demo 3
  document.getElementById('btn-d3-sync')?.addEventListener('click', async () => {
    await launchRatchetSync(broadcast, state);
    setPhase('Demo 3 — Ratchet sync');
    enableButton('btn-d3-steal');
  });

  document.getElementById('btn-d3-steal')?.addEventListener('click', async () => {
    await launchStealKey(broadcast, state);
    setPhase('Demo 3 — Key stolen');
  });

  // Demo 5
  document.getElementById('btn-d5-open')?.addEventListener('click', () => {
    _demo5Phase = 0;
    launchDemo5(broadcast);
    setPhase('Demo 5 — Open');
    enableButton('btn-d5-phase');
    enableButton('btn-d5-close');
  });

  document.getElementById('btn-d5-phase')?.addEventListener('click', () => {
    _demo5Phase = Math.min(_demo5Phase + 1, 3);
    launchDemo5Phase(broadcast);
    setPhase(`Demo 5 — Phase ${_demo5Phase}/3`);
    if (_demo5Phase >= 3) disableButton('btn-d5-phase');
  });

  document.getElementById('btn-d5-close')?.addEventListener('click', () => {
    closeDemo5(broadcast);
    _demo5Phase = 0;
    setPhase('READY');
    disableButton('btn-d5-phase');
    disableButton('btn-d5-close');
  });
}

function enableButton(id) {
  const btn = document.getElementById(id);
  if (btn) btn.disabled = false;
}

function disableButton(id) {
  const btn = document.getElementById(id);
  if (btn) btn.disabled = true;
}

function setPhase(label) {
  const badge = document.getElementById('eve-phase-badge');
  if (badge) badge.textContent = label;
}

async function handleIntercept(message) {
  _interceptCount++;
  _hasHarvested = true;

  // Update stats
  const interceptEl = document.getElementById('eve-intercepted');
  const epochEl = document.getElementById('eve-epoch');
  if (interceptEl) interceptEl.textContent = String(_interceptCount);
  if (epochEl) epochEl.textContent = String(message.epoch || '?');

  // Enable timeskip and steal buttons now that we have a message
  enableButton('btn-d2-timeskip');
  enableButton('btn-d3-steal');

  // Store for demo2
  setHarvestedMessage(message);

  // Update epoch in state (if we have access)
  if (_state) {
    _state.epoch = Math.max(_state.epoch || 1, Number(message.epoch || 1) + 1);
  }

  // Log to eve terminal
  const log = document.getElementById('eveLog');
  if (!log) return;

  const lines = [
    { text: `[EPOCH ${message.epoch}] Intercepted ${(message.ciphertext?.length || 0) / 2} bytes`, cls: '' },
    { text: `IV: ${message.iv}`, cls: '' },
    { text: `Ciphertext: ${(message.ciphertext || '').slice(0, 48)}...`, cls: '' },
    { text: 'Attempting AES-256-GCM brute force [2^256 keys]...', cls: 'warn-line' },
    { text: 'Attempting HMAC-SHA-256 forgery...', cls: 'warn-line' },
    { text: 'Attempting ML-KEM lattice reduction...', cls: 'warn-line' },
    { text: `ATTACK FAILED — Forward secrecy epoch ${message.epoch} key permanently erased.`, cls: 'danger-line' },
    { text: 'No prior epoch keys recoverable.', cls: 'success-line' },
    { text: '─'.repeat(52), cls: 'separator' },
  ];

  for (const [i, { text, cls }] of lines.entries()) {
    await typeTerminalLine(log, text, cls, i < 3 ? 0 : (i - 2) * 300);
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
        await new Promise(r => setTimeout(r, 12));
      }
      resolve();
    }, delay);
  });
}
