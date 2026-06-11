export function toHex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function formatFingerprint(bytes, groups = 8) {
  return Array.from(bytes.slice(0, groups), byte => byte.toString(16).padStart(2, '0').toUpperCase()).join(':');
}

export function randomBytes(length, cryptoApi = globalThis.crypto) {
  if (!Number.isInteger(length) || length < 1) throw new TypeError('length must be a positive integer');
  const bytes = new Uint8Array(length);
  cryptoApi.getRandomValues(bytes);
  return bytes;
}

export function nextEpoch(epoch) {
  if (!Number.isInteger(epoch) || epoch < 0) throw new TypeError('epoch must be a non-negative integer');
  return epoch + 1;
}

export function epochLabel(epoch) {
  return String(epoch).padStart(3, '0');
}

export function truncateCiphertext(bytes, visible = 18) {
  const hex = toHex(bytes);
  return `${hex.slice(0, visible)}…${hex.slice(-8)}`;
}

export async function encryptMessage(plaintext, keyBytes, cryptoApi = globalThis.crypto) {
  const iv = randomBytes(12, cryptoApi);
  const key = await cryptoApi.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt']);
  const encoded = new TextEncoder().encode(plaintext);
  const encrypted = new Uint8Array(await cryptoApi.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded));
  return { iv, encrypted };
}

export function hexToBytes(hex) {
  if (typeof hex !== 'string' || hex.length % 2 !== 0 || /[^0-9a-f]/i.test(hex)) {
    throw new TypeError('hex must be an even-length hexadecimal string');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  return bytes;
}

export async function deriveSharedKey(passphrase, salt, cryptoApi = globalThis.crypto) {
  const encoded = new TextEncoder().encode(passphrase);
  const baseKey = await cryptoApi.subtle.importKey('raw', encoded, 'PBKDF2', false, ['deriveKey']);
  return cryptoApi.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function signHmac(data, keyBytes, cryptoApi = globalThis.crypto) {
  const key = await cryptoApi.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await cryptoApi.subtle.sign('HMAC', key, data);
  return toHex(new Uint8Array(signature));
}

export async function verifyHmac(data, keyBytes, expectedHex, cryptoApi = globalThis.crypto) {
  const key = await cryptoApi.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  return cryptoApi.subtle.verify('HMAC', key, hexToBytes(expectedHex), data);
}
