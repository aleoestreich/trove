/** English (US) and Brazilian Portuguese. */
export type Locale = 'en' | 'pt-BR'

export const LOCALES: Locale[] = ['en', 'pt-BR']

/**
 * The active locale for formatting helpers (money, dates). Kept at module level
 * so plain functions can use it; the I18nProvider updates it and re-renders the
 * app whenever the language changes. Defaults to Brazilian Portuguese.
 */
let current: Locale = 'pt-BR'

export function getLocale(): Locale {
  return current
}

export function setActiveLocale(locale: Locale) {
  current = locale
}

/** BCP 47 tag used by Intl for the active locale. */
export function intlLocale(locale: Locale = current): string {
  return locale === 'pt-BR' ? 'pt-BR' : 'en-US'
}
