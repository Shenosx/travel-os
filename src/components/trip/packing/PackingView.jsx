import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAppData } from '../../../hooks/useAppData.jsx'
import {
  moveIdInOrder,
  packingCategoryProgress,
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

export function PackingView({ tripId, canEdit = false }) {
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
    if (!tripId || !userId || !canEdit) return
    if (seededFor.current === seedKey) return
    seededFor.current = seedKey
    ensurePackingCategories(tripId)
  }, [canEdit, ensurePackingCategories, seedKey, tripId, userId])

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

  function openAddItem(categoryId) {
    if (!canEdit) return
    setSheet({ type: 'item', categoryId: categoryId || categories[0]?.id })
  }

  function openAddCategory() {
    if (!canEdit) return
    setSheet({ type: 'category' })
  }

  const sheetNode = sheet ? (
    <PackingSheet
      sheet={sheet}
      tripId={tripId}
      categories={categories}
      onClose={() => setSheet(null)}
      addPackingCategory={addPackingCategory}
      updatePackingCategory={updatePackingCategory}
      addPackingItem={addPackingItem}
      updatePackingItem={updatePackingItem}
      deletePackingItem={deletePackingItem}
    />
  ) : null

  return (
    <div className="min-w-0">
      <Link to={`/trips/${tripId}`} className="inline-flex min-h-11 items-center text-[13px] text-ink-subtle hover:text-ink">
        ← Trip details
      </Link>

      <header className="mt-5">
        <h2 className="font-display text-[28px] leading-[1.05] tracking-[-0.04em] text-ink sm:text-[34px]">
          Packing
        </h2>
        {progress.total ? (
          <>
            <p className="mt-3 text-[15px] tabular-nums text-ink-muted">
              {progress.packed} / {progress.total} packed
            </p>
            <ProgressBar
              now={progress.packed}
              max={progress.total}
              label={`Packed ${progress.packed} of ${progress.total}`}
              className="mt-5"
            />
          </>
        ) : (
          <div className="mt-8">
            <EmptyState
              title="No packing items yet"
              action={
                canEdit ? (
                  <button
                    type="button"
                    className="inline-flex min-h-11 items-center text-sm text-accent"
                    onClick={() => (categories.length ? openAddItem() : openAddCategory())}
                  >
                    Add item
                  </button>
                ) : null
              }
            />
          </div>
        )}
      </header>

      {categories.length ? (
        <>
          {canEdit ? (
            <div className="mt-8 flex justify-end">
              <button type="button" className="inline-flex min-h-11 items-center text-sm text-accent" onClick={openAddCategory}>
                + Add category
              </button>
            </div>
          ) : null}

          <ul className="mt-6 grid gap-12 lg:grid-cols-2">
            {categories.map((category, index) => {
              const categoryItems = itemsFor(category.id)
              const expanded = !collapsedIds.includes(category.id)
              const itemIds = categoryItems.map((item) => item.id)
              const categoryProgress = packingCategoryProgress(items, category.id)
              return (
                <li key={category.id} className="min-w-0">
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
                    {canEdit ? (
                      <>
                        <button
                          type="button"
                          className="inline-flex h-11 w-11 shrink-0 items-center justify-center text-ink-muted hover:text-ink disabled:opacity-30"
                          aria-label={`Move ${category.name} up`}
                          disabled={index === 0}
                          onClick={() => reorderPackingCategories(tripId, moveIdInOrder(categoryIds, category.id, -1))}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-11 w-11 shrink-0 items-center justify-center text-ink-muted hover:text-ink disabled:opacity-30"
                          aria-label={`Move ${category.name} down`}
                          disabled={index === categories.length - 1}
                          onClick={() => reorderPackingCategories(tripId, moveIdInOrder(categoryIds, category.id, 1))}
                        >
                          ↓
                        </button>
                      </>
                    ) : null}
                  </div>
                  <p className="mt-2 text-[13px] tabular-nums text-ink-subtle">
                    {categoryProgress.packed} / {categoryProgress.total}
                  </p>
                  <ProgressBar
                    now={categoryProgress.packed}
                    max={categoryProgress.total}
                    label={`${category.name} ${categoryProgress.packed} of ${categoryProgress.total} packed`}
                    className="mt-3"
                  />

                  {expanded ? (
                    <div className="mt-4">
                      {categoryItems.length ? (
                        <ul>
                          {categoryItems.map((item, itemIndex) => (
                            <PackingItemRow
                              key={item.id}
                              item={item}
                              canEdit={canEdit}
                              isFirst={itemIndex === 0}
                              isLast={itemIndex === categoryItems.length - 1}
                              onToggle={() => canEdit && togglePackingItemPacked(item.id)}
                              onMove={(delta) =>
                                canEdit && reorderPackingItems(category.id, moveIdInOrder(itemIds, item.id, delta))
                              }
                              onEdit={() => canEdit && setSheet({ type: 'item', categoryId: category.id, item })}
                            />
                          ))}
                        </ul>
                      ) : (
                        <p className="px-1 text-[13px] text-ink-subtle">Nothing in this category yet.</p>
                      )}

                      {canEdit ? (
                        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                          <button
                            type="button"
                            className="inline-flex min-h-11 items-center text-sm text-accent"
                            onClick={() => openAddItem(category.id)}
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
                            <span
                              role="alertdialog"
                              aria-labelledby={`pack-del-${category.id}`}
                              className="flex flex-wrap items-center gap-3"
                            >
                              <span id={`pack-del-${category.id}`} className="text-sm text-ink">
                                Delete {category.name} and {categoryItems.length}{' '}
                                {categoryItems.length === 1 ? 'item' : 'items'}?
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
                      ) : null}
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </>
      ) : null}

      {sheetNode}
    </div>
  )
}

function PackingItemRow({ item, canEdit, isFirst, isLast, onToggle, onMove, onEdit }) {
  const checkboxId = useId()
  const note = item.note?.trim()

  return (
    <li className="flex min-w-0 items-center gap-1 py-1">
      <label
        htmlFor={checkboxId}
        className="inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center"
      >
        <input
          id={checkboxId}
          type="checkbox"
          checked={Boolean(item.packed)}
          onChange={onToggle}
          disabled={!canEdit}
          className="h-4 w-4 accent-[var(--accent)]"
        />
      </label>
      <label htmlFor={checkboxId} className={`min-w-0 flex-1 py-2 ${canEdit ? 'cursor-pointer' : ''}`}>
        <span className={`block truncate text-sm ${item.packed ? 'text-ink-subtle' : 'text-ink'}`}>{item.name}</span>
        {note ? <span className="mt-0.5 block truncate text-[12px] text-ink-subtle">{note}</span> : null}
      </label>
      {item.quantity > 1 ? (
        <span className="shrink-0 px-1 text-[13px] tabular-nums text-ink-subtle">× {item.quantity}</span>
      ) : null}
      {canEdit ? (
        <>
          <button
            type="button"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center text-ink-muted hover:text-ink disabled:opacity-30"
            aria-label={`Move ${item.name} up`}
            disabled={isFirst}
            onClick={() => onMove(-1)}
          >
            ↑
          </button>
          <button
            type="button"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center text-ink-muted hover:text-ink disabled:opacity-30"
            aria-label={`Move ${item.name} down`}
            disabled={isLast}
            onClick={() => onMove(1)}
          >
            ↓
          </button>
          <button
            type="button"
            className="inline-flex min-h-11 shrink-0 items-center px-2 text-[13px] text-ink-muted"
            onClick={onEdit}
          >
            Edit
          </button>
        </>
      ) : null}
    </li>
  )
}

function PackingSheet({
  sheet,
  tripId,
  categories,
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
  const [dirty, setDirty] = useState(false)

  return (
    <Sheet title={title} kicker="Packing" onClose={onClose} dirty={dirty}>
      <div onChange={() => setDirty(true)}>
      {isItem ? (
        <PackingItemForm
          tripId={tripId}
          categoryId={sheet.categoryId}
          categories={categories}
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
      </div>
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
  categories,
  item,
  onClose,
  addPackingItem,
  updatePackingItem,
  deletePackingItem,
}) {
  const requestClose = useSheetClose()
  const [name, setName] = useState(item?.name ?? '')
  const [selectedCategoryId, setSelectedCategoryId] = useState(item?.categoryId ?? categoryId ?? categories[0]?.id ?? '')
  const [quantity, setQuantity] = useState(String(item?.quantity ?? 1))
  const [note, setNote] = useState(item?.note ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)

  function handleSubmit(event) {
    event.preventDefault()
    const trimmed = name.trim()
    const parsed = parseQuantity(Number.parseInt(quantity, 10))
    if (!trimmed || parsed == null || !selectedCategoryId) return
    const saved = item
      ? updatePackingItem(item.id, { name: trimmed, quantity: parsed, note, categoryId: selectedCategoryId })
      : addPackingItem({ tripId, categoryId: selectedCategoryId, name: trimmed, quantity: parsed, note })
    if (!saved) return
    onClose()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Item name">
        <input
          className={fieldClass}
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          autoFocus
        />
      </Field>
      {categories.length ? (
        <Field label="Category">
          <select
            className={fieldClass}
            value={selectedCategoryId}
            onChange={(event) => setSelectedCategoryId(event.target.value)}
            required
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
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
