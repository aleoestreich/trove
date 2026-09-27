import { HashRouter, NavLink, Route, Routes } from 'react-router-dom'
import { DataProvider } from './state'
import { createMockRepository } from './data/mockRepository'
import { Dashboard } from './pages/Dashboard'
import { Transactions } from './pages/Transactions'
import { Accounts } from './pages/Accounts'
import { Icon, type IconName } from './components/Icon'

const repository = createMockRepository()

const tabs: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Overview', icon: 'home' },
  { to: '/transactions', label: 'Transactions', icon: 'list' },
  { to: '/accounts', label: 'Accounts', icon: 'bank' },
]

export function App() {
  return (
    <HashRouter>
      <DataProvider repository={repository}>
        <div className="min-h-dvh pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
          <header className="sticky top-0 z-20 border-b border-line bg-page/90 backdrop-blur pt-[env(safe-area-inset-top)]">
            <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
              <span className="text-lg font-semibold tracking-tight">Trove</span>
              <nav className="hidden gap-1 md:flex">
                {tabs.map((t) => (
                  <NavLink
                    key={t.to}
                    to={t.to}
                    end
                    className={({ isActive }) =>
                      `rounded-lg px-3 py-1.5 text-sm ${isActive ? 'bg-surface font-medium text-ink shadow-sm' : 'text-ink-2 hover:text-ink'}`
                    }
                  >
                    {t.label}
                  </NavLink>
                ))}
              </nav>
              <span className="rounded-full bg-surface px-2 py-0.5 text-xs text-muted ring-1 ring-line">Demo data</span>
            </div>
          </header>

          <main className="mx-auto max-w-3xl px-4 py-4">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/accounts" element={<Accounts />} />
            </Routes>
          </main>

          {/* Bottom tab bar on phones */}
          <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
            <div className="grid h-16 grid-cols-3">
              {tabs.map((t) => (
                <NavLink
                  key={t.to}
                  to={t.to}
                  end
                  className={({ isActive }) =>
                    `flex flex-col items-center justify-center gap-0.5 text-xs ${isActive ? 'font-semibold text-accent' : 'text-muted'}`
                  }
                >
                  <Icon name={t.icon} />
                  {t.label}
                </NavLink>
              ))}
            </div>
          </nav>
        </div>
      </DataProvider>
    </HashRouter>
  )
}
