import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSeedSnapshot } from '../data/seed.js'
import { STORAGE_KEY, loadSnapshot, saveSnapshot } from '../data/storage.js'
import {
  CHECKLIST_PHASES,
  CHECKLIST_PHASE_IDS,
  DEFAULT_CHECKLIST_CATEGORIES_BY_PHASE,
  DEFAULT_PACKING_CATEGORY_NAMES,
  checklistCategoryProgress,
  checklistPhaseProgress,
  checklistProgress,
  checklistRowsForTripUser,
  createChecklistCategory,
  createChecklistItem,
  createMemory,
  createNote,
  createPackingCategory,
  createPackingItem,
  deleteChecklistCategory,
  deleteChecklistItem,
  deleteMemory,
  deleteNote,
  deletePackingCategory,
  deletePackingItem,
  isChecklistPhase,
  isIsoDate,
  moveIdInOrder,
  packingCategoryProgress,
  packingPercent,
  packingProgress,
  packingRowsForTripUser,
  parseQuantity,
  personalRowsForUser,
  removePersonalRowsForTrip,
  reorderChecklistCategories,
  reorderChecklistItems,
  reorderPackingCategories,
  reorderPackingItems,
  seedDefaultChecklistCategories,
  seedDefaultPackingCategories,
  sortByChecklistOrder,
  sortByPackingOrder,
  sortNotes,
  groupNotesByDate,
  notesForTripUser,
  toggleChecklistItemDone,
  toggleCollapsedIds,
  togglePackingItemPacked,
  updateChecklistCategory,
  updateChecklistItem,
  updateMemory,
  updateNote,
  updatePackingCategory,
  updatePackingItem,
} from './planning.js'

const NOW = '2026-09-17T15:00:00.000Z'
const JAMIE = 'user-jamie'
const ALEX = 'user-alex'
const VIENNA = 'trip-vienna'
const TOKYO = 'trip-tokyo'

function installStorage() {
  const map = new Map()
  globalThis.localStorage = {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      map.set(key, String(value))
    },
    removeItem: (key) => {
      map.delete(key)
    },
    clear: () => map.clear(),
  }
  return map
}

function addCategory(categories = [], input = {}, options = {}) {
  return createPackingCategory(
    categories,
    { tripId: VIENNA, userId: JAMIE, name: 'Clothes', ...input },
    { now: NOW, ...options },
  )
}

function addItem(items, categories, input = {}, options = {}) {
  return createPackingItem(
    items,
    categories,
    {
      tripId: VIENNA,
      userId: JAMIE,
      categoryId: categories[0].id,
      name: 'Socks',
      ...input,
    },
    { now: NOW, ...options },
  )
}

test('create packing category assigns sequential sortOrder for that user and trip', () => {
  const first = addCategory([], { name: 'Clothes' }, { id: 'pcat-1' })
  const second = addCategory(first.categories, { name: 'Toiletries' }, { id: 'pcat-2' })
  const alex = addCategory(second.categories, { name: 'Clothes', userId: ALEX }, { id: 'pcat-alex' })
  assert.equal(first.category.sortOrder, 0)
  assert.equal(second.category.sortOrder, 1)
  assert.equal(alex.category.sortOrder, 0)
  assert.equal(second.category.userId, JAMIE)
})

test('rename packing category', () => {
  const created = addCategory([], { name: 'Clothes' }, { id: 'pcat-1' })
  const renamed = updatePackingCategory(created.categories, 'pcat-1', JAMIE, { name: 'Warm layers' }, NOW)
  assert.equal(renamed.category.name, 'Warm layers')
  assert.equal(renamed.category.tripId, VIENNA)
})

test('reorder packing categories', () => {
  const first = addCategory([], { name: 'A' }, { id: 'pcat-a' })
  const second = addCategory(first.categories, { name: 'B' }, { id: 'pcat-b' })
  const reordered = reorderPackingCategories(second.categories, VIENNA, JAMIE, ['pcat-b', 'pcat-a'], NOW)
  assert.equal(reordered.ok, true)
  assert.equal(reordered.categories.find((row) => row.id === 'pcat-b').sortOrder, 0)
  assert.equal(reordered.categories.find((row) => row.id === 'pcat-a').sortOrder, 1)
})

test('create packing item defaults quantity to 1 and packed to false', () => {
  const category = addCategory([], {}, { id: 'pcat-1' })
  const created = addItem([], category.categories, { name: 'Passport' }, { id: 'pitem-1' })
  assert.equal(created.item.quantity, 1)
  assert.equal(created.item.packed, false)
  assert.equal(created.item.categoryId, 'pcat-1')
})

test('packing item quantity rejects invalid values', () => {
  const category = addCategory([], {}, { id: 'pcat-1' })
  assert.equal(addItem([], category.categories, { quantity: 0 }).item, null)
  assert.equal(addItem([], category.categories, { quantity: 1.5 }).item, null)
  assert.equal(addItem([], category.categories, { quantity: -2 }).item, null)
  const created = addItem([], category.categories, { quantity: 2 }, { id: 'pitem-1' })
  assert.equal(created.item.quantity, 2)
  assert.equal(updatePackingItem(created.items, category.categories, 'pitem-1', JAMIE, { quantity: 0 }, NOW).item, null)
})

test('toggle packing item packed', () => {
  const category = addCategory([], {}, { id: 'pcat-1' })
  const created = addItem([], category.categories, {}, { id: 'pitem-1' })
  const toggled = togglePackingItemPacked(created.items, 'pitem-1', JAMIE, NOW)
  assert.equal(toggled.item.packed, true)
  const again = togglePackingItemPacked(toggled.items, 'pitem-1', JAMIE, NOW)
  assert.equal(again.item.packed, false)
})

test('update packing item', () => {
  const category = addCategory([], {}, { id: 'pcat-1' })
  const created = addItem([], category.categories, {}, { id: 'pitem-1' })
  const updated = updatePackingItem(
    created.items,
    category.categories,
    'pitem-1',
    JAMIE,
    { name: 'Wool socks', note: 'Two pairs', quantity: 3 },
    NOW,
  )
  assert.equal(updated.item.name, 'Wool socks')
  assert.equal(updated.item.note, 'Two pairs')
  assert.equal(updated.item.quantity, 3)
})

test('reorder packing items within a category', () => {
  const category = addCategory([], {}, { id: 'pcat-1' })
  const first = addItem([], category.categories, { name: 'A' }, { id: 'pitem-a' })
  const second = addItem(first.items, category.categories, { name: 'B' }, { id: 'pitem-b' })
  const reordered = reorderPackingItems(second.items, 'pcat-1', JAMIE, ['pitem-b', 'pitem-a'], NOW)
  assert.equal(reordered.items.find((row) => row.id === 'pitem-b').sortOrder, 0)
  assert.equal(reordered.items.find((row) => row.id === 'pitem-a').sortOrder, 1)
})

test('delete packing item', () => {
  const category = addCategory([], {}, { id: 'pcat-1' })
  const created = addItem([], category.categories, {}, { id: 'pitem-1' })
  const deleted = deletePackingItem(created.items, 'pitem-1', JAMIE)
  assert.equal(deleted.ok, true)
  assert.equal(deleted.items.length, 0)
})

test('delete packing category cascades items', () => {
  const category = addCategory([], {}, { id: 'pcat-1' })
  const other = addCategory(category.categories, { name: 'Docs' }, { id: 'pcat-2' })
  const first = addItem([], other.categories, { categoryId: 'pcat-1' }, { id: 'pitem-1' })
  const second = addItem(first.items, other.categories, { categoryId: 'pcat-2', name: 'Passport' }, { id: 'pitem-2' })
  const deleted = deletePackingCategory(other.categories, second.items, 'pcat-1', JAMIE)
  assert.equal(deleted.ok, true)
  assert.equal(deleted.categories.some((row) => row.id === 'pcat-1'), false)
  assert.equal(deleted.items.some((row) => row.id === 'pitem-1'), false)
  assert.equal(deleted.items.some((row) => row.id === 'pitem-2'), true)
})

