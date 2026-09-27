// Auth settings, read from environment variables set in Vercel.
// AUTH0_* come from the Auth0 integration; ALLOWED_EMAIL is added by hand.

export interface AuthConfig {
  /** Auth0 tenant host, e.g. "trove-xyz.us.auth0.com". */
  domain: string
  clientId: string
  clientSecret: string
  /** Secret used to encrypt Trove's cookies. */
  secret: string
  /** The only email allowed in (lower-case). */
  allowedEmail: string
}

type Env = Record<string, string | undefined>

/** Returns null when anything is missing, so callers fail closed. */
export function readConfig(env: Env): AuthConfig | null {
  const domain = env.AUTH0_DOMAIN?.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '')
  const clientId = env.AUTH0_CLIENT_ID?.trim()
  const clientSecret = env.AUTH0_CLIENT_SECRET?.trim()
  const secret = env.AUTH0_SECRET?.trim()
  const allowedEmail = env.ALLOWED_EMAIL?.trim().toLowerCase()
  if (!domain || !clientId || !clientSecret || !secret || !allowedEmail) return null
  return { domain, clientId, clientSecret, secret, allowedEmail }
}

/** Token issuer for the tenant: "https://<domain>/". */
export function issuerOf(config: Pick<AuthConfig, 'domain'>): string {
  return `https://${config.domain}/`
}

export const NOT_CONFIGURED =
  'Login is not configured. Set AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET, AUTH0_SECRET and ALLOWED_EMAIL in Vercel.'
