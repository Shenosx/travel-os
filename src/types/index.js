/**
 * Domain types for Travel OS.
 * These shapes are ready to be backed by a database later.
 *
 * @typedef {'owner' | 'editor' | 'viewer'} MemberRole
 * @typedef {'private' | 'shared'} TripVisibility
 * @typedef {'upcoming' | 'ongoing' | 'completed'} TripStatus
 * @typedef {'flights' | 'lodging' | 'food' | 'transport' | 'activity' | 'shopping' | 'other'} ExpenseCategory
 * @typedef {'arrival' | 'departure' | 'lodging' | 'food' | 'sight' | 'transport' | 'free'} ItineraryCategory
 *
 * @typedef {Object} User
 * @property {string} id
 * @property {string} name
 * @property {string} shortName
 * @property {string} email
 * @property {string} initials
 *
 * @typedef {Object} TripMember
 * @property {string} userId
 * @property {MemberRole} role
 *
 * @typedef {Object} Trip
 * @property {string} id
 * @property {string} city
 * @property {string} country
 * @property {string} destination
 * @property {string} startDate ISO date YYYY-MM-DD
 * @property {string} endDate ISO date YYYY-MM-DD
 * @property {number} budgetAmount
 * @property {string} currency ISO currency code, e.g. MYR
 * @property {TripVisibility} visibility
 * @property {string} ownerId
 * @property {TripMember[]} members
 * @property {string} inviteCode
 * @property {string} notes
 * @property {string} [timezone]
 *
 * @typedef {Object} ExpenseShare
 * @property {string} userId Person who bears this portion. Independent of who paid.
 * @property {number} amount Share in the expense's original currency
 *
 * @typedef {Object} Expense
 * @property {string} id
 * @property {string} tripId
 * @property {number} amount Original amount; never overwritten by conversion
 * @property {string} currency Original currency code
 * @property {number} convertedAmount Value in convertedCurrency (trip/home)
 * @property {string} convertedCurrency Usually the trip currency, e.g. MYR
 * @property {ExpenseCategory} category
 * @property {string} date ISO date YYYY-MM-DD
 * @property {string} description
 * @property {string} payerId Who paid. Independent of shares.
 * @property {ExpenseShare[]} shares Explicit unequal amounts; not an equal split
 * @property {string} [bookingId] Optional link to a booking; never auto-duplicated
 * @property {string} [placeId]
 * @property {string} [createdBy]
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
 *
 * @typedef {Object} Invitation
 * @property {string} id
 * @property {string} tripId
 * @property {string} email
 * @property {string} [name]
 * @property {'editor' | 'viewer'} role
 * @property {'invited' | 'pending' | 'joined'} status
 * @property {string} inviteToken
 * @property {string} createdAt
 * @property {string} invitedBy
 * @property {string} [joinedUserId]
 *
 * @typedef {Object} Activity
 * @property {string} id
 * @property {string} tripId
 * @property {string} actorId
 * @property {string} type
 * @property {string} createdAt
 * @property {Record<string, string>} [meta]
 *
 * @typedef {Object} PollOption
 * @property {string} id
 * @property {string} label
 * @property {string[]} voterIds
 *
 * @typedef {Object} TripPoll
 * @property {string} id
 * @property {string} tripId
 * @property {string} question
 * @property {PollOption[]} options
 * @property {string} createdBy
 * @property {string} createdAt
 *
 * @typedef {Object} SettlementTransfer
 * @property {string} fromId
 * @property {string} toId
 * @property {number} amount In trip/home currency
 *
 * @typedef {Object} ItineraryItem
 * @property {string} id
 * @property {string} tripId
 * @property {number} [day]
 * @property {string} time HH:mm start; kept for existing itineraries
 * @property {string} [startTime]
 * @property {string} [endTime]
 * @property {string} [type]
 * @property {string} title
 * @property {ItineraryCategory} category
 * @property {string} [place] Display fallback when no placeId is set
 * @property {string} [notes]
 * @property {string} [placeId]
 * @property {string} [bookingId]
 * @property {string} [createdBy]
 * @property {string} [updatedBy]
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
 *
 * @typedef {Object} ItineraryDay
 * @property {string} date
 * @property {number} dayNumber
 * @property {string} title
 * @property {ItineraryItem[]} items
 *
 * @typedef {Object} Itinerary
 * @property {string} tripId
 * @property {ItineraryDay[]} days
 *
 * @typedef {'saved' | 'planned' | 'visited'} PlaceStatus
 * @typedef {'flight' | 'hotel' | 'train' | 'bus' | 'ticket' | 'restaurant' | 'other'} BookingType
 * @typedef {'confirmed' | 'pending' | 'cancelled'} BookingStatus
 *
 * @typedef {Object} Place
 * @property {string} id
 * @property {string} tripId
 * @property {string} name
 * @property {string} [category]
 * @property {string} [address]
 * @property {string} [area]
 * @property {number} [latitude]
 * @property {number} [longitude]
 * @property {string} [notes]
 * @property {string} [website]
 * @property {string} [openingHours]
 * @property {number} [estimatedCost]
 * @property {string} [currency]
 * @property {number} [rating]
 * @property {PlaceStatus} status
 * @property {string} [plannedDay] ISO date YYYY-MM-DD
 * @property {string} [createdBy]
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
 * @property {number} [mapX] Schematic fallback 0–100
 * @property {number} [mapY] Schematic fallback 0–100
 *
 * @typedef {Object} BookingDocument
 * @property {string} id
 * @property {string} name
 *
 * @typedef {Object} Booking
 * @property {string} id
 * @property {string} tripId
 * @property {BookingType} type
 * @property {string} title
 * @property {string} [provider]
 * @property {string} [confirmationNumber]
 * @property {string} [startDate]
 * @property {string} [startTime]
 * @property {string} [endDate]
 * @property {string} [endTime]
 * @property {string} [location]
 * @property {number} [cost]
 * @property {string} [currency]
 * @property {string} [notes]
 * @property {BookingStatus} status
 * @property {string} [createdBy]
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
 * @property {string} [expenseId]
 * @property {BookingDocument[]} [documents]
 */

