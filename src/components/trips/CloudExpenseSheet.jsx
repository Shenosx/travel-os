import { useMemo } from 'react'
import { useAppData } from '../../hooks/useAppData.jsx'
import { useCloudTripBookings } from '../../hooks/useCloudTripBookings.js'
import { useCloudTripExpenses } from '../../hooks/useCloudTripExpenses.js'
import { CloudExpenseView } from './CloudExpenseView.jsx'

export { CloudExpenseView } from './CloudExpenseView.jsx'

export function CloudExpenseSheet({ trip, currentUserId, onClose, onRecordPayment, fixture = null }) {
  const cloud = useCloudTripExpenses(trip)
  const cloudBookings = useCloudTripBookings(trip)
  const { repayments, deleteRepayment } = useAppData()
  const expenses = fixture?.expenses ?? cloud.expenses
  const people = fixture?.people ?? cloud.people
  const settlement = fixture?.settlement ?? cloud.settlement
  const tripRepayments = useMemo(
    () => (fixture?.repayments ?? repayments).filter((item) => item.tripId === trip.id),
    [fixture?.repayments, repayments, trip.id],
  )

  return (
    <div data-cloud-expense-sheet="">
      <CloudExpenseView
        trip={trip}
        currentUserId={currentUserId}
        expenses={expenses}
        people={people}
        settlement={settlement}
        loading={fixture ? false : cloud.loading}
        error={fixture ? null : cloud.error}
        liveError={fixture ? null : cloud.liveError}
        canCreate={fixture?.canCreate ?? cloud.canCreate}
        canMutateExpense={fixture?.canMutateExpense ?? cloud.canMutateExpense}
        repayments={tripRepayments}
        bookings={fixture?.bookings ?? cloudBookings.bookings}
        onRecordPayment={(debt) =>
          onRecordPayment?.({
            ...debt,
            trip,
            expenses,
            people,
            repayments: tripRepayments,
          })
        }
        onDeleteRepayment={deleteRepayment}
        onSaveExpense={cloud.save}
        onDeleteExpense={cloud.remove}
        onClose={onClose}
      />
    </div>
  )
}
