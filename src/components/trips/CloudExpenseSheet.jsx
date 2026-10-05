import { useMemo } from 'react'
import { useAppData } from '../../hooks/useAppData.jsx'
import { useCloudTripBookings } from '../../hooks/useCloudTripBookings.js'
import { useCloudTripExpenses } from '../../hooks/useCloudTripExpenses.js'
import { CloudExpenseView } from './CloudExpenseView.jsx'

export { CloudExpenseView } from './CloudExpenseView.jsx'

export function CloudExpenseSheet({ trip, currentUserId, onClose, onPay }) {
  const cloud = useCloudTripExpenses(trip)
  const cloudBookings = useCloudTripBookings(trip)
  const { repayments, deleteRepayment } = useAppData()
  const tripRepayments = useMemo(
    () => repayments.filter((item) => item.tripId === trip.id),
    [repayments, trip.id],
  )

  return (
    <div data-cloud-expense-sheet="">
      <CloudExpenseView
        trip={trip}
        currentUserId={currentUserId}
        expenses={cloud.expenses}
        people={cloud.people}
        settlement={cloud.settlement}
        loading={cloud.loading}
        error={cloud.error}
        liveError={cloud.liveError}
        canCreate={cloud.canCreate}
        canMutateExpense={cloud.canMutateExpense}
        repayments={tripRepayments}
        bookings={cloudBookings.bookings}
        onPay={onPay}
        onDeleteRepayment={deleteRepayment}
        onSaveExpense={cloud.save}
        onDeleteExpense={cloud.remove}
        onClose={onClose}
      />
    </div>
  )
}
