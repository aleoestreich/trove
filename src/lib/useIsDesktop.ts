import { useEffect, useState } from 'react'

/** Matches Tailwind's `lg` breakpoint, where the sidebar layout starts. */
const QUERY = '(min-width: 1024px)'

/** True on the desktop layout (sidebar, tables, side panel instead of sheet). */
export function useIsDesktop(): boolean {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(QUERY).matches)
  useEffect(() => {
    const mq = window.matchMedia(QUERY)
    const onChange = () => setMatches(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return matches
}

/**
 * Login only exists on the deployed site (Vercel), not in local development
 * (localhost or a LAN address), so Sign out is shown only there.
 */
export function isDeployed(): boolean {
  const host = window.location.hostname
  return !/^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$)/.test(host)
}
