import test from 'node:test';
import assert from 'node:assert/strict';
import { epochLabel, formatFingerprint, hexToBytes, nextEpoch, randomBytes, signHmac, toHex, truncateCiphertext, verifyHmac } from '../src/crypto.js';

test('formats bytes for telemetry display', () => {
  const bytes = Uint8Array.from([0, 15, 16, 255]);
  assert.equal(toHex(bytes), '000F10FF');
  assert.equal(formatFingerprint(bytes), '00:0F:10:FF');
});

test('advances and formats ratchet epochs', () => {
  assert.equal(nextEpoch(9), 10);
  assert.equal(epochLabel(7), '007');
  assert.throws(() => nextEpoch(-1), /non-negative/);
});

test('creates random material of the requested size', () => {
  const deterministicCrypto = { getRandomValues: value => value.fill(0xab) };
  assert.deepEqual(randomBytes(4, deterministicCrypto), Uint8Array.from([171, 171, 171, 171]));
  assert.throws(() => randomBytes(0, deterministicCrypto), /positive integer/);
});

test('truncates ciphertext while preserving both ends', () => {
  const value = truncateCiphertext(Uint8Array.from({ length: 20 }, (_, index) => index), 10);
  assert.equal(value, '0001020304…10111213');
});


test('derives consistent HMAC signatures', async () => {
  const key = Uint8Array.from({ length: 32 }, (_, i) => i);
  const data = new TextEncoder().encode('test-payload');
  const sig1 = await signHmac(data, key);
  const sig2 = await signHmac(data, key);
  assert.equal(sig1, sig2);
  assert.equal(sig1.length, 64);
});

test('verifies valid HMAC and rejects tampered data', async () => {
  const key = Uint8Array.from({ length: 32 }, (_, i) => i);
  const data = new TextEncoder().encode('authentic');
  const sig = await signHmac(data, key);
  assert.equal(await verifyHmac(data, key, sig), true);
  const tampered = new TextEncoder().encode('tampered');
  assert.equal(await verifyHmac(tampered, key, sig), false);
});

test('hexToBytes round-trips with toHex', () => {
  const original = Uint8Array.from([0, 127, 255, 16, 32]);
  assert.deepEqual(hexToBytes(toHex(original)), original);
});
