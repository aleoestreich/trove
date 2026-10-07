import { createContext, useContext, type ReactNode } from 'react'
import type { Category } from '../data/types'
import { messages, type Messages } from './messages'

interface I18n {
  t: Messages
  /** A category's name as stored, or "Sem categoria". */
  categoryName(category: Category | null | undefined): string
}

const value: I18n = { t: messages, categoryName: (c) => (c ? c.name : messages.transactions.uncategorized) }
const I18nContext = createContext<I18n>(value)

export function I18nProvider({ children }: { children: ReactNode }) {
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

/** The UI strings (pt-BR). */
export function useI18n(): I18n {
  return useContext(I18nContext)
}
