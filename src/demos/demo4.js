import { showPipeline } from '../ui/pipeline.js';

let _state = null;

export function initDemo4(state) {
  _state = state;
}

// Called directly from app.js (not via WebSocket) for local send/receive
// Also called from handleDemoControl for any future remote pipeline triggers
export function handleDemo4Control(message) {
  const action = message?.action;
  const payload = message?.payload || {};

  if (action === 'pipeline_send') {
    renderSendPipeline(payload);
    return;
  }
  if (action === 'pipeline_receive') {
    renderReceivePipeline(payload);
    return;
  }
  // Ignore unknown actions silently
}

function renderSendPipeline({ keyHex = '', ivHex = '', hmac = '', ciphertextHex = '', plaintext = '', epoch = 1 }) {
  const steps = [
    { name: 'PLAINTEXT', label: `EPOCH ${String(epoch).padStart(3, '0')}`, value: String(plaintext).slice(0, 22) || '…' },
    { name: 'ML-KEM KEY', label: 'DERIVED MSG KEY', value: keyHex.slice(0, 16) + '…' },
    { name: 'AES-256-GCM', label: `IV · ${ivHex.slice(0, 10)}…`, value: ciphertextHex.slice(0, 14) + '…' },
    { name: 'HMAC-SHA-256', label: 'SIGNATURE', value: hmac.slice(0, 16) + '…' },
  ];
  showPipeline('ALICE → ENCRYPTING MESSAGE', steps, 'send');
}

function renderReceivePipeline({ keyHex = '', ivHex = '', hmac = '', ciphertextHex = '', plaintext = '', epoch = 1 }) {
  const steps = [
    { name: 'CIPHERTEXT', label: `EPOCH ${String(epoch).padStart(3, '0')}`, value: ciphertextHex.slice(0, 14) + '…' },
    { name: 'VERIFY HMAC', label: 'SIGNATURE CHECK', value: hmac.slice(0, 16) + '… ✓' },
    { name: 'DERIVE KEY', label: 'MESSAGE KEY', value: keyHex.slice(0, 16) + '…' },
    { name: 'DECRYPTED', label: `IV · ${ivHex.slice(0, 10)}…`, value: String(plaintext).slice(0, 22) || '…' },
  ];
  showPipeline('BOB → DECRYPTING MESSAGE', steps, 'receive');
}
