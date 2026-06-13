/**
 * Classical Crypto Module
 * Simulates traditional RSA + AES cryptography WITHOUT forward secrecy
 * Used for comparison in the attack demo
 * 
 * This module provides:
 * - Static AES-256-GCM encryption (same key for all messages)
 * - Simulated RSA key exchange (for demo purposes)
 * - Shor's algorithm simulation (educational)
 */

let _classicalSessionKey = null;
let _classicalKeyBytes = null;

/**
 * Generate a random 32-byte session key (simulates RSA-encrypted key exchange)
 * In a real system, RSA would encrypt this key during handshake
 */
export function generateClassicalSessionKey(cryptoApi = globalThis.crypto) {
  const bytes = new Uint8Array(32);
  cryptoApi.getRandomValues(bytes);
  _classicalSessionKey = bytesToHex(bytes);
  _classicalKeyBytes = bytes;
  return { keyBytes: bytes, keyHex: _classicalSessionKey };
}

/**
 * Get the current classical session key (hex string)
 */
export function getClassicalSessionKey() {
  return _classicalSessionKey;
}

/**
 * Get the current classical session key (Uint8Array)
 */
export function getClassicalKeyBytes() {
  if (!_classicalKeyBytes && _classicalSessionKey) {
    _classicalKeyBytes = hexToBytes(_classicalSessionKey);
  }
  return _classicalKeyBytes;
}

/**
 * Set the classical session key (for Bob/Eve receiving from Alice)
 */
export function setClassicalSessionKey(secretHex) {
  _classicalSessionKey = secretHex;
  _classicalKeyBytes = hexToBytes(secretHex);
  return _classicalKeyBytes;
}

/**
 * Classical encryption using AES-256-GCM (static key, no forward secrecy)
 * This represents how traditional systems work - same key for all messages
 */
export async function classicalEncrypt(plaintext, keyBytes = null, cryptoApi = globalThis.crypto) {
  const useKey = keyBytes || getClassicalKeyBytes();
  if (!useKey) {
    throw new Error('Classical session key not initialized');
  }
  
  const iv = randomBytes(12, cryptoApi);
  const key = await cryptoApi.subtle.importKey('raw', useKey, { name: 'AES-GCM' }, false, ['encrypt']);
  const encoded = new TextEncoder().encode(plaintext);
  const encrypted = new Uint8Array(await cryptoApi.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded));
  
  return { iv, encrypted };
}

/**
 * Classical decryption using AES-256-GCM (static key)
 */
export async function classicalDecrypt(ciphertext, iv, keyBytes = null, cryptoApi = globalThis.crypto) {
  const useKey = keyBytes || getClassicalKeyBytes();
  if (!useKey) {
    throw new Error('Classical session key not initialized');
  }
  
  const key = await cryptoApi.subtle.importKey('raw', useKey, { name: 'AES-GCM' }, false, ['decrypt']);
  const decrypted = await cryptoApi.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(decrypted);
}

/**
 * Simulate RSA key pair generation (for display purposes only)
 * In a real system, RSA would be used for key exchange during handshake
 */
export async function generateRSAKeyPair() {
  try {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256'
      },
      true,
      ['encrypt', 'decrypt']
    );
    
    const publicKeySpki = await crypto.subtle.exportKey('spki', keyPair.publicKey);
    const privateKeyPkcs8 = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
    
    return {
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey,
      publicKeyHex: bytesToHex(new Uint8Array(publicKeySpki)).slice(0, 64) + '…',
      privateKeyHex: bytesToHex(new Uint8Array(privateKeyPkcs8)).slice(0, 64) + '…',
      modulusLength: 2048
    };
  } catch (error) {
    console.warn('RSA key generation failed (may not be supported in all contexts):', error);
    return {
      publicKeyHex: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA…[simulated]',
      privateKeyHex: 'MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBA…[simulated]',
      modulusLength: 2048
    };
  }
}

/**
 * Simulate RSA encryption of a session key (classical key exchange)
 * This demonstrates how the classical session key would be exchanged
 */
export async function rsaEncryptSessionKey(sessionKeyBytes, publicKey) {
  try {
    if (publicKey && typeof publicKey === 'object' && publicKey.algorithm) {
      // Real RSA encryption
      const encrypted = await crypto.subtle.encrypt(
        { name: 'RSA-OAEP' },
        publicKey,
        sessionKeyBytes
      );
      return new Uint8Array(encrypted);
    } else {
      // Simulated for demo when no real key is available
      return new Uint8Array([0x52, 0x53, 0x41, 0x5f, 0x45, 0x4e, 0x43, 0x5f, ...sessionKeyBytes.slice(0, 16)]);
    }
  } catch (error) {
    console.warn('RSA encryption failed:', error);
    // Return simulated encrypted data for demo continuity
    return new Uint8Array([0x52, 0x53, 0x41, 0x5f, 0x45, 0x4e, 0x43, 0x5f, ...sessionKeyBytes.slice(0, 16)]);
  }
}

