import { epochLabel } from '../crypto.js';
import { deriveMessageKey, getSharedKeyBytes } from '../session.js';

let _state = null;
let _broadcast = null;
let _setSessionTelemetry = null;
let _stolenEpoch = null;

export function initDemo3(state, broadcast) {
  _state = state;
  _broadcast = broadcast;
}

export async function handleDemo3Control(message, state, broadcast, setSessionTelemetry) {
  _state = state;
  _broadcast = broadcast;
  _setSessionTelemetry = setSessionTelemetry;

  const { action, payload } = message;

  if (action === 'demo3_steal_key') {
    _stolenEpoch = payload.stolenEpoch;
    await animateStolenKey(payload.stolenEpoch, payload.keyHex);
    return;
  }

  if (action === 'demo3_ratchet_sync') {
    // Update local epoch to match broadcaster's epoch
    if (payload.epoch && payload.epoch > state.epoch) {
      state.epoch = payload.epoch;
    }
    await buildDetailedRatchetView(payload);
    return;
  }
}

// Eve console triggers this
export async function launchStealKey(broadcast, state) {
  const sharedKeyBytes = getSharedKeyBytes();
  const currentEpoch = state.epoch;
  if (currentEpoch < 2) return; // Need at least one prior epoch

  // Derive the "stolen" key — the most recent active epoch
  let keyHex = '(no shared key)';
  if (sharedKeyBytes) {
    const derived = await deriveMessageKey(sharedKeyBytes, currentEpoch);
    keyHex = derived.keyHex.slice(0, 16) + '...';
  }

  broadcast('demo3_steal_key', { stolenEpoch: currentEpoch, keyHex });
}

export async function launchRatchetSync(broadcast, state) {
  const sharedKeyBytes = getSharedKeyBytes();
  const epoch = state.epoch;

  // Build key labels for visible nodes
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

async function animateStolenKey(stolenEpoch, keyHex) {
  const flowEl = document.getElementById('ratchetFlow');
  if (!flowEl) return;

  // Flash the stolen node red
  const nodes = flowEl.querySelectorAll('.key-node');
  for (const node of nodes) {
    const label = node.querySelector('span')?.textContent || '';
    if (label.includes(epochLabel(stolenEpoch))) {
      node.classList.add('stolen');
      setTimeout(() => node.classList.remove('stolen'), 2500);
      break;
    }
  }

  // Show the "still can't decrypt past messages" overlay
  showStolenKeyResult(stolenEpoch, keyHex);
}

function showStolenKeyResult(stolenEpoch, keyHex) {
  let overlay = document.getElementById('demo3-stolen-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'demo3-stolen-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:57;display:grid;place-items:center;background:rgba(2,5,6,.88);backdrop-filter:blur(12px);opacity:0;pointer-events:none;transition:opacity .35s';
    document.body.appendChild(overlay);
  }

  const deletedEpochs = [];
  for (let e = 1; e < stolenEpoch; e++) deletedEpochs.push(e);

  overlay.innerHTML = `
    <div style="width:600px;max-width:95vw;padding:32px;border:1px solid rgba(255,102,110,.25);border-radius:6px;background:#0b1113;text-align:center">
      <div style="color:#ff666e;font:500 9px var(--mono);letter-spacing:1.4px;margin-bottom:10px">⚠ KEY COMPROMISED</div>
      <h3 style="margin:0 0 8px;font-size:18px">Attacker Steals MK ${epochLabel(stolenEpoch)}</h3>
      <p style="color:#60757a;font:9px var(--mono);margin:0 0 24px">Key: <code style="color:#9fc6c0">${keyHex}</code></p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
        <div style="padding:16px;border:1px solid rgba(255,102,110,.2);border-radius:4px;background:rgba(255,102,110,.04)">
          <div style="color:#ff666e;font:700 11px var(--mono);margin-bottom:10px">CAN DECRYPT</div>
          <div style="color:#d4e2e1;font:9px var(--mono);line-height:1.8">
            MK ${epochLabel(stolenEpoch)} messages only<br>
            <span style="color:#60757a">(if not yet deleted)</span>
          </div>
        </div>
        <div style="padding:16px;border:1px solid rgba(41,232,199,.2);border-radius:4px;background:rgba(41,232,199,.04)">
          <div style="color:#29e8c7;font:700 11px var(--mono);margin-bottom:10px">CANNOT DECRYPT</div>
          <div style="color:#d4e2e1;font:9px var(--mono);line-height:1.8">
            ${deletedEpochs.length > 0
              ? deletedEpochs.slice(0, 4).map(e => `MK ${epochLabel(e)}`).join(', ') + (deletedEpochs.length > 4 ? '...' : '')
              : 'No prior epochs'}
            <br><span style="color:#29e8c7">← PERMANENTLY DELETED</span>
          </div>
        </div>
      </div>
      <div style="padding:10px;border:1px solid rgba(41,232,199,.15);border-radius:4px;background:rgba(41,232,199,.03);margin-bottom:18px">
        <div style="color:#29e8c7;font:8px var(--mono);letter-spacing:.8px">FORWARD SECRECY — compromising one key never reveals past messages</div>
      </div>
      <button id="demo3-stolen-close" style="height:36px;padding:0 20px;border:1px solid #1a2c30;border-radius:4px;background:transparent;color:#7a9499;font:9px var(--mono);cursor:pointer">Dismiss</button>
    </div>`;

  document.getElementById('demo3-stolen-close').addEventListener('click', () => {
    overlay.style.opacity = '0';
    overlay.style.pointerEvents = 'none';
  });

  requestAnimationFrame(() => {
    overlay.style.opacity = '1';
    overlay.style.pointerEvents = 'all';
  });
}

async function buildDetailedRatchetView(payload) {
  const flowEl = document.getElementById('ratchetFlow');
  if (!flowEl) return;

  const epoch = payload.epoch || _state?.epoch || 1;
  const keyLabels = payload.keyLabels || {};
  const sharedKeyBytes = getSharedKeyBytes();

  // If we have our own key material, derive labels ourselves
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
    const keySnippet = keyLabels[e] ? `<small style="font:7px var(--mono);color:#3a5255;display:block;margin-top:3px">${keyLabels[e]}</small>` : '';
    const isEve = _state?.role === 'eve';

    if (e < epoch) {
      nodes.push(`<div class="key-node destroyed">
        <span>MK ${epochLabel(e)}</span>
        <strong>DELETED</strong>
        ${isEve ? '<small style="font:6px var(--mono);color:#2a3d40">NO KEY</small>' : keySnippet}
      </div>`);
    } else if (e === epoch) {
      nodes.push(`<div class="key-node current">
        <span>MK ${epochLabel(e)}</span>
        <strong>ACTIVE</strong>
        ${isEve ? '<small style="font:6px var(--mono);color:#2a3d40">UNKNOWN</small>' : keySnippet}
      </div>`);
    } else {
      nodes.push(`<div class="key-node future">
        <span>MK ${epochLabel(e)}</span>
        <strong>LOCKED</strong>
        ${isEve ? '' : keySnippet}
      </div>`);
    }

    if (e < epoch + 2) {
      nodes.push(`<i${e >= epoch ? ' class="dashed"' : ''}></i>`);
    }
  }

  flowEl.innerHTML = nodes.join('');
}
