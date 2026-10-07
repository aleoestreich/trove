import type { CSSProperties } from 'react'
import type { Category, Subcategory, Transaction } from '../data/types'
import { CategoryIcon, Icon } from './Icon'

/** A category colour's token, e.g. var(--cat-orange). */
export const catVar = (color: string) => `var(--cat-${color})`
/** The colour at `pct`% over transparent (backgrounds, tints). */
export const catTint = (color: string, pct = 16) => `color-mix(in srgb, ${catVar(color)} ${pct}%, transparent)`
/** The colour mixed with ink, readable as text or an icon (72% for icons, 70% for text). */
export const catInk = (color: string, pct = 72) => `color-mix(in srgb, ${catVar(color)} ${pct}%, var(--ink))`

export type BadgeSize = 24 | 26 | 28 | 32 | 34 | 36 | 40 | 44

/**
 * A category's icon in a circle tinted with its colour. Without a category,
 * a dashed circle ("uncategorized"); for transfers, a neutral one. Categories
 * are circles; banks are rounded squares. Decorative: the name is always next to it.
 */
export function CategoryBadge({
  category,
  transfer = false,
  size = 40,
}: {
  category: Pick<Category, 'color' | 'icon'> | null | undefined
  transfer?: boolean
  size?: BadgeSize
}) {
  const glyph = size <= 24 ? 'size-[14px]' : size <= 28 ? 'size-4' : size >= 44 ? 'size-[22px]' : 'size-5'
  const box: CSSProperties = { width: size, height: size }
  if (transfer)
    return (
      <span aria-hidden className="flex shrink-0 items-center justify-center rounded-full bg-track text-ink-2" style={box}>
        <Icon name="transfer" className={glyph} strokeWidth={1.8} />
      </span>
    )
  if (!category)
    return (
      <span
        aria-hidden
        className="flex shrink-0 items-center justify-center rounded-full border-[1.5px] border-dashed border-muted text-muted"
        style={box}
      >
        <Icon name="uncategorized" className={glyph} strokeWidth={1.8} />
      </span>
    )
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full"
      style={{ ...box, background: catTint(category.color), color: catInk(category.color) }}
    >
      <CategoryIcon icon={category.icon} className={glyph} strokeWidth={1.8} />
    </span>
  )
}

/** The badge for a transaction: its category, uncategorized, or a transfer. */
export function TransactionBadge({ tx, categoriesById, size = 40 }: { tx: Transaction; categoriesById: Map<string, Category>; size?: BadgeSize }) {
  const category = tx.categoryId ? categoriesById.get(tx.categoryId) : undefined
  return <CategoryBadge category={category} transfer={!!tx.transfer} size={size} />
}

/** "Category › Subcategory" in the category's colour (13px, medium). */
export function CategoryLabel({
  category,
  subcategory,
  name,
  className = '',
}: {
  category: Category
  subcategory?: Subcategory | null
  name: string
  className?: string
}) {
  return (
    <span className={`truncate text-[13px] leading-[18px] font-medium ${className}`} style={{ color: catInk(category.color, 70) }}>
      {name}
      {subcategory && ` › ${subcategory.name}`}
    </span>
  )
}
