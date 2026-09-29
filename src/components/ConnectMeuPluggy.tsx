import { lazy, Suspense, useState } from 'react'
import { useI18n } from '../i18n/I18nProvider'

// The Pluggy Connect widget is loaded only when needed, so the app stays light
// on slower phones.
const PluggyConnect = lazy(() => import('react-pluggy-connect').then((m) => ({ default: m.PluggyConnect })))

type State =
  | { step: 'idle' }
  | { step: 'loading' }
  | { step: 'open'; accessToken: string; connectorIds: number[] }
  | { step: 'connected'; itemId: string }
  | { step: 'error'; message: string }

/**
 * Opens Pluggy Connect, restricted to the MeuPluggy connector (the free path),
 * with a token from /api/connect-token. The Client ID and Secret stay on the
 * server. After connecting, shows the new item ID to put in PLUGGY_ITEM_IDS.
 */
export function ConnectMeuPluggy() {
  const { t, locale } = useI18n()
  const [state, setState] = useState<State>({ step: 'idle' })
  const [copied, setCopied] = useState(false)

  async function open() {
    setState({ step: 'loading' })
    try {
      const res = await fetch('/api/connect-token', { method: 'POST', credentials: 'same-origin', headers: { Accept: 'application/json' } })
      const body = (await res.json().catch(() => ({}))) as { accessToken?: string; connectorIds?: number[]; error?: string }
      if (res.status === 503) return setState({ step: 'error', message: t.connect.notConfigured })
      if (res.status === 409) return setState({ step: 'error', message: t.connect.meuPluggyMissing })
      if (!res.ok || !body.accessToken || !body.connectorIds?.length) return setState({ step: 'error', message: t.connect.failed })
      setState({ step: 'open', accessToken: body.accessToken, connectorIds: body.connectorIds })
    } catch {
      setState({ step: 'error', message: t.connect.failed })
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      // Clipboard refused: the ID stays selectable on screen.
    }
  }

  return (
    <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
      <h2 className="font-semibold">{t.connect.title}</h2>
      <p className="mt-1 text-sm text-ink-2">{t.connect.intro}</p>

      {state.step === 'connected' ? (
        <div className="mt-3 space-y-2">
          <p className="text-sm font-medium text-income">{t.connect.connected}</p>
          <p className="text-sm text-ink-2">{t.connect.nextStep}</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-track px-2 py-2 text-xs select-all">{state.itemId}</code>
            <button
              type="button"
              onClick={() => copy(state.itemId)}
              className="h-10 shrink-0 rounded-full px-4 text-sm font-medium text-accent ring-1 ring-line focus-visible:outline-2 focus-visible:outline-accent"
            >
              {copied ? t.connect.copied : t.connect.copy}
            </button>
          </div>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={open}
            disabled={state.step === 'loading' || state.step === 'open'}
            className="mt-3 h-11 rounded-full bg-accent px-5 font-medium text-white disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-accent"
          >
            {state.step === 'loading' || state.step === 'open' ? t.connect.opening : t.connect.button}
          </button>
          {state.step === 'error' && <p className="mt-2 text-sm text-critical">{state.message}</p>}
        </>
      )}

      {state.step === 'open' && (
        <Suspense fallback={null}>
          <PluggyConnect
            connectToken={state.accessToken}
            connectorIds={state.connectorIds}
            selectedConnectorId={state.connectorIds[0]}
            includeSandbox={false}
            language={locale === 'pt-BR' ? 'pt' : 'en'}
            onSuccess={({ item }) => setState({ step: 'connected', itemId: item.id })}
            onError={() => setState({ step: 'error', message: t.connect.failed })}
            onClose={() => setState((s) => (s.step === 'open' ? { step: 'idle' } : s))}
            onLoadError={() => setState({ step: 'error', message: t.connect.failed })}
          />
        </Suspense>
      )}
    </section>
  )
}
