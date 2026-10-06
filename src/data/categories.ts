// Turns Trove's category guesses into categories. Shared by the
// demo data and the Pluggy mapping (server/pluggy/map.ts), so it must only
// import types and data.
//
// The guessing rules (server/pluggy/map.ts) still use a fixed set of IDs
// ("food", "housing"…). Those that match a default category map to it; the
// rest stay uncategorized until one is chosen; transfers and card bill
// payments become transfers, which have no category.

import type { Transaction } from './types.js'

/** Guess ID → default category ID (src/data/categoryCatalog.ts). */
const TO_DEFAULT: Record<string, string> = {
  housing: 'home',
  utilities: 'home',
  groceries: 'groceries',
  food: 'restaurants',
  transport: 'transport',
  shopping: 'shopping',
  subscriptions: 'subscriptions',
  health: 'health',
  travel: 'travel',
  salary: 'salary',
  freelance: 'freelance',
}

/** A guess as a category, or a transfer. `known`: the category IDs that exist (deleted ones aren't used). */
export function fromGuess(guess: string, known?: Set<string>): Pick<Transaction, 'categoryId' | 'transfer'> {
  if (guess === 'transfer') return { categoryId: null, transfer: 'own' }
  if (guess === 'card-payment') return { categoryId: null, transfer: 'card-payment' }
  const id = TO_DEFAULT[guess] ?? null
  return { categoryId: id && (!known || known.has(id)) ? id : null }
}
