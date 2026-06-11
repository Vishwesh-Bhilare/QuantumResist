# QuantumResist

QuantumResist is an interactive hackathon demonstration of a post-quantum secure communication workflow. It visualizes a NIST PQC handshake, per-message key evolution, authenticated encryption, signature verification, and the different expected impact of quantum algorithms on RSA versus ML-KEM.

## Run locally

```bash
npm run dev
```

Open [http://localhost:4173](http://localhost:4173). No package installation is required.

## Demo flow

1. Inspect the live cryptographic stack and session fingerprint.
2. Send a message to trigger AES-256-GCM encryption and a key-ratchet epoch.
3. Inspect the key lifecycle to see prior message keys marked deleted.
4. Open **Quantum attack** and compare the explicitly simulated RSA-2048 and ML-KEM-1024 outcomes.
5. Reset the session to regenerate all ephemeral demo material.

## Cryptographic scope

- Message payloads entered in the browser are encrypted with the Web Crypto API's AES-256-GCM implementation.
- Key material and fingerprints are generated from the browser's cryptographically secure random source.
- ML-KEM-1024, ML-DSA-87, HKDF-SHA3-512, and the quantum attack are visualized as an educational reference workflow. The browser-only demo does **not** claim to implement those primitives or to execute quantum computation.
- For production deployment, connect the interface to an audited FIPS 203/FIPS 204 implementation such as Open Quantum Safe and perform the complete protocol in a reviewed backend or native client.

## Checks

```bash
npm test
npm run build
```
