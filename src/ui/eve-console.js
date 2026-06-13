// src/ui/eve-console.js
// Full attack operator console for 3‑laptop PQC demo

let _state = null;           // reference to global app state (role, epoch, peers, interceptCount)
let _broadcast = null;       // broadcastDemoControl function
let _intercepted = [];       // list of intercepted messages (newest first)
let _hasHarvested = false;   // Demo 2 prerequisite: harvested message stored
let _demo5Phase = 0;         // 0 = not started, 1/2/3 phases
let _statusUpdateInterval = null;

// Helper: update top status bar and button enable states
function updateStatusBar() {
  if (!_state) return;

  // Top bar elements
  const peerCountEl = document.getElementById('eve-peer-count');
  const epochEl = document.getElementById('eve-current-epoch');
  const interceptCountEl = document.getElementById('eve-intercept-count');
  const successRateEl = document.getElementById('eve-success-rate');

  if (peerCountEl) peerCountEl.textContent = `${_state.peers?.length || 0} / 3`;
  if (epochEl) epochEl.textContent = `${(_state.epoch || 0) + 1}`;  // display 1‑based
  const interceptTotal = _intercepted.length;
  if (interceptCountEl) interceptCountEl.textContent = interceptTotal;
  if (successRateEl) successRateEl.textContent = `0 / ${interceptTotal}`;

  // Button enable/disable based on prerequisites
  const fastForwardBtn = document.getElementById('demo2-fastforward');
  if (fastForwardBtn) fastForwardBtn.disabled = !_hasHarvested;

  const stealKeyBtn = document.getElementById('demo3-stealkey');
  if (stealKeyBtn) stealKeyBtn.disabled = (_state.epoch || 0) < 4;

  const runPhaseBtn = document.getElementById('demo5-runphase');
  const launchMeterBtn = document.getElementById('demo5-launch');
  if (runPhaseBtn && launchMeterBtn) {
    // Run Phase enabled only after Launch Meter started and phase < 3
    const started = _demo5Phase > 0;
    runPhaseBtn.disabled = !started || _demo5Phase >= 3;
    // Launch Meter enabled only if not already started
    launchMeterBtn.disabled = started;
  }

  const closeMeterBtn = document.getElementById('demo5-close');
  if (closeMeterBtn) closeMeterBtn.disabled = _demo5Phase === 0;
}

// Add entry to attack log (left panel)
function addAttackLogEntry(epoch, ciphertextPreview, timestamp = Date.now()) {
  const container = document.getElementById('eve-attack-log');
  if (!container) return;

  const timeStr = new Date(timestamp).toLocaleTimeString();
  const entryDiv = document.createElement('div');
  entryDiv.className = 'attack-log-entry';
  entryDiv.innerHTML = `
    <div class="attack-log-header">
      <span class="attack-epoch">Epoch ${epoch}</span>
      <span class="attack-time">${timeStr}</span>
    </div>
    <div class="attack-cipher">${ciphertextPreview}…</div>
  `;
  container.prepend(entryDiv); // newest first

  // Limit to 50 entries
  while (container.children.length > 50) container.removeChild(container.lastChild);
}

// Handle intercepted message (from app.js custom event)
function handleIntercept(detail) {
  const epoch = detail.epoch;
  const ciphertext = detail.ciphertext || '';
  const preview = ciphertext.slice(0, 40);
  _intercepted.unshift({ epoch, ciphertext, timestamp: Date.now() });
  if (_intercepted.length > 50) _intercepted.pop();
  addAttackLogEntry(epoch, preview);
  updateStatusBar();
}

// Handle demo control messages that Eve should listen to (e.g., harvest confirmation, ratchet sync)
function onDemoControl(action, payload) {
  if (action === 'demo2_harvest') {
    _hasHarvested = true;
    updateStatusBar();
  }
  if (action === 'ratchet_advance' && payload.epoch !== undefined) {
    // update local epoch reference (already updated in app state, but refresh bar)
    updateStatusBar();
  }
  if (action === 'demo5_start') {
    _demo5Phase = 1;
    updateStatusBar();
  }
  if (action === 'demo5_phase' && payload.phase !== undefined) {
    _demo5Phase = payload.phase;
    updateStatusBar();
  }
  if (action === 'demo5_close') {
    _demo5Phase = 0;
    updateStatusBar();
  }
}

// Button event handlers
function onRsaClassical() {
  _broadcast('demo1_step', { step: 'rsa_classical' });
}
function onQuantumAttack() {
  _broadcast('demo1_step', { step: 'quantum_attack' });
}
function onKyberSwitch() {
  _broadcast('demo1_step', { step: 'kyber_switch' });
}
function onHarvestMessage() {
  // Harvest the last intercepted message (or current message if any)
  if (_intercepted.length === 0) {
    // Optionally broadcast empty harvest? Spec: harvest message from Alice
    _broadcast('demo2_harvest', { harvested: null });
  } else {
    const last = _intercepted[0];
    _broadcast('demo2_harvest', {
      harvested: {
        ciphertext: last.ciphertext,
        epoch: last.epoch,
        timestamp: last.timestamp,
      },
    });
  }
  _hasHarvested = true;
  updateStatusBar();
}
function onFastForward() {
  _broadcast('demo2_timeskip', { targetYear: 2038 });
}
function onSyncRatchet() {
  // Request current ratchet state from server (broadcast will trigger sync)
  _broadcast('ratchet_sync', {});
}
function onStealKey() {
  const stolenEpoch = (_state.epoch || 0) - 1; // steal the most recent active key
  _broadcast('demo3_steal_key', { stolenEpoch });
}
function onLaunchMeter() {
  _demo5Phase = 1;
  updateStatusBar();
  _broadcast('demo5_start', {});
}
function onRunPhase() {
  if (_demo5Phase >= 1 && _demo5Phase < 3) {
    const nextPhase = _demo5Phase + 1;
    _demo5Phase = nextPhase;
    _broadcast('demo5_phase', { phase: nextPhase });
    updateStatusBar();
  }
}
function onCloseMeter() {
  _demo5Phase = 0;
  _broadcast('demo5_close', {});
  updateStatusBar();
}

