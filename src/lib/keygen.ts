/**
 * Ethereum key pair generation using Node.js crypto + secp256k1.
 *
 * Avoids requiring viem as a dependency for wallet creation.
 * Uses the same secp256k1 curve and keccak256 hashing as viem/ethers.
 */

import * as crypto from 'crypto';

/**
 * Generate an Ethereum key pair.
 * Returns { privateKey: '0x...', address: '0x...' }
 */
export function createKeyPair(): { privateKey: string; address: string } {
  // Try viem first (better UX, standard library)
  try {
    const { generatePrivateKey, privateKeyToAccount } = require('viem/accounts');
    const pk = generatePrivateKey();
    const account = privateKeyToAccount(pk);
    return { privateKey: pk, address: account.address };
  } catch {
    // viem not available — fall back to pure Node.js
  }

  // Generate random 32-byte private key
  const privateKeyBytes = crypto.randomBytes(32);
  const privateKey = '0x' + privateKeyBytes.toString('hex');

  // Derive public key (uncompressed, 65 bytes — drop the 0x04 prefix to get 64 bytes)
  const ecdh = crypto.createECDH('secp256k1');
  ecdh.setPrivateKey(privateKeyBytes);
  const publicKeyUncompressed = ecdh.getPublicKey();
  // Remove the 0x04 prefix byte
  const publicKeyBytes = publicKeyUncompressed.subarray(1);

  // Keccak256 of the public key, take last 20 bytes as address
  const hash = keccak256(publicKeyBytes);
  const addressBytes = hash.subarray(hash.length - 20);
  const address = toChecksumAddress('0x' + addressBytes.toString('hex'));

  return { privateKey, address };
}

/**
 * Keccak256 hash (SHA-3 variant used by Ethereum).
 * Node.js crypto doesn't have keccak256 natively, so we use
 * the 'sha3-256' algorithm which IS keccak256 in Node.js >= 18.
 */
function keccak256(data: Buffer): Buffer {
  // Node.js uses 'sha3-256' for the NIST SHA-3, but Ethereum uses
  // the original Keccak-256 (pre-NIST). They have different padding.
  // We need the original Keccak. Try to find it.
  try {
    // Some Node builds support 'keccak256' directly
    return crypto.createHash('keccak256' as any).update(data).digest();
  } catch {
    // Fallback: try to use the keccak package if available
    try {
      const { keccak256: keccakFn } = require('ethereum-cryptography/keccak');
      return Buffer.from(keccakFn(data));
    } catch {
      // Last resort: try viem's keccak
      try {
        const { keccak256: viemKeccak } = require('viem');
        const hex = viemKeccak(data);
        return Buffer.from(hex.slice(2), 'hex');
      } catch {
        throw new Error(
          'Cannot generate wallet: no keccak256 implementation available. ' +
          'Install viem (pnpm add viem) or run lobstrclaw setup --import-key <your-key>',
        );
      }
    }
  }
}

/**
 * Convert an address to EIP-55 checksum format.
 */
function toChecksumAddress(address: string): string {
  const addr = address.toLowerCase().replace('0x', '');
  let hash: string;

  try {
    hash = crypto.createHash('keccak256' as any).update(addr).digest('hex');
  } catch {
    // Without keccak256, return lowercase (valid but not checksummed)
    return '0x' + addr;
  }

  let checksummed = '0x';
  for (let i = 0; i < addr.length; i++) {
    checksummed += parseInt(hash[i], 16) >= 8
      ? addr[i].toUpperCase()
      : addr[i];
  }
  return checksummed;
}
