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
  /** Closing and due days set by hand; when present, the dates above come from them. */
  userDays?: { close: number; due: number }
  /**
   * Closing and due days estimated from the card's last bills (see
   * src/data/closingDay.ts); used when the bank reports no closing date and
   * none was set by hand.
   */
  estimatedDays?: { close: number; due: number; bills: number }
  /** The dates above come from `estimatedDays`. */
  estimated?: boolean
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
  /** A name set in Trove; shown instead of the bank's. Sync never changes it. */
  nickname?: string
}

/** What a transaction counts as: income, an expense, or money moving between connected accounts. */
export type CategoryKind = 'income' | 'expense' | 'transfer'

/** A category's type: transfers have no category. */
export type CategoryType = 'expense' | 'income'

/** Categories, stored in the database (seeded from the defaults in the app's language). */
export interface Category {
  id: string
  name: string
  type: CategoryType
  /** One of the 24 colour keys (src/data/categoryCatalog.ts); the CSS token is --cat-<color>. */
  color: string
  /** An icon key: a file name in src/assets/icons/categories/. */
  icon: string
  sortOrder: number
}

export interface Subcategory {
  id: string
  categoryId: string
  name: string
  sortOrder: number
}

/** A hand-set answer to "is this a transfer (own accounts, or a card bill payment)?". */
export type TransferOverride = 'own' | 'card-payment' | 'none'

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
  /** Null: uncategorized (or a transfer, which never has a category). */
  categoryId: string | null
  /** Always one of `categoryId`'s subcategories. */
  subcategoryId?: string | null
  /**
   * Money moving between connected accounts: "own" (a transfer or a
   * currency conversion) or "card-payment" (paying a card's bill). Never
   * income or an expense, and never categorized.
   */
  transfer?: 'own' | 'card-payment'
  /**
   * Set by hand in the transaction's details: "own" marks it as a transfer
   * between own accounts, "card-payment" as a card bill payment; "none" says
   * it is neither (overrides detection).
   */
  transferOverride?: TransferOverride
  /** Hidden: left out of every total, chart, average and the list. */
  hidden?: boolean
  status: 'POSTED' | 'PENDING'
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

/** Where the data came from: hardcoded demo data or the connected banks via Pluggy. */
export type DataSource = 'demo' | 'pluggy'

/** Everything the app shows, loaded in one go through the Repository. */
export interface Snapshot {
  institutions: Institution[]
  accounts: Account[]
  categories: Category[]
  subcategories: Subcategory[]
  transactions: Transaction[]
  source: DataSource
  /** When the data was fetched (ISO timestamp); only for live data. */
  fetchedAt?: string
  /** Live data: when each bank connection last synced. */
  sync?: SyncInfo
  /** Which income counts in the average income (none excluded when absent). */
  incomeFilter?: IncomeFilter
  /** What the month-end projection counts (the defaults when absent). */
  projectionSettings?: ProjectionSettings
  /**
   * Live data: every month with a stored transaction (YYYY-MM, oldest first).
   * `transactions` holds the recent ones; Transações fetches older months.
   */
  storedMonths?: string[]
  /** Names set in Trove for accounts and cards, by account ID (applied to `accounts`). */
  accountNames?: Record<string, string>
  /** Hand-set answers about detected recurring charges, by recurring charge ID. */
  recurringOverrides?: Record<string, RecurringOverride>
}

/** What the month-end projection counts. */
export interface ProjectionSettings {
  /** The accounts whose balance is projected; null: every checking account in BRL. */
  accountIds: string[] | null
  /** Subtract the usual day-to-day spending (debit, Pix, boleto) until the end of the month. */
  includeDaily: boolean
  /** Count the expected freelance income next to the salary. */
  includeFreelance: boolean
}

/**
 * A hand-set answer about a recurring charge. `status`: confirmed (no longer
 * "new"), not recurring (left out), cancelled (stopped) or still active
 * (never shown as stopped). `increaseDismissedAt`: price increases from that
 * date or before are no longer flagged.
 */
export interface RecurringOverride {
  status?: 'confirmed' | 'not_recurring' | 'cancelled' | 'still_active'
  /** Day the status was set (ISO date). */
  statusAt?: string
  increaseDismissedAt?: string
}

/**
 * The average income's categories, stored as exclusions, so a category or
 * subcategory created later counts by default.
 */
export interface IncomeFilter {
  excludedCategoryIds: string[]
  excludedSubcategoryIds: string[]
  excludeUncategorized: boolean
}

export interface SyncInfo {
  /** Last time every connection synced (ISO timestamp), or null if never. */
  lastSyncedAt: string | null
  /** Each configured bank connection, in sync order. */
  connections: {
    id: string
    name: string | null
    lastSyncedAt: string | null
    /** Pluggy's status for the connection (UPDATED, LOGIN_ERROR, OUTDATED…), null before its first sync. */
    status: string | null
  }[]
}

/** A background sync: one item per bank connection, worked through by the server. */
export interface SyncJob {
  id: string
  createdAt: string
  /** No item is queued or running. */
  done: boolean
  items: {
    connectionId: string
    /** The bank's name, once the connection has synced at least once. */
    name: string | null
    status: 'queued' | 'running' | 'ok' | 'failed'
    inserted: number
    updated: number
    removed: number
    /** Failed items: a status code (e.g. "pluggy_401", "timeout"). */
    error: string | null
  }[]
}

/**
 * How far back a sync reads: "default" re-reads 35 days before the last sync
 * (everything since January 2025 on a connection's first sync); the others
 * read the current month and the ones before it (3, 6 or 12 months in all),
 * or everything the bank provides ("all").
 */
export type SyncPeriod = 'default' | '3m' | '6m' | '1y' | 'all'
export const SYNC_PERIODS: readonly SyncPeriod[] = ['default', '3m', '6m', '1y', 'all']

/** Advanced sync: which accounts and cards (null or absent: all of them) and how far back. */
export interface SyncOptions {
  accountIds?: string[] | null
  period?: SyncPeriod
}

/** The result of syncing one bank connection. */
export interface SyncResult {
  connectionId: string
  name: string | null
  inserted: number
  updated: number
  removed: number
}

/** Months of history the app shows (charts, month filters) and the server fetches. */
export const MONTHS_OF_HISTORY = 6

/**
 * Months the app loads for the insights (the current one included): recurring
 * charges need a year to find yearly ones, and the unusual categories compare
 * a month with the 6 before it. Screens still show MONTHS_OF_HISTORY.
 */
export const MONTHS_OF_ANALYSIS = 14
