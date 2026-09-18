import { useAppData } from './useAppData.jsx'

export function useBookings() {
  const { bookings, addBooking, updateBooking, deleteBooking } = useAppData()
  return { bookings, addBooking, updateBooking, deleteBooking }
}
