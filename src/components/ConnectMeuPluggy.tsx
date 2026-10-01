import { lazy, Suspense, useState } from 'react'
import { useI18n } from '../i18n/I18nProvider'
import { Badge, Button, CardTitle, IconDisc } from './ui'

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

  const busy = state.step === 'loading' || state.step === 'open'

  return (
    <section className="flex flex-col gap-3.5 rounded-lg border border-line bg-surface p-4 lg:p-5">
      <div className="flex items-start gap-3">
        <IconDisc icon="accounts" tone="accent" />
        <CardTitle subtitle={t.connect.intro}>{t.connect.title}</CardTitle>
      </div>

      {state.step === 'connected' ? (
        <div className="flex flex-col gap-2">
          <div>
            <Badge tone="income" icon="check">
              {t.connect.connected}
            </Badge>
          </div>
          <p className="text-sm leading-5 text-ink-2">{t.connect.nextStep}</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-sm bg-page px-3 py-3 text-[13px] text-ink select-all">{state.itemId}</code>
            <Button variant="secondary" className="shrink-0" onClick={() => copy(state.itemId)}>
              {copied ? t.connect.copied : t.connect.copy}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <Button className="self-start" onClick={open} disabled={busy}>
            {busy ? t.connect.opening : t.connect.button}
          </Button>
          {state.step === 'error' && (
            <p role="alert" className="text-sm leading-5 text-critical">
              {state.message}
            </p>
          )}
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
