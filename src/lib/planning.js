import { parseISODate, formatISODate } from './dates.js'
import { createId } from './format.js'

export const CHECKLIST_PHASES = Object.freeze([
  Object.freeze({ id: 'before', label: 'Before Trip' }),
  Object.freeze({ id: 'packing', label: 'Packing' }),
  Object.freeze({ id: 'during', label: 'During Trip' }),
  Object.freeze({ id: 'after', label: 'After Trip' }),
])

export const CHECKLIST_PHASE_IDS = Object.freeze(CHECKLIST_PHASES.map((phase) => phase.id))

/** @param {string} phase */
export function isChecklistPhase(phase) {
  return CHECKLIST_PHASE_IDS.includes(phase)
}

/**
 * Personal planning rows for one local user. Previewing another member
 * must use that member's id, never the home user's rows.
 * @template {{ userId: string }} T
 * @param {T[]} rows
 * @param {string} userId
 */
export function personalRowsForUser(rows, userId) {
  if (!userId || !Array.isArray(rows)) return []
  return rows.filter((row) => row.userId === userId)
}

/** @param {unknown} value */
export function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  return formatISODate(parseISODate(value)) === value
}

/** @param {unknown} value */
export function parseQuantity(value) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) return null
  return value
}

function trimName(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function nextSortOrder(rows) {
  if (!rows.length) return 0
  return Math.max(...rows.map((row) => (Number.isFinite(row.sortOrder) ? row.sortOrder : 0))) + 1
}

function owned(row, userId) {
  return Boolean(row) && row.userId === userId
}

function applyReorder(rows, scoped, orderedIds, now) {
  const allowed = new Set(scoped.map((row) => row.id))
  const nextIds = orderedIds.filter((id) => allowed.has(id))
  for (const row of scoped) {
    if (!nextIds.includes(row.id)) nextIds.push(row.id)
  }
  const order = new Map(nextIds.map((id, index) => [id, index]))
  return rows.map((row) => {
    if (!order.has(row.id)) return row
    return { ...row, sortOrder: order.get(row.id), updatedAt: now }
  })
}

export function createPackingCategory(categories, input, options = {}) {
  const name = trimName(input?.name)
  const tripId = input?.tripId
  const userId = input?.userId
  if (!tripId || !userId || !name) return { categories, category: null }
  const now = options.now ?? new Date().toISOString()
  const scoped = categories.filter((row) => row.tripId === tripId && row.userId === userId)
  const category = {
    id: options.id ?? createId('pcat'),
    tripId,
    userId,
    name,
    sortOrder: nextSortOrder(scoped),
    createdAt: now,
    updatedAt: now,
  }
  return { categories: [...categories, category], category }
}

export function updatePackingCategory(categories, categoryId, userId, patch, now) {
  const current = categories.find((row) => row.id === categoryId)
  if (!owned(current, userId)) return { categories, category: null }
  const name = patch?.name === undefined ? current.name : trimName(patch.name)
  if (!name) return { categories, category: null }
  const category = {
    ...current,
    name,
    id: current.id,
    tripId: current.tripId,
    userId: current.userId,
    updatedAt: now,
  }
  return {
    categories: categories.map((row) => (row.id === categoryId ? category : row)),
    category,
  }
}

export function reorderPackingCategories(categories, tripId, userId, orderedIds, now) {
  const scoped = categories.filter((row) => row.tripId === tripId && row.userId === userId)
  if (!scoped.length) return { categories, ok: false }
  return { categories: applyReorder(categories, scoped, orderedIds ?? [], now), ok: true }
}

export function deletePackingCategory(categories, items, categoryId, userId) {
  const current = categories.find((row) => row.id === categoryId)
  if (!owned(current, userId)) return { categories, items, ok: false }
  return {
    categories: categories.filter((row) => row.id !== categoryId),
    items: items.filter((row) => row.categoryId !== categoryId),
    ok: true,
  }
}

export function createPackingItem(items, categories, input, options = {}) {
  const name = trimName(input?.name)
  const tripId = input?.tripId
  const userId = input?.userId
  const categoryId = input?.categoryId
  const quantity = input?.quantity === undefined ? 1 : parseQuantity(input.quantity)
  const category = categories.find((row) => row.id === categoryId)
  if (!tripId || !userId || !name || quantity == null) return { items, item: null }
  if (!owned(category, userId) || category.tripId !== tripId) return { items, item: null }
  const now = options.now ?? new Date().toISOString()
  const scoped = items.filter((row) => row.categoryId === categoryId && row.userId === userId)
  const item = {
    id: options.id ?? createId('pitem'),
    tripId,
    userId,
    categoryId,
    name,
    quantity,
    note: typeof input?.note === 'string' ? input.note : '',
    packed: false,
    sortOrder: nextSortOrder(scoped),
    createdAt: now,
    updatedAt: now,
  }
  return { items: [...items, item], item }
}

export function updatePackingItem(items, categories, itemId, userId, patch, now) {
  const current = items.find((row) => row.id === itemId)
  if (!owned(current, userId)) return { items, item: null }
  let quantity = current.quantity
  if (patch?.quantity !== undefined) {
    quantity = parseQuantity(patch.quantity)
    if (quantity == null) return { items, item: null }
  }
  let categoryId = current.categoryId
  if (patch?.categoryId !== undefined) {
    const category = categories.find((row) => row.id === patch.categoryId)
    if (!owned(category, userId) || category.tripId !== current.tripId) return { items, item: null }
    categoryId = category.id
  }
  const name = patch?.name === undefined ? current.name : trimName(patch.name)
  if (!name) return { items, item: null }
  const item = {
    ...current,
    name,
    note: patch?.note === undefined ? current.note : typeof patch.note === 'string' ? patch.note : current.note,
    packed: patch?.packed === undefined ? current.packed : Boolean(patch.packed),
    quantity,
    categoryId,
    id: current.id,
    tripId: current.tripId,
    userId: current.userId,
    updatedAt: now,
  }
  return {
    items: items.map((row) => (row.id === itemId ? item : row)),
    item,
  }
}

export function togglePackingItemPacked(items, itemId, userId, now) {
  const current = items.find((row) => row.id === itemId)
  if (!owned(current, userId)) return { items, item: null }
  return updatePackingItem(items, [], itemId, userId, { packed: !current.packed }, now)
}

export function reorderPackingItems(items, categoryId, userId, orderedIds, now) {
  const scoped = items.filter((row) => row.categoryId === categoryId && row.userId === userId)
  if (!scoped.length) return { items, ok: false }
  return { items: applyReorder(items, scoped, orderedIds ?? [], now), ok: true }
}

export function deletePackingItem(items, itemId, userId) {
  const current = items.find((row) => row.id === itemId)
  if (!owned(current, userId)) return { items, ok: false }
  return { items: items.filter((row) => row.id !== itemId), ok: true }
}

export const DEFAULT_PACKING_CATEGORY_NAMES = Object.freeze([
  'Clothing',
  'Toiletries',
  'Electronics',
  'Health',
  'Documents',
  'Other',
])

/**
 * Personal packing rows for one trip and user. Never mixes trips or members.
 * @template {{ tripId: string, userId: string }} T
 * @param {T[]} rows
 * @param {string} tripId
 * @param {string} userId
 */
export function packingRowsForTripUser(rows, tripId, userId) {
  if (!tripId) return []
  return personalRowsForUser(rows, userId).filter((row) => row.tripId === tripId)
}

/** @param {{ sortOrder?: number, createdAt?: string }[]} rows */
export function sortByPackingOrder(rows) {
  return [...(rows ?? [])].sort((a, b) => {
    const order = (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0)
    if (order !== 0) return order
    return String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? ''))
  })
}

