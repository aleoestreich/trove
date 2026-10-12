import { useEffect, useRef, useState } from 'react'
import { HashRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { DataGate, DataProvider, useDataSource, useSync } from './state'
import { createMockRepository } from './data/mockRepository'
import { createApiRepository, withDemoFallback } from './data/apiRepository'
import { Dashboard } from './pages/Dashboard'
import { Transactions } from './pages/Transactions'
import { Accounts } from './pages/Accounts'
import { Installments } from './pages/Installments'
import { Categories } from './pages/Categories'
import { HiddenTransactions } from './pages/Transactions'
import { Projection } from './pages/Projection'
import { UnusualAll, UnusualCategory } from './pages/UnusualCategory'
import { Recurring } from './pages/Recurring'
import { SpendingBalance } from './pages/SpendingBalance'
import { ExtraPay } from './pages/ExtraPay'
import { Receivables } from './pages/Receivables'
import { MonthClose } from './pages/MonthClose'
import { BalanceOrganize } from './pages/BalanceOrganize'
import { Debug } from './pages/Debug'
import { Snackbar, SyncBar } from './components/SyncBar'
import { Icon, type IconName } from './components/Icon'
import { Wordmark } from './components/Logo'
import { I18nProvider, useI18n } from './i18n/I18nProvider'
import type { Messages } from './i18n/messages'
import { isDeployed } from './lib/useIsDesktop'
import { usePrivacy } from './lib/privacy'

// Deployed: data from the database via /api (demo data until configured and synced).
// Local development: demo data.
const repository = isDeployed() ? withDemoFallback(createApiRepository(), createMockRepository()) : createMockRepository()

/** The insight pages open from the Overview, so its tab stays current there. */
function useOverviewDetail(): boolean {
  const { pathname } = useLocation()
  return pathname.startsWith('/insights') || pathname === '/recurring' || pathname.startsWith('/balance') || pathname === '/receivables' || pathname === '/month-close'
}

const tabs: { to: string; label: keyof Messages['nav']; icon: IconName }[] = [
  { to: '/', label: 'overview', icon: 'overview' },
  { to: '/transactions', label: 'transactions', icon: 'transactions' },
  { to: '/accounts', label: 'accounts', icon: 'accounts' },
  { to: '/installments', label: 'installments', icon: 'installments' },
  { to: '/categories', label: 'categories', icon: 'tabCategories' },
]

export function App() {
  return (
    <HashRouter>
      <I18nProvider>
        <DataProvider repository={repository}>
          <PrivacyShell />
        </DataProvider>
      </I18nProvider>
    </HashRouter>
  )
}

/**
 * The screens, remounted when "Ocultar valores" changes so every amount is
 * formatted again (masked or not); the data stays loaded. The toast that
 * confirms it sits outside, so it survives the remount.
 */
function PrivacyShell() {
  const [hidden] = usePrivacy()
  const [toast, setToast] = useState(false)
  const was = useRef(hidden)
  useEffect(() => {
    if (hidden && !was.current) setToast(true)
    if (!hidden) setToast(false)
    was.current = hidden
  }, [hidden])
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(false), 4000)
    return () => clearTimeout(timer)
  }, [toast])
  return (
    <>
      <Shell key={hidden ? 'hidden' : 'shown'} />
      {toast && <PrivacyToast />}
    </>
  )
}

/**
 * Phones and tablets: one column (max 480px) with a top bar and a bottom tab
 * bar. Desktop (lg, ≥1024px): a sidebar and a wide content area.
 */
