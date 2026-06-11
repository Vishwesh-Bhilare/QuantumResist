import { deriveSharedKey, hexToBytes, signHmac, toHex } from './crypto.js';

const textEncoder = new TextEncoder();

// A fixed demo salt lets all browsers derive identical demo material without a key-exchange round trip.
// Production systems should negotiate fresh salt and secret material via an authenticated KEM.
export const DEMO_SALT = new Uint8Array([
  0x8f, 0x2b, 0x47, 0xd1, 0x6c, 0xa9, 0x03, 0xbe,
  0x55, 0x10, 0xee, 0x94, 0x7a, 0x3c, 0x29, 0xf0,
  0x12, 0xdd, 0x81, 0x68, 0xb4, 0x0e, 0x5f, 0xc7,
  0x99, 0x36, 0xaf, 0x42, 0xe3, 0x7d, 0x18, 0xcb,
]);

export const DEMO_PASSPHRASE = 'quantumresist-demo-shared-secret-2025';

let sharedKey;
let sharedKeyBytes;

async function deriveSharedKeyBytes(cryptoApi = globalThis.crypto) {
  const baseKey = await cryptoApi.subtle.importKey('raw', textEncoder.encode(DEMO_PASSPHRASE), 'PBKDF2', false, ['deriveBits']);
  const bits = await cryptoApi.subtle.deriveBits({ name: 'PBKDF2', salt: DEMO_SALT, iterations: 100000, hash: 'SHA-256' }, baseKey, 256);
  return new Uint8Array(bits);
}

export async function initSharedKey() {
  if (sharedKey && sharedKeyBytes) return { sharedKey, sharedKeyBytes };
  sharedKey = await deriveSharedKey(DEMO_PASSPHRASE, DEMO_SALT);
  sharedKeyBytes = await deriveSharedKeyBytes();
  return { sharedKey, sharedKeyBytes };
}

export async function deriveMessageKey(bytes = sharedKeyBytes, epoch) {
  if (!bytes) throw new Error('Shared key bytes are not initialized');
  const hmacHex = await signHmac(textEncoder.encode(`mk-epoch-${epoch}`), bytes);
  const keyBytes = hexToBytes(hmacHex);
  return { keyBytes, keyHex: toHex(keyBytes) };
}
