import { displayName } from '../../data/mock.js'
import { formatMoney } from '../../lib/format.js'
import { Avatar } from '../ui/Avatar.jsx'
import { Card } from '../ui/Card.jsx'

export function SettlementPanel({
  transfers,
  userSettlement,
  members,
  currentUserId,
  currency,
}) {
  const memberMap = Object.fromEntries(members.map((member) => [member.userId, member.user]))

  if (!transfers.length) {
    return (
      <Card className="p-5 sm:p-6">
        <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">Settlement</p>
        <p className="mt-3 text-sm text-ink-muted">Everyone is even on this trip.</p>
      </Card>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card className="p-5 sm:p-6">
        <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">You owe</p>
        {userSettlement.youOwe.length ? (
          <ul className="mt-4 space-y-3">
            {userSettlement.youOwe.map((item) => (
              <li key={`${item.fromId}-${item.toId}`} className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-ink">{displayName(memberMap[item.toId], currentUserId)}</span>
                <span className="font-display text-[22px] tracking-[-0.03em] text-accent tabular-nums">
                  {formatMoney(item.amount, currency)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-ink-muted">Nothing to pay.</p>
        )}
      </Card>

      <Card className="p-5 sm:p-6">
        <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">You should receive</p>
        {userSettlement.youReceive.length ? (
          <>
            <p className="font-display mt-3 text-[34px] tracking-[-0.04em] tabular-nums">
              {formatMoney(userSettlement.youReceiveTotal, currency)}
            </p>
            <ul className="mt-4 space-y-2">
              {userSettlement.youReceive.map((item) => (
                <li key={`${item.fromId}-${item.toId}`} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2 text-ink-muted">
                    <Avatar initials={memberMap[item.fromId]?.initials} size="sm" />
                    {displayName(memberMap[item.fromId], currentUserId)}
                  </span>
                  <span className="tabular-nums text-ink">{formatMoney(item.amount, currency)}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-4 text-sm text-ink-muted">No one owes you.</p>
        )}
      </Card>

      <Card className="p-5 sm:col-span-2 sm:p-6">
        <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">Transfers</p>
        <ul className="mt-4 divide-y divide-line">
          {transfers.map((item) => (
            <li
              key={`${item.fromId}-${item.toId}`}
              className="flex items-baseline justify-between gap-3 py-3 first:pt-0 last:pb-0"
            >
              <span className="text-sm text-ink-muted">
                {displayName(memberMap[item.fromId], currentUserId)} → {displayName(memberMap[item.toId], currentUserId)}
              </span>
              <span className="text-sm tabular-nums text-ink">{formatMoney(item.amount, currency)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
