// The subset of Pluggy's API responses Trove uses, as JSON (dates are ISO
// strings). Field names follow the official SDK (pluggy-sdk, types/*.d.ts).

export interface PageResponse<T> {
  results: T[]
  page: number
  total: number
  totalPages: number
}

export interface CursorPageResponse<T> {
  results: T[]
  /** Link to the next page (contains an `after` cursor), or null. */
  next: string | null
}

export interface PluggyConnector {
  id: number
  name: string
  /** Brand colour, with or without a leading "#". */
  primaryColor?: string | null
}

/** A connector as listed by GET /connectors (id and name are enough here). */
export interface PluggyConnectorInfo {
  id: number
  name: string
}

export interface PluggyItem {
  id: string
  connector: PluggyConnector
  status: string
  lastUpdatedAt?: string | null
}

export interface PluggyAccount {
  id: string
  itemId: string
  type: 'BANK' | 'CREDIT'
  subtype: 'CHECKING_ACCOUNT' | 'SAVINGS_ACCOUNT' | 'CREDIT_CARD'
  name: string
  marketingName?: string | null
  balance: number
  currencyCode: string
  creditData?: {
    creditLimit?: number | null
    availableCreditLimit?: number | null
    balanceCloseDate?: string | null
    balanceDueDate?: string | null
  } | null
}

/** A closed credit card bill (GET /bills?accountId=, as in the SDK's CreditCardBills). */
export interface PluggyBill {
  id: string
  dueDate: string
  /** When the bill closed; not every bank reports it. */
  billClosingDate?: string | null
  totalAmount: number
  totalAmountCurrencyCode?: string | null
  minimumPaymentAmount?: number | null
  allowsInstallments?: boolean | null
  financeCharges?: unknown[] | null
}

export interface PluggyTransaction {
  id: string
  accountId: string
  date: string
  description: string
  /** DEBIT = money out of the account, CREDIT = money in. */
  type: 'DEBIT' | 'CREDIT'
  amount: number
  amountInAccountCurrency?: number | null
  currencyCode: string
  category?: string | null
  categoryId?: string | null
  /** The bank's own wording, when Pluggy cleaned up `description`. */
  descriptionRaw?: string | null
  merchant?: { name?: string | null; businessName?: string | null } | null
  status?: 'PENDING' | 'POSTED'
  creditCardMetadata?: {
    installmentNumber?: number
    totalInstallments?: number
    totalAmount?: number
    purchaseDate?: string
    /** The card bill this transaction was charged to. */
    billId?: string | null
  } | null
}
