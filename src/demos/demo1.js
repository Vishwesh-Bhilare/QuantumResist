import { toHex } from '../crypto.js';
import { renderConnectionDiagram } from '../ui/diagrams.js';

let _state = null;
let _broadcast = null;
let _rsaSignKeyPair = null; // for Demo 1 display

export function initDemo1(state, broadcast) {
  _state = state;
  _broadcast = broadcast;
}

// Called by Eve console buttons — generates key on Eve's side and broadcasts hex
export async function launchDemo1Step(step, broadcast) {
  if (step === 'rsa_classical') {
    // Generate real RSA-2048 key pair, export public key hex
    const kp = await crypto.subtle.generateKey(
      { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true, ['sign', 'verify'],
    );
    _rsaSignKeyPair = kp;
    const exported = await crypto.subtle.exportKey('spki', kp.publicKey);
    const publicKeyHex = toHex(new Uint8Array(exported));
    // Broadcast rsa_keygen first so server stores it, then the step
    broadcast('demo1_rsa_keygen', { publicKeyHex });
    broadcast('demo1_step', { step: 'rsa_classical', publicKeyHex });
    return;
  }
  if (step === 'quantum_attack') {
    let publicKeyHex = null;
    if (_rsaSignKeyPair) {
      const exported = await crypto.subtle.exportKey('spki', _rsaSignKeyPair.publicKey);
      publicKeyHex = toHex(new Uint8Array(exported));
    }
    broadcast('demo1_step', { step: 'quantum_attack', publicKeyHex });
    return;
  }
  if (step === 'kyber_switch') {
    broadcast('demo1_step', { step: 'kyber_switch' });
  }
}

export async function handleDemo1Control(message, state, broadcast) {
  const { action, payload } = message;

  // demo1_rsa_keygen: store locally (all screens get this so they can show the key)
  if (action === 'demo1_rsa_keygen') {
    // Nothing to do on non-Eve screens except note it arrived
    return;
  }

  // demo1_step: show diagram overlay on ALL screens
  if (action === 'demo1_step') {
    const step = payload?.step;
    if (step === 'rsa_classical') showDiagramOverlay('rsa_classical', payload);
    else if (step === 'quantum_attack') showDiagramOverlay('quantum_attack', payload);
    else if (step === 'kyber_switch') showDiagramOverlay('kyber_switch', payload);
  }
}

// ── Overlay ───────────────────────────────────────────────────────────────────

function getOrCreateOverlay() {
  let overlay = document.getElementById('demo1-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'demo1-overlay';
    overlay.className = 'connection-diagram-overlay';
    overlay.innerHTML = `
      <div class="diagram-inner">
        <div style="color:#5c7479;font:500 9px var(--mono);letter-spacing:1.45px;margin-bottom:8px" id="demo1-eyebrow">DEMO 1 · RSA VS POST-QUANTUM</div>
        <h3 id="demo1-title" style="margin:0 0 6px;font-size:16px"></h3>
        <p id="demo1-desc" style="margin:0 0 16px;color:#60757a;font:9px var(--mono);line-height:1.55"></p>
        <div class="diagram-svg-wrap" id="demo1-svg-wrap"></div>
        <div id="demo1-key-info" style="margin-top:12px;padding:10px 14px;border:1px solid #1a2c30;border-radius:4px;background:#080d0f;display:none">
          <div style="color:#4a6165;font:7px var(--mono);letter-spacing:.8px;margin-bottom:5px">RSA-2048 PUBLIC KEY (SPKI, first 64 hex chars)</div>
          <code id="demo1-pubkey" style="color:#9fc6c0;font:9px var(--mono);word-break:break-all;line-height:1.5"></code>
        </div>
        <button class="diagram-close" id="demo1-close">Dismiss</button>
      </div>`;
    document.body.appendChild(overlay);
    document.getElementById('demo1-close').addEventListener('click', () => overlay.classList.remove('visible'));
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.remove('visible'); });
  }
  return overlay;
}

function showDiagramOverlay(step, payload = {}) {
  const overlay = getOrCreateOverlay();
  const titleEl = document.getElementById('demo1-title');
  const descEl = document.getElementById('demo1-desc');
  const svgWrap = document.getElementById('demo1-svg-wrap');
  const keyInfo = document.getElementById('demo1-key-info');
  const pubkeyEl = document.getElementById('demo1-pubkey');

  let title, desc, type, secure, labelLeft, labelRight, algo, algoSub;

  if (step === 'rsa_classical') {
    title = 'Classical System — RSA-2048';
    desc = 'RSA security relies on the difficulty of factoring large numbers. Currently secure against classical computers.';
    type = 'classical'; secure = true;
    labelLeft = 'ALICE'; labelRight = 'BOB'; algo = 'RSA-2048'; algoSub = 'Factoring-based · 2048-bit modulus';
    if (payload.publicKeyHex && keyInfo && pubkeyEl) {
      keyInfo.style.display = 'block';
      pubkeyEl.textContent = payload.publicKeyHex.slice(0, 64) + '…';
    }
  } else if (step === 'quantum_attack') {
    title = "Quantum Attack — Shor's Algorithm";
    desc = "A cryptographically relevant quantum computer runs Shor's Algorithm and recovers the RSA private key from the public modulus alone.";
    type = 'quantum'; secure = false;
    labelLeft = 'QUANTUM'; labelRight = 'RSA KEY'; algo = "SHOR'S ALGORITHM"; algoSub = 'Period-finding · O(log³N) qubits';
    if (payload.publicKeyHex && keyInfo && pubkeyEl) {
      keyInfo.style.display = 'block';
      pubkeyEl.textContent = payload.publicKeyHex.slice(0, 64) + '… ← recoverable from public key';
    }
  } else if (step === 'kyber_switch') {
    title = 'Post-Quantum System — ML-KEM-1024';
    desc = 'ML-KEM is based on the Module Learning With Errors lattice problem. No efficient quantum algorithm equivalent to Shor\'s is known for this.';
    type = 'pqc'; secure = true;
    labelLeft = 'ALICE'; labelRight = 'BOB'; algo = 'ML-KEM-1024'; algoSub = 'FIPS 203 · Lattice-based · Quantum-resistant';
    if (keyInfo) keyInfo.style.display = 'none';
  }

  if (titleEl) titleEl.textContent = title;
  if (descEl) descEl.textContent = desc;
  if (svgWrap) svgWrap.innerHTML = renderConnectionDiagram({ labelLeft, labelRight, algo, algoSub, secure, type });

  requestAnimationFrame(() => overlay.classList.add('visible'));
}
