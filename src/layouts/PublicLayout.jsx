import { Link, NavLink, Outlet } from 'react-router-dom'
import { ThemeSwitcher } from '../components/layout/ThemeSwitcher.jsx'

export function PublicLayout() {
  return (
    <div className="min-h-svh bg-canvas text-ink">
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1120px] flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-8 sm:py-3.5">
          <div className="flex items-center justify-between gap-4">
            <Link to="/" className="font-display whitespace-nowrap text-[20px] tracking-[-0.03em] text-ink">
              Travel OS
            </Link>
            <div className="sm:hidden">
              <ThemeSwitcher />
            </div>
          </div>
          <nav className="flex items-center justify-between gap-3 sm:justify-end sm:gap-5">
            <a
              href="/#features"
              className="inline-flex min-h-11 items-center text-[13px] whitespace-nowrap text-ink-subtle hover:text-ink"
            >
              Features
            </a>
            <NavLink
              to="/signin"
              className={({ isActive }) =>
                `inline-flex min-h-11 items-center text-[13px] whitespace-nowrap ${
                  isActive ? 'text-ink' : 'text-ink-subtle hover:text-ink'
                }`
              }
            >
              Sign in
            </NavLink>
            <NavLink
              to="/signup"
              className="inline-flex min-h-11 items-center text-[13px] whitespace-nowrap text-accent hover:text-accent-hover"
            >
              Get started
            </NavLink>
            <div className="hidden sm:block">
              <ThemeSwitcher />
            </div>
          </nav>
        </div>
      </header>
      <Outlet />
    </div>
  )
}
