export const fieldClass =
  'h-10 w-full rounded-md border border-line bg-canvas px-3 text-sm text-ink outline-none placeholder:text-ink-subtle'

export const textareaClass =
  'min-h-[88px] w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-subtle'

export function Field({ label, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-[12px] tracking-[0.08em] text-ink-subtle uppercase">{label}</span>
      {children}
    </label>
  )
}
