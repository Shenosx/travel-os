import { createContext, useCallback, useContext, useEffect, useState } from 'react'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null)

  const showToast = useCallback((next) => {
    setToast(next)
  }, [])

  const dismiss = useCallback(() => setToast(null), [])

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      {toast ? (
        <Toast
          message={toast.message}
          actionLabel={toast.actionLabel}
          onAction={() => {
            toast.onAction?.()
            dismiss()
          }}
          onDismiss={dismiss}
        />
      ) : null}
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext) ?? (() => {})
}

function Toast({ message, actionLabel, onAction, onDismiss }) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, 5000)
    return () => window.clearTimeout(timer)
  }, [onDismiss, message])

  return (
    <div
      className="fixed bottom-24 left-5 right-5 z-[60] flex items-center justify-between gap-4 border border-line bg-surface px-4 py-3 shadow-sm lg:right-8 lg:bottom-8 lg:left-auto lg:w-[320px]"
      role="status"
    >
      <p className="text-sm text-ink">{message}</p>
      {actionLabel ? (
        <button type="button" className="shrink-0 text-sm text-accent" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  )
}