/** Derived packing progress. Not stored. */
export function packingProgress(items) {
  const list = Array.isArray(items) ? items : []
  return {
    packed: list.filter((item) => item.packed).length,
    total: list.length,
  }
}

/**
 * First-open seed for one trip + user. No-op when any category already exists.
 * @param {import('../types').PackingCategory[]} categories
 * @param {string} tripId
 * @param {string} userId
 */
export function seedDefaultPackingCategories(categories, tripId, userId, options = {}) {
  if (!tripId || !userId) return { categories: categories ?? [], seeded: false }
  const existing = packingRowsForTripUser(categories, tripId, userId)
  if (existing.length) return { categories: categories ?? [], seeded: false }
  let next = categories ?? []
  const now = options.now ?? new Date().toISOString()
  for (const name of DEFAULT_PACKING_CATEGORY_NAMES) {
    const result = createPackingCategory(next, { tripId, userId, name }, { now })
    if (!result.category) return { categories: next, seeded: false }
    next = result.categories
  }
  return { categories: next, seeded: true }
}

/** Accessible ↑ / ↓ reorder without a drag library. */
export function moveIdInOrder(ids, id, delta) {
  const list = Array.isArray(ids) ? [...ids] : []
  const index = list.indexOf(id)
  const nextIndex = index + delta
  if (index < 0 || nextIndex < 0 || nextIndex >= list.length) return list
  const [row] = list.splice(index, 1)
  list.splice(nextIndex, 0, row)
  return list
}

