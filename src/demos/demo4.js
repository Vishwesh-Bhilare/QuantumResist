import { showPipeline, hidePipeline } from '../ui/pipeline.js';

let _state = null;

export function initDemo4(state) {
  _state = state;
}

export function handleDemo4Control(message) {
  // message can be a WebSocket demo_control object OR a direct call object
  const action = message?.action || message?.type;
  const payload = message?.payload || message;

  if (action === 'pipeline_send') {
    renderSendPipeline(payload);
    return;
  }
  if (action === 'pipeline_receive') {
    renderReceivePipeline(payload);
    return;
  }
}

function renderSendPipeline(payload) {
  const { keyHex, ivHex, hmac, ciphertextHex, plaintext, epoch } = payload;

  const steps = [
    {
      name: 'PLAINTEXT',
      label: `EPOCH ${String(epoch).padStart(3, '0')}`,
      value: plaintext?.slice(0, 22) || '...',
    },
    {
      name: 'ML-KEM KEY',
      label: 'DERIVED MESSAGE KEY',
      value: (keyHex || '').slice(0, 16) + '…',
    },
    {
      name: 'AES-256-GCM',
      label: `IV · ${(ivHex || '').slice(0, 12)}…`,
      value: (ciphertextHex || '').slice(0, 14) + '…',
    },
    {
      name: 'HMAC-SHA-256',
      label: 'SIGNATURE',
      value: (hmac || '').slice(0, 16) + '…',
    },
  ];

  showPipeline('ALICE → ENCRYPTING MESSAGE', steps, 'send');
}

function renderReceivePipeline(payload) {
  const { keyHex, ivHex, hmac, ciphertextHex, plaintext, epoch } = payload;

  const steps = [
    {
      name: 'CIPHERTEXT',
      label: `EPOCH ${String(epoch).padStart(3, '0')}`,
      value: (ciphertextHex || '').slice(0, 14) + '…',
    },
    {
      name: 'VERIFY HMAC',
      label: 'SIGNATURE CHECK',
      value: (hmac || '').slice(0, 16) + '… ✓',
    },
    {
      name: 'DERIVE KEY',
      label: 'MESSAGE KEY',
      value: (keyHex || '').slice(0, 16) + '…',
    },
    {
      name: 'DECRYPTED',
      label: `IV · ${(ivHex || '').slice(0, 12)}…`,
      value: plaintext?.slice(0, 22) || '...',
    },
  ];

  showPipeline('BOB → DECRYPTING MESSAGE', steps, 'receive');
}
