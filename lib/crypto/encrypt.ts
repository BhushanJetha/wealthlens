// AES-256-GCM encryption for sensitive financial fields
// Used for: account numbers, card digits, policy numbers

const ALGO = 'AES-GCM'
const KEY_LENGTH = 256

function getKeyMaterial(secret: string): Uint8Array {
  const encoder = new TextEncoder()
  const keyBytes = encoder.encode(secret.padEnd(32, '0').slice(0, 32))
  return keyBytes
}

async function importKey(secret: string): Promise<CryptoKey> {
  const keyMaterial = getKeyMaterial(secret)
  return crypto.subtle.importKey('raw', keyMaterial.buffer as ArrayBuffer, { name: ALGO }, false, ['encrypt', 'decrypt'])
}

export async function encrypt(plaintext: string): Promise<string> {
  const secret = process.env.ENCRYPTION_SECRET ?? 'default-dev-secret-change-in-prod'
  const key = await importKey(secret)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(plaintext)
  const ciphertext = await crypto.subtle.encrypt({ name: ALGO, iv }, key, encoded)
  const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(ciphertext), iv.byteLength)
  return Buffer.from(combined).toString('base64')
}

export async function decrypt(ciphertext: string): Promise<string> {
  const secret = process.env.ENCRYPTION_SECRET ?? 'default-dev-secret-change-in-prod'
  const key = await importKey(secret)
  const combined = Buffer.from(ciphertext, 'base64')
  const iv = combined.slice(0, 12)
  const data = combined.slice(12)
  const decrypted = await crypto.subtle.decrypt({ name: ALGO, iv }, key, data)
  return new TextDecoder().decode(decrypted)
}

// Mask sensitive values for display (e.g. account number → ****4521)
export function maskValue(value: string, visibleChars = 4): string {
  if (!value || value.length <= visibleChars) return value
  return '•'.repeat(value.length - visibleChars) + value.slice(-visibleChars)
}

// Hash for lookup without exposing raw value
export async function hashForLookup(value: string): Promise<string> {
  const data = new TextEncoder().encode(value)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Buffer.from(hash).toString('hex')
}
