import { useAppData } from './useAppData.jsx'

export function usePlaces() {
  const { places, addPlace, updatePlace, deletePlace } = useAppData()
  return { places, addPlace, updatePlace, deletePlace }
}