test('wrong-user packing category cannot be used', () => {
  const jamie = addCategory([], {}, { id: 'pcat-jamie' })
  const item = addItem([], jamie.categories, { userId: ALEX, categoryId: 'pcat-jamie' })
  assert.equal(item.item, null)
  assert.equal(updatePackingCategory(jamie.categories, 'pcat-jamie', ALEX, { name: 'Stolen' }, NOW).category, null)
  assert.equal(deletePackingCategory(jamie.categories, [], 'pcat-jamie', ALEX).ok, false)
})

test('wrong-trip packing category cannot be used', () => {
  const vienna = addCategory([], { tripId: VIENNA }, { id: 'pcat-vie' })
  const item = addItem([], vienna.categories, { tripId: TOKYO, categoryId: 'pcat-vie' })
  assert.equal(item.item, null)
})

test('four checklist phases are closed and invalid phase is rejected', () => {
  assert.deepEqual([...CHECKLIST_PHASE_IDS], ['before', 'packing', 'during', 'after'])
  assert.equal(CHECKLIST_PHASES.length, 4)
  assert.equal(isChecklistPhase('before'), true)
  assert.equal(isChecklistPhase('later'), false)
  const created = createChecklistCategory(
    [],
    { tripId: VIENNA, userId: JAMIE, phase: 'later', name: 'Errands' },
    { now: NOW },
  )
  assert.equal(created.category, null)
})

test('create and rename checklist category', () => {
  const created = createChecklistCategory(
    [],
    { tripId: VIENNA, userId: JAMIE, phase: 'before', name: 'Documents' },
    { now: NOW, id: 'ccat-1' },
  )
  assert.equal(created.category.phase, 'before')
  assert.equal(created.category.sortOrder, 0)
  const renamed = updateChecklistCategory(created.categories, 'ccat-1', JAMIE, { name: 'Travel papers' }, NOW)
  assert.equal(renamed.category.name, 'Travel papers')
  assert.equal(renamed.category.phase, 'before')
})

test('reorder checklist categories within a phase', () => {
  const first = createChecklistCategory(
    [],
    { tripId: VIENNA, userId: JAMIE, phase: 'before', name: 'A' },
    { now: NOW, id: 'ccat-a' },
  )
  const second = createChecklistCategory(
    first.categories,
    { tripId: VIENNA, userId: JAMIE, phase: 'before', name: 'B' },
    { now: NOW, id: 'ccat-b' },
  )
  const during = createChecklistCategory(
    second.categories,
    { tripId: VIENNA, userId: JAMIE, phase: 'during', name: 'C' },
    { now: NOW, id: 'ccat-c' },
  )
  const reordered = reorderChecklistCategories(during.categories, VIENNA, JAMIE, 'before', ['ccat-b', 'ccat-a'], NOW)
  assert.equal(reordered.categories.find((row) => row.id === 'ccat-b').sortOrder, 0)
  assert.equal(reordered.categories.find((row) => row.id === 'ccat-a').sortOrder, 1)
  assert.equal(reordered.categories.find((row) => row.id === 'ccat-c').sortOrder, 0)
})

test('create checklist item, toggle done, and update', () => {
  const category = createChecklistCategory(
    [],
    { tripId: VIENNA, userId: JAMIE, phase: 'before', name: 'Docs' },
    { now: NOW, id: 'ccat-1' },
  )
  const created = createChecklistItem(
    [],
    category.categories,
    { tripId: VIENNA, userId: JAMIE, categoryId: 'ccat-1', name: 'Print tickets' },
    { now: NOW, id: 'citem-1' },
  )
  assert.equal(created.item.done, false)
  assert.equal(created.item.dueDate, null)
  const toggled = toggleChecklistItemDone(created.items, 'citem-1', JAMIE, NOW)
  assert.equal(toggled.item.done, true)
  const updated = updateChecklistItem(
    toggled.items,
    category.categories,
    'citem-1',
    JAMIE,
    { name: 'Print boarding passes', note: 'Colour', dueDate: '2026-12-01' },
    NOW,
  )
  assert.equal(updated.item.name, 'Print boarding passes')
  assert.equal(updated.item.note, 'Colour')
  assert.equal(updated.item.dueDate, '2026-12-01')
})

test('checklist dueDate accepts YYYY-MM-DD and rejects invalid values', () => {
  const category = createChecklistCategory(
    [],
    { tripId: VIENNA, userId: JAMIE, phase: 'before', name: 'Docs' },
    { now: NOW, id: 'ccat-1' },
  )
  const valid = createChecklistItem(
    [],
    category.categories,
    { tripId: VIENNA, userId: JAMIE, categoryId: 'ccat-1', name: 'Visa', dueDate: '2026-11-01' },
    { now: NOW, id: 'citem-1' },
  )
  assert.equal(valid.item.dueDate, '2026-11-01')
  assert.equal(
    createChecklistItem(
      [],
      category.categories,
      { tripId: VIENNA, userId: JAMIE, categoryId: 'ccat-1', name: 'Visa', dueDate: '01-11-2026' },
      { now: NOW },
    ).item,
    null,
  )
  assert.equal(
    updateChecklistItem(valid.items, category.categories, 'citem-1', JAMIE, { dueDate: '2026-13-40' }, NOW).item,
    null,
  )
})

test('reorder and delete checklist items', () => {
  const category = createChecklistCategory(
    [],
    { tripId: VIENNA, userId: JAMIE, phase: 'during', name: 'Day of' },
    { now: NOW, id: 'ccat-1' },
  )
  const first = createChecklistItem(
    [],
    category.categories,
    { tripId: VIENNA, userId: JAMIE, categoryId: 'ccat-1', name: 'A' },
    { now: NOW, id: 'citem-a' },
  )
  const second = createChecklistItem(
    first.items,
    category.categories,
    { tripId: VIENNA, userId: JAMIE, categoryId: 'ccat-1', name: 'B' },
    { now: NOW, id: 'citem-b' },
  )
  const reordered = reorderChecklistItems(second.items, 'ccat-1', JAMIE, ['citem-b', 'citem-a'], NOW)
  assert.equal(reordered.items.find((row) => row.id === 'citem-b').sortOrder, 0)
  const deleted = deleteChecklistItem(reordered.items, 'citem-a', JAMIE)
  assert.equal(deleted.items.some((row) => row.id === 'citem-a'), false)
})

test('delete checklist category cascades items', () => {
  const first = createChecklistCategory(
    [],
    { tripId: VIENNA, userId: JAMIE, phase: 'after', name: 'Home' },
    { now: NOW, id: 'ccat-1' },
  )
  const second = createChecklistCategory(
    first.categories,
    { tripId: VIENNA, userId: JAMIE, phase: 'after', name: 'Laundry' },
    { now: NOW, id: 'ccat-2' },
  )
  const itemOne = createChecklistItem(
    [],
    second.categories,
    { tripId: VIENNA, userId: JAMIE, categoryId: 'ccat-1', name: 'Unpack' },
    { now: NOW, id: 'citem-1' },
  )
  const itemTwo = createChecklistItem(
    itemOne.items,
    second.categories,
    { tripId: VIENNA, userId: JAMIE, categoryId: 'ccat-2', name: 'Wash' },
    { now: NOW, id: 'citem-2' },
  )
  const deleted = deleteChecklistCategory(second.categories, itemTwo.items, 'ccat-1', JAMIE)
  assert.equal(deleted.items.some((row) => row.id === 'citem-1'), false)
  assert.equal(deleted.items.some((row) => row.id === 'citem-2'), true)
})

