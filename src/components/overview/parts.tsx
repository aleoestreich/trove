import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Icon, type IconName } from '../Icon'

// Pieces every card of the Visão geral shares, so the seven read as one
// system: the header (title, muted subtitle, a text link on the right), the
// list row (a 32px leading mark, two lines, a trailing value and a chevron)
// and the text link that opens a card's page.

/** A card's header: title (16/22), muted subtitle, and an optional link or control on the right. */
export function CardHeader({ title, subtitle, action, id }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2 id={id} className="text-base leading-[22px] font-medium text-ink">
          {title}
        </h2>
        {subtitle && <p className="tabular text-[13px] leading-[18px] text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

/** "Contas ›": a card's way to its page, top right (44px touch area, no extra height). */
export function HeaderLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="-my-2.5 -mr-2 inline-flex h-11 shrink-0 items-center gap-0.5 rounded-sm px-2 text-[13px] font-medium whitespace-nowrap text-accent hover:bg-accent-faint">
      {children}
      <Icon name="chevronRight" className="size-4" strokeWidth={2} />
    </Link>
  )
}

/** "Ver previsão ›": a text link under a block (44px tall). */
export function TextLink({ to, children, className = '' }: { to: string; children: ReactNode; className?: string }) {
  return (
    <Link to={to} className={`-ml-3 inline-flex h-11 items-center gap-1 self-start rounded-sm px-3 text-sm font-medium text-accent hover:bg-accent-faint active:bg-track ${className}`}>
      {children}
      <Icon name="chevronRight" className="size-4" strokeWidth={2} />
    </Link>
  )
}

/** A small caps label over a block inside a card ("PREVISÃO DO FIM DO MÊS"). */
export function BlockLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex min-h-6 items-center justify-between gap-2">
      <h3 className="label-caps">{children}</h3>
      {action}
    </div>
  )
}

/** A list row that opens something: a 32px leading mark, title and subtitle, a trailing value and a chevron. */
export function RowLink({ to, lead, title, sub, trail, label }: { to: string; lead: ReactNode; title: ReactNode; sub?: ReactNode; trail?: ReactNode; label?: string }) {
  return (
    <Link to={to} aria-label={label} className="flex min-h-[60px] items-center gap-3 py-2 hover:bg-track/40 active:bg-track">
      <span className="flex size-8 shrink-0 items-center justify-center">{lead}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="line-clamp-2 text-[15px] leading-5 font-medium break-words text-ink lg:text-sm">{title}</span>
        {sub && <span className="tabular line-clamp-2 text-[13px] leading-[18px] break-words text-muted lg:text-xs lg:leading-4">{sub}</span>}
      </span>
      {trail}
      <Icon name="chevronRight" className="size-[18px] shrink-0 text-muted" />
    </Link>
  )
}

/** A 32px icon disc, tinted with the accent or neutral (the list rows' leading mark). */
export function RowIcon({ icon, tone = 'accent' }: { icon: IconName; tone?: 'accent' | 'neutral' }) {
  return (
    <span aria-hidden className={`flex size-8 items-center justify-center rounded-full ${tone === 'accent' ? 'bg-accent-soft text-accent' : 'bg-track text-ink-2'}`}>
      <Icon name={icon} className="size-[18px]" strokeWidth={1.8} />
    </span>
  )
}

/** A value at the end of a row (15px medium, tabular). */
export function RowValue({ children, tone = 'text-ink' }: { children: ReactNode; tone?: string }) {
  return <span className={`tabular shrink-0 text-[15px] font-medium whitespace-nowrap lg:text-sm ${tone}`}>{children}</span>
}
