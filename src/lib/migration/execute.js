/**
 * Sequential Local → Cloud migration executor.
 * Uses existing Cloud APIs. Persists mappings after every entity. Resume-safe.
 */

import { createCloudTrip, getCloudTrips, isCloudTripId } from '../trips/cloud.js'
import { createCloudPlace, getCloudTripPlaces } from '../trips/places.js'
import { createCloudBooking, getCloudTripBookings } from '../trips/bookings.js'
import {
  createCloudItineraryDay,
  createCloudItineraryItem,
  getCloudItineraryDays,
} from '../trips/itinerary.js'
import { createCloudExpense, getCloudTripExpenses } from '../trips/expenses.js'
import { createCloudPoll, getCloudTripPolls, voteCloudPoll } from '../trips/polls.js'
import { createCloudInvitation } from '../trips/invitations.js'
import { isClientRowId } from '../trips/clientRowId.js'
import { identityIsTripActor, localPersonLabel, mappedCloudUserId } from './identity.js'
import { createTripMigration, emptyMappings, newCloudId, sanitizeTripMigration } from './mappings.js'
import { buildMigrationPlan } from './plan.js'
import { formatMigrationReport } from './report.js'
import { MIGRATION_STEPS, OWNERSHIP_WARNING } from './types.js'

export function defaultMigrationApis() {
  return {
    createCloudTrip,
    createCloudPlace,
    createCloudBooking,
    createCloudItineraryDay,
    createCloudItineraryItem,
    createCloudExpense,
    createCloudPoll,
    voteCloudPoll,
    createCloudInvitation,
    getCloudItineraryDays,
    getCloudTripPlaces,
    getCloudTripBookings,
    getCloudTripExpenses,
    getCloudTripPolls,
    getCloudTrips,
  }
}

export function classifyMigrationError(error) {
  if (error && typeof error === 'object' && error.error && !error.message) {
    return classifyMigrationError(error.error)
  }
  const message = String(error?.message ?? error ?? '')
  const code = String(error?.code ?? '')
  if (error?.fatal || error?.kind === 'fatal') return 'fatal'
  if (/belongs to another trip|corrupted migration|refused to send a local id|impossible mapping/i.test(message)) {
    return 'fatal'
  }
  if (code === '42501' || /permission|rls|row-level/i.test(message)) return 'fatal'
  if (/schema|column|relation/i.test(message)) return 'fatal'
  if (/fetch|network|offline|timeout|failed to fetch|could not reach/i.test(message)) return 'retryable'
  if (code === 'PGRST301' || /jwt|not authenticated|sign in/i.test(message)) return 'retryable'
  return 'entity'
}

export function assertCloudUuid(value, label) {
  if (value == null || value === '') return
  if (!isClientRowId(value)) {
    const error = new Error(`Refused to send a local id as ${label}.`)
    error.fatal = true
    throw error
  }
}

function nowIso(now) {
  if (typeof now === 'function') return now()
  if (typeof now === 'string') return now
  return new Date().toISOString()
}

function issue(entity, localId, title, reason) {
  return { entity, localId: localId ?? null, title: title || '', reason }
}

function stopError(kind, message) {
  const error = new Error(message)
  error.kind = kind
  error.fatal = kind === 'fatal'
  return error
}

async function persistState(state, persist) {
  const next = sanitizeTripMigration({ ...state, voteCount: state.voteCount, warnings: state.warnings, lastErrorKind: state.lastErrorKind })
  next.voteCount = state.voteCount ?? 0
  next.warnings = state.warnings ?? []
  next.lastErrorKind = state.lastErrorKind ?? null
  if (typeof persist === 'function') await persist(next)
  return next
}

function belongsToTarget(record, cloudTripId) {
  if (!record || !isClientRowId(record.id)) return false
  if (record.tripId) return record.tripId === cloudTripId
  return record.id === cloudTripId
}

