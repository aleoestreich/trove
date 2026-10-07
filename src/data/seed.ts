// Hardcoded demo data: 4 institutions, 12 months of transactions (the
// Overview's charts can show a year; screens list the last 6).
//
// Dates are generated relative to "today" so the current month always has
// data. Amounts come from a seeded random generator, so the data is the same
// on every reload.

import type { Account, Cents, Institution, Snapshot, Transaction } from './types'
import { MONTHS_OF_HISTORY } from './types'
import { fromGuess } from './categories'
import { convertToBRL, toCents } from '../lib/money'
import { dayOfMonth, toISO } from '../lib/dates'

export type { Snapshot } from './types'
export { MONTHS_OF_HISTORY }


/** USD -> BRL rate today, and for each earlier month (index 0 = current month). */
export const USD_BRL_TODAY = 5.45
const USD_BRL_BY_MONTH = [5.45, 5.49, 5.47, 5.51, 5.58, 5.62, 5.55, 5.48, 5.41, 5.36, 5.39, 5.33]

/** Months of demo transactions, the current one included. */
const SEED_MONTHS = USD_BRL_BY_MONTH.length


export const institutions: Institution[] = [
  { id: 'nubank', name: 'Nubank', color: '#8a3ffc' },
  { id: 'itau', name: 'Itaú', color: '#eb6834' },
  { id: 'inter', name: 'Inter', color: '#eda100' },
  { id: 'wise', name: 'Wise', color: '#1baf7a' },
]

/** Credit cards: bill closes on `closeDay` and is due on `dueDay` of the same month. */
const cards = [
  { id: 'nubank-card', institutionId: 'nubank', name: 'Nubank Mastercard', payFrom: 'nubank-checking', limit: 8_000_00, closeDay: 1, dueDay: 8 },
  { id: 'itau-card', institutionId: 'itau', name: 'Itaú Visa Platinum', payFrom: 'itau-checking', limit: 15_000_00, closeDay: 20, dueDay: 27 },
  { id: 'inter-card', institutionId: 'inter', name: 'Inter Mastercard Gold', payFrom: 'inter-checking', limit: 5_000_00, closeDay: 10, dueDay: 17 },
] as const

/**
 * Balances at the start of the demo period. Current balances are these plus
 * every transaction since, so balance history can be rebuilt from the data
 * (as it will be with Pluggy: current balance minus later transactions).
 */
const OPENING_BALANCES: Record<string, Cents> = {
  'nubank-checking': 1_850_00,
  'itau-checking': 4_300_00,
  'inter-checking': 2_400_00,
  'wise-brl': 350_00,
  /** In USD cents. */
  'wise-usd': 1_950_00,
}

// ---------------------------------------------------------------------------

