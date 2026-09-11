import { withConvertedAmount } from '../lib/currency.js'

export const CURRENT_USER_ID = 'user-jamie'

/** @type {import('../types').User[]} */
export const users = [
  {
    id: 'user-jamie',
    name: 'Jamie Lim',
    shortName: 'Jamie',
    email: 'jamie@travelos.app',
    initials: 'JL',
  },
  {
    id: 'user-alex',
    name: 'Alex Wong',
    shortName: 'Alex',
    email: 'alex@example.com',
    initials: 'AW',
  },
  {
    id: 'user-jason',
    name: 'Jason Tan',
    shortName: 'Jason',
    email: 'jason@example.com',
    initials: 'JT',
  },
  {
    id: 'user-sofia',
    name: 'Sofia Rahman',
    shortName: 'Sofia',
    email: 'sofia@example.com',
    initials: 'SR',
  },
  {
    id: 'user-maya',
    name: 'Maya Chen',
    shortName: 'Maya',
    email: 'maya@example.com',
    initials: 'MC',
  },
]

/** @type {import('../types').Trip[]} */
export const trips = [
  {
    id: 'trip-vienna',
    city: 'Vienna',
    country: 'Austria',
    destination: 'Vienna, Austria',
    startDate: '2026-12-12',
    endDate: '2026-12-19',
    budgetAmount: 4000,
    currency: 'MYR',
    visibility: 'shared',
    ownerId: 'user-jamie',
    members: [
      { userId: 'user-jamie', role: 'owner' },
      { userId: 'user-alex', role: 'editor' },
      { userId: 'user-jason', role: 'viewer' },
    ],
    inviteCode: 'vienna-k7m2',
    notes: 'Christmas markets, imperial palaces, and unhurried café mornings.',
    timezone: 'Europe/Vienna',
  },
  {
    id: 'trip-tokyo',
    city: 'Tokyo',
    country: 'Japan',
    destination: 'Tokyo, Japan',
    startDate: '2027-03-18',
    endDate: '2027-03-28',
    budgetAmount: 8000,
    currency: 'MYR',
    visibility: 'private',
    ownerId: 'user-jamie',
    members: [{ userId: 'user-jamie', role: 'owner' }],
    inviteCode: 'tokyo-p9q1',
    notes: 'Cherry blossom week. Keep the first three days unscheduled.',
    timezone: 'Asia/Tokyo',
  },
  {
    id: 'trip-bangkok',
    city: 'Bangkok',
    country: 'Thailand',
    destination: 'Bangkok, Thailand',
    startDate: '2026-08-03',
    endDate: '2026-08-09',
    budgetAmount: 2500,
    currency: 'MYR',
    visibility: 'shared',
    ownerId: 'user-jamie',
    members: [
      { userId: 'user-jamie', role: 'owner' },
      { userId: 'user-sofia', role: 'editor' },
    ],
    inviteCode: 'bkk-r4n8',
    notes: 'A short, warm week of food, temples, and late river walks.',
    timezone: 'Asia/Bangkok',
  },
]

