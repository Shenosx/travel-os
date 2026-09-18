/**
 * Human-readable Local → Cloud migration report. No network I/O.
 */

export function countMapped(map) {
  if (!map || typeof map !== 'object') return 0
  return Object.keys(map).length
}

export function summarizeCreated(state = {}) {
  const mappings = state.mappings ?? {}
  return {
    places: countMapped(mappings.places),
    bookings: countMapped(mappings.bookings),
    itineraryDays: countMapped(mappings.itineraryDays),
    itineraryItems: countMapped(mappings.itineraryItems),
    expenses: countMapped(mappings.expenses),
    polls: countMapped(mappings.polls),
    pollVotes: (state.completedSteps ?? []).includes('migrate-votes')
      ? (state.voteCount ?? 0)
      : (state.voteCount ?? 0),
  }
}

export function formatMigrationReport(state = {}, plan = {}) {
  const created = summarizeCreated(state)
  const skipped = [...(state.skipped ?? []), ...(plan.skipped ?? [])].filter(
    (item, index, list) =>
      list.findIndex((entry) => entry.entity === item.entity && entry.localId === item.localId && entry.reason === item.reason) ===
      index,
  )
  const blocked = [...(state.blocked ?? []), ...(plan.blocked ?? []).filter((item) => item.entity === 'expense')].filter(
    (item, index, list) =>
      list.findIndex((entry) => entry.entity === item.entity && entry.localId === item.localId && entry.reason === item.reason) ===
      index,
  )

  const createdLines = [
    created.places ? `${created.places} places` : null,
    created.bookings ? `${created.bookings} bookings` : null,
    created.itineraryDays ? `${created.itineraryDays} itinerary days` : null,
    created.itineraryItems ? `${created.itineraryItems} itinerary items` : null,
    created.expenses ? `${created.expenses} expenses` : null,
    created.polls ? `${created.polls} polls` : null,
  ].filter(Boolean)

  const headline =
    state.status === 'completed'
      ? 'Migration complete'
      : state.status === 'failed'
        ? 'Migration stopped'
        : state.status === 'blocked'
          ? 'Migration blocked'
          : 'Migration'

  return {
    headline,
    status: state.status ?? 'preview',
    created,
    createdLines,
    skipped,
    blocked,
    errors: state.errors ?? [],
    warnings: plan.warnings ?? [],
    cloudTripId: state.cloudTripId ?? state.mappings?.trip ?? null,
    localTripId: state.localTripId ?? null,
  }
}
