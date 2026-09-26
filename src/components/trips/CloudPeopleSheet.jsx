import { CloudPeoplePanel } from './CloudPeoplePanel.jsx'
import { Sheet } from '../ui/Sheet.jsx'

export function CloudPeopleSheet({ trip, currentUserId, onClose }) {
  return (
    <Sheet kicker="Cloud" title="People" onClose={onClose} wide>
      <CloudPeoplePanel trip={trip} currentUserId={currentUserId} />
    </Sheet>
  )
}
