import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAppData } from '../../hooks/useAppData.jsx'
import { canDeleteExpense, canEditExpense, canOnTrip } from '../../lib/permissions.js'
import { getNextTrip } from '../../lib/trips.js'
import { Sheet } from '../ui/Sheet.jsx'
import { ExpenseForm } from './ExpenseForm.jsx'

const ExpenseComposerContext = createContext(null)

export function ExpenseComposerProvider({ children }) {
  const [session, setSession] = useState(null)

  const value = useMemo(
    () => ({
      openCreate: (tripId) => setSession({ type: 'create', tripId: tripId ?? null }),
      openEdit: (expenseId) => setSession({ type: 'edit', expenseId }),
      close: () => setSession(null),
      session,
    }),
    [session],
  )

  return (
    <ExpenseComposerContext.Provider value={value}>
      {children}
      {session ? <ExpenseComposerSheet /> : null}
    </ExpenseComposerContext.Provider>
  )
}

export function useExpenseComposer() {
  const context = useContext(ExpenseComposerContext)
  if (!context) throw new Error('useExpenseComposer must be used within ExpenseComposerProvider')
  return context
}

function tripIdFromPath(pathname) {
  const match = pathname.match(/^\/trips\/([^/]+)/)
  return match?.[1] ?? null
}

function ExpenseComposerSheet() {
  const navigate = useNavigate()
  const location = useLocation()
  const { session, close } = useExpenseComposer()
  const { trips, users, currentUser, expenses, addExpense, updateExpense, deleteExpense } = useAppData()

  const expense = session?.type === 'edit' ? expenses.find((item) => item.id === session.expenseId) : null
  const contextTripId = tripIdFromPath(location.pathname)
  const creatableTrips = trips.filter((trip) => canOnTrip(trip, currentUser.id, 'addExpense'))
  const formTrips = expense
    ? trips.filter((trip) => trip.id === expense.tripId || canOnTrip(trip, currentUser.id, 'addExpense'))
    : creatableTrips
  const defaultTripId =
    (session?.tripId && creatableTrips.some((trip) => trip.id === session.tripId) ? session.tripId : null) ||
    expense?.tripId ||
    (contextTripId && creatableTrips.some((trip) => trip.id === contextTripId) ? contextTripId : null) ||
    getNextTrip(creatableTrips)?.id ||
    creatableTrips[0]?.id

  const expenseTrip = expense ? trips.find((trip) => trip.id === expense.tripId) : null
  const mayEdit = expense ? canEditExpense(expenseTrip, currentUser.id, expense) : true
  const mayDelete = expense ? canDeleteExpense(expenseTrip, currentUser.id, expense) : false

  useEffect(() => {
    if (!session) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [session, close])

  useEffect(() => {
    if (session?.type === 'edit' && !expense) close()
  }, [session, expense, close])

  if (!session || (session.type === 'edit' && !expense)) return null

  if (session.type === 'create' && !formTrips.length) {
    return (
      <Sheet kicker="Expense" title="Add expense" onClose={close}>
        <p className="text-sm leading-relaxed text-ink-muted">
          You can look at spending on this trip, but adding is for the owner and editors.
        </p>
      </Sheet>
    )
  }

  if (session.type === 'edit' && expense && !mayEdit) {
    return (
      <Sheet kicker="Expense" title="Expense" onClose={close}>
        <p className="text-sm leading-relaxed text-ink-muted">
          This one was added by someone else. You can still see it on the trip; editing is limited.
        </p>
      </Sheet>
    )
  }

  function afterSave(tripId) {
    close()
    navigate(`/trips/${tripId}?tab=expenses`)
  }

  return (
    <Sheet
      kicker={session.type === 'edit' ? 'Expense' : 'Quick add'}
      title={session.type === 'edit' ? 'Edit expense' : 'Add expense'}
      onClose={close}
      wide
    >
      <ExpenseForm
        key={expense?.id ?? `create-${defaultTripId}`}
        trips={formTrips}
        users={users}
        currentUser={currentUser}
        expense={expense}
        defaultTripId={defaultTripId}
        lockTrip={Boolean(contextTripId && session.type === 'create')}
        onCancel={close}
        onDelete={
          mayDelete
            ? () => {
                deleteExpense(expense.id)
                close()
              }
            : undefined
        }
        onSubmit={(payload) => {
          if (expense) {
            const updated = updateExpense(expense.id, payload)
            if (updated) afterSave(payload.tripId)
            return
          }
          const created = addExpense(payload)
          if (created) afterSave(payload.tripId)
        }}
      />
    </Sheet>
  )
}
