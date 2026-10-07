// Cookie helpers. Both cookies use the __Host- prefix, which browsers only
// accept with Secure, Path=/ and no Domain, so they can't be set or read by
// any other site or subdomain.

/** Encrypted login session (7 days). */
export const SESSION_COOKIE = '__Host-trove_session'
/** Encrypted state for one login round trip (10 minutes). */
export const LOGIN_COOKIE = '__Host-trove_login'

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie')
  if (!header) return null
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i === -1) continue
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim())
  }
  return null
}

export function setCookie(name: string, value: string, maxAgeSeconds: number): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; Secure; SameSite=Lax`
}

export function clearCookie(name: string): string {
  return `${name}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`
}
