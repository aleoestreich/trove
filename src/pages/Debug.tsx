import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../components/ui'
import { Icon } from '../components/Icon'
import { useI18n } from '../i18n/I18nProvider'
import { loadEverything, nextCursor, type Answer, type Dump } from '../lib/pluggyDump'

/**
 * TEMPORARY. Pluggy's raw responses (GET /api/debug/pluggy), to check
 * what Pluggy really sends in production: per configured item, the item, its
 * accounts, each account's transactions (page by page) and bills, identity,
 * investments and their movements, and loans; or all of it at once ("Carregar
 * tudo"), to copy or download as JSON. Nothing here is stored. Responses are
 * shown in full, values included.
 */

type Endpoint = 'item' | 'accounts' | 'transactions' | 'bills' | 'identity' | 'investments' | 'investmentTransactions' | 'loans'

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

/** One call, as "Carregar tudo" keeps it: Pluggy's request, status and body (or the route's refusal). */
async function answer(params: Record<string, string | undefined>): Promise<Answer> {
  const r = await callDebug(params)
  const ok = r.httpStatus === 200 && r.json && r.json.error === undefined
  return ok ? { request: r.json!.request ?? null, status: r.json!.status ?? 0, body: r.json!.body } : { request: null, status: r.httpStatus, body: r.json }
}

interface AllState {
  loading: boolean
  calls: number
  dump?: Dump
}

/** Saves `data` as a JSON file on this device. */
function download(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function Debug() {
  const { t } = useI18n()
  const [itemIds, setItemIds] = useState<string[] | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [calls, setCalls] = useState<Record<string, Call>>({})
  const [all, setAll] = useState<Record<string, AllState>>({})
  const [allBanks, setAllBanks] = useState<{ loading: boolean; calls: number } | null>(null)

  const loadAll = async (itemId: string): Promise<Dump> => {
    setAll((a) => ({ ...a, [itemId]: { loading: true, calls: 0 } }))
    const dump = await loadEverything(itemId, answer, () => {
      setAll((a) => ({ ...a, [itemId]: { ...a[itemId], calls: (a[itemId]?.calls ?? 0) + 1 } }))
      setAllBanks((b) => b && { ...b, calls: b.calls + 1 })
    })
    setAll((a) => ({ ...a, [itemId]: { loading: false, calls: a[itemId]?.calls ?? 0, dump } }))
    return dump
  }
  const loadAllBanks = async () => {
    if (!itemIds) return
    setAllBanks({ loading: true, calls: 0 })
    const dumps: Dump[] = []
    for (const id of itemIds) dumps.push(await loadAll(id))
    setAllBanks((b) => b && { ...b, loading: false })
    download(`meu-pluggy-${new Date().toISOString().slice(0, 10)}.json`, dumps)
  }

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

      {itemIds && itemIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={loadAllBanks}
            disabled={!!allBanks?.loading}
            className="inline-flex h-11 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-surface disabled:opacity-60"
          >
            <Icon name="download" className="size-[18px]" />
            {t.debug.loadAllBanks}
          </button>
          {allBanks?.loading && <span className="text-xs leading-4 text-muted">{t.debug.loadingAll(allBanks.calls)}</span>}
        </div>
      )}
      <p className="text-xs leading-4 text-muted">{t.debug.allNote}</p>

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
              <CallButton label={t.debug.loadAll} onClick={() => loadAll(itemId)} strong />
              <CallButton label={t.debug.itemCall} onClick={() => run(keyOf('item', itemId), { endpoint: 'item', itemId }, 1)} />
              <CallButton label={t.debug.accountsCall} onClick={() => run(keyOf('accounts', itemId), { endpoint: 'accounts', itemId }, 1)} />
              <CallButton label={t.debug.identityCall} onClick={() => run(keyOf('identity', itemId), { endpoint: 'identity', itemId }, 1)} />
              <CallButton label={t.debug.investmentsCall} onClick={() => run(keyOf('investments', itemId), { endpoint: 'investments', itemId }, 1)} />
              <CallButton label={t.debug.loansCall} onClick={() => run(keyOf('loans', itemId), { endpoint: 'loans', itemId }, 1)} />
            </div>
            <AllResult state={all[itemId]} itemId={itemId} />
            <Result call={calls[keyOf('item', itemId)]} />
            <Result call={accountsCall} />
            <Result call={calls[keyOf('identity', itemId)]} />
            <Result call={calls[keyOf('investments', itemId)]} />
            {(
              (calls[keyOf('investments', itemId)]?.reply?.json?.body as { results?: { id: string; name?: string; type?: string }[] } | undefined)?.results ?? []
            ).map((inv) => {
              const key = keyOf('investmentTransactions', itemId, inv.id)
              const c = calls[key]
              const totalPages = (c?.reply?.json?.body as { totalPages?: number } | undefined)?.totalPages ?? 1
              return (
                <div key={inv.id} className="flex flex-col gap-2 border-t border-line pt-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm leading-5 font-medium text-ink">
                      {inv.type ?? '?'}
                      {inv.name ? ` · ${inv.name}` : ''}
                    </span>
                    <code className="text-xs leading-4 break-all text-muted">{inv.id}</code>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <CallButton
                      label={t.debug.investmentTransactions}
                      onClick={() => run(key, { endpoint: 'investmentTransactions', itemId, investmentId: inv.id, page: '1' }, 1)}
                    />
                    {c && !c.loading && c.page < totalPages && (
                      <CallButton
                        label={t.debug.nextPage}
                        onClick={() => run(key, { endpoint: 'investmentTransactions', itemId, investmentId: inv.id, page: String(c.page + 1) }, c.page + 1)}
                      />
                    )}
                  </div>
                  <Result call={c} showPage />
                </div>
              )
            })}
            <Result call={calls[keyOf('loans', itemId)]} />

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

function CallButton({ label, onClick, strong = false }: { label: string; onClick: () => void; strong?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-9 items-center rounded-full border px-3.5 text-sm font-medium active:bg-track ${strong ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface text-ink'}`}
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

/** "Carregar tudo" for one bank: progress, then the whole JSON with Copiar and Baixar. */
function AllResult({ state, itemId }: { state?: AllState; itemId: string }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  if (!state) return null
  if (state.loading) return <p className="text-xs leading-4 text-muted">{t.debug.loadingAll(state.calls)}</p>
  const text = JSON.stringify(state.dump, null, 2) ?? ''
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
        <span className="text-sm leading-5 font-medium text-ink">{t.debug.allTitle}</span>
        <span className="flex shrink-0 gap-3">
          <button type="button" onClick={copy} className="text-xs leading-4 font-medium text-accent">
            {copied ? t.debug.copied : t.debug.copy}
          </button>
          <button type="button" onClick={() => download(`meu-pluggy-${itemId}.json`, state.dump)} className="text-xs leading-4 font-medium text-accent">
            {t.debug.download}
          </button>
        </span>
      </div>
      <pre className="max-h-[520px] overflow-auto rounded-md bg-track p-3 text-[11px] leading-4 text-ink">{text}</pre>
    </div>
  )
}
