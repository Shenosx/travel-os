import { createContext, useContext, useEffect, useId, useRef, useState } from 'react'
import { IconClose } from '../icons.jsx'
import { Button } from './Button.jsx'

const SheetCloseContext = createContext(null)

export function useSheetClose() {
  return useContext(SheetCloseContext)
}

export function SheetCancel({ onClose, className = 'text-sm text-ink-muted', children = 'Cancel' }) {
  const requestClose = useSheetClose()
  return (
    <button type="button" className={className} onClick={() => (requestClose ?? onClose)?.()}>
      {children}
    </button>
  )
}

function focusableIn(root) {
  if (!root) return []
  return [...root.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(
    (node) => !node.hasAttribute('disabled') && node.getAttribute('aria-hidden') !== 'true',
  )
}

export function Sheet({ title, kicker, children, onClose, footer, wide = false, dirty = false }) {
  const [askDiscard, setAskDiscard] = useState(false)
  const titleId = useId()
  const panelRef = useRef(null)
  if (!dirty && askDiscard) setAskDiscard(false)

  function requestClose() {
    if (dirty) {
      setAskDiscard(true)
      return
    }
    onClose()
  }

  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== 'Escape') return
      if (askDiscard) {
        setAskDiscard(false)
        return
      }
      if (dirty) {
        setAskDiscard(true)
        return
      }
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [askDiscard, dirty, onClose])

  useEffect(() => {
    const previouslyFocused = document.activeElement
    const panel = panelRef.current
    const initial = focusableIn(panel)[0]
    initial?.focus()

    function onKey(event) {
      if (event.key !== 'Tab' || !panel) return
      const items = focusableIn(panel)
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    panel?.addEventListener('keydown', onKey)
    return () => {
      panel?.removeEventListener('keydown', onKey)
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus()
      }
    }
  }, [])

  return (
    <SheetCloseContext.Provider value={requestClose}>
      <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
        <button
          type="button"
          className="absolute inset-0 bg-ink/25 dark:bg-black/50"
          aria-label="Dismiss overlay"
          onClick={requestClose}
        />
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className={`relative flex max-h-[92svh] w-full flex-col rounded-t-xl border border-line bg-surface sm:rounded-xl ${
            wide ? 'max-w-[480px]' : 'max-w-[420px]'
          }`}
        >
          <div className="flex shrink-0 items-start justify-between gap-4 px-5 pt-5 sm:px-6 sm:pt-6">
            <div>
              {kicker ? (
                <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">{kicker}</p>
              ) : null}
              <h2 id={titleId} className="font-display mt-1 text-[26px] leading-tight tracking-[-0.03em]">
                {title}
              </h2>
            </div>
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-canvas-muted"
              onClick={requestClose}
              aria-label="Close"
            >
              <IconClose className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
          {footer ? (
            <div className="shrink-0 border-t border-line px-5 py-4 sm:px-6">{footer}</div>
          ) : null}
          {askDiscard ? (
            <div
              className="absolute inset-0 z-10 flex items-end bg-ink/25 sm:items-center sm:justify-center dark:bg-black/50"
              role="alertdialog"
              aria-labelledby={`${titleId}-discard`}
              aria-modal="true"
            >
              <div className="w-full border-t border-line bg-surface p-5 sm:mx-6 sm:rounded-xl sm:border">
                <p id={`${titleId}-discard`} className="text-sm text-ink">
                  Discard changes?
                </p>
                <div className="mt-4 flex justify-end gap-3">
                  <button type="button" className="text-sm text-ink-muted" onClick={() => setAskDiscard(false)}>
                    Cancel
                  </button>
                  <Button onClick={onClose}>Discard</Button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </SheetCloseContext.Provider>
  )
}