/** @type {import('../types').Expense[]} */
const seedExpenses = [
  {
    id: 'exp-vie-flights',
    tripId: 'trip-vienna',
    amount: 1800,
    currency: 'MYR',
    category: 'flights',
    date: '2026-10-14',
    description: 'Return flights KUL–VIE',
    payerId: 'user-jamie',
    shares: [
      { userId: 'user-jamie', amount: 800 },
      { userId: 'user-alex', amount: 500 },
      { userId: 'user-jason', amount: 500 },
    ],
  },
  {
    id: 'exp-vie-hotel',
    tripId: 'trip-vienna',
    amount: 980,
    currency: 'MYR',
    category: 'lodging',
    date: '2026-12-12',
    description: 'Hotel Sacher, 7 nights',
    payerId: 'user-alex',
    shares: [
      { userId: 'user-jamie', amount: 400 },
      { userId: 'user-alex', amount: 280 },
      { userId: 'user-jason', amount: 300 },
    ],
  },
  {
    id: 'exp-vie-dinner-1',
    tripId: 'trip-vienna',
    amount: 150,
    currency: 'MYR',
    category: 'food',
    date: '2026-12-12',
    description: 'Dinner',
    payerId: 'user-alex',
    shares: [
      { userId: 'user-jamie', amount: 60 },
      { userId: 'user-alex', amount: 40 },
      { userId: 'user-jason', amount: 50 },
    ],
  },
  {
    id: 'exp-vie-schoenbrunn',
    tripId: 'trip-vienna',
    amount: 180,
    currency: 'MYR',
    category: 'activity',
    date: '2026-12-13',
    description: 'Schönbrunn Palace tickets',
    payerId: 'user-jamie',
    shares: [
      { userId: 'user-jamie', amount: 70 },
      { userId: 'user-alex', amount: 55 },
      { userId: 'user-jason', amount: 55 },
    ],
  },
  {
    id: 'exp-vie-transfer',
    tripId: 'trip-vienna',
    amount: 90,
    currency: 'MYR',
    category: 'transport',
    date: '2026-12-12',
    description: 'Airport transfer',
    payerId: 'user-jason',
    shares: [
      { userId: 'user-jamie', amount: 40 },
      { userId: 'user-alex', amount: 25 },
      { userId: 'user-jason', amount: 25 },
    ],
  },
  {
    id: 'exp-vie-lunch-2',
    tripId: 'trip-vienna',
    amount: 40,
    currency: 'MYR',
    category: 'food',
    date: '2026-12-13',
    description: 'Lunch near Belvedere',
    payerId: 'user-jamie',
    shares: [
      { userId: 'user-jamie', amount: 20 },
      { userId: 'user-alex', amount: 12 },
      { userId: 'user-jason', amount: 8 },
    ],
  },
  {
    id: 'exp-tyo-flights',
    tripId: 'trip-tokyo',
    amount: 1200,
    currency: 'MYR',
    category: 'flights',
    date: '2026-09-01',
    description: 'Flight deposit KUL–HND',
    payerId: 'user-jamie',
    shares: [{ userId: 'user-jamie', amount: 1200 }],
  },
  {
    id: 'exp-bkk-flights',
    tripId: 'trip-bangkok',
    amount: 680,
    currency: 'MYR',
    category: 'flights',
    date: '2026-06-12',
    description: 'Return flights KUL–BKK',
    payerId: 'user-jamie',
    shares: [
      { userId: 'user-jamie', amount: 340 },
      { userId: 'user-sofia', amount: 340 },
    ],
  },
  {
    id: 'exp-bkk-hotel',
    tripId: 'trip-bangkok',
    amount: 920,
    currency: 'MYR',
    category: 'lodging',
    date: '2026-08-03',
    description: 'The Siam, 6 nights',
    payerId: 'user-sofia',
    shares: [
      { userId: 'user-jamie', amount: 500 },
      { userId: 'user-sofia', amount: 420 },
    ],
  },
  {
    id: 'exp-bkk-food',
    tripId: 'trip-bangkok',
    amount: 410,
    currency: 'MYR',
    category: 'food',
    date: '2026-08-06',
    description: 'Meals through the week',
    payerId: 'user-jamie',
    shares: [
      { userId: 'user-jamie', amount: 230 },
      { userId: 'user-sofia', amount: 180 },
    ],
  },
  {
    id: 'exp-bkk-boats',
    tripId: 'trip-bangkok',
    amount: 180,
    currency: 'MYR',
    category: 'transport',
    date: '2026-08-05',
    description: 'River boats and Grab',
    payerId: 'user-sofia',
    shares: [
      { userId: 'user-jamie', amount: 90 },
      { userId: 'user-sofia', amount: 90 },
    ],
  },
  {
    id: 'exp-bkk-temple',
    tripId: 'trip-bangkok',
    amount: 120,
    currency: 'MYR',
    category: 'activity',
    date: '2026-08-04',
    description: 'Grand Palace and temples',
    payerId: 'user-jamie',
    shares: [
      { userId: 'user-jamie', amount: 70 },
      { userId: 'user-sofia', amount: 50 },
    ],
  },
  {
    id: 'exp-vie-cafe',
    tripId: 'trip-vienna',
    amount: 35,
    currency: 'EUR',
    category: 'food',
    date: '2026-12-14',
    description: 'Café Central',
    payerId: 'user-alex',
    shares: [
      { userId: 'user-jamie', amount: 15 },
      { userId: 'user-alex', amount: 12 },
      { userId: 'user-jason', amount: 8 },
    ],
  },
]

export const expenses = seedExpenses.map((expense) =>
  withConvertedAmount({
    ...expense,
    createdBy: expense.createdBy ?? expense.payerId,
    createdAt: expense.createdAt ?? `${expense.date}T10:00:00.000Z`,
  }),
)