/** UI collapse ids. Categories start expanded. */
export function toggleCollapsedIds(ids, categoryId) {
  if (!categoryId) return ids ?? []
  const list = ids ?? []
  return list.includes(categoryId) ? list.filter((id) => id !== categoryId) : [...list, categoryId]
}

export function createChecklistCategory(categories, input, options = {}) {
  const name = trimName(input?.name)
  const tripId = input?.tripId
  const userId = input?.userId
  const phase = input?.phase
  if (!tripId || !userId || !name || !isChecklistPhase(phase)) return { categories, category: null }
  const now = options.now ?? new Date().toISOString()
  const scoped = categories.filter(
    (row) => row.tripId === tripId && row.userId === userId && row.phase === phase,
  )
  const category = {
    id: options.id ?? createId('ccat'),
    tripId,
    userId,
    phase,
    name,
    sortOrder: nextSortOrder(scoped),
    createdAt: now,
    updatedAt: now,
  }
  return { categories: [...categories, category], category }
}

export function updateChecklistCategory(categories, categoryId, userId, patch, now) {
  const current = categories.find((row) => row.id === categoryId)
  if (!owned(current, userId)) return { categories, category: null }
  const name = patch?.name === undefined ? current.name : trimName(patch.name)
  if (!name) return { categories, category: null }
  const category = {
    ...current,
    name,
    id: current.id,
    tripId: current.tripId,
    userId: current.userId,
    phase: current.phase,
    updatedAt: now,
  }
  return {
    categories: categories.map((row) => (row.id === categoryId ? category : row)),
    category,
  }
}

export function reorderChecklistCategories(categories, tripId, userId, phase, orderedIds, now) {
  if (!isChecklistPhase(phase)) return { categories, ok: false }
  const scoped = categories.filter(
    (row) => row.tripId === tripId && row.userId === userId && row.phase === phase,
  )
  if (!scoped.length) return { categories, ok: false }
  return { categories: applyReorder(categories, scoped, orderedIds ?? [], now), ok: true }
}

export function deleteChecklistCategory(categories, items, categoryId, userId) {
  const current = categories.find((row) => row.id === categoryId)
  if (!owned(current, userId)) return { categories, items, ok: false }
  return {
    categories: categories.filter((row) => row.id !== categoryId),
    items: items.filter((row) => row.categoryId !== categoryId),
    ok: true,
  }
}

export function createChecklistItem(items, categories, input, options = {}) {
  const name = trimName(input?.name)
  const tripId = input?.tripId
  const userId = input?.userId
  const categoryId = input?.categoryId
  const category = categories.find((row) => row.id === categoryId)
  if (input?.dueDate !== undefined && input.dueDate !== null && !isIsoDate(input.dueDate)) {
    return { items, item: null }
  }
  if (!tripId || !userId || !name) return { items, item: null }
  if (!owned(category, userId) || category.tripId !== tripId) return { items, item: null }
  const now = options.now ?? new Date().toISOString()
  const scoped = items.filter((row) => row.categoryId === categoryId && row.userId === userId)
  const item = {
    id: options.id ?? createId('citem'),
    tripId,
    userId,
    categoryId,
    name,
    done: false,
    note: typeof input?.note === 'string' ? input.note : '',
    dueDate: input?.dueDate === undefined ? null : input.dueDate,
    sortOrder: nextSortOrder(scoped),
    createdAt: now,
    updatedAt: now,
  }
  return { items: [...items, item], item }
}

