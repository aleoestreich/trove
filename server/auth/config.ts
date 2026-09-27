// Auth settings, read from environment variables set in Vercel by the Auth0
// integration.
//
// Who may sign in is decided only in Auth0 (its user list, with sign-ups
// disabled). The code keeps no list of emails or users.

export interface AuthConfig {
  /** Auth0 tenant host, e.g. "trove-xyz.us.auth0.com". */
  domain: string
  clientId: string
  clientSecret: string
  /** Secret used to encrypt Trove's cookies. */
  secret: string
}

type Env = Record<string, string | undefined>

/** Returns null when anything is missing, so callers fail closed. */
export function readConfig(env: Env): AuthConfig | null {
  const domain = env.AUTH0_DOMAIN?.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '')
  const clientId = env.AUTH0_CLIENT_ID?.trim()
  const clientSecret = env.AUTH0_CLIENT_SECRET?.trim()
  const secret = env.AUTH0_SECRET?.trim()
  if (!domain || !clientId || !clientSecret || !secret) return null
  return { domain, clientId, clientSecret, secret }
}

/** Token issuer for the tenant: "https://<domain>/". */
export function issuerOf(config: Pick<AuthConfig, 'domain'>): string {
  return `https://${config.domain}/`
}

export const NOT_CONFIGURED =
  'Login is not configured. Set AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET and AUTH0_SECRET in Vercel.'
