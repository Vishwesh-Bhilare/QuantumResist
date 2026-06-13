// session.js - Ratchet-based session key management with message key cache
// Supports decryption of past epochs without mutating ratchet state.
import { hexToBytes, signHmac, toHex } from './crypto.js';

const textEncoder = new TextEncoder();

// No hardcoded secrets, salts or passphrases.
let sharedKeyBytes = null;

// Ratchet state
let currentRootKey = null;      // Current root key (Uint8Array)
let currentEpoch = 0;           // Next message epoch (0‑based)
let deletedEpochs = [];         // Epochs that have been ratcheted past (root key destroyed)

// Cache for message keys of past (and current) epochs.
// Key: epoch (number), value: Uint8Array message key.
const messageKeyCache = new Map();
const MAX_CACHED_KEYS = 32;

/**
 * Helper: trim cache to max size (remove oldest entries)
 */
function trimCache() {
  while (messageKeyCache.size > MAX_CACHED_KEYS) {
    const oldest = Math.min(...messageKeyCache.keys());
    messageKeyCache.delete(oldest);
  }
}

/**
 * Alice: generates a fresh 32-byte random session secret.
 */
export async function generateSessionSecret(cryptoApi = globalThis.crypto) {
  const bytes = new Uint8Array(32);
  cryptoApi.getRandomValues(bytes);
  sharedKeyBytes = bytes;
  return { sharedKeyBytes, secretHex: toHex(bytes) };
}

/**
 * Bob/Eve: receives the secret hex from the WebSocket and stores it.
 */
export function receiveSessionSecret(secretHex) {
  sharedKeyBytes = hexToBytes(secretHex);
  return sharedKeyBytes;
}

/**
 * Returns the current shared key bytes (initial root key).
 */
export function getSharedKeyBytes() {
  return sharedKeyBytes;
}

/**
 * Initialises the ratchet chain from the shared secret.
 */
export async function initializeRatchet() {
  if (!sharedKeyBytes) {
    throw new Error('Session secret not initialised');
  }
  currentRootKey = new Uint8Array(sharedKeyBytes);
  currentEpoch = 0;
  deletedEpochs = [];
  messageKeyCache.clear();
}

/**
 * Returns the current epoch (next message index, 0‑based).
 */
export function getCurrentEpoch() {
  return currentEpoch;
}

/**
 * Derives a message key for the given epoch WITHOUT mutating ratchet state.
 *
 * - If epoch equals currentEpoch: derives key from current root key (no advance).
 * - If epoch is less than currentEpoch: returns cached key if available.
 * - If epoch is greater than currentEpoch: throws error.
 *
 * Forward secrecy: past root keys are never recovered, but their message keys
 * are cached for a limited time (up to MAX_CACHED_KEYS) to allow decryption of
 * delayed messages.
 */
export async function deriveMessageKey(epoch) {
  if (!currentRootKey) {
    throw new Error('Ratchet not initialised. Call initializeRatchet first.');
  }
  if (epoch > currentEpoch) {
    throw new Error(`Cannot derive key for future epoch ${epoch}. Current epoch is ${currentEpoch}.`);
  }

  // Check cache for past or current epoch (including current if already cached)
  if (messageKeyCache.has(epoch)) {
    const keyBytes = messageKeyCache.get(epoch);
    return { keyBytes, keyHex: toHex(keyBytes) };
  }

  // Must be current epoch (epoch === currentEpoch) and not cached
  if (epoch === currentEpoch) {
    const messageKeyHex = await signHmac(textEncoder.encode('message'), currentRootKey);
    const messageKeyBytes = hexToBytes(messageKeyHex);
    // Optionally cache the current key as well (so future deriveMessageKey(currentEpoch) works)
    messageKeyCache.set(epoch, messageKeyBytes);
    trimCache();
    return { keyBytes: messageKeyBytes, keyHex: messageKeyHex };
  }

  // epoch < currentEpoch but not in cache → impossible to recover (forward secrecy)
  throw new Error(`Key for epoch ${epoch} already deleted and not cached (forward secrecy).`);
}

/**
 * Advances the ratchet by one step:
 * - Derives and caches the message key for the current epoch.
 * - Replaces current root key with HMAC(currentRootKey, "ratchet").
 * - Increments currentEpoch and marks the previous epoch as deleted.
 *
 * Does NOT return a message key. Call deriveMessageKey(epoch) before advancing
 * if you need the key for sending or receiving.
 */
export async function advanceRatchet() {
  if (!currentRootKey) {
    throw new Error('Ratchet not initialised. Call initializeRatchet first.');
  }

  // Derive and cache message key for the epoch we are about to leave
  const msgKeyHex = await signHmac(textEncoder.encode('message'), currentRootKey);
  const msgKeyBytes = hexToBytes(msgKeyHex);
  messageKeyCache.set(currentEpoch, msgKeyBytes);
  trimCache();

  // Advance root key
  const newRootHex = await signHmac(textEncoder.encode('ratchet'), currentRootKey);
  const newRootBytes = hexToBytes(newRootHex);
  deletedEpochs.push(currentEpoch);
  currentRootKey = newRootBytes;
  currentEpoch++;
}

/**
 * Returns the current root key as a hex string (for visualisation).
 */
export async function getCurrentRootKey() {
  if (!currentRootKey) return null;
  return toHex(currentRootKey);
}

/**
 * Returns an array of epoch numbers that have been ratcheted past (root key destroyed).
 */
export function getDeletedEpochs() {
  return [...deletedEpochs];
}

/**
 * Derives an AES-GCM CryptoKey from the message key of the given epoch.
 * Uses deriveMessageKey internally – does NOT advance ratchet.
 */
export async function deriveAesKey(epoch, usage = ['encrypt', 'decrypt'], cryptoApi = globalThis.crypto) {
  const { keyBytes } = await deriveMessageKey(epoch);
  return cryptoApi.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, usage);
}