export function updateChecklistItem(items, categories, itemId, userId, patch, now) {
  const current = items.find((row) => row.id === itemId)
  if (!owned(current, userId)) return { items, item: null }
  if (patch?.dueDate !== undefined && patch.dueDate !== null && !isIsoDate(patch.dueDate)) {
    return { items, item: null }
  }
  let categoryId = current.categoryId
  if (patch?.categoryId !== undefined) {
    const currentCategory = categories.find((row) => row.id === current.categoryId)
    const category = categories.find((row) => row.id === patch.categoryId)
    if (!owned(category, userId) || category.tripId !== current.tripId) return { items, item: null }
    if (currentCategory && category.phase !== currentCategory.phase) return { items, item: null }
    categoryId = category.id
  }
  const name = patch?.name === undefined ? current.name : trimName(patch.name)
  if (!name) return { items, item: null }
  const item = {
    ...current,
    name,
    note: patch?.note === undefined ? current.note : typeof patch.note === 'string' ? patch.note : current.note,
    done: patch?.done === undefined ? current.done : Boolean(patch.done),
    dueDate: patch?.dueDate === undefined ? current.dueDate : patch.dueDate,
    categoryId,
    id: current.id,
    tripId: current.tripId,
    userId: current.userId,
    updatedAt: now,
  }
  return {
    items: items.map((row) => (row.id === itemId ? item : row)),
    item,
  }
}

export function toggleChecklistItemDone(items, itemId, userId, now) {
  const current = items.find((row) => row.id === itemId)
  if (!owned(current, userId)) return { items, item: null }
  return updateChecklistItem(items, [], itemId, userId, { done: !current.done }, now)
}

export function reorderChecklistItems(items, categoryId, userId, orderedIds, now) {
  const scoped = items.filter((row) => row.categoryId === categoryId && row.userId === userId)
  if (!scoped.length) return { items, ok: false }
  return { items: applyReorder(items, scoped, orderedIds ?? [], now), ok: true }
}

export function deleteChecklistItem(items, itemId, userId) {
  const current = items.find((row) => row.id === itemId)
  if (!owned(current, userId)) return { items, ok: false }
  return { items: items.filter((row) => row.id !== itemId), ok: true }
}

export const DEFAULT_CHECKLIST_CATEGORIES_BY_PHASE = Object.freeze({
  before: Object.freeze(['Documents', 'Money & Payments', 'Connectivity', 'Flights & Transport']),
  packing: Object.freeze(['Preparation']),
  during: Object.freeze(['Accommodation', 'Daily']),
  after: Object.freeze(['Before Leaving', 'Memories']),
})

/** Same trip + user filter as packing. Checklist never mixes members or trips. */
export function checklistRowsForTripUser(rows, tripId, userId) {
  return packingRowsForTripUser(rows, tripId, userId)
}

export function sortByChecklistOrder(rows) {
  return sortByPackingOrder(rows)
}

/** Derived checklist progress. Not stored. Independent of packing packed. */
export function checklistProgress(items) {
  const list = Array.isArray(items) ? items : []
  return {
    done: list.filter((item) => item.done).length,
    total: list.length,
  }
}

export function checklistItemsForPhase(categories, items, phase) {
  const ids = new Set(
    (categories ?? []).filter((row) => row.phase === phase).map((row) => row.id),
  )
  return (items ?? []).filter((item) => ids.has(item.categoryId))
}

export function checklistPhaseProgress(categories, items, phase) {
  return checklistProgress(checklistItemsForPhase(categories, items, phase))
}

/**
 * First-open seed per phase. Skips a phase that already has any category
 * for this trip + user, including custom ones.
 */
export function seedDefaultChecklistCategories(categories, tripId, userId, options = {}) {
  if (!tripId || !userId) return { categories: categories ?? [], seeded: false }
  let next = categories ?? []
  let seeded = false
  const now = options.now ?? new Date().toISOString()
  for (const phase of CHECKLIST_PHASES) {
    const existing = next.filter(
      (row) => row.tripId === tripId && row.userId === userId && row.phase === phase.id,
    )
    if (existing.length) continue
    const names = DEFAULT_CHECKLIST_CATEGORIES_BY_PHASE[phase.id] ?? []
    for (const name of names) {
      const result = createChecklistCategory(next, { tripId, userId, phase: phase.id, name }, { now })
      if (!result.category) return { categories: next, seeded }
      next = result.categories
      seeded = true
    }
  }
  return { categories: next, seeded }
}

