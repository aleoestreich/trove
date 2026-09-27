// Domain model. Shapes follow Pluggy's API (Item -> Account -> Transaction)
// so the Phase 2 backend can map Pluggy responses onto them directly.

/** ISO 4217 code. BRL is the home currency; everything is totalled in BRL. */
export type CurrencyCode = 'BRL' | 'USD' | 'EUR'

/** An amount in minor units (cents). Never use floats for money. */
export type Cents = number

/** A bank connection (a Pluggy "Item"): one institution, one or more accounts. */
export interface Institution {
  id: string
  name: string
  /** Brand-neutral accent used for the avatar dot. */
  color: string
}

export type AccountType = 'BANK' | 'CREDIT'
export type AccountSubtype = 'CHECKING_ACCOUNT' | 'SAVINGS_ACCOUNT' | 'CREDIT_CARD'

export interface CreditData {
  creditLimit: Cents
  availableCreditLimit: Cents
  /** Day the current bill closes (ISO date). */
  balanceCloseDate: string
  /** Day the current bill is due (ISO date). */
  balanceDueDate: string
}

export interface Account {
  id: string
  institutionId: string
  name: string
  type: AccountType
  subtype: AccountSubtype
  /**
   * Balance in BRL, as reported by Pluggy (which converts foreign balances).
   * BANK: money available. CREDIT: current open bill (amount owed, positive).
   */
  balance: Cents
  /** Present when the account is held in a foreign currency. */
  foreign?: {
    currency: CurrencyCode
    balance: Cents
    /** BRL per 1 unit of the foreign currency used for `balance`. */
    rate: number
  }
  creditData?: CreditData
}

export type CategoryKind = 'income' | 'expense' | 'transfer'

export interface Category {
  id: string
  name: string
  kind: CategoryKind
}

export interface Transaction {
  id: string
  accountId: string
  /** ISO date, yyyy-mm-dd. */
  date: string
  description: string
  /** Signed amount in BRL: positive = money in, negative = money out. */
  amount: Cents
  /** Original amount when the transaction happened in another currency. */
  foreign?: { currency: CurrencyCode; amount: Cents }
  categoryId: string
  status: 'POSTED' | 'PENDING'
  /** Credit-card installment purchase ("parcela 3/10"). */
  installment?: { number: number; total: number }
}
