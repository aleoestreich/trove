import type { CheckState } from '../lib/selection'
import { Icon } from './Icon'

/**
 * A selection checkbox, drawn (the clickable element carries the role):
 * empty (2px muted border), checked or mixed (accent fill, check or minus),
 * or disabled (dashed line border) for rows that can't be selected.
 */
export function SelectBox({ state, small = false }: { state: CheckState; small?: boolean }) {
  const box = small ? 'size-[18px] rounded-[5px]' : 'size-[22px] rounded-[7px]'
  const filled = state === 'on' || state === 'mixed'
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center ${box} ${
        filled ? 'bg-accent text-surface' : state === 'disabled' ? 'border-2 border-dashed border-line' : 'border-2 border-muted'
      }`}
    >
      {filled && <Icon name={state === 'on' ? 'checkBox' : 'minus'} className={small ? 'size-3' : 'size-3.5'} strokeWidth={3.2} />}
    </span>
  )
}