// Render full UI inside mount element
function renderUI(mountEl) {
  mountEl.innerHTML = `
    <div class="eve-console">
      <!-- Top status bar -->
      <div class="eve-status-bar">
        <div class="status-item">
          <span class="status-label">👥 Peers</span>
          <span class="status-value" id="eve-peer-count">0/3</span>
        </div>
        <div class="status-item">
          <span class="status-label">🔢 Epoch</span>
          <span class="status-value" id="eve-current-epoch">1</span>
        </div>
        <div class="status-item">
          <span class="status-label">📡 Intercepted</span>
          <span class="status-value" id="eve-intercept-count">0</span>
        </div>
        <div class="status-item">
          <span class="status-label">🔓 Decrypt Rate</span>
          <span class="status-value" id="eve-success-rate">0/0</span>
        </div>
      </div>

      <!-- Two-column layout -->
      <div class="eve-two-columns">
        <!-- Left: Attack Log -->
        <div class="eve-attack-log-panel">
          <div class="panel-header">📜 ATTACK LOG</div>
          <div id="eve-attack-log" class="attack-log-container">
            <div class="empty-log">No intercepted messages yet.</div>
          </div>
        </div>

        <!-- Right: Demo Control Sidebar -->
        <div class="eve-demo-sidebar">
          <!-- Demo 1 -->
          <div class="demo-group">
            <div class="demo-title">🔐 Demo 1: RSA vs PQC</div>
            <button id="demo1-rsa" class="demo-btn">RSA Classical</button>
            <button id="demo1-quantum" class="demo-btn">Quantum Attack</button>
            <button id="demo1-kyber" class="demo-btn">Switch To ML‑KEM</button>
          </div>

          <!-- Demo 2 -->
          <div class="demo-group">
            <div class="demo-title">⏳ Demo 2: Harvest Now</div>
            <button id="demo2-harvest" class="demo-btn">Harvest Message</button>
            <button id="demo2-fastforward" class="demo-btn" disabled>Fast Forward to 2038</button>
          </div>

          <!-- Demo 3 -->
          <div class="demo-group">
            <div class="demo-title">🔁 Demo 3: Key Ratchet</div>
            <button id="demo3-sync" class="demo-btn">Sync Ratchet</button>
            <button id="demo3-stealkey" class="demo-btn" disabled>Steal Key</button>
          </div>

          <!-- Demo 5 -->
          <div class="demo-group">
            <div class="demo-title">📊 Demo 5: Resistance Meter</div>
            <button id="demo5-launch" class="demo-btn">Launch Meter</button>
            <button id="demo5-runphase" class="demo-btn" disabled>Run Phase</button>
            <button id="demo5-close" class="demo-btn" disabled>Close Meter</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Attach event listeners
  document.getElementById('demo1-rsa')?.addEventListener('click', onRsaClassical);
  document.getElementById('demo1-quantum')?.addEventListener('click', onQuantumAttack);
  document.getElementById('demo1-kyber')?.addEventListener('click', onKyberSwitch);
  document.getElementById('demo2-harvest')?.addEventListener('click', onHarvestMessage);
  document.getElementById('demo2-fastforward')?.addEventListener('click', onFastForward);
  document.getElementById('demo3-sync')?.addEventListener('click', onSyncRatchet);
  document.getElementById('demo3-stealkey')?.addEventListener('click', onStealKey);
  document.getElementById('demo5-launch')?.addEventListener('click', onLaunchMeter);
  document.getElementById('demo5-runphase')?.addEventListener('click', onRunPhase);
  document.getElementById('demo5-close')?.addEventListener('click', onCloseMeter);
}

// Initialize console
export function initEveConsole(mountEl, appState, broadcastFn) {
  if (!mountEl) return;
  _state = appState;
  _broadcast = broadcastFn;
  _intercepted = [];
  _hasHarvested = false;
  _demo5Phase = 0;

  renderUI(mountEl);

  // Listen for intercept events from app.js
  document.addEventListener('eve:intercept', (e) => handleIntercept(e.detail));

  // Listen for demo_control messages that Eve needs to track (via custom event)
  document.addEventListener('eve:demo_control', (e) => onDemoControl(e.detail.action, e.detail.payload));

  // Periodically refresh status bar (for epoch/peer updates from app)
  if (_statusUpdateInterval) clearInterval(_statusUpdateInterval);
  _statusUpdateInterval = setInterval(() => updateStatusBar(), 500);

  // Initial update
  updateStatusBar();

  // If there are already intercepted messages (from before init), add them
  if (appState.interceptCount > 0 && _intercepted.length === 0) {
    // Attempt to populate from appState? Not stored, but we can leave empty
  }
}

// Optional cleanup
export function destroyEveConsole() {
  if (_statusUpdateInterval) clearInterval(_statusUpdateInterval);
  _statusUpdateInterval = null;
}