test('wrong-user and wrong-trip checklist category cannot be used', () => {
  const jamie = createChecklistCategory(
    [],
    { tripId: VIENNA, userId: JAMIE, phase: 'before', name: 'Docs' },
    { now: NOW, id: 'ccat-jamie' },
  )
  assert.equal(
    createChecklistItem(
      [],
      jamie.categories,
      { tripId: VIENNA, userId: ALEX, categoryId: 'ccat-jamie', name: 'Steal task' },
      { now: NOW },
    ).item,
    null,
  )
  assert.equal(
    createChecklistItem(
      [],
      jamie.categories,
      { tripId: TOKYO, userId: JAMIE, categoryId: 'ccat-jamie', name: 'Wrong trip' },
      { now: NOW },
    ).item,
    null,
  )
  assert.equal(deleteChecklistCategory(jamie.categories, [], 'ccat-jamie', ALEX).ok, false)
})

test('previewing another member does not expose the home user personal rows', () => {
  const jamieCat = addCategory([], { userId: JAMIE }, { id: 'pcat-jamie' })
  const both = addCategory(jamieCat.categories, { userId: ALEX, name: 'Alex bag' }, { id: 'pcat-alex' })
  const preview = personalRowsForUser(both.categories, ALEX)
  assert.deepEqual(
    preview.map((row) => row.id),
    ['pcat-alex'],
  )
  assert.equal(personalRowsForUser(both.categories, JAMIE).some((row) => row.id === 'pcat-alex'), false)
})

test('reload hydrates packing and checklist rows without changing V1 collections', () => {
  installStorage()
  const seed = createSeedSnapshot()
  const category = addCategory([], {}, { id: 'pcat-persist' })
  const item = addItem([], category.categories, { name: 'Charger' }, { id: 'pitem-persist' })
  const checkCat = createChecklistCategory(
    [],
    { tripId: VIENNA, userId: JAMIE, phase: 'packing', name: 'Bag' },
    { now: NOW, id: 'ccat-persist' },
  )
  const checkItem = createChecklistItem(
    [],
    checkCat.categories,
    { tripId: VIENNA, userId: JAMIE, categoryId: 'ccat-persist', name: 'Weigh bag' },
    { now: NOW, id: 'citem-persist' },
  )
  saveSnapshot({
    ...seed,
    packingCategories: category.categories,
    packingItems: item.items,
    checklistCategories: checkCat.categories,
    checklistItems: checkItem.items,
  })
  const loaded = loadSnapshot(createSeedSnapshot())
  assert.equal(STORAGE_KEY, 'travel-os:data:v1')
  assert.equal(loaded.packingCategories[0].id, 'pcat-persist')
  assert.equal(loaded.packingItems[0].name, 'Charger')
  assert.equal(loaded.checklistCategories[0].phase, 'packing')
  assert.equal(loaded.checklistItems[0].name, 'Weigh bag')
  assert.deepEqual(loaded.trips, seed.trips)
  assert.deepEqual(loaded.expenses, seed.expenses)
  assert.deepEqual(loaded.places, seed.places)
  assert.deepEqual(loaded.bookings, seed.bookings)
  assert.deepEqual(loaded.itineraries, seed.itineraries)
})

test('create note requires a trimmed body and allows optional title', () => {
  const created = createNote(
    [],
    { tripId: VIENNA, userId: JAMIE, title: ' Market ', body: '  Quiet street  ', date: null },
    { now: NOW, id: 'note-1' },
  )
  assert.equal(created.note.title, 'Market')
  assert.equal(created.note.body, 'Quiet street')
  assert.equal(created.note.date, null)
  assert.equal('pinned' in created.note, false)
  assert.equal(createNote([], { tripId: VIENNA, userId: JAMIE, body: '   ' }, { now: NOW }).note, null)
  assert.equal(createNote([], { tripId: VIENNA, userId: JAMIE }, { now: NOW }).note, null)
})

test('note date accepts YYYY-MM-DD and rejects invalid values', () => {
  const valid = createNote(
    [],
    { tripId: VIENNA, userId: JAMIE, body: 'Cafe', date: '2026-12-13' },
    { now: NOW, id: 'note-1' },
  )
  assert.equal(valid.note.date, '2026-12-13')
  assert.equal(
    createNote([], { tripId: VIENNA, userId: JAMIE, body: 'Cafe', date: '13-12-2026' }, { now: NOW }).note,
    null,
  )
  assert.equal(updateNote(valid.notes, 'note-1', JAMIE, { date: '2026-13-40' }, NOW).note, null)
})

test('update and delete note without changing id or userId', () => {
  const created = createNote(
    [],
    { tripId: VIENNA, userId: JAMIE, title: 'Cafe', body: 'First draft' },
    { now: NOW, id: 'note-1' },
  )
  const updated = updateNote(
    created.notes,
    'note-1',
    JAMIE,
    { title: 'Cafe Central', body: 'Second draft', date: '2026-12-14', id: 'hacked', userId: ALEX, tripId: TOKYO },
    NOW,
  )
  assert.equal(updated.note.id, 'note-1')
  assert.equal(updated.note.userId, JAMIE)
  assert.equal(updated.note.tripId, VIENNA)
  assert.equal(updated.note.body, 'Second draft')
  assert.equal(updated.note.date, '2026-12-14')
  const deleted = deleteNote(updated.notes, 'note-1', JAMIE)
  assert.equal(deleted.ok, true)
  assert.equal(deleted.notes.length, 0)
})

test('multiple notes on the same date are allowed and trip.notes is unchanged', () => {
  const seed = createSeedSnapshot()
  const tripNotes = seed.trips.find((trip) => trip.id === VIENNA).notes
  const first = createNote(
    [],
    { tripId: VIENNA, userId: JAMIE, body: 'Morning light', date: '2026-12-13' },
    { now: NOW, id: 'note-1' },
  )
  const second = createNote(
    first.notes,
    { tripId: VIENNA, userId: JAMIE, body: 'Evening market', date: '2026-12-13' },
    { now: NOW, id: 'note-2' },
  )
  assert.equal(second.notes.length, 2)
  assert.equal(second.notes.every((row) => row.date === '2026-12-13'), true)
  assert.equal(seed.trips.find((trip) => trip.id === VIENNA).notes, tripNotes)
})

test('notes persist and reject another user', () => {
  installStorage()
  const seed = createSeedSnapshot()
  const viennaNotes = seed.trips.find((trip) => trip.id === VIENNA).notes
  const created = createNote(
    [],
    { tripId: VIENNA, userId: JAMIE, title: 'Day one', body: 'Arrived late' },
    { now: NOW, id: 'note-persist' },
  )
  saveSnapshot({ ...seed, notes: created.notes })
  const loaded = loadSnapshot(createSeedSnapshot())
  assert.equal(loaded.notes[0].id, 'note-persist')
  assert.equal(loaded.notes[0].body, 'Arrived late')
  assert.equal(loaded.trips.find((trip) => trip.id === VIENNA).notes, viennaNotes)
  assert.equal(updateNote(created.notes, 'note-persist', ALEX, { body: 'Stolen' }, NOW).note, null)
  assert.equal(deleteNote(created.notes, 'note-persist', ALEX).ok, false)
  assert.equal(personalRowsForUser(created.notes, ALEX).length, 0)
})

test('create memory allows optional caption and valid date only', () => {
  const blank = createMemory([], { tripId: VIENNA, userId: JAMIE }, { now: NOW, id: 'mem-1' })
  assert.equal(blank.memory.caption, '')
  assert.equal(blank.memory.date, null)
  const dated = createMemory(
    [],
    { tripId: VIENNA, userId: JAMIE, caption: ' Snow ', date: '2026-12-13' },
    { now: NOW, id: 'mem-2' },
  )
  assert.equal(dated.memory.caption, 'Snow')
  assert.equal(dated.memory.date, '2026-12-13')
  assert.equal(
    createMemory([], { tripId: VIENNA, userId: JAMIE, date: '13 Dec 2026' }, { now: NOW }).memory,
    null,
  )
})

