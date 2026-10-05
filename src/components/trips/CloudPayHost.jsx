import { createPortal } from 'react-dom'
import { isPayDraft } from '../../lib/repayments.js'
import { PaySheet } from '../expenses/PaySheet.jsx'

export function CloudPayHost({ session, currentUserId, onClose, onConfirm }) {
  if (!isPayDraft(session?.draft) || !session?.trip) return null

  return createPortal(
    <div data-cloud-pay-host="">
      <PaySheet
        trip={session.trip}
        expenses={session.expenses}
        repayments={session.repayments}
        members={session.people}
        currentUserId={currentUserId}
        draft={session.draft}
        onClose={onClose}
        onConfirm={(input) =>
          onConfirm?.(input, {
            expenses: session.expenses,
            memberIds: (session.people ?? []).map((person) => person.userId),
            repayments: session.repayments,
          })
        }
      />
    </div>,
    document.body,
  )
}
