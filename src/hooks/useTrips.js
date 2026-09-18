import { useAppData } from './useAppData.jsx'

export function useTrips() {
  const { trips, addTrip, deleteTrip, allTrips } = useAppData()
  return { trips, addTrip, deleteTrip, allTrips }
}