function mappedRow(list, mappedId, cloudTripId, label) {
  if (!isClientRowId(mappedId)) {
    throw stopError('fatal', `Corrupted migration mapping for ${label}.`)
  }
  const row = (list ?? []).find((item) => item.id === mappedId)
  if (!row) return { missing: true, row: null }
  if (!belongsToTarget(row, cloudTripId)) {
    throw stopError('fatal', `Cloud UUID for ${label} belongs to another trip.`)
  }
  return { missing: false, row }
}

function localItems(itinerary) {
  const items = []
  for (const day of itinerary?.days ?? []) {
    for (const [index, item] of (day.items ?? []).entries()) {
      items.push({ ...item, date: day.date, sortOrder: index })
    }
  }
  return items
}

function currentUserVoteOption(poll, identityMappings, currentCloudUserId) {
  for (const option of poll.options ?? []) {
    for (const voterId of option.voterIds ?? []) {
      const mapped = mappedCloudUserId(identityMappings, voterId)
      if (mapped && mapped === currentCloudUserId) return option.id
    }
  }
  return null
}

function mappedUuid(map, localId, generateId) {
  if (map[localId] && isClientRowId(map[localId])) return map[localId]
  const id = generateId ? generateId() : newCloudId()
  map[localId] = id
  return id
}

function throwIfStopped(result) {
  const kind = classifyMigrationError(result)
  if (kind === 'retryable') throw stopError('retryable', result.error || result.message)
  if (kind === 'fatal') throw stopError('fatal', result.error || result.message)
  return kind
}