/** @type {import('../types').Itinerary[]} */
export const itineraries = [
  {
    tripId: 'trip-vienna',
    days: [
      {
        date: '2026-12-12',
        dayNumber: 1,
        title: 'Arrival',
        items: [
          {
            id: 'vie-d1-1',
            time: '14:20',
            title: 'Arrival',
            category: 'arrival',
            place: 'Vienna International Airport',
            notes: 'OS 722 from Kuala Lumpur.',
          },
          {
            id: 'vie-d1-2',
            time: '16:00',
            title: 'Hotel check-in',
            category: 'lodging',
            place: 'Hotel Sacher',
            createdBy: 'user-jamie',
            createdAt: '2026-08-20T10:00:00.000Z',
            updatedBy: 'user-jamie',
            updatedAt: '2026-09-03T16:40:00.000Z',
          },
          {
            id: 'vie-d1-3',
            time: '19:30',
            title: 'Dinner',
            category: 'food',
            place: 'Figlmüller',
            notes: 'First Wiener schnitzel of the trip.',
          },
        ],
      },
      {
        date: '2026-12-13',
        dayNumber: 2,
        title: 'Imperial Vienna',
        items: [
          {
            id: 'vie-d2-1',
            time: '09:30',
            title: 'Schönbrunn Palace',
            category: 'sight',
            place: 'Schönbrunn',
            notes: 'Grand Tour tickets, arrive before the crowds.',
          },
          {
            id: 'vie-d2-2',
            time: '13:00',
            title: 'Lunch',
            category: 'food',
            place: 'Café near Belvedere',
            createdBy: 'user-alex',
            createdAt: '2026-09-02T09:18:00.000Z',
          },
          {
            id: 'vie-d2-3',
            time: '15:00',
            title: 'Belvedere Palace',
            category: 'sight',
            place: 'Upper Belvedere',
            notes: 'The Kiss, and the winter gardens.',
            createdBy: 'user-alex',
            createdAt: '2026-09-02T09:12:00.000Z',
          },
          {
            id: 'vie-d2-4',
            time: '19:00',
            title: 'Dinner',
            category: 'food',
            place: 'Steirereck im Stadtpark',
          },
        ],
      },
      {
        date: '2026-12-14',
        dayNumber: 3,
        title: 'Old town',
        items: [
          {
            id: 'vie-d3-1',
            time: '10:00',
            title: 'St. Stephen’s Cathedral',
            category: 'sight',
            place: 'Stephansdom',
          },
          {
            id: 'vie-d3-2',
            time: '11:30',
            title: 'Café Central',
            category: 'food',
            place: 'Café Central',
            notes: 'Melange and a slice of cake. No rush.',
            createdBy: 'user-alex',
            createdAt: '2026-09-02T09:20:00.000Z',
            updatedBy: 'user-jamie',
            updatedAt: '2026-09-04T11:00:00.000Z',
          },
          {
            id: 'vie-d3-3',
            time: '15:00',
            title: 'Naschmarkt',
            category: 'sight',
            place: 'Naschmarkt',
          },
          {
            id: 'vie-d3-4',
            time: '18:30',
            title: 'Christmas markets',
            category: 'free',
            place: 'Rathausplatz',
          },
        ],
      },
      {
        date: '2026-12-15',
        dayNumber: 4,
        title: 'Museums',
        items: [
          {
            id: 'vie-d4-1',
            time: '09:30',
            title: 'Hofburg',
            category: 'sight',
            place: 'Hofburg Palace',
          },
          {
            id: 'vie-d4-2',
            time: '14:00',
            title: 'MuseumsQuartier',
            category: 'sight',
            place: 'Leopold Museum',
          },
          {
            id: 'vie-d4-3',
            time: '19:00',
            title: 'Dinner',
            category: 'food',
            place: 'Tian',
          },
        ],
      },
      {
        date: '2026-12-16',
        dayNumber: 5,
        title: 'Danube day',
        items: [
          {
            id: 'vie-d5-1',
            time: '09:00',
            title: 'Train to Krems',
            category: 'transport',
            place: 'Wien Westbahnhof',
          },
          {
            id: 'vie-d5-2',
            time: '11:00',
            title: 'Wachau valley walk',
            category: 'sight',
            place: 'Dürnstein',
          },
          {
            id: 'vie-d5-3',
            time: '20:00',
            title: 'Return to Vienna',
            category: 'transport',
          },
        ],
      },
      {
        date: '2026-12-17',
        dayNumber: 6,
        title: 'Slow morning',
        items: [
          {
            id: 'vie-d6-1',
            time: '10:00',
            title: 'Prater',
            category: 'free',
            place: 'Wiener Prater',
          },
          {
            id: 'vie-d6-2',
            time: '14:00',
            title: 'Danube canal',
            category: 'free',
            place: 'Donaukanal',
          },
          {
            id: 'vie-d6-3',
            time: '19:30',
            title: 'Farewell dinner',
            category: 'food',
            place: 'Mraz & Sohn',
          },
        ],
      },
      {
        date: '2026-12-18',
        dayNumber: 7,
        title: 'Last full day',
        items: [
          {
            id: 'vie-d7-1',
            time: '11:00',
            title: 'Albertina',
            category: 'sight',
            place: 'Albertina',
          },
          {
            id: 'vie-d7-2',
            time: '16:00',
            title: 'Unscheduled hours',
            category: 'free',
            notes: 'Leave room to wander.',
          },
        ],
      },
      {
        date: '2026-12-19',
        dayNumber: 8,
        title: 'Departure',
        items: [
          {
            id: 'vie-d8-1',
            time: '08:00',
            title: 'Hotel check-out',
            category: 'lodging',
            place: 'Hotel Sacher',
          },
          {
            id: 'vie-d8-2',
            time: '11:40',
            title: 'Departure',
            category: 'departure',
            place: 'Vienna International Airport',
          },
        ],
      },
    ],
  },
  {
    tripId: 'trip-tokyo',
    days: [
      {
        date: '2027-03-18',
        dayNumber: 1,
        title: 'Arrival in Shinjuku',
        items: [
          {
            id: 'tyo-d1-1',
            time: '09:10',
            title: 'Arrival at Haneda',
            category: 'arrival',
            place: 'HND',
          },
          {
            id: 'tyo-d1-2',
            time: '12:00',
            title: 'Hotel check-in',
            category: 'lodging',
            place: 'Park Hyatt Tokyo',
          },
          {
            id: 'tyo-d1-3',
            time: '18:00',
            title: 'Dinner in Omoide Yokocho',
            category: 'food',
            place: 'Shinjuku',
          },
        ],
      },
      {
        date: '2027-03-19',
        dayNumber: 2,
        title: 'Shibuya and Meiji',
        items: [
          {
            id: 'tyo-d2-1',
            time: '09:00',
            title: 'Meiji Jingu',
            category: 'sight',
          },
          {
            id: 'tyo-d2-2',
            time: '13:00',
            title: 'Omotesando walk',
            category: 'free',
          },
        ],
      },
    ],
  },
  {
    tripId: 'trip-bangkok',
    days: [
      {
        date: '2026-08-03',
        dayNumber: 1,
        title: 'Arrival',
        items: [
          {
            id: 'bkk-d1-1',
            time: '16:00',
            title: 'Arrival',
            category: 'arrival',
            place: 'Suvarnabhumi',
          },
          {
            id: 'bkk-d1-2',
            time: '19:00',
            title: 'River dinner',
            category: 'food',
            place: 'The Siam',
          },
        ],
      },
      {
        date: '2026-08-04',
        dayNumber: 2,
        title: 'Old city',
        items: [
          {
            id: 'bkk-d2-1',
            time: '08:30',
            title: 'Grand Palace',
            category: 'sight',
          },
          {
            id: 'bkk-d2-2',
            time: '13:00',
            title: 'Wat Arun',
            category: 'sight',
            createdBy: 'user-sofia',
            createdAt: '2026-07-20T10:00:00.000Z',
          },
        ],
      },
    ],
  },
]

