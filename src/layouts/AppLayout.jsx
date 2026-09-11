import { Link, Outlet } from 'react-router-dom'
import { ExpenseComposerProvider } from '../components/expenses/ExpenseComposer.jsx'
import { BottomNav } from '../components/layout/BottomNav.jsx'
import { QuickAddButton } from '../components/layout/QuickAddButton.jsx'
import { Sidebar } from '../components/layout/Sidebar.jsx'
import { ThemeSwitcher } from '../components/layout/ThemeSwitcher.jsx'
import { useAppData } from '../hooks/useAppData.jsx'

export function AppLayout() {
  return (
    <ExpenseComposerProvider>
      <div className="min-h-svh bg-canvas text-ink">
        <Sidebar />
        <div className="lg:pl-[232px]">
          <MobileHeader />
          <main className="mx-auto w-full max-w-[1080px] px-5 pt-6 pb-28 lg:px-12 lg:pt-10 lg:pb-16">
            <Outlet />
          </main>
        </div>
        <BottomNav />
        <QuickAddButton />
      </div>
    </ExpenseComposerProvider>
  )
}

function MobileHeader() {
  const { isPreviewing, setSessionUserId, homeUserId } = useAppData()

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-canvas/90 px-5 py-3.5 backdrop-blur-md lg:hidden">
      <Link to="/" className="font-display text-lg tracking-[-0.03em]">
        Travel OS
      </Link>
      <div className="flex items-center gap-3">
        {isPreviewing ? (
          <button
            type="button"
            className="text-[12px] text-accent"
            onClick={() => setSessionUserId(homeUserId)}
          >
            Back to you
          </button>
        ) : null}
        <ThemeSwitcher />
      </div>
    </header>
  )
}
