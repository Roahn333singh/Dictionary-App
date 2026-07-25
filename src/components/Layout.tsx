import { NavLink, Outlet } from 'react-router-dom'
import { PwaUpdateToast } from './PwaUpdateToast'
import { ThemePicker } from './ThemePicker'

export function Layout() {
  return (
    <div className="app-shell">
      <header className="topnav">
        <NavLink to="/" className="brand">
          <span className="brand-mark">R</span>
          <span className="brand-name">Retain</span>
        </NavLink>
        <div className="topnav-right">
          <ThemePicker />
          <nav className="nav-links">
            <NavLink to="/" end>
              Home
            </NavLink>
            <NavLink to="/add">Add</NavLink>
            <NavLink to="/review">Review</NavLink>
            <NavLink to="/library">Library</NavLink>
          </nav>
        </div>
      </header>
      <Outlet />
      <PwaUpdateToast />
    </div>
  )
}