/** Small deterministic PRNG (mulberry32). */
function rng(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Merchant {
  description: string
  categoryId: string
  min: number
  max: number
}

const cardMerchants: Record<string, Merchant[]> = {
  'nubank-card': [
    { description: 'Pão de Açúcar', categoryId: 'groceries', min: 120, max: 480 },
    { description: 'Carrefour', categoryId: 'groceries', min: 180, max: 620 },
    { description: 'iFood', categoryId: 'food', min: 35, max: 130 },
    { description: 'iFood', categoryId: 'food', min: 35, max: 130 },
    { description: 'Uber *Trip', categoryId: 'transport', min: 14, max: 62 },
    { description: '99 Tecnologia', categoryId: 'transport', min: 12, max: 45 },
    { description: 'Drogasil', categoryId: 'health', min: 25, max: 160 },
    { description: 'Padaria Bella Vista', categoryId: 'food', min: 12, max: 48 },
  ],
  'itau-card': [
    { description: 'Amazon.com.br', categoryId: 'shopping', min: 45, max: 420 },
    { description: 'Mercado Livre', categoryId: 'shopping', min: 60, max: 380 },
    { description: 'Coco Bambu', categoryId: 'food', min: 150, max: 360 },
    { description: 'Cinemark', categoryId: 'leisure', min: 40, max: 95 },
    { description: 'Shell Select', categoryId: 'transport', min: 150, max: 290 },
  ],
  'inter-card': [
    { description: 'Posto Ipiranga', categoryId: 'transport', min: 120, max: 260 },
    { description: 'Renner', categoryId: 'shopping', min: 90, max: 350 },
    { description: 'Hortifruti', categoryId: 'groceries', min: 60, max: 180 },
  ],
}

/** Purchases per month for each card. */
const purchasesPerMonth: Record<string, number> = { 'nubank-card': 14, 'itau-card': 6, 'inter-card': 4 }

export function buildSeed(today: Date = new Date()): Snapshot {
  const todayISO = toISO(today)
  const random = rng(20260927)
  const between = (min: number, max: number): Cents => toCents(min + random() * (max - min))

  const txs: Transaction[] = []
  let seq = 0
  // `categoryId` here is a guess ID ("food", "transfer"…), turned into the
  // categories the way the Pluggy mapping does it.
  const add = (t: Omit<Transaction, 'id' | 'status' | 'categoryId'> & { categoryId: string; status?: Transaction['status'] }) => {
    if (t.date > todayISO) return
    txs.push({ status: 'POSTED', ...t, ...fromGuess(t.categoryId), id: `tx-${++seq}` })
  }
  const transfer = (from: string, to: string, date: string, amount: Cents, description: string) => {
    add({ accountId: from, date, description, amount: -amount, categoryId: 'transfer' })
    add({ accountId: to, date, description, amount, categoryId: 'transfer' })
  }

  for (let offset = -(SEED_MONTHS - 1); offset <= 0; offset++) {
    const day = (d: number) => dayOfMonth(today, offset, d)
    const usdRate = USD_BRL_BY_MONTH[-offset]

    // Itaú checking: salary and housing.
    add({ accountId: 'itau-checking', date: day(5), description: 'Salário - Acme Tecnologia Ltda', amount: 12_500_00, categoryId: 'salary' })
    add({ accountId: 'itau-checking', date: day(10), description: 'Aluguel - Imobiliária Lopes', amount: -3_200_00, categoryId: 'housing' })
    add({ accountId: 'itau-checking', date: day(10), description: 'Condomínio Ed. Aurora', amount: -780_00, categoryId: 'housing' })
    add({ accountId: 'itau-checking', date: day(8), description: 'Unimed - plano de saúde', amount: -890_00, categoryId: 'health' })
    add({ accountId: 'itau-checking', date: day(20), description: 'DAS - Simples Nacional', amount: -between(420, 560), categoryId: 'taxes' })
    transfer('itau-checking', 'nubank-checking', day(6), 3_000_00, 'Pix - transferência entre contas')
    transfer('itau-checking', 'inter-checking', day(6), 1_800_00, 'Pix - transferência entre contas')

    // Inter checking: bills and investment yield.
    add({ accountId: 'inter-checking', date: day(12), description: 'Enel Distribuição SP', amount: -between(180, 290), categoryId: 'utilities' })
    add({ accountId: 'inter-checking', date: day(15), description: 'Vivo Fibra', amount: -119_90, categoryId: 'utilities' })
    add({ accountId: 'inter-checking', date: day(11), description: 'Wizard Idiomas', amount: -460_00, categoryId: 'education' })
    add({ accountId: 'inter-checking', date: day(28), description: 'Rendimento CDB Inter', amount: between(38, 72), categoryId: 'investments' })

    // Nubank checking: Pix to people.
    add({ accountId: 'nubank-checking', date: day(3 + Math.floor(random() * 20)), description: 'Pix enviado - Mariana Costa', amount: -between(80, 350), categoryId: 'other-expense' })
    add({ accountId: 'nubank-checking', date: day(25), description: 'Pix enviado - Diarista Josefa', amount: -640_00, categoryId: 'housing' })
    if (random() > 0.5) {
      add({ accountId: 'nubank-checking', date: day(14 + Math.floor(random() * 10)), description: 'Pix recebido - Rafael Souza', amount: between(50, 200), categoryId: 'other-income' })
    }

    // Wise USD: freelance income in dollars, USD subscriptions, conversion to BRL.
    const usd = (usdCents: Cents) => ({ amount: convertToBRL(usdCents, usdRate), foreign: { currency: 'USD' as const, amount: usdCents } })
    add({ accountId: 'wise-usd', date: day(15), description: 'Northwind Inc. - Invoice', categoryId: 'freelance', ...usd(1_200_00) })
    add({ accountId: 'wise-usd', date: day(3), description: 'GitHub', categoryId: 'subscriptions', ...usd(-10_00) })
    add({ accountId: 'wise-usd', date: day(9), description: 'Figma', categoryId: 'subscriptions', ...usd(-15_00) })
    add({ accountId: 'wise-usd', date: day(2), description: 'AWS', categoryId: 'subscriptions', ...usd(-toCents(18 + random() * 12)) })
    const converted = usd(-1_000_00)
    add({ accountId: 'wise-usd', date: day(20), description: 'Converted USD to BRL', categoryId: 'transfer', ...converted })
    add({ accountId: 'wise-brl', date: day(20), description: 'Converted USD to BRL', categoryId: 'transfer', amount: -converted.amount })
    transfer('wise-brl', 'itau-checking', day(21), 5_000_00, 'Wise - envio para Itaú')

    // Credit card purchases.
    // Netflix went up last month; the gym stopped 3 months ago; an AI subscription in dollars started 2 months ago.
    add({ accountId: 'nubank-card', date: day(7), description: 'Netflix.com', amount: offset >= -1 ? -44_90 : -39_90, categoryId: 'subscriptions' })
    add({ accountId: 'nubank-card', date: day(12), description: 'Spotify', amount: -21_90, categoryId: 'subscriptions' })
    if (offset <= -3) add({ accountId: 'itau-card', date: day(5), description: 'Smart Fit', amount: -129_90, categoryId: 'health' })
    if (offset >= -2) add({ accountId: 'nubank-card', date: day(12), description: 'ChatGPT Plus', categoryId: 'subscriptions', ...usd(-20_00) })
    // More dining out lately: restaurants above their average.
    if (offset >= -1) {
      add({ accountId: 'itau-card', date: day(offset === 0 ? 2 : 16), description: 'Outback Steakhouse', amount: -between(150, 210), categoryId: 'food' })
    }
    add({ accountId: 'inter-card', date: day(18), description: 'Google One', amount: -9_99, categoryId: 'subscriptions' })
    for (const card of cards) {
      const merchants = cardMerchants[card.id]
      for (let i = 0; i < purchasesPerMonth[card.id]; i++) {
        const m = merchants[Math.floor(random() * merchants.length)]
        add({ accountId: card.id, date: day(1 + Math.floor(random() * 28)), description: m.description, amount: -between(m.min, m.max), categoryId: m.categoryId })
      }
    }
  }

  // Installment purchases ("parcelado"): the purchase is split into equal
  // monthly charges, one per bill. The first installment absorbs rounding.
  // Installments not charged yet still use up the card's credit limit.
  const installmentPlans = [
    { accountId: 'itau-card', startOffset: -5, day: 14, description: 'Magazine Luiza', total: 4_299_90, count: 12, categoryId: 'shopping' },
    { accountId: 'nubank-card', startOffset: -5, day: 9, description: 'Decathlon', total: 389_70, count: 3, categoryId: 'shopping' },
    { accountId: 'itau-card', startOffset: -4, day: 18, description: 'LATAM Airlines', total: 2_400_00, count: 6, categoryId: 'travel' },
    { accountId: 'inter-card', startOffset: -3, day: 25, description: 'Mobly', total: 1_890_00, count: 5, categoryId: 'housing' },
    { accountId: 'nubank-card', startOffset: -2, day: 22, description: 'Dell Computadores', total: 6_000_00, count: 10, categoryId: 'shopping' },
    { accountId: 'inter-card', startOffset: -1, day: 4, description: 'Alura Cursos', total: 900_00, count: 3, categoryId: 'education' },
    { accountId: 'nubank-card', startOffset: 0, day: 5, description: 'Zara', total: 459_80, count: 2, categoryId: 'shopping' },
  ]
  const futureInstallments = new Map<string, Cents>() // card -> installments not yet charged
  for (const p of installmentPlans) {
    const each = Math.floor(p.total / p.count)
    const purchaseDate = dayOfMonth(today, p.startOffset, p.day)
    for (let n = 1; n <= p.count; n++) {
      const amount = n === 1 ? p.total - each * (p.count - 1) : each
      const date = dayOfMonth(today, p.startOffset + n - 1, p.day)
      if (date > todayISO) {
        futureInstallments.set(p.accountId, (futureInstallments.get(p.accountId) ?? 0) + amount)
        continue
      }
      add({
        accountId: p.accountId,
        date,
        description: p.description,
        amount: -amount,
        categoryId: p.categoryId,
        installment: { number: n, total: p.count, totalAmount: p.total, purchaseDate },
      })
    }
  }

  // A couple of recent purchases that haven't settled yet.
  add({ accountId: 'nubank-card', date: todayISO, description: 'iFood', amount: -68_40, categoryId: 'food', status: 'PENDING' })
  add({ accountId: 'itau-card', date: todayISO, description: 'Uber *Trip', amount: -27_15, categoryId: 'transport', status: 'PENDING' })

  // Card bills: each purchase belongs to the first bill closing on/after it.
  // Bills already due are paid in full from the linked checking account.
  const cardAccounts: Account[] = cards.map((card) => {
    const bills = new Map<string, Cents>() // close date -> amount owed
    const billOf = (date: string) => {
      const [y, m, d] = date.split('-').map(Number)
      return d <= card.closeDay
        ? dayOfMonth(new Date(y, m - 1, 1), 0, card.closeDay)
        : dayOfMonth(new Date(y, m - 1, 1), 1, card.closeDay)
    }
    for (const t of txs) {
      if (t.accountId !== card.id) continue
      const close = billOf(t.date)
      bills.set(close, (bills.get(close) ?? 0) - t.amount)
    }
    let owed: Cents = 0
    for (const [close, amount] of bills) {
      const [y, m] = close.split('-').map(Number)
      const due = dayOfMonth(new Date(y, m - 1, 1), 0, card.dueDay)
      if (due <= todayISO) {
        add({ accountId: card.payFrom, date: due, description: `Pagamento fatura ${card.name}`, amount: -amount, categoryId: 'card-payment' })
        add({ accountId: card.id, date: due, description: 'Pagamento recebido', amount, categoryId: 'card-payment' })
      } else {
        owed += amount
      }
    }
    const nextClose = billOf(todayISO)
    const [y, m] = nextClose.split('-').map(Number)
    return {
      id: card.id,
      institutionId: card.institutionId,
      name: card.name,
      type: 'CREDIT',
      subtype: 'CREDIT_CARD',
      balance: owed,
      creditData: {
        creditLimit: card.limit,
        availableCreditLimit: card.limit - owed - (futureInstallments.get(card.id) ?? 0),
        balanceCloseDate: nextClose,
        balanceDueDate: dayOfMonth(new Date(y, m - 1, 1), 0, card.dueDay),
      },
    }
  })

  const flow = (accountId: string, foreign = false) =>
    txs.filter((t) => t.accountId === accountId).reduce((sum, t) => sum + (foreign ? t.foreign!.amount : t.amount), 0)
  const bank = (id: string, institutionId: string, name: string): Account => ({
    id,
    institutionId,
    name,
    type: 'BANK',
    subtype: 'CHECKING_ACCOUNT',
    balance: OPENING_BALANCES[id] + flow(id),
  })
  const usdBalance = OPENING_BALANCES['wise-usd'] + flow('wise-usd', true)

  const accounts: Account[] = [
    bank('nubank-checking', 'nubank', 'Conta corrente'),
    cardAccounts[0],
    bank('itau-checking', 'itau', 'Conta corrente'),
    cardAccounts[1],
    bank('inter-checking', 'inter', 'Conta digital'),
    cardAccounts[2],
    bank('wise-brl', 'wise', 'Saldo em BRL'),
    {
      id: 'wise-usd',
      institutionId: 'wise',
      name: 'Saldo em USD',
      type: 'BANK',
      subtype: 'CHECKING_ACCOUNT',
      balance: convertToBRL(usdBalance, USD_BRL_TODAY),
      foreign: { currency: 'USD', balance: usdBalance, rate: USD_BRL_TODAY },
    },
  ]

  txs.sort((a, b) => (a.date === b.date ? b.id.localeCompare(a.id, undefined, { numeric: true }) : b.date.localeCompare(a.date)))

  // The categories come from the demo repository (stored and editable).
  return { institutions, accounts, categories: [], subcategories: [], transactions: txs, source: 'demo' }
}

/**
 * Demo subcategories by description: the default subcategory's English name
 * (src/data/categoryCatalog.ts), so the demo shows them in use.
 */
export const DEMO_SUBCATEGORIES: Record<string, string> = {
  'Pão de Açúcar': 'Supermarket',
  Carrefour: 'Supermarket',
  Hortifruti: 'Supermarket',
  'Padaria Bella Vista': 'Bakery',
  iFood: 'Delivery',
  'Coco Bambu': 'Dining out',
  'Outback Steakhouse': 'Dining out',
  'ChatGPT Plus': 'Software',
  'Uber *Trip': 'Ride apps',
  '99 Tecnologia': 'Ride apps',
  'Shell Select': 'Fuel',
  'Posto Ipiranga': 'Fuel',
  'Aluguel - Imobiliária Lopes': 'Rent',
  'Condomínio Ed. Aurora': 'Condo fee',
  'Enel Distribuição SP': 'Electricity',
  'Vivo Fibra': 'Internet',
  'Netflix.com': 'Streaming',
  Spotify: 'Streaming',
  GitHub: 'Software',
  Figma: 'Software',
  AWS: 'Software',
  'Google One': 'Software',
  Drogasil: 'Pharmacy',
  'Dell Computadores': 'Electronics',
  'Magazine Luiza': 'Appliances',
  Renner: 'Clothing',
  Zara: 'Clothing',
  'LATAM Airlines': 'Flights',
  'Salário - Acme Tecnologia Ltda': 'Base salary',
  'Northwind Inc. - Invoice': 'Clients',
}
