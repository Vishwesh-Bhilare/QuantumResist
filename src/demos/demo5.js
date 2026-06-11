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
  if (action === 'demo5_phase') { advanceToPhase(payload.phase); return; }
  if (action === 'demo5_close') { closeResistanceMeter(); return; }
}

export function launchDemo5(broadcast) {
  broadcast('demo5_start', {});
}

export function launchDemo5Phase(broadcast) {
  _currentPhase = Math.min(_currentPhase + 1, 3);
  broadcast('demo5_phase', { phase: _currentPhase });
}

export function closeDemo5(broadcast) {
  _currentPhase = 0;
  broadcast('demo5_close', {});
}

const ALGORITHMS = [
  {
    name: 'RSA-2048',
    sub: 'Factoring-based',
    classical: { label: 'SECURE', type: 'secure' },
    quantum: { label: 'BROKEN', type: 'broken' },
    status: { label: 'DEPRECATED', type: 'broken' },
  },
  {
    name: 'ECC P-256',
    sub: 'Discrete log-based',
    classical: { label: 'SECURE', type: 'secure' },
    quantum: { label: 'BROKEN', type: 'broken' },
    status: { label: 'DEPRECATED', type: 'broken' },
  },
  {
    name: 'ML-KEM-1024',
    sub: 'FIPS 203 · Lattice-based',
    classical: { label: 'SECURE', type: 'secure' },
    quantum: { label: 'SECURE', type: 'secure' },
    status: { label: 'ACTIVE', type: 'secure' },
  },
  {
    name: 'ML-DSA-87',
    sub: 'FIPS 204 · Lattice-based',
    classical: { label: 'SECURE', type: 'secure' },
    quantum: { label: 'SECURE', type: 'secure' },
    status: { label: 'ACTIVE', type: 'secure' },
  },
];

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

function renderTable(phase) {
  return `
    <table class="resistance-table">
      <thead>
        <tr>
          <th>Algorithm</th>
          <th>Classical Attack</th>
          <th>Quantum (Shor's / Grover's)</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${ALGORITHMS.map((alg, i) => {
          const classicalCell = phase >= 1
            ? `<div class="resistance-cell secure"><div class="resistance-dot"></div>${alg.classical.label}</div>`
            : '<div class="resistance-cell empty">—</div>';

          const quantumCell = phase >= 2
            ? `<div class="resistance-cell ${alg.quantum.type}"><div class="resistance-dot"></div>${alg.quantum.label}</div>`
            : '<div class="resistance-cell empty">—</div>';

          const statusCell = phase >= 3
            ? `<div class="resistance-cell ${alg.status.type}"><div class="resistance-dot"></div>${alg.status.label}</div>`
            : '<div class="resistance-cell empty">—</div>';

          const rowClass = phase >= 2 && alg.quantum.type === 'broken' ? 'broken-row' : '';

          return `<tr class="${rowClass}">
            <td>
              ${alg.name}
              <small>${alg.sub}</small>
            </td>
            <td>${classicalCell}</td>
            <td>${quantumCell}</td>
            <td>${statusCell}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

function showResistanceMeter() {
  const overlay = getOrCreateOverlay();
  _currentPhase = 0;

  overlay.innerHTML = `
    <div class="resistance-inner">
      <div class="resistance-title">
        <div class="eyebrow" style="justify-content:center;display:flex;align-items:center;gap:8px;margin-bottom:10px">
          <span style="width:18px;height:1px;background:var(--cyan)"></span>
          DEMO 5 · QUANTUM ATTACK RESISTANCE
          <span style="width:18px;height:1px;background:var(--cyan)"></span>
        </div>
        <h2 style="margin:0;font-size:20px">Cryptographic Algorithm Resistance</h2>
        <p style="color:#60757a;font:9px var(--mono);margin:8px 0 0">Against a cryptographically relevant quantum computer</p>
      </div>
      <div id="demo5-table-wrap">${renderTable(0)}</div>
      <div style="margin-top:14px;padding:10px 14px;border:1px solid #1a2c30;border-radius:4px;background:#080d0f;font:8px var(--mono);color:#4a6165;text-align:center">
        Eve's panel advances each phase · Shor's targets RSA/ECC · Grover's weakens symmetric keys but not catastrophically
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

  // Animate out and in
  wrap.style.opacity = '0';
  wrap.style.transform = 'translateY(6px)';
  wrap.style.transition = 'opacity .25s, transform .25s';

  setTimeout(() => {
    wrap.innerHTML = renderTable(phase);
    wrap.style.opacity = '1';
    wrap.style.transform = 'translateY(0)';
  }, 260);
}

function closeResistanceMeter() {
  const overlay = document.getElementById('demo5-overlay');
  if (overlay) {
    overlay.classList.remove('visible');
    _currentPhase = 0;
  }
}