export async function runMigration(args = {}) {
  const apis = { ...defaultMigrationApis(), ...(args.apis ?? {}) }
  const persist = args.persist
  const generateId = args.generateId
  const session = args.session
  const client = args.client
  const currentUser = args.currentUser ?? session?.user ?? null
  const context = {
    localTrip: args.localTrip,
    targetCloudTrip: args.targetCloudTrip,
    targetCloudTripId: args.targetCloudTrip?.id ?? args.targetCloudTripId,
    path: args.path,
    currentUser,
    cloudMembers: [...(args.cloudMembers ?? [])],
    pendingOps: args.pendingOps ?? [],
    localUsers: args.localUsers ?? [],
    places: args.places ?? [],
    bookings: args.bookings ?? [],
    expenses: args.expenses ?? [],
    itinerary: args.itinerary,
    polls: args.polls ?? [],
    invitations: args.invitations ?? [],
    activities: args.activities ?? [],
    identityMappings: args.identityMappings ?? args.state?.identityMappings ?? {},
    inviteLocalUserIds: args.inviteLocalUserIds ?? [],
  }

  const plan = args.plan ?? buildMigrationPlan(context)
  let state = sanitizeTripMigration(
    args.state ??
      createTripMigration({
        localTripId: context.localTrip?.id,
        cloudTripId: plan.targetCloudTripId,
        path: plan.path ?? 'create',
        status: 'running',
        identityMappings: context.identityMappings,
        mappings: emptyMappings(),
        skipped: plan.skipped,
        blocked: [],
        createdAt: nowIso(args.now),
      }),
  )

  state.status = 'running'
  state.identityMappings = context.identityMappings
  state.path = plan.path ?? state.path
  state.skipped = [...(state.skipped ?? [])]
  state.blocked = [...(state.blocked ?? [])]
  state.errors = []
  state.completedSteps = Array.isArray(state.completedSteps) ? [...state.completedSteps] : []
  state.voteCount = Number(state.voteCount ?? 0)
  state.warnings = [...(plan.warnings ?? [])]
  state = await persistState(state, persist)

  const hard = (plan.blocked ?? []).filter((item) =>
    ['trip', 'session', 'permissions', 'pendingOps'].includes(item.entity),
  )
  if (plan.status === 'blocked' && hard.length) {
    state.status = 'blocked'
    state.blocked = plan.blocked
    state.errors = hard
    state = await persistState(state, persist)
    return { state, plan, report: formatMigrationReport(state, plan) }
  }

  const markStep = async (step) => {
    if (!state.completedSteps.includes(step)) state.completedSteps.push(step)
    state = await persistState(state, persist)
  }

  const fail = async (error) => {
    const kind = classifyMigrationError(error)
    const message = String(error?.message ?? error)
    state.errors.push(issue('migration', context.localTrip?.id, context.localTrip?.city, message))
    state.status = 'failed'
    state.lastErrorKind = kind
    state = await persistState(state, persist)
    return { state, plan, report: formatMigrationReport(state, plan), error: message, kind }
  }

  try {
    await markStep('validate-source')
    await markStep('validate-destination')
    await markStep('validate-session')
    await markStep('validate-permissions')
    await markStep('validate-pending-ops')
    await markStep('resolve-identity')

    if (state.path === 'associate') {
      const targetId = context.targetCloudTrip?.id ?? context.targetCloudTripId
      assertCloudUuid(targetId, 'cloud trip id')
      if (!isCloudTripId(targetId)) throw stopError('fatal', 'Select a Cloud Trip.')
      if (state.mappings.trip && state.mappings.trip !== targetId) {
        throw stopError('fatal', 'Corrupted migration state: Cloud Trip mapping does not match the selected trip.')
      }
      state.mappings.trip = targetId
      state.cloudTripId = targetId
      state = await persistState(state, persist)
    } else {
      if (!isClientRowId(state.mappings.trip)) {
        state.mappings.trip = generateId ? generateId() : newCloudId()
      }
      state.cloudTripId = state.mappings.trip
      state = await persistState(state, persist)

      let existingTrip = null
      if (typeof apis.getCloudTrips === 'function') {
        const listed = await apis.getCloudTrips({ client, session })
        if (listed?.error) throwIfStopped(listed)
        existingTrip = (listed?.trips ?? []).find((item) => item.id === state.mappings.trip) ?? null
      }
      if (existingTrip) {
        if (existingTrip.id !== state.mappings.trip) {
          throw stopError('fatal', 'Cloud Trip UUID does not match the persisted mapping.')
        }
      } else {
        const trip = context.localTrip
        const created = await apis.createCloudTrip({
          client,
          session,
          id: state.mappings.trip,
          input: {
            city: trip.city,
            country: trip.country,
            destination: trip.destination,
            startDate: trip.startDate,
            endDate: trip.endDate,
            budgetAmount: trip.budgetAmount,
            currency: trip.currency,
            visibility: trip.visibility,
            notes: trip.notes,
            timezone: trip.timezone,
          },
        })
        if (created.error) throw stopError(classifyMigrationError(created), created.error)
        if (!created.trip || created.trip.id !== state.mappings.trip) {
          throw stopError('fatal', 'Cloud Trip UUID does not match the persisted mapping.')
        }
        existingTrip = created.trip
      }
      context.targetCloudTrip = existingTrip
      if (existingTrip.inviteCode) context.inviteCode = existingTrip.inviteCode
    }

    if (currentUser?.id && !context.cloudMembers.some((member) => member.userId === currentUser.id)) {
      context.cloudMembers = [
        { userId: currentUser.id, role: state.path === 'create' ? 'owner' : 'editor', name: 'You' },
        ...context.cloudMembers,
      ]
    }
    await markStep('create-or-reuse-trip')

    const cloudTripId = state.cloudTripId
    assertCloudUuid(cloudTripId, 'cloud trip id')
    const call = { client, session, tripId: cloudTripId }

    const loadList = async (fn, key) => {
      if (typeof fn !== 'function') return []
      const result = await fn(call)
      if (result?.error) throwIfStopped(result)
      return result?.[key] ?? []
    }

    // Places
    const cloudPlaces = await loadList(apis.getCloudTripPlaces, 'places')
    for (const place of context.places) {
      const mappedId = state.mappings.places[place.id]
      if (mappedId) {
        const checked = mappedRow(cloudPlaces, mappedId, cloudTripId, `place "${place.name}"`)
        if (!checked.missing) continue
      }
      const id = mappedUuid(state.mappings.places, place.id, generateId)
      state = await persistState(state, persist)
      assertCloudUuid(id, 'place id')
      const created = await apis.createCloudPlace({
        ...call,
        id,
        input: {
          name: place.name,
          category: place.category,
          address: place.address,
          area: place.area,
          latitude: place.latitude,
          longitude: place.longitude,
          notes: place.notes,
          website: place.website,
          openingHours: place.openingHours,
          estimatedCost: place.estimatedCost,
          currency: place.currency,
          rating: place.rating,
          status: place.status,
          plannedDay: place.plannedDay,
          mapX: place.mapX,
          mapY: place.mapY,
        },
      })
      if (created.error) {
        throwIfStopped(created)
        delete state.mappings.places[place.id]
        state.blocked.push(issue('place', place.id, place.name, created.error))
        state = await persistState(state, persist)
        continue
      }
      if (!created.place || created.place.id !== id || created.place.tripId !== cloudTripId) {
        throw stopError('fatal', `Cloud UUID for place "${place.name}" failed verification.`)
      }
      cloudPlaces.push(created.place)
      state = await persistState(state, persist)
    }
    await markStep('create-places')

    // Bookings
    const cloudBookings = await loadList(apis.getCloudTripBookings, 'bookings')
    for (const booking of context.bookings) {
      const mappedId = state.mappings.bookings[booking.id]
      if (mappedId) {
        const checked = mappedRow(cloudBookings, mappedId, cloudTripId, `booking "${booking.title}"`)
        if (!checked.missing) continue
      }
      const id = mappedUuid(state.mappings.bookings, booking.id, generateId)
      state = await persistState(state, persist)
      assertCloudUuid(id, 'booking id')
      const created = await apis.createCloudBooking({
        ...call,
        id,
        input: {
          title: booking.title,
          type: booking.type,
          provider: booking.provider,
          confirmationNumber: booking.confirmationNumber,
          startDate: booking.startDate,
          startTime: booking.startTime,
          endDate: booking.endDate,
          endTime: booking.endTime,
          location: booking.location,
          cost: booking.cost,
          currency: booking.currency,
          notes: booking.notes,
          status: booking.status,
        },
      })
      if (created.error) {
        throwIfStopped(created)
        delete state.mappings.bookings[booking.id]
        state.blocked.push(issue('booking', booking.id, booking.title, created.error))
        state = await persistState(state, persist)
        continue
      }
      if (!created.booking || created.booking.id !== id || created.booking.tripId !== cloudTripId) {
        throw stopError('fatal', `Cloud UUID for booking "${booking.title}" failed verification.`)
      }
      cloudBookings.push(created.booking)
      state = await persistState(state, persist)
    }
    await markStep('create-bookings')

    // Days
    let cloudDays = await loadList(apis.getCloudItineraryDays, 'days')
    for (const day of context.itinerary?.days ?? []) {
      const date = day.date
      const mappedId = state.mappings.itineraryDays[date]
      if (mappedId) {
        const checked = mappedRow(cloudDays, mappedId, cloudTripId, `itinerary day ${date}`)
        if (!checked.missing) continue
      }
      const existingSameDate = cloudDays.find((item) => item.date === date && item.tripId === cloudTripId)
      if (state.path === 'associate' && existingSameDate) {
        state.mappings.itineraryDays[date] = existingSameDate.id
        state = await persistState(state, persist)
        continue
      }
      const id = mappedUuid(state.mappings.itineraryDays, date, generateId)
      state = await persistState(state, persist)
      assertCloudUuid(id, 'itinerary day id')
      const created = await apis.createCloudItineraryDay({
        ...call,
        id,
        input: { date, dayNumber: day.dayNumber, title: day.title },
      })
      if (created.error && /already on this itinerary/i.test(String(created.error)) && state.path === 'associate') {
        const reloaded = await apis.getCloudItineraryDays(call)
        if (reloaded.error) throwIfStopped(reloaded)
        cloudDays = reloaded.days ?? cloudDays
        const reuse = cloudDays.find((item) => item.date === date)
        if (!reuse || reuse.tripId !== cloudTripId) {
          throw stopError('fatal', `Cloud UUID for itinerary day ${date} failed verification.`)
        }
        state.mappings.itineraryDays[date] = reuse.id
        state = await persistState(state, persist)
        continue
      }
      if (created.error) {
        throwIfStopped(created)
        throw stopError('fatal', created.error)
      }
      if (!created.day || created.day.id !== id || created.day.tripId !== cloudTripId || created.day.date !== date) {
        throw stopError('fatal', `Cloud UUID for itinerary day ${date} failed verification.`)
      }
      cloudDays.push(created.day)
      state = await persistState(state, persist)
    }
    await markStep('create-or-reuse-days')

    // Items
    for (const item of localItems(context.itinerary)) {
      const mappedId = state.mappings.itineraryItems[item.id]
      if (mappedId) continue
      const dayId = state.mappings.itineraryDays[item.date]
      if (!dayId) {
        state.blocked.push(
          issue('itinerary-item', item.id, item.title, `Stop "${item.title}" blocked: the Cloud day was not available.`),
        )
        state = await persistState(state, persist)
        continue
      }
      assertCloudUuid(dayId, 'day_id')
      const id = mappedUuid(state.mappings.itineraryItems, item.id, generateId)
      state = await persistState(state, persist)
      assertCloudUuid(id, 'itinerary item id')
      const input = {
        dayId,
        itemDate: item.date,
        sortOrder: item.sortOrder ?? 0,
        time: item.time,
        startTime: item.startTime,
        endTime: item.endTime,
        title: item.title,
        category: item.category,
        placeLabel: item.place || item.placeLabel || '',
        notes: item.notes,
      }
      if (item.placeId && state.mappings.places[item.placeId]) {
        input.placeId = state.mappings.places[item.placeId]
        assertCloudUuid(input.placeId, 'place_id')
      }
      if (item.bookingId && state.mappings.bookings[item.bookingId]) {
        input.bookingId = state.mappings.bookings[item.bookingId]
        assertCloudUuid(input.bookingId, 'booking_id')
      }
      const created = await apis.createCloudItineraryItem({ ...call, id, input })
      if (created.error) {
        throwIfStopped(created)
        delete state.mappings.itineraryItems[item.id]
        state.blocked.push(issue('itinerary-item', item.id, item.title, created.error))
        state = await persistState(state, persist)
        continue
      }
      if (!created.item || created.item.id !== id || created.item.tripId !== cloudTripId) {
        throw stopError('fatal', `Cloud UUID for stop "${item.title}" failed verification.`)
      }
      state = await persistState(state, persist)
    }
    await markStep('create-itinerary-items')

    // Expenses
    const plannedExpenseBlocks = new Set(
      (plan.blocked ?? []).filter((item) => item.entity === 'expense').map((item) => item.localId),
    )
    const cloudExpenses = await loadList(apis.getCloudTripExpenses, 'expenses')
    for (const expense of context.expenses) {
      const title = expense.description || 'Expense'
      const mappedId = state.mappings.expenses[expense.id]
      if (mappedId) {
        const checked = mappedRow(cloudExpenses, mappedId, cloudTripId, `expense "${title}"`)
        if (!checked.missing) continue
      }
      if (plannedExpenseBlocks.has(expense.id)) {
        const existingIssue = (plan.blocked ?? []).find((item) => item.localId === expense.id)
        state.blocked.push(existingIssue ?? issue('expense', expense.id, title, `Expense "${title}" blocked.`))
        continue
      }

      const payerId = mappedCloudUserId(context.identityMappings, expense.payerId)
      const shares = []
      let identityFailed = null
      const actorOk = (localUserId) =>
        mappedCloudUserId(context.identityMappings, localUserId) &&
        identityIsTripActor(context.identityMappings, localUserId, context.cloudMembers)
      if (!actorOk(expense.payerId)) {
        identityFailed = localPersonLabel(
          context.localUsers.find((user) => user.id === expense.payerId),
          expense.payerId,
        )
      }
      for (const share of expense.shares ?? []) {
        if (!actorOk(share.userId)) {
          identityFailed =
            identityFailed ||
            localPersonLabel(context.localUsers.find((user) => user.id === share.userId), share.userId)
          break
        }
        shares.push({ userId: mappedCloudUserId(context.identityMappings, share.userId), amount: share.amount })
      }
      if (identityFailed) {
        state.blocked.push(
          issue(
            'expense',
            expense.id,
            title,
            `Expense "${title}" blocked: Participant "${identityFailed}" has no Cloud identity mapping.`,
          ),
        )
        state = await persistState(state, persist)
        continue
      }

      const id = mappedUuid(state.mappings.expenses, expense.id, generateId)
      state = await persistState(state, persist)
      assertCloudUuid(id, 'expense id')
      assertCloudUuid(payerId, 'paid_by')
      for (const share of shares) assertCloudUuid(share.userId, 'expense share user_id')

      const input = {
        amount: expense.amount,
        currency: expense.currency,
        convertedAmount: expense.convertedAmount,
        convertedCurrency: expense.convertedCurrency,
        category: expense.category,
        date: expense.date,
        description: expense.description,
        payerId,
        shares,
      }
      if (expense.placeId && state.mappings.places[expense.placeId]) {
        input.placeId = state.mappings.places[expense.placeId]
        assertCloudUuid(input.placeId, 'place_id')
      }
      if (expense.bookingId && state.mappings.bookings[expense.bookingId]) {
        input.bookingId = state.mappings.bookings[expense.bookingId]
        assertCloudUuid(input.bookingId, 'booking_id')
      }

      const created = await apis.createCloudExpense({
        ...call,
        id,
        tripCurrency: context.localTrip?.currency ?? context.targetCloudTrip?.currency,
        actorIds: context.cloudMembers.map((member) => member.userId).filter((id) => isClientRowId(id)),
        input,
      })
      if (created.error) {
        throwIfStopped(created)
        delete state.mappings.expenses[expense.id]
        state.blocked.push(issue('expense', expense.id, title, created.error))
        state = await persistState(state, persist)
        continue
      }
      if (!created.expense || created.expense.id !== id || created.expense.tripId !== cloudTripId) {
        throw stopError('fatal', `Cloud UUID for expense "${title}" failed verification.`)
      }
      cloudExpenses.push(created.expense)
      state = await persistState(state, persist)
    }
    await markStep('create-expenses')

    // Polls
    const cloudPolls = await loadList(
      (opts) => apis.getCloudTripPolls?.({ ...opts, currentUserId: currentUser?.id }),
      'polls',
    )
    for (const poll of context.polls) {
      const mappedId = state.mappings.polls[poll.id]
      if (mappedId) {
        const checked = mappedRow(cloudPolls, mappedId, cloudTripId, `poll "${poll.question}"`)
        if (!checked.missing) continue
      }
      const labels = (poll.options ?? []).map((option) => option.label).filter(Boolean)
      if (labels.length < 2) {
        state.blocked.push(issue('poll', poll.id, poll.question, 'Add at least two options.'))
        continue
      }
      const created = await apis.createCloudPoll({
        ...call,
        input: { question: poll.question, options: poll.options },
      })
      if (created.error) {
        throwIfStopped(created)
        state.blocked.push(issue('poll', poll.id, poll.question, created.error))
        state = await persistState(state, persist)
        continue
      }
      if (!created.poll?.id || created.poll.tripId !== cloudTripId) {
        throw stopError('fatal', `Cloud poll "${poll.question}" failed verification.`)
      }
      state.mappings.polls[poll.id] = created.poll.id
      state = await persistState(state, persist)
      const used = new Set()
      for (const [index, option] of (poll.options ?? []).entries()) {
        const cloudOption =
          created.poll.options.find((item) => item.label === option.label && !used.has(item.id)) ??
          created.poll.options[index]
        if (!cloudOption?.id || !isClientRowId(cloudOption.id)) {
          throw stopError('fatal', `Cloud poll option mapping for "${poll.question}" is incomplete.`)
        }
        used.add(cloudOption.id)
        state.mappings.pollOptions[option.id] = cloudOption.id
        state = await persistState(state, persist)
      }
      cloudPolls.push(created.poll)
    }
    await markStep('create-polls')

    let voteCount = state.voteCount ?? 0
    for (const poll of context.polls) {
      const cloudPollId = state.mappings.polls[poll.id]
      if (!cloudPollId) continue
      const localOptionId = currentUserVoteOption(poll, context.identityMappings, currentUser?.id)
      if (!localOptionId) continue
      const cloudOptionId = state.mappings.pollOptions[localOptionId]
      if (!cloudOptionId) continue
      assertCloudUuid(cloudPollId, 'poll_id')
      assertCloudUuid(cloudOptionId, 'option_id')
      const voted = await apis.voteCloudPoll({
        client,
        session,
        pollId: cloudPollId,
        optionId: cloudOptionId,
      })
      if (voted.error) {
        throwIfStopped(voted)
        state.blocked.push(issue('poll-vote', poll.id, poll.question, voted.error))
        continue
      }
      voteCount += 1
    }
    state.voteCount = voteCount
    await markStep('migrate-votes')

    if (plan.canInvite) {
      const inviteCode = context.inviteCode ?? context.targetCloudTrip?.inviteCode
      for (const localUserId of context.inviteLocalUserIds) {
        const user = context.localUsers.find((item) => item.id === localUserId)
        if (!user?.email) continue
        if (mappedCloudUserId(context.identityMappings, localUserId)) continue
        const localRole = context.localTrip?.members?.find((member) => member.userId === localUserId)?.role
        const role = localRole === 'viewer' ? 'viewer' : 'editor'
        const created = await apis.createCloudInvitation({
          client,
          session,
          tripId: cloudTripId,
          email: user.email,
          role,
          invitedName: user.name || user.shortName,
          inviteCode,
        })
        const shortName = user.shortName || user.name
        if (created.error) {
          state.blocked.push(issue('invitation', localUserId, user.name, created.error))
        } else {
          const involved = context.expenses.some(
            (expense) =>
              expense.payerId === localUserId || expense.shares?.some((share) => share.userId === localUserId),
          )
          if (involved) {
            state.blocked.push(
              issue(
                'expense-identity',
                localUserId,
                shortName,
                `${shortName} was invited, but has not joined the Cloud trip, so expenses involving ${shortName} were not migrated.`,
              ),
            )
          }
        }
        state = await persistState(state, persist)
      }
    }
    await markStep('optional-invitations')

    if (state.path === 'create' && !(state.warnings ?? []).includes(OWNERSHIP_WARNING)) {
      state.warnings = [...(state.warnings ?? []), OWNERSHIP_WARNING]
    }

    state.status = 'completed'
    await markStep('report')
    state = await persistState(state, persist)
    return { state, plan, report: formatMigrationReport(state, plan) }
  } catch (error) {
    return fail(error)
  }
}

export { MIGRATION_STEPS }
