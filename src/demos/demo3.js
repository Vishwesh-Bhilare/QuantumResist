import { epochLabel } from '../crypto.js';
import { deriveMessageKey, getSharedKeyBytes } from '../session.js';

let _state = null;
let _broadcast = null;

export function initDemo3(state, broadcast) {
  _state = state;
  _broadcast = broadcast;
}

export async function handleDemo3Control(message, state, broadcast, setSessionTelemetry) {
  _state = state;
  _broadcast = broadcast;
  const { action, payload } = message;

  if (action === 'demo3_steal_key') {
    await animateStolenKey(payload.stolenEpoch, payload.keyHex, state);
    return;
  }

  if (action === 'demo3_ratchet_sync') {
    // Update local epoch to broadcaster's epoch (only advance, never go back)
    if (payload.epoch && Number(payload.epoch) > state.epoch) {
      state.epoch = Number(payload.epoch);
    }
    await buildDetailedRatchetView(payload, state);
    if (setSessionTelemetry) await setSessionTelemetry();
    return;
  }
}

// Eve console: sync ratchet view with real key hex labels across all screens
export async function launchRatchetSync(broadcast, state) {
  const sharedKeyBytes = getSharedKeyBytes();
  const epoch = state.epoch;
  const keyLabels = {};

  if (sharedKeyBytes) {
    for (let e = Math.max(1, epoch - 3); e <= epoch + 2; e++) {
      try {
        const { keyHex } = await deriveMessageKey(sharedKeyBytes, e);
        keyLabels[e] = keyHex.slice(0, 8);
      } catch { keyLabels[e] = '????????'; }
    }
  }

  broadcast('demo3_ratchet_sync', { epoch, keyLabels });
}

// Eve console: steal the current epoch key and show forward secrecy result
export async function launchStealKey(broadcast, state) {
  const sharedKeyBytes = getSharedKeyBytes();
  const currentEpoch = state.epoch;
  if (currentEpoch < 2) {
    // Need at least one sent message for this to be meaningful
    return;
  }
  const stolenEpoch = currentEpoch - 1; // most recently used (now deleted)
  let keyHex = '(key not derivable — no session secret on Eve)';
  if (sharedKeyBytes) {
    try {
      const derived = await deriveMessageKey(sharedKeyBytes, stolenEpoch);
      keyHex = derived.keyHex.slice(0, 24) + '…';
    } catch { /* eve may not have key */ }
  }
  broadcast('demo3_steal_key', { stolenEpoch, keyHex });
}

// ── Animate stolen key on the ratchet flow ────────────────────────────────────

async function animateStolenKey(stolenEpoch, keyHex, state) {
  const flowEl = document.getElementById('ratchetFlow');
  if (flowEl) {
    const nodes = flowEl.querySelectorAll('.key-node');
    for (const node of nodes) {
      const label = node.querySelector('span')?.textContent || '';
      if (label.includes(epochLabel(stolenEpoch))) {
        node.classList.add('stolen');
        setTimeout(() => node.classList.remove('stolen'), 2500);
        break;
      }
    }
  }
  showStolenKeyResult(stolenEpoch, keyHex, state);
}

