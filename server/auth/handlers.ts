// Login flow with Auth0 (OpenID Connect, authorization code + PKCE), written
// as plain Request -> Response functions so they can be tested without Vercel.
// middleware.ts and api/auth/*.ts are thin wrappers around these.

import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'
import { next } from '@vercel/functions'
import { issuerOf, NOT_CONFIGURED, type AuthConfig } from './config.js'
import { clearCookie, LOGIN_COOKIE, readCookie, SESSION_COOKIE, setCookie } from './cookies.js'
import { LOGIN_MAX_AGE, seal, SESSION_MAX_AGE, unseal, type LoginClaims, type SessionClaims } from './session.js'
import { messagePage, signOutLink, tryAgain } from './pages.js'

const CALLBACK_PATH = '/api/auth/callback'

const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'X-Robots-Tag': 'noindex, nofollow',
}

function notConfigured(): Response {
  return new Response(NOT_CONFIGURED, { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })
}

function redirect(location: string, cookies: string[] = []): Response {
  const headers = new Headers({ Location: location, 'Cache-Control': 'no-store' })
  for (const c of cookies) headers.append('Set-Cookie', c)
  return new Response(null, { status: 302, headers })
}

/** Only same-site paths ("/..." but not "//..."), to avoid open redirects. */
export function safeReturnTo(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/'
  return value
}

function base64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function randomToken(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)))
}

async function pkceChallenge(verifier: string): Promise<string> {
  return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))))
}

// ---------------------------------------------------------------------------

/**
 * Routing Middleware: runs before every request. Serves the app only with a
 * valid session; otherwise sends pages to the login and refuses everything
 * else (JS, CSS, data).
 */
export async function guard(request: Request, config: AuthConfig | null): Promise<Response> {
  const url = new URL(request.url)
  if (url.pathname.startsWith('/api/auth/')) return next()
  // Pluggy's webhook can't log in; that handler checks its own shared secret
  // (server/pluggy/webhook.ts). Exact path only.
  if (url.pathname === '/api/webhooks/pluggy') return next()
  if (!config) return notConfigured()

  const session = await unseal<SessionClaims>('session', readCookie(request, SESSION_COOKIE), config.secret)
  if (session?.sub) return next({ headers: securityHeaders })

  const isPage = request.method === 'GET' && (request.headers.get('Sec-Fetch-Mode') === 'navigate' || (request.headers.get('Accept') ?? '').includes('text/html'))
  if (isPage) return redirect(`/api/auth/login?returnTo=${encodeURIComponent(url.pathname + url.search)}`)
  return new Response('Not signed in.', { status: 401, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })
}

/** GET /api/auth/login: starts the login and sends the browser to Auth0. */
export async function login(request: Request, config: AuthConfig | null): Promise<Response> {
  if (!config) return notConfigured()
  const url = new URL(request.url)
  const state = randomToken()
  const nonce = randomToken()
  const verifier = randomToken()
  const returnTo = safeReturnTo(url.searchParams.get('returnTo'))
  const loginState = await seal('login', { state, nonce, verifier, returnTo }, config.secret, LOGIN_MAX_AGE)

  const authorize = new URL(`${issuerOf(config)}authorize`)
  authorize.search = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: `${url.origin}${CALLBACK_PATH}`,
    scope: 'openid email',
    state,
    nonce,
    code_challenge: await pkceChallenge(verifier),
    code_challenge_method: 'S256',
    ui_locales: 'pt-BR', // Auth0's login page in the app's language
  }).toString()

  return redirect(authorize.toString(), [setCookie(LOGIN_COOKIE, loginState, LOGIN_MAX_AGE)])
}

export interface CallbackDeps {
  fetch: typeof fetch
  keys: JWTVerifyGetKey
}

const keySets = new Map<string, JWTVerifyGetKey>()
function remoteKeys(issuer: string): JWTVerifyGetKey {
  let keys = keySets.get(issuer)
  if (!keys) {
    keys = createRemoteJWKSet(new URL(`${issuer}.well-known/jwks.json`))
    keySets.set(issuer, keys)
  }
  return keys
}

/**
 * GET /api/auth/callback: Auth0 sends the browser back here. Exchanges the
 * code for an ID token, verifies it, and starts a session. Auth0 only issues
 * a token to users in its user list (sign-ups are disabled there), so a
 * verified token for this application is what grants access.
 */
export async function callback(request: Request, config: AuthConfig | null, deps?: Partial<CallbackDeps>): Promise<Response> {
  if (!config) return notConfigured()
  const url = new URL(request.url)
  const issuer = issuerOf(config)
  const clearLogin = clearCookie(LOGIN_COOKIE)

  const error = url.searchParams.get('error')
  if (error) {
    const detail = url.searchParams.get('error_description') || error
    return messagePage(403, 'Login refused / Login recusado', detail, signOutLink)
  }

  const saved = await unseal<LoginClaims>('login', readCookie(request, LOGIN_COOKIE), config.secret)
  const code = url.searchParams.get('code')
  if (!saved || !code || url.searchParams.get('state') !== saved.state) {
    return messagePage(400, 'Login expired / Login expirou', 'Please start the login again. / Comece o login de novo.', tryAgain)
  }

  const doFetch = deps?.fetch ?? fetch
  const tokenResponse = await doFetch(`${issuer}oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: `${url.origin}${CALLBACK_PATH}`,
      code_verifier: saved.verifier,
    }),
  })
  if (!tokenResponse.ok) {
    return messagePage(502, 'Login failed / Falha no login', 'Auth0 did not accept the login. / O Auth0 não aceitou o login.', tryAgain)
  }
  const { id_token } = (await tokenResponse.json()) as { id_token?: string }

  let sub: string
  try {
    if (!id_token) throw new Error('no id_token')
    const { payload } = await jwtVerify(id_token, deps?.keys ?? remoteKeys(issuer), { issuer, audience: config.clientId })
    if (payload.nonce !== saved.nonce) throw new Error('nonce mismatch')
    if (!payload.sub) throw new Error('no subject')
    sub = payload.sub
  } catch {
    return messagePage(400, 'Login failed / Falha no login', 'The login could not be verified. / Não foi possível verificar o login.', tryAgain)
  }

  const session = await seal('session', { sub }, config.secret, SESSION_MAX_AGE)
  return redirect(saved.returnTo, [setCookie(SESSION_COOKIE, session, SESSION_MAX_AGE), clearLogin])
}

/** GET /api/auth/logout: ends Trove's session and the Auth0 session. */
export function logout(request: Request, config: AuthConfig | null): Response {
  const origin = new URL(request.url).origin
  const cookies = [clearCookie(SESSION_COOKIE), clearCookie(LOGIN_COOKIE)]
  if (!config) return redirect('/', cookies)
  const auth0Logout = new URL(`${issuerOf(config)}v2/logout`)
  auth0Logout.search = new URLSearchParams({ client_id: config.clientId, returnTo: `${origin}/` }).toString()
  return redirect(auth0Logout.toString(), cookies)
}