test('update and delete memory without changing id or userId', () => {
  const created = createMemory(
    [],
    { tripId: VIENNA, userId: JAMIE, caption: 'First' },
    { now: NOW, id: 'mem-1' },
  )
  const updated = updateMemory(
    created.memories,
    'mem-1',
    JAMIE,
    { caption: 'Second', date: '2026-12-15', id: 'hacked', userId: ALEX, src: 'blob:x' },
    NOW,
  )
  assert.equal(updated.memory.id, 'mem-1')
  assert.equal(updated.memory.userId, JAMIE)
  assert.equal(updated.memory.caption, 'Second')
  assert.equal(updated.memory.date, '2026-12-15')
  assert.equal(Object.hasOwn(updated.memory, 'src'), false)
  assert.equal(updateMemory(created.memories, 'mem-1', JAMIE, { date: 'nope' }, NOW).memory, null)
  const deleted = deleteMemory(updated.memories, 'mem-1', JAMIE)
  assert.equal(deleted.ok, true)
  assert.equal(deleted.memories.length, 0)
})

test('memories persist without File/Blob/objectURL/src/binary fields', () => {
  installStorage()
  const seed = createSeedSnapshot()
  const created = createMemory(
    [],
    {
      tripId: VIENNA,
      userId: JAMIE,
      caption: 'Quiet street',
      date: '2026-12-13',
      blob: { fake: true },
      src: 'blob:https://example.test/1',
      objectURL: 'blob:https://example.test/2',
      file: { name: 'photo.jpg' },
      arrayBuffer: new ArrayBuffer(8),
    },
    { now: NOW, id: 'mem-persist' },
  )
  assert.equal(Object.hasOwn(created.memory, 'blob'), false)
  assert.equal(Object.hasOwn(created.memory, 'src'), false)
  saveSnapshot({
    ...seed,
    memories: [
      {
        ...created.memory,
        blob: { fake: true },
        src: 'blob:https://example.test/1',
        objectURL: 'blob:https://example.test/2',
        file: { name: 'photo.jpg' },
      },
    ],
  })
  const raw = localStorage.getItem(STORAGE_KEY)
  const loaded = loadSnapshot(createSeedSnapshot())
  assert.equal(raw.includes('blob:'), false)
  assert.equal(loaded.memories[0].id, 'mem-persist')
  assert.equal(loaded.memories[0].caption, 'Quiet street')
  assert.equal(Object.hasOwn(loaded.memories[0], 'blob'), false)
  assert.equal(Object.hasOwn(loaded.memories[0], 'src'), false)
  assert.equal(Object.hasOwn(loaded.memories[0], 'objectURL'), false)
  assert.equal(Object.hasOwn(loaded.memories[0], 'file'), false)
  assert.equal(updateMemory(created.memories, 'mem-persist', ALEX, { caption: 'Stolen' }, NOW).memory, null)
  assert.equal(deleteMemory(created.memories, 'mem-persist', ALEX).ok, false)
  assert.equal(personalRowsForUser(created.memories, ALEX).length, 0)
})

test('deleting a trip removes its notes and memories only', () => {
  const viennaNote = createNote(
    [],
    { tripId: VIENNA, userId: JAMIE, body: 'Vienna note' },
    { now: NOW, id: 'note-vie' },
  )
  const bothNotes = createNote(
    viennaNote.notes,
    { tripId: TOKYO, userId: JAMIE, body: 'Tokyo note' },
    { now: NOW, id: 'note-tyo' },
  )
  const viennaMemory = createMemory(
    [],
    { tripId: VIENNA, userId: JAMIE, caption: 'Vienna snow' },
    { now: NOW, id: 'mem-vie' },
  )
  const bothMemories = createMemory(
    viennaMemory.memories,
    { tripId: TOKYO, userId: JAMIE, caption: 'Tokyo bloom' },
    { now: NOW, id: 'mem-tyo' },
  )
  const notes = removePersonalRowsForTrip(bothNotes.notes, VIENNA)
  const memories = removePersonalRowsForTrip(bothMemories.memories, VIENNA)
  assert.deepEqual(
    notes.map((row) => row.id),
    ['note-tyo'],
  )
  assert.deepEqual(
    memories.map((row) => row.id),
    ['mem-tyo'],
  )
})

test('first open seeds exactly the six default packing categories', () => {
  const result = seedDefaultPackingCategories([], VIENNA, JAMIE, { now: NOW })
  assert.equal(result.seeded, true)
  const scoped = packingRowsForTripUser(result.categories, VIENNA, JAMIE)
  assert.deepEqual(
    sortByPackingOrder(scoped).map((row) => row.name),
    [...DEFAULT_PACKING_CATEGORY_NAMES],
  )
  assert.deepEqual(
    scoped.map((row) => row.sortOrder),
    [0, 1, 2, 3, 4, 5],
  )
  assert.ok(scoped.every((row) => row.userId === JAMIE && row.tripId === VIENNA))
})

test('re-opening packing does not duplicate seeded categories', () => {
  const first = seedDefaultPackingCategories([], VIENNA, JAMIE, { now: NOW })
  const second = seedDefaultPackingCategories(first.categories, VIENNA, JAMIE, { now: NOW })
  assert.equal(second.seeded, false)
  assert.equal(packingRowsForTripUser(second.categories, VIENNA, JAMIE).length, 6)
  assert.equal(second.categories, first.categories)
})

test('custom packing category remains and blocks a second seed', () => {
  const custom = createPackingCategory([], { tripId: VIENNA, userId: JAMIE, name: 'Ski gear' }, { now: NOW, id: 'pcat-custom' })
  const seeded = seedDefaultPackingCategories(custom.categories, VIENNA, JAMIE, { now: NOW })
  assert.equal(seeded.seeded, false)
  assert.deepEqual(
    packingRowsForTripUser(seeded.categories, VIENNA, JAMIE).map((row) => row.name),
    ['Ski gear'],
  )
  const afterSeed = seedDefaultPackingCategories([], VIENNA, JAMIE, { now: NOW })
  const withCustom = createPackingCategory(
    afterSeed.categories,
    { tripId: VIENNA, userId: JAMIE, name: 'Ski gear' },
    { now: NOW, id: 'pcat-custom' },
  )
  const again = seedDefaultPackingCategories(withCustom.categories, VIENNA, JAMIE, { now: NOW })
  assert.equal(again.seeded, false)
  assert.equal(packingRowsForTripUser(again.categories, VIENNA, JAMIE).some((row) => row.id === 'pcat-custom'), true)
  assert.equal(packingRowsForTripUser(again.categories, VIENNA, JAMIE).length, 7)
})

test('packing category order follows sortOrder', () => {
  const seeded = seedDefaultPackingCategories([], VIENNA, JAMIE, { now: NOW })
  const ids = sortByPackingOrder(seeded.categories).map((row) => row.id)
  const reordered = reorderPackingCategories(seeded.categories, VIENNA, JAMIE, [ids[1], ids[0], ...ids.slice(2)], NOW)
  assert.equal(sortByPackingOrder(reordered.categories)[0].name, 'Toiletries')
  assert.equal(sortByPackingOrder(reordered.categories)[1].name, 'Clothing')
})

test('category collapse state toggles without touching packing records', () => {
  const collapsed = toggleCollapsedIds([], 'pcat-1')
  assert.deepEqual(collapsed, ['pcat-1'])
  assert.deepEqual(toggleCollapsedIds(collapsed, 'pcat-1'), [])
  const seeded = seedDefaultPackingCategories([], VIENNA, JAMIE, { now: NOW })
  toggleCollapsedIds([], seeded.categories[0].id)
  assert.equal(seeded.categories.length, 6)
})

