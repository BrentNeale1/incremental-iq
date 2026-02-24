import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * AES-256-GCM token encryption for OAuth credential storage.
 *
 * OAuth tokens (access + refresh) must NEVER be stored in plaintext — they grant
 * full ad account access. This module encrypts tokens before writing to the
 * integrations table and decrypts them when the ingestion pipeline needs to
 * authenticate with ad platform APIs.
 *
 * Key requirements:
 *   TOKEN_ENCRYPTION_KEY must be a 32-byte (256-bit) key encoded as 64 hex characters.
 *   Generate with: node -e "require('crypto').randomBytes(32).toString('hex')"
 *
 * Wire format: base64( iv[12] || authTag[16] || ciphertext )
 *   - iv (12 bytes): random IV per encryption — reusing IVs breaks GCM security
 *   - authTag (16 bytes): GCM authentication tag — detects ciphertext tampering
 *   - ciphertext: AES-256-GCM encrypted token bytes
 *
 * Why AES-256-GCM:
 *   - 256-bit key: NIST-recommended for long-term protection
 *   - GCM (Galois/Counter Mode): authenticated encryption — decryption fails if
 *     ciphertext is tampered with, preventing silent data corruption
 *   - Node.js built-in crypto: no additional dependency, FIPS-compliant
 */

const ALGORITHM = 'aes-256-gcm';

function getKey(): Buffer {
  const hex = process.env.TOKEN_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error('TOKEN_ENCRYPTION_KEY environment variable is not set');
  }
  if (hex.length !== 64) {
    throw new Error(
      `TOKEN_ENCRYPTION_KEY must be 64 hex characters (32 bytes). Got ${hex.length} characters.`
    );
  }
  return Buffer.from(hex, 'hex');
}

/**
 * Encrypts a plaintext OAuth token string using AES-256-GCM.
 *
 * @param plaintext - The raw token string to encrypt (access token or refresh token)
 * @returns Base64-encoded string containing iv + authTag + ciphertext
 */
export function encryptToken(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

/**
 * Decrypts an AES-256-GCM encrypted token string.
 *
 * @param ciphertext - Base64-encoded string produced by encryptToken
 * @returns The original plaintext token string
 * @throws If the ciphertext has been tampered with (GCM auth tag mismatch)
 * @throws If TOKEN_ENCRYPTION_KEY is missing or incorrect
 */
export function decryptToken(ciphertext: string): string {
  const key = getKey();
  const buf = Buffer.from(ciphertext, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
