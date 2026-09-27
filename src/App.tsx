import { HashRouter, NavLink, Route, Routes } from 'react-router-dom'
import { DataProvider } from './state'
import { createMockRepository } from './data/mockRepository'
import { Dashboard } from './pages/Dashboard'
import { Transactions } from './pages/Transactions'
import { Accounts } from './pages/Accounts'
import { Installments } from './pages/Installments'
import { Icon, type IconName } from './components/Icon'
import { LanguageSwitch } from './components/LanguageSwitch'
import { I18nProvider, useI18n } from './i18n/I18nProvider'
import type { Messages } from './i18n/messages'

const repository = createMockRepository()

const tabs: { to: string; label: keyof Messages['nav']; icon: IconName }[] = [
  { to: '/', label: 'overview', icon: 'home' },
  { to: '/transactions', label: 'transactions', icon: 'list' },
  { to: '/installments', label: 'installments', icon: 'installments' },
  { to: '/accounts', label: 'accounts', icon: 'bank' },
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

function Shell() {
  const { t } = useI18n()
  return (
    <div className="min-h-dvh pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
      <header className="sticky top-0 z-20 border-b border-line bg-page/90 backdrop-blur pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-2 px-4">
          <span className="text-lg font-semibold tracking-tight">Trove</span>
          <nav className="hidden gap-1 md:flex">
            {tabs.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                end
                className={({ isActive }) =>
                  `rounded-lg px-3 py-1.5 text-sm ${isActive ? 'bg-surface font-medium text-ink shadow-sm' : 'text-ink-2 hover:text-ink'}`
                }
              >
                {t.nav[tab.label]}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <span className="hidden rounded-full bg-surface px-2 py-0.5 text-xs text-muted ring-1 ring-line min-[380px]:inline">
              {t.demoData}
            </span>
            <LanguageSwitch />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-4">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/installments" element={<Installments />} />
          <Route path="/accounts" element={<Accounts />} />
        </Routes>
      </main>

      {/* Bottom tab bar on phones */}
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        <div className="grid h-16 grid-cols-4">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end
              className={({ isActive }) =>
                `flex min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 text-[0.6875rem] ${isActive ? 'font-semibold text-accent' : 'text-muted'}`
              }
            >
              <Icon name={tab.icon} />
              <span className="max-w-full truncate">{t.nav[tab.label]}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
