let _state = null;
let _broadcast = null;
let _currentPhase = 0;

export function initDemo5(state, broadcast) {
  _state = state;
  _broadcast = broadcast;
}

export function handleDemo5Control(message, state) {
  const { action, payload } = message;
  if (action === 'demo5_start') { showResistanceMeter(); return; }
  if (action === 'demo5_phase') { advanceToPhase(Number(payload?.phase || 0)); return; }
  if (action === 'demo5_close') { closeResistanceMeter(); return; }
}

// Eve console helpers
export function launchDemo5(broadcast) { broadcast('demo5_start', {}); }
export function launchDemo5Phase(broadcast) {
  _currentPhase = Math.min(_currentPhase + 1, 3);
  broadcast('demo5_phase', { phase: _currentPhase });
}
export function closeDemo5(broadcast) {
  _currentPhase = 0;
  broadcast('demo5_close', {});
}

const ALGORITHMS = [
  { name: 'RSA-2048',     sub: 'Factoring-based',         classical: 'secure', quantum: 'broken', status: 'broken',  statusLabel: 'DEPRECATED' },
  { name: 'ECC P-256',    sub: 'Discrete log-based',       classical: 'secure', quantum: 'broken', status: 'broken',  statusLabel: 'DEPRECATED' },
  { name: 'ML-KEM-1024',  sub: 'FIPS 203 · Lattice-based', classical: 'secure', quantum: 'secure', status: 'secure',  statusLabel: 'ACTIVE' },
  { name: 'ML-DSA-87',    sub: 'FIPS 204 · Lattice-based', classical: 'secure', quantum: 'secure', status: 'secure',  statusLabel: 'ACTIVE' },
];

function cell(type, label, show) {
  if (!show) return '<div class="resistance-cell empty">—</div>';
  return `<div class="resistance-cell ${type}"><div class="resistance-dot"></div>${label}</div>`;
}

function renderTable(phase) {
  return `<table class="resistance-table">
    <thead><tr>
      <th>Algorithm</th>
      <th>Classical Attack</th>
      <th>Quantum (Shor's / Grover's)</th>
      <th>Status</th>
    </tr></thead>
    <tbody>
      ${ALGORITHMS.map(alg => `
        <tr class="${phase >= 2 && alg.quantum === 'broken' ? 'broken-row' : ''}">
          <td>${alg.name}<small>${alg.sub}</small></td>
          <td>${cell(alg.classical, 'SECURE', phase >= 1)}</td>
          <td>${cell(alg.quantum, alg.quantum === 'broken' ? 'BROKEN' : 'SECURE', phase >= 2)}</td>
          <td>${cell(alg.status, alg.statusLabel, phase >= 3)}</td>
        </tr>`).join('')}
    </tbody>
  </table>`;
}

function getOrCreateOverlay() {
  let overlay = document.getElementById('demo5-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'demo5-overlay';
    overlay.className = 'resistance-overlay';
    document.body.appendChild(overlay);
  }
  return overlay;
}

function showResistanceMeter() {
  _currentPhase = 0;
  const overlay = getOrCreateOverlay();
  overlay.innerHTML = `
    <div class="resistance-inner">
      <div class="resistance-title">
        <div style="display:flex;align-items:center;justify-content:center;gap:8px;color:#5c7479;font:500 9px var(--mono);letter-spacing:1.45px;margin-bottom:10px">
          <span style="width:18px;height:1px;background:var(--cyan)"></span>
          DEMO 5 · QUANTUM ATTACK RESISTANCE
          <span style="width:18px;height:1px;background:var(--cyan)"></span>
        </div>
        <h2 style="margin:0 0 4px;font-size:20px">Cryptographic Algorithm Resistance</h2>
        <p style="color:#60757a;font:9px var(--mono);margin:0">Against a cryptographically relevant quantum computer · Eve advances each phase</p>
      </div>
      <div id="demo5-table-wrap" style="margin-top:20px">${renderTable(0)}</div>
      <div style="margin-top:12px;padding:10px 14px;border:1px solid #1a2c30;border-radius:4px;background:#080d0f;font:8px var(--mono);color:#4a6165;text-align:center">
        Shor's algorithm targets RSA &amp; ECC · Grover's weakens symmetric keys (but not catastrophically) · ML-KEM/ML-DSA remain unbroken
      </div>
      <button class="resistance-close" id="demo5-close-btn">Dismiss</button>
    </div>`;

  document.getElementById('demo5-close-btn').addEventListener('click', () => {
    closeResistanceMeter();
    if (_broadcast) closeDemo5(_broadcast);
  });

  requestAnimationFrame(() => overlay.classList.add('visible'));
}

function advanceToPhase(phase) {
  _currentPhase = phase;
  const wrap = document.getElementById('demo5-table-wrap');
  if (!wrap) return;
  wrap.style.transition = 'opacity .2s, transform .2s';
  wrap.style.opacity = '0';
  wrap.style.transform = 'translateY(6px)';
  setTimeout(() => {
    wrap.innerHTML = renderTable(phase);
    wrap.style.opacity = '1';
    wrap.style.transform = 'translateY(0)';
  }, 220);
}

function closeResistanceMeter() {
  _currentPhase = 0;
  const overlay = document.getElementById('demo5-overlay');
  if (overlay) overlay.classList.remove('visible');
}