function parseOptionalDate(value) {
  if (value === undefined || value === null) return { ok: true, date: null }
  if (!isIsoDate(value)) return { ok: false, date: null }
  return { ok: true, date: value }
}

export function createNote(notes, input, options = {}) {
  const body = trimName(input?.body)
  const tripId = input?.tripId
  const userId = input?.userId
  const parsedDate = parseOptionalDate(input?.date)
  if (!tripId || !userId || !body || !parsedDate.ok) return { notes, note: null }
  const now = options.now ?? new Date().toISOString()
  const note = {
    id: options.id ?? createId('note'),
    tripId,
    userId,
    title: typeof input?.title === 'string' ? input.title.trim() : '',
    body,
    date: parsedDate.date,
    createdAt: now,
    updatedAt: now,
  }
  return { notes: [...notes, note], note }
}

export function updateNote(notes, noteId, userId, patch, now) {
  const current = notes.find((row) => row.id === noteId)
  if (!owned(current, userId)) return { notes, note: null }
  const body = patch?.body === undefined ? current.body : trimName(patch.body)
  if (!body) return { notes, note: null }
  let date = current.date
  if (patch?.date !== undefined) {
    const parsedDate = parseOptionalDate(patch.date)
    if (!parsedDate.ok) return { notes, note: null }
    date = parsedDate.date
  }
  const note = {
    ...current,
    title: patch?.title === undefined ? current.title : typeof patch.title === 'string' ? patch.title.trim() : current.title,
    body,
    date,
    id: current.id,
    tripId: current.tripId,
    userId: current.userId,
    updatedAt: now,
  }
  return {
    notes: notes.map((row) => (row.id === noteId ? note : row)),
    note,
  }
}

export function deleteNote(notes, noteId, userId) {
  const current = notes.find((row) => row.id === noteId)
  if (!owned(current, userId)) return { notes, ok: false }
  return { notes: notes.filter((row) => row.id !== noteId), ok: true }
}

export function createMemory(memories, input, options = {}) {
  const tripId = input?.tripId
  const userId = input?.userId
  const parsedDate = parseOptionalDate(input?.date)
  if (!tripId || !userId || !parsedDate.ok) return { memories, memory: null }
  const now = options.now ?? new Date().toISOString()
  const memory = {
    id: options.id ?? createId('mem'),
    tripId,
    userId,
    caption: typeof input?.caption === 'string' ? input.caption.trim() : '',
    date: parsedDate.date,
    createdAt: now,
    updatedAt: now,
  }
  return { memories: [...memories, memory], memory }
}

export function updateMemory(memories, memoryId, userId, patch, now) {
  const current = memories.find((row) => row.id === memoryId)
  if (!owned(current, userId)) return { memories, memory: null }
  let date = current.date
  if (patch?.date !== undefined) {
    const parsedDate = parseOptionalDate(patch.date)
    if (!parsedDate.ok) return { memories, memory: null }
    date = parsedDate.date
  }
  const memory = {
    id: current.id,
    tripId: current.tripId,
    userId: current.userId,
    caption:
      patch?.caption === undefined
        ? current.caption
        : typeof patch.caption === 'string'
          ? patch.caption.trim()
          : current.caption,
    date,
    createdAt: current.createdAt,
    updatedAt: now,
  }
  return {
    memories: memories.map((row) => (row.id === memoryId ? memory : row)),
    memory,
  }
}

export function deleteMemory(memories, memoryId, userId) {
  const current = memories.find((row) => row.id === memoryId)
  if (!owned(current, userId)) return { memories, ok: false }
  return { memories: memories.filter((row) => row.id !== memoryId), ok: true }
}

/** Drop personal planning rows for a deleted trip. Other trips stay intact. */
export function removePersonalRowsForTrip(rows, tripId) {
  if (!tripId || !Array.isArray(rows)) return rows ?? []
  return rows.filter((row) => row.tripId !== tripId)
}
