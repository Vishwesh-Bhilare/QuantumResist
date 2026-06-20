// src/demos/demo1.js
// Demo 1: RSA vs Post-Quantum Attack
// Generates a real RSA-OAEP keypair for use across all demos

import { toHex } from '../crypto.js';
import { renderConnectionDiagram } from '../ui/diagrams.js';

let _state = null;
let _broadcast = null;
let _rsaKeyPair = null; // Store full RSA keypair for later demos (private + public)

export function initDemo1(state, broadcast) {
  _state = state;
  _broadcast = broadcast;
}

// Called by Eve console buttons — generates key on Eve's side and broadcasts
export async function launchDemo1Step(step, broadcast) {
  if (step === 'rsa_classical') {
    // Generate real RSA-OAEP key pair for encryption/decryption (2048-bit)
    const kp = await crypto.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true, // extractable — needed for export
      ['encrypt', 'decrypt']
    );
    
    _rsaKeyPair = kp;
    
    // Export both public and private keys as JWK
    const publicKeyJwk = await crypto.subtle.exportKey('jwk', kp.publicKey);
    const privateKeyJwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
    
    // Also export SPKI for hex display (backward compatibility)
    const spkiExported = await crypto.subtle.exportKey('spki', kp.publicKey);
    const publicKeyHex = toHex(new Uint8Array(spkiExported));
    
    // Extract modulus from JWK for display (first 64 hex chars of modulus)
    const modulusHex = publicKeyJwk.n; // n is the modulus in base64url
    // Convert base64url modulus to hex for display
    const modulusBytes = base64UrlToBytes(publicKeyJwk.n);
    const modulusDisplayHex = toHex(modulusBytes).slice(0, 64);
    
    // Broadcast RSA key generation first so server stores it for Demo 2
    broadcast('demo1_rsa_keygen', {
      publicKeyHex: publicKeyHex.slice(0, 64) + '…', // display only
      publicKeyJwk: publicKeyJwk,
      privateKeyJwk: privateKeyJwk,
      modulusHex: modulusDisplayHex,
    });
    
    // Then broadcast the step to trigger visualization
    broadcast('demo1_step', {
      step: 'rsa_classical',
      publicKeyHex: modulusDisplayHex,
    });
    return;
  }
  
  if (step === 'quantum_attack') {
    let modulusHex = null;
    if (_rsaKeyPair) {
      const publicKeyJwk = await crypto.subtle.exportKey('jwk', _rsaKeyPair.publicKey);
      const modulusBytes = base64UrlToBytes(publicKeyJwk.n);
      modulusHex = toHex(modulusBytes).slice(0, 64);
    }
    broadcast('demo1_step', { step: 'quantum_attack', publicKeyHex: modulusHex });
    return;
  }
  
  if (step === 'kyber_switch') {
    broadcast('demo1_step', { step: 'kyber_switch' });
  }
}

// Helper: convert base64url to Uint8Array
function base64UrlToBytes(base64url) {
  // Convert base64url to base64
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function handleDemo1Control(message, state, broadcast) {
  const { action, payload } = message;

  // Store RSA keypair when received (for Bob and Eve)
  if (action === 'demo1_rsa_keygen') {
    if (payload?.privateKeyJwk && payload?.publicKeyJwk) {
      // Import the JWK keys for later use (Eve and Bob need them for Demo 2)
      try {
        const publicKey = await crypto.subtle.importKey(
          'jwk',
          payload.publicKeyJwk,
          { name: 'RSA-OAEP', hash: 'SHA-256' },
          true,
          ['encrypt']
        );
        const privateKey = await crypto.subtle.importKey(
          'jwk',
          payload.privateKeyJwk,
          { name: 'RSA-OAEP', hash: 'SHA-256' },
          true,
          ['decrypt']
        );
        _rsaKeyPair = { publicKey, privateKey };
      } catch (err) {
        console.error('Failed to import RSA keypair:', err);
      }
    }
    return;
  }

  // Show diagram overlay on ALL screens
  if (action === 'demo1_step') {
    const step = payload?.step;
    if (step === 'rsa_classical') showDiagramOverlay('rsa_classical', payload);
    else if (step === 'quantum_attack') showDiagramOverlay('quantum_attack', payload);
    else if (step === 'kyber_switch') showDiagramOverlay('kyber_switch', payload);
  }
}

// Get RSA keypair (for other demos like Demo 2)
export function getRSAKeyPair() {
  return _rsaKeyPair;
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
          <div style="color:#4a6165;font:7px var(--mono);letter-spacing:.8px;margin-bottom:5px">RSA-2048 PUBLIC MODULUS (first 64 hex chars)</div>
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
    type = 'classical';
    secure = true;
    labelLeft = 'ALICE';
    labelRight = 'BOB';
    algo = 'RSA-2048';
    algoSub = 'Factoring-based · 2048-bit modulus';
    if (payload.publicKeyHex && keyInfo && pubkeyEl) {
      keyInfo.style.display = 'block';
      pubkeyEl.textContent = payload.publicKeyHex.slice(0, 64) + '…';
    }
  } else if (step === 'quantum_attack') {
    title = "Quantum Attack — Shor's Algorithm";
    desc = "A cryptographically relevant quantum computer runs Shor's Algorithm and recovers the RSA private key from the public modulus alone.";
    type = 'quantum';
    secure = false;
    labelLeft = 'QUANTUM';
    labelRight = 'RSA KEY';
    algo = "SHOR'S ALGORITHM";
    algoSub = 'Period-finding · O(log³N) qubits';
    if (payload.publicKeyHex && keyInfo && pubkeyEl) {
      keyInfo.style.display = 'block';
      pubkeyEl.textContent = `${payload.publicKeyHex.slice(0, 64)}… ← private key recoverable from public modulus`;
    }
  } else if (step === 'kyber_switch') {
    title = 'Post-Quantum System — ML-KEM-1024';
    desc = 'ML-KEM is based on the Module Learning With Errors lattice problem. No efficient quantum algorithm equivalent to Shor\'s is known for this.';
    type = 'pqc';
    secure = true;
    labelLeft = 'ALICE';
    labelRight = 'BOB';
    algo = 'ML-KEM-1024';
    algoSub = 'FIPS 203 · Lattice-based · Quantum-resistant';
    if (keyInfo) keyInfo.style.display = 'none';
  }

  if (titleEl) titleEl.textContent = title;
  if (descEl) descEl.textContent = desc;
  if (svgWrap) svgWrap.innerHTML = renderConnectionDiagram({ labelLeft, labelRight, algo, algoSub, secure, type });

  requestAnimationFrame(() => overlay.classList.add('visible'));
}
