import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../components/ui'
import { Icon } from '../components/Icon'
import { useI18n } from '../i18n/I18nProvider'

/**
 * The owner's view of Pluggy's raw responses (GET /api/debug/pluggy), to check
 * what Pluggy really sends in production: per configured item, the item, its
 * accounts, and each account's transactions (page by page) and bills.
 * Nothing here is stored. Responses are shown in full, values included.
 */

type Endpoint = 'item' | 'accounts' | 'transactions' | 'bills'

interface Reply {
  /** HTTP status of our route. */
  httpStatus: number
  /** Our route's JSON: { request, status, body } or { error, message }. */
  json: { request?: string; status?: number; body?: unknown; error?: string; message?: string } | null
}

interface Call {
  loading: boolean
  reply?: Reply
  page: number
}

interface PluggyAccount {
  id: string
  type?: string
  subtype?: string
}

async function callDebug(params: Record<string, string | undefined>): Promise<Reply> {
  const qs = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => e[1] !== undefined))
  const res = await fetch(`/api/debug/pluggy?${qs}`, { credentials: 'same-origin', headers: { Accept: 'application/json' }, cache: 'no-store' })
  let json: Reply['json'] = null
  try {
    json = (await res.json()) as Reply['json']
  } catch {
    // not JSON (e.g. the login redirect page)
  }
  return { httpStatus: res.status, json }
}

/** The `after` cursor from a v2 transactions page's `next` link. */
function nextCursor(body: unknown): string | undefined {
  const next = (body as { next?: unknown } | null)?.next
  if (typeof next !== 'string' || !next) return undefined
  return new URL(next, 'https://api.pluggy.ai').searchParams.get('after') ?? undefined
}

