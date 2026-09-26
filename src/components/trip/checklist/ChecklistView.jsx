import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAppData } from '../../../hooks/useAppData.jsx'
import {
  CHECKLIST_PHASES,
  checklistCategoryProgress,
  checklistPhaseProgress,
  checklistProgress,
  checklistRowsForTripUser,
  isChecklistPhase,
  isIsoDate,
  moveIdInOrder,
  sortByChecklistOrder,
  toggleCollapsedIds,
} from '../../../lib/planning.js'
import { IconChevron } from '../../icons.jsx'
import { Button } from '../../ui/Button.jsx'
import { EmptyState } from '../../ui/EmptyState.jsx'
import { Field, fieldClass, textareaClass } from '../../ui/Field.jsx'
import { ProgressBar } from '../../ui/ProgressBar.jsx'
import { Sheet, useSheetClose } from '../../ui/Sheet.jsx'

export function ChecklistView({ tripId, canEdit = false }) {
  const {
    currentUser,
    checklistCategories,
    checklistItems,
    ensureChecklistCategories,
    addChecklistCategory,
    updateChecklistCategory,
    reorderChecklistCategories,
    deleteChecklistCategory,
    addChecklistItem,
    updateChecklistItem,
    toggleChecklistItemDone,
    reorderChecklistItems,
    deleteChecklistItem,
  } = useAppData()

  const userId = currentUser.id
  const seedKey = `${tripId}:${userId}`
  const seededFor = useRef('')
  const [collapsedIds, setCollapsedIds] = useState([])
  const [sheet, setSheet] = useState(null)
  const [confirm, setConfirm] = useState(null)

  useEffect(() => {
    if (!tripId || !userId || !canEdit) return
    if (seededFor.current === seedKey) return
    seededFor.current = seedKey
    setCollapsedIds([])
    setSheet(null)
    setConfirm(null)
    ensureChecklistCategories(tripId)
  }, [canEdit, ensureChecklistCategories, seedKey, tripId, userId])

  const categories = useMemo(
    () => sortByChecklistOrder(checklistRowsForTripUser(checklistCategories, tripId, userId)),
    [checklistCategories, tripId, userId],
  )
  const items = useMemo(
    () => checklistRowsForTripUser(checklistItems, tripId, userId),
    [checklistItems, tripId, userId],
  )
  const overall = checklistProgress(items)

  function itemsFor(categoryId) {
    return sortByChecklistOrder(items.filter((item) => item.categoryId === categoryId))
  }

  function openAddItem(categoryId) {
    if (!canEdit) return
    setSheet({ type: 'item', categoryId: categoryId || categories[0]?.id })
  }

  const sheetNode = sheet ? (
    <ChecklistSheet
      sheet={sheet}
      tripId={tripId}
      categories={categories}
      onClose={() => setSheet(null)}
      addChecklistCategory={addChecklistCategory}
      updateChecklistCategory={updateChecklistCategory}
      addChecklistItem={addChecklistItem}
      updateChecklistItem={updateChecklistItem}
      deleteChecklistItem={deleteChecklistItem}
    />
  ) : null

  return (
    <div className="min-w-0">
      <Link to={`/trips/${tripId}`} className="inline-flex min-h-11 items-center text-[13px] text-ink-subtle hover:text-ink">
        ← Trip details
      </Link>

      <header className="mt-5">
        <h2 className="font-display text-[28px] leading-[1.05] tracking-[-0.04em] text-ink sm:text-[34px]">
          Checklist
        </h2>
        {overall.total ? (
          <>
            <p className="mt-3 text-[15px] tabular-nums text-ink-muted">
              {overall.done} / {overall.total} completed
            </p>
            <ProgressBar
              now={overall.done}
              max={overall.total}
              label={`Checklist ${overall.done} of ${overall.total} completed`}
              className="mt-5"
            />
          </>
        ) : (
          <div className="mt-8">
            <EmptyState
              title="No checklist items yet"
              action={
                canEdit ? (
                  <button
                    type="button"
                    className="inline-flex min-h-11 items-center text-sm text-accent"
                    onClick={() =>
                      categories.length ? openAddItem() : setSheet({ type: 'category', phase: CHECKLIST_PHASES[0].id })
                    }
                  >
                    Add item
                  </button>
                ) : null
              }
            />
          </div>
        )}
      </header>

      <div className="mt-12 space-y-12">
        {CHECKLIST_PHASES.map((phase) => {
          const phaseCategories = categories.filter((row) => row.phase === phase.id)
          const phaseProgress = checklistPhaseProgress(phaseCategories, items, phase.id)
          const categoryIds = phaseCategories.map((category) => category.id)
          return (
            <section key={phase.id} aria-labelledby={`check-phase-${phase.id}`} className="min-w-0">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">
                  <h3
                    id={`check-phase-${phase.id}`}
                    className="font-display text-[26px] tracking-[-0.03em] text-ink"
                  >
                    {phase.label}
                  </h3>
                  <p className="mt-1 text-[13px] tabular-nums text-ink-subtle">
                    {phaseProgress.done} / {phaseProgress.total}
                  </p>
                </div>
                {canEdit ? (
                  <button
                    type="button"
                    className="inline-flex min-h-11 items-center text-sm text-accent"
                    onClick={() => setSheet({ type: 'category', phase: phase.id })}
                  >
                    + Add category
                  </button>
                ) : null}
              </div>
              <ProgressBar
                now={phaseProgress.done}
                max={phaseProgress.total}
                label={`${phase.label} ${phaseProgress.done} of ${phaseProgress.total} completed`}
                className="mt-3"
              />

              {phaseCategories.length ? (
                <ul className="mt-6 grid gap-10 lg:grid-cols-2">
                  {phaseCategories.map((category, index) => {
                    const categoryItems = itemsFor(category.id)
                    const expanded = !collapsedIds.includes(category.id)
                    const itemIds = categoryItems.map((item) => item.id)
                    const categoryProgress = checklistCategoryProgress(items, category.id)
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
                            <span className="font-display min-w-0 break-words text-[20px] tracking-[-0.03em] text-ink">
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
                                onClick={() =>
                                  reorderChecklistCategories(
                                    tripId,
                                    phase.id,
                                    moveIdInOrder(categoryIds, category.id, -1),
                                  )
                                }
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                className="inline-flex h-11 w-11 shrink-0 items-center justify-center text-ink-muted hover:text-ink disabled:opacity-30"
                                aria-label={`Move ${category.name} down`}
                                disabled={index === phaseCategories.length - 1}
                                onClick={() =>
                                  reorderChecklistCategories(
                                    tripId,
                                    phase.id,
                                    moveIdInOrder(categoryIds, category.id, 1),
                                  )
                                }
                              >
                                ↓
                              </button>
                            </>
                          ) : null}
                        </div>
                        <p className="mt-2 text-[13px] tabular-nums text-ink-subtle">
                          {categoryProgress.done} / {categoryProgress.total}
                        </p>
                        <ProgressBar
                          now={categoryProgress.done}
                          max={categoryProgress.total}
                          label={`${category.name} ${categoryProgress.done} of ${categoryProgress.total} completed`}
                          className="mt-3"
                        />

                        {expanded ? (
                          <div className="mt-4">
                            {categoryItems.length ? (
                              <ul>
                                {categoryItems.map((item, itemIndex) => (
                                  <ChecklistItemRow
                                    key={item.id}
                                    item={item}
                                    canEdit={canEdit}
                                    isFirst={itemIndex === 0}
                                    isLast={itemIndex === categoryItems.length - 1}
                                    onToggle={() => canEdit && toggleChecklistItemDone(item.id)}
                                    onMove={(delta) =>
                                      canEdit &&
                                      reorderChecklistItems(category.id, moveIdInOrder(itemIds, item.id, delta))
                                    }
                                    onEdit={() =>
                                      canEdit && setSheet({ type: 'item', categoryId: category.id, item })
                                    }
                                  />
                                ))}
                              </ul>
                            ) : (
                              <p className="px-1 text-[13px] text-ink-subtle">No tasks yet.</p>
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
                                  onClick={() => setSheet({ type: 'category', phase: phase.id, category })}
                                >
                                  Rename
                                </button>
                                {confirm?.id === category.id ? (
                                  <span
                                    role="alertdialog"
                                    aria-labelledby={`check-del-${category.id}`}
                                    className="flex flex-wrap items-center gap-3"
                                  >
                                    <span id={`check-del-${category.id}`} className="text-sm text-ink">
                                      Delete {category.name} and {categoryItems.length}{' '}
                                      {categoryItems.length === 1 ? 'item' : 'items'}?
                                    </span>
                                    <button
                                      type="button"
                                      className="text-sm text-ink-subtle"
                                      onClick={() => setConfirm(null)}
                                    >
                                      Keep
                                    </button>
                                    <button
                                      type="button"
                                      className="text-sm text-accent"
                                      onClick={() => {
                                        deleteChecklistCategory(category.id)
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
                                      else deleteChecklistCategory(category.id)
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
              ) : canEdit ? (
                <p className="mt-5 text-[13px] text-ink-subtle">No categories yet.</p>
              ) : null}
            </section>
          )
        })}
      </div>

      {sheetNode}
    </div>
  )
}

function ChecklistItemRow({ item, canEdit, isFirst, isLast, onToggle, onMove, onEdit }) {
  const checkboxId = useId()
  const note = item.note?.trim()

  return (
    <li className="flex min-w-0 items-start gap-1 py-1">
      <label
        htmlFor={checkboxId}
        className={`inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center ${canEdit ? 'cursor-pointer' : ''}`}
      >
        <input
          id={checkboxId}
          type="checkbox"
          checked={Boolean(item.done)}
          onChange={onToggle}
          disabled={!canEdit}
          className="h-4 w-4 accent-[var(--accent)]"
        />
      </label>
      <label htmlFor={checkboxId} className={`min-w-0 flex-1 py-2 ${canEdit ? 'cursor-pointer' : ''}`}>
        <span className={`block break-words text-sm ${item.done ? 'text-ink-subtle' : 'text-ink'}`}>{item.name}</span>
        {item.dueDate ? (
          <span className="mt-0.5 block text-[12px] tabular-nums text-ink-subtle">Due {item.dueDate}</span>
        ) : null}
        {note ? <span className="mt-0.5 block break-words text-[12px] text-ink-subtle">{note}</span> : null}
      </label>
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

function ChecklistSheet({
  sheet,
  tripId,
  categories,
  onClose,
  addChecklistCategory,
  updateChecklistCategory,
  addChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
}) {
  const isItem = sheet.type === 'item'
  const title = isItem
    ? sheet.item
      ? 'Edit item'
      : 'Add item'
    : sheet.category
      ? 'Rename category'
      : 'Add category'
  const [dirty, setDirty] = useState(false)

  return (
    <Sheet title={title} kicker="Checklist" onClose={onClose} dirty={dirty}>
      <div onChange={() => setDirty(true)}>
      {isItem ? (
        <ChecklistItemForm
          tripId={tripId}
          categoryId={sheet.categoryId}
          categories={categories}
          item={sheet.item}
          onClose={onClose}
          addChecklistItem={addChecklistItem}
          updateChecklistItem={updateChecklistItem}
          deleteChecklistItem={deleteChecklistItem}
        />
      ) : (
        <ChecklistCategoryForm
          tripId={tripId}
          phase={sheet.phase}
          category={sheet.category}
          onClose={onClose}
          addChecklistCategory={addChecklistCategory}
          updateChecklistCategory={updateChecklistCategory}
        />
      )}
      </div>
    </Sheet>
  )
}

function ChecklistCategoryForm({
  tripId,
  phase,
  category,
  onClose,
  addChecklistCategory,
  updateChecklistCategory,
}) {
  const requestClose = useSheetClose()
  const [name, setName] = useState(category?.name ?? '')
  const lockedPhase = category?.phase ?? phase

  function handleSubmit(event) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || !isChecklistPhase(lockedPhase)) return
    const saved = category
      ? updateChecklistCategory(category.id, { name: trimmed })
      : addChecklistCategory({ tripId, phase: lockedPhase, name: trimmed })
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

function ChecklistItemForm({
  tripId,
  categoryId,
  categories,
  item,
  onClose,
  addChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
}) {
  const requestClose = useSheetClose()
  const currentCategory = categories.find((row) => row.id === (item?.categoryId ?? categoryId))
  const phase = currentCategory?.phase
  const categoryOptions = phase ? categories.filter((row) => row.phase === phase) : categories
  const [name, setName] = useState(item?.name ?? '')
  const [selectedCategoryId, setSelectedCategoryId] = useState(
    item?.categoryId ?? categoryId ?? categoryOptions[0]?.id ?? '',
  )
  const [dueDate, setDueDate] = useState(item?.dueDate ?? '')
  const [note, setNote] = useState(item?.note ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)

  function parsedDueDate() {
    const value = dueDate.trim()
    if (!value) return { ok: true, dueDate: null }
    if (!isIsoDate(value)) return { ok: false, dueDate: null }
    return { ok: true, dueDate: value }
  }

  function handleSubmit(event) {
    event.preventDefault()
    const trimmed = name.trim()
    const due = parsedDueDate()
    if (!trimmed || !due.ok || !selectedCategoryId) return
    const saved = item
      ? updateChecklistItem(item.id, {
          name: trimmed,
          dueDate: due.dueDate,
          note,
          categoryId: selectedCategoryId,
        })
      : addChecklistItem({
          tripId,
          categoryId: selectedCategoryId,
          name: trimmed,
          dueDate: due.dueDate,
          note,
        })
    if (!saved) return
    onClose()
  }

  const due = parsedDueDate()

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
      {categoryOptions.length ? (
        <Field label="Category">
          <select
            className={fieldClass}
            value={selectedCategoryId}
            onChange={(event) => setSelectedCategoryId(event.target.value)}
            required
          >
            {categoryOptions.map((category) => (
              <option key={category.id} value={category.id}>
                {phaseLabel(category.phase)} · {category.name}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      <Field label="Due date">
        <input
          className={fieldClass}
          type="date"
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
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
            <span role="alertdialog" aria-labelledby="check-item-del" className="flex flex-wrap items-center gap-3">
              <span id="check-item-del" className="text-sm text-ink">
                Delete {item.name}?
              </span>
              <button type="button" className="text-sm text-ink-subtle" onClick={() => setConfirmDelete(false)}>
                Keep
              </button>
              <button
                type="button"
                className="text-sm text-accent"
                onClick={() => {
                  deleteChecklistItem(item.id)
                  onClose()
                }}
              >
                Delete
              </button>
            </span>
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
        <Button type="submit" disabled={!name.trim() || !due.ok}>
          Save
        </Button>
      </div>
    </form>
  )
}

function phaseLabel(phase) {
  return CHECKLIST_PHASES.find((item) => item.id === phase)?.label ?? phase
}
