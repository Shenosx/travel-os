import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useAppData } from '../../../hooks/useAppData.jsx'
import {
  CHECKLIST_PHASES,
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
import { Field, fieldClass, textareaClass } from '../../ui/Field.jsx'
import { ProgressBar } from '../../ui/ProgressBar.jsx'
import { Sheet, useSheetClose } from '../../ui/Sheet.jsx'

export function ChecklistView({ tripId }) {
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
    if (!tripId || !userId) return
    if (seededFor.current === seedKey) return
    seededFor.current = seedKey
    setCollapsedIds([])
    setSheet(null)
    setConfirm(null)
    ensureChecklistCategories(tripId)
  }, [ensureChecklistCategories, seedKey, tripId, userId])

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

  return (
    <div className="min-w-0">
      <div>
        <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">Checklist</p>
        <p className="mt-2 text-sm text-ink">
          Overall {overall.done} / {overall.total}
        </p>
        <ProgressBar
          now={overall.done}
          max={overall.total}
          label={`Checklist ${overall.done} of ${overall.total} done`}
          className="mt-4"
        />
      </div>

      <div className="mt-10 space-y-10">
        {CHECKLIST_PHASES.map((phase, phaseIndex) => {
          const phaseCategories = categories.filter((row) => row.phase === phase.id)
          const phaseProgress = checklistPhaseProgress(phaseCategories, items, phase.id)
          const categoryIds = phaseCategories.map((category) => category.id)
          return (
            <section
              key={phase.id}
              aria-labelledby={`check-phase-${phase.id}`}
              className={phaseIndex === 0 ? '' : 'border-t border-line pt-10'}
            >
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] tracking-[0.16em] text-ink-subtle uppercase">
                    {String(phaseIndex + 1).padStart(2, '0')}
                  </p>
                  <h3
                    id={`check-phase-${phase.id}`}
                    className="font-display mt-1 text-[26px] tracking-[-0.03em] text-ink"
                  >
                    {phase.label}
                  </h3>
                  <p className="mt-1 text-sm text-ink-subtle">
                    {phaseProgress.done} / {phaseProgress.total} done
                  </p>
                </div>
                <button
                  type="button"
                  className="inline-flex min-h-11 items-center text-sm text-accent"
                  onClick={() => setSheet({ type: 'category', phase: phase.id })}
                >
                  + Add category
                </button>
              </div>
              <ProgressBar
                now={phaseProgress.done}
                max={phaseProgress.total}
                label={`${phase.label} ${phaseProgress.done} of ${phaseProgress.total} done`}
                className="mt-3"
              />

              {phaseCategories.length ? (
                <ul className="mt-4 divide-y divide-line">
                  {phaseCategories.map((category, index) => {
                    const categoryItems = itemsFor(category.id)
                    const expanded = !collapsedIds.includes(category.id)
                    const itemIds = categoryItems.map((item) => item.id)
                    const categoryProgress = checklistProgress(categoryItems)
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
                            <span className="font-display min-w-0 break-words text-[20px] tracking-[-0.03em] text-ink">
                              {category.name}
                            </span>
                            <span className="shrink-0 text-[12px] tabular-nums text-ink-subtle">
                              {categoryProgress.done}/{categoryProgress.total}
                            </span>
                          </button>
                          <button
                            type="button"
                            className="inline-flex h-10 w-10 shrink-0 items-center justify-center text-ink-muted hover:text-ink disabled:opacity-30"
                            aria-label={`Move ${category.name} up`}
                            disabled={index === 0}
                            onClick={() =>
                              reorderChecklistCategories(tripId, phase.id, moveIdInOrder(categoryIds, category.id, -1))
                            }
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="inline-flex h-10 w-10 shrink-0 items-center justify-center text-ink-muted hover:text-ink disabled:opacity-30"
                            aria-label={`Move ${category.name} down`}
                            disabled={index === phaseCategories.length - 1}
                            onClick={() =>
                              reorderChecklistCategories(tripId, phase.id, moveIdInOrder(categoryIds, category.id, 1))
                            }
                          >
                            ↓
                          </button>
                        </div>

                        {expanded ? (
                          <div className="mt-3">
                            {categoryItems.length ? (
                              <ul>
                                {categoryItems.map((item, itemIndex) => (
                                  <ChecklistItemRow
                                    key={item.id}
                                    item={item}
                                    isFirst={itemIndex === 0}
                                    isLast={itemIndex === categoryItems.length - 1}
                                    onToggle={() => toggleChecklistItemDone(item.id)}
                                    onMove={(delta) =>
                                      reorderChecklistItems(category.id, moveIdInOrder(itemIds, item.id, delta))
                                    }
                                    onEdit={() => setSheet({ type: 'item', categoryId: category.id, item })}
                                  />
                                ))}
                              </ul>
                            ) : (
                              <p className="px-1 text-[13px] text-ink-subtle">No tasks yet.</p>
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
                                  <button type="button" className="text-sm text-ink-subtle" onClick={() => setConfirm(null)}>
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
                          </div>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <div className="mt-5">
                  <p className="text-[13px] text-ink-subtle">No categories yet.</p>
                  <button
                    type="button"
                    className="mt-1 inline-flex min-h-11 items-center text-sm text-accent"
                    onClick={() => setSheet({ type: 'category', phase: phase.id })}
                  >
                    + Add category
                  </button>
                </div>
              )}
            </section>
          )
        })}
      </div>

      {sheet ? (
        <ChecklistSheet
          sheet={sheet}
          tripId={tripId}
          onClose={() => setSheet(null)}
          addChecklistCategory={addChecklistCategory}
          updateChecklistCategory={updateChecklistCategory}
          addChecklistItem={addChecklistItem}
          updateChecklistItem={updateChecklistItem}
          deleteChecklistItem={deleteChecklistItem}
        />
      ) : null}
    </div>
  )
}

function ChecklistItemRow({ item, isFirst, isLast, onToggle, onMove, onEdit }) {
  const checkboxId = useId()
  const note = item.note?.trim()

  return (
    <li className="flex items-start gap-1 py-1">
      <label
        htmlFor={checkboxId}
        className="inline-flex min-h-10 min-w-10 shrink-0 cursor-pointer items-center justify-center"
      >
        <input
          id={checkboxId}
          type="checkbox"
          checked={Boolean(item.done)}
          onChange={onToggle}
          className="h-4 w-4 accent-[var(--accent)]"
        />
      </label>
      <label htmlFor={checkboxId} className="min-w-0 flex-1 cursor-pointer py-2">
        <span className={`block break-words text-sm ${item.done ? 'text-ink-muted' : 'text-ink'}`}>{item.name}</span>
        {item.dueDate ? (
          <span className="mt-0.5 block text-[12px] tabular-nums text-ink-subtle">Due {item.dueDate}</span>
        ) : null}
        {note ? <span className="mt-0.5 block break-words text-[12px] text-ink-subtle">{note}</span> : null}
      </label>
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

function ChecklistSheet({
  sheet,
  tripId,
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

  return (
    <Sheet title={title} kicker="Checklist" onClose={onClose}>
      {isItem ? (
        <ChecklistItemForm
          tripId={tripId}
          categoryId={sheet.categoryId}
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
  item,
  onClose,
  addChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
}) {
  const requestClose = useSheetClose()
  const [name, setName] = useState(item?.name ?? '')
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
    if (!trimmed || !due.ok) return
    const saved = item
      ? updateChecklistItem(item.id, { name: trimmed, dueDate: due.dueDate, note })
      : addChecklistItem({ tripId, categoryId, name: trimmed, dueDate: due.dueDate, note })
    if (!saved) return
    onClose()
  }

  const due = parsedDueDate()

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
