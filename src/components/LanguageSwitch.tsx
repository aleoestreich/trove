import { useI18n } from '../i18n/I18nProvider'
import { LOCALES, type Locale } from '../i18n/locale'

const labels: Record<Locale, { short: string; name: string }> = {
  en: { short: 'EN', name: 'English' },
  'pt-BR': { short: 'PT-BR', name: 'Português (Brasil)' },
}

/** Two-option segmented control: EN | PT-BR. */
export function LanguageSwitch() {
  const { locale, setLocale, t } = useI18n()
  return (
    <div role="group" aria-label={t.language} className="flex rounded-full bg-surface p-0.5 text-xs ring-1 ring-line">
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={locale === l}
          aria-label={labels[l].name}
          onClick={() => setLocale(l)}
          className={`min-h-8 rounded-full px-2.5 font-medium focus-visible:outline-2 focus-visible:outline-accent ${
            locale === l ? 'bg-accent text-white' : 'text-ink-2'
          }`}
        >
          {labels[l].short}
        </button>
      ))}
    </div>
  )
}