function showStolenKeyResult(stolenEpoch, keyHex, state) {
  let overlay = document.getElementById('demo3-stolen-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'demo3-stolen-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:57;display:grid;place-items:center;background:rgba(2,5,6,.9);backdrop-filter:blur(12px);opacity:0;pointer-events:none;transition:opacity .35s';
    document.body.appendChild(overlay);
  }

  const currentEpoch = state?.epoch || stolenEpoch + 1;
  const deletedEpochs = [];
  for (let e = 1; e < stolenEpoch; e++) deletedEpochs.push(e);

  const deletedList = deletedEpochs.length > 0
    ? deletedEpochs.slice(0, 5).map(e => `MK ${epochLabel(e)}`).join(', ') + (deletedEpochs.length > 5 ? '…' : '')
    : 'None yet';

  overlay.innerHTML = `
    <div style="width:580px;max-width:95vw;padding:32px;border:1px solid rgba(255,102,110,.3);border-radius:6px;background:#0b1113;text-align:center;position:relative">
      <button id="demo3-stolen-close" style="position:absolute;top:12px;right:14px;border:0;background:transparent;color:#54666b;font-size:22px;cursor:pointer">×</button>
      <div style="color:#ff666e;font:500 9px var(--mono);letter-spacing:1.4px;margin-bottom:10px">⚠ KEY COMPROMISED</div>
      <h3 style="margin:0 0 8px;font-size:18px">Attacker steals MK ${epochLabel(stolenEpoch)}</h3>
      <p style="color:#60757a;font:9px var(--mono);margin:0 0 24px;word-break:break-all">Key hex: <code style="color:#9fc6c0">${keyHex}</code></p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
        <div style="padding:16px;border:1px solid rgba(255,102,110,.2);border-radius:4px;background:rgba(255,102,110,.04)">
          <div style="color:#ff666e;font:700 10px var(--mono);margin-bottom:10px">CAN DECRYPT</div>
          <div style="color:#d4e2e1;font:9px var(--mono);line-height:1.8">MK ${epochLabel(stolenEpoch)} messages only<br><span style="color:#60757a">(if not already deleted)</span></div>
        </div>
        <div style="padding:16px;border:1px solid rgba(41,232,199,.2);border-radius:4px;background:rgba(41,232,199,.04)">
          <div style="color:#29e8c7;font:700 10px var(--mono);margin-bottom:10px">CANNOT DECRYPT</div>
          <div style="color:#d4e2e1;font:9px var(--mono);line-height:1.8">${escapeHtml(deletedList)}<br><span style="color:#29e8c7">← PERMANENTLY DELETED</span></div>
        </div>
      </div>
      <div style="padding:10px 14px;border:1px solid rgba(41,232,199,.15);border-radius:4px;background:rgba(41,232,199,.03);margin-bottom:18px">
        <div style="color:#29e8c7;font:8px var(--mono);letter-spacing:.8px">FORWARD SECRECY — one compromised key never reveals past messages</div>
      </div>
      <button id="demo3-stolen-dismiss" style="height:36px;padding:0 20px;border:1px solid #1a2c30;border-radius:4px;background:transparent;color:#7a9499;font:9px var(--mono);cursor:pointer">Dismiss</button>
    </div>`;

  const dismiss = () => {
    overlay.style.opacity = '0';
    overlay.style.pointerEvents = 'none';
  };
  document.getElementById('demo3-stolen-close').addEventListener('click', dismiss);
  document.getElementById('demo3-stolen-dismiss').addEventListener('click', dismiss);

  requestAnimationFrame(() => {
    overlay.style.opacity = '1';
    overlay.style.pointerEvents = 'all';
  });
}

// ── Build detailed ratchet view with real key hex labels ──────────────────────

async function buildDetailedRatchetView(payload, state) {
  const flowEl = document.getElementById('ratchetFlow');
  if (!flowEl) return; // Eve doesn't have ratchetFlow in her layout

  const epoch = payload.epoch || state?.epoch || 1;
  const keyLabels = payload.keyLabels || {};
  const sharedKeyBytes = getSharedKeyBytes();
  const isEve = state?.role === 'eve';

  // Derive our own labels if we have the key material and none were provided
  if (sharedKeyBytes && Object.keys(keyLabels).length === 0) {
    for (let e = Math.max(1, epoch - 3); e <= epoch + 2; e++) {
      try {
        const { keyHex } = await deriveMessageKey(sharedKeyBytes, e);
        keyLabels[e] = keyHex.slice(0, 8);
      } catch { keyLabels[e] = '????????'; }
    }
  }

  const nodes = [];
  for (let e = Math.max(1, epoch - 3); e <= epoch + 2; e++) {
    const hexSnip = keyLabels[e]
      ? `<small style="font:6px var(--mono);color:#3a5255;display:block;margin-top:2px">${keyLabels[e]}</small>`
      : '';
    const eveTag = isEve ? `<small style="font:6px var(--mono);color:#2a3d40;display:block;margin-top:2px">NO KEY</small>` : hexSnip;

    if (e < epoch) {
      nodes.push(`<div class="key-node destroyed"><span>MK ${epochLabel(e)}</span><strong>DELETED</strong>${eveTag}</div>`);
    } else if (e === epoch) {
      nodes.push(`<div class="key-node current"><span>MK ${epochLabel(e)}</span><strong>ACTIVE</strong>${isEve ? '<small style="font:6px var(--mono);color:#2a3d40;display:block;margin-top:2px">UNKNOWN</small>' : hexSnip}</div>`);
    } else {
      nodes.push(`<div class="key-node future"><span>MK ${epochLabel(e)}</span><strong>LOCKED</strong></div>`);
    }
    if (e < epoch + 2) {
      nodes.push(`<i${e >= epoch ? ' class="dashed"' : ''}></i>`);
    }
  }
  flowEl.innerHTML = nodes.join('');
}

function escapeHtml(value) {
  const node = document.createElement('div');
  node.textContent = String(value);
  return node.innerHTML;
}
