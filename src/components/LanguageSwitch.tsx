import { useI18n } from '../i18n/I18nProvider'
import { LOCALES, type Locale } from '../i18n/locale'

// Flag emoji render on Android and iOS; Windows shows the letters "US"/"BR"
// instead, which still reads fine. Screen readers use the language name.
const labels: Record<Locale, { flag: string; name: string }> = {
  en: { flag: '🇺🇸', name: 'English' },
  'pt-BR': { flag: '🇧🇷', name: 'Português (Brasil)' },
}

/** Two-option segmented control: 🇺🇸 | 🇧🇷. The inactive flag is dimmed. */
export function LanguageSwitch() {
  const { locale, setLocale, t } = useI18n()
  return (
    <div role="group" aria-label={t.language} className="flex gap-0.5 rounded-full bg-surface p-0.5 ring-1 ring-line">
      {LOCALES.map((l) => {
        const active = locale === l
        return (
          <button
            key={l}
            type="button"
            lang={l}
            aria-pressed={active}
            aria-label={labels[l].name}
            title={labels[l].name}
            onClick={() => setLocale(l)}
            className={`flex size-9 items-center justify-center rounded-full text-xl leading-none transition focus-visible:outline-2 focus-visible:outline-accent ${
              active ? 'bg-accent/15 ring-2 ring-accent' : 'opacity-50 grayscale hover:opacity-80'
            }`}
          >
            <span aria-hidden>{labels[l].flag}</span>
          </button>
        )
      })}
    </div>
  )
}