/**
 * Simulate RSA decryption of a session key
 */
export async function rsaDecryptSessionKey(encryptedKeyBytes, privateKey) {
  try {
    if (privateKey && typeof privateKey === 'object' && privateKey.algorithm) {
      const decrypted = await crypto.subtle.decrypt(
        { name: 'RSA-OAEP' },
        privateKey,
        encryptedKeyBytes
      );
      return new Uint8Array(decrypted);
    } else {
      // Simulated for demo
      // Extract from the simulated encrypted data
      return new Uint8Array(encryptedKeyBytes.slice(8, 40));
    }
  } catch (error) {
    console.warn('RSA decryption failed:', error);
    return null;
  }
}

/**
 * Simulate Shor's algorithm breaking RSA (for demo purposes)
 * This is an educational simulation - no actual quantum computation occurs
 */
export function simulateShorAttack(publicKeyHex = null) {
  // Generate a plausible-looking "recovered" private key
  const recoveredPrivateKey = 'shor_recovered_' + (publicKeyHex || 'RSA2048').slice(0, 20) + '_' + Date.now().toString(36);
  
  return {
    success: true,
    privateKey: recoveredPrivateKey,
    timeEstimate: '~10-20 minutes on CRQC with 20M physical qubits',
    description: 'Shor\'s algorithm efficiently factors the RSA modulus, recovering the private key from the public key alone',
    steps: [
      '1. Initialize quantum register with n qubits',
      '2. Apply superposition to create periodic state',
      '3. Perform quantum Fourier transform',
      '4. Measure to find period r',
      '5. Use continued fractions to extract factors p and q',
      '6. Compute private exponent d = e⁻¹ mod λ(N)'
    ],
    complexity: 'O((log N)³) quantum gates'
  };
}

/**
 * Simulate Grover's algorithm attack on AES (theoretical)
 * Grover's algorithm provides quadratic speedup for brute force searches
 */
export function simulateGroverAttack(keySize = 256) {
  const classicalComplexity = Math.pow(2, keySize);
  const quantumComplexity = Math.pow(2, keySize / 2);
  
  return {
    success: false, // Grover doesn't fully break AES, just reduces security
    classicalComplexity: `2^${keySize} operations`,
    quantumComplexity: `2^${keySize / 2} operations (${Math.log2(quantumComplexity).toFixed(0)}-bit security)`,
    securityAfterGrover: keySize === 256 ? '~128 bits quantum security' : 'Reduced but still impractical',
    description: `Grover's algorithm provides quadratic speedup for brute force. AES-${keySize} still provides ~${keySize / 2} bits of quantum security.`,
    practicalImplication: keySize === 256 
      ? 'AES-256 remains secure against Grover\'s algorithm (2^128 operations is still impossible)'
      : 'Larger key sizes recommended for quantum resistance'
  };
}

/**
 * Simulate a classical man-in-the-middle attack on the classical system
 * This shows how static keys make MITM attacks easier
 */
export function simulateClassicalMITMAttack() {
  return {
    success: true,
    description: 'Without forward secrecy, an attacker who captures the static AES key can decrypt ALL past and future messages',
    impact: 'COMPLETE COMPROMISE of all communications',
    detectionTime: 'Impossible to detect - attacker has legitimate keys'
  };
}

/**
 * Demonstrate the difference between static and ratcheted keys
 * Shows why forward secrecy matters
 */
export function demonstrateForwardSecrecy(keys = []) {
  const demo = {
    staticKeySystem: {
      keyCompromised: true,
      pastMessagesDecryptable: true,
      futureMessagesDecryptable: true,
      explanation: 'Static key compromise exposes ALL messages'
    },
    ratchetSystem: {
      keyCompromised: true,
      pastMessagesDecryptable: false,
      futureMessagesDecryptable: true, // Only if attacker continues intercepting
      explanation: 'Ratchet ensures past keys are irrecoverable'
    }
  };
  
  return demo;
}

// ── Utility Functions ─────────────────────────────────────────────────────────

function bytesToHex(bytes) {
  if (!bytes) return '';
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function hexToBytes(hex) {
  if (typeof hex !== 'string' || hex.length % 2 !== 0 || /[^0-9a-f]/i.test(hex)) {
    throw new TypeError('hex must be an even-length hexadecimal string');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function randomBytes(length, cryptoApi = globalThis.crypto) {
  if (!Number.isInteger(length) || length < 1) throw new TypeError('length must be a positive integer');
  const bytes = new Uint8Array(length);
  cryptoApi.getRandomValues(bytes);
  return bytes;
}

// Export all functions
export default {
  generateClassicalSessionKey,
  getClassicalSessionKey,
  getClassicalKeyBytes,
  setClassicalSessionKey,
  classicalEncrypt,
  classicalDecrypt,
  generateRSAKeyPair,
  rsaEncryptSessionKey,
  rsaDecryptSessionKey,
  simulateShorAttack,
  simulateGroverAttack,
  simulateClassicalMITMAttack,
  demonstrateForwardSecrecy
};
