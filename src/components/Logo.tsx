/**
 * The trove mark: three overlapping discs (blue, violet, mint). They multiply
 * on light backgrounds and screen on dark ones (see --logo-blend).
 */
export function Mark({ className, label }: { className?: string; label?: string }) {
  return (
    <svg viewBox="11 14 42 40" className={className} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <g style={{ isolation: 'isolate' }}>
        <circle cx="25" cy="28" r="14" fill="var(--logo-1)" className="logo-disc" />
        <circle cx="39" cy="28" r="14" fill="var(--logo-2)" className="logo-disc" />
        <circle cx="32" cy="40" r="14" fill="var(--logo-3)" className="logo-disc" />
      </g>
    </svg>
  )
}

/** "trove" in Sora with the mark as the "o". Sized by font-size (em units). */
export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`font-brand leading-none font-semibold tracking-[-0.05em] whitespace-nowrap text-ink ${className}`}>
      <span className="sr-only">trove</span>
      <span aria-hidden>
        tr
        <Mark className="ml-[0.11em] inline-block h-[0.577em] w-[0.605em] align-[-0.055em]" />
        ve
      </span>
    </span>
  )
}
