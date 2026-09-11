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
 * @property {string} time HH:mm or empty
 * @property {string} title
 * @property {ItineraryCategory} category
 * @property {string} [place]
 * @property {string} [notes]
 * @property {string} [placeId]
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
 * @typedef {Object} Place
 * @property {string} id
 * @property {string} tripId
 * @property {string} name
 * @property {string} [area]
 * @property {string} [category]
 * @property {number} [lat]
 * @property {number} [lng]
 * @property {number} [mapX] 0–100 schematic position
 * @property {number} [mapY] 0–100 schematic position
 * @property {string} [notes]
 */

export {}
