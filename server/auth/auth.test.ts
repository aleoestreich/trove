import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTVerifyGetKey } from 'jose'
import { readConfig, type AuthConfig } from './config'
import { LOGIN_COOKIE, SESSION_COOKIE } from './cookies'
import { seal, unseal } from './session'
import { callback, guard, login, logout, safeReturnTo } from './handlers'

const config: AuthConfig = {
  domain: 'trove-test.us.auth0.com',
  clientId: 'client-123',
  clientSecret: 'client-secret',
  secret: 'a-long-random-cookie-secret',
  allowedEmail: 'owner@example.com',
}
const ISSUER = 'https://trove-test.us.auth0.com/'
const SITE = 'https://trove.vercel.app'

// A simulated Auth0: signs ID tokens with a local key.
let keys: JWTVerifyGetKey
let signIdToken: (claims: Record<string, unknown>, opts?: { iss?: string; aud?: string }) => Promise<string>

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256')
  keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' }] })
  signIdToken = (claims, opts = {}) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(opts.iss ?? ISSUER)
      .setAudience(opts.aud ?? config.clientId)
      .setSubject('auth0|owner')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey)
})

afterEach(() => vi.useRealTimers())

/** Value of a cookie set by a response. */
function cookieFrom(res: Response, name: string): string | null {
  for (const c of res.headers.getSetCookie()) {
    if (c.startsWith(`${name}=`)) return decodeURIComponent(c.slice(name.length + 1).split(';')[0])
  }
  return null
}

const get = (path: string, headers: Record<string, string> = {}) => new Request(`${SITE}${path}`, { headers })
const page = (path: string, headers: Record<string, string> = {}) => get(path, { Accept: 'text/html', 'Sec-Fetch-Mode': 'navigate', ...headers })
const passedThrough = (res: Response) => res.headers.get('x-middleware-next') === '1'

/** Runs /api/auth/login and returns what the callback needs. */
async function startLogin(path = '/api/auth/login?returnTo=%2Ftransactions', headers: Record<string, string> = {}) {
  const res = await login(get(path, headers), config)
  const authorize = new URL(res.headers.get('Location')!)
  return { res, authorize, loginCookie: cookieFrom(res, LOGIN_COOKIE)! }
}

/** Fake Auth0 token endpoint that checks the PKCE proof, then returns `idToken`. */
function tokenEndpoint(authorize: URL, idToken: () => Promise<string>) {
  return vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const body = new URLSearchParams(String(init?.body))
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body.get('code_verifier')!)))
    const challenge = btoa(String.fromCharCode(...digest)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    if (challenge !== authorize.searchParams.get('code_challenge') || body.get('client_secret') !== config.clientSecret) {
      return new Response('{"error":"invalid_grant"}', { status: 403 })
    }
    return Response.json({ id_token: await idToken() })
  })
}

async function completeLogin(opts: { email?: string; nonce?: string; iss?: string; aud?: string; state?: string } = {}) {
  const { authorize, loginCookie } = await startLogin()
  const nonce = opts.nonce ?? authorize.searchParams.get('nonce')!
  const fetch = tokenEndpoint(authorize, () => signIdToken({ email: opts.email ?? 'Owner@Example.com', nonce }, opts))
  const state = opts.state ?? authorize.searchParams.get('state')!
  const res = await callback(get(`/api/auth/callback?code=abc&state=${state}`, { Cookie: `${LOGIN_COOKIE}=${encodeURIComponent(loginCookie)}` }), config, { fetch, keys })
  return { res, fetch }
}

// ---------------------------------------------------------------------------