test('add packing category uses the existing create API', () => {
  const seeded = seedDefaultPackingCategories([], VIENNA, JAMIE, { now: NOW })
  const added = createPackingCategory(
    seeded.categories,
    { tripId: VIENNA, userId: JAMIE, name: '  Day bag  ' },
    { now: NOW, id: 'pcat-day' },
  )
  assert.equal(added.category.name, 'Day bag')
  assert.equal(added.category.sortOrder, 6)
  assert.equal(createPackingCategory(seeded.categories, { tripId: VIENNA, userId: JAMIE, name: '   ' }, { now: NOW }).category, null)
})

test('delete packing category with items uses cascade confirmation path', () => {
  const seeded = seedDefaultPackingCategories([], VIENNA, JAMIE, { now: NOW })
  const clothing = sortByPackingOrder(seeded.categories)[0]
  const created = createPackingItem(
    [],
    seeded.categories,
    { tripId: VIENNA, userId: JAMIE, categoryId: clothing.id, name: 'Coat' },
    { now: NOW, id: 'pitem-coat' },
  )
  assert.equal(created.items.length > 0, true)
  const deleted = deletePackingCategory(seeded.categories, created.items, clothing.id, JAMIE)
  assert.equal(deleted.ok, true)
  assert.equal(deleted.categories.some((row) => row.id === clothing.id), false)
  assert.equal(deleted.items.some((row) => row.categoryId === clothing.id), false)
  assert.equal(deleted.categories.length, 5)
})

test('add packing item defaults quantity to 1 and packed to false', () => {
  const seeded = seedDefaultPackingCategories([], VIENNA, JAMIE, { now: NOW })
  const clothing = sortByPackingOrder(seeded.categories)[0]
  const created = createPackingItem(
    [],
    seeded.categories,
    { tripId: VIENNA, userId: JAMIE, categoryId: clothing.id, name: 'T-shirts' },
    { now: NOW, id: 'pitem-tee' },
  )
  assert.equal(created.item.quantity, 1)
  assert.equal(created.item.packed, false)
  assert.equal(created.item.categoryId, clothing.id)
})

test('invalid packing quantity is rejected from the existing parser', () => {
  assert.equal(parseQuantity(1), 1)
  assert.equal(parseQuantity(0), null)
  assert.equal(parseQuantity(1.5), null)
  assert.equal(parseQuantity(Number.parseInt('0', 10)), null)
  const seeded = seedDefaultPackingCategories([], VIENNA, JAMIE, { now: NOW })
  const clothing = sortByPackingOrder(seeded.categories)[0]
  assert.equal(
    createPackingItem([], seeded.categories, {
      tripId: VIENNA,
      userId: JAMIE,
      categoryId: clothing.id,
      name: 'Bad',
      quantity: 0,
    }).item,
    null,
  )
})

test('toggle packed updates derived progress', () => {
  const seeded = seedDefaultPackingCategories([], VIENNA, JAMIE, { now: NOW })
  const clothing = sortByPackingOrder(seeded.categories)[0]
  const first = createPackingItem(
    [],
    seeded.categories,
    { tripId: VIENNA, userId: JAMIE, categoryId: clothing.id, name: 'Socks' },
    { now: NOW, id: 'pitem-a' },
  )
  const second = createPackingItem(
    first.items,
    seeded.categories,
    { tripId: VIENNA, userId: JAMIE, categoryId: clothing.id, name: 'Charger' },
    { now: NOW, id: 'pitem-b' },
  )
  assert.deepEqual(packingProgress(second.items), { packed: 0, total: 2 })
  const toggled = togglePackingItemPacked(second.items, 'pitem-b', JAMIE, NOW)
  assert.equal(toggled.item.packed, true)
  assert.deepEqual(packingProgress(toggled.items), { packed: 1, total: 2 })
})

test('edit packing item keeps identity and category', () => {
  const seeded = seedDefaultPackingCategories([], VIENNA, JAMIE, { now: NOW })
  const clothing = sortByPackingOrder(seeded.categories)[0]
  const created = createPackingItem(
    [],
    seeded.categories,
    { tripId: VIENNA, userId: JAMIE, categoryId: clothing.id, name: 'Socks' },
    { now: NOW, id: 'pitem-1' },
  )
  const updated = updatePackingItem(
    created.items,
    seeded.categories,
    'pitem-1',
    JAMIE,
    { name: 'Wool socks', quantity: 3, note: 'Two pairs' },
    NOW,
  )
  assert.equal(updated.item.id, 'pitem-1')
  assert.equal(updated.item.categoryId, clothing.id)
  assert.equal(updated.item.name, 'Wool socks')
  assert.equal(updated.item.quantity, 3)
  assert.equal(updated.item.note, 'Two pairs')
})

test('delete packing item leaves the category', () => {
  const seeded = seedDefaultPackingCategories([], VIENNA, JAMIE, { now: NOW })
  const clothing = sortByPackingOrder(seeded.categories)[0]
  const created = createPackingItem(
    [],
    seeded.categories,
    { tripId: VIENNA, userId: JAMIE, categoryId: clothing.id, name: 'Socks' },
    { now: NOW, id: 'pitem-1' },
  )
  const deleted = deletePackingItem(created.items, 'pitem-1', JAMIE)
  assert.equal(deleted.ok, true)
  assert.equal(deleted.items.length, 0)
  assert.equal(seeded.categories.length, 6)
})

test('packing category reorder uses moveIdInOrder then existing reorder API', () => {
  const seeded = seedDefaultPackingCategories([], VIENNA, JAMIE, { now: NOW })
  const ids = sortByPackingOrder(seeded.categories).map((row) => row.id)
  const moved = moveIdInOrder(ids, ids[0], 1)
  const reordered = reorderPackingCategories(seeded.categories, VIENNA, JAMIE, moved, NOW)
  assert.equal(sortByPackingOrder(reordered.categories)[0].name, 'Toiletries')
  assert.equal(sortByPackingOrder(reordered.categories)[1].name, 'Clothing')
  assert.deepEqual(moveIdInOrder(ids, ids[0], -1), ids)
})

test('packing item reorder stays inside its category', () => {
  const seeded = seedDefaultPackingCategories([], VIENNA, JAMIE, { now: NOW })
  const clothing = sortByPackingOrder(seeded.categories)[0]
  const docs = sortByPackingOrder(seeded.categories)[4]
  const first = createPackingItem(
    [],
    seeded.categories,
    { tripId: VIENNA, userId: JAMIE, categoryId: clothing.id, name: 'A' },
    { now: NOW, id: 'pitem-a' },
  )
  const second = createPackingItem(
    first.items,
    seeded.categories,
    { tripId: VIENNA, userId: JAMIE, categoryId: clothing.id, name: 'B' },
    { now: NOW, id: 'pitem-b' },
  )
  const other = createPackingItem(
    second.items,
    seeded.categories,
    { tripId: VIENNA, userId: JAMIE, categoryId: docs.id, name: 'Passport' },
    { now: NOW, id: 'pitem-pass' },
  )
  const moved = moveIdInOrder(['pitem-a', 'pitem-b'], 'pitem-b', -1)
  const reordered = reorderPackingItems(other.items, clothing.id, JAMIE, moved, NOW)
  const clothingItems = sortByPackingOrder(reordered.items.filter((row) => row.categoryId === clothing.id))
  assert.equal(clothingItems[0].id, 'pitem-b')
  assert.equal(clothingItems[1].id, 'pitem-a')
  assert.equal(reordered.items.find((row) => row.id === 'pitem-pass').categoryId, docs.id)
})

