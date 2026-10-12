// "A receber" in the database (receivables, receivable_payments): reading
// them for the snapshot, and applying their edits with the same rules as the
// app (applyReceivableEdit in src/data/edits.ts).

import { EditError, applyReceivableEdit, type ReceivableEdit } from '../../src/data/edits.js'
import { sortPayments, sortReceivables, type Receivable } from '../../src/data/receivables.js'
import type { Transaction } from '../../src/data/types.js'
import type { Db } from './connection.js'
import { readSnapshot } from './read.js'

/** Every receivable with its payments, newest first. The day is its expense's. */
export async function readReceivables(db: Db): Promise<Receivable[]> {
  const rows = await db.query<{ id: string; transaction_id: string; person: string; amount_cents: string; day: string }>(
    `SELECT r.id, r.transaction_id, r.person, r.amount_cents, to_char(t.booked_on, 'YYYY-MM-DD') AS day
     FROM receivables r JOIN transactions t ON t.id = r.transaction_id`,
  )
  const payments = await db.query<{ id: string; receivable_id: string; transaction_id: string | null; day: string; amount_cents: string }>(
    `SELECT id, receivable_id, transaction_id, to_char(received_on, 'YYYY-MM-DD') AS day, amount_cents FROM receivable_payments`,
  )
  return sortReceivables(
    rows.rows.map((r) => ({
      id: r.id,
      transactionId: r.transaction_id,
      date: r.day,
      person: r.person,
      amount: Number(r.amount_cents),
      payments: sortPayments(
        payments.rows
          .filter((p) => p.receivable_id === r.id)
          .map((p) => ({ id: p.id, date: p.day, amount: Number(p.amount_cents), transactionId: p.transaction_id })),
      ),
    })),
  )
}

/** One lock for every receivable edit, so two at once can't both pass the limits. */
const LOCK = 7_301_013

/**
 * Applies a receivable edit inside a database transaction: locks, reads the
 * receivables and the transactions it names as the app shows them (amounts
 * in BRL; only the configured connections' live ones), checks the shared
 * rules, then writes it.
 */
export async function applyReceivableSql(db: Db, e: ReceivableEdit, itemIds: string[]): Promise<void> {
  await db.query(`SELECT pg_advisory_xact_lock($1)`, [LOCK])
  const list = await readReceivables(db)
  const named = e.op === 'saveReceivable' ? [e.receivable.transactionId] : e.op === 'saveReceivablePayment' && e.payment.transactionId ? [e.payment.transactionId] : []
  const found = await readTransactionsById(db, itemIds, named)
  applyReceivableEdit(list, e, (id) => found.get(id))

  switch (e.op) {
    case 'saveReceivable': {
      const v = e.receivable
      // The rules above keep its expense; the WHERE keeps it here too.
      await db.query(
        `INSERT INTO receivables (id, transaction_id, person, amount_cents) VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET person = excluded.person, amount_cents = excluded.amount_cents
         WHERE receivables.transaction_id = excluded.transaction_id`,
        [v.id, v.transactionId, v.person, v.amount],
      )
      return
    }
    case 'deleteReceivable':
      // Its payments go with it (ON DELETE CASCADE).
      await db.query(`DELETE FROM receivables WHERE id = $1`, [e.id])
      return
    case 'saveReceivablePayment': {
      const p = e.payment
      await db.query(
        `INSERT INTO receivable_payments (id, receivable_id, transaction_id, received_on, amount_cents) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET transaction_id = excluded.transaction_id, received_on = excluded.received_on, amount_cents = excluded.amount_cents
         WHERE receivable_payments.receivable_id = excluded.receivable_id`,
        [p.id, e.receivableId, p.transactionId, p.date, p.amount],
      )
      return
    }
    case 'deleteReceivablePayment':
      await db.query(`DELETE FROM receivable_payments WHERE id = $1 AND receivable_id = $2`, [e.id, e.receivableId])
      return
  }
}

/**
 * Live transactions of the configured connections by ID, mapped as the app
 * shows them (readSnapshot over the days they fall on). Missing ones are left out.
 */
async function readTransactionsById(db: Db, itemIds: string[], ids: string[]): Promise<Map<string, Transaction>> {
  const out = new Map<string, Transaction>()
  if (ids.length === 0) return out
  const days = await db.query<{ day: string }>(
    `SELECT t.booked_on::text AS day FROM transactions t JOIN accounts a ON a.id = t.account_id
     WHERE t.id = ANY($1::text[]) AND t.removed_at IS NULL AND a.connection_id = ANY($2::text[])`,
    [ids, itemIds],
  )
  if (days.rows.length === 0) return out
  const sorted = days.rows.map((r) => r.day).sort()
  const snapshot = await readSnapshot(db, itemIds, sorted[0], sorted[sorted.length - 1])
  if (!snapshot) throw new EditError('not_found', 'No such transaction.')
  for (const t of snapshot.transactions) if (ids.includes(t.id)) out.set(t.id, t)
  return out
}
