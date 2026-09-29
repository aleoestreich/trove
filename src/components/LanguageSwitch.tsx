import { useI18n } from '../i18n/I18nProvider'
import { LOCALES, type Locale } from '../i18n/locale'
import { Icon } from './Icon'

const labels: Record<Locale, { short: string; name: string }> = {
  en: { short: 'EN', name: 'English' },
  'pt-BR': { short: 'PT', name: 'Português (Brasil)' },
}

/**
 * Globe + EN | PT segmented control. The visible pill is 32px tall, but each
 * button is 48px tall so it's easy to tap.
 */
export function LanguageSwitch() {
  const { locale, setLocale, t } = useI18n()
  return (
    <div role="group" aria-label={t.language} className="relative flex h-12 items-center">
      <span aria-hidden className="absolute inset-x-0 inset-y-2 rounded-full border border-line bg-surface" />
      <Icon name="globe" className="relative mr-0.5 ml-2 size-4 shrink-0 text-muted" strokeWidth={1.8} />
      {LOCALES.map((l, i) => {
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
            className={`group relative flex h-12 items-center focus-visible:outline-none ${i === 0 ? 'pl-0.5' : 'pr-1'}`}
          >
            <span
              className={`inline-flex h-[26px] min-w-[34px] items-center justify-center rounded-full px-2 text-xs leading-none tracking-[0.08em] group-focus-visible:outline-2 group-focus-visible:outline-accent ${
                active ? 'bg-accent-soft font-bold text-accent' : 'font-medium text-muted'
              }`}
            >
              {labels[l].short}
            </span>
          </button>
        )
      })}
    </div>
  )
}