test('packing progress is derived from items and zero-item state is 0 / 0', () => {
  assert.deepEqual(packingProgress([]), { packed: 0, total: 0 })
  assert.equal(packingPercent([]), 0)
  const seeded = seedDefaultPackingCategories([], VIENNA, JAMIE, { now: NOW })
  const tripItems = packingRowsForTripUser([], VIENNA, JAMIE)
  assert.deepEqual(packingProgress(tripItems), { packed: 0, total: 0 })
  const clothing = sortByPackingOrder(seeded.categories)[0]
  const created = createPackingItem(
    [],
    seeded.categories,
    { tripId: VIENNA, userId: JAMIE, categoryId: clothing.id, name: 'Coat', quantity: 1 },
    { now: NOW, id: 'pitem-1' },
  )
  assert.deepEqual(packingProgress(created.items), { packed: 0, total: 1 })
  assert.equal(packingPercent(created.items), 0)
})

test('category progress uses only that category items', () => {
  const seeded = seedDefaultPackingCategories([], VIENNA, JAMIE, { now: NOW })
  const clothing = sortByPackingOrder(seeded.categories)[0]
  const electronics = sortByPackingOrder(seeded.categories)[2]
  const first = createPackingItem(
    [],
    seeded.categories,
    { tripId: VIENNA, userId: JAMIE, categoryId: clothing.id, name: 'T-shirts' },
    { now: NOW, id: 'pitem-tee' },
  )
  const second = createPackingItem(
    first.items,
    seeded.categories,
    { tripId: VIENNA, userId: JAMIE, categoryId: clothing.id, name: 'Jacket' },
    { now: NOW, id: 'pitem-jacket' },
  )
  const third = createPackingItem(
    second.items,
    seeded.categories,
    { tripId: VIENNA, userId: JAMIE, categoryId: electronics.id, name: 'Charger' },
    { now: NOW, id: 'pitem-charger' },
  )
  const packed = togglePackingItemPacked(third.items, 'pitem-tee', JAMIE, NOW)
  assert.deepEqual(packingCategoryProgress(packed.items, clothing.id), { packed: 1, total: 2 })
  assert.deepEqual(packingCategoryProgress(packed.items, electronics.id), { packed: 0, total: 1 })
  assert.deepEqual(packingProgress(packed.items), { packed: 1, total: 3 })
  assert.equal(packingPercent(packed.items), 33)
})

test('different trip does not show previous trip packing items', () => {
  const vienna = seedDefaultPackingCategories([], VIENNA, JAMIE, { now: NOW })
  const clothing = sortByPackingOrder(vienna.categories)[0]
  const withItem = createPackingItem(
    [],
    vienna.categories,
    { tripId: VIENNA, userId: JAMIE, categoryId: clothing.id, name: 'Coat' },
    { now: NOW, id: 'pitem-vie' },
  )
  const tokyo = seedDefaultPackingCategories(vienna.categories, TOKYO, JAMIE, { now: NOW })
  assert.equal(packingRowsForTripUser(tokyo.categories, TOKYO, JAMIE).length, 6)
  assert.equal(packingRowsForTripUser(withItem.items, TOKYO, JAMIE).length, 0)
  assert.equal(packingRowsForTripUser(withItem.items, VIENNA, JAMIE)[0].id, 'pitem-vie')
})

test('different user does not see another user packing items', () => {
  const jamie = seedDefaultPackingCategories([], VIENNA, JAMIE, { now: NOW })
  const clothing = sortByPackingOrder(jamie.categories)[0]
  const withItem = createPackingItem(
    [],
    jamie.categories,
    { tripId: VIENNA, userId: JAMIE, categoryId: clothing.id, name: 'Coat' },
    { now: NOW, id: 'pitem-jamie' },
  )
  const alex = seedDefaultPackingCategories(jamie.categories, VIENNA, ALEX, { now: NOW })
  assert.equal(packingRowsForTripUser(alex.categories, VIENNA, ALEX).length, 6)
  assert.equal(packingRowsForTripUser(alex.categories, VIENNA, JAMIE).length, 6)
  assert.equal(packingRowsForTripUser(withItem.items, VIENNA, ALEX).length, 0)
  assert.equal(personalRowsForUser(withItem.items, ALEX).length, 0)
  assert.equal(createPackingItem(withItem.items, jamie.categories, {
    tripId: VIENNA,
    userId: ALEX,
    categoryId: clothing.id,
    name: 'Stolen',
  }).item, null)
})

function checklistNames(categories, phase, tripId = VIENNA, userId = JAMIE) {
  return sortByChecklistOrder(
    checklistRowsForTripUser(categories, tripId, userId).filter((row) => row.phase === phase),
  ).map((row) => row.name)
}

test('first open seeds the intended checklist categories per phase', () => {
  const result = seedDefaultChecklistCategories([], VIENNA, JAMIE, { now: NOW })
  assert.equal(result.seeded, true)
  assert.deepEqual(checklistNames(result.categories, 'before'), [...DEFAULT_CHECKLIST_CATEGORIES_BY_PHASE.before])
  assert.deepEqual(checklistNames(result.categories, 'packing'), [...DEFAULT_CHECKLIST_CATEGORIES_BY_PHASE.packing])
  assert.deepEqual(checklistNames(result.categories, 'during'), [...DEFAULT_CHECKLIST_CATEGORIES_BY_PHASE.during])
  assert.deepEqual(checklistNames(result.categories, 'after'), [...DEFAULT_CHECKLIST_CATEGORIES_BY_PHASE.after])
  assert.equal(checklistRowsForTripUser(result.categories, VIENNA, JAMIE).length, 9)
})

test('exactly four checklist phases are shown and cannot be mutated', () => {
  assert.equal(CHECKLIST_PHASES.length, 4)
  assert.deepEqual(
    CHECKLIST_PHASES.map((phase) => [phase.id, phase.label]),
    [
      ['before', 'Before Trip'],
      ['packing', 'Packing'],
      ['during', 'During Trip'],
      ['after', 'After Trip'],
    ],
  )
  assert.equal(Object.isFrozen(CHECKLIST_PHASES), true)
  assert.equal(Object.isFrozen(CHECKLIST_PHASE_IDS), true)
  assert.equal(isChecklistPhase('later'), false)
  const seeded = seedDefaultChecklistCategories([], VIENNA, JAMIE, { now: NOW })
  const docs = seeded.categories.find((row) => row.name === 'Documents')
  const renamed = updateChecklistCategory(seeded.categories, docs.id, JAMIE, { name: 'Papers', phase: 'after' }, NOW)
  assert.equal(renamed.category.phase, 'before')
  assert.equal(reorderChecklistCategories(seeded.categories, VIENNA, JAMIE, 'later', [docs.id], NOW).ok, false)
  assert.equal(createChecklistCategory([], { tripId: VIENNA, userId: JAMIE, phase: 'later', name: 'Nope' }, { now: NOW }).category, null)
})

test('re-opening checklist does not duplicate seeded categories', () => {
  const first = seedDefaultChecklistCategories([], VIENNA, JAMIE, { now: NOW })
  const second = seedDefaultChecklistCategories(first.categories, VIENNA, JAMIE, { now: NOW })
  assert.equal(second.seeded, false)
  assert.equal(checklistRowsForTripUser(second.categories, VIENNA, JAMIE).length, 9)
})

test('existing custom checklist categories remain and skip that phase seed', () => {
  const custom = createChecklistCategory(
    [],
    { tripId: VIENNA, userId: JAMIE, phase: 'before', name: 'My papers' },
    { now: NOW, id: 'ccat-custom' },
  )
  const seeded = seedDefaultChecklistCategories(custom.categories, VIENNA, JAMIE, { now: NOW })
  assert.equal(seeded.seeded, true)
  assert.deepEqual(checklistNames(seeded.categories, 'before'), ['My papers'])
  assert.deepEqual(checklistNames(seeded.categories, 'packing'), ['Preparation'])
  assert.equal(seeded.categories.some((row) => row.id === 'ccat-custom'), true)
})