describe('config', () => {
  it('is null (fail closed) when any setting is missing', () => {
    const env = { AUTH0_DOMAIN: 'x.auth0.com', AUTH0_CLIENT_ID: 'id', AUTH0_CLIENT_SECRET: 's', AUTH0_SECRET: 'k', ALLOWED_EMAIL: 'a@b.com' }
    expect(readConfig(env)).not.toBeNull()
    for (const key of Object.keys(env)) expect(readConfig({ ...env, [key]: undefined }), key).toBeNull()
  })

  it('normalises the domain and the email', () => {
    const c = readConfig({ AUTH0_DOMAIN: 'https://x.us.auth0.com/', AUTH0_CLIENT_ID: 'id', AUTH0_CLIENT_SECRET: 's', AUTH0_SECRET: 'k', ALLOWED_EMAIL: ' Me@Gmail.com ' })
    expect(c).toMatchObject({ domain: 'x.us.auth0.com', allowedEmail: 'me@gmail.com' })
  })
})

describe('encrypted cookies', () => {
  it('round-trip, and reject tampering, another secret, another purpose and expiry', async () => {
    const v = await seal('session', { email: 'owner@example.com' }, config.secret, 60)
    expect(await unseal('session', v, config.secret)).toMatchObject({ email: 'owner@example.com' })
    expect(await unseal('session', v.slice(0, -2) + 'xx', config.secret)).toBeNull()
    expect(await unseal('session', v, 'another-secret')).toBeNull()
    expect(await unseal('login', v, config.secret)).toBeNull()
    vi.useFakeTimers({ now: Date.now() + 61_000 })
    expect(await unseal('session', v, config.secret)).toBeNull()
  })
})

describe('middleware (guard)', () => {
  const sessionFor = async (email: string) => `${SESSION_COOKIE}=${encodeURIComponent(await seal('session', { email }, config.secret, 60))}`

  it('fails closed when not configured', async () => {
    expect((await guard(page('/'), null)).status).toBe(500)
  })

  it('sends a signed-out page visit to the login, remembering where it was going', async () => {
    const res = await guard(page('/?x=1'), config)
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toBe('/api/auth/login?returnTo=%2F%3Fx%3D1')
  })

  it('refuses app files (JS, CSS) without a session', async () => {
    expect((await guard(get('/assets/index-abc.js'), config)).status).toBe(401)
  })

  it('lets the login routes through', async () => {
    expect(passedThrough(await guard(get('/api/auth/callback?code=x'), config))).toBe(true)
  })

  it('serves the app with a valid session, adding security headers', async () => {
    const res = await guard(get('/assets/index-abc.js', { Cookie: await sessionFor('owner@example.com') }), config)
    expect(passedThrough(res)).toBe(true)
    expect(res.headers.get('X-Frame-Options')).toBe('DENY')
  })

  it('refuses a session for another email, a login-state cookie, and a forged cookie', async () => {
    const other = await sessionFor('someone@gmail.com')
    const loginState = `${SESSION_COOKIE}=${encodeURIComponent(await seal('login', { email: 'owner@example.com' }, config.secret, 60))}`
    const forged = `${SESSION_COOKIE}=not-a-real-session`
    for (const cookie of [other, loginState, forged]) {
      expect(passedThrough(await guard(get('/assets/index-abc.js', { Cookie: cookie }), config))).toBe(false)
    }
  })
})

describe('login', () => {
  it('sends the browser to Auth0 with PKCE, state and nonce, and stores them encrypted', async () => {
    const { res, authorize, loginCookie } = await startLogin()
    expect(res.status).toBe(302)
    expect(`${authorize.origin}${authorize.pathname}`).toBe(`${ISSUER}authorize`)
    const p = authorize.searchParams
    expect(p.get('client_id')).toBe(config.clientId)
    expect(p.get('redirect_uri')).toBe(`${SITE}/api/auth/callback`)
    expect(p.get('response_type')).toBe('code')
    expect(p.get('code_challenge_method')).toBe('S256')
    expect(p.get('state')).toBeTruthy()
    expect(p.get('nonce')).toBeTruthy()
    expect(authorize.toString()).not.toContain(config.clientSecret)
    const cookie = res.headers.getSetCookie().find((c) => c.startsWith(LOGIN_COOKIE))!
    expect(cookie).toMatch(/HttpOnly/)
    expect(cookie).toMatch(/Secure/)
    expect(await unseal('login', loginCookie, config.secret)).toMatchObject({ state: p.get('state'), returnTo: '/transactions' })
  })

  it("shows Auth0's page in the app's language, else the browser's", async () => {
    expect((await startLogin('/api/auth/login', { Cookie: 'trove_locale=en', 'Accept-Language': 'pt-BR' })).authorize.searchParams.get('ui_locales')).toBe('en')
    expect((await startLogin('/api/auth/login', { 'Accept-Language': 'pt-BR,pt;q=0.9' })).authorize.searchParams.get('ui_locales')).toBe('pt-BR')
    expect((await startLogin('/api/auth/login', { 'Accept-Language': 'en-US' })).authorize.searchParams.get('ui_locales')).toBe('en')
  })

  it('never redirects to another site afterwards', () => {
    for (const bad of ['https://evil.com', '//evil.com', '/\\evil.com', null]) expect(safeReturnTo(bad)).toBe('/')
    expect(safeReturnTo('/transactions?m=all')).toBe('/transactions?m=all')
  })
})

