import { Link, Outlet } from 'react-router-dom'
import { ExpenseComposerProvider } from '../components/expenses/ExpenseComposer.jsx'
import { PlaceComposerProvider } from '../components/places/PlaceComposer.jsx'
import { BookingComposerProvider } from '../components/bookings/BookingComposer.jsx'
import { BottomNav } from '../components/layout/BottomNav.jsx'
import { QuickAddProvider } from '../components/layout/QuickAddButton.jsx'
import { Sidebar } from '../components/layout/Sidebar.jsx'
import { ThemeSwitcher } from '../components/layout/ThemeSwitcher.jsx'
import { ToastProvider } from '../components/ui/Toast.jsx'
import { AccountLink } from '../components/auth/AccountLink.jsx'
import { CloudSyncProvider } from '../hooks/useCloudSync.jsx'
import { CloudSyncStatus } from '../components/sync/CloudSyncStatus.jsx'
import { useAppData } from '../hooks/useAppData.jsx'

export function AppLayout() {
  return (
    <ToastProvider>
      <ExpenseComposerProvider>
        <PlaceComposerProvider>
          <BookingComposerProvider>
            <QuickAddProvider>
              <CloudSyncProvider>
                <div className="min-h-svh bg-canvas text-ink">
                  <Sidebar />
                  <div className="min-w-0 lg:pl-[232px]">
                    <MobileHeader />
                    <main className="mx-auto w-full min-w-0 max-w-[1080px] px-5 pt-6 pb-28 lg:px-12 lg:pt-10 lg:pb-16">
                      <Outlet />
                    </main>
                  </div>
                  <BottomNav />
                </div>
              </CloudSyncProvider>
            </QuickAddProvider>
          </BookingComposerProvider>
        </PlaceComposerProvider>
      </ExpenseComposerProvider>
    </ToastProvider>
  )
}

function MobileHeader() {
  const { isPreviewing, setSessionUserId, homeUserId } = useAppData()

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-line bg-canvas/90 px-5 py-3.5 backdrop-blur-md sm:gap-3 lg:hidden">
      <Link to="/" className="font-display shrink-0 text-lg tracking-[-0.03em]">
        Travel OS
      </Link>
      <div className="flex min-w-0 items-center justify-end gap-2 sm:gap-3">
        {isPreviewing ? (
          <button
            type="button"
            className="shrink-0 text-[12px] text-accent"
            onClick={() => setSessionUserId(homeUserId)}
          >
            Back to you
          </button>
        ) : null}
        <AccountLink className="max-w-[6.5rem] sm:max-w-[9rem]" />
        <CloudSyncStatus placement="below" align="end" />
        <ThemeSwitcher compact />
      </div>
    </header>
  )
}
