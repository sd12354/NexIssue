/**
 * AES-256-GCM encryption helpers for storing OAuth credentials at rest.
 *
 * The key is a 32-byte (256-bit) value stored as base64 in the Supabase
 * secret `OAUTH_TOKEN_ENCRYPTION_KEY`. Generate one with:
 *
 *   openssl rand -base64 32
 *
 * Set it via:
 *
 *   supabase secrets set OAUTH_TOKEN_ENCRYPTION_KEY=<base64>
 */

const ALGORITHM = "AES-GCM";
const IV_BYTES = 12;
const VERSION = 1 as const;

export type EncryptedBlob = {
  v: typeof VERSION;
  iv: string;
  ciphertext: string;
};

function base64Encode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64Decode(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function importKey(keyBase64: string): Promise<CryptoKey> {
  const raw = base64Decode(keyBase64);
  if (raw.byteLength !== 32) {
    throw new Error(
      "OAUTH_TOKEN_ENCRYPTION_KEY must decode to 32 bytes (base64 of 32 random bytes).",
    );
  }
  return await crypto.subtle.importKey(
    "raw",
    raw,
    { name: ALGORITHM },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptJson<T>(
  payload: T,
  keyBase64: string,
): Promise<EncryptedBlob> {
  const key = await importKey(keyBase64);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    plaintext,
  );
  return {
    v: VERSION,
    iv: base64Encode(iv),
    ciphertext: base64Encode(new Uint8Array(ciphertext)),
  };
}

export async function decryptJson<T>(
  blob: EncryptedBlob,
  keyBase64: string,
): Promise<T> {
  if (blob.v !== VERSION) {
    throw new Error(`Unsupported encryption version: ${blob.v}`);
  }
  const key = await importKey(keyBase64);
  const iv = base64Decode(blob.iv);
  const ciphertext = base64Decode(blob.ciphertext);
  const plaintext = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    ciphertext,
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

export function generateState(byteLength = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return base64Encode(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