test('checklist category sortOrder works within a phase', () => {
  const seeded = seedDefaultChecklistCategories([], VIENNA, JAMIE, { now: NOW })
  const before = sortByChecklistOrder(seeded.categories.filter((row) => row.phase === 'before'))
  const moved = moveIdInOrder(
    before.map((row) => row.id),
    before[0].id,
    1,
  )
  const reordered = reorderChecklistCategories(seeded.categories, VIENNA, JAMIE, 'before', moved, NOW)
  assert.equal(sortByChecklistOrder(reordered.categories.filter((row) => row.phase === 'before'))[0].name, 'Money & Payments')
  assert.equal(sortByChecklistOrder(reordered.categories.filter((row) => row.phase === 'packing'))[0].name, 'Preparation')
})

test('add checklist category uses the existing API for the current phase', () => {
  const seeded = seedDefaultChecklistCategories([], VIENNA, JAMIE, { now: NOW })
  const added = createChecklistCategory(
    seeded.categories,
    { tripId: VIENNA, userId: JAMIE, phase: 'during', name: '  Evening  ' },
    { now: NOW, id: 'ccat-eve' },
  )
  assert.equal(added.category.name, 'Evening')
  assert.equal(added.category.phase, 'during')
  assert.equal(createChecklistCategory(seeded.categories, { tripId: VIENNA, userId: JAMIE, phase: 'during', name: '  ' }, { now: NOW }).category, null)
})

test('delete checklist category cascade removes its items', () => {
  const seeded = seedDefaultChecklistCategories([], VIENNA, JAMIE, { now: NOW })
  const docs = seeded.categories.find((row) => row.name === 'Documents')
  const created = createChecklistItem(
    [],
    seeded.categories,
    { tripId: VIENNA, userId: JAMIE, categoryId: docs.id, name: 'Check passport' },
    { now: NOW, id: 'citem-pass' },
  )
  const deleted = deleteChecklistCategory(seeded.categories, created.items, docs.id, JAMIE)
  assert.equal(deleted.ok, true)
  assert.equal(deleted.categories.some((row) => row.id === docs.id), false)
  assert.equal(deleted.items.some((row) => row.categoryId === docs.id), false)
})

test('add checklist item defaults done false and dueDate null', () => {
  const seeded = seedDefaultChecklistCategories([], VIENNA, JAMIE, { now: NOW })
  const docs = seeded.categories.find((row) => row.name === 'Documents')
  const created = createChecklistItem(
    [],
    seeded.categories,
    { tripId: VIENNA, userId: JAMIE, categoryId: docs.id, name: 'Check passport' },
    { now: NOW, id: 'citem-1' },
  )
  assert.equal(created.item.done, false)
  assert.equal(created.item.dueDate, null)
  assert.equal(created.item.categoryId, docs.id)
})

test('toggle checklist done and edit item', () => {
  const seeded = seedDefaultChecklistCategories([], VIENNA, JAMIE, { now: NOW })
  const docs = seeded.categories.find((row) => row.name === 'Documents')
  const created = createChecklistItem(
    [],
    seeded.categories,
    { tripId: VIENNA, userId: JAMIE, categoryId: docs.id, name: 'Check passport' },
    { now: NOW, id: 'citem-1' },
  )
  const toggled = toggleChecklistItemDone(created.items, 'citem-1', JAMIE, NOW)
  assert.equal(toggled.item.done, true)
  const updated = updateChecklistItem(
    toggled.items,
    seeded.categories,
    'citem-1',
    JAMIE,
    { name: 'Renew passport', note: 'Photo booth', dueDate: '2026-12-01' },
    NOW,
  )
  assert.equal(updated.item.id, 'citem-1')
  assert.equal(updated.item.name, 'Renew passport')
  assert.equal(updated.item.note, 'Photo booth')
  assert.equal(updated.item.dueDate, '2026-12-01')
  assert.equal(updated.item.done, true)
  assert.equal(updated.item.categoryId, docs.id)
})

test('invalid checklist name is rejected and dueDate must be YYYY-MM-DD or null', () => {
  const seeded = seedDefaultChecklistCategories([], VIENNA, JAMIE, { now: NOW })
  const docs = seeded.categories.find((row) => row.name === 'Documents')
  assert.equal(
    createChecklistItem([], seeded.categories, {
      tripId: VIENNA,
      userId: JAMIE,
      categoryId: docs.id,
      name: '   ',
    }).item,
    null,
  )
  assert.equal(isIsoDate('2026-12-01'), true)
  assert.equal(isIsoDate('01-12-2026'), false)
  assert.equal(
    createChecklistItem([], seeded.categories, {
      tripId: VIENNA,
      userId: JAMIE,
      categoryId: docs.id,
      name: 'Visa',
      dueDate: '12/01/2026',
    }).item,
    null,
  )
  const valid = createChecklistItem(
    [],
    seeded.categories,
    { tripId: VIENNA, userId: JAMIE, categoryId: docs.id, name: 'Visa', dueDate: '2026-12-01' },
    { now: NOW, id: 'citem-visa' },
  )
  assert.equal(valid.item.dueDate, '2026-12-01')
  const cleared = updateChecklistItem(valid.items, seeded.categories, 'citem-visa', JAMIE, { dueDate: null }, NOW)
  assert.equal(cleared.item.dueDate, null)
})

test('reorder checklist items stays inside the category', () => {
  const seeded = seedDefaultChecklistCategories([], VIENNA, JAMIE, { now: NOW })
  const docs = seeded.categories.find((row) => row.name === 'Documents')
  const first = createChecklistItem(
    [],
    seeded.categories,
    { tripId: VIENNA, userId: JAMIE, categoryId: docs.id, name: 'A' },
    { now: NOW, id: 'citem-a' },
  )
  const second = createChecklistItem(
    first.items,
    seeded.categories,
    { tripId: VIENNA, userId: JAMIE, categoryId: docs.id, name: 'B' },
    { now: NOW, id: 'citem-b' },
  )
  const moved = moveIdInOrder(['citem-a', 'citem-b'], 'citem-b', -1)
  const reordered = reorderChecklistItems(second.items, docs.id, JAMIE, moved, NOW)
  const scoped = sortByChecklistOrder(reordered.items.filter((row) => row.categoryId === docs.id))
  assert.equal(scoped[0].id, 'citem-b')
  assert.equal(scoped[1].id, 'citem-a')
})

test('phase and overall checklist progress are derived including zero items', () => {
  const seeded = seedDefaultChecklistCategories([], VIENNA, JAMIE, { now: NOW })
  const items = []
  assert.deepEqual(checklistProgress(items), { done: 0, total: 0 })
  assert.deepEqual(checklistPhaseProgress(seeded.categories, items, 'before'), { done: 0, total: 0 })
  const docs = seeded.categories.find((row) => row.name === 'Documents')
  const prep = seeded.categories.find((row) => row.phase === 'packing')
  const first = createChecklistItem(
    [],
    seeded.categories,
    { tripId: VIENNA, userId: JAMIE, categoryId: docs.id, name: 'Passport' },
    { now: NOW, id: 'citem-1' },
  )
  const second = createChecklistItem(
    first.items,
    seeded.categories,
    { tripId: VIENNA, userId: JAMIE, categoryId: prep.id, name: 'Weigh bag' },
    { now: NOW, id: 'citem-2' },
  )
  const toggled = toggleChecklistItemDone(second.items, 'citem-1', JAMIE, NOW)
  assert.deepEqual(checklistProgress(toggled.items), { done: 1, total: 2 })
  assert.deepEqual(checklistPhaseProgress(seeded.categories, toggled.items, 'before'), { done: 1, total: 1 })
  assert.deepEqual(checklistPhaseProgress(seeded.categories, toggled.items, 'packing'), { done: 0, total: 1 })
  assert.deepEqual(checklistCategoryProgress(toggled.items, docs.id), { done: 1, total: 1 })
  assert.deepEqual(checklistCategoryProgress(toggled.items, prep.id), { done: 0, total: 1 })
})

