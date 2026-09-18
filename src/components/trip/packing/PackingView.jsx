import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useAppData } from '../../../hooks/useAppData.jsx'
import {
  moveIdInOrder,
  packingProgress,
  packingRowsForTripUser,
  parseQuantity,
  sortByPackingOrder,
  toggleCollapsedIds,
} from '../../../lib/planning.js'
import { IconChevron } from '../../icons.jsx'
import { Button } from '../../ui/Button.jsx'
import { EmptyState } from '../../ui/EmptyState.jsx'
import { Field, fieldClass, textareaClass } from '../../ui/Field.jsx'
import { ProgressBar } from '../../ui/ProgressBar.jsx'
import { Sheet, useSheetClose } from '../../ui/Sheet.jsx'

export function PackingView({ tripId }) {
  const {
    currentUser,
    packingCategories,
    packingItems,
    ensurePackingCategories,
    addPackingCategory,
    updatePackingCategory,
    reorderPackingCategories,
    deletePackingCategory,
    addPackingItem,
    updatePackingItem,
    togglePackingItemPacked,
    reorderPackingItems,
    deletePackingItem,
  } = useAppData()

  const userId = currentUser.id
  const seedKey = `${tripId}:${userId}`
  const seededFor = useRef('')

  useEffect(() => {
    if (!tripId || !userId) return
    if (seededFor.current === seedKey) return
    seededFor.current = seedKey
    ensurePackingCategories(tripId)
  }, [ensurePackingCategories, seedKey, tripId, userId])

  const categories = useMemo(
    () => sortByPackingOrder(packingRowsForTripUser(packingCategories, tripId, userId)),
    [packingCategories, tripId, userId],
  )
  const items = useMemo(
    () => packingRowsForTripUser(packingItems, tripId, userId),
    [packingItems, tripId, userId],
  )
  const progress = packingProgress(items)
  const categoryIds = categories.map((category) => category.id)

  const [collapsedIds, setCollapsedIds] = useState([])
  const [sheet, setSheet] = useState(null)
  const [confirm, setConfirm] = useState(null)

  function itemsFor(categoryId) {
    return sortByPackingOrder(items.filter((item) => item.categoryId === categoryId))
  }

  function openAddCategory() {
    setSheet({ type: 'category' })
  }

  if (!categories.length) {
    return (
      <div className="min-w-0">
        <PackingProgress packed={progress.packed} total={progress.total} />
        <div className="mt-8">
          <EmptyState
            title="No packing categories yet."
            action={
              <button type="button" className="inline-flex min-h-11 items-center text-sm text-accent" onClick={openAddCategory}>
                + Add category
              </button>
            }
          />
        </div>
        {sheet ? (
          <PackingSheet
            sheet={sheet}
            tripId={tripId}
            onClose={() => setSheet(null)}
            addPackingCategory={addPackingCategory}
            updatePackingCategory={updatePackingCategory}
            addPackingItem={addPackingItem}
            updatePackingItem={updatePackingItem}
            deletePackingItem={deletePackingItem}
          />
        ) : null}
      </div>
    )
  }

  return (
    <div className="min-w-0">
      <PackingProgress packed={progress.packed} total={progress.total} />

      <div className="mt-6 flex justify-end">
        <button type="button" className="inline-flex min-h-11 items-center text-sm text-accent" onClick={openAddCategory}>
          + Add category
        </button>
      </div>

      <ul className="mt-2 divide-y divide-line">
        {categories.map((category, index) => {
          const categoryItems = itemsFor(category.id)
          const expanded = !collapsedIds.includes(category.id)
          const itemIds = categoryItems.map((item) => item.id)
          return (
            <li key={category.id} className="py-5">
              <div className="flex items-start gap-1">
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setCollapsedIds((current) => toggleCollapsedIds(current, category.id))}
                  className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <IconChevron
                    className={`h-4 w-4 shrink-0 text-ink-subtle transition-transform ${expanded ? 'rotate-90' : ''}`}
                  />
                  <span className="font-display min-w-0 truncate text-[22px] tracking-[-0.03em] text-ink">
                    {category.name}
                  </span>
                </button>
                <button
                  type="button"
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center text-ink-muted hover:text-ink disabled:opacity-30"
                  aria-label={`Move ${category.name} up`}
                  disabled={index === 0}
                  onClick={() => reorderPackingCategories(tripId, moveIdInOrder(categoryIds, category.id, -1))}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center text-ink-muted hover:text-ink disabled:opacity-30"
                  aria-label={`Move ${category.name} down`}
                  disabled={index === categories.length - 1}
                  onClick={() => reorderPackingCategories(tripId, moveIdInOrder(categoryIds, category.id, 1))}
                >
                  ↓
                </button>
              </div>

              {expanded ? (
                <div className="mt-3">
                  {categoryItems.length ? (
                    <ul>
                      {categoryItems.map((item, itemIndex) => (
                        <PackingItemRow
                          key={item.id}
                          item={item}
                          isFirst={itemIndex === 0}
                          isLast={itemIndex === categoryItems.length - 1}
                          onToggle={() => togglePackingItemPacked(item.id)}
                          onMove={(delta) => reorderPackingItems(category.id, moveIdInOrder(itemIds, item.id, delta))}
                          onEdit={() => setSheet({ type: 'item', categoryId: category.id, item })}
                        />
                      ))}
                    </ul>
                  ) : (
                    <p className="px-1 text-[13px] text-ink-subtle">Nothing in this category yet.</p>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                    <button
                      type="button"
                      className="inline-flex min-h-11 items-center text-sm text-accent"
                      onClick={() => setSheet({ type: 'item', categoryId: category.id })}
                    >
                      + Add item
                    </button>
                    <button
                      type="button"
                      className="inline-flex min-h-11 items-center text-sm text-ink-muted"
                      onClick={() => setSheet({ type: 'category', category })}
                    >
                      Rename
                    </button>
                    {confirm?.id === category.id ? (
                      <span role="alertdialog" aria-labelledby={`pack-del-${category.id}`} className="flex flex-wrap items-center gap-3">
                        <span id={`pack-del-${category.id}`} className="text-sm text-ink">
                          Delete {category.name} and {categoryItems.length} {categoryItems.length === 1 ? 'item' : 'items'}?
                        </span>
                        <button type="button" className="text-sm text-ink-subtle" onClick={() => setConfirm(null)}>
                          Keep
                        </button>
                        <button
                          type="button"
                          className="text-sm text-accent"
                          onClick={() => {
                            deletePackingCategory(category.id)
                            setConfirm(null)
                          }}
                        >
                          Delete
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="inline-flex min-h-11 items-center text-sm text-ink-subtle"
                        onClick={() => {
                          if (categoryItems.length) setConfirm({ id: category.id })
                          else deletePackingCategory(category.id)
                        }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>

      {sheet ? (
        <PackingSheet
          sheet={sheet}
          tripId={tripId}
          onClose={() => setSheet(null)}
          addPackingCategory={addPackingCategory}
          updatePackingCategory={updatePackingCategory}
          addPackingItem={addPackingItem}
          updatePackingItem={updatePackingItem}
          deletePackingItem={deletePackingItem}
        />
      ) : null}
    </div>
  )
}

function PackingProgress({ packed, total }) {
  return (
    <div>
      <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">Packing</p>
      <p className="mt-2 text-sm text-ink">
        Packed {packed} / {total}
      </p>
      <ProgressBar
        now={packed}
        max={total}
        label={`Packed ${packed} of ${total}`}
        className="mt-4"
      />
    </div>
  )
}

function PackingItemRow({ item, isFirst, isLast, onToggle, onMove, onEdit }) {
  const checkboxId = useId()
  const note = item.note?.trim()

  return (
    <li className="flex items-center gap-1 py-1">
      <label
        htmlFor={checkboxId}
        className="inline-flex min-h-10 min-w-10 shrink-0 cursor-pointer items-center justify-center"
      >
        <input
          id={checkboxId}
          type="checkbox"
          checked={Boolean(item.packed)}
          onChange={onToggle}
          className="h-4 w-4 accent-[var(--accent)]"
        />
      </label>
      <label htmlFor={checkboxId} className="min-w-0 flex-1 cursor-pointer py-2">
        <span className={`block truncate text-sm ${item.packed ? 'text-ink-muted' : 'text-ink'}`}>{item.name}</span>
        {note ? <span className="mt-0.5 block truncate text-[12px] text-ink-subtle">{note}</span> : null}
      </label>
      <span className="shrink-0 px-1 text-[13px] tabular-nums text-ink-subtle">× {item.quantity}</span>
      <button
        type="button"
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center text-ink-muted hover:text-ink disabled:opacity-30"
        aria-label={`Move ${item.name} up`}
        disabled={isFirst}
        onClick={() => onMove(-1)}
      >
        ↑
      </button>
      <button
        type="button"
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center text-ink-muted hover:text-ink disabled:opacity-30"
        aria-label={`Move ${item.name} down`}
        disabled={isLast}
        onClick={() => onMove(1)}
      >
        ↓
      </button>
      <button
        type="button"
        className="inline-flex min-h-10 shrink-0 items-center px-1 text-[13px] text-ink-muted"
        onClick={onEdit}
      >
        Edit
      </button>
    </li>
  )
}

function PackingSheet({
  sheet,
  tripId,
  onClose,
  addPackingCategory,
  updatePackingCategory,
  addPackingItem,
  updatePackingItem,
  deletePackingItem,
}) {
  const category = sheet.category
  const item = sheet.item
  const isItem = sheet.type === 'item'
  const title = isItem ? (item ? 'Edit item' : 'Add item') : category ? 'Rename category' : 'Add category'

  return (
    <Sheet title={title} kicker="Packing" onClose={onClose}>
      {isItem ? (
        <PackingItemForm
          tripId={tripId}
          categoryId={sheet.categoryId}
          item={item}
          onClose={onClose}
          addPackingItem={addPackingItem}
          updatePackingItem={updatePackingItem}
          deletePackingItem={deletePackingItem}
        />
      ) : (
        <PackingCategoryForm
          tripId={tripId}
          category={category}
          onClose={onClose}
          addPackingCategory={addPackingCategory}
          updatePackingCategory={updatePackingCategory}
        />
      )}
    </Sheet>
  )
}

function PackingCategoryForm({ tripId, category, onClose, addPackingCategory, updatePackingCategory }) {
  const requestClose = useSheetClose()
  const [name, setName] = useState(category?.name ?? '')

  function handleSubmit(event) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    const saved = category
      ? updatePackingCategory(category.id, { name: trimmed })
      : addPackingCategory({ tripId, name: trimmed })
    if (!saved) return
    onClose()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Category name">
        <input
          className={fieldClass}
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          autoFocus
        />
      </Field>
      <div className="flex items-center justify-between gap-3 pt-1">
        <button type="button" className="text-sm text-ink-muted" onClick={() => (requestClose ?? onClose)?.()}>
          Cancel
        </button>
        <Button type="submit" disabled={!name.trim()}>
          Save
        </Button>
      </div>
    </form>
  )
}

function PackingItemForm({
  tripId,
  categoryId,
  item,
  onClose,
  addPackingItem,
  updatePackingItem,
  deletePackingItem,
}) {
  const requestClose = useSheetClose()
  const [name, setName] = useState(item?.name ?? '')
  const [quantity, setQuantity] = useState(String(item?.quantity ?? 1))
  const [note, setNote] = useState(item?.note ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)

  function handleSubmit(event) {
    event.preventDefault()
    const trimmed = name.trim()
    const parsed = parseQuantity(Number.parseInt(quantity, 10))
    if (!trimmed || parsed == null) return
    const saved = item
      ? updatePackingItem(item.id, { name: trimmed, quantity: parsed, note })
      : addPackingItem({ tripId, categoryId, name: trimmed, quantity: parsed, note })
    if (!saved) return
    onClose()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Name">
        <input
          className={fieldClass}
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          autoFocus
        />
      </Field>
      <Field label="Quantity">
        <input
          className={fieldClass}
          type="number"
          min="1"
          step="1"
          inputMode="numeric"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          required
        />
      </Field>
      <Field label="Note">
        <textarea
          className={textareaClass}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Optional"
        />
      </Field>
      {item ? (
        <div>
          {confirmDelete ? (
            <button
              type="button"
              className="text-sm text-accent"
              onClick={() => {
                deletePackingItem(item.id)
                onClose()
              }}
            >
              Confirm delete
            </button>
          ) : (
            <button type="button" className="text-sm text-ink-subtle" onClick={() => setConfirmDelete(true)}>
              Delete item
            </button>
          )}
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-3 pt-1">
        <button type="button" className="text-sm text-ink-muted" onClick={() => (requestClose ?? onClose)?.()}>
          Cancel
        </button>
        <Button type="submit" disabled={!name.trim() || parseQuantity(Number.parseInt(quantity, 10)) == null}>
          Save
        </Button>
      </div>
    </form>
  )
}
