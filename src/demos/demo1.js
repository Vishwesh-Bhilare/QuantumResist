import { toHex } from '../crypto.js';
import { renderConnectionDiagram } from '../ui/diagrams.js';

let _state = null;
let _broadcast = null;
let rsaKeyPair = null;

export function initDemo1(state, broadcast) {
  _state = state;
  _broadcast = broadcast;
}

// Generate a real RSA-2048 key pair via Web Crypto
async function generateRsaKeyPair() {
  rsaKeyPair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const exported = await crypto.subtle.exportKey('spki', rsaKeyPair.publicKey);
  return toHex(new Uint8Array(exported));
}

// Encrypt a small message with RSA public key (using OAEP for encryption demo)
async function generateRsaEncryptKeyPair() {
  return crypto.subtle.generateKey(
    { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['encrypt', 'decrypt'],
  );
}

export async function handleDemo1Control(message, state, broadcast) {
  const { action, payload } = message;

  if (action === 'demo1_step') {
    const step = payload?.step;
    if (step === 'rsa_classical') showDiagramOverlay('rsa_classical', payload);
    if (step === 'quantum_attack') showDiagramOverlay('quantum_attack', payload);
    if (step === 'kyber_switch') showDiagramOverlay('kyber_switch', payload);
  }

  if (action === 'demo1_rsa_keygen') {
    // Store publicKeyHex for use in diagrams
    showDiagramOverlay('rsa_classical', payload);
  }
}

// Called by Eve console buttons
export async function launchDemo1Step(step, broadcast) {
  if (step === 'rsa_classical') {
    const publicKeyHex = await generateRsaKeyPair();
    broadcast('demo1_rsa_keygen', { publicKeyHex });
    broadcast('demo1_step', { step: 'rsa_classical', publicKeyHex });
    return;
  }
  if (step === 'quantum_attack') {
    const publicKeyHex = rsaKeyPair
      ? toHex(new Uint8Array(await crypto.subtle.exportKey('spki', rsaKeyPair.publicKey)))
      : null;
    broadcast('demo1_step', { step: 'quantum_attack', publicKeyHex });
    return;
  }
  if (step === 'kyber_switch') {
    broadcast('demo1_step', { step: 'kyber_switch' });
  }
}

function getOrCreateOverlay() {
  let overlay = document.getElementById('demo1-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'demo1-overlay';
    overlay.className = 'connection-diagram-overlay';
    overlay.innerHTML = `
      <div class="diagram-inner">
        <div class="eyebrow" id="demo1-eyebrow"><span></span> DEMO 1 · RSA VS POST-QUANTUM</div>
        <h3 id="demo1-title"></h3>
        <p id="demo1-desc"></p>
        <div class="diagram-svg-wrap" id="demo1-svg-wrap"></div>
        <div id="demo1-key-info" style="margin-top:12px;padding:10px 14px;border:1px solid #1a2c30;border-radius:4px;background:#080d0f;display:none">
          <div style="color:#4a6165;font:7px var(--mono);letter-spacing:.8px;margin-bottom:5px">RSA-2048 PUBLIC MODULUS (first 64 chars)</div>
          <code id="demo1-pubkey" style="color:#9fc6c0;font:9px var(--mono);word-break:break-all"></code>
        </div>
        <button class="diagram-close" id="demo1-close">Dismiss</button>
      </div>`;
    document.body.appendChild(overlay);
    document.getElementById('demo1-close').addEventListener('click', () => {
      overlay.classList.remove('visible');
    });
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

  let title, desc, diagramType, secure, labelLeft, labelRight, algo, algoSub;

  if (step === 'rsa_classical') {
    title = 'Classical System — RSA-2048';
    desc = 'RSA security relies on the difficulty of factoring large numbers. Currently secure against classical computers.';
    diagramType = 'classical'; secure = true;
    labelLeft = 'ALICE'; labelRight = 'BOB'; algo = 'RSA-2048'; algoSub = 'Factoring-based · 2048-bit modulus';
    if (payload.publicKeyHex) {
      keyInfo.style.display = 'block';
      pubkeyEl.textContent = payload.publicKeyHex.slice(0, 64) + '...';
    }
  } else if (step === 'quantum_attack') {
    title = 'Quantum Attack — Shor\'s Algorithm';
    desc = 'A cryptographically relevant quantum computer can run Shor\'s Algorithm and recover the RSA private key from the public modulus alone.';
    diagramType = 'quantum'; secure = false;
    labelLeft = 'QUANTUM'; labelRight = 'RSA KEY'; algo = 'SHOR\'S ALGORITHM'; algoSub = 'Period-finding · O(log³N) qubits';
    if (payload.publicKeyHex) {
      keyInfo.style.display = 'block';
      pubkeyEl.textContent = payload.publicKeyHex.slice(0, 64) + '... ← recoverable';
    }
  } else if (step === 'kyber_switch') {
    title = 'Post-Quantum System — ML-KEM-1024';
    desc = 'Kyber/ML-KEM is based on module learning-with-errors lattice problems. No efficient quantum algorithm equivalent to Shor\'s is known for these.';
    diagramType = 'pqc'; secure = true;
    labelLeft = 'ALICE'; labelRight = 'BOB'; algo = 'ML-KEM-1024'; algoSub = 'FIPS 203 · Lattice-based · Quantum-resistant';
    keyInfo.style.display = 'none';
  }

  if (titleEl) titleEl.textContent = title;
  if (descEl) descEl.textContent = desc;
  if (svgWrap) svgWrap.innerHTML = renderConnectionDiagram({ labelLeft, labelRight, algo, algoSub, secure, type: diagramType });

  overlay.classList.add('visible');
}