export function Debug() {
  const { t } = useI18n()
  const [itemIds, setItemIds] = useState<string[] | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [calls, setCalls] = useState<Record<string, Call>>({})

  useEffect(() => {
    let live = true
    callDebug({})
      .then((r) => {
        if (!live) return
        if (r.httpStatus === 503) setListError(t.debug.notConfigured)
        else if (r.httpStatus !== 200 || !r.json) setListError(t.debug.failed(r.httpStatus))
        else setItemIds((r.json as { itemIds?: string[] }).itemIds ?? [])
      })
      .catch(() => live && setListError(t.debug.failed(0)))
    return () => {
      live = false
    }
  }, [t])

  async function run(key: string, params: Record<string, string | undefined>, page: number) {
    setCalls((c) => ({ ...c, [key]: { ...c[key], loading: true, page } }))
    let reply: Reply
    try {
      reply = await callDebug(params)
    } catch {
      reply = { httpStatus: 0, json: null }
    }
    setCalls((c) => ({ ...c, [key]: { loading: false, reply, page } }))
  }

  const keyOf = (endpoint: Endpoint, itemId: string, accountId = '') => `${endpoint}:${itemId}:${accountId}`

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link to="/accounts" aria-label={t.nav.accounts} className="flex size-10 items-center justify-center rounded-full text-ink-2 active:bg-track">
          <Icon name="chevronLeft" className="size-5" />
        </Link>
        <h1 className="text-[22px] leading-7 font-medium text-ink">{t.debug.title}</h1>
      </div>
      <p className="text-sm leading-5 text-muted">{t.debug.intro}</p>

      {listError && <p className="rounded-md bg-critical-soft p-3 text-sm leading-5 text-critical">{listError}</p>}
      {!itemIds && !listError && <p className="text-sm text-muted">{t.debug.loading}</p>}

      {itemIds?.map((itemId, i) => {
        const accountsCall = calls[keyOf('accounts', itemId)]
        const accountsBody = accountsCall?.reply?.json?.body as { results?: PluggyAccount[] } | undefined
        const accounts = accountsBody?.results ?? null
        return (
          <Card key={itemId} className="flex flex-col gap-3">
            <div className="flex flex-col gap-0.5">
              <h2 className="text-base leading-[22px] font-medium text-ink">{t.debug.item(i + 1)}</h2>
              <code className="text-xs leading-4 break-all text-muted">{itemId}</code>
            </div>
            <div className="flex flex-wrap gap-2">
              <CallButton label={t.debug.itemCall} onClick={() => run(keyOf('item', itemId), { endpoint: 'item', itemId }, 1)} />
              <CallButton label={t.debug.accountsCall} onClick={() => run(keyOf('accounts', itemId), { endpoint: 'accounts', itemId }, 1)} />
            </div>
            <Result call={calls[keyOf('item', itemId)]} />
            <Result call={accountsCall} />

            {accounts === null ? (
              <p className="text-xs leading-4 text-muted">{t.debug.accountsHint}</p>
            ) : (
              accounts.map((a) => {
                const txKey = keyOf('transactions', itemId, a.id)
                const txCall = calls[txKey]
                const after = nextCursor(txCall?.reply?.json?.body)
                return (
                  <div key={a.id} className="flex flex-col gap-2 border-t border-line pt-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm leading-5 font-medium text-ink">
                        {a.type ?? '?'}
                        {a.subtype ? ` · ${a.subtype}` : ''}
                      </span>
                      <code className="text-xs leading-4 break-all text-muted">{a.id}</code>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <CallButton
                        label={t.debug.transactions}
                        onClick={() => run(txKey, { endpoint: 'transactions', itemId, accountId: a.id }, 1)}
                      />
                      {a.type === 'CREDIT' && (
                        <CallButton
                          label={t.debug.bills}
                          onClick={() => run(keyOf('bills', itemId, a.id), { endpoint: 'bills', itemId, accountId: a.id }, 1)}
                        />
                      )}
                      {after && !txCall?.loading && (
                        <CallButton
                          label={t.debug.nextPage}
                          onClick={() => run(txKey, { endpoint: 'transactions', itemId, accountId: a.id, after }, (txCall?.page ?? 1) + 1)}
                        />
                      )}
                    </div>
                    <Result call={txCall} showPage />
                    <Result call={calls[keyOf('bills', itemId, a.id)]} />
                  </div>
                )
              })
            )}
          </Card>
        )
      })}
    </div>
  )
}

function CallButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-9 items-center rounded-full border border-line bg-surface px-3.5 text-sm font-medium text-ink active:bg-track"
    >
      {label}
    </button>
  )
}

function Result({ call, showPage = false }: { call?: Call; showPage?: boolean }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  if (!call) return null
  if (call.loading) return <p className="text-xs leading-4 text-muted">{t.debug.loading}</p>

  const reply = call.reply
  const json = reply?.json
  const ok = reply?.httpStatus === 200 && json && json.error === undefined
  const shown = ok ? json.body : json
  const text = JSON.stringify(shown, null, 2) ?? ''
  const pluggyStatus = ok ? json.status : reply?.httpStatus
  const good = pluggyStatus !== undefined && pluggyStatus >= 200 && pluggyStatus < 300

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard unavailable
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`inline-flex h-[22px] shrink-0 items-center rounded-full px-2 text-[11px] font-medium ${good ? 'bg-income-soft text-income' : 'bg-critical-soft text-critical'}`}
          >
            {t.debug.status(pluggyStatus ?? 0)}
          </span>
          {ok && json.request && <code className="truncate text-xs leading-4 text-muted">{json.request}</code>}
          {showPage && call.page > 1 && <span className="shrink-0 text-xs leading-4 text-muted">{t.debug.page(call.page)}</span>}
        </div>
        <button type="button" onClick={copy} className="shrink-0 text-xs leading-4 font-medium text-accent">
          {copied ? t.debug.copied : t.debug.copy}
        </button>
      </div>
      <pre className="max-h-[420px] overflow-auto rounded-md bg-track p-3 text-[11px] leading-4 text-ink">{text}</pre>
    </div>
  )
}
