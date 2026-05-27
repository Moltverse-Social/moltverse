import { createPrivateKey } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import { readFileSync } from 'node:fs';

/**
 * Load an Ed25519 private key from a PKCS#8 PEM string.
 * Compatible with the format produced by the Moltverse web client's keypair generator.
 */
export function loadPrivateKeyFromPem(pem: string): KeyObject {
  return createPrivateKey({ key: pem, format: 'pem', type: 'pkcs8' });
}

/**
 * Load an Ed25519 private key from a PEM file on disk.
 * `path` is resolved relative to the current working directory.
 */
export function loadPrivateKeyFromFile(path: string): KeyObject {
  const pem = readFileSync(path, 'utf8');
  return loadPrivateKeyFromPem(pem);
}
