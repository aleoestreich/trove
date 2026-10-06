// Domain model. Shapes follow Pluggy's API (Item -> Account -> Transaction)
// so the Phase 2 backend can map Pluggy responses onto them directly.

/** ISO 4217 code (e.g. 'BRL', 'USD'). BRL is the home currency; everything is totalled in BRL. */
export type CurrencyCode = string

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
  /** Limit minus the open bill minus installments still to be charged. */
  availableCreditLimit: Cents
  /** Day the current bill closes (ISO date), if the bank reports it. */
  balanceCloseDate: string | null
  /** Day the current bill is due (ISO date), if the bank reports it. */
  balanceDueDate: string | null
  /** Closing and due days set by the owner; when present, the dates above come from them. */
  userDays?: { close: number; due: number }
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
  /**
   * Set by the owner: left out of income, expenses and the charts. Balances,
   * card bills and installments still include it (the money did move).
   */
  ignored?: boolean
  /**
   * Credit-card installment purchase ("parcelado"), mirroring Pluggy's
   * `creditCardMetadata`. Each installment is its own transaction, charged in
   * a later bill; `amount` is this installment only.
   */
  installment?: {
    /** 1-based: this is installment `number` of `total`. */
    number: number
    total: number
    /** Full purchase amount across all installments (positive). */
    totalAmount: Cents
    /** Date of the original purchase. */
    purchaseDate: string
  }
}

/** Where the data came from: hardcoded demo data or the owner's banks via Pluggy. */
export type DataSource = 'demo' | 'pluggy'

/** Everything the app shows, loaded in one go through the Repository. */
export interface Snapshot {
  institutions: Institution[]
  accounts: Account[]
  categories: Category[]
  transactions: Transaction[]
  source: DataSource
  /** When the data was fetched (ISO timestamp); only for live data. */
  fetchedAt?: string
}

/** Months of history the app shows (charts, month filters) and the server fetches. */
export const MONTHS_OF_HISTORY = 6