describe('callback', () => {
  it('signs you in: exchanges the code with PKCE, sets the session, returns where you were going', async () => {
    const { res, fetch } = await completeLogin()
    expect(fetch).toHaveBeenCalledOnce()
    expect(String(fetch.mock.calls[0][0])).toBe(`${ISSUER}oauth/token`)
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toBe('/transactions')
    const session = cookieFrom(res, SESSION_COOKIE)!
    expect(await unseal('session', session, config.secret)).toMatchObject({ email: 'owner@example.com' })
    // ...and the middleware now lets you in.
    expect(passedThrough(await guard(get('/', { Cookie: `${SESSION_COOKIE}=${encodeURIComponent(session)}` }), config))).toBe(true)
  })

  it('refuses any other email, even when Auth0 authenticated it', async () => {
    const { res } = await completeLogin({ email: 'someone@gmail.com' })
    expect(res.status).toBe(403)
    expect(cookieFrom(res, SESSION_COOKIE)).toBeNull()
  })

  it('refuses a wrong state, nonce, issuer or audience', async () => {
    for (const opts of [{ state: 'forged' }, { nonce: 'replayed' }, { iss: 'https://evil.auth0.com/' }, { aud: 'another-app' }]) {
      const { res } = await completeLogin(opts)
      expect(res.status, JSON.stringify(opts)).toBe(400)
      expect(cookieFrom(res, SESSION_COOKIE)).toBeNull()
    }
  })

  it('refuses a callback without the login cookie (login not started here)', async () => {
    const res = await callback(get('/api/auth/callback?code=abc&state=x'), config, { fetch: vi.fn(), keys })
    expect(res.status).toBe(400)
  })

  it('shows an error when Auth0 refuses the login (e.g. the email rule)', async () => {
    const res = await callback(get('/api/auth/callback?error=access_denied&error_description=Not%20allowed'), config, { fetch: vi.fn(), keys })
    expect(res.status).toBe(403)
    expect(await res.text()).toContain('Not allowed')
  })

  it('shows an error when the token exchange fails', async () => {
    const { authorize, loginCookie } = await startLogin()
    const res = await callback(
      get(`/api/auth/callback?code=abc&state=${authorize.searchParams.get('state')}`, { Cookie: `${LOGIN_COOKIE}=${encodeURIComponent(loginCookie)}` }),
      config,
      { fetch: vi.fn(async () => new Response('nope', { status: 500 })), keys },
    )
    expect(res.status).toBe(502)
  })
})

describe('logout', () => {
  it('clears the session and signs out of Auth0, returning to the site', () => {
    const res = logout(get('/api/auth/logout'), config)
    expect(res.status).toBe(302)
    const to = new URL(res.headers.get('Location')!)
    expect(`${to.origin}${to.pathname}`).toBe(`${ISSUER}v2/logout`)
    expect(to.searchParams.get('returnTo')).toBe(`${SITE}/`)
    expect(res.headers.getSetCookie().find((c) => c.startsWith(SESSION_COOKIE))).toMatch(/Max-Age=0/)
  })
})
