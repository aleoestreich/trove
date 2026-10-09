// Previdência privada (private pension plans) tracked by hand: no bank
// connection reports them, so each plan is named in Trove (optionally PGBL or
// VGBL) and its balance typed in, one entry per update, kept as a history.
// Shared by the app, the demo repository and the server (no browser-only
// imports).
//
// Like the FGTS, it's kept apart from every total: shown as its own line under
// net worth, never counted in income, spending, insights or the projection.

import { addMonths } from '../lib/dates.js'
import { FGTS_MAX, sortFgts, type FgtsEntry } from './fgts.js'
import type { Cents } from './types.js'

export const PLAN_TYPES = ['PGBL', 'VGBL'] as const
export type PlanType = (typeof PLAN_TYPES)[number]

/** A balance on a day; the same shape as the FGTS's. */
export type PensionEntry = FgtsEntry

export interface PensionPlan {
  id: string
  /** Set in Trove, e.g. "Previdência Banco Exemplo". */
  name: string
  type: PlanType | null
  /** Newest first. */
  entries: PensionEntry[]
}

export interface Pension {
  /** Shown on Accounts and Visão geral; turning it off keeps the plans and their history. */
  tracking: boolean
  /** In the order they were added. */
  plans: PensionPlan[]
}

export const NO_PENSION: Pension = { tracking: false, plans: [] }

/** A plan's name: up to 40 characters. */
export const PLAN_NAME_MAX = 40

/** Up to R$ 100 milhões per balance: anything above is a typo. */
export const PENSION_MAX: Cents = FGTS_MAX

export const sortPensionEntries = sortFgts

/** A plan's latest balance, and how much it changed since the one before (null with a single entry). */
export function planLatest(plan: PensionPlan): { latest: PensionEntry; change: Cents | null } | null {
  const [latest, previous] = sortPensionEntries(plan.entries)
  return latest ? { latest, change: previous ? latest.balance - previous.balance : null } : null
}

/** The plans' latest balances added up, how many plans have one, and the newest of their dates ("saldos até…"); null without any balance. */
export function pensionTotal(pension: Pension): { total: Cents; upTo: string; plans: number } | null {
  const latest = pension.plans.map((p) => planLatest(p)?.latest).filter((e): e is PensionEntry => !!e)
  if (latest.length === 0) return null
  return { total: latest.reduce((sum, e) => sum + e.balance, 0), upTo: latest.map((e) => e.date).sort().reverse()[0], plans: latest.length }
}

/** Whether a plan's balance should be updated on `today`: none yet, or the latest is more than a month old. */
export function planDue(plan: PensionPlan, today: string): boolean {
  const latest = planLatest(plan)?.latest
  return !latest || latest.date < addMonths(today, -1)
}

/** The plans to update on `today`, while tracking. */
export function pensionDue(pension: Pension, today: string): PensionPlan[] {
  return pension.tracking ? pension.plans.filter((p) => planDue(p, today)) : []
}