/**
 * Personal packing, checklist, notes, and memories.
 * Local-only. Scoped by tripId + userId. Not Cloud. Independent of trip.notes.
 *
 * @typedef {Object} PackingCategory
 * @property {string} id
 * @property {string} tripId
 * @property {string} userId
 * @property {string} name
 * @property {number} sortOrder
 * @property {string} createdAt
 * @property {string} updatedAt
 *
 * @typedef {Object} PackingItem
 * @property {string} id
 * @property {string} tripId
 * @property {string} userId
 * @property {string} categoryId
 * @property {string} name
 * @property {number} quantity integer >= 1
 * @property {string} note
 * @property {boolean} packed
 * @property {number} sortOrder
 * @property {string} createdAt
 * @property {string} updatedAt
 *
 * @typedef {Object} ChecklistCategory
 * @property {string} id
 * @property {string} tripId
 * @property {string} userId
 * @property {'before' | 'packing' | 'during' | 'after'} phase
 * @property {string} name
 * @property {number} sortOrder
 * @property {string} createdAt
 * @property {string} updatedAt
 *
 * @typedef {Object} ChecklistItem
 * @property {string} id
 * @property {string} tripId
 * @property {string} userId
 * @property {string} categoryId
 * @property {string} name
 * @property {boolean} done
 * @property {string} note
 * @property {string | null} dueDate YYYY-MM-DD or null
 * @property {number} sortOrder
 * @property {string} createdAt
 * @property {string} updatedAt
 *
 * @typedef {Object} TripNote
 * @property {string} id
 * @property {string} tripId
 * @property {string} userId
 * @property {string} title
 * @property {string} body
 * @property {string | null} date YYYY-MM-DD or null
 * @property {string} createdAt
 * @property {string} updatedAt
 *
 * @typedef {Object} Memory
 * @property {string} id
 * @property {string} tripId
 * @property {string} userId
 * @property {string} caption
 * @property {string | null} date YYYY-MM-DD or null
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef {Object} PendingOperation
 * @property {string} id
 * @property {string} entity
 * @property {string} action
 * @property {unknown} [payload]
 * @property {string} createdAt
 * @property {'pending' | 'syncing' | 'retryable' | 'failed' | 'blocked'} status
 * @property {string | null} [cloudTripId]
 * @property {string | null} [localEntityId]
 * @property {string | null} [cloudEntityId]
 * @property {number} [attemptCount]
 * @property {string | null} [lastAttemptAt]
 * @property {string | null} [nextAttemptAt]
 * @property {string | null} [lastError]
 * @property {string | null} [blockedBy]
 * @property {string | null} [dependsOn]
 */

export {}
