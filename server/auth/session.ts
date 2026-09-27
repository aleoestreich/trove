// Encrypted, tamper-proof cookie values (JWE, A256GCM). The key is derived
// from AUTH0_SECRET. A `purpose` claim keeps a login-state cookie from ever
// being accepted as a session.

import { EncryptJWT, jwtDecrypt, type JWTPayload } from 'jose'

export type Purpose = 'session' | 'login'

export const SESSION_MAX_AGE = 7 * 24 * 60 * 60
export const LOGIN_MAX_AGE = 10 * 60

async function keyFrom(secret: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`trove-cookie:${secret}`))
  return new Uint8Array(digest)
}

export async function seal(purpose: Purpose, claims: JWTPayload, secret: string, maxAgeSeconds: number): Promise<string> {
  return new EncryptJWT({ ...claims, purpose })
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuedAt()
    .setExpirationTime(`${maxAgeSeconds}s`)
    .encrypt(await keyFrom(secret))
}

/** The claims, or null if the value is missing, tampered with, expired or for another purpose. */
export async function unseal<T extends JWTPayload>(purpose: Purpose, value: string | null, secret: string): Promise<T | null> {
  if (!value) return null
  try {
    const { payload } = await jwtDecrypt(value, await keyFrom(secret), { keyManagementAlgorithms: ['dir'], contentEncryptionAlgorithms: ['A256GCM'] })
    return payload.purpose === purpose ? (payload as T) : null
  } catch {
    return null
  }
}

export interface SessionClaims extends JWTPayload {
  email: string
}

export interface LoginClaims extends JWTPayload {
  state: string
  nonce: string
  verifier: string
  returnTo: string
}
