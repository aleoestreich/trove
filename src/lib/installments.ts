import type { Cents, Transaction } from '../data/types.js'
import { addMonths, monthKey, toISO } from './dates.js'

export interface UpcomingInstallment {
  number: number
  /** Expected charge date (ISO), a month after the previous one. */
  date: string
  /** Month it will be charged, "2026-10". */
  month: string
  amount: Cents
}

/** One installment purchase ("compra parcelada"), rebuilt from its charged installments. */
export interface InstallmentPlan {
  key: string
  accountId: string
  description: string
  categoryId: string | null
  purchaseDate: string
  totalAmount: Cents
  count: number
  /** Installments already charged. */
  charged: number
  /** Amount already charged (positive). */
  chargedAmount: Cents
  /** Amount still to be charged (positive). */
  remaining: Cents
  upcoming: UpcomingInstallment[]
  /**
   * Installments counted as charged because their month has passed, though
   * they weren't found in the data (included in `charged`).
   */
  assumedCharged: number
}


/**
 * The description without its installment marker, which banks often append:
 * "LOJA EXEMPLO 04/10" -> "LOJA EXEMPLO". Also "PARC 4/10", "(4 de 10)".
 */
export function purchaseDescription(t: Transaction): string {
  const i = t.installment
  if (!i) return t.description
  const marker = new RegExp(`\\s*[-–]?\\s*(?:parc(?:ela)?\\.?\\s*)?\\(?(?<!\\d)0*${i.number}\\s*(?:/|de|of)\\s*0*${i.total}(?!\\d)\\)?`, 'i')
  return t.description.replace(marker, ' ').replace(/\s+/g, ' ').trim() || t.description
}

/** Months since year 0, to compare charge months. */
const monthIndex = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1

/**
 * Splits the installments of one card, shop and count into purchases. Each
 * installment's "anchor" (charge month minus its number) is the same for one
 * purchase, give or take a month around bill closing, so anchors within a
 * month of each other chain together. A repeated installment number (two
 * "5/18") means two purchases at the same shop.
 */
function splitPurchases(txs: Transaction[]): Transaction[][] {
  const anchor = (t: Transaction) => monthIndex(t.date) - t.installment!.number
  const sorted = [...txs].sort((a, b) => anchor(a) - anchor(b) || a.installment!.number - b.installment!.number)
  const out: Transaction[][] = []
  for (const t of sorted) {
    const current = out.at(-1)
    const fits =
      current &&
      anchor(t) - anchor(current.at(-1)!) <= 1 &&
      !current.some((c) => c.installment!.number === t.installment!.number)
    if (fits) current.push(t)
    else out.push([t])
  }
  return out
}

/**
 * Groups installment transactions into purchases and projects the installments
 * not charged yet. Needs only what Pluggy reports per transaction (installment
 * number, total count, total amount, purchase date), so it works on real data.
 * Installments are matched by card, description (without "04/18") and count,
 * not by purchase date or total, which can differ between installments.
 *
 * Installments are projected one per month from the latest one found. Any that
 * would fall before `today`'s month have been billed already (banks charge
 * every month), even if they weren't matched in the data: they count as
 * charged, so nothing is "upcoming" in a past month.
 */
export function installmentPlans(transactions: Transaction[], today: Date = new Date()): InstallmentPlan[] {
  const thisMonth = monthKey(toISO(today))
  const groups = new Map<string, Transaction[]>()
  for (const t of transactions) {
    // Hidden purchases are left out (and with them, their future installments).
    if (!t.installment || t.hidden) continue
    const key = `${t.accountId}|${purchaseDescription(t).toLowerCase()}|${t.installment.total}`
    groups.set(key, [...(groups.get(key) ?? []), t])
  }

  const plans: InstallmentPlan[] = []
  for (const [groupKey, group] of groups)
  for (const txs of splitPurchases(group)) {
    const key = `${groupKey}|${txs[0].id}`
    const latest = txs.reduce((a, b) => (b.installment!.number > a.installment!.number ? b : a))
    const { total, totalAmount } = latest.installment!
    const purchaseDate = txs.map((t) => t.installment!.purchaseDate).sort()[0]
    const charged = latest.installment!.number
    // Exact when every charged installment is in the data. Otherwise (earlier
    // installments fell before the fetched history window) the later
    // installments are all equal to the latest one, so what's left is
    // (installments left) x (latest installment).
    const numbersSeen = new Set(txs.map((t) => t.installment!.number))
    const complete = numbersSeen.size === charged
    const remaining = complete
      ? Math.max(0, totalAmount + txs.reduce((s, t) => s + t.amount, 0))
      : Math.min(totalAmount, (total - charged) * Math.abs(latest.amount))
    const chargedAmount = totalAmount - remaining

    // Split what's left evenly; the first upcoming installment absorbs rounding.
    const left = total - charged
    const each = left > 0 ? Math.floor(remaining / left) : 0
    const projected: UpcomingInstallment[] = []
    for (let n = charged + 1; n <= total; n++) {
      const date = addMonths(latest.date, n - charged)
      projected.push({
        number: n,
        date,
        month: monthKey(date),
        amount: n === charged + 1 ? remaining - each * (left - 1) : each,
      })
    }
    // Months already passed: billed, so charged rather than upcoming.
    const past = projected.filter((u) => u.month < thisMonth)
    const upcoming = projected.filter((u) => u.month >= thisMonth)
    const pastAmount = past.reduce((sum, u) => sum + u.amount, 0)

    plans.push({
      key,
      accountId: latest.accountId,
      description: purchaseDescription(latest),
      categoryId: latest.categoryId,
      purchaseDate,
      totalAmount,
      count: total,
      charged: charged + past.length,
      chargedAmount: chargedAmount + pastAmount,
      remaining: remaining - pastAmount,
      upcoming,
      assumedCharged: past.length,
    })
  }
  // Active first (most still to pay), then finished, newest purchase first.
  return plans.sort((a, b) => b.remaining - a.remaining || b.purchaseDate.localeCompare(a.purchaseDate))
}

/** Installments still to be charged, per card account. */
export function remainingByAccount(plans: InstallmentPlan[]): Map<string, Cents> {
  const out = new Map<string, Cents>()
  for (const p of plans) out.set(p.accountId, (out.get(p.accountId) ?? 0) + p.remaining)
  return out
}

/** Total already committed in future months, oldest month first. */
export function upcomingByMonth(plans: InstallmentPlan[]): { month: string; amount: Cents }[] {
  const out = new Map<string, Cents>()
  for (const p of plans) for (const u of p.upcoming) out.set(u.month, (out.get(u.month) ?? 0) + u.amount)
  return [...out].map(([month, amount]) => ({ month, amount })).sort((a, b) => a.month.localeCompare(b.month))
}