test('wrong-user and wrong-trip checklist isolation', () => {
  const jamie = seedDefaultChecklistCategories([], VIENNA, JAMIE, { now: NOW })
  const docs = jamie.categories.find((row) => row.name === 'Documents')
  const withItem = createChecklistItem(
    [],
    jamie.categories,
    { tripId: VIENNA, userId: JAMIE, categoryId: docs.id, name: 'Passport' },
    { now: NOW, id: 'citem-jamie' },
  )
  const tokyo = seedDefaultChecklistCategories(jamie.categories, TOKYO, JAMIE, { now: NOW })
  assert.equal(checklistRowsForTripUser(tokyo.categories, TOKYO, JAMIE).length, 9)
  assert.equal(checklistRowsForTripUser(withItem.items, TOKYO, JAMIE).length, 0)
  const alex = seedDefaultChecklistCategories(jamie.categories, VIENNA, ALEX, { now: NOW })
  assert.equal(checklistRowsForTripUser(alex.categories, VIENNA, ALEX).length, 9)
  assert.equal(checklistRowsForTripUser(withItem.items, VIENNA, ALEX).length, 0)
  assert.equal(
    createChecklistItem(withItem.items, jamie.categories, {
      tripId: VIENNA,
      userId: ALEX,
      categoryId: docs.id,
      name: 'Stolen',
    }).item,
    null,
  )
})

test('checklist completion does not change packing packed state', () => {
  const packing = seedDefaultPackingCategories([], VIENNA, JAMIE, { now: NOW })
  const clothing = sortByPackingOrder(packing.categories)[0]
  const packed = createPackingItem(
    [],
    packing.categories,
    { tripId: VIENNA, userId: JAMIE, categoryId: clothing.id, name: 'Coat' },
    { now: NOW, id: 'pitem-coat' },
  )
  assert.deepEqual(packingProgress(packed.items), { packed: 0, total: 1 })
  const checklist = seedDefaultChecklistCategories([], VIENNA, JAMIE, { now: NOW })
  const docs = checklist.categories.find((row) => row.name === 'Documents')
  const created = createChecklistItem(
    [],
    checklist.categories,
    { tripId: VIENNA, userId: JAMIE, categoryId: docs.id, name: 'Check passport' },
    { now: NOW, id: 'citem-1' },
  )
  const toggled = toggleChecklistItemDone(created.items, 'citem-1', JAMIE, NOW)
  assert.equal(toggled.item.done, true)
  assert.deepEqual(packingProgress(packed.items), { packed: 0, total: 1 })
  assert.equal(packed.items[0].packed, false)
  const stillPacked = togglePackingItemPacked(packed.items, 'pitem-coat', JAMIE, NOW)
  assert.equal(stillPacked.item.packed, true)
  assert.equal(toggled.items[0].done, true)
})

test('notes list is empty for a trip with no personal notes', () => {
  assert.deepEqual(notesForTripUser([], VIENNA, JAMIE), [])
  assert.deepEqual(groupNotesByDate([]), [])
})

test('add note with optional title and required body', () => {
  const created = createNote(
    [],
    { tripId: VIENNA, userId: JAMIE, title: '  Cafe  ', body: '  Quiet street  ' },
    { now: NOW, id: 'note-ui-1' },
  )
  assert.equal(created.note.title, 'Cafe')
  assert.equal(created.note.body, 'Quiet street')
  assert.equal(created.note.date, null)
  assert.equal(notesForTripUser(created.notes, VIENNA, JAMIE).length, 1)
})

test('notes reject an empty body and keep optional date null or YYYY-MM-DD', () => {
  assert.equal(createNote([], { tripId: VIENNA, userId: JAMIE, title: 'Nope', body: '   ' }, { now: NOW }).note, null)
  const dated = createNote(
    [],
    { tripId: VIENNA, userId: JAMIE, body: 'Markets', date: '2026-12-13' },
    { now: NOW, id: 'note-date' },
  )
  assert.equal(dated.note.date, '2026-12-13')
  assert.equal(
    createNote([], { tripId: VIENNA, userId: JAMIE, body: 'Markets', date: '13/12/2026' }, { now: NOW }).note,
    null,
  )
})

test('edit note and delete note through existing APIs', () => {
  const created = createNote(
    [],
    { tripId: VIENNA, userId: JAMIE, title: 'Draft', body: 'First' },
    { now: NOW, id: 'note-edit' },
  )
  const updated = updateNote(created.notes, 'note-edit', JAMIE, { title: 'Final', body: 'Second', date: '2026-12-14' }, NOW)
  assert.equal(updated.note.title, 'Final')
  assert.equal(updated.note.body, 'Second')
  assert.equal(updated.note.date, '2026-12-14')
  const deleted = deleteNote(updated.notes, 'note-edit', JAMIE)
  assert.equal(deleted.ok, true)
  assert.equal(notesForTripUser(deleted.notes, VIENNA, JAMIE).length, 0)
})

test('notes are isolated by trip and user, including trip switches', () => {
  const vienna = createNote(
    [],
    { tripId: VIENNA, userId: JAMIE, body: 'Vienna only' },
    { now: NOW, id: 'note-vie' },
  )
  const both = createNote(
    vienna.notes,
    { tripId: TOKYO, userId: JAMIE, body: 'Tokyo only' },
    { now: NOW, id: 'note-tyo' },
  )
  const alex = createNote(
    both.notes,
    { tripId: VIENNA, userId: ALEX, body: 'Alex only' },
    { now: NOW, id: 'note-alex' },
  )
  assert.deepEqual(notesForTripUser(alex.notes, VIENNA, JAMIE).map((row) => row.id), ['note-vie'])
  assert.deepEqual(notesForTripUser(alex.notes, TOKYO, JAMIE).map((row) => row.id), ['note-tyo'])
  assert.deepEqual(notesForTripUser(alex.notes, VIENNA, ALEX).map((row) => row.id), ['note-alex'])
  assert.equal(personalRowsForUser(alex.notes, ALEX).every((row) => row.userId === ALEX), true)
})

test('multiple notes on the same date sort together without affecting packing or checklist', () => {
  const packing = seedDefaultPackingCategories([], VIENNA, JAMIE, { now: NOW })
  const clothing = sortByPackingOrder(packing.categories)[0]
  const packed = createPackingItem(
    [],
    packing.categories,
    { tripId: VIENNA, userId: JAMIE, categoryId: clothing.id, name: 'Coat' },
    { now: NOW, id: 'pitem-notes' },
  )
  const checklist = seedDefaultChecklistCategories([], VIENNA, JAMIE, { now: NOW })
  const first = createNote(
    [],
    { tripId: VIENNA, userId: JAMIE, body: 'Morning', date: '2026-12-13' },
    { now: '2026-09-17T15:00:00.000Z', id: 'note-am' },
  )
  const second = createNote(
    first.notes,
    { tripId: VIENNA, userId: JAMIE, body: 'Evening', date: '2026-12-13' },
    { now: '2026-09-17T16:00:00.000Z', id: 'note-pm' },
  )
  const undated = createNote(
    second.notes,
    { tripId: VIENNA, userId: JAMIE, body: 'Later' },
    { now: '2026-09-17T17:00:00.000Z', id: 'note-later' },
  )
  const sorted = sortNotes(undated.notes)
  assert.deepEqual(sorted.map((row) => row.id), ['note-pm', 'note-am', 'note-later'])
  const groups = groupNotesByDate(undated.notes)
  assert.equal(groups.length, 2)
  assert.equal(groups[0].date, '2026-12-13')
  assert.equal(groups[0].notes.length, 2)
  assert.equal(groups[1].date, null)
  assert.deepEqual(packingProgress(packed.items), { packed: 0, total: 1 })
  assert.equal(checklistRowsForTripUser(checklist.categories, VIENNA, JAMIE).length, 9)
})

