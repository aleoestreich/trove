import { HashRouter, NavLink, Route, Routes } from 'react-router-dom'
import { DataGate, DataProvider, useDataSource, useSync } from './state'
import { createMockRepository } from './data/mockRepository'
import { createApiRepository, withDemoFallback } from './data/apiRepository'
import { Dashboard } from './pages/Dashboard'
import { Transactions } from './pages/Transactions'
import { Accounts } from './pages/Accounts'
import { Installments } from './pages/Installments'
import { Debug } from './pages/Debug'
import { Categories } from './pages/Categories'
import { HiddenTransactions } from './pages/Transactions'
import { Snackbar, SyncBar } from './components/SyncBar'
import { Icon, type IconName } from './components/Icon'
import { LanguageSwitch } from './components/LanguageSwitch'
import { Wordmark } from './components/Logo'
import { I18nProvider, useI18n } from './i18n/I18nProvider'
import type { Messages } from './i18n/messages'
import { isDeployed } from './lib/useIsDesktop'

// Deployed: data from the database via /api (demo data until configured and synced).
// Local development: demo data.
const repository = isDeployed() ? withDemoFallback(createApiRepository(), createMockRepository()) : createMockRepository()

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
          <Shell />
        </DataProvider>
      </I18nProvider>
    </HashRouter>
  )
}

/**
 * Phones and tablets: one column (max 480px) with a top bar and a bottom tab
 * bar. Desktop (lg, ≥1024px): a sidebar and a wide content area.
 */
function Shell() {
  const { t } = useI18n()
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
          <div className="mr-2">
            <LanguageSwitch />
          </div>
        </div>
      </header>

      <main className="px-4 pt-2 pb-6 lg:min-w-0 lg:flex-1 lg:px-10 lg:pt-8 lg:pb-12">
        <div className="lg:mx-auto lg:max-w-[1200px]">
          <Routes>
            {/* Outside DataGate: it should work even when /api/finance fails. */}
            <Route path="/debug" element={<Debug />} />
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
                `flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 px-0.5 ${isActive ? 'text-accent' : 'text-muted'}`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={`flex h-[30px] w-[52px] items-center justify-center rounded-full ${isActive ? 'bg-accent-soft' : ''}`}>
                    <Icon name={tab.icon} className="size-[22px]" />
                  </span>
                  <span className={`max-w-full truncate text-[11px] leading-4 ${isActive ? 'font-medium' : ''}`}>{t.nav[tab.label]}</span>
                </>
              )}
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
              `flex h-12 items-center gap-3 rounded-sm px-3 text-[15px] ${isActive ? 'bg-accent-soft font-medium text-accent' : 'text-ink-2 hover:bg-track'}`
            }
          >
            <Icon name={tab.icon} className="size-[22px] shrink-0" />
            {t.nav[tab.label]}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-4 px-1">
        <SyncBar variant="sidebar" />
        {isDemo && !syncInfo && (
          <div className="flex flex-col gap-1 rounded-md bg-page p-3">
            <span className="inline-flex h-[22px] items-center self-start rounded-full border border-line bg-surface px-2 text-[11px] font-medium text-ink-2">
              {t.demoData}
            </span>
            <span className="text-xs leading-[17px] text-muted">{t.demoNote}</span>
          </div>
        )}
        <div className="self-start">
          <LanguageSwitch />
        </div>
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