/** @type {import('../types').Place[]} */
export const places = [
  {
    id: 'place-sacher',
    tripId: 'trip-vienna',
    name: 'Hotel Sacher',
    area: 'Innere Stadt',
    category: 'Stay',
    mapX: 48,
    mapY: 52,
    notes: 'Home base for the week.',
  },
  {
    id: 'place-schoenbrunn',
    tripId: 'trip-vienna',
    name: 'Schönbrunn Palace',
    area: 'Hietzing',
    category: 'Sight',
    mapX: 22,
    mapY: 68,
  },
  {
    id: 'place-belvedere',
    tripId: 'trip-vienna',
    name: 'Belvedere Palace',
    area: 'Landstraße',
    category: 'Sight',
    mapX: 62,
    mapY: 64,
  },
  {
    id: 'place-stephansdom',
    tripId: 'trip-vienna',
    name: 'St. Stephen’s Cathedral',
    area: 'Stephansplatz',
    category: 'Sight',
    mapX: 50,
    mapY: 44,
  },
  {
    id: 'place-central',
    tripId: 'trip-vienna',
    name: 'Café Central',
    area: 'Herrengasse',
    category: 'Café',
    mapX: 44,
    mapY: 40,
  },
  {
    id: 'place-park-hyatt',
    tripId: 'trip-tokyo',
    name: 'Park Hyatt Tokyo',
    area: 'Shinjuku',
    category: 'Stay',
    mapX: 38,
    mapY: 48,
  },
  {
    id: 'place-meiji',
    tripId: 'trip-tokyo',
    name: 'Meiji Jingu',
    area: 'Shibuya',
    category: 'Sight',
    mapX: 30,
    mapY: 62,
  },
  {
    id: 'place-siam',
    tripId: 'trip-bangkok',
    name: 'The Siam',
    area: 'Dusit',
    category: 'Stay',
    mapX: 42,
    mapY: 36,
  },
  {
    id: 'place-grand-palace',
    tripId: 'trip-bangkok',
    name: 'Grand Palace',
    area: 'Phra Nakhon',
    category: 'Sight',
    mapX: 46,
    mapY: 58,
  },
]

