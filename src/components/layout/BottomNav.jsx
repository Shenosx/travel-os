import { NavLink } from 'react-router-dom'
import {
  IconDashboard,
  IconExpenses,
  IconInsights,
  IconPlaces,
  IconTrips,
} from '../icons.jsx'
import { NAV_ITEMS } from './nav.js'

const ICONS = {
  dashboard: IconDashboard,
  trips: IconTrips,
  expenses: IconExpenses,
  places: IconPlaces,
  insights: IconInsights,
}

export function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-canvas/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
      <div className="grid grid-cols-5">
        {NAV_ITEMS.map((item) => {
          const Icon = ICONS[item.icon]
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 py-2.5 text-[10px] tracking-[0.04em] uppercase ${
                  isActive ? 'text-accent' : 'text-ink-subtle'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={`h-[18px] w-[18px] ${isActive ? 'text-accent' : ''}`} />
                  {item.label}
                </>
              )}
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
