/**
 * Shared encryption utilities for edge functions.
 * Layer 1: AES-256-GCM (application-level encryption)
 *
 * Usage:
 *   import { encrypt, decrypt } from "../_shared/encryption.ts";
 *   const ciphertext = await encrypt("my-secret", Deno.env.get("ENCRYPTION_KEY")!);
 *   const plaintext  = await decrypt(ciphertext,   Deno.env.get("ENCRYPTION_KEY")!);
 */

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Encrypt plaintext with AES-256-GCM.
 * Returns a base64 string of (12-byte IV || ciphertext || 16-byte auth tag).
 */
export async function encrypt(plaintext: string, hexKey: string): Promise<string> {
  const enc = new TextEncoder();
  const keyData = await crypto.subtle.importKey(
    "raw",
    hexToBytes(hexKey),
    "AES-GCM",
    false,
    ["encrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, keyData, enc.encode(plaintext)),
  );
  const combined = new Uint8Array(12 + ciphertext.byteLength);
  combined.set(iv);
  combined.set(ciphertext, 12);
  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt an AES-256-GCM ciphertext produced by `encrypt()`.
 */
export async function decrypt(encrypted: string, hexKey: string): Promise<string> {
  const combined = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const keyData = await crypto.subtle.importKey(
    "raw",
    hexToBytes(hexKey),
    "AES-GCM",
    false,
    ["decrypt"],
  );
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    keyData,
    ciphertext,
  );
  return new TextDecoder().decode(plaintext);
}

/**
 * Try to decrypt; if it fails (e.g. value is still plaintext from before
 * encryption was enabled), return the original value unchanged.
 * This provides backward compatibility during the migration window.
 */
export async function decryptOrPassthrough(value: string, hexKey: string): Promise<string> {
  if (!value || !hexKey) return value;
  try {
    return await decrypt(value, hexKey);
  } catch {
    // Not encrypted yet — return as-is
    return value;
  }
}