function Shell() {
  const { t } = useI18n()
  const overviewDetail = useOverviewDetail()
  const isDemo = useDataSource() === 'demo'
  return (
    <div className="mx-auto min-h-dvh max-w-[480px] pb-[calc(78px+env(safe-area-inset-bottom))] lg:flex lg:max-w-none lg:pb-0">
      <Sidebar />

      <header className="sticky top-0 z-20 bg-page pt-[env(safe-area-inset-top)] lg:hidden">
        <div className="flex h-14 items-center justify-between gap-2 pr-1 pl-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <Wordmark className="text-[22px]" />
            {isDemo && (
              <span className="inline-flex h-[22px] items-center rounded-full border border-line bg-surface px-2 text-[11px] font-medium whitespace-nowrap text-ink-2">
                {t.demoData}
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center">
            {/* Page actions (e.g. "Selecionar" on Transactions) are rendered here by the page. */}
            <div id="header-actions" className="flex items-center" />
            <PrivacyToggle />
          </div>
        </div>
      </header>

      <main className="px-4 pt-2 pb-6 lg:min-w-0 lg:flex-1 lg:px-10 lg:pt-8 lg:pb-12">
        <div className="lg:mx-auto lg:max-w-[1200px]">
          <PrivacyBanner />
          <Routes>
            <Route
              path="*"
              element={
                <DataGate>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/transactions" element={<Transactions />} />
                    <Route path="/accounts" element={<Accounts />} />
                    <Route path="/installments" element={<Installments />} />
                    <Route path="/transactions/hidden" element={<HiddenTransactions />} />
                    <Route path="/categories" element={<Categories />} />
                    <Route path="/insights/projection" element={<Projection />} />
                    <Route path="/insights/unusual" element={<UnusualAll />} />
                    <Route path="/insights/unusual/:categoryId" element={<UnusualCategory />} />
                    <Route path="/recurring" element={<Recurring />} />
                    <Route path="/balance" element={<SpendingBalance />} />
                    <Route path="/extra-pay" element={<ExtraPay />} />
                    <Route path="/receivables" element={<Receivables />} />
                    <Route path="/month-close" element={<MonthClose />} />
                    <Route path="/balance/organize" element={<BalanceOrganize />} />
                    {/* TEMPORARY: Pluggy's raw responses. */}
                    <Route path="/debug" element={<Debug />} />
                  </Routes>
                </DataGate>
              }
            />
          </Routes>
        </div>
      </main>

      <nav
        aria-label={t.mainNav}
        className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-[480px] border-t border-line bg-surface pt-1.5 pb-[calc(16px+env(safe-area-inset-bottom))] lg:hidden"
      >
        <div className="grid grid-cols-5">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end
              className={({ isActive }) =>
                `flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 px-0.5 ${isActive || (tab.to === '/' && overviewDetail) ? 'text-accent' : 'text-muted'}`
              }
            >
              {({ isActive: exact }) => {
                const isActive = exact || (tab.to === '/' && overviewDetail)
                return (
                <>
                  <span className={`flex h-[30px] w-[52px] items-center justify-center rounded-full ${isActive ? 'bg-accent-soft' : ''}`}>
                    <Icon name={tab.icon} className="size-[22px]" />
                  </span>
                  <span className={`max-w-full truncate text-[11px] leading-4 ${isActive ? 'font-medium' : ''}`}>{t.nav[tab.label]}</span>
                </>
                )
              }}
            </NavLink>
          ))}
        </div>
      </nav>
      <Snackbar />
    </div>
  )
}

/** Desktop navigation: logo, pages, and at the bottom demo note, language and sign out. */
function Sidebar() {
  const { t } = useI18n()
  const overviewDetail = useOverviewDetail()
  const isDemo = useDataSource() === 'demo'
  const syncInfo = useSync().info
  return (
    <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col gap-7 overflow-y-auto border-r border-line bg-surface px-4 pt-7 pb-6 lg:flex">
      <div className="px-3">
        <Wordmark className="text-[28px]" />
      </div>
      <nav aria-label={t.mainNav} className="flex flex-col gap-1">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end
            className={({ isActive }) =>
              `flex h-12 items-center gap-3 rounded-sm px-3 text-[15px] ${isActive || (tab.to === '/' && overviewDetail) ? 'bg-accent-soft font-medium text-accent' : 'text-ink-2 hover:bg-track'}`
            }
          >
            <Icon name={tab.icon} className="size-[22px] shrink-0" />
            {t.nav[tab.label]}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-4 px-1">
        <PrivacyToggle variant="sidebar" />
        <SyncBar variant="sidebar" />
        {isDemo && !syncInfo && (
          <div className="flex flex-col gap-1 rounded-md bg-page p-3">
            <span className="inline-flex h-[22px] items-center self-start rounded-full border border-line bg-surface px-2 text-[11px] font-medium text-ink-2">
              {t.demoData}
            </span>
            <span className="text-xs leading-[17px] text-muted">{t.demoNote}</span>
          </div>
        )}
        {isDeployed() && (
          <div className="border-t border-line pt-3">
            <a href="/api/auth/logout" className="flex h-11 items-center gap-2 rounded-sm px-2 text-sm font-medium text-accent hover:bg-track">
              <Icon name="signOut" className="size-[18px]" strokeWidth={2} />
              {t.accounts.signOut}
            </a>
          </div>
        )}
      </div>
    </aside>
  )
}

