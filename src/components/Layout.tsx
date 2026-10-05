import { NavLink, Outlet } from 'react-router-dom'
import { useShares } from '../hooks/useShares'
import { useVocab } from '../hooks/useVocab'
import { AccountMenu } from './AccountMenu'
import { BookIcon, CardsIcon, HomeIcon, InboxIcon, PlusIcon } from './Icons'
import { LegacyImportBanner } from './LegacyImportBanner'
import { PwaUpdateToast } from './PwaUpdateToast'
import { ThemePicker } from './ThemePicker'

function Badge({ count }: { count: number }) {
  if (count <= 0) return null
  return <span className="nav-badge">{count > 99 ? '99+' : count}</span>
}

export function Layout() {
  const { dueWords } = useVocab()
  const { inbox, available } = useShares()
  const inboxCount = available ? inbox.length : 0

  const items = [
    { to: '/', label: 'Home', icon: HomeIcon, end: true, badge: 0 },
    { to: '/review', label: 'Review', icon: CardsIcon, badge: dueWords.length },
    { to: '/add', label: 'Add', icon: PlusIcon, primary: true, badge: 0 },
    { to: '/library', label: 'Words', icon: BookIcon, badge: 0 },
    { to: '/inbox', label: 'Inbox', icon: InboxIcon, badge: inboxCount },
  ]

  return (
    <div className="app-shell">
      <header className="topnav">
        <NavLink to="/" className="brand" aria-label="Retain home">
          <span className="brand-mark">R</span>
          <span className="brand-name">retain</span>
        </NavLink>

        <nav className="nav-links" aria-label="Main">
          {items.map(({ to, label, end, badge }) => (
            <NavLink key={to} to={to} end={end}>
              {label}
              <Badge count={badge} />
            </NavLink>
          ))}
        </nav>

        <div className="topnav-right">
          <ThemePicker />
          <AccountMenu />
        </div>
      </header>

      <LegacyImportBanner />
      <main className="page">
        <Outlet />
      </main>

      <nav className="tabbar" aria-label="Main">
        {items.map(({ to, label, icon: Icon, end, primary, badge }) => (
          <NavLink key={to} to={to} end={end} className={primary ? 'tab-primary' : undefined}>
            <span className="tab-icon">
              <Icon size={primary ? 26 : 22} />
              <Badge count={badge} />
            </span>
            {!primary && <span className="tab-label">{label}</span>}
            {primary && <span className="sr-only">{label}</span>}
          </NavLink>
        ))}
      </nav>

      <PwaUpdateToast />
    </div>
  )
}
