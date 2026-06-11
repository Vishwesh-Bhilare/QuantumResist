import { hexToBytes, signHmac, toHex } from './crypto.js';

const textEncoder = new TextEncoder();

// Session secret is generated fresh by Alice at runtime via crypto.getRandomValues
// and shared to Bob/Eve over the WebSocket (intentionally insecure distribution —
// the security properties demonstrated come from the algorithms, not this channel).
// No hardcoded values.

let sharedKeyBytes = null;

/**
 * Called by Alice only. Generates a fresh 32-byte random shared secret,
 * stores it locally, and returns the hex string for broadcast.
 */
export async function generateSessionSecret(cryptoApi = globalThis.crypto) {
  const bytes = new Uint8Array(32);
  cryptoApi.getRandomValues(bytes);
  sharedKeyBytes = bytes;
  return { sharedKeyBytes, secretHex: toHex(bytes) };
}

/**
 * Called by Bob and Eve when they receive session_init from the server.
 * Stores the shared key bytes derived from Alice's broadcasted secret.
 */
export function receiveSessionSecret(secretHex) {
  sharedKeyBytes = hexToBytes(secretHex);
  return sharedKeyBytes;
}

/**
 * Returns current shared key bytes (null if not yet initialized).
 */
export function getSharedKeyBytes() {
  return sharedKeyBytes;
}

/**
 * Derives a per-epoch message key from the shared secret using HMAC-SHA-256.
 * Each epoch produces a unique key; prior keys are not recoverable from later ones.
 */
export async function deriveMessageKey(bytes, epoch) {
  const keyBytes = bytes ?? sharedKeyBytes;
  if (!keyBytes) throw new Error('Session secret not initialized');
  const hmacHex = await signHmac(textEncoder.encode(`mk-epoch-${epoch}`), keyBytes);
  const derivedBytes = hexToBytes(hmacHex);
  return { keyBytes: derivedBytes, keyHex: toHex(derivedBytes) };
}

/**
 * Derives an AES-GCM CryptoKey from the shared secret for direct use in encrypt/decrypt.
 */
export async function deriveAesKey(bytes, epoch, usage = ['encrypt', 'decrypt'], cryptoApi = globalThis.crypto) {
  const { keyBytes } = await deriveMessageKey(bytes, epoch);
  return cryptoApi.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, usage);
}
