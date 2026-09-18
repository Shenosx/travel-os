import { NavLink } from 'react-router-dom'
import { useAppData } from '../../hooks/useAppData.jsx'
import {
  IconDashboard,
  IconExpenses,
  IconInsights,
  IconPlaces,
  IconTrips,
} from '../icons.jsx'
import { Avatar } from '../ui/Avatar.jsx'
import { AccountLink } from '../auth/AccountLink.jsx'
import { CloudSyncStatus } from '../sync/CloudSyncStatus.jsx'
import { NAV_ITEMS } from './nav.js'
import { ThemeSwitcher } from './ThemeSwitcher.jsx'

const ICONS = {
  dashboard: IconDashboard,
  trips: IconTrips,
  expenses: IconExpenses,
  places: IconPlaces,
  insights: IconInsights,
}

export function Sidebar() {
  const { currentUser, isPreviewing, setSessionUserId, homeUserId } = useAppData()

  return (
    <aside className="fixed inset-y-0 left-0 hidden w-[232px] flex-col border-r border-line bg-canvas lg:flex">
      <div className="px-6 pt-8 pb-7">
        <p className="font-display text-[22px] leading-none tracking-[-0.03em] text-ink">Travel OS</p>
        <p className="mt-2 text-[12px] tracking-[0.14em] text-ink-subtle uppercase">Personal</p>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-3">
        {NAV_ITEMS.map((item) => {
          const Icon = ICONS[item.icon]
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-md px-3 py-2.5 text-[14px] transition-colors ${
                  isActive
                    ? 'bg-accent-soft text-accent'
                    : 'text-ink-muted hover:bg-canvas-muted hover:text-ink'
                }`
              }
            >
              <Icon className="h-[18px] w-[18px]" />
              {item.label}
            </NavLink>
          )
        })}
      </nav>

      <div className="border-t border-line px-5 py-5">
        <div className="mb-4">
          <ThemeSwitcher />
        </div>
        <div className="flex items-center gap-3">
          <Avatar initials={currentUser.initials} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">{currentUser.name}</p>
            <p className="truncate text-[12px] text-ink-subtle">
              {isPreviewing ? `Viewing as ${currentUser.shortName}` : currentUser.email}
            </p>
          </div>
        </div>
        {isPreviewing ? (
          <button
            type="button"
            className="mt-3 text-[12px] text-accent"
            onClick={() => setSessionUserId(homeUserId)}
          >
            Back to you
          </button>
        ) : null}
        <AccountLink className="mt-3 block" />
        <div className="mt-3">
          <CloudSyncStatus />
        </div>
      </div>
    </aside>
  )
}
