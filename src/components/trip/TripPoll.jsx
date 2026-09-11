import { getPollSelection, getPollTotals } from '../../lib/collaboration.js'
import { Card } from '../ui/Card.jsx'

export function TripPoll({ poll, currentUserId, canVote, onVote }) {
  if (!poll) return null

  const { counts, total } = getPollTotals(poll)
  const selected = getPollSelection(poll, currentUserId)
  const max = Math.max(...Object.values(counts), 1)

  return (
    <Card className="p-6 sm:p-7">
      <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">A small question</p>
      <h3 className="font-display mt-2 text-[24px] tracking-[-0.03em]">{poll.question}</h3>
      <ul className="mt-5 space-y-2">
        {poll.options.map((option) => {
          const count = counts[option.id] ?? 0
          const isSelected = selected === option.id
          const width = `${Math.round((count / max) * 100)}%`
          return (
            <li key={option.id}>
              <button
                type="button"
                onClick={() => canVote && onVote?.(option.id)}
                disabled={!canVote}
                className={`relative w-full overflow-hidden rounded-md border px-3 py-3 text-left transition-colors ${
                  isSelected
                    ? 'border-transparent bg-accent-soft'
                    : 'border-line hover:bg-canvas-muted'
                } ${canVote ? '' : 'cursor-default'}`}
                aria-pressed={isSelected}
              >
                <span
                  className="pointer-events-none absolute inset-y-0 left-0 bg-accent-soft/80"
                  style={{ width: isSelected ? '100%' : width }}
                  aria-hidden="true"
                />
                <span className="relative flex items-baseline justify-between gap-3">
                  <span className={`text-sm ${isSelected ? 'text-accent' : 'text-ink'}`}>
                    {option.label}
                    {isSelected ? <span className="ml-2 text-[12px] font-normal">Your vote</span> : null}
                  </span>
                  <span className={`text-[13px] tabular-nums ${isSelected ? 'text-accent' : 'text-ink-subtle'}`}>
                    {count}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <p className="mt-4 text-[13px] text-ink-subtle">
        {total} {total === 1 ? 'vote' : 'votes'}
        {canVote ? ' · One vote each. You can change your mind.' : ''}
      </p>
    </Card>
  )
}