/**
 * "Ocultar valores": blurs amounts, charts and descriptions, for opening the
 * app in public. An eye button in the phone header; a switch row in the
 * desktop sidebar. Remembered on this device.
 */
function PrivacyToggle({ variant = 'header' }: { variant?: 'header' | 'sidebar' }) {
  const { t } = useI18n()
  const [hidden, setHidden] = usePrivacy()
  const label = hidden ? t.privacy.show : t.privacy.hide
  if (variant === 'header')
    return (
      <button
        type="button"
        onClick={() => setHidden(!hidden)}
        aria-pressed={hidden}
        aria-label={label}
        title={label}
        className={`flex size-12 shrink-0 items-center justify-center rounded-md ${hidden ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:bg-track active:bg-track'}`}
      >
        <Icon name={hidden ? 'eyeOff' : 'eye'} className="size-[22px]" />
      </button>
    )
  return (
    <button
      type="button"
      role="switch"
      aria-checked={hidden}
      onClick={() => setHidden(!hidden)}
      className={`flex min-h-12 items-center gap-2 rounded-md border px-2.5 text-left text-sm font-medium whitespace-nowrap ${hidden ? 'border-accent/40 text-ink' : 'border-line text-ink-2 hover:bg-track'}`}
    >
      <Icon name={hidden ? 'eyeOff' : 'eye'} className="size-[18px] shrink-0" />
      <span className="min-w-0 flex-1">{t.privacy.hide}</span>
      <span aria-hidden className={`flex h-6 w-10 shrink-0 items-center rounded-full border-2 px-0.5 transition-colors ${hidden ? 'justify-end border-accent bg-accent' : 'border-muted bg-track'}`}>
        <span className={`rounded-full ${hidden ? 'size-4 bg-surface' : 'size-3 bg-muted'}`} />
      </span>
    </button>
  )
}

/** While values are hidden: "Valores ocultos" at the top of every screen, with Mostrar. */
function PrivacyBanner() {
  const { t } = useI18n()
  const [hidden, setHidden] = usePrivacy()
  if (!hidden) return null
  return (
    <div role="status" className="mb-3 flex min-h-11 items-center gap-2.5 rounded-md bg-accent-faint pr-1 pl-3 text-[13px] leading-[18px] text-ink lg:mb-5">
      <Icon name="eyeOff" className="size-[18px] shrink-0 text-ink-2" />
      <span className="min-w-0 flex-1">{t.privacy.on}</span>
      <button type="button" onClick={() => setHidden(false)} className="h-11 shrink-0 rounded-sm px-3 text-sm font-medium text-accent hover:bg-accent-soft">
        {t.privacy.showShort}
      </button>
    </div>
  )
}

/** On turning it on: "Valores ocultos · Continua assim até você mostrar de novo", for 4 s. */
function PrivacyToast() {
  const { t } = useI18n()
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(86px+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-[480px] px-3 lg:bottom-6 lg:left-[248px] lg:mx-0 lg:max-w-[440px] lg:px-6">
      <div role="status" className="pointer-events-auto flex min-h-14 w-full items-center gap-2.5 rounded-md bg-ink py-1.5 pr-3 pl-4 text-page shadow-lg">
        <Icon name="check" className="size-[18px] shrink-0" strokeWidth={2} />
        <span className="flex min-w-0 flex-1 flex-col gap-px">
          <span className="text-sm leading-[19px] font-medium">{t.privacy.turnedOn}</span>
          <span className="text-[13px] leading-[18px] opacity-80">{t.privacy.staysOn}</span>
        </span>
      </div>
    </div>
  )
}
