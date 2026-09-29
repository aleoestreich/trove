import { HashRouter, NavLink, Route, Routes } from 'react-router-dom'
import { DataProvider } from './state'
import { createMockRepository } from './data/mockRepository'
import { Dashboard } from './pages/Dashboard'
import { Transactions } from './pages/Transactions'
import { Accounts } from './pages/Accounts'
import { Installments } from './pages/Installments'
import { Icon, type IconName } from './components/Icon'
import { LanguageSwitch } from './components/LanguageSwitch'
import { Wordmark } from './components/Logo'
import { I18nProvider, useI18n } from './i18n/I18nProvider'
import type { Messages } from './i18n/messages'

const repository = createMockRepository()

const tabs: { to: string; label: keyof Messages['nav']; icon: IconName }[] = [
  { to: '/', label: 'overview', icon: 'overview' },
  { to: '/transactions', label: 'transactions', icon: 'transactions' },
  { to: '/accounts', label: 'accounts', icon: 'accounts' },
  { to: '/installments', label: 'installments', icon: 'installments' },
]

export function App() {
  return (
    <HashRouter>
      <I18nProvider>
        <Shell />
      </I18nProvider>
    </HashRouter>
  )
}

/** One phone-width column (max 480px), centred on tablets and desktop. */
function Shell() {
  const { t } = useI18n()
  return (
    <div className="mx-auto min-h-dvh max-w-[480px] pb-[calc(78px+env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-20 bg-page pt-[env(safe-area-inset-top)]">
        <div className="flex h-14 items-center justify-between gap-2 pr-1 pl-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <Wordmark className="text-[22px]" />
            <span className="inline-flex h-[22px] items-center rounded-full border border-line bg-surface px-2 text-[11px] font-medium whitespace-nowrap text-ink-2">
              {t.demoData}
            </span>
          </div>
          <div className="mr-2">
            <LanguageSwitch />
          </div>
        </div>
      </header>

      <main className="px-4 pt-2 pb-6">
        <DataProvider repository={repository}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/accounts" element={<Accounts />} />
            <Route path="/installments" element={<Installments />} />
          </Routes>
        </DataProvider>
      </main>

      <nav
        aria-label={t.mainNav}
        className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-[480px] border-t border-line bg-surface pt-1.5 pb-[calc(16px+env(safe-area-inset-bottom))]"
      >
        <div className="grid grid-cols-4">
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
                  <span className={`flex h-[30px] w-14 items-center justify-center rounded-full ${isActive ? 'bg-accent-soft' : ''}`}>
                    <Icon name={tab.icon} className="size-[22px]" />
                  </span>
                  <span className={`max-w-full truncate text-xs leading-4 ${isActive ? 'font-medium' : ''}`}>{t.nav[tab.label]}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
