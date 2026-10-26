// Password vault — encryption happens in the browser only.
// A key is derived from the user's vault passphrase (PBKDF2-SHA256, 310k
// rounds, random salt) and used for AES-256-GCM. The database stores only the
// salt, a check value and ciphertexts; the passphrase and key never leave the
// device, and the key can't be exported from the browser.

const CHECK = 'wealthlens-vault-v1'
export const VAULT_ITERATIONS = 310000

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...Array.from(u)))
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0))

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  )
}

export async function encryptText(key: CryptoKey, text: string): Promise<{ iv: string; ct: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, new TextEncoder().encode(text)))
  return { iv: b64(iv), ct: b64(ct) }
}

export async function decryptText(key: CryptoKey, iv: string, ct: string): Promise<string> {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) as BufferSource }, key, unb64(ct) as BufferSource)
  return new TextDecoder().decode(pt)
}

export interface VaultMeta { salt: string; iterations: number; check_iv: string; check_ct: string }

// New vault: fresh salt + a check value that proves the passphrase on unlock
export async function createVault(passphrase: string): Promise<{ meta: VaultMeta; key: CryptoKey }> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await deriveKey(passphrase, salt, VAULT_ITERATIONS)
  const check = await encryptText(key, CHECK)
  return { meta: { salt: b64(salt), iterations: VAULT_ITERATIONS, check_iv: check.iv, check_ct: check.ct }, key }
}

// The key when the passphrase is right, else null
export async function unlockVault(passphrase: string, meta: VaultMeta): Promise<CryptoKey | null> {
  try {
    const key = await deriveKey(passphrase, unb64(meta.salt), meta.iterations || VAULT_ITERATIONS)
    return (await decryptText(key, meta.check_iv, meta.check_ct)) === CHECK ? key : null
  } catch { return null }
}
