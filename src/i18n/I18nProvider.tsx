import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { Category } from '../data/types'
import { messages, type Messages } from './messages'
import { setActiveLocale, type Locale } from './locale'

const STORAGE_KEY = 'trove.locale'

/**
 * Also saved as a cookie so the server can show Auth0's login page in the same
 * language (see server/auth). Not secret.
 */
function saveLocaleCookie(l: Locale) {
  try {
    document.cookie = `trove_locale=${l}; Path=/; Max-Age=31536000; SameSite=Lax`
  } catch {
    // cookies unavailable
  }
}

interface I18n {
  locale: Locale
  setLocale(locale: Locale): void
  t: Messages
  /** Category name in the active language (falls back to the name in the data). */
  categoryName(category: Category | undefined): string
}

const I18nContext = createContext<I18n | null>(null)

/** Saved choice, else the device language (pt-BR for any Portuguese device, English otherwise). */
function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'en' || saved === 'pt-BR') return saved
  } catch {
    // storage unavailable
  }
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en'
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const l = initialLocale()
    setActiveLocale(l)
    saveLocaleCookie(l)
    document.documentElement.lang = l
    return l
  })

  const setLocale = useCallback((l: Locale) => {
    setActiveLocale(l)
    saveLocaleCookie(l)
    document.documentElement.lang = l
    try {
      localStorage.setItem(STORAGE_KEY, l)
    } catch {
      // storage unavailable; the choice lasts until reload
    }
    setLocaleState(l)
  }, [])

  const value = useMemo<I18n>(() => {
    const t = messages[locale]
    return { locale, setLocale, t, categoryName: (c) => (c ? (t.categories[c.id] ?? c.name) : '') }
  }, [locale, setLocale])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

/**
 * Current language, strings and setter. Components that call this re-render
 * when the language changes; memoised values that hold formatted text must
 * list `locale` as a dependency.
 */
export function useI18n(): I18n {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n outside I18nProvider')
  return ctx
}
