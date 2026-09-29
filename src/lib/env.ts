/**
 * True on the deployed site (Vercel), false in local development (localhost or
 * a LAN address), where there is no login and no server API.
 */
export function isDeployed(hostname: string = window.location.hostname): boolean {
  return !/^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$)/.test(hostname)
}