/** @type {import('../types').Invitation[]} */
export const invitations = [
  {
    id: 'inv-vienna-maya',
    tripId: 'trip-vienna',
    email: 'maya@example.com',
    name: 'Maya Chen',
    role: 'editor',
    status: 'pending',
    inviteToken: 'm4y4-vienna-k7n2qp',
    createdAt: '2026-09-05T09:30:00.000Z',
    invitedBy: 'user-jamie',
  },
  {
    id: 'inv-vienna-oliver',
    tripId: 'trip-vienna',
    email: 'oliver@example.com',
    name: 'Oliver Berg',
    role: 'viewer',
    status: 'invited',
    inviteToken: 'olv-vienna-p9q1xm',
    createdAt: '2026-09-06T14:12:00.000Z',
    invitedBy: 'user-jamie',
  },
]

/** @type {import('../types').Activity[]} */
export const activities = [
  {
    id: 'act-vie-join',
    tripId: 'trip-vienna',
    actorId: 'user-jason',
    type: 'member.join',
    createdAt: '2026-09-01T11:00:00.000Z',
    meta: { name: 'Jason' },
  },
  {
    id: 'act-vie-belvedere',
    tripId: 'trip-vienna',
    actorId: 'user-alex',
    type: 'itinerary.add',
    createdAt: '2026-09-02T09:12:00.000Z',
    meta: { title: 'Belvedere Palace' },
  },
  {
    id: 'act-vie-hotel',
    tripId: 'trip-vienna',
    actorId: 'user-jamie',
    type: 'itinerary.update',
    createdAt: '2026-09-03T16:40:00.000Z',
    meta: { title: 'the hotel booking' },
  },
  {
    id: 'act-vie-dinner',
    tripId: 'trip-vienna',
    actorId: 'user-jamie',
    type: 'expense.add',
    createdAt: '2026-09-04T18:20:00.000Z',
    meta: { title: 'Dinner at Café Central' },
  },
  {
    id: 'act-vie-invite-maya',
    tripId: 'trip-vienna',
    actorId: 'user-jamie',
    type: 'member.invite',
    createdAt: '2026-09-05T09:30:00.000Z',
    meta: { name: 'Maya', role: 'editor' },
  },
]

/** @type {import('../types').TripPoll[]} */
export const polls = [
  {
    id: 'poll-vie-day4',
    tripId: 'trip-vienna',
    question: 'Where should we go on Day 4?',
    createdBy: 'user-jamie',
    createdAt: '2026-09-04T08:00:00.000Z',
    options: [
      { id: 'opt-salzburg', label: 'Salzburg', voterIds: ['user-alex'] },
      { id: 'opt-bratislava', label: 'Bratislava', voterIds: [] },
      { id: 'opt-vienna', label: 'Stay in Vienna', voterIds: ['user-jamie'] },
    ],
  },
]

export function getUserById(userId, list = users) {
  return list.find((user) => user.id === userId) ?? null
}

export function displayName(user, currentUserId = CURRENT_USER_ID) {
  if (!user) return 'Unknown'
  if (user.id === currentUserId) return 'You'
  return user.shortName || user.name
}
