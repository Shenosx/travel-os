import { IconClose } from '../icons.jsx'

export function Sheet({ title, kicker, children, onClose, footer, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-ink/25 dark:bg-black/50"
        aria-label="Dismiss overlay"
        onClick={onClose}
      />
      <div
        className={`relative flex max-h-[92svh] w-full flex-col rounded-t-xl border border-line bg-surface sm:rounded-xl ${
          wide ? 'max-w-[480px]' : 'max-w-[420px]'
        }`}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 px-5 pt-5 sm:px-6 sm:pt-6">
          <div>
            {kicker ? (
              <p className="text-[12px] tracking-[0.16em] text-ink-subtle uppercase">{kicker}</p>
            ) : null}
            <h2 className="font-display mt-1 text-[26px] leading-tight tracking-[-0.03em]">{title}</h2>
          </div>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-canvas-muted"
            onClick={onClose}
            aria-label="Close"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {footer ? (
          <div className="shrink-0 border-t border-line px-5 py-4 sm:px-6">{footer}</div>
        ) : null}
      </div>
    </div>
  )
}
